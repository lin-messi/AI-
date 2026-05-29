// 富化：把英文新闻翻译成中文（补全 title_zh / summary_zh），
// 中文新闻翻译成英文（补全 title_en / summary_en），
// 并生成中英双语“为何重要”（why_zh / why_en）。
// 已富化过的字段会跳过，节省 token；只处理缺失部分。
import { getAIConfig, chatJSONWithRetry } from "./ai.mjs";

const BATCH_SIZE = 8;

function needsEnrich(item) {
  const noZh = !item.title_zh;
  const noEn = !item.title_en;
  const noWhy = !item.why_zh || !item.why_en;
  return noZh || noEn || noWhy;
}

function buildMessages(batch) {
  const payload = batch.map((it, idx) => ({
    i: idx,
    lang: it.lang || (it.title_zh ? "zh" : "en"),
    title: it.title_zh || it.title_en || "",
    summary: it.summary_zh || it.summary_en || "",
  }));

  const sys =
    "你是专业的 AI 科技新闻编辑与中英翻译。只输出 JSON，不要任何多余文字。";
  const user = `下面是若干条 AI 相关新闻（source 字段为原文语言）。请为每条生成：
- title_zh: 简洁准确的中文标题
- title_en: 简洁准确的英文标题
- summary_zh: 1-2 句中文摘要
- summary_en: 1-2 句英文摘要
- why_zh: 一句话说明“为何重要”（中文）
- why_en: 一句话说明“为何重要”（英文）

要求：忠实原意、不杜撰事实；标题精炼；保留专有名词（如 OpenAI、GPT、Transformer）。
严格返回如下 JSON：{"results":[{"i":0,"title_zh":"","title_en":"","summary_zh":"","summary_en":"","why_zh":"","why_en":""}, ...]}

输入数据：
${JSON.stringify(payload)}`;

  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// 对一组 items 进行富化，原地修改并返回处理条数
export async function enrichItems(items, { onProgress } = {}) {
  const { enabled, model } = getAIConfig();
  if (!enabled) {
    console.log("（未配置 AI_API_KEY，跳过翻译/摘要）");
    return 0;
  }

  const todo = items.filter(needsEnrich);
  if (!todo.length) {
    console.log("所有条目均已富化，无需处理。");
    return 0;
  }

  console.log(`使用模型 ${model} 富化 ${todo.length} 条…`);
  const batches = chunk(todo, BATCH_SIZE);
  let done = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildMessages(batch));
      const results = json.results || [];
      for (const r of results) {
        const item = batch[r.i];
        if (!item) continue;
        if (!item.title_zh && r.title_zh) item.title_zh = r.title_zh;
        if (!item.title_en && r.title_en) item.title_en = r.title_en;
        if (!item.summary_zh && r.summary_zh) item.summary_zh = r.summary_zh;
        if (!item.summary_en && r.summary_en) item.summary_en = r.summary_en;
        if (!item.why_zh && r.why_zh) item.why_zh = r.why_zh;
        if (!item.why_en && r.why_en) item.why_en = r.why_en;
      }
      done += batch.length;
      console.log(`  批次 ${b + 1}/${batches.length} 完成（累计 ${done}）`);
      if (onProgress) onProgress(done, todo.length);
    } catch (e) {
      console.log(`  批次 ${b + 1} 失败：${e.message}（该批保留原文）`);
    }
  }
  return done;
}

// 命令行入口：富化指定日期（默认最新）的归档文件
async function main() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const DATA = path.join(__dirname, "..", "data");
  const ARCHIVE = path.join(DATA, "archive");

  const arg = process.argv[2];
  let date = arg;
  if (!date) {
    const idx = JSON.parse(
      fs.readFileSync(path.join(DATA, "index.json"), "utf8")
    );
    date = idx.latest;
  }
  if (!date) {
    console.log("没有可富化的归档。请先运行 npm run fetch。");
    return;
  }

  const file = path.join(ARCHIVE, `${date}.json`);
  const day = JSON.parse(fs.readFileSync(file, "utf8"));
  const n = await enrichItems(day.items);
  if (n > 0) {
    fs.writeFileSync(file, JSON.stringify(day, null, 2), "utf8");
    console.log(`\n完成：${date} 富化 ${n} 条，已写回 ${file}`);
  }
}

// 仅在直接运行时执行 main（被 import 时不触发）
import { fileURLToPath as _f } from "node:url";
if (process.argv[1] && _f(import.meta.url) === process.argv[1]) {
  main();
}
