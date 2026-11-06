// Shared, deterministic editorial rules. Popularity is evidence, never a relevance gate.
const DAY = 86400000;
export const REPO_TOPICS = [
  { key: "models", label_zh: "模型训练与推理", label_en: "Models & inference", query: 'topic:machine-learning', pattern: /\b(?:large language models?|language models?|llms?|machine learning|deep learning|neural networks?|model inference|model training|inference framework|inference engine|transformer models?|diffusion models?|model quantization)\b|大模型|机器学习|模型推理|模型训练|深度学习|神经网络/i },
  { key: "agents", label_zh: "智能体与检索", label_en: "Agents & retrieval", query: 'topic:llm-agent', pattern: /\b(?:agentic|ai agent|autonomous agent|llm agent|agent framework|retrieval[- ]augmented|rag pipeline|vector database|coding agent|claude skill|agent skill|agent system)\b|智能体|检索增强/i },
  { key: "vision", label_zh: "视觉与多模态", label_en: "Vision & multimodal", query: 'topic:computer-vision', pattern: /\b(?:computer vision|vision[- ]language|visual backbones|object detection|image segmentation|image generation|video generation|text[- ]to[- ]image|text[- ]to[- ]video|multimodal model|gaussian splatting|neural radiance|optical flow|image Q&A|long-screenshot OCR)\b|计算机视觉|多模态模型|图像生成|目标检测|视觉工具箱/i },
  { key: "language", label_zh: "自然语言与语音", label_en: "Language & speech", query: 'topic:natural-language-processing', pattern: /\b(?:natural language processing|speech recognition|speech synthesis|text[- ]to[- ]speech|machine translation|text embedding|sentence embedding|speech model)\b|自然语言处理|语音识别|语音合成|机器翻译/i },
  { key: "robotics", label_zh: "机器人与自主系统", label_en: "Robotics & autonomy", query: 'topic:robotics', pattern: /\b(?:robotics|robot control|robot learning|robot navigation|robot motion|robot manipulation|robot operating system|ros 2|autonomous navigation|slam|visual odometry|drone autopilot|uav navigation|motion planning)\b|机器人|无人机|自主导航/i },
  { key: "science", label_zh: "科学计算与研究", label_en: "Scientific research", query: 'topic:scientific-computing', pattern: /\b(?:scientific computing|scientific machine learning|scientific software|scientific workbench|numerical library|numeric libraries|numerical computing|n-dimensional array|differential equations|lattice boltzmann|finite element|high-precision physics|multilayer optics|differentiable inverse design|differentiable simulation|molecular dynamics|protein folding|protein design|drug discovery|bioinformatics|genomics|computational imaging|photonic|visible light communication|optical camera communication|neural simulation|reproducible research|reproducible figures|quantum simulator|quantum computing)\b|科学计算|生物信息|蛋白质|光子计算|可见光通信/i },
  { key: "systems", label_zh: "AI 系统与算力", label_en: "AI systems", query: 'topic:deep-learning', pattern: /\b(?:gpu kernel|cuda kernel|tensor compiler|tensor throughput|distributed training|distributed inference|gpu inference|ai accelerator|ai compiler|ai infrastructure)\b|张量编译|分布式训练|AI算力/i },
];

export function validPublicationDate(value, now = Date.now()) {
  if (typeof value !== "string" || !/\b\d{4}\b/.test(value) || /^\d+$/.test(value)) return null;
  const datePrefix = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (datePrefix && new Date(Date.UTC(+datePrefix[1], +datePrefix[2] - 1, +datePrefix[3])).toISOString().slice(0, 10) !== datePrefix[0].replace(/T$/, "")) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Number(now) ? new Date(time).toISOString() : null;
}

function safeUrl(value) {
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
}
function host(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function domainIs(hostname, domain) { return hostname === domain || hostname.endsWith(`.${domain}`); }
const PRIMARY = ["openai.com", "anthropic.com", "deepmind.google", "research.google", "blog.google", "ai.google", "ai.meta.com", "huggingface.co", "pytorch.org", "tensorflow.org", "nvidia.com", "blogs.microsoft.com", "microsoft.com", "deepseek.com", "qwenlm.github.io", "qwen.ai", "tencent.com", "alibabacloud.com", "moonshot.ai", "zhipuai.cn", "arxiv.org", "biorxiv.org", "medrxiv.org", "gov.cn", "whitehouse.gov", "europa.eu", "nist.gov"];
const REPORT = ["reuters.com", "apnews.com", "bloomberg.com", "techcrunch.com", "theverge.com", "technologyreview.com", "venturebeat.com", "ithome.com", "36kr.com", "jiqizhixin.com", "the-decoder.com", "wired.com", "arstechnica.com", "cnbc.com", "ft.com", "bbc.com", "bbc.co.uk", "dataconomy.com", "yicai.com", "siliconangle.com", "techradar.com", "chinadaily.com.cn", "cls.cn"];

export function classifyNewsSource(url) {
  const h = host(url);
  if (!h) return "unknown";
  if (["news.google.com", "news.ycombinator.com", "hnrss.org", "news.yahoo.com", "finance.yahoo.com"].some(d => domainIs(h, d))) return "aggregator";
  if (PRIMARY.some(d => domainIs(h, d))) return "primary";
  if (REPORT.some(d => domainIs(h, d))) return "report";
  return "unknown";
}

export function matchesEditorialKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /[\u3400-\u9fff]/.test(keyword)
    ? text.toLowerCase().includes(keyword.toLowerCase())
    : new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

function repoText(item) {
  // A README can mention every fashionable tool; the project's stated purpose must match.
  return [item.name || item.full_name?.split("/").at(-1), item.description_en || item.description_zh].filter(Boolean).join(" ").slice(0, 1800);
}
const CANONICAL_REPO_TOPICS = { "scipy/scipy": "science", "numpy/numpy": "science", "pytorch/pytorch": "models", "tensorflow/tensorflow": "models" };
function canonicalTopic(item) {
  const id = String(item.full_name || item.id || "").toLowerCase();
  try {
    const url = new URL(item.url || item.html_url);
    return url.hostname === "github.com" && url.pathname.replace(/^\/|\/$/g, "").toLowerCase() === id ? CANONICAL_REPO_TOPICS[id] : undefined;
  } catch { return undefined; }
}
function unrelatedRepo(text) {
  return /\b(?:debloat|tv launcher|android tv|google tv|switch games|nintendo|microsoft word|autocad|parametric 3d cad|clean[- ]room.{0,35}(?:word|software)|rebuilding.{0,40}world.{0,10}software)\b|电视.{0,12}(?:桌面|清理)|开源.{0,8}电视桌面/i.test(text);
}

export function repoProfile(item, now = Date.now()) {
  if (!item || item.archived || item.disabled || item.is_fork || item.fork) return null;
  const text = repoText(item);
  if (unrelatedRepo(text)) return null;
  const topicPriority = ["robotics", "science", "vision", "language", "agents", "systems", "models"];
  const canonical = canonicalTopic(item);
  const topics = REPO_TOPICS.filter(t => t.pattern.test(text) || t.key === canonical).sort((a, b) => topicPriority.indexOf(a.key) - topicPriority.indexOf(b.key)).map(({ key, label_zh, label_en }) => ({ key, label_zh, label_en }));
  if (!topics.length || !safeUrl(item.url || item.html_url)) return null;
  const stars = Math.max(0, Number(item.stars ?? item.stargazers_count) || 0);
  const created = validPublicationDate(item.created_at, now);
  const pushed = validPublicationDate(item.pushed_at, now);
  const checked = validPublicationDate(item.checked_at, now);
  const age = created ? (Number(now) - Date.parse(created)) / DAY : Infinity;
  const maintenance = pushed ? (Number(now) - Date.parse(pushed)) / DAY : Infinity;
  const license = typeof item.license === "string" ? item.license : item.license?.spdx_id;
  const knownLicense = !!license && !["NOASSERTION", "NONE"].includes(license);
  let lane = "reference";
  if (created && age <= 90 && maintenance <= 90 && stars >= 5 && checked) lane = "recent";
  else if (created && age >= 730 && stars >= 500 && checked) lane = "established";
  const topicReason = topics.slice(0, 2).map(t => t.label_zh).join("、");
  let reason = canonical ? `项目为已识别的官方研究基础库，涉及${topicReason}` : `项目名称或简介明确涉及${topicReason}`;
  if (lane === "recent") reason += `；仓库于 ${created.slice(0, 10)} 创建，已有 ${stars} Stars`;
  else if (lane === "established") reason += `；仓库已有至少两年历史，核验时为 ${stars} Stars`;
  else reason += "；作为相关工具参考，暂不标为近期新项目或长期高影响项目";
  const limitations = [];
  if (!knownLicense) limitations.push("未识别到明确的开源许可证，使用前核查授权");
  if (maintenance > 365) limitations.push("一年内未见已知代码推送，需核查兼容性和维护状态");
  if (!checked) limitations.push("缺少指标核验时间");
  limitations.push("Stars 反映关注度，不代表性能、可靠性或效果已验证");
  return {
    scope: "repo", lane,
    score: 30 + Math.min(4, topics.length - 1) + (lane === "recent" ? 6 : lane === "established" ? 4 : 0) + (knownLicense ? 2 : 0) + Math.min(2, Math.log10(stars + 1) / 2),
    reason_zh: reason, limitations_zh: limitations.join("；"), evidence_url: safeUrl(item.url || item.html_url), topics,
    ...(checked ? { metric: { source: "GitHub Stars", value: stars, checked_at: checked, source_url: safeUrl(item.url || item.html_url) } } : {}),
  };
}

const AI_NEWS = /\b(?:ai|artificial intelligence|machine learning|deep learning|large language model|llm|gpt(?:-\w+)?|chatgpt|openai|anthropic|claude|gemini|deepseek|qwen|llama|agentic|neural network|robotics|autonomous driving)\b|人工智能|大模型|大语言模型|机器学习|深度学习|神经网络|生成式|多模态|智能体|具身智能|机器人|自动驾驶|豆包|智谱|通义|文心|月之暗面/i;
export function newsProfile(item, now = Date.now()) {
  const sourceLang = item.source_lang || item.lang;
  const title = item.source_title ?? (sourceLang === "zh" ? item.title_zh || item.title_en : item.title_en || item.title_zh);
  const original = item.source_summary ?? (sourceLang === "zh" ? item.summary_zh || "" : item.summary_en || "");
  const text = [title, original].filter(Boolean).join(" ");
  const titleRelevant = AI_NEWS.test(title || "");
  if ((!titleRelevant && !AI_NEWS.test(original.slice(0, 600))) || !safeUrl(item.url)) return null;
  const source_type = classifyNewsSource(item.url);
  const published = validPublicationDate(item.published_at, now);
  const age = published ? (Number(now) - Date.parse(published)) / DAY : Infinity;
  const lane = published && age <= 2 ? "recent" : "reference";
  const label = { primary: "机构或作者的一手页面", report: "媒体报道", aggregator: "聚合入口", unknown: "未归类来源页面" }[source_type];
  const sourceScore = { primary: 6, report: 3, aggregator: 0, unknown: 0 }[source_type];
  const detailScore = Math.min(3, Math.floor(original.length / 160));
  const eventScore = /\b(?:released?|launch(?:ed|es)?|benchmark|regulation|acquisition|funding)\b|发布|开源|监管|收购|融资/.test(text.toLowerCase()) ? 2 : 0;
  const limitations = ["来源类型仅按链接域名识别，不代表已交叉核实报道中的说法"];
  if (!published) limitations.push("原始发布时间缺失、无效或在未来，不能作为近期消息");
  if (source_type === "aggregator") limitations.push("当前链接为聚合页，阅读并核查原始出处后再采用结论");
  if (original.length < 160) limitations.push("RSS 提供的原文内容较少，具体细节以原始页面为准");
  return {
    scope: "news", lane, source_type,
    score: 25 + (titleRelevant ? 6 : 0) + sourceScore + detailScore + eventScore + (lane === "recent" ? 4 * Math.max(0, 1 - age / 2) : 0),
    reason_zh: `包含明确的 AI 或机器人主题；链接为${label}${published ? `，原始发布时间 ${published.slice(0, 10)}` : ""}`,
    limitations_zh: limitations.join("；"), evidence_url: safeUrl(item.url),
  };
}

function itemKey(item, kind) {
  if (kind === "repo") return String(item.id || item.full_name || "").toLowerCase();
  try { const u = new URL(item.url); u.hash = ""; ["utm_source", "utm_medium", "utm_campaign", "ref"].forEach(k => u.searchParams.delete(k)); return u.href.replace(/\/$/, ""); } catch { return item.id || ""; }
}
function translatedFields(kind) { return kind === "repo" ? ["description_zh", "highlight_zh"] : ["title_zh", "title_en", "summary_zh", "summary_en", "why_zh", "why_en"]; }

export function selectEditorialItems(items, { kind = "repo", now = Date.now(), maxItems = kind === "repo" ? 32 : 100 } = {}) {
  const profile = kind === "repo" ? repoProfile : newsProfile;
  const candidates = items.map(item => ({ ...item, recommendation: profile(item, now) })).filter(item => {
    if (!item.recommendation) return false;
    if (kind === "repo") return true;
    const published = validPublicationDate(item.published_at, now);
    return published && Number(now) - Date.parse(published) <= 2 * DAY && !/^(?:arXiv|bioRxiv|medRxiv)/i.test(item.source || "");
  }).sort((a, b) => b.recommendation.score - a.recommendation.score || String(a.id).localeCompare(String(b.id)));
  const picked = [], seen = new Set(), seenTitles = new Set(), groupCount = new Map(), sourceCount = new Map();
  const sourceLimit = kind === "repo" ? 2 : Math.max(3, Math.ceil(maxItems * 0.18));
  const groupLimit = kind === "repo" ? Math.max(2, Math.ceil(maxItems * 0.28)) : Math.max(3, Math.ceil(maxItems * 0.4));
  const add = item => {
    const key = itemKey(item, kind);
    const title = kind === "news" ? String(item.lang === "zh" ? item.title_zh || item.title_en : item.title_en || item.title_zh).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") : "";
    const source = kind === "repo" ? String(item.owner || item.full_name?.split("/")[0] || "unknown").toLowerCase() : host(item.url);
    const group = kind === "repo" ? item.recommendation.topics[0]?.key : item.category || "product";
    if (!key || seen.has(key) || (title && seenTitles.has(title)) || picked.length >= maxItems || (sourceCount.get(source) || 0) >= sourceLimit || (groupCount.get(group) || 0) >= groupLimit) return false;
    picked.push(item); seen.add(key); if (title) seenTitles.add(title); sourceCount.set(source, (sourceCount.get(source) || 0) + 1); groupCount.set(group, (groupCount.get(group) || 0) + 1); return true;
  };
  if (kind === "repo") {
    // Reserve one per topic/lane before filling, so a large field cannot starve a niche.
    for (const lane of ["recent", "established", "reference"]) for (const topic of REPO_TOPICS) {
      const item = candidates.find(it => !seen.has(itemKey(it, kind)) && it.recommendation.lane === lane && it.recommendation.topics[0]?.key === topic.key);
      if (item) add(item);
    }
  } else {
    for (const category of ["research", "product", "policy", "business"]) {
      const item = candidates.find(it => it.category === category); if (item) add(item);
    }
  }
  for (const item of candidates) add(item);
  return picked;
}

export function mergeEditorialItems(existing, incoming, options = {}) {
  const kind = options.kind || "repo";
  const byKey = new Map();
  for (const item of existing || []) { const key = itemKey(item, kind); if (key) byKey.set(key, item); }
  for (const item of incoming || []) {
    const key = itemKey(item, kind); if (!key) continue;
    const old = byKey.get(key);
    const merged = { ...old, ...item };
    for (const field of translatedFields(kind)) if (!merged[field] && old?.[field]) merged[field] = old[field];
    byKey.set(key, merged);
  }
  return selectEditorialItems([...byKey.values()], options);
}
