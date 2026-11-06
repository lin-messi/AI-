// AI news: explicit source provenance, real publication dates, bounded diversity.
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEEDS, CATEGORY_RULES, TAG_RULES } from "./feeds.mjs";
import { enrichItems } from "./enrich.mjs";
import { matchesEditorialKeyword, validPublicationDate, newsProfile, mergeEditorialItems } from "./editorial-policy.mjs";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const ARCHIVE = path.join(DATA, "archive");
const MAX_PER_DAY = 100;
const parser = new Parser({ timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (compatible; AINewsTracker/1.0)" } });
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function stripHtml(value = "") { return String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function titleKey(value = "") { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
function urlKey(value = "") {
  try { const u = new URL(value); u.hash = ""; ["utm_source", "utm_medium", "utm_campaign", "ref"].forEach(key => u.searchParams.delete(key)); return u.href.replace(/\/$/, ""); } catch { return ""; }
}

export function classifyNewsCategory(text) {
  for (const rule of CATEGORY_RULES) if (rule.kw.some(keyword => matchesEditorialKeyword(text, keyword))) return rule.cat;
  return "product";
}

export function refreshNewsMetadata(item, now = Date.now()) {
  const sourceLang = item.source_lang || item.lang;
  const title = item.source_title ?? (sourceLang === "zh" ? item.title_zh || item.title_en : item.title_en || item.title_zh);
  const summary = item.source_summary ?? (sourceLang === "zh" ? item.summary_zh || "" : item.summary_en || "");
  const text = [title, summary].filter(Boolean).join(" ");
  const titleCategory = CATEGORY_RULES.find(rule => rule.kw.some(keyword => matchesEditorialKeyword(title || "", keyword)))?.cat;
  const recommendation = newsProfile(item, now);
  return {
    ...item,
    category: titleCategory || classifyNewsCategory(text),
    tags: TAG_RULES.filter(rule => rule.kw.some(keyword => matchesEditorialKeyword(text, keyword))).map(rule => rule.tag).slice(0, 5),
    recommendation,
    // Compatibility for the existing 1–5 display; editorial ordering uses the detailed score.
    importance: recommendation ? Math.min(5, Math.max(1, Math.round((recommendation.score - 20) / 5))) : 1,
  };
}

export function normalizeNewsEntry(entry, feed, now = Date.now()) {
  let title = stripHtml(entry.title || "");
  let source = feed.source;
  if (source.startsWith("Google")) {
    const index = title.lastIndexOf(" - ");
    if (index > 0 && index > title.length - 55) { source = title.slice(index + 3).trim(); title = title.slice(0, index).trim(); }
  }
  const candidates = [entry["content:encoded"], entry.content, entry.contentSnippet, entry.summary, entry.description].filter(Boolean).map(stripHtml);
  const original = candidates.sort((a, b) => b.length - a.length)[0] || "";
  const summary = original.length > 1800 ? original.slice(0, 1800).trim() + "…" : original;
  const url = entry.link || entry.guid || "";
  const published_at = validPublicationDate(entry.isoDate || entry.pubDate || "", now) || "";
  const item = {
    id: urlKey(url) || titleKey(title),
    title_zh: feed.lang === "zh" ? title : "", title_en: feed.lang === "zh" ? "" : title,
    summary_zh: feed.lang === "zh" ? summary : "", summary_en: feed.lang === "zh" ? "" : summary,
    why_zh: "", why_en: "", source, url, published_at,
    source_title: title, source_summary: summary, source_lang: feed.lang,
    publication_date_status: published_at ? "known" : "missing_or_invalid",
    feed_url: feed.url, fetched_at: new Date(now).toISOString(),
    image: entry.enclosure?.url || "", lang: feed.lang,
  };
  return refreshNewsMetadata(item, now);
}

export function dedupeNews(items) {
  const result = [], titles = new Map(), urls = new Map();
  for (const item of items) {
    const title = titleKey(item.lang === "zh" ? item.title_zh || item.title_en : item.title_en || item.title_zh);
    const url = urlKey(item.url);
    if (!url && !title) continue;
    const index = urls.get(url) ?? titles.get(title);
    if (index !== undefined) {
      const previous = result[index];
      // Keep the richer original, not an AI expanded translation.
      const rawLength = value => String(value.source_summary ?? (value.lang === "zh" ? value.summary_zh || "" : value.summary_en || "")).length;
      const preferred = rawLength(item) > rawLength(previous) ? item : previous;
      const merged = { ...preferred };
      for (const key of ["title_zh", "title_en", "summary_zh", "summary_en", "why_zh", "why_en"]) if (!merged[key]) merged[key] = previous[key] || item[key] || "";
      result[index] = merged;
      if (url) urls.set(url, index); if (title) titles.set(title, index);
      continue;
    }
    const added = result.push(item) - 1;
    if (url) urls.set(url, added); if (title) titles.set(title, added);
  }
  return result;
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).map(entry => normalizeNewsEntry(entry, feed)).filter(item => item.recommendation);
    console.log(`  ✓ ${feed.source}: ${items.length} 条明确相关消息`);
    return { ok: true, items };
  } catch (error) { console.log(`  ✗ ${feed.source}: ${error.message}`); return { ok: false, items: [] }; }
}

export async function main() {
  fs.mkdirSync(ARCHIVE, { recursive: true });
  const all = []; let successfulFeeds = 0;
  for (const feed of FEEDS) { const result = await fetchFeed(feed); successfulFeeds += Number(result.ok); all.push(...result.items); }
  const date = todayStr(), file = path.join(ARCHIVE, `${date}.json`);
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(file, "utf8")).items || []; } catch {}
  const now = Date.now();
  const usable = all.filter(item => item.published_at && now - Date.parse(item.published_at) <= 48 * 3600000);
  if (!successfulFeeds || !usable.length) { console.log("本轮没有抓到可用的近期消息，保留原快照及其抓取时间。"); return; }
  const items = mergeEditorialItems(existing.map(item => refreshNewsMetadata(item, now)), dedupeNews(usable), { kind: "news", now, maxItems: MAX_PER_DAY });
  try { await enrichItems(items); } catch (error) { console.log(`富化失败，保留原文：${error.message}`); }
  fs.writeFileSync(file, JSON.stringify({ date, generatedAt: new Date().toISOString(), count: items.length, items }, null, 2), "utf8");
  const dates = fs.readdirSync(ARCHIVE).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(name => name.slice(0, -5)).sort().reverse();
  fs.writeFileSync(path.join(DATA, "index.json"), JSON.stringify({ latest: dates[0], dates }, null, 2), "utf8");
  console.log(`完成：${date}，${items.length} 条消息（${successfulFeeds} 个RSS源可达，未作多源事实核验）。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
