// 监测官方规则页是否有变化（每周由 GitHub Action 调用）。
// 流程：读 data/rm-rules.json 的 monitorUrl → 抓取页面 → 提取关键文本算指纹(sha256)
//      → 与上次记录 data/rm-rules-monitor.json 比对 → 有变化则写 GITHUB_OUTPUT(changed=true)
//      并更新指纹文件；由 workflow 据此建 Issue 提醒「该重新跑 npm run rules:build 了」。
// 设计原则：monitorUrl 为空时安全跳过（不报错、不建 Issue），不猜测官方网址（需人工填）。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RULES = path.join(DATA, "rm-rules.json");
const STATE = path.join(DATA, "rm-rules-monitor.json");

// 将抓到的 HTML 压成「可比对的纯文本指纹」：去标签/脚本/样式，压缩空白。
// 目的：忽略无关的动态片段（统计脚本、随机 token 等），只对正文变化敏感。
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// 把结果写入 GitHub Actions 的步骤输出，供后续步骤（建 Issue）判断。
function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

async function main() {
  const rules = readJson(RULES, null);
  const url = rules?.monitorUrl?.trim();
  if (!url) {
    console.log("monitorUrl 未配置（data/rm-rules.json 的 monitorUrl 为空），跳过监测。");
    setOutput("changed", "false");
    setOutput("reason", "no-url");
    return;
  }

  console.log(`抓取规则页：${url}`);
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RMAlgoTracker-RuleMonitor/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.log(`抓取失败（${e.message}），本次跳过，不视为变化。`);
    setOutput("changed", "false");
    setOutput("reason", "fetch-failed");
    return;
  }

  const text = htmlToText(html);
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  const now = new Date().toISOString();

  const prev = readJson(STATE, null);
  const prevHash = prev?.hash || "";

  // 首次记录：只存指纹基线，不建 Issue（避免首跑就误报）。
  if (!prevHash) {
    fs.writeFileSync(
      STATE,
      JSON.stringify({ url, hash, checkedAt: now, changedAt: now }, null, 2),
      "utf8"
    );
    console.log("首次建立规则页指纹基线，不建 Issue。");
    setOutput("changed", "false");
    setOutput("reason", "baseline");
    return;
  }

  // URL 变了也当作需要复核
  const urlChanged = prev.url && prev.url !== url;
  const contentChanged = prevHash !== hash;

  if (!contentChanged && !urlChanged) {
    fs.writeFileSync(
      STATE,
      JSON.stringify({ ...prev, url, hash, checkedAt: now }, null, 2),
      "utf8"
    );
    console.log("规则页无变化。");
    setOutput("changed", "false");
    setOutput("reason", "unchanged");
    return;
  }

  fs.writeFileSync(
    STATE,
    JSON.stringify({ url, hash, checkedAt: now, changedAt: now }, null, 2),
    "utf8"
  );
  console.log("检测到规则页变化！应重新跑 npm run rules:build 更新 data/rm-rules.json。");
  setOutput("changed", "true");
  setOutput("reason", urlChanged ? "url-changed" : "content-changed");
  setOutput("url", url);
}

main();
