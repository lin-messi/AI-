// 抓取 RoboMaster 算法资料：arXiv 论文（机器人/视觉/ML，各分类分开查询、关键词过滤）
// + CVF openaccess 顶会论文（CVPR/ICCV/WACV）+ GitHub 开源库
// → 清洗 → 去重 → 顶会识别（CVPR 等，加权+徽章）→ 多标签分类 → 论文热度 + 相关度评分
// → 近窗优先/回溯补足凑约 60 篇 → 翻译（论文精读/标题、库简介/亮点）
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
  STRONG_TOPIC_KW,
  GITHUB_QUERIES,
  REPO_RELEVANCE_KW,
  REPO_BLOCK_KW,
  PAPERS_MAX,
  PAPERS_CUMULATIVE_MAX,
  REPOS_MAX,
  RECENT_DAYS_PAPERS,
  BACKFILL_DAYS_PAPERS,
  ARXIV_MAX,
  REPO_MIN_STARS,
  FEATURED_TOP,
  TRANSLATE_TITLE_TOP,
} from "./robomaster-feeds.mjs";
import { translatePapersFull, translatePaperTitles } from "./enrich-papers.mjs";
import { translateRepos } from "./enrich-github.mjs";
import { assessRMUsage } from "./enrich-rm-usage.mjs";
import { detectConference } from "./conference.mjs";
import { scorePaperRelevance, scoreRepoRelevance } from "./relevance.mjs";
import { fetchCVFPapers } from "./cvf.mjs";

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
      ["arxiv:comment", "comment"],
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

// —— arXiv（各分类分开查询，按提交时间倒序，提高召回 Q21）——
async function fetchArxivCat(cat) {
  const url = `http://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=${ARXIV_MAX}`;
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
          comment: stripHtml(e.comment || ""), // arXiv:comment，用于顶会识别
        };
      });
      console.log(`  ✓ arXiv ${cat}：${items.length} 条`);
      return items;
    } catch (e) {
      console.log(`  · arXiv ${cat} 第 ${attempt + 1} 次失败 (${e.message})，退避重试…`);
      await sleep(5000 * (attempt + 1));
    }
  }
  console.log(`  ✗ arXiv ${cat}：多次重试仍失败`);
  return [];
}

async function fetchArxivAll(cats) {
  const all = [];
  for (const cat of cats) {
    all.push(...(await fetchArxivCat(cat)));
    await sleep(3000);
  }
  return all;
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
  let raw = await fetchArxivAll(ARXIV_CATS);
  raw = dedupeBy(raw, (p) => (p.arxiv_id ? `a:${p.arxiv_id}` : p.id));

  // 顶会识别（comment 优先，标题/摘要兜底）——后续过滤/加权都依赖它
  for (const p of raw) {
    const c = detectConference(p);
    if (c) Object.assign(p, c);
  }

  // 关键词过滤（放宽 Q19/Q12）：强主题词单独命中 / 主题词+机器人语境 / 视觉顶会+主题词
  const pool = raw.filter((p) => {
    const text = (p.title_en + " " + p.abstract_en).toLowerCase();
    if (STRONG_TOPIC_KW.some((k) => text.includes(k.toLowerCase()))) return true;
    const topic = PAPER_TOPIC_KW.some((k) => text.includes(k.toLowerCase()));
    if (!topic) return false;
    const ctx = PAPER_CTX_KW.some((k) => text.includes(k.toLowerCase()));
    if (ctx) return true;
    return !!(p.conf && p.confVision); // 视觉顶会豁免机器人语境
  });

  // 分类 + 热度（含顶会加权 Q6）
  for (const p of pool) {
    const text = p.title_en + " " + p.abstract_en;
    p.categories = classify(text);
    p.upvotes = p.arxiv_id ? hfMap.get(p.arxiv_id) || 0 : 0;
    const recency = Math.max(0, BACKFILL_DAYS_PAPERS * 24 - hoursAgo(p.published_at));
    p.heat = p.upvotes * 50 + recency + (p.confWeight || 0) * 20;
  }

  // 近窗优先、不足再回溯补足（Q18/Q27）：先取近 RECENT 天，凑不够 PAPERS_MAX 再用近 BACKFILL 天补。
  const recent = pool
    .filter((p) => hoursAgo(p.published_at) <= RECENT_DAYS_PAPERS * 24)
    .sort((a, b) => b.heat - a.heat);
  const older = pool
    .filter((p) => {
      const h = hoursAgo(p.published_at);
      return h > RECENT_DAYS_PAPERS * 24 && h <= BACKFILL_DAYS_PAPERS * 24;
    })
    .sort((a, b) => b.heat - a.heat);
  let papers = recent.slice(0, PAPERS_MAX);
  if (papers.length < PAPERS_MAX) {
    papers = papers.concat(older.slice(0, PAPERS_MAX - papers.length));
  }
  console.log(
    `  · 过滤后 近窗${recent.length} + 回溯${older.length} → 保留论文：${papers.length}`
  );

  // ===== CVF 顶会论文补入（需求1 选 c）=====
  console.log("\n[论文] CVF openaccess…");
  let cvf = await fetchCVFPapers();
  for (const p of cvf) {
    const c = detectConference(p);
    if (c) Object.assign(p, c);
    p.categories = classify(p.title_en + " " + p.abstract_en);
    p.heat = (p.confWeight || 0) * 20; // CVF 无 arXiv/HF 热度，仅顶会权重
  }
  // 与 arXiv 论文按规整标题去重（CVPR 论文常同时挂 arXiv）
  const titleKey = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 60);
  const seenTitles = new Set(papers.map((p) => titleKey(p.title_en)));
  cvf = cvf.filter((p) => {
    const k = titleKey(p.title_en);
    if (!k || seenTitles.has(k)) return false;
    seenTitles.add(k);
    return true;
  });
  console.log(`  · CVF 去重后补入：${cvf.length} 篇`);
  papers = papers.concat(cvf);

  // 相关度评分（Q32/Q34）
  for (const p of papers) p.relevance = scorePaperRelevance(p);

  // 标记精选 + 翻译
  papers.sort((a, b) => b.heat - a.heat);
  papers.slice(0, FEATURED_TOP).forEach((p) => (p.featured = true));
  await translatePapersFull(papers.filter((p) => p.featured));
  await translatePaperTitles(papers.filter((p) => !p.title_zh).slice(0, TRANSLATE_TITLE_TOP));
  // 翻译补全中文后重算相关度（中文标题/摘要可能新增命中）
  for (const p of papers) p.relevance = scorePaperRelevance(p);

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
    r.relevance = scoreRepoRelevance(r); // 相关度评分（Q33）
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
  const paperKey = (p) => (p.arxiv_id ? `a:${p.arxiv_id}` : p.id);
  const repoKey = (r) => (r.id || "").toLowerCase();

  // 把本次新算的 顶会信息 / 相关度 叠加回 existing 中的同一条目，
  // 否则旧数据（在本功能上线前抓到的）会因 dedupe 优先保留而拿不到 conf/relevance 字段。
  const newPaperById = new Map(papers.map((p) => [paperKey(p), p]));
  for (const ex of existing.papers) {
    const np = newPaperById.get(paperKey(ex));
    if (!np) continue;
    if (np.conf) {
      ex.conf = np.conf;
      ex.confYear = np.confYear;
      ex.confTag = np.confTag;
      ex.confWeight = np.confWeight;
      ex.confVision = np.confVision;
    }
    if (np.relevance != null) ex.relevance = np.relevance;
  }
  const newRepoById = new Map(repos.map((r) => [repoKey(r), r]));
  for (const ex of existing.repos) {
    const nr = newRepoById.get(repoKey(ex));
    if (nr && nr.relevance != null) ex.relevance = nr.relevance;
  }

  const finalPapers = dedupeBy([...existing.papers, ...papers], paperKey)
    .sort((a, b) => (b.heat || 0) - (a.heat || 0))
    .slice(0, PAPERS_CUMULATIVE_MAX); // 当天累计天花板（Q26）
  const finalRepos = dedupeBy([...existing.repos, ...repos], repoKey).sort(
    (a, b) => (b.stars || 0) - (a.stars || 0)
  );

  // first_seen：条目「首次被收录」时间，用于「最新」排序与 NEW 角标。
  // 已有则保留；历史条目（此前已存在却无此字段）回填发布/更新时间，避免被误标为新；
  // 本次新发现的条目记为当前时间。
  const now = new Date().toISOString();
  const existedPaperKeys = new Set(existing.papers.map(paperKey));
  for (const p of finalPapers) {
    if (!p.first_seen)
      p.first_seen = existedPaperKeys.has(paperKey(p)) ? p.published_at || now : now;
  }
  const existedRepoKeys = new Set(existing.repos.map(repoKey));
  for (const r of finalRepos) {
    if (!r.first_seen)
      r.first_seen = existedRepoKeys.has(repoKey(r))
        ? r.pushed_at || r.created_at || now
        : now;
  }

  // RM 用途评估（仅论文；RM 原生库本身即 RoboMaster 项目，无需评估）。只评估缺失的条目。
  await assessRMUsage(finalPapers, "paper");

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
