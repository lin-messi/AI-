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
  // 交叉前沿子标签
  { tag: "光子计算", kw: ["photonic comput", "optical neural", "photonic neural", "optical comput", "photonic accelerator"] },
  { tag: "硅光", kw: ["silicon photonic", "photonic integrated", "integrated photonic"] },
  { tag: "神经形态", kw: ["neuromorphic", "memristor", "spiking neural", "in-memory comput", "processing-in-memory", "in-sensor"] },
  { tag: "生物光子", kw: ["biophoton", "optogenetic", "photoacoustic", "optical coherence tomograph", "fluorescence microscop"] },
  { tag: "脑机接口", kw: ["brain-computer interface", "brain computer interface", "neural interface", "neuroprosthe"] },
];

// ===== 交叉前沿（跨学科）配置 =====
// 目标：在 6 大基础领域之外，单独聚合「AI×光学×芯片融合、生物×光学、量子×AI、AI×材料、
// 脑机接口、光子计算/神经形态/硅光」等前沿交叉论文。交叉论文同时保留在其基础领域里出现。
export const FRONTIER = {
  key: "frontier",
  label_zh: "交叉前沿",
  label_en: "Frontier",
  // 在 6 大领域之外额外纳入抓取的 arXiv 分类（偏器件/硬件/交叉）。
  extraArxiv: [
    "physics.app-ph",
    "cond-mat.mes-hall",
    "cond-mat.mtrl-sci",
    "cs.ET",
    "cs.AR",
    "eess.SP",
    "physics.bio-ph",
  ],
  maxPerField: 50, // 每天最多保留的交叉前沿论文数
  featuredTop: 5, // 取前 N 篇生成精读
  // 「只命中前沿专属分类、没有基础领域」的交叉论文，回退到就近的基础领域，确保也在原领域出现。
  fallback: [
    { cats: ["cs.ET", "cs.AR", "eess.SP"], field: "ml" },
    { cats: ["physics.app-ph", "cond-mat.mes-hall", "cond-mat.mtrl-sci"], field: "optics" },
    { cats: ["physics.bio-ph"], field: "bio" },
  ],
};

// 交叉信号「分组」：一篇论文按分类/关键词归入若干信号组；命中 >=2 个强组合即判为前沿。
export const FRONTIER_GROUPS = {
  ai: {
    cats: ["cs.LG", "cs.CV", "cs.CL", "cs.AI", "cs.NE", "stat.ML"],
    kw: [
      "deep learning", "neural network", "machine learning", "transformer",
      "large language model", "reinforcement learning", "diffusion model",
      "foundation model", "artificial intelligence", "generative model",
    ],
  },
  optics: {
    cats: ["physics.optics", "physics.app-ph"],
    kw: [
      "photonic", "optic", "laser", "metasurface", "waveguide", "holograph",
      "silicon photonic", "nanophotonic", "plasmonic", "lidar", "photonics",
    ],
  },
  chip: {
    cats: ["cs.AR", "cs.ET", "cond-mat.mes-hall", "eess.SP"],
    kw: [
      "chip", "semiconductor", "integrated circuit", "accelerator", "memristor",
      "in-memory computing", "neuromorphic", "fpga", "asic", "analog computing",
      "in-sensor", "processing-in-memory", "hardware accelerator", "vlsi", "wafer",
    ],
  },
  bio: {
    cats: ["q-bio.BM", "q-bio.GN", "q-bio.NC", "q-bio.QM", "q-bio.CB", "q-bio.MN", "physics.bio-ph", "physics.med-ph"],
    kw: [
      "protein", "genom", "biolog", "neuron", "medical imag", "clinical",
      "biomolecul", "biophoton", "optogenetic", "brain-computer", "biosensor", "drug discovery",
    ],
  },
  quantum: {
    cats: ["quant-ph"],
    kw: ["quantum"],
  },
  materials: {
    cats: ["cond-mat.mtrl-sci", "cond-mat.mes-hall"],
    kw: ["material", "crystal", "2d material", "nanomaterial", "metamaterial", "perovskite"],
  },
};

// 强组合：命中其中任一对（两组都触发），即判前沿，并给出中文交叉标签。
export const FRONTIER_COMBOS = [
  { groups: ["optics", "ai"], tag: "光学+AI" },
  { groups: ["optics", "chip"], tag: "光学+芯片" },
  { groups: ["ai", "chip"], tag: "AI+芯片" },
  { groups: ["bio", "optics"], tag: "生物+光学" },
  { groups: ["ai", "bio"], tag: "AI+生物" },
  { groups: ["quantum", "ai"], tag: "量子+AI" },
  { groups: ["ai", "materials"], tag: "AI+材料" },
];

// 强关键词：命中即判前沿（即便分组组合未触发），并给出更细的交叉标签。
export const FRONTIER_STRONG_KW = [
  { tag: "光子计算", kw: ["photonic computing", "optical neural network", "photonic neural", "optical computing", "photonic accelerator"] },
  { tag: "硅光", kw: ["silicon photonic", "photonic integrated circuit", "integrated photonic"] },
  { tag: "神经形态", kw: ["neuromorphic", "memristor", "spiking neural network", "in-memory computing", "processing-in-memory", "in-sensor computing"] },
  { tag: "生物光子", kw: ["biophotonic", "optogenetic", "photoacoustic", "optical coherence tomography"] },
  { tag: "脑机接口", kw: ["brain-computer interface", "brain computer interface", "neural interface", "neuroprosthetic"] },
  { tag: "量子机器学习", kw: ["quantum machine learning", "quantum neural network", "variational quantum"] },
  { tag: "DNA存储", kw: ["dna storage", "dna data storage"] },
];
