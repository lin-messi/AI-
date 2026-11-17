const DAY = 86_400_000;
const CHINA_OFFSET = 8 * 3_600_000;
const LIMIT = 5;

const topicRules = [
  { key: "learning", title: ["学习方法与推理", "Learning & reasoning"], pattern: /reinforcement learning|reasoning model|post.?training|self.supervised|representation learning|model training|distillation|agent memory|transformer architecture|强化学习|推理模型|后训练|自监督|表征学习|模型训练|知识蒸馏|智能体记忆/i },
  { key: "multimodal", title: ["多模态理解", "Multimodal understanding"], pattern: /multimodal|vision.language|visual question answering|document (?:understanding|parsing)|image.text|visual reasoning|多模态|视觉语言|文档理解|文档解析|视觉问答|视觉推理/i },
  { key: "generation", title: ["生成模型", "Generative models"], pattern: /image generat|video generat|text.to.image|text.to.video|diffusion model|flow matching|image edit|video edit|图像生成|视频生成|文生图|文生视频|扩散模型|图像编辑|视频编辑/i },
  { key: "vision", title: ["计算机视觉", "Computer vision"], pattern: /computer vision|object detection|image segment|panoptic|point cloud|3d reconstruct|gaussian splat|novel.view synthes|visual odometry|depth estimat|计算机视觉|目标检测|图像分割|三维重建|高斯泼溅|新视角合成|深度估计/i },
  { key: "efficiency", title: ["高效推理与部署", "Efficient inference & deployment"], pattern: /speculative decod|inference optimiz|inference engine|inference accel|kv.cache|quantiz|model serving|model compression|推测解码|投机解码|推理加速|推理优化|推理引擎|模型量化|模型压缩/i },
  { key: "embodied", title: ["具身智能", "Embodied AI"], pattern: /robot learning|robotics|robot (?:manipulat|policy|navigation)|vision.language.action|sim.to.real|embodied|humanoid|具身|机器人学习|机器人操作|机器人策略|机器人导航|人形机器人|视觉语言动作/i },
];

export function safeResearchUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function beijingDate(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time + CHINA_OFFSET).toISOString().slice(0, 10);
}

function paperKey(item) {
  if (item.arxiv_id) return "arxiv:" + item.arxiv_id.replace(/v\d+$/i, "").toLowerCase();
  if (item.doi) return "doi:" + item.doi.toLowerCase();
  return item.id || safeResearchUrl(item.url);
}

function canonicalNewsUrl(value) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href.replace(/\/$/, "");
}

function githubKey(value) {
  const url = safeResearchUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.host !== "github.com") return null;
  const [owner, name] = parsed.pathname.split("/").filter(Boolean);
  return owner && name ? (owner + "/" + name.replace(/\.git$/i, "")).toLowerCase() : null;
}

function citedPaper(item, papersById) {
  const text = [item.url, item.source_summary].filter(Boolean).join(" ");
  for (const match of text.matchAll(/https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?(?=$|[^a-z0-9.]|\.(?![a-z0-9]))/gi)) {
    const paper = papersById.get("arxiv:" + match[1]);
    if (paper) return paper;
  }
  return null;
}

function projectRows(items, chooseDate, chooseKey, project, inWindow) {
  const rows = new Map();
  for (const item of items) {
    const url = safeResearchUrl(item.url);
    if (!url) continue;
    const key = chooseKey(item, url);
    const date = chooseDate(item);
    if (!key || !inWindow(date)) continue;
    const row = project(item, url, beijingDate(date));
    const previous = rows.get(key);
    const time = Date.parse(date);
    if (row && (!previous || time > previous.time)) rows.set(key, { key, item, row, time });
  }
  return [...rows.values()].sort((a, b) => b.time - a.time);
}

export function buildAcademicTopics({ frontier = [], papers = [], news = [], repos = [], asOf }) {
  const end = beijingDate(asOf);
  if (!end) return { start: "", end: "", topics: [] };
  const start = new Date(Date.parse(end) - 6 * DAY).toISOString().slice(0, 10);
  const inWindow = value => {
    const date = beijingDate(value);
    return date >= start && date <= end && Date.parse(value) <= Date.parse(asOf);
  };
  const paperRows = projectRows([...frontier, ...papers],
    p => !["month", "year"].includes(p.published_precision) && p.published_at,
    paperKey, (p, url, date) => {
      const title = p.title_en || p.title_zh;
      if (!title) return null;
      const code = (p.ai_frontier?.resources || []).find(resource =>
        resource.kind === "code" && resource.checked_at && safeResearchUrl(resource.url));
      return { title, title_zh: p.title_zh || "", url, date, code: safeResearchUrl(code?.url) };
    }, inWindow);
  const newsRows = projectRows(news, n => n.published_at, (n, url) => canonicalNewsUrl(url),
    (n, url, date) => {
      const title = n.source_title || n.title_en || n.title_zh;
      return title ? { title: n.title_en || title, title_zh: n.title_zh || "", source: n.source || "", url, date } : null;
    }, inWindow);
  const repoRows = projectRows(repos, r => inWindow(r.created_at) ? r.created_at : r.pushed_at, (r, url) => githubKey(url),
    (r, url, date) => {
      if (r.archived || r.disabled || r.is_fork || !r.full_name) return null;
      return { title: r.full_name, url, date, created: inWindow(r.created_at),
        description: r.description_en || "", description_zh: r.description_zh || "" };
    }, inWindow);
  const topics = topicRules.map(({ key, title, pattern }) => {
    const matches = (...fields) => pattern.test(fields.filter(Boolean).join(" "));
    const topicPapers = paperRows.filter(({ item }) => item.ai_frontier?.topics?.length
      ? item.ai_frontier.topics.includes(key)
      : (key === "vision" && item.field === "vision") || matches(item.title_en || item.title_zh));
    const paperByRepo = new Map();
    const papersById = new Map(topicPapers.map(({ key: paperId, row }) => [paperId, row]));
    for (const { row } of topicPapers) {
      const repoKey = githubKey(row.code);
      if (repoKey && !paperByRepo.has(repoKey)) paperByRepo.set(repoKey, row);
    }
    const openSource = repoRows.filter(({ key: repoKey, item }) => paperByRepo.has(repoKey)
      || matches(item.name, item.description_en, item.topics?.join(" ")))
      .slice(0, LIMIT).map(({ key: repoKey, row }) => ({ ...row, paper: paperByRepo.get(repoKey) || null }));
    const recentPapers = topicPapers.slice(0, LIMIT);
    const reproducible = topicPapers.find(({ row }) => row.code);
    if (reproducible && !recentPapers.some(({ row }) => row.code)) recentPapers[LIMIT - 1] = reproducible;
    const relevantNews = newsRows.flatMap(({ item, row }) => {
      const paper = citedPaper(item, papersById);
      return paper || matches(item.source_title || item.title_en || item.title_zh) ? [{ ...row, paper }] : [];
    });
    return {
      key, title,
      papers: recentPapers.map(({ row }) => row),
      news: relevantNews.slice(0, LIMIT),
      repos: openSource,
    };
  });
  return { start, end, topics };
}
