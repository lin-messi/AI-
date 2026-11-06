// Evidence-based selection shared by collection and the one-time latest-snapshot repair.
// Popularity is a bounded hint; it is never described as citation impact or replication.
const DAY = 86400000;
export const FIELD_LABELS = { vision: "视觉与成像", bio: "生物与生命科学", optics: "光学", ml: "机器学习", nlp: "自然语言", robotics: "机器人" };
const TOPICS = [
  { key: "detection", label_zh: "检测与跟踪", label_en: "Detection & tracking", kw: ["object detection", "object tracking", "multi-object tracking", "instance segmentation"], limit: "需核对目标尺度、遮挡与实时延迟；公开数据集成绩不能直接等同实际场景效果。" },
  { key: "geometry", label_zh: "三维与定位", label_en: "3D & localization", kw: ["slam", "odometry", "3d reconstruction", "gaussian splatting", "radiance field", "depth estimation"], limit: "需核对传感器、标定、尺度与算力；重建画质和可用的定位精度属于不同指标。" },
  { key: "robotics", label_zh: "机器人感知与控制", label_en: "Robot perception & control", kw: ["robot", "robotic", "quadrotor", "manipulation", "autonomous navigation", "motion planning", "visual servoing"], limit: "需区分仿真与实机结果，核对传感器、执行器、控制频率及部署算力；未作本站复现。" },
  { key: "generation", label_zh: "生成与多模态", label_en: "Generation & multimodal", kw: ["diffusion model", "image generation", "video generation", "vision-language", "multimodal", "text-to-image"], limit: "需核对训练数据、评测设置、显存和模型许可；示例与作者指标不能证明通用可靠性。" },
  { key: "language", label_zh: "语言模型与推理", label_en: "Language & reasoning", kw: ["language model", "bert", "transformer", "reasoning", "retrieval augmented", "agentic", "tool use"], limit: "需核对模型规模、上下文与任务难度；基准成绩不等同开放场景可靠性，代码和权重许可需分别检查。" },
  { key: "learning", label_zh: "学习与优化", label_en: "Learning & optimization", kw: ["learning", "optimization", "boosting", "random forest", "reinforcement learning"], limit: "需核对数据划分、基线、消融与计算预算；结果的适用范围以原文实验为准。" },
  { key: "bio", label_zh: "生物建模与实验", label_en: "Biological modeling", kw: ["protein", "genom", "rna", "cell", "biological", "drug discovery"], limit: "区分计算预测、回顾性分析与实验验证；不把模型输出作为临床结论，数据和权重许可需单独核对。" },
  { key: "optics", label_zh: "光学器件与计算", label_en: "Optical devices & computing", kw: ["optic", "photonic", "photon", "laser", "metasurface", "waveguide", "holograph"], limit: "需核对波长、器件、光路、噪声与实验条件；数值仿真不等于已制备器件或可直接部署。" },
];
function term(text, word) {
  // Prefixes are explicit in the catalog; short tokens always need word boundaries.
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}${word.length <= 4 || !["optic", "photon", "robot", "genom", "holograph"].includes(word) ? "(?![a-z0-9])" : ""}`, "i").test(text);
}
export function publicationAge(item, now = Date.now()) {
  const time = Date.parse(item.published_at);
  return Number.isFinite(time) && time <= now ? (now - time) / DAY : null;
}
export function classifyPaperField(item, fields) {
  if (item.reference_review?.field && fields.some(f => f.key === item.reference_review.field)) return item.reference_review.field;
  if (["bioRxiv", "medRxiv"].includes(item.source)) return "bio";
  // The first arXiv category is the author's primary category, not the UI field order.
  for (const cat of item.cats || []) {
    const field = fields.find(f => f.arxiv?.includes(cat));
    if (field) return field.key;
  }
  return FIELD_LABELS[item.field] ? item.field : null;
}
function citationMetric(item, now) {
  const impact = item.impact;
  if (!impact || !["Crossref", "OpenAlex"].includes(impact.source) || !Number.isInteger(impact.citations) || impact.citations < 0) return null;
  const checked = Date.parse(impact.checked_at);
  let url;
  try { url = new URL(impact.source_url); } catch { return null; }
  const host = impact.source === "Crossref" ? "api.crossref.org" : "api.openalex.org";
  if (url.protocol !== "https:" || url.hostname !== host || !Number.isFinite(checked) || checked > now) return null;
  return { source: impact.source, value: impact.citations, source_url: impact.source_url, checked_at: impact.checked_at };
}
export function paperProfile(item, now = Date.now()) {
  const title = String(item.title_en || item.title_zh || "").trim();
  const abstract = String(item.abstract_en || "").trim();
  const age = publicationAge(item, now);
  let source;
  try { source = new URL(item.url); } catch { return null; }
  if (!title || age === null || !FIELD_LABELS[item.field] || source.protocol !== "https:") return null;
  if (abstract.length < 80 && !item.reference_review?.source_url) return null;
  const text = `${item.title_en || ""} ${abstract}`.toLowerCase();
  const hits = TOPICS.filter(topic => topic.kw.some(word => term(text, word))).slice(0, 3);
  const topics = hits.map(({ key, label_zh, label_en }) => ({ key, label_zh, label_en }));
  const metric = citationMetric(item, now);
  const established = age >= 730.5 && (metric?.value || 0) >= 100;
  const lane = established ? "established" : age <= 365.25 ? "recent" : "reference";
  const review = item.reference_review;
  const code = review?.code_url || "";
  const survey = /\b(survey|review|perspective)\b/i.test(title);
  const simulation = /\b(simulation|numerical)\b/i.test(title) && !/\b(experiment|prototype|hardware|real-world)\b/i.test(abstract);
  const quality = !abstract ? "metadata_only" : survey ? "survey" : simulation ? "simulation" : code ? "author_code" : "study";
  const topicLabel = hits[0]?.label_zh || FIELD_LABELS[item.field];
  const support = established ? `截至 ${metric.checked_at.slice(0, 10)}，${metric.source} 索引记录 ${metric.value} 次引用，可作长期文献线索。`
    : lane === "recent" ? "依据原始发表时间列入近一年研究；尚不据此声称已有长期影响。" : "作为历史方法参考保留；当前证据不足以标注长期影响。";
  const reason = review?.reason_zh || `研究主题为${topicLabel}，来源提供${abstract ? "摘要供核对方法和实验" : "题录"}。`;
  let limitations = review?.limitations_zh || hits[0]?.limit || "方法、实验条件与结论以原文为准；推荐分不等于已复现或同行评审认证。";
  if (!abstract) limitations += " 来源未提供摘要，本站不会仅凭标题生成精读。";
  if (survey) limitations += " 这是综述或观点文献，应与可运行实现区分。";
  // HF reactions are interest only, capped at four points; raw vote*50 no longer dominates.
  const interest = Math.min(4, Math.log2(Math.max(0, Number(item.upvotes) || 0) + 1));
  const recency = age <= 30 ? 4 * (1 - age / 30) : 0;
  const score = Math.round((40 + Math.min(9, hits.length * 3) + (abstract.length >= 300 ? 4 : 0) + (code ? 5 : 0)
    + (established ? 7 : 0) + interest + recency) * 100) / 100;
  return { scope: "paper", lane, score, reason_zh: `${reason} ${support}`, limitations_zh: limitations,
    evidence_url: review?.source_url || item.url, quality, topics, ...(metric ? { metric } : {}), ...(code ? { code_url: code } : {}) };
}

export function mergePaperRecords(existing, incoming) {
  const merged = new Map();
  for (const item of [...existing, ...incoming]) {
    const key = item.arxiv_id ? `arxiv:${item.arxiv_id.replace(/v\d+$/, "")}` : item.id;
    if (!key) continue;
    const old = merged.get(key);
    if (!old) { merged.set(key, { ...item }); continue; }
    const next = { ...old, ...item };
    for (const field of ["title_zh", "abstract_zh", "highlight_zh", "digest_zh"]) if (!next[field]?.trim() && old[field]?.trim()) next[field] = old[field];
    // A reference annotation and measured evidence survive a later bare search hit.
    for (const field of ["reference_review", "impact"]) if (!next[field] && old[field]) next[field] = old[field];
    merged.set(key, next);
  }
  return [...merged.values()];
}

// Interleave fields, then topics inside each field. Low-volume fields receive their own slots.
export function selectPapers(items, { now = Date.now(), perField = 60, fieldKeys = Object.keys(FIELD_LABELS), recentHours = 120 } = {}) {
  const ranked = mergePaperRecords([], items).map(item => ({ ...item, recommendation: paperProfile(item, now) }))
    .filter(item => item.recommendation && (publicationAge(item, now) <= recentHours / 24 || item.reference_review?.source_url))
    .sort((a, b) => b.recommendation.score - a.recommendation.score || Date.parse(b.published_at) - Date.parse(a.published_at));
  const byField = fieldKeys.map(field => {
    const pool = ranked.filter(item => item.field === field);
    const chosen = new Set();
    // Preserve up to two measured historical references without displacing the daily feed.
    for (const item of pool.filter(p => p.recommendation.lane === "established").slice(0, Math.min(2, perField))) chosen.add(item);
    const groups = new Map();
    for (const item of pool) {
      const topic = item.recommendation.topics[0]?.key || field;
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic).push(item);
    }
    while (chosen.size < Math.min(perField, pool.length)) {
      let progress = false;
      for (const group of groups.values()) {
        const next = group.find(item => !chosen.has(item));
        if (next && chosen.size < perField) { chosen.add(next); progress = true; }
      }
      if (!progress) break;
    }
    return [...chosen].sort((a, b) => b.recommendation.score - a.recommendation.score);
  });
  const out = [];
  for (let i = 0; byField.some(group => i < group.length); i++) for (const group of byField) if (group[i]) out.push(group[i]);
  return out;
}

export function arxivQueryGroups(fields, extraArxiv = []) {
  const groups = fields.map(field => ({ key: field.key, cats: [...new Set(field.arxiv || [])] })).filter(group => group.cats.length);
  if (extraArxiv.length) groups.push({ key: "frontier", cats: [...new Set(extraArxiv)] });
  return groups;
}
