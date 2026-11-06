// 抓取学术论文：arXiv（各分类 RSS）+ bioRxiv/medRxiv（API）+ HuggingFace 每日论文（热度）
// → 清洗 → 去重 → 按领域归类 → 判定「交叉前沿」（AI+光学+芯片/生物+光学等）→ 计算热度
// → 截断 → 前沿候选用 deepseek 打分过滤 → 预翻译精选 → 写入 data/papers/<date>.json
// 「交叉前沿」为双重归属：既保留原基础领域，又额外带 frontier 标记单独成一栏。
// 运行：npm run fetch:papers
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIELDS,
  MAX_PER_FIELD,
  TRANSLATE_TITLE_TOP,
  FEATURED_TOP,
  RECENT_HOURS,
  SUBTAG_RULES,
  FRONTIER,
} from "./papers-feeds.mjs";
import { translatePapersFull, translatePaperTitles } from "./enrich-papers.mjs";
import { detectFrontier, fallbackFrontierField, scoreFrontier } from "./frontier.mjs";
import { arxivQueryGroups, classifyPaperField, mergePaperRecords, paperProfile, publicationAge, selectPapers } from "./paper-policy.mjs";
import { fetchResearchReferences } from "./fetch-research-references.mjs";
import { translateRMContent } from "./rm-translations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const PAPERS = path.join(DATA, "papers");

const parser = new Parser({
  timeout: 25000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; AIPapersTracker/1.0)" },
  customFields: {
    item: [
      ["author", "authorList", { keepArray: true }],
      ["category", "catList", { keepArray: true }],
    ],
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 工具 ——
function todayStr() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function stripHtml(s = "") {
  if (typeof s !== "string") s = s == null ? "" : s._ || s["#"] || String(s);
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

// arXiv 新版 RSS 的 description 形如：
// "arXiv:2401.12345v1 Announce Type: new \nAbstract: 正文…"
function cleanAbstract(s = "") {
  let t = stripHtml(s);
  t = t.replace(/^arXiv:\S+\s*/i, "");
  t = t.replace(/Announce Type:\s*\w+\s*/i, "");
  t = t.replace(/^Abstract:\s*/i, "");
  return t.trim();
}

function arxivIdFromLink(link = "") {
  const m = link.match(/abs\/([0-9]+\.[0-9]+)/);
  return m ? m[1] : "";
}

function detectSubtags(text) {
  const tags = [];
  for (const rule of SUBTAG_RULES) {
    if (rule.kw.some((k) => text.includes(k))) tags.push(rule.tag);
  }
  return [...new Set(tags)].slice(0, 4);
}

function hoursAgo(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 9999;
  return (Date.now() - t) / 3600000;
}

// —— arXiv（官方 API，单次合并查询所有分类，按提交时间倒序）——
// 合并为一个请求可避免 API 限频（429）；周末也有数据（RSS 周末为空）。
async function fetchArxivAll(cats) {
  const q = cats.map((c) => `cat:${c}`).join("+OR+");
  const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=200`;
  // 重试：429/超时时退避重试
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const parsed = await parser.parseURL(url);
      const items = (parsed.items || []).map((e) => {
        const title = stripHtml(e.title || "").replace(/\s*\(arXiv:.*\)$/i, "");
        const link = e.link || e.guid || "";
        const arxivId = arxivIdFromLink(link);
        const abstract = cleanAbstract(
          e["content:encoded"] || e.content || e.summary || e.description || ""
        );
        const authors = (e.authorList || [])
          .map((a) => {
            const n = typeof a === "string" ? a : a?.name;
            return Array.isArray(n) ? n[0] : n || "";
          })
          .map((s) => stripHtml(s).trim())
          .filter(Boolean)
          .slice(0, 8);
        const cands = []
          .concat(e.catList || [])
          .map((c) => (typeof c === "string" ? c : c?.$?.term || c?.term || ""))
          .filter(Boolean);
        const published = e.isoDate || e.pubDate;
        const publishedAt = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
        return {
          id: arxivId ? `arxiv:${arxivId}` : link,
          arxiv_id: arxivId,
          source: "arXiv",
          cats: cands,
          title_en: title,
          title_zh: "",
          abstract_en: abstract,
          abstract_zh: "",
          highlight_zh: "",
          digest_zh: "",
          authors,
          url: arxivId ? `https://arxiv.org/abs/${arxivId}` : link,
          pdf_url: arxivId ? `https://arxiv.org/pdf/${arxivId}` : "",
          html_url: arxivId ? `https://arxiv.org/abs/${arxivId}` : link,
          published_at: publishedAt,
          upvotes: 0,
          heat: 0,
          featured: false,
          subtags: [],
          image: "",
        };
      });
      console.log(`  ✓ arXiv（合并 ${cats.length} 分类）：${items.length} 条`);
      return items;
    } catch (e) {
      console.log(`  · arXiv 第 ${attempt + 1} 次失败 (${e.message})，退避重试…`);
      await sleep(5000 * (attempt + 1));
    }
  }
  console.log("  ✗ arXiv：多次重试仍失败");
  return [];
}

// —— bioRxiv / medRxiv ——
// API 按日期升序分页（每页 30），最新论文在最后一页，因此先读 total 再取末页。
async function fetchBiorxiv(server) {
  const end = todayStr();
  const startDate = new Date(Date.now() - 4 * 86400000)
    .toISOString()
    .slice(0, 10);
  const base = `https://api.biorxiv.org/details/${server}/${startDate}/${end}`;
  const ua = { "User-Agent": "Mozilla/5.0 (compatible; AIPapersTracker/1.0)" };
  try {
    const first = await fetch(`${base}/0`, { headers: ua });
    if (!first.ok) throw new Error(`HTTP ${first.status}`);
    const firstData = await first.json();
    const total = Number(firstData.messages?.[0]?.total || 0);
    // 取最新一页（末页）
    let data = firstData;
    if (total > 30) {
      const lastCursor = Math.floor((total - 1) / 30) * 30;
      const last = await fetch(`${base}/${lastCursor}`, { headers: ua });
      if (last.ok) data = await last.json();
    }
    const coll = data.collection || [];
    const items = coll.map((p) => {
      const doi = p.doi || "";
      const authors = (p.authors || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
      const publishedAt = p.date && Number.isFinite(Date.parse(p.date)) ? new Date(p.date).toISOString() : null;
      return {
        id: doi ? `doi:${doi}` : p.title,
        arxiv_id: "",
        source: server === "medrxiv" ? "medRxiv" : "bioRxiv",
        arxivCat: "",
        title_en: stripHtml(p.title || ""),
        title_zh: "",
        abstract_en: stripHtml(p.abstract || ""),
        abstract_zh: "",
        highlight_zh: "",
        digest_zh: "",
        authors,
        url: doi ? `https://www.${server}.org/content/${doi}` : "",
        pdf_url: doi ? `https://www.${server}.org/content/${doi}v1.full.pdf` : "",
        html_url: doi ? `https://www.${server}.org/content/${doi}v1.full` : "",
        published_at: publishedAt,
        upvotes: 0,
        heat: 0,
        featured: false,
        subtags: [],
        image: "",
      };
    });
    console.log(`  ✓ ${server}: ${items.length} 条`);
    return items;
  } catch (e) {
    console.log(`  ✗ ${server}: 失败 (${e.message})`);
    return [];
  }
}

// —— HuggingFace 每日论文（提供点赞数，用于热度）——
async function fetchHFHeat() {
  const map = new Map(); // arxiv_id -> upvotes
  try {
    const res = await fetch("https://huggingface.co/api/daily_papers", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AIPapersTracker/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    for (const row of arr) {
      const id = row?.paper?.id || row?.id;
      const up = row?.paper?.upvotes ?? row?.upvotes ?? 0;
      if (id) map.set(String(id), Number(up) || 0);
    }
    console.log(`  ✓ HuggingFace 热度：${map.size} 篇`);
  } catch (e) {
    console.log(`  ✗ HuggingFace 热度：失败 (${e.message})`);
  }
  return map;
}

function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    const key = it.arxiv_id
      ? `a:${it.arxiv_id}`
      : it.id || it.title_en.toLowerCase().slice(0, 60);
    if (!seen.has(key)) seen.set(key, it);
  }
  return [...seen.values()];
}

async function main() {
  console.log('开始按领域抓取并核验证据…');
  fs.mkdirSync(PAPERS, { recursive: true });
  const date = todayStr();
  const file = path.join(PAPERS, date + '.json');
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(file, 'utf8')).items || []; } catch {}
  const hfMap = await fetchHFHeat();
  const all = [];
  // Each field gets its own candidate budget; a busy CV/ML feed cannot crowd out optics or bio.
  const groups = arxivQueryGroups(FIELDS, FRONTIER.extraArxiv);
  for (let i = 0; i < groups.length; i++) {
    all.push(...await fetchArxivAll(groups[i].cats));
    if (i < groups.length - 1) await sleep(3100);
  }
  for (const server of [...new Set(FIELDS.flatMap(f => f.biorxiv || []))]) all.push(...await fetchBiorxiv(server));
  if (!all.some(item => { const age = publicationAge(item); return age !== null && age <= RECENT_HOURS / 24; })) {
    console.warn('本轮没有取得有效的近期论文，保留上一快照和抓取时间；参考文献缓存不冒充日更成功');
    return;
  }
  let references = [];
  try { references = (await fetchResearchReferences()).papers; }
  catch (error) { console.warn('长期文献更新失败，保留已有证据：', error.message); }
  const now = Date.now();
  let merged = mergePaperRecords(existing, [...all, ...references]);
  for (const item of merged) {
    const frontier = detectFrontier(item);
    item.frontier = frontier.frontier;
    item.crossTag = frontier.crossTag;
    item.field = classifyPaperField(item, FIELDS) || (frontier.frontier ? fallbackFrontierField(item) : null);
    item.subtags = detectSubtags((item.title_en + ' ' + item.abstract_en).toLowerCase());
    if (hfMap.has(item.arxiv_id)) {
      item.upvotes = hfMap.get(item.arxiv_id);
      item.interest_checked_at = new Date(now).toISOString();
    }
    item.recommendation = paperProfile(item, now);
    item.heat = Math.round(Math.min(20, Math.log2(Math.max(0, item.upvotes || 0) + 1) * 2) * 100) / 100;
    item.featured = false;
  }
  const finalItems = selectPapers(merged, { now, perField: MAX_PER_FIELD, recentHours: RECENT_HOURS });
  // Only selected frontier candidates incur model usage; a field cap is applied after merging.
  let frontier = await scoreFrontier(finalItems.filter(p => p.frontier));
  frontier = frontier.filter(p => p.frontierScore !== 'low').sort((a,b) => b.recommendation.score - a.recommendation.score).slice(0, FRONTIER.maxPerField);
  const frontierIds = new Set(frontier.map(p => p.id));
  for (const item of finalItems) {
    item.frontier = frontierIds.has(item.id);
    if (!item.frontier) item.crossTag = '';
  }
  for (const field of FIELDS) {
    finalItems.filter(p => p.field === field.key).slice(0, FEATURED_TOP).forEach(p => p.featured = true);
    console.log('  ' + field.label_zh + ': ' + finalItems.filter(p => p.field === field.key).length);
  }
  frontier.slice(0, FRONTIER.featuredTop).forEach(p => p.featured = true);
  // Both old translations and freshly fetched metrics survive same-day updates.
  const payload = { date, generatedAt: new Date(now).toISOString(), count: finalItems.length,
    fields: [{ key: FRONTIER.key, label_zh: FRONTIER.label_zh, label_en: FRONTIER.label_en }, ...FIELDS.map(({key,label_zh,label_en}) => ({key,label_zh,label_en}))], items: finalItems };
  const save = () => fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  if (!finalItems.length) { console.warn('没有有效论文，保留已有快照与抓取时间'); return; }
  save();
  await translateRMContent(finalItems, 'paper', { checkpoint: save });
  await translatePapersFull(finalItems.filter(p => p.featured));
  save();
  // 更新索引
  const dates = fs
    .readdirSync(PAPERS)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
  fs.writeFileSync(
    path.join(DATA, "papers-index.json"),
    JSON.stringify({ latest: dates[0], dates }, null, 2),
    "utf8"
  );

  console.log(`\n完成：${date} 共 ${finalItems.length} 篇论文，已写入 ${file}`);
}

main();
