// 规则网页通道：从 RoboMaster 官方 Wiki 的“总入口”自动发现 RMUC / RMUL / RMUA 的规则文件页，
// 并把整站目录抓下来，再（可选）用 deepseek-v4-pro 提炼检索关键词/任务线索，写入边车文件
// data/rm-rules-web.json。它【不会覆盖】权威的 data/rm-rules.json（那份由 PDF 提炼，含确切数值）。
//
// 为什么需要这个：
//   - 规则子页地址会随赛季变动（如 .../809871）。但“总入口”地址（hub）相对稳定，
//     且每个页面都内嵌了完整的站点目录（含 RMUC/RMUL/RMUA“比赛规则文件”锚点），
//     所以可以从 hub 自动发现当前赛季的规则文件页地址。
//   - 该 Wiki 是客户端渲染（Nuxt SPA）：规则正文需要在浏览器里点进去才看得到，
//     普通抓取拿不到正文。因此本脚本只做“发现 + 目录 + 关键词建议”，
//     确切的规则数值仍以 PDF 提炼的 data/rm-rules.json 为准。
//
// 使用方法：
//   npm run rules:fetch            # 发现 + 目录 +（有 AI key 时）关键词建议
//   npm run rules:fetch -- --no-ai # 只发现 + 目录，不调用模型（省 token）
//
// 失败处理：抓取失败时【保留】已存在的 data/rm-rules-web.json，不会清空。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRulesAIConfig, chatAnthropicJSON } from "./ai.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RULES_FILE = path.join(ROOT, "data", "rm-rules.json");
const OUT_FILE = path.join(ROOT, "data", "rm-rules-web.json");

// 官方总入口（hub）。优先用 rm-rules.json 里的 monitorUrl，便于和监测保持一致。
const HUB_DEFAULT = "https://bbs.robomaster.com/wiki/20204847";
const NO_AI = process.argv.includes("--no-ai");
const FETCH_TIMEOUT_MS = 20000;
const FETCH_RETRIES = 2;

function getHubUrl() {
  try {
    const u = JSON.parse(fs.readFileSync(RULES_FILE, "utf8")).monitorUrl;
    if (u && /^https?:\/\//.test(u)) return u.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return HUB_DEFAULT;
}

// 带 UA + 超时 + 重试的抓取，返回 HTML 文本。
async function fetchText(url) {
  let lastErr;
  for (let i = 0; i <= FETCH_RETRIES; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 1000) throw new Error(`返回内容过短(${text.length})`);
      return text;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (i < FETCH_RETRIES) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// 从页面内嵌的 Nuxt 序列化状态里解析站点目录（title + postsId）。
function parseCatalog(html) {
  const pairs = [...html.matchAll(/title:"([^"]{1,80})"[^}]*?postsId:(\d+)/g)].map((m) => ({
    title: m[1].trim(),
    postsId: m[2],
  }));
  const seen = new Set();
  return pairs.filter((p) => (seen.has(p.postsId) ? false : (seen.add(p.postsId), true)));
}

// 在目录里识别“RMUC/RMUL/RMUA … 比赛规则文件”这类规则文件入口页。
function discoverRuleRoots(nodes, hub) {
  const roots = [];
  for (const n of nodes) {
    const m = n.title.match(/\bRMU([CLA])\b/i);
    const isRuleFile = /比赛规则文件|Competition Rules/i.test(n.title);
    if (!m || !isRuleFile) continue;
    const comp = "RMU" + m[1].toUpperCase();
    const seasonMatch = n.title.match(/(20\d{2})/);
    roots.push({
      competition: comp,
      season: seasonMatch ? seasonMatch[1] : "",
      postsId: n.postsId,
      title: n.title,
      url: `${hub}/${n.postsId}?source=7`,
    });
  }
  return roots;
}

function detectSeason(roots, nodes) {
  for (const r of roots) if (r.season) return r.season;
  for (const n of nodes) {
    const m = n.title.match(/\b(20\d{2})\b/);
    if (m) return m[1];
  }
  return "";
}

// 可选：把目录标题交给 v4-pro，给出检索关键词与任务线索的“建议”。
// 明确告诉模型：你只看到了目录（不是规则正文），不要编造任何具体数值。
async function aiSuggest(nodes, season) {
  const titles = nodes.map((n) => n.title).filter(Boolean);
  const system =
    "你是 RoboMaster 战队算法负责人。下面给你的只是官方 Wiki 的【目录标题列表】（不是规则正文）。" +
    "请据此推断本赛季与算法相关的方向，给出适合用于检索 arXiv 论文与 GitHub 项目的英文关键词，以及粗略的任务线索。" +
    "严禁编造任何规则里的具体数值（如初速度、热量、转速、收益分数等）——你看不到正文。只输出一个 JSON 对象。";
  const user =
    `赛季：${season || "未知"}。目录标题如下（共 ${titles.length} 条）：\n` +
    titles.map((t) => `- ${t}`).join("\n") +
    `\n\n请只输出如下结构的 JSON（不要代码块、不要解释）：\n` +
    `{\n` +
    `  "season": "从标题推断的赛季年份",\n` +
    `  "algoRelevantTitles": ["与算法/视觉/导航/决策相关的目录标题，原样摘出"],\n` +
    `  "searchKeywords": {\n` +
    `    "paperTopic": ["4-8 个论文主题英文词"],\n` +
    `    "paperCtx": ["RM 语境英文词，如 turret/gimbal/shooting"],\n` +
    `    "githubQueries": ["GitHub 搜索串，如 robomaster sentry slam"],\n` +
    `    "generalTopics": ["GitHub topic 查询，如 topic:pose-estimation"]\n` +
    `  },\n` +
    `  "taskHints_zh": ["粗略的算法任务线索，逐条中文，不含具体数值"]\n` +
    `}`;
  // v4-pro 是推理模型，思考会占 token，额度给足以保证有正文输出。
  return chatAnthropicJSON([{ role: "user", content: user }], { system, temperature: 0.2, maxTokens: 8000 });
}

async function main() {
  const hub = getHubUrl();
  console.log(`总入口(hub)：${hub}`);

  let html;
  try {
    html = await fetchText(hub);
  } catch (e) {
    console.error(`✗ 抓取 hub 失败：${e?.message || e}`);
    if (fs.existsSync(OUT_FILE)) {
      console.error(`  已保留现有的 ${path.relative(ROOT, OUT_FILE)}（不覆盖）。`);
    }
    process.exit(1);
  }

  const nodes = parseCatalog(html);
  console.log(`解析到目录节点：${nodes.length} 个`);
  if (nodes.length === 0) {
    console.error("✗ 未解析到任何目录节点（站点结构可能已变化）。保留旧的边车文件。");
    process.exit(1);
  }

  const roots = discoverRuleRoots(nodes, hub);
  const season = detectSeason(roots, nodes);
  console.log(`发现规则文件入口：${roots.length} 个（赛季 ${season || "未知"}）`);
  for (const r of roots) console.log(`  ✓ ${r.competition} → ${r.url}  「${r.title}」`);

  if (roots.length === 0) {
    console.warn("  ⚠ 未识别到 RMUC/RMUL/RMUA 规则文件入口（目录命名可能变了），仍会写出目录快照供排查。");
  }

  let aiSuggested = null;
  const cfg = getRulesAIConfig();
  if (NO_AI) {
    console.log("已跳过 AI 关键词建议（--no-ai）。");
  } else if (!cfg.enabled) {
    console.log("未配置 AI key，跳过关键词建议（仅发现 + 目录）。");
  } else {
    console.log(`调用 ${cfg.model} 生成关键词建议…`);
    try {
      aiSuggested = await aiSuggest(nodes, season);
      console.log("  ✓ 已生成关键词建议。");
    } catch (e) {
      console.warn(`  ⚠ 关键词建议失败（不影响发现结果）：${e?.message || e}`);
    }
  }

  const out = {
    hub,
    fetchedAt: new Date().toISOString(),
    season,
    note:
      "本文件由 rules:fetch 自动生成，仅用于“发现规则页地址 + 目录快照 + 关键词建议”。" +
      "该 Wiki 为客户端渲染，规则正文需在浏览器内点击查看；确切规则数值以 PDF 提炼的 rm-rules.json 为准。",
    discoveredPages: roots,
    catalogCount: nodes.length,
    catalog: nodes,
    aiSuggested,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`✓ 已写入 ${path.relative(ROOT, OUT_FILE)}`);
  console.log("  这是边车文件，不会改动权威的 data/rm-rules.json。如需更新确切规则，请用 PDF + npm run rules:build。");
}

main().catch((e) => {
  console.error("✗ rules:fetch 失败：", e?.message || e);
  process.exit(1);
});
