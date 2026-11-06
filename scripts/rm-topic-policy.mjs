// Capability evidence for RM recommendations. Source descriptions, rather than generated
// translations or usage suggestions, decide eligibility. Popularity never creates relevance.
const YEAR = 365.25 * 86400000;
const normalize = value => String(value || "").toLowerCase().replace(/[‐‑–—_-]/g, " ").replace(/\s+/g, " ");
const httpURL = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; } };
const timestamp = (value, now) => { const time = value ? Date.parse(value) : NaN; return Number.isFinite(time) && time <= now ? time : null; };
// Publication and code-push dates must come from the provider. Missing/invalid/future
// source dates stay unknown; a metadata refresh or first observation cannot replace them.
export function validSourceDate(value, now = Date.now()) {
  if (typeof value !== "string" || !/\b[12]\d{3}\b/.test(value)) return "";
  const time = timestamp(value, now);
  if (time === null) return "";
  const calendar = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$|\s)/);
  if (calendar && new Date(`${calendar[1]}T00:00:00Z`).toISOString().slice(0, 10) !== calendar[1]) return "";
  return new Date(time).toISOString();
}
export function sourceAgeHours(value, now = Date.now()) {
  const valid = validSourceDate(value, now);
  return valid ? (now - Date.parse(valid)) / 3600000 : Infinity;
}
const crossrefURL = value => {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "api.crossref.org"
    && url.pathname.startsWith("/works/") && url.pathname.length > 7 && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
};
export const TOPIC_DEFINITIONS = [
  { key: "aim", label_zh: "检测与目标跟踪", label_en: "Detection & Tracking" },
  { key: "rune", label_zh: "能量机关", label_en: "Power Rune" },
  { key: "slam", label_zh: "定位与建图", label_en: "Localization & Mapping" },
  { key: "nav", label_zh: "地面自主导航", label_en: "Ground Navigation" },
  { key: "planning", label_zh: "运动规划", label_en: "Motion Planning" },
  { key: "radar", label_zh: "全场目标定位", label_en: "Field Target Localization" },
  { key: "control", label_zh: "机器人控制", label_en: "Robot Control" },
  { key: "assembly", label_zh: "视觉伺服与装配", label_en: "Visual Servoing & Assembly" },
  { key: "sim", label_zh: "机器人仿真与工具", label_en: "Robot Simulation & Tools" },
  { key: "rl", label_zh: "机器人策略学习", label_en: "Robot Policy Learning" },
];

// Stable capability mappings for primary implementations whose API description can be empty.
// These mappings establish subject matter, not maintenance, citation counts or deployment readiness.
const PROJECT_TOPICS = {
  "chenjunnn/rm_auto_aim": ["aim"], "chenjunnn/rm_vision": ["aim"],
  "robomaster/roborts": ["nav", "planning"],
  "learnsyslab/safe-control-gym": ["control", "sim", "rl"],
  "ros-navigation/navigation2": ["nav", "planning", "control"],
  "behaviortree/behaviortree.cpp": ["nav"], "ompl/ompl": ["planning"],
  "ros-controls/ros2_control": ["control"], "acados/acados": ["control"],
  "moveit/moveit2": ["assembly", "planning"], "aprilrobotics/apriltag": ["assembly"],
  "ultralytics/ultralytics": ["aim"], "wongkinyiu/yolov7": ["aim"],
  "meituan/yolov6": ["aim"], "megvii-basedetection/yolox": ["aim"],
  "open-mmlab/mmdetection": ["aim"], "open-mmlab/mmyolo": ["aim"],
  "idea-research/groundingdino": ["aim"], "facebookresearch/segment-anything": ["aim"],
  "ifzhang/bytetrack": ["aim", "radar"], "mikel-brostrom/boxmot": ["aim", "radar"],
  "hku-mars/fast_lio": ["slam"], "hku-mars/fast-lio": ["slam"],
  "hku-mars/fast-livo2": ["slam"], "tixiaoshan/lio-sam": ["slam"],
  "uz-slamlab/orb_slam3": ["slam"], "cartographer-project/cartographer": ["slam"],
  "hkust-aerial-robotics/vins-fusion": ["slam"], "hku-mars/r3live": ["slam"],
  "michaelgrupp/evo": ["slam"], "atsushisakai/pythonrobotics": ["planning", "control"],
  "isaac-sim/isaaclab": ["sim", "rl"], "google-deepmind/mujoco": ["sim"],
  "dlr-rm/stable-baselines3": ["rl"], "farama-foundation/gymnasium": ["rl"],
  "pytorch/rl": ["rl"], "uzh-rpg/rpg_mpc": ["control"],
  "px4/px4-autopilot": ["control"], "mavlink/mavsdk": ["control"],
  "bitcraze/crazyflie-firmware": ["control"], "imrclab/crazyswarm2": ["control"],
  "uzh-rpg/agilicious": ["control"], "zju-fast-lab/fast-drone-250": ["control", "planning"],
  "zju-fast-lab/ego-planner": ["planning"], "zju-fast-lab/ego-planner-swarm": ["planning"],
  "hkust-aerial-robotics/fast-planner": ["planning"],
  "ethz-asl/mav_trajectory_generation": ["planning"],
};
// Keep repository IDs literal: punctuation in a GitHub ID is meaningful.
const projectTopics = item => PROJECT_TOPICS[String(item?.full_name || item?.id || "").toLowerCase()] || [];
export function topicSourceText(item) {
  if (typeof item === "string") return normalize(item);
  const original = [item?.title_en, item?.abstract_en, item?.full_name, item?.description_en, ...(item?.topics || [])].filter(Boolean).join(" ");
  // Chinese-only primary repositories remain searchable. Generated highlights are never evidence.
  return normalize(original || [item?.title_zh, item?.abstract_zh, item?.description_zh].filter(Boolean).join(" "));
}

export function rmTopicProfile(item, kind = "paper", now = Date.now()) {
  const text = topicSourceText(item);
  const primary = normalize(typeof item === "string" ? item : [item?.title_en, item?.full_name, item?.description_en].filter(Boolean).join(" "));
  // The abstract's opening states the actual problem when a title is generic. Do not
  // let "robot navigation" disguise a surgical task; omit later related-work comparisons.
  const subject = normalize(`${primary} ${typeof item === "object" ? String(item?.abstract_en || "").slice(0, 600) : ""}`);
  const repo = kind === "repo";
  const direct = /\brobomaster\b|robo master|\brm (?:auto aim|vision|detector|navigation|radar)\b|自瞄|装甲板|能量机关|雷达站/.test(text);
  const robot = /\brobots?\b|\brobotic|\bros2?\b|quadrotor|quadcopter|\buavs?\b|\bdrones?\b|mobile platform|wheeled|机械臂|机器人|无人机|底盘/.test(text)
    || /lidar|激光雷达/.test(text) && /path planning|obstacle avoidance|路径规划|避障/.test(text);
  const aerial = /quadrotor|quadcopter|multirotor|micro aerial vehicle|\buavs?\b|\bdrones?\b|aerial robot|无人机|四旋翼/.test(text);
  const ground = /ground robot|mobile robot|wheeled|differential drive|omnidirectional (?:drive|mobile|robot|chassis)|sentry|地面机器人|轮式|哨兵|底盘/.test(text);
  const known = projectTopics(item);
  const excludedDomain = /underwater|\bauv\b|robotic feeding|fish tracking|fish schools|fish swarm|bird tracking|wildlife|endovascular|5g|6g|integrated sensing and communication|isac|wireless resource|communication resource|head pose|human pose|hand pose|person re identification|pedestrian re identification|human object interaction|\bhoi\b|photograph|image aesthetic|image generation|text to image|diffusion alignment|medical|surgical|clinical|blood vessels?|\barteries\b|血管|手术|临床|endoscop|neurointervention|ultrasonic laser|remote sensing|satellite image|humanoid|dexterous|in hand manipulation|robotic thumb|flapping wing|bipedal|quadruped|legged aerial|trotting|continuum robot|fixed wing interception|aerial.*teleoperation|teleoperation.*aerial|service robot.*teleoperation/.test(subject);
  const collection = /(?:^|\/)awesome[\s/-]|curated list|comprehensive.*(?:hub|list)|papers.*models.*datasets|教程|资料汇总/.test(primary);
  const topics = new Set(known);
  const add = (key, test) => { if (test) topics.add(key); };
  if (!excludedDomain || direct || known.length) {
    const tracking = /multi (?:object|target) tracking|target tracking|object tracking|tracking by detection|目标跟踪|多目标跟踪/.test(text);
    const realtimeVision = /real time|low latency|small object|tiny object|occlusion|embedded|efficient|高速|实时|小目标|低延迟/.test(text);
    add("aim", /auto aim|autoaim|armor (?:plate|detect|recognition)|anti spin|anti top|ballistic|gimbal|自瞄|装甲板|弹道|反陀螺|云台/.test(text)
      || direct && /vision|视觉|dart|飞镖/.test(text)
      || tracking && (robot || realtimeVision)
      || /object detection|keypoint detection|目标检测/.test(text) && realtimeVision && robot);
    add("rune", /power rune|energy rune|rune detection|能量机关|大符|符叶/.test(text) || direct && /rotating target|windmill|旋转靶/.test(text));
    add("slam", /\bslam\b|visual (?:inertial )?odometry|lidar (?:inertial )?odometry|loop closure|point cloud registration|simultaneous localization and mapping|视觉惯性|激光惯性|里程计|回环/.test(text)
      && !/data collection|manipulation interface|数据采集/.test(primary));
    add("nav", /autonomous navigation|robot navigation|sentry navigation|obstacle avoidance|costmap|behavior tree|nav2|navigation2|自主导航|避障|行为树/.test(text) && (ground || direct || robot && !aerial));
    add("planning", /motion planning|path planning|trajectory optimization|trajectory plann|运动规划|路径规划|轨迹优化|ego planner/.test(text) && (robot || direct)
      || aerial && /obstacle|navigation polic|end to end.*navigation|避障|航迹/.test(text));
    add("radar", /radar station|robomaster radar|雷达站|全场定位/.test(text)
      || direct && /(?:lidar camera|camera lidar|相机).{0,35}(?:calibrat|标定)|面向雷达/.test(text)
      || tracking && /multi camera|camera calibration|camera lidar|field localization|ground plane|homography|triangulation|多相机|相机标定|地面平面|单应性|三角定位/.test(text));
    add("control", /model predictive control|\bmpc\b|control barrier function|pid control|feedback control|trajectory tracking|attitude control|flight control|gimbal control|motor control|底盘控制|云台控制|电机控制|模型预测控制/.test(text) && (robot || direct)
      || direct && /embedded|firmware|control code|control board|mcu|stm32|嵌入式|下位机|固件/.test(text));
    add("assembly", /visual servoing|robotic assembly|peg in hole|fiducial tag|apriltag|视觉伺服|视觉装配|科技核心|视觉标签/.test(text)
      || /(?:6d|6 dof|rigid object|object) pose (?:estimation|tracking)|物体位姿/.test(text) && /manipulat|assembly|industrial|robot|装配|机械臂/.test(text));
    add("sim", /simulator|simulation (?:platform|environment|framework)|gazebo|mujoco|isaac (?:lab|sim)|机器人仿真平台/.test(primary) && (robot || direct)
      || direct && /simulator|simulation|unity|场地资源|地图包/.test(text));
    add("rl", /reinforcement learning|imitation learning|policy learning|强化学习|模仿学习/.test(text) && (direct || ground || /motion planning|path planning|trajectory tracking|robot control|visual servoing|multi robot coordination/.test(subject)));
  }
  if (collection) topics.clear();
  const relevant = topics.size > 0 && (!excludedDomain || direct || known.length > 0);
  const keys = relevant ? [...topics] : [];
  const survey = /\bsurvey\b|systematic review|综述/.test(primary);
  const simulation = /simulator|simulation platform|simulation environment|仿真平台|仿真环境/.test(primary)
    || repo && /pybullet.*environment|gymnasium.*environment|simulate/.test(text);
  const tool = repo && (known.length > 0 || /library|package|framework|toolkit|driver|firmware|implementation|ros 2 nodes|软件包|框架|固件/.test(text));
  const hardware = /hardware (?:experiment|demonstrat|implement)|real (?:robot|world experiment|world test|world deploy)|flight (?:test|experiment)|physical (?:robot|experiment)|testbed|prototype|实机|飞行实验|硬件实验/.test(text);
  const quality = !relevant ? "excluded" : survey ? "survey" : simulation ? "simulation" : repo ? tool ? "implementation" : "reference" : hardware ? "implementation" : "method";
  const published = timestamp(repo ? item?.created_at : item?.published_at, now);
  const updated = timestamp(repo ? item?.pushed_at : item?.published_at, now);
  const mature = published !== null && now - published >= 2 * YEAR;
  const impact = item?.impact;
  const checked = timestamp(repo ? item?.metadata_fetched_at : impact?.checked_at, now);
  const stars = Number.isSafeInteger(item?.stars) && item.stars >= 0 ? item.stars : null;
  const citations = impact?.source === "Crossref" && Number.isSafeInteger(impact.citations) && impact.citations >= 0 && crossrefURL(impact.source_url) && checked !== null ? impact.citations : null;
  const maintainedEvidence = repo && checked !== null && httpURL(item?.url) && stars !== null;
  const established = relevant && mature && !["simulation", "survey", "reference"].includes(quality)
    && (repo ? maintainedEvidence && stars >= 200 : citations !== null && citations >= 30);
  const recent = updated !== null && now - updated <= YEAR;
  const lane = established ? "established" : relevant && recent && !survey ? "recent" : "reference";
  const labels = keys.map(key => TOPIC_DEFINITIONS.find(topic => topic.key === key));
  const role = direct ? "直接面向RoboMaster的实现或研究" : keys.length ? `${labels.map(t => t.label_zh).join("、")}的可迁移方法或工具` : collection ? "资源目录，尚非可复现实现" : "缺少具体RM能力证据";
  const limitations = [];
  if (direct && relevant) limitations.push("RM项目仍需核对2027赛季的目标外观、地图、硬件和裁判协议；历史赛季代码不代表已适配新规则");
  if (!direct && relevant) limitations.push("通用方法需在RM场地、传感器与算力条件下验证，不能视为可直接参赛的完整系统");
  if (keys.includes("aim") && !direct) limitations.push("未证明装甲板/点阵屏幕识别、反陀螺预测与弹道闭环");
  if (keys.includes("radar") && !direct) limitations.push("跟踪或多相机能力不等于完成RM全场标定、敌我识别和裁判数据链路");
  if (keys.includes("assembly") && !direct) limitations.push("须验证科技核心标签、刚体位姿与装配精度，人体姿态不能替代物体位姿");
  if (keys.includes("slam")) limitations.push("里程计、配准或建图不等于完整导航；须验证退化场景、重定位、传感器与标定条件");
  if (keys.includes("rl")) limitations.push("策略学习框架不自带RM战术环境、奖励函数或已验证策略");
  if (aerial && relevant) limitations.push("核对载荷、室内定位和通信前提；外部动捕、GPS或Wi-Fi条件不能直接搬入赛场");
  if (quality === "simulation") limitations.push("仿真能力不代表已完成实机验证");
  if (!repo && quality === "method") limitations.push("当前元数据只支持方法参考，未据此核验完整代码或实机复现");
  if (repo && !item?.license || repo && /NOASSERTION|NONE/.test(item?.license)) limitations.push("收录不等于确认可自由复用，须核对仓库许可");
  if (repo && item?.archived) limitations.push("仓库已归档，部署需自行维护");
  if (repo && updated !== null && now - updated > YEAR) limitations.push("超过一年未有代码更新，兼容性与依赖需复核");
  let score = relevant ? (direct ? 37 : 24) + Math.min(6, keys.length * 2) : 0;
  if (quality === "simulation" || quality === "survey" || quality === "reference") score = Math.max(0, score - 8);
  if (quality === "implementation") score += 4;
  if (lane === "recent") score += 6;
  if (lane === "established") score += 7;
  const evidenceURL = httpURL(item?.url || item?.html_url);
  let metric;
  if (relevant && maintainedEvidence) metric = { label: "GitHub Stars", value: stars, source: "GitHub", source_url: evidenceURL, checked_at: item.metadata_fetched_at };
  else if (relevant && citations !== null) metric = { label: "Crossref 引用计数", value: citations, source: "Crossref", source_url: httpURL(impact.source_url), checked_at: impact.checked_at };
  return { scope: "rm", relevant, topics: labels, lane, score, quality,
    reason_zh: `${role}；${lane === "recent" ? repo ? "近一年有代码更新" : "近一年发表" : lane === "established" ? "至少两年历史，具有可查询的公开关注度或引用证据" : "参考资料，近期或长期影响证据不足"}`,
    limitations_zh: limitations.join("；"), evidence_url: evidenceURL, ...(metric ? { metric } : {}) };
}

export function isRMTopicRelevant(item, kind = item?.full_name ? "repo" : "paper") {
  return rmTopicProfile(item, kind).relevant;
}

export function topicTaskIds(item) {
  const profile = rmTopicProfile(item, item?.full_name ? "repo" : "paper");
  const keys = profile.topics.map(topic => topic.key);
  const text = topicSourceText(item);
  const direct = /robomaster|robo master|自瞄|装甲板|能量机关|雷达站/.test(text);
  const ids = new Set();
  if (keys.includes("aim") && /auto aim|autoaim|armor|gimbal|ballistic|自瞄|装甲板|云台|弹道/.test(text)) ids.add("autoaim");
  if (keys.includes("rune")) ids.add("rune");
  if (keys.includes("nav") || keys.includes("slam") && /ground|mobile robot|wheeled|sentry|地面|哨兵/.test(text)) ids.add("sentry");
  if (keys.includes("radar")) ids.add("radar");
  if (keys.includes("assembly")) ids.add("engineer");
  if (keys.includes("rl") && /multi robot|multi agent.*(?:robot|tactical|coordination)|tactical|战术|多机协同/.test(text)) ids.add("strategy");
  if (keys.includes("sim") && (direct || /robot|机器人/.test(text))) ids.add("sim");
  if (direct && /dart|飞镖/.test(text)) ids.add("dart");
  return [...ids];
}
