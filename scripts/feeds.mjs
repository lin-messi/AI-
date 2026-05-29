// 免费 RSS 源配置（无需 API Key）。
// 抓取脚本会逐个尝试，单个源失败不影响其他源。
// weight 为来源基础可信度/重要性权重（1-3）。
// lang 标记源语言，用于决定填充中文还是英文字段。

export const FEEDS = [
  // —— Google News 聚合（量大、时效强，海外可达）——
  {
    url: "https://news.google.com/rss/search?q=artificial%20intelligence%20when:2d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    lang: "en",
    weight: 2,
  },
  {
    url: "https://news.google.com/rss/search?q=(OpenAI%20OR%20Anthropic%20OR%20%22large%20language%20model%22%20OR%20LLM)%20when:3d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    lang: "en",
    weight: 2,
  },
  {
    url: "https://news.google.com/rss/search?q=(AI%20funding%20OR%20AI%20regulation%20OR%20AI%20chip%20OR%20AI%20model)%20when:3d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    lang: "en",
    weight: 2,
  },
  // —— 专业科技媒体 ——
  {
    url: "https://techcrunch.com/tag/ai/feed/",
    source: "TechCrunch",
    lang: "en",
    weight: 3,
  },
  {
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    source: "The Verge",
    lang: "en",
    weight: 3,
  },
  {
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    source: "MIT Tech Review",
    lang: "en",
    weight: 3,
  },
  {
    url: "https://venturebeat.com/category/ai/feed/",
    source: "VentureBeat",
    lang: "en",
    weight: 2,
  },
  // —— Hacker News（社区热度）——
  {
    url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT&points=40",
    source: "Hacker News",
    lang: "en",
    weight: 2,
  },
  // —— 学术（arXiv）——
  {
    url: "https://rss.arxiv.org/rss/cs.AI",
    source: "arXiv cs.AI",
    lang: "en",
    weight: 2,
  },
  {
    url: "https://rss.arxiv.org/rss/cs.LG",
    source: "arXiv cs.LG",
    lang: "en",
    weight: 2,
  },
  // —— 中文源（部分网络/地区可达，失败自动跳过）——
  {
    url: "https://news.google.com/rss/search?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20OR%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%20when:3d&hl=zh-CN&gl=US&ceid=US:zh-Hans",
    source: "Google 新闻",
    lang: "zh",
    weight: 2,
  },
  {
    url: "https://www.jiqizhixin.com/rss",
    source: "机器之心",
    lang: "zh",
    weight: 3,
  },
];

// 重要性关键词（命中加分）
export const IMPORTANCE_KEYWORDS = {
  high: [
    "launch", "launches", "released", "release", "unveil", "announces",
    "breakthrough", "gpt-5", "gpt5", "raises", "billion", "acquire",
    "acquisition", "ipo", "regulation", "ban", "lawsuit", "open-source",
    "open source", "state-of-the-art", "sota", "发布", "推出", "开源",
    "融资", "亿", "收购", "监管", "突破", "上线",
  ],
  med: [
    "update", "feature", "study", "research", "paper", "model", "benchmark",
    "partnership", "funding", "更新", "研究", "论文", "模型", "合作",
  ],
};

// 分类关键词
export const CATEGORY_RULES = [
  { cat: "policy", kw: ["regulation", "law", "act", "ban", "lawsuit", "court", "congress", "policy", "antitrust", "监管", "法案", "立法", "诉讼", "禁令", "合规"] },
  { cat: "business", kw: ["funding", "raises", "raised", "valuation", "billion", "million", "acquire", "acquisition", "ipo", "revenue", "invest", "融资", "估值", "收购", "营收", "投资", "上市"] },
  { cat: "research", kw: ["arxiv", "paper", "study", "researchers", "benchmark", "dataset", "weights", "论文", "研究", "数据集", "基准", "权重", "学术"] },
  { cat: "product", kw: ["launch", "release", "app", "feature", "available", "update", "unveil", "api", "发布", "推出", "上线", "功能", "更新", "应用"] },
];

// 标签关键词（命中即打标签）
export const TAG_RULES = [
  { tag: "OpenAI", kw: ["openai", "chatgpt", "gpt-", "sora"] },
  { tag: "Anthropic", kw: ["anthropic", "claude"] },
  { tag: "Google", kw: ["google", "gemini", "deepmind"] },
  { tag: "Meta", kw: ["meta", "llama"] },
  { tag: "xAI", kw: ["xai", "grok", "musk"] },
  { tag: "国内", kw: ["deepseek", "qwen", "通义", "字节", "阿里", "百度", "腾讯", "智谱", "月之暗面", "kimi"] },
  { tag: "芯片", kw: ["chip", "gpu", "nvidia", "tpu", "semiconductor", "芯片", "算力"] },
  { tag: "大模型", kw: ["llm", "large language model", "foundation model", "大模型", "语言模型"] },
  { tag: "智能体", kw: ["agent", "agentic", "智能体"] },
  { tag: "多模态", kw: ["multimodal", "vision", "image", "video", "voice", "多模态"] },
  { tag: "机器人", kw: ["robot", "robotics", "humanoid", "机器人"] },
  { tag: "政策监管", kw: ["regulation", "policy", "监管", "法案"] },
  { tag: "融资", kw: ["funding", "raises", "融资", "投资"] },
  { tag: "开源", kw: ["open-source", "open source", "开源"] },
];
