// Select the rolling research feed from original titles, abstracts and dated evidence.
export const FRONTIER_DAYS = 30;
const DAY = 86400000;
const TOPIC_LIMIT = 5;

export const FRONTIER_TOPICS = [
  { key: "learning", label_zh: "学习方法与推理", label_en: "Learning & reasoning", cats: ["cs.LG", "cs.CL", "cs.AI"],
    queryTerms: ["self-distillation", "post-training", "test-time scaling", "reasoning model", "preference optimization", "agent memory"],
    signal: /self.distillation|knowledge distillation|post.training|pre.training objective|test.time scaling|preference optimi[sz]ation|reasoning (?:model|benchmark|policy|capability)|agent(?:ic|s)? (?:memory|orchestration|reasoning)|multi.agent memory|tree boosting/i,
    limitation: "对照论文中的训练数据、模型规模和评测任务，检查结果是否能迁移到其他模型。" },
  { key: "multimodal", label_zh: "多模态理解", label_en: "Multimodal understanding", cats: ["cs.CV", "cs.CL", "cs.LG"],
    queryTerms: ["vision-language model", "multimodal reasoning", "visual grounding", "video understanding"],
    signal: /vision.language models?|multimodal (?:reasoning|understanding|vision encod|large language)|visual (?:grounding|question answering)|video understanding|document understanding/i,
    limitation: "对照图像分辨率、视频采样频率和任务数据，论文中的基准分数只适用于相应评测设置。" },
  { key: "generation", label_zh: "视觉生成与编辑", label_en: "Visual generation & editing", cats: ["cs.CV", "cs.LG", "cs.GR"],
    queryTerms: ["image generation", "video generation", "image editing", "video editing", "text-to-video"],
    signal: /(?:image|video|visual) (?:synthesis|generation|editing)|text.to.(?:image|video)/i,
    limitation: "对照输出分辨率、采样设置和硬件条件，生成质量、时延与显存通常需要分别比较。" },
  { key: "vision", label_zh: "视觉感知与三维", label_en: "Visual perception & 3D", cats: ["cs.CV", "cs.GR", "eess.IV"],
    queryTerms: ["3D reconstruction", "gaussian splatting", "object detection", "segmentation", "depth estimation", "object tracking"],
    signal: /3d (?:reconstruction|scene understanding|gaussian)|gaussian splatting|radiance fields?|novel view synthesis|surface reconstruction|object (?:detection|tracking)|(?:semantic|instance|panoptic) segmentation|depth estimation|image recognition|visual perception|visual.inertial|lidar.inertial|\bslam\b/i,
    limitation: "对照数据集、传感器、标定和计算条件，遮挡、动态场景与端侧实时性需要另行评估。" },
  { key: "efficiency", label_zh: "高效训练与推理", label_en: "Efficient training & inference", cats: ["cs.LG", "cs.AI", "cs.DC", "cs.CV", "cs.AR"],
    queryTerms: ["speculative decoding", "efficient inference", "quantization", "token compression", "KV cache", "efficient training"],
    signal: /speculative decoding|efficient (?:inference|training|serving)|kv.cache|key.value cache|(?:token|model|weight|activation) (?:compression|quantization|pruning)|quantiz\w+ (?:llm|language|neural|model)|inference (?:acceleration|throughput|efficiency)/i,
    limitation: "比较速度前应对齐硬件、批量、上下文长度与精度设置，作者环境的加速比不能直接外推。" },
  { key: "embodied", label_zh: "具身智能与机器人学习", label_en: "Embodied AI & robot learning", cats: ["cs.RO", "cs.AI", "cs.CV", "cs.LG"],
    queryTerms: ["vision-language-action", "robot learning", "robot manipulation", "robot policy", "embodied AI"],
    signal: /vision.language.action|\bvla\b|robot (?:learning|manipulation|polic\w+)|embodied (?:ai|agent|intelligence)|robotic manipulation/i,
    limitation: "区分仿真和实机实验，并检查机械臂、相机和控制接口能否匹配自身环境。" },
];

const topicByKey = new Map(FRONTIER_TOPICS.map(topic => [topic.key, topic]));
// A paper that accelerates a VLM is primarily about efficiency when both title signals match.
const topicPriority = ["embodied", "efficiency", "generation", "vision", "multimodal", "learning"];
const RESOURCE_KINDS = new Set(["code", "data", "weights"]);
const IN_SCOPE_FIELDS = new Set(["vision", "ml", "nlp", "robotics"]);
const EXCLUDED_APPLICATION = /(?:weaponized|missile guidance|military targeting|autonomous weapons?|malware generation|automated exploit(?:ation| development)|bioweapon|pathogen engineering)/i;
const SPECIALIZED_APPLICATION = /medical visual|radiology|remote sensing|aerial multimodal|satellite imagery/i;

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function evidenceTime(value, now) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now && new Date(parsed).toISOString().slice(0, 10) === value.slice(0, 10)
    ? parsed : null;
}

export function frontierResources(item, now = Date.now()) {
  const resources = new Map();
  for (const resource of [...(item.frontier_review?.resources || []), ...(item.frontier_resources || [])]) {
    const url = httpsUrl(resource.url);
    const checked = evidenceTime(resource.checked_at, now);
    if (!RESOURCE_KINDS.has(resource.kind) || !url || checked === null || now - checked > FRONTIER_DAYS * DAY) continue;
    const key = `${resource.kind}:${url.href.toLowerCase()}`;
    const previous = resources.get(key);
    if (!previous || checked > Date.parse(previous.checked_at)) resources.set(key, { ...resource, url: url.href });
  }
  return [...resources.values()].filter(resource => !(item.frontier_unavailable || []).includes(resource.url.toLowerCase())).slice(0, 4);
}

function measuredBaseline(item, published, now) {
  const review = item.reference_review;
  const impact = item.impact;
  const endpoint = httpsUrl(impact?.source_url);
  if (!httpsUrl(review?.source_url) || now - published < 730 * DAY || impact?.source !== "Crossref"
      || !Number.isInteger(impact.citations) || impact.citations < 100 || evidenceTime(impact.checked_at, now) === null
      || endpoint?.hostname !== "api.crossref.org" || !endpoint.pathname.startsWith("/works/")) return null;
  let doi;
  try { doi = decodeURIComponent(endpoint.pathname.slice("/works/".length)); } catch { return null; }
  if (!review.doi || doi.toLowerCase() !== review.doi.toLowerCase()) return null;
  return { metric: { source: "Crossref", value: impact.citations, source_url: endpoint.href, checked_at: impact.checked_at }, url: review.source_url };
}

function matchesTopic(topic, title, abstract) {
  if (topic.signal.test(title)) return 3;
  const contribution = abstract.match(/(?:we (?:propose|present|introduce|develop|study|evaluate|investigate|address|train)|this (?:paper|work) (?:proposes|presents|introduces|studies))[^.!?]+/gi) || [];
  return contribution.some(sentence => topic.signal.test(sentence)) ? 2 : 0;
}

export function selectAIFrontier(candidates, { now = Date.now() } = {}) {
  const unique = new Map();
  for (const item of candidates) {
    const title = String(item.title_en || "").trim();
    const abstract = String(item.abstract_en || "").trim();
    const published = evidenceTime(item.published_at, now);
    const url = httpsUrl(item.url);
    if (!item.id || !title || abstract.length < 80 || published === null || !url || EXCLUDED_APPLICATION.test(`${title} ${abstract.slice(0, 450)}`)) continue;
    const baseline = measuredBaseline(item, published, now);
    const arxivId = url.hostname === "arxiv.org" && url.pathname.match(/^\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?\/?$/)?.[1];
    if (!baseline && (!arxivId || now - published > FRONTIER_DAYS * DAY || ["year", "month"].includes(item.published_precision))) continue;

    const review = item.frontier_review;
    const reviewedTopic = review?.id === arxivId && topicByKey.get(review.topic);
    const matches = FRONTIER_TOPICS.map(topic => {
      const allowed = baseline ? IN_SCOPE_FIELDS.has(item.field) : topic.cats.some(cat => item.cats?.includes(cat));
      const strength = topic === reviewedTopic ? 12 : allowed ? matchesTopic(topic, title, abstract) : 0;
      return { topic, strength };
    }).filter(match => match.strength).sort((a, b) => b.strength - a.strength
      || topicPriority.indexOf(a.topic.key) - topicPriority.indexOf(b.topic.key));
    if (!matches.length) continue;
    const primary = matches[0];
    const resources = frontierResources(item, now);
    const resourcesBoost = resources.some(r => r.kind === "code") ? 7 : resources.length ? 4 : 0;
    const experiment = /\b(?:benchmark|experiments?|evaluation|ablations?|held.out|test set)\b/i.test(abstract);
    const freshness = baseline ? 0 : 8 * (1 - (now - published) / (FRONTIER_DAYS * DAY));
    const specialized = !reviewedTopic && SPECIALIZED_APPLICATION.test(title) ? 5 : 0;
    const score = Math.round(100 * (30 + 2 * primary.strength + freshness + resourcesBoost + (experiment ? 2 : 0) - specialized)) / 100;
    const catalogEntry = reviewedTopic ? { ...item.reference_review, ...review } : baseline ? item.reference_review : null;
    const reason = catalogEntry?.reason_zh || `研究的题目或主要贡献对应「${primary.topic.label_zh}」。${experiment ? "原文摘要包含实验或评测说明。" : "可查阅原文的方法描述。"}`;
    const picked = { ...item, ...(reviewedTopic && review.title_zh ? { title_zh: review.title_zh } : {}),
      ai_frontier: { primary_topic: primary.topic.key, topics: matches.slice(0, 2).map(match => match.topic.key), resources, stage: baseline ? "published" : "preprint" },
      recommendation: { scope: "ai-frontier", lane: baseline ? "established" : "recent", score, reason_zh: reason,
        limitations_zh: catalogEntry?.limitations_zh || primary.topic.limitation,
        evidence_url: baseline?.url || url.href, ...(baseline ? { metric: baseline.metric } : {}) } };
    const key = arxivId ? `arxiv:${arxivId}` : item.id;
    if (!unique.has(key) || unique.get(key).recommendation.score < score) unique.set(key, picked);
  }

  const ranked = [...unique.values()].sort((a, b) => b.recommendation.score - a.recommendation.score || Date.parse(b.published_at) - Date.parse(a.published_at) || a.id.localeCompare(b.id));
  const groups = FRONTIER_TOPICS.map(topic => {
    const group = ranked.filter(item => item.ai_frontier.primary_topic === topic.key);
    const recent = group.filter(item => item.recommendation.lane === "recent");
    const selected = new Set();
    // Preserve a recent paper with artifacts and a promising new paper before filling by score.
    const withResources = recent.find(item => item.ai_frontier.resources.length);
    if (withResources) selected.add(withResources);
    if (recent[0]) selected.add(recent[0]);
    if (recent[1]) selected.add(recent[1]);
    const baseline = group.find(item => item.recommendation.lane === "established");
    if (baseline) selected.add(baseline);
    for (const item of recent) {
      if (selected.size >= TOPIC_LIMIT) break;
      selected.add(item);
    }
    return [...selected];
  });

  const items = [];
  for (let rank = 0; rank < TOPIC_LIMIT; rank++) for (const group of groups) if (group[rank]) items.push(group[rank]);
  return items;
}
