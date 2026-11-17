import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { attentionPaperRecord, buildFrontierAttention, HEATMAP_DAYS } from "./ai-frontier-attention.mjs";
import { observeFrontierLikes } from "./ai-frontier-attention-source.mjs";
import { CITATION_SOURCE, observeFrontierCitations } from "./ai-frontier-citation-source.mjs";

const DATA = fileURLToPath(new URL("../data/", import.meta.url));
const ARCHIVE_WINDOW = (HEATMAP_DAYS + 2) * 86400000;
const shanghaiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", dateStyle: "short" });

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

async function saveJSON(file, data) {
  const pending = file + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(pending, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    await fs.rename(pending, file);
  } finally {
    await fs.rm(pending, { force: true });
  }
}

// Import only already-dated, real observations from the general papers archive.
// Legacy zero was also the missing-data fallback, so never import that value.
export async function readArchivedAttention(dataDir, items, now) {
  const index = await readJSON(path.join(dataDir, "papers-index.json"), { dates: [] });
  const tracked = new Map(items.filter(item => item.recommendation?.lane === "recent").map(item => [item.id, item]));
  const batches = new Map();
  const getBatch = at => {
    if (!batches.has(at)) batches.set(at, new Map());
    return batches.get(at);
  };
  for (const date of (index.dates || []).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).slice(0, HEATMAP_DAYS + 2)) {
    const day = await readJSON(path.join(dataDir, "papers", date + ".json"), null);
    const capture = Date.parse(day?.generatedAt);
    if (!Number.isFinite(capture) || capture > now || now - capture > ARCHIVE_WINDOW) continue;
    const captureTime = new Date(capture).toISOString();
    for (const item of day.items || []) {
      const current = tracked.get(item.id);
      const published = Date.parse(current?.published_at);
      if (!current || !Number.isFinite(published) || published > capture) continue;
      const paper = attentionPaperRecord({ ...current, title_en: item.title_en || current.title_en, title_zh: item.title_zh || current.title_zh });
      if (!paper) continue;
      const measured = Date.parse(item.interest_checked_at);
      const comparable = Number.isFinite(measured) && measured <= capture && now - measured <= ARCHIVE_WINDOW
        && measured >= published && shanghaiDay.format(new Date(measured)) === shanghaiDay.format(new Date(capture));
      if (comparable && Number.isSafeInteger(item.upvotes) && item.upvotes > 0) {
        const measuredAt = new Date(measured).toISOString();
        getBatch(measuredAt).set(paper.id, { ...paper, likes: item.upvotes, measuredAt });
      }
      const captured = getBatch(captureTime);
      if (!captured.has(paper.id)) captured.set(paper.id, paper);
    }
  }
  return [...batches].map(([at, papers]) => ({ at, papers: [...papers.values()] }));
}

export async function refreshFrontierAttention({ dataDir = DATA, metric = "likes" } = {}) {
  const citations = metric === "citations";
  const source = citations ? CITATION_SOURCE : "Hugging Face";
  const output = path.join(dataDir, citations ? "ai-frontier-citations.json" : "ai-frontier-attention.json");
  const [frontier, saved] = await Promise.all([
    readJSON(path.join(dataDir, "ai-frontier.json")),
    readJSON(output, {}),
  ]);
  // An index change starts another series; counters from different indexes must never be subtracted.
  const previous = saved.dashboard?.source && saved.dashboard.source !== source ? {} : saved;
  const observe = citations ? observeFrontierCitations : observeFrontierLikes;
  const observed = await observe(frontier.items);
  const now = Date.now();
  const imported = citations || previous.archiveImported ? [] : await readArchivedAttention(dataDir, frontier.items, now);
  const history = [...(previous.history || []), ...imported];
  const next = {
    ...buildFrontierAttention({ items: frontier.items, topics: frontier.topics, previous: { ...previous, history }, observed, now, metric, source }),
    ...(!citations ? { archiveImported: true } : {}),
  };
  if (JSON.stringify(next) !== JSON.stringify(saved)) await saveJSON(output, next);
  console.log("AI 前沿 " + source + "：本轮 " + observed.size + " 篇有实测值，日榜模式 " + (next.dashboard.leader?.mode || "暂无足够记录") + "。");
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await Promise.allSettled([
    refreshFrontierAttention({ metric: "likes" }),
    refreshFrontierAttention({ metric: "citations" }),
  ]);
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    console.error(result.reason?.message || "采集失败");
    process.exitCode = 1;
  }
}
