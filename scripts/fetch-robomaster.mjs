// 抓取 RoboMaster 算法资料：arXiv 论文（机器人/视觉/ML，关键词过滤）+ GitHub 开源库
// → 清洗 → 去重 → 多标签分类 → 论文热度 → 翻译（论文精读/标题、库简介/亮点）
// → 增量合并写入 data/robomaster/<date>.json + data/robomaster-index.json
// 运行：npm run fetch:robomaster
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  CATEGORY_RULES,
  ARXIV_CATS,
  PAPER_TOPIC_KW,
  PAPER_CTX_KW,
  GITHUB_QUERIES,
  REPO_RELEVANCE_KW,
  REPO_BLOCK_KW,
  PAPERS_MAX,
  REPOS_MAX,
  RECENT_DAYS_PAPERS,
  REPO_MIN_STARS,
  FEATURED_TOP,
  TRANSLATE_TITLE_TOP,
} from "./robomaster-feeds.mjs";
import { translatePapersFull, translatePaperTitles } from "./enrich-papers.mjs";
import { translateRepos } from "./enrich-github.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RM = path.join(DATA, "robomaster");

const parser = new Parser({
  timeout: 25000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; RMAlgoTracker/1.0)" },
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
function daysAgoStr(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
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
function hoursAgo(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 9999999;
  return (Date.now() - t) / 3600000;
}

// 多标签分类：返回命中的分类 key 数组（保持 CATEGORIES 优先级顺序）；无命中则 ["other"]
function classify(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.kw.some((k) => lower.includes(k.toLowerCase()))) hits.push(rule.key);
  }
  const ordered = CATEGORIES.map((c) => c.key).filter((k) => hits.includes(k));
  return ordered.length ? ordered.slice(0, 3) : ["other"];
}

// —— arXiv（合并查询，按提交时间倒序）——
async function fetchArxivAll(cats) {
  const q = cats.map((c) => `cat:${c}`).join("+OR+");
  const url = `http://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=300`;
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
          categories: [],
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

// —— HuggingFace 每日论文热度 ——
async function fetchHFHeat() {
  const map = new Map();
  try {
    const res = await fetch("https://huggingface.co/api/daily_papers", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RMAlgoTracker/1.0)" },
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

// —— GitHub Search ——
async function searchRepos(q, perPage = 50) {
  const token = process.env.GITHUB_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RMAlgoTracker/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url =
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=stars&order=desc&per_page=${perPage}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 403 || res.status === 429) {
        console.log(`  · 限频(${res.status})，退避重试…`);
        await sleep(8000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      console.log(`  · 查询第 ${attempt + 1} 次失败 (${e.message})，重试…`);
      await sleep(4000 * (attempt + 1));
    }
  }
  console.log(`  ✗ 查询失败：${q}`);
  return [];
}

function normalizeRepo(r) {
  return {
    id: r.full_name,
    full_name: r.full_name,
    name: r.name,
    owner: r.owner?.login || "",
    owner_avatar: r.owner?.avatar_url || "",
    description_en: (r.description || "").trim(),
    description_zh: "",
    highlight_zh: "",
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    language: r.language || "",
    topics: Array.isArray(r.topics) ? r.topics.slice(0, 6) : [],
    url: r.html_url,
    homepage: r.homepage || "",
    created_at: r.created_at || "",
    pushed_at: r.pushed_at || r.updated_at || "",
    categories: [],
  };
}

function dedupeBy(items, keyFn) {
  const seen = new Map();
  for (const it of items) {
    const key = keyFn(it);
    if (key && !seen.has(key)) seen.set(key, it);
  }
  return [...seen.values()];
}

async function main() {
  console.log("开始抓取 RoboMaster 算法资料…");
  fs.mkdirSync(RM, { recursive: true });

  // ===== 论文 =====
  console.log("\n[论文] arXiv…");
  const hfMap = await fetchHFHeat();
  let papers = await fetchArxivAll(ARXIV_CATS);

  // 近窗过滤
  papers = papers.filter(
    (p) => hoursAgo(p.published_at) <= RECENT_DAYS_PAPERS * 24
  );
  // 关键词过滤：命中主题词 且 含机器人/自主语境
  papers = papers.filter((p) => {
    const text = (p.title_en + " " + p.abstract_en).toLowerCase();
    const topic = PAPER_TOPIC_KW.some((k) => text.includes(k.toLowerCase()));
    const ctx = PAPER_CTX_KW.some((k) => text.includes(k.toLowerCase()));
    return topic && ctx;
  });
  // 分类 + 热度
  for (const p of papers) {
    const text = p.title_en + " " + p.abstract_en;
    p.categories = classify(text);
    p.upvotes = p.arxiv_id ? hfMap.get(p.arxiv_id) || 0 : 0;
    const recency = Math.max(0, RECENT_DAYS_PAPERS * 24 - hoursAgo(p.published_at));
    p.heat = p.upvotes * 50 + recency;
  }
  papers = dedupeBy(papers, (p) => (p.arxiv_id ? `a:${p.arxiv_id}` : p.id))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, PAPERS_MAX);
  console.log(`  · 关键词过滤后保留论文：${papers.length}`);

  // 标记精选 + 翻译
  papers.slice(0, FEATURED_TOP).forEach((p) => (p.featured = true));
  await translatePapersFull(papers.filter((p) => p.featured));
  await translatePaperTitles(papers.filter((p) => !p.title_zh).slice(0, TRANSLATE_TITLE_TOP));

  // ===== 开源库 =====
  console.log("\n[开源库] GitHub Search…");
  let repos = [];
  for (const q of GITHUB_QUERIES) {
    const items = (await searchRepos(q, 50)).map(normalizeRepo);
    console.log(`  ✓ 「${q}」：${items.length} 个`);
    repos.push(...items);
    await sleep(2000);
  }
  repos = dedupeBy(repos, (r) => (r.id || "").toLowerCase())
    .filter((r) => r.stars >= REPO_MIN_STARS)
    .filter((r) => {
      const topics = (r.topics || []).map((x) => x.toLowerCase());
      const text = `${r.full_name} ${r.description_en} ${topics.join(" ")}`.toLowerCase();
      // 黑名单：FPS 游戏外挂等无关库一律剔除
      if (REPO_BLOCK_KW.some((k) => text.includes(k.toLowerCase()))) return false;
      // 相关性白名单：标签精确含 robomaster，或 名称/简介/标签 命中专属关键词
      if (topics.includes("robomaster")) return true;
      return REPO_RELEVANCE_KW.some((k) => text.includes(k.toLowerCase()));
    });
  repos = repos.sort((a, b) => b.stars - a.stars).slice(0, REPOS_MAX);
  console.log(`  · 去重 + 星标过滤后保留库：${repos.length}`);
  await translateRepos(repos);
  // 翻译后再分类：中文简介/亮点信息更丰富，分类更准确
  for (const r of repos) {
    const text = `${r.full_name} ${r.description_en} ${r.description_zh} ${r.highlight_zh} ${(r.topics || []).join(" ")}`;
    r.categories = classify(text);
  }

  // ===== 增量合并写入 =====
  const date = todayStr();
  const file = path.join(RM, `${date}.json`);
  let existing = { papers: [], repos: [] };
  if (fs.existsSync(file)) {
    try {
      const prev = JSON.parse(fs.readFileSync(file, "utf8"));
      existing.papers = prev.papers?.items || [];
      existing.repos = prev.repos?.items || [];
    } catch {}
  }
  const finalPapers = dedupeBy(
    [...existing.papers, ...papers],
    (p) => (p.arxiv_id ? `a:${p.arxiv_id}` : p.id)
  ).sort((a, b) => (b.heat || 0) - (a.heat || 0));
  const finalRepos = dedupeBy(
    [...existing.repos, ...repos],
    (r) => (r.id || "").toLowerCase()
  ).sort((a, b) => (b.stars || 0) - (a.stars || 0));

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    categories: CATEGORIES,
    papers: { count: finalPapers.length, items: finalPapers },
    repos: { count: finalRepos.length, items: finalRepos },
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `\n  合并：论文 ${existing.papers.length}+${papers.length}→${finalPapers.length}，` +
      `库 ${existing.repos.length}+${repos.length}→${finalRepos.length}`
  );

  // 更新索引
  const dates = fs
    .readdirSync(RM)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
  fs.writeFileSync(
    path.join(DATA, "robomaster-index.json"),
    JSON.stringify({ latest: dates[0], dates }, null, 2),
    "utf8"
  );

  console.log(
    `\n完成：${date} 论文 ${finalPapers.length} 篇 / 库 ${finalRepos.length} 个，已写入 ${file}`
  );
}

main();
