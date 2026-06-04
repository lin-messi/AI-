// 规则提炼脚本：读取 rules/ 目录下的官方规则 PDF → 抽取文本 → AI 提炼为结构化 data/rm-rules.json。
// 旧版本会自动归档到 data/rm-rules-archive/，保留历史。
//
// 使用方法：
//   1) 把官方规则 PDF 放进项目根目录的 rules/ 目录（比赛规则手册 + 参赛手册，RMUC / RMUL 均可，可多份）。
//   2) 运行：npm run rules:build
//
// 说明：
//   - PDF 不会被提交（见 .gitignore），只提交提炼后的 data/rm-rules.json。
//   - 需要 AI_API_KEY（与翻译/摘要共用，写在 .env 或环境变量）。
//   - 文本抽取优先用系统的 pdftotext，缺失时回退到 python + pypdf。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chatJSONWithRetry, getAIConfig } from "./ai.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "rules");
const OUT_FILE = path.join(ROOT, "data", "rm-rules.json");
const ARCHIVE_DIR = path.join(ROOT, "data", "rm-rules-archive");

// 单份文档进入提炼的字符上限（防止超出模型上下文，过长时截断）。
const PER_DOC_CHARS = 22000;
// 全部文档合并后的总上限。
const TOTAL_CHARS = 70000;

// 9 大算法方向，供 AI 给任务打 categories 标签。
const CATEGORIES = [
  "aim", // 自瞄/视觉打击
  "rune", // 能量机关
  "slam", // 建图定位
  "nav", // 导航
  "planning", // 规划/决策
  "rl", // 强化学习/策略
  "radar", // 雷达感知
  "sim", // 仿真
  "other",
];

function listPDFs() {
  if (!fs.existsSync(RULES_DIR)) return [];
  return fs
    .readdirSync(RULES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(RULES_DIR, f))
    .sort();
}

// 用 pdftotext 抽取，失败回退 python+pypdf。返回纯文本（可能为空字符串）。
function extractPdfText(pdfPath) {
  // 1) pdftotext -enc UTF-8 input - （输出到 stdout）
  try {
    const r = spawnSync("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout;
  } catch {
    /* 继续尝试下一种方式 */
  }

  // 2) python + pypdf 回退
  const py = `import sys\nfrom pypdf import PdfReader\nr = PdfReader(sys.argv[1])\nout = []\nfor p in r.pages:\n    try:\n        out.append(p.extract_text() or "")\n    except Exception:\n        out.append("")\nsys.stdout.buffer.write("\\n".join(out).encode("utf-8"))\n`;
  const tmp = path.join(os.tmpdir(), `rmrules_extract_${Date.now()}.py`);
  try {
    fs.writeFileSync(tmp, py, "utf8");
    for (const exe of ["python", "python3"]) {
      try {
        const r = spawnSync(exe, [tmp, pdfPath], {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        });
        if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout;
      } catch {
        /* 尝试下一个解释器 */
      }
    }
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  return "";
}

// 压缩空白，去掉页眉页脚常见噪声，并截断到上限。
function cleanText(raw, limit) {
  const text = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

const SCHEMA_HINT = `{
  "season": "赛季年份字符串，如 2026",
  "competition": "覆盖的赛事，如 RMUC + RMUL",
  "version": "规则手册版本号，如 RMUC V1.0.0 / RMUL V1.0.0",
  "publishedAt": "规则发布日期 YYYY-MM-DD（从手册中找，找不到留空）",
  "sources": ["每份手册的完整名称（含版本与日期）"],
  "summary_zh": "150-300 字总览：赛制、胜负条件、算法核心集中在哪些环节",
  "changes_zh": ["本赛季相对往年的主要变更，逐条中文，5-8 条"],
  "tasks": [
    {
      "id": "英文短 id，如 autoaim/rune/sentry/radar/dart/engineer/strategy/sim",
      "name_zh": "中文任务名",
      "categories": ["从 aim/rune/slam/nav/planning/rl/radar/sim/other 里选 1-3 个"],
      "robots": ["涉及的机器人，如 英雄/工程/步兵/哨兵/空中/雷达/飞镖/全队"],
      "desc_zh": "该算法任务要做什么、难点是什么（结合规则中的具体机制/参数）",
      "scoring_zh": "与之相关的得分/增益机制，尽量带规则里的具体数值",
      "keywords_zh": ["中文检索关键词"],
      "keywords_en": ["英文检索关键词，用于 arXiv/GitHub 搜索"]
    }
  ],
  "searchKeywords": {
    "paperTopic": ["4-8 个论文主题英文关键词（最值得追踪的方向）"],
    "paperCtx": ["与 RM 强相关的语境英文词，如 turret/gimbal/shooting"],
    "githubQueries": ["GitHub 搜索串，如 robomaster sentry slam"],
    "generalTopics": ["GitHub topic 查询，如 topic:pose-estimation"]
  }
}`;

async function extractRulesWithAI(docs) {
  const corpus = docs
    .map((d) => `<<<手册：${d.name}>>>\n${d.text}`)
    .join("\n\n========\n\n")
    .slice(0, TOTAL_CHARS);

  const system =
    "你是 RoboMaster 战队的算法负责人。你的任务是阅读官方比赛规则/参赛手册，提炼出与机器视觉、导航、决策、强化学习等算法相关的要点，输出严格的 JSON。" +
    "只依据手册内容，不要编造规则里没有的数值。所有中文字段用简体中文。";

  const user =
    `下面是若干份 RoboMaster 官方手册的纯文本（可能被截断）。请综合所有手册，提炼出本赛季的算法相关规则要点，` +
    `严格按照以下 JSON 结构输出（字段含义见注释，实际输出不要带注释）：\n\n` +
    `${SCHEMA_HINT}\n\n` +
    `要求：\n` +
    `1) tasks 覆盖所有需要算法的环节（自瞄、能量机关、哨兵导航决策、雷达、飞镖、工程视觉装配、多机协同/强化学习、仿真等），有则写、无则略。\n` +
    `2) categories 只能取这些值：${CATEGORIES.join("、")}。\n` +
    `3) scoring_zh 尽量引用手册里的具体数值（如初速度/热量上限、能量机关转速函数、飞镖各档收益、哨兵血量等）。\n` +
    `4) searchKeywords 用于驱动论文与开源项目的检索，请给出最能反映本赛季算法重点的英文词。\n\n` +
    `手册文本如下：\n\n${corpus}`;

  const result = await chatJSONWithRetry(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.2 }
  );
  return result;
}

function archiveOld() {
  if (!fs.existsSync(OUT_FILE)) return null;
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  let stamp = "unknown";
  try {
    const prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    stamp = (prev.extractedAt || prev.season || "").toString().slice(0, 10) || "unknown";
  } catch {
    /* 旧文件损坏也照样归档 */
  }
  const dest = path.join(ARCHIVE_DIR, `rm-rules-${stamp}.json`);
  fs.copyFileSync(OUT_FILE, dest);
  return dest;
}

async function main() {
  const cfg = getAIConfig();
  if (!cfg.enabled) {
    console.error("✗ 缺少 AI_API_KEY，无法提炼规则。请在 .env 中配置后重试。");
    process.exit(1);
  }

  const pdfs = listPDFs();
  if (pdfs.length === 0) {
    console.error(
      `✗ rules/ 目录下没有 PDF。请把官方规则手册放进：${RULES_DIR}\n  然后重新运行 npm run rules:build`
    );
    process.exit(1);
  }

  console.log(`找到 ${pdfs.length} 份 PDF，开始抽取文本…`);
  const docs = [];
  for (const p of pdfs) {
    const name = path.basename(p, path.extname(p));
    const raw = extractPdfText(p);
    if (!raw || !raw.trim()) {
      console.warn(`  ⚠ 无法抽取文本，跳过：${name}`);
      continue;
    }
    const text = cleanText(raw, PER_DOC_CHARS);
    docs.push({ name, text });
    console.log(`  ✓ ${name}（${text.length} 字）`);
  }
  if (docs.length === 0) {
    console.error("✗ 所有 PDF 都无法抽取文本，请检查文件或安装 pdftotext / pypdf。");
    process.exit(1);
  }

  console.log("调用 AI 提炼规则要点…（视手册长度可能耗时）");
  const extracted = await extractRulesWithAI(docs);
  if (!extracted || !Array.isArray(extracted.tasks) || extracted.tasks.length === 0) {
    console.error("✗ AI 返回结果不完整（缺少 tasks）。原始返回：");
    console.error(JSON.stringify(extracted, null, 2).slice(0, 800));
    process.exit(1);
  }

  const archived = archiveOld();
  if (archived) console.log(`已归档旧规则 → ${path.relative(ROOT, archived)}`);

  // 保留旧的 monitorUrl（监测的官方规则页地址由用户填写，不应被覆盖丢失）。
  let prevMonitorUrl = "";
  try {
    prevMonitorUrl = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")).monitorUrl || "";
  } catch {
    /* ignore */
  }

  const out = {
    season: extracted.season || "",
    competition: extracted.competition || "",
    version: extracted.version || "",
    publishedAt: extracted.publishedAt || "",
    extractedAt: new Date().toISOString(),
    monitorUrl: extracted.monitorUrl || prevMonitorUrl || "",
    sources: Array.isArray(extracted.sources) ? extracted.sources : pdfs.map((p) => path.basename(p)),
    summary_zh: extracted.summary_zh || "",
    changes_zh: Array.isArray(extracted.changes_zh) ? extracted.changes_zh : [],
    tasks: extracted.tasks,
    searchKeywords: extracted.searchKeywords || {},
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    `✓ 已写入 ${path.relative(ROOT, OUT_FILE)}：season=${out.season} tasks=${out.tasks.length}`
  );
  console.log("  请人工核对 data/rm-rules.json（尤其是 tasks 的 categories 标签与数值），再提交。");
}

main().catch((e) => {
  console.error("✗ 规则提炼失败：", e?.message || e);
  process.exit(1);
});
