// 抓取学术论文：arXiv（各分类 RSS）+ bioRxiv/medRxiv（API）+ HuggingFace 每日论文（热度）
// → 清洗 → 去重 → 按领域归类 → 计算热度 → 截断 → 预翻译精选 → 写入 data/papers/<date>.json
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
} from "./papers-feeds.mjs";
import { translatePapersFull, translatePaperTitles } from "./enrich-papers.mjs";

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
  const url = `http://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=300`;
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
        const publishedAt = new Date(
          e.isoDate || e.pubDate || Date.now()
        ).toISOString();
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
          url: link,
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
      const publishedAt = new Date(p.date || Date.now()).toISOString();
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
        url: doi ? `https://www.biorxiv.org/content/${doi}` : "",
        pdf_url: doi ? `https://www.biorxiv.org/content/${doi}v1.full.pdf` : "",
        html_url: doi ? `https://www.biorxiv.org/content/${doi}v1.full` : "",
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

function classifyField(item) {
  // bioRxiv/medRxiv 归入 bio
  if (item.source === "bioRxiv" || item.source === "medRxiv") return "bio";
  // arXiv：按论文所属分类匹配领域（取首个命中的领域，FIELDS 顺序即优先级）
  const cats = item.cats || [];
  for (const f of FIELDS) {
    if (f.arxiv && f.arxiv.some((c) => cats.includes(c))) return f.key;
  }
  return null;
}

function computeHeat(item, hfMap) {
  const up = item.arxiv_id ? hfMap.get(item.arxiv_id) || 0 : 0;
  item.upvotes = up;
  const recency = Math.max(0, RECENT_HOURS - hoursAgo(item.published_at));
  return up * 50 + recency;
}

async function main() {
  console.log("开始抓取学术论文…");
  fs.mkdirSync(PAPERS, { recursive: true });

  const hfMap = await fetchHFHeat();

  // 收集所有源（arXiv 单次合并查询，避免限频）
  const arxivCats = [...new Set(FIELDS.flatMap((f) => f.arxiv || []))];
  const all = [];
  all.push(...(await fetchArxivAll(arxivCats)));
  const bioServers = [...new Set(FIELDS.flatMap((f) => f.biorxiv || []))];
  for (const s of bioServers) {
    all.push(...(await fetchBiorxiv(s)));
  }

  // 去重 → 近窗过滤 → 归类 → 子标签 → 热度
  let merged = dedupe(all).filter(
    (it) => hoursAgo(it.published_at) <= RECENT_HOURS
  );
  for (const it of merged) {
    it.field = classifyField(it);
    const text = (it.title_en + " " + it.abstract_en).toLowerCase();
    it.subtags = detectSubtags(text);
    it.heat = computeHeat(it, hfMap);
  }
  merged = merged.filter((it) => it.field);

  // 按领域分组、按热度排序、截断
  const byField = {};
  for (const f of FIELDS) byField[f.key] = [];
  for (const it of merged) byField[it.field].push(it);

  const kept = [];
  for (const f of FIELDS) {
    const list = byField[f.key].sort((a, b) => b.heat - a.heat);
    const top = list.slice(0, MAX_PER_FIELD);
    // 标记每领域前 FEATURED_TOP 为精选
    top.slice(0, FEATURED_TOP).forEach((p) => (p.featured = true));
    kept.push(...top);
    console.log(`  · ${f.label_zh}: 保留 ${top.length}/${list.length}`);
  }

  // 预翻译：精选（全文精读）+ 各领域前 N 标题
  const featured = kept.filter((p) => p.featured);
  await translatePapersFull(featured);

  const titleTodo = [];
  for (const f of FIELDS) {
    const list = kept
      .filter((p) => p.field === f.key && !p.title_zh)
      .slice(0, TRANSLATE_TITLE_TOP);
    titleTodo.push(...list);
  }
  await translatePaperTitles(titleTodo);

  // 写入归档
  const date = todayStr();
  const file = path.join(PAPERS, `${date}.json`);

  // 合并当天已有数据（支持一天多次抓取增量）：
  // existing 排在前面，dedupe 会保留先遇到的同一篇论文，
  // 因此先前抓到的论文（含已生成的中文标题/精读翻译）会被完整保留，
  // 本次新发现的论文追加进来。不截断，确保「原来的」不会被覆盖丢失。
  let existing = [];
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8")).items || [];
    } catch {}
  }
  const finalItems = dedupe([...existing, ...kept]);
  // 按领域分组、组内按热度排序，保证展示有序
  const fieldOrder = {};
  FIELDS.forEach((f, i) => (fieldOrder[f.key] = i));
  finalItems.sort(
    (a, b) =>
      (fieldOrder[a.field] ?? 99) - (fieldOrder[b.field] ?? 99) ||
      (b.heat || 0) - (a.heat || 0)
  );

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    count: finalItems.length,
    fields: FIELDS.map((f) => ({
      key: f.key,
      label_zh: f.label_zh,
      label_en: f.label_en,
    })),
    items: finalItems,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `  合并：已有 ${existing.length} + 本次保留 ${kept.length} → 去重后 ${finalItems.length}`
  );

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
