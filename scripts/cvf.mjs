// CVF openaccess 顶会论文爬取（需求1 选 c）。
// 从 openaccess.thecvf.com 抓取近年顶会（CVPR/ICCV/WACV）论文清单，
// 用 RM 强相关关键词过滤标题，命中的少数论文再抓详情页取摘要，归一化为论文对象后补入。
// 整体 best-effort：任一会议/详情页失败即跳过，绝不影响主流程。
import {
  CVF_PROCEEDINGS,
  CVF_MAX,
  STRONG_TOPIC_KW,
  PAPER_TOPIC_KW,
} from "./robomaster-feeds.mjs";

const BASE = "https://openaccess.thecvf.com";
const UA = "Mozilla/5.0 (compatible; RMAlgoTracker/1.0)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CVF 列表页用「标题」过滤：泛视觉词召回太多且非 RM 专属，
// 因此 CVF 仅收标题命中 RM 强相关/核心主题词的论文，确保补入的都贴近 RM。
const CVF_TITLE_KW = [...new Set([...STRONG_TOPIC_KW, ...PAPER_TOPIC_KW])].map((k) =>
  k.toLowerCase()
);

function decode(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 解析列表页，返回 [{ title, htmlHref }]。
function parseListing(html) {
  const out = [];
  const re = /<dt class="ptitle">(?:\s|<br\s*\/?>)*<a href="([^"]+)">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const title = decode(m[2].replace(/<[^>]+>/g, ""));
    if (title) out.push({ title, htmlHref: href });
  }
  return out;
}

// 详情页抽取摘要。
function parseAbstract(html) {
  const m = html.match(/<div id="abstract"[^>]*>([\s\S]*?)<\/div>/i);
  return m ? decode(m[1].replace(/<[^>]+>/g, " ")) : "";
}

// 由详情页 html 链接推导 pdf 链接：/content/<PROC>/html/x.html → /content/<PROC>/papers/x.pdf
function pdfFromHtmlHref(htmlHref) {
  return htmlHref.replace("/html/", "/papers/").replace(/\.html$/i, ".pdf");
}

function confFromProc(proc) {
  const m = proc.match(/^([A-Za-z]+)(\d{4})$/);
  return m ? { key: m[1].toUpperCase(), year: Number(m[2]) } : { key: proc, year: 0 };
}

// 抓取单个会议（如 "CVPR2025"）的 RM 相关论文。
async function fetchOne(proc, budget) {
  const { key, year } = confFromProc(proc);
  let html;
  // 优先 ?day=all（大会按天分页），失败再退回基础页。
  for (const url of [`${BASE}/${proc}?day=all`, `${BASE}/${proc}`]) {
    try {
      html = await getText(url);
      break;
    } catch {}
  }
  if (!html) {
    console.log(`  · CVF ${proc}: 列表页不可用，跳过`);
    return [];
  }
  const listing = parseListing(html);
  if (!listing.length) {
    console.log(`  · CVF ${proc}: 未解析到论文，跳过`);
    return [];
  }
  // 标题命中 RM 关键词的才进一步抓详情页。
  const matched = listing.filter((it) => {
    const lt = it.title.toLowerCase();
    return CVF_TITLE_KW.some((k) => lt.includes(k));
  });
  const out = [];
  for (const it of matched) {
    if (out.length >= budget) break;
    const detailUrl = it.htmlHref.startsWith("http")
      ? it.htmlHref
      : `${BASE}${it.htmlHref}`;
    let abstract = "";
    try {
      abstract = parseAbstract(await getText(detailUrl));
    } catch {}
    const pdfHref = pdfFromHtmlHref(it.htmlHref);
    const pdfUrl = pdfHref.startsWith("http") ? pdfHref : `${BASE}${pdfHref}`;
    const id = `cvf:${proc}:${it.title.slice(0, 60)}`;
    out.push({
      id,
      arxiv_id: "",
      source: key, // 如 "CVPR"
      cats: [],
      title_en: it.title,
      title_zh: "",
      abstract_en: abstract,
      abstract_zh: "",
      highlight_zh: "",
      digest_zh: "",
      authors: [],
      url: detailUrl,
      pdf_url: pdfUrl,
      html_url: detailUrl,
      published_at: year ? `${year}-06-01T00:00:00.000Z` : new Date().toISOString(),
      upvotes: 0,
      heat: 0,
      featured: false,
      categories: [],
      image: "",
      comment: `Accepted to ${key} ${year}`, // 供顶会识别复用
    });
    await sleep(400);
  }
  console.log(`  ✓ CVF ${proc}: 命中 ${matched.length} 篇，取摘要 ${out.length} 篇`);
  return out;
}

// 入口：遍历配置的会议，累计不超过 CVF_MAX。失败的会议自动跳过。
export async function fetchCVFPapers() {
  const all = [];
  for (const proc of CVF_PROCEEDINGS) {
    if (all.length >= CVF_MAX) break;
    try {
      const got = await fetchOne(proc, CVF_MAX - all.length);
      all.push(...got);
    } catch (e) {
      console.log(`  · CVF ${proc}: 失败 (${e.message})，跳过`);
    }
    await sleep(800);
  }
  return all;
}
