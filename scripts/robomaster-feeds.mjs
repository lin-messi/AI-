// RoboMaster 算法资料站的配置：分类体系 + 关键词规则 + arXiv 分类 + GitHub 查询 + 限额。
// 论文与开源库共用一套分类（CATEGORIES），通过关键词规则（CATEGORY_RULES）做多标签归类。

// —— 分类体系（按优先级排序，便于展示时分组与高亮）——
export const CATEGORIES = [
  { key: "aim", label_zh: "自瞄 / 目标检测", label_en: "Auto-Aim / Detection" },
  { key: "rune", label_zh: "能量机关", label_en: "Power Rune" },
  { key: "slam", label_zh: "SLAM / 建图", label_en: "SLAM & Mapping" },
  { key: "nav", label_zh: "导航 / 决策", label_en: "Navigation & Decision" },
  { key: "planning", label_zh: "路径规划", label_en: "Path Planning" },
  { key: "rl", label_zh: "强化学习", label_en: "Reinforcement Learning" },
  { key: "radar", label_zh: "雷达 / 全场定位", label_en: "Radar & Localization" },
  { key: "sim", label_zh: "仿真 / 平台", label_en: "Simulation & Platform" },
  { key: "other", label_zh: "其他", label_en: "Other" },
];

// —— 关键词规则：命中任一关键词即归入该分类（多标签）。
// 关键词统一小写匹配（中文原样匹配）。尽量覆盖 RoboMaster 相关视觉/机器人术语。
export const CATEGORY_RULES = [
  {
    key: "aim",
    kw: [
      "auto-aim", "auto aim", "autoaim", "armor plate", "armor detection",
      "armor recognition", "light bar", "object detection", "yolo", "detr",
      "instance segmentation", "keypoint", "pose estimation", "ekf tracking",
      "target tracking", "ballistic", "anti-spin", "anti-top", "gimbal",
      "vision", "computer vision", " cv ", "_cv", "-cv",
      "自瞄", "装甲板", "灯条", "目标检测", "弹道", "反陀螺", "击打",
      "视觉", "云台", "上位机", "步兵视觉",
    ],
  },
  {
    key: "rune",
    kw: ["power rune", "energy mechanism", "buff", "windmill", "能量机关", "大符", "符叶", "风车"],
  },
  {
    key: "slam",
    kw: [
      "slam", "lidar odometry", "lio", "visual odometry", "vio", "loop closure",
      "mapping", "point cloud registration", "pose graph", "localization and mapping",
      "建图", "里程计", "定位与建图", "回环",
    ],
  },
  {
    key: "nav",
    kw: [
      "autonomous navigation", "robot navigation", "mobile robot", "decision making",
      "behavior tree", "sentry", "obstacle avoidance", "costmap", "move base", "nav2",
      "导航", "决策", "哨兵", "避障", "行为树",
    ],
  },
  {
    key: "planning",
    kw: [
      "path planning", "motion planning", "trajectory optimization", "a*", "rrt",
      "hybrid a", "teb", "dwa", "global planner", "local planner",
      "路径规划", "轨迹优化", "运动规划",
    ],
  },
  {
    key: "rl",
    kw: [
      "reinforcement learning", "deep reinforcement", "policy gradient", "ppo", "sac",
      "dqn", "multi-agent reinforcement", "marl", "sim-to-real", "imitation learning",
      "强化学习", "模仿学习",
    ],
  },
  {
    key: "radar",
    kw: [
      "radar station", "multi-camera", "global localization", "bird's eye view",
      "bev", "re-identification", "multi-object tracking", "mot",
      "雷达", "全场定位", "多目标跟踪", "重识别",
    ],
  },
  {
    key: "sim",
    kw: [
      "simulation", "simulator", "gazebo", "isaac", "mujoco", "digital twin",
      "ros2", "ros 2", "embedded", "stm32", "real-time control",
      "development board", "firmware", "sdk", "开发板", "固件", "工具链",
      "仿真", "数字孪生", "嵌入式", "下位机",
    ],
  },
];

// —— 论文纳入过滤 ——
// arXiv 单次合并查询的分类（机器人 / 视觉 / 机器学习）。
export const ARXIV_CATS = ["cs.RO", "cs.CV", "cs.LG"];

// 论文必须命中至少一个「主题关键词」（与 RoboMaster 算法强相关的视觉/机器人主题）。
export const PAPER_TOPIC_KW = [
  "object detection", "instance segmentation", "keypoint detection", "pose estimation",
  "multi-object tracking", "re-identification",
  "slam", "visual odometry", "lidar odometry", "loop closure", "localization and mapping",
  "autonomous navigation", "robot navigation", "mobile robot", "obstacle avoidance",
  "path planning", "motion planning", "trajectory optimization",
  "reinforcement learning", "imitation learning", "sim-to-real",
  "robomaster", "armor", "aerial robot", "quadruped", "manipulation",
];

// 论文还需具备「机器人/自主」语境，避免纯图像分类等无关 cs.CV/cs.LG 论文混入。
export const PAPER_CTX_KW = [
  "robot", "robotic", "autonomous", "navigation", "slam", "mobile", "manipulation",
  "drone", "uav", "aerial", "quadruped", "legged", "control", "perception",
  "real-world", "real-time", "embodied", "agent",
];

// —— GitHub 开源库查询 ——
// 多条查询合并去重，覆盖 RoboMaster 直接相关 + 通用机器人算法关键词。
export const GITHUB_QUERIES = [
  "robomaster in:name,description,readme",
  "topic:robomaster",
  "rm_vision OR rm_auto_aim OR rmcv",
  "装甲板 OR 自瞄 OR 能量机关",
  "robomaster sentry navigation",
  "robomaster radar",
];

// 开源库相关性白名单：GitHub 默认会搜索 README，导致仅在 README 里提到关键词、
// 实则无关的高星库（如 funNLP、awesome-robotics）也被带进来。
// 因此要求 名称/简介/标签 命中以下「专属性强」的 RoboMaster 关键词之一，
// 才认定确实与 RoboMaster 相关——刻意只用区分度高的词，避免 ros/robot 等通用词误伤。
export const REPO_RELEVANCE_KW = [
  "robomaster", "robo master", "rm_vision", "rm_auto_aim", "rm_detector",
  "rmvision", "rmcv", "rmoss", "rm_serial", "rm_nav", "robomasters",
  "armor plate", "armor detect", "auto-aim", "auto aim", "autoaim", "power rune",
  "装甲板", "灯条", "自瞄", "能量机关", "符叶", "上位机视觉", "步兵视觉", "雷达站",
];

// 开源库黑名单：「自瞄 / auto-aim」等词与 FPS 游戏外挂高度重合，
// 命中以下游戏/外挂相关词的库一律剔除（这些与 RoboMaster 比赛无关）。
export const REPO_BLOCK_KW = [
  "csgo", "cs:go", "cs2", "valorant", "apex", "pubg", "fortnite", "overwatch",
  "deltaforce", "delta force", "aimbot", "aim assist", "aimassist", "triggerbot",
  "wallhack", "esp hack", "game cheat", "cheating", "cheat",
  "self-aiming", "self aiming", "self-aim", "ai自瞄", "ai 自瞄", "ai aim",
  "外挂", "游戏辅助", "辅助瞄准", "fps游戏", "吃鸡", "三角洲", "穿越火线",
];

// —— 限额 ——
export const PAPERS_MAX = 30; // 每次保留论文上限（按热度排序后截断）
export const REPOS_MAX = 50; // 每次保留开源库上限（用户指定 50 个/次）
export const RECENT_DAYS_PAPERS = 14; // 仅保留近 N 天论文
export const REPO_MIN_STARS = 10; // 开源库最低星标
export const FEATURED_TOP = 4; // 论文中标记为精选（生成精读）的数量
export const TRANSLATE_TITLE_TOP = 20; // 预翻译标题的论文数量
