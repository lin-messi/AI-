// 监测官方规则总入口(hub)是否有变化（每周由 GitHub Action 调用）。
//
// 该 Wiki 是客户端渲染（Nuxt SPA），规则正文抓不到，但每个页面都内嵌了完整的站点目录
// （含 RMUC/RMUL/RMUA「比赛规则文件」入口）。因此本脚本对【目录】做指纹：
//   1) 分别为 RMUC / RMUL / RMUA 的规则文件入口算指纹(postsId+标题)——
//      入口地址或名称变化（如换了新版本规则页）会被捕捉到；
//   2) 对整站目录算一个全局指纹——新增/删除/改名条目（常伴随规则更新）会被捕捉到。
//
// 流程：读 data/rm-rules.json 的 monitorUrl(=hub) → 抓 hub → 解析目录 → 算指纹
//      → 与 data/rm-rules-monitor.json 比对 → 有变化则：存档快照 + 写 GITHUB_OUTPUT(changed=true)
//      并更新指纹；由 workflow 据此建 Issue 提醒「该重新跑 rules:fetch / rules:build 了」。
//
// 设计原则：
//   - monitorUrl 为空时回退到默认 hub（仍可监测）。
//   - 抓取失败时【保留旧状态】、不视为变化、不建 Issue（Q28）。
//   - 首次只建立基线，不建 Issue（避免首跑误报）。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RULES = path.join(DATA, "rm-rules.json");
const STATE = path.join(DATA, "rm-rules-monitor.json");
const ARCHIVE_DIR = path.join(DATA, "rm-rules-monitor-archive");

const HUB_DEFAULT = "https://bbs.robomaster.com/wiki/20204847";
const FETCH_TIMEOUT_MS = 20000;
const FETCH_RETRIES = 2;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// 把结果写入 GitHub Actions 的步骤输出，供后续步骤（建 Issue）判断。
function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

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

function parseCatalog(html) {
  const pairs = [...html.matchAll(/title:"([^"]{1,80})"[^}]*?postsId:(\d+)/g)].map((m) => ({
    title: m[1].trim(),
    postsId: m[2],
  }));
  const seen = new Set();
  return pairs.filter((p) => (seen.has(p.postsId) ? false : (seen.add(p.postsId), true)));
}

// 识别 RMUC/RMUL/RMUA 规则文件入口，返回 { RMUC:{postsId,title}, ... }
function discoverRuleRoots(nodes) {
  const out = {};
  for (const n of nodes) {
    const m = n.title.match(/\bRMU([CLA])\b/i);
    if (!m || !/比赛规则文件|Competition Rules/i.test(n.title)) continue;
    const comp = "RMU" + m[1].toUpperCase();
    if (!out[comp]) out[comp] = { postsId: n.postsId, title: n.title };
  }
  return out;
}

// 整站目录全局指纹：对 "postsId:title" 排序后求 hash。
function catalogFingerprint(nodes) {
  const list = nodes.map((n) => `${n.postsId}:${n.title}`).sort();
  return sha256(list.join("\n"));
}

function compFingerprint(root) {
  return root ? sha256(`${root.postsId}|${root.title}`) : "";
}

function archiveSnapshot(payload, stamp) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const dest = path.join(ARCHIVE_DIR, `monitor-${stamp}.json`);
  fs.writeFileSync(dest, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return dest;
}

async function main() {
  const rules = readJson(RULES, null);
  const url = rules?.monitorUrl?.trim() || HUB_DEFAULT;
  console.log(`抓取规则总入口：${url}`);

  let html;
  try {
    html = await fetchText(url);
  } catch (e) {
    console.log(`抓取失败（${e.message}），保留旧状态，不视为变化。`);
    setOutput("changed", "false");
    setOutput("reason", "fetch-failed");
    return;
  }

  const nodes = parseCatalog(html);
  if (nodes.length === 0) {
    console.log("未解析到目录节点（站点结构可能变化），保留旧状态，本次不视为变化。");
    setOutput("changed", "false");
    setOutput("reason", "parse-empty");
    return;
  }

  const roots = discoverRuleRoots(nodes);
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");

  const comps = {};
  for (const comp of ["RMUC", "RMUL", "RMUA"]) {
    comps[comp] = {
      postsId: roots[comp]?.postsId || "",
      title: roots[comp]?.title || "",
      hash: compFingerprint(roots[comp]),
    };
  }
  const catalogHash = catalogFingerprint(nodes);
  const current = { url, checkedAt: now, changedAt: now, catalogHash, comps };

  const prev = readJson(STATE, null);

  // 首次：建立基线，不建 Issue。
  if (!prev || !prev.catalogHash) {
    fs.writeFileSync(STATE, JSON.stringify(current, null, 2) + "\n", "utf8");
    console.log("首次建立规则目录指纹基线，不建 Issue。");
    setOutput("changed", "false");
    setOutput("reason", "baseline");
    return;
  }

  // 逐项比对
  const changedComps = [];
  for (const comp of ["RMUC", "RMUL", "RMUA"]) {
    if ((prev.comps?.[comp]?.hash || "") !== comps[comp].hash) changedComps.push(comp);
  }
  const catalogChanged = (prev.catalogHash || "") !== catalogHash;
  const urlChanged = prev.url && prev.url !== url;

  if (changedComps.length === 0 && !catalogChanged && !urlChanged) {
    // 无变化：只更新 checkedAt，保留 changedAt。
    fs.writeFileSync(
      STATE,
      JSON.stringify({ ...current, changedAt: prev.changedAt || now }, null, 2) + "\n",
      "utf8"
    );
    console.log("规则目录无变化。");
    setOutput("changed", "false");
    setOutput("reason", "unchanged");
    return;
  }

  // 有变化：存档快照（Q25）并更新指纹。
  const archived = archiveSnapshot(
    { detectedAt: now, url, changedComps, catalogChanged, urlChanged, roots, catalog: nodes },
    stamp
  );
  fs.writeFileSync(STATE, JSON.stringify(current, null, 2) + "\n", "utf8");

  const reasons = [];
  if (changedComps.length) reasons.push(`规则入口变化: ${changedComps.join("/")}`);
  if (urlChanged) reasons.push("监测地址变化");
  if (catalogChanged) reasons.push("整站目录变化");

  console.log(`检测到变化：${reasons.join("；")}`);
  console.log(`已存档快照 → ${path.relative(ROOT, archived)}`);
  console.log("建议：先跑 npm run rules:fetch 看新入口/关键词，确切数值再用 PDF + npm run rules:build。");
  setOutput("changed", "true");
  setOutput("reason", reasons.join("；"));
  setOutput("changedComps", changedComps.join(",") || "(catalog)");
  setOutput("url", url);
}

main();
