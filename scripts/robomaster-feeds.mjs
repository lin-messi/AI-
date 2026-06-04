// RoboMaster 算法资料站的配置：分类体系 + 关键词规则 + arXiv 分类 + GitHub 查询 + 限额。
// 论文与开源库共用一套分类（CATEGORIES），通过关键词规则（CATEGORY_RULES）做多标签归类。
//
// 注：以下关键词为长期稳定的基础集；模块加载时会再叠加 data/rm-rules.json 里赛事规则
// 提炼出的关键词（见文件底部），使检索范围随每年新规则自动微调。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// ====== 通用利器库（General）======
// 与 RM 原生库分开维护：收录「本身不带 robomaster，但能直接用于 RM 任务」的通用优质库，
// 例如 YOLO（装甲板检测）、FAST-LIO（哨兵建图）、Nav2（自主导航）、Isaac Lab（RL 仿真）。
// 来源 = 机构/仓库白名单（人工确保经典必收）+ 主题搜索补充（自动发现新项目，严格门槛）。

// 白名单：直接按 owner/repo 收录（抓取时取其实时星标/简介/标签）。按经验精选的公认优质项目。
export const GENERAL_WHITELIST = [
  // —— 感知：检测 / 分割 / 跟踪 ——
  "ultralytics/ultralytics",
  "WongKinYiu/yolov7",
  "meituan/YOLOv6",
  "Megvii-BaseDetection/YOLOX",
  "open-mmlab/mmdetection",
  "open-mmlab/mmyolo",
  "IDEA-Research/GroundingDINO",
  "facebookresearch/segment-anything",
  "ifzhang/ByteTrack",
  "mikel-brostrom/boxmot",
  // —— 定位：SLAM / 里程计 / 建图 ——
  "hku-mars/FAST_LIO",
  "hku-mars/FAST-LIVO2",
  "TixiaoShan/LIO-SAM",
  "gaoxiang12/slam_in_autonomous_driving",
  "UZ-SLAMLab/ORB_SLAM3",
  "cartographer-project/cartographer",
  // —— 规划与导航：Nav2 / 路径规划 / 控制 ——
  "ros-navigation/navigation2",
  "ompl/ompl",
  "ros-controls/ros2_control",
  "ZJU-FAST-Lab/ego-planner",
  "HKUST-Aerial-Robotics/Fast-Planner",
  "AtsushiSakai/PythonRobotics",
  // —— 学习与仿真：RL / sim-to-real ——
  "isaac-sim/IsaacLab",
  "DLR-RM/stable-baselines3",
  "google-deepmind/mujoco",
  "Farama-Foundation/Gymnasium",
  "leggedrobotics/legged_gym",
];

// 主题搜索补充：偏机器人/视觉的 topic + 星标门槛，自动发现白名单之外的新项目。
export const GENERAL_TOPIC_QUERIES = [
  "topic:object-detection topic:robotics",
  "topic:slam",
  "topic:lidar-slam",
  "topic:path-planning",
  "topic:motion-planning",
  "topic:multi-object-tracking",
  "topic:reinforcement-learning topic:robotics",
  "topic:ros2 topic:navigation",
];

// 主题搜索结果的相关性闸门：名称/简介/标签需命中以下机器人/视觉语境词之一，
// 否则视为与 RM 无关（纯 NLP/纯前端等）剔除。配合 REPO_BLOCK_KW 黑名单使用。
export const GENERAL_RELEVANCE_KW = [
  "robot", "robotic", "ros", "ros2", "autonomous", "navigation", "slam",
  "lidar", "odometry", "mapping", "localization", "perception", "detection",
  "segmentation", "tracking", "object detection", "pose estimation", "keypoint",
  "path planning", "motion planning", "trajectory", "planner", "control",
  "reinforcement learning", "sim-to-real", "manipulation", "drone", "uav",
  "quadruped", "legged", "embodied", "gimbal", "yolo",
];

export const GENERAL_MIN_STARS = 200; // 通用库最低星标（用户指定 ≥200）
export const GENERAL_ACTIVE_DAYS = 365; // 仅保留近 N 天有提交的库（白名单不受此限）
export const GENERAL_MAX = 40; // 通用库池上限（展示 30-40）

// —— 限额 ——
export const PAPERS_MAX = 30; // 每次保留论文上限（按热度排序后截断）
export const REPOS_MAX = 50; // 每次保留开源库上限（用户指定 50 个/次）
export const RECENT_DAYS_PAPERS = 14; // 仅保留近 N 天论文
export const REPO_MIN_STARS = 10; // 开源库最低星标
export const FEATURED_TOP = 4; // 论文中标记为精选（生成精读）的数量
export const TRANSLATE_TITLE_TOP = 20; // 预翻译标题的论文数量

// ====== 叠加赛事规则驱动的检索关键词（data/rm-rules.json）======
// 规则文件由 npm run rules:build 从官方手册提炼。这里把它的 searchKeywords 与各任务的
// 英文关键词并入上面的基础集，使「论文/开源」的检索范围随新赛季规则自动调整。
const __feedsDir = path.dirname(fileURLToPath(import.meta.url));

function loadRMRules() {
  try {
    const p = path.join(__feedsDir, "..", "data", "rm-rules.json");
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export const RM_RULES = loadRMRules();

function mergeUnique(target, extra) {
  if (!Array.isArray(extra)) return;
  const seen = new Set(target.map((s) => String(s).toLowerCase()));
  for (const raw of extra) {
    const v = String(raw || "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      target.push(v);
      seen.add(v.toLowerCase());
    }
  }
}

if (RM_RULES) {
  const sk = RM_RULES.searchKeywords || {};
  mergeUnique(PAPER_TOPIC_KW, sk.paperTopic);
  mergeUnique(PAPER_CTX_KW, sk.paperCtx);
  mergeUnique(GITHUB_QUERIES, sk.githubQueries);
  mergeUnique(GENERAL_TOPIC_QUERIES, sk.generalTopics);
  // 任务的英文关键词并入论文主题词，扩大召回（如 anti-spin / windmill / 6dof pose）。
  for (const task of RM_RULES.tasks || []) mergeUnique(PAPER_TOPIC_KW, task.keywords_en);
}
