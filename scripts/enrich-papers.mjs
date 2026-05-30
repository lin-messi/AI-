// 论文富化：把英文标题/摘要翻译成中文，并为精选论文生成「一句话亮点 + 通俗精读」。
// 精读用于「站内阅读」，让读者不打开原文 PDF 也能理解论文要点。
import { getAIConfig, chatJSONWithRetry } from "./ai.mjs";

const FULL_BATCH = 4; // 精读 token 大，批量小一些
const TITLE_BATCH = 12;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// —— 精选论文：标题 + 摘要 + 一句话亮点 + 通俗精读 ——
function buildFullMessages(batch) {
  const payload = batch.map((p, idx) => ({
    i: idx,
    title: p.title_en || "",
    abstract: (p.abstract_en || "").slice(0, 1800),
  }));
  const sys =
    "你是资深科研编辑，擅长把学术论文讲给非本领域读者听。只输出 JSON，不要多余文字。";
  const user = `下面是若干篇学术论文（含英文标题与摘要）。请为每篇生成：
- title_zh: 准确的中文标题（保留专有名词与方法名）
- abstract_zh: 忠实流畅的中文摘要翻译，约 120-200 字
- highlight_zh: 一句话亮点（这篇论文最关键的创新或结论，30 字内）
- digest_zh: 通俗精读，300-500 字，分点讲清「研究了什么问题、用了什么方法、有什么结果、为何重要」，让外行也能读懂，不要照搬摘要原句

要求：忠实原文、不杜撰数据或结论；保留专有名词（如 Transformer、CRISPR、metasurface）。
严格返回 JSON：{"results":[{"i":0,"title_zh":"","abstract_zh":"","highlight_zh":"","digest_zh":""}, ...]}

输入数据：
${JSON.stringify(payload)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

export async function translatePapersFull(papers) {
  const { enabled, model } = getAIConfig();
  if (!enabled) {
    console.log("（未配置 AI_API_KEY，跳过论文精读翻译）");
    return 0;
  }
  const todo = papers.filter((p) => !p.digest_zh || !p.title_zh);
  if (!todo.length) return 0;
  console.log(`使用 ${model} 生成精读 ${todo.length} 篇…`);
  const batches = chunk(todo, FULL_BATCH);
  let done = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildFullMessages(batch));
      for (const r of json.results || []) {
        const p = batch[r.i];
        if (!p) continue;
        if (r.title_zh) p.title_zh = r.title_zh;
        if (r.abstract_zh) p.abstract_zh = r.abstract_zh;
        if (r.highlight_zh) p.highlight_zh = r.highlight_zh;
        if (r.digest_zh) p.digest_zh = r.digest_zh;
      }
      done += batch.length;
      console.log(`  精读批次 ${b + 1}/${batches.length} 完成`);
    } catch (e) {
      console.log(`  精读批次 ${b + 1} 失败：${e.message}`);
    }
  }
  return done;
}

// —— 普通论文：仅翻译标题（成本低，列表可读）——
function buildTitleMessages(batch) {
  const payload = batch.map((p, idx) => ({ i: idx, title: p.title_en || "" }));
  const sys = "你是学术翻译。只输出 JSON，不要多余文字。";
  const user = `把下列论文英文标题翻译成准确的中文标题，保留专有名词与方法名。
严格返回 JSON：{"results":[{"i":0,"title_zh":""}, ...]}

输入：
${JSON.stringify(payload)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

export async function translatePaperTitles(papers) {
  const { enabled } = getAIConfig();
  if (!enabled) return 0;
  const todo = papers.filter((p) => !p.title_zh);
  if (!todo.length) return 0;
  console.log(`翻译标题 ${todo.length} 篇…`);
  const batches = chunk(todo, TITLE_BATCH);
  let done = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildTitleMessages(batch));
      for (const r of json.results || []) {
        const p = batch[r.i];
        if (p && r.title_zh) p.title_zh = r.title_zh;
      }
      done += batch.length;
    } catch (e) {
      console.log(`  标题批次 ${b + 1} 失败：${e.message}`);
    }
  }
  return done;
}

// —— 按需翻译单篇（供运行时 API 调用）——
export async function translateOnePaper({ title, abstract }) {
  const { enabled } = getAIConfig();
  if (!enabled) throw new Error("未配置 AI_API_KEY");
  const json = await chatJSONWithRetry(
    buildFullMessages([{ title_en: title, abstract_en: abstract }])
  );
  const r = (json.results || [])[0] || {};
  return {
    title_zh: r.title_zh || "",
    abstract_zh: r.abstract_zh || "",
    highlight_zh: r.highlight_zh || "",
    digest_zh: r.digest_zh || "",
  };
}
