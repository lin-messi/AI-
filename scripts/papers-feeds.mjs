// 学术论文源配置。
// 每个领域（field）聚合多个 arXiv 分类与可选的 bioRxiv/medRxiv server。
// 抓取脚本会逐源尝试，单源失败不影响其他源。

export const FIELDS = [
  {
    key: "vision",
    label_zh: "视觉 / 图像",
    label_en: "Vision & Imaging",
    arxiv: ["cs.CV", "eess.IV", "cs.GR", "physics.med-ph"],
  },
  {
    key: "bio",
    label_zh: "生物",
    label_en: "Biology",
    arxiv: ["q-bio.BM", "q-bio.GN", "q-bio.NC", "q-bio.QM"],
    biorxiv: ["biorxiv", "medrxiv"],
  },
  {
    key: "optics",
    label_zh: "光学",
    label_en: "Optics",
    arxiv: ["physics.optics", "quant-ph"],
  },
  {
    key: "ml",
    label_zh: "机器学习",
    label_en: "Machine Learning",
    arxiv: ["cs.LG"],
  },
  {
    key: "nlp",
    label_zh: "自然语言",
    label_en: "NLP",
    arxiv: ["cs.CL"],
  },
  {
    key: "robotics",
    label_zh: "机器人",
    label_en: "Robotics",
    arxiv: ["cs.RO"],
  },
];

// 每个领域最多保留的论文条数（按热度排序后截断）。
export const MAX_PER_FIELD = 60;
// 每个领域预翻译标题的条数（其余按需翻译，节省成本）。
export const TRANSLATE_TITLE_TOP = 15;
// 每个领域预生成「精读 + 一句话亮点」的精选条数。
export const FEATURED_TOP = 3;
// 仅保留近 N 小时内发布的论文（放宽到 5 天，覆盖周末无更新的间隙）。
export const RECENT_HOURS = 120;

// 子标签：命中关键词即打标签，便于领域内细分浏览。
export const SUBTAG_RULES = [
  { tag: "医学影像", kw: ["medical imag", "ct scan", "mri", "radiolog", "pathology", "histopath", "x-ray", "ultrasound", "segmentation of"] },
  { tag: "扩散模型", kw: ["diffusion model", "denoising diffusion", "latent diffusion", "score-based"] },
  { tag: "3D", kw: ["3d ", "nerf", "gaussian splatting", "point cloud", "mesh", "neural radiance"] },
  { tag: "多模态", kw: ["multimodal", "vision-language", "vlm", "image-text", "clip"] },
  { tag: "目标检测", kw: ["object detection", "detection", "yolo", "segmentation"] },
  { tag: "蛋白质", kw: ["protein", "alphafold", "folding", "amino acid", "structure prediction"] },
  { tag: "基因组", kw: ["genom", "dna", "rna", "sequencing", "gene expression", "transcriptom"] },
  { tag: "AI制药", kw: ["drug discovery", "molecule", "molecular", "compound", "binding affinity", "pharma"] },
  { tag: "神经科学", kw: ["neuro", "brain", "neural activity", "cortex", "spiking"] },
  { tag: "量子光学", kw: ["quantum optic", "photon", "entangle", "quantum light", "single-photon"] },
  { tag: "计算成像", kw: ["computational imag", "holograph", "metasurface", "wavefront", "phase retrieval", "lensless"] },
  { tag: "光通信", kw: ["optical communication", "fiber", "waveguide", "photonic", "laser"] },
  { tag: "大模型", kw: ["large language model", "llm", "foundation model", "gpt", "transformer"] },
  { tag: "强化学习", kw: ["reinforcement learning", "rlhf", "policy gradient", "reward model"] },
  { tag: "智能体", kw: ["agent", "agentic", "tool use", "planning"] },
];
