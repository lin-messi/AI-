// 自动抓取 AI 新闻：拉取免费 RSS → 清洗 → 去重 → 打分 → 分类/打标签 → 写入归档
// 运行：npm run fetch
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEEDS,
  IMPORTANCE_KEYWORDS,
  CATEGORY_RULES,
  TAG_RULES,
  AI_FILTER_KEYWORDS,
} from "./feeds.mjs";
import { enrichItems } from "./enrich.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const ARCHIVE = path.join(DATA, "archive");

const MAX_PER_DAY = 100;

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; AINewsTracker/1.0)" },
});

// —— 工具函数 ——
function todayStr() {
  // 以 Asia/Shanghai 时区确定“今天”，保证本地与云端一致
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function stripHtml(s = "") {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, n = 600) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

function normTitle(t = "") {
  return t.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "").slice(0, 80);
}

function hostPath(url = "") {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function detectCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.kw.some((k) => text.includes(k))) return rule.cat;
  }
  return "product";
}

function detectTags(text) {
  const tags = [];
  for (const rule of TAG_RULES) {
    if (rule.kw.some((k) => text.includes(k))) tags.push(rule.tag);
  }
  return [...new Set(tags)].slice(0, 5);
}

function scoreItem(text, weight, publishedAt) {
  let score = weight; // 1-3
  let high = 0;
  for (const k of IMPORTANCE_KEYWORDS.high) if (text.includes(k)) high++;
  let med = 0;
  for (const k of IMPORTANCE_KEYWORDS.med) if (text.includes(k)) med++;
  if (high >= 1) score += 1;
  if (high >= 2) score += 1;
  if (med >= 2) score += 1;
  // 时效：6 小时内 +1
  const ageHr = (Date.now() - new Date(publishedAt).getTime()) / 3600000;
  if (ageHr >= 0 && ageHr <= 6) score += 1;
  return Math.max(1, Math.min(5, score));
}

// Google News 标题形如 "标题 - 来源名"，提取真实来源
function refineSource(feedSource, title) {
  if (feedSource.startsWith("Google")) {
    const idx = title.lastIndexOf(" - ");
    if (idx > 0 && idx > title.length - 40) {
      return { source: title.slice(idx + 3).trim(), title: title.slice(0, idx).trim() };
    }
  }
  return { source: feedSource, title };
}

function pickImage(entry) {
  if (entry.enclosure?.url) return entry.enclosure.url;
  const mc = entry["media:content"] || entry.mediaContent;
  if (mc?.$?.url) return mc.$.url;
  const m = (entry.content || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

// —— 主流程 ——
async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    let items = (parsed.items || []).map((entry) => {
      let title = stripHtml(entry.title || "");
      const refined = refineSource(feed.source, title);
      title = refined.title;
      // 取最丰富的正文：content:encoded / content / 摘要 / 片段，择其长者
      const candidates = [
        entry["content:encoded"],
        entry.content,
        entry.contentSnippet,
        entry.summary,
        entry.description,
      ]
        .filter(Boolean)
        .map((s) => stripHtml(s));
      const richest = candidates.sort((a, b) => b.length - a.length)[0] || "";
      const summary = truncate(richest);
      const url = entry.link || entry.guid || "";
      const publishedAt = entry.isoDate || entry.pubDate || new Date().toISOString();
      const searchText = (title + " " + summary).toLowerCase();

      const item = {
        id: "",
        title_zh: feed.lang === "zh" ? title : "",
        title_en: feed.lang === "zh" ? "" : title,
        summary_zh: feed.lang === "zh" ? summary : "",
        summary_en: feed.lang === "zh" ? "" : summary,
        why_zh: "",
        why_en: "",
        source: refined.source,
        url,
        published_at: new Date(publishedAt).toISOString(),
        tags: detectTags(searchText),
        importance: scoreItem(searchText, feed.weight, publishedAt),
        image: pickImage(entry),
        category: detectCategory(searchText),
        lang: feed.lang,
      };
      item.id = hostPath(url) || normTitle(title);
      return item;
    });
    // 综合科技媒体：仅保留 AI 相关条目，剔除非 AI 噪音
    if (feed.aiOnly) {
      const before = items.length;
      items = items.filter((it) => {
        const text = (it.title_zh + " " + it.title_en + " " + it.summary_zh + " " + it.summary_en).toLowerCase();
        return AI_FILTER_KEYWORDS.some((k) => text.includes(k));
      });
      console.log(`  ✓ ${feed.source}: ${items.length} 条（AI 过滤后，原 ${before} 条）`);
      return items;
    }
    console.log(`  ✓ ${feed.source}: ${items.length} 条 (${feed.url.slice(0, 50)}…)`);
    return items;
  } catch (e) {
    console.log(`  ✗ ${feed.source}: 失败 (${e.message})`);
    return [];
  }
}

function dedupe(items) {
  const byTitle = new Map();
  const byUrl = new Map();
  const out = [];
  for (const it of items) {
    if (!it.url && !(it.title_en || it.title_zh)) continue;
    const tk = normTitle(it.title_en || it.title_zh);
    const uk = hostPath(it.url);
    const dupKey = byTitle.has(tk) ? tk : byUrl.has(uk) ? uk : null;
    if (dupKey) {
      // 保留分数更高者
      const idx = byTitle.get(tk) ?? byUrl.get(uk);
      if (out[idx] && it.importance > out[idx].importance) out[idx] = it;
      continue;
    }
    const idx = out.push(it) - 1;
    if (tk) byTitle.set(tk, idx);
    if (uk) byUrl.set(uk, idx);
  }
  return out;
}

async function main() {
  console.log("开始抓取 AI 新闻…");
  fs.mkdirSync(ARCHIVE, { recursive: true });

  const all = [];
  for (const feed of FEEDS) {
    const items = await fetchFeed(feed);
    all.push(...items);
  }

  const date = todayStr();
  const archivePath = path.join(ARCHIVE, `${date}.json`);

  // 合并当天已有数据（支持一天多次抓取增量）
  let existing = [];
  if (fs.existsSync(archivePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(archivePath, "utf8")).items || [];
    } catch {}
  }

  let merged = dedupe([...existing, ...all]);
  // 仅保留近 48 小时内的条目，避免老新闻堆积
  const cutoff = Date.now() - 48 * 3600000;
  merged = merged.filter((i) => {
    const t = new Date(i.published_at).getTime();
    return isNaN(t) || t >= cutoff;
  });
  // 排序：重要性 → 时间，截断 100
  merged.sort(
    (a, b) =>
      b.importance - a.importance ||
      new Date(b.published_at) - new Date(a.published_at)
  );
  merged = merged.slice(0, MAX_PER_DAY);

  // 翻译 + 生成“为何重要”（配置了 AI_API_KEY 时自动执行，否则跳过）
  try {
    await enrichItems(merged);
  } catch (e) {
    console.log("富化阶段出错（保留原文）：", e.message);
  }

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    count: merged.length,
    items: merged,
  };
  fs.writeFileSync(archivePath, JSON.stringify(payload, null, 2), "utf8");

  // 更新索引
  const dates = fs
    .readdirSync(ARCHIVE)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
  fs.writeFileSync(
    path.join(DATA, "index.json"),
    JSON.stringify({ latest: dates[0], dates }, null, 2),
    "utf8"
  );

  console.log(`\n完成：${date} 共 ${merged.length} 条，已写入 ${archivePath}`);
  if (merged.length === 0) {
    console.log("⚠️ 没抓到任何内容：可能是网络无法访问这些源（如在中国大陆访问 Google）。");
    console.log("   建议用 GitHub Actions 在云端定时抓取（见 .github/workflows/fetch-news.yml）。");
  }
}

main();
