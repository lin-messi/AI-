// GitHub 项目富化：把英文简介翻成中文，并生成一句话中文亮点。
// 只处理每日推荐的 ~20 条，成本很低；不抓取/翻译 README。
import { getAIConfig, chatJSONWithRetry } from "./ai.mjs";

const BATCH = 10;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function buildMessages(batch) {
  const payload = batch.map((r, idx) => ({
    i: idx,
    name: r.full_name,
    desc: (r.description_en || "").slice(0, 400),
    topics: r.topics || [],
    language: r.language || "",
  }));
  const sys = "你是技术编辑，擅长用通俗中文介绍开源项目。只输出 JSON，不要多余文字。";
  const user = `下面是若干 GitHub 开源项目（含名称、英文简介、主题标签、主语言）。请为每个生成：
- desc_zh: 简介的中文翻译，通顺自然，约 30-80 字；若英文简介为空，则根据项目名/标签合理概括它大概是做什么的
- highlight_zh: 一句话亮点（这个项目最值得关注的点或用途，25 字内）

要求：忠实、不夸大、不杜撰功能；保留专有名词（如 LLM、RAG、Kubernetes、Rust）。
严格返回 JSON：{"results":[{"i":0,"desc_zh":"","highlight_zh":""}, ...]}

输入数据：
${JSON.stringify(payload)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// —— 通用利器库：翻译简介 + 生成「对 RoboMaster 的用途」一句话亮点 ——
function buildGeneralMessages(batch) {
  const payload = batch.map((r, idx) => ({
    i: idx,
    name: r.full_name,
    desc: (r.description_en || "").slice(0, 400),
    topics: r.topics || [],
    language: r.language || "",
  }));
  const sys =
    "你是 RoboMaster 战队的技术导师，熟悉自瞄/装甲板检测、能量机关、哨兵 SLAM、自主导航、雷达全场定位、强化学习等算法。只输出 JSON，不要多余文字。";
  const user = `下面是若干通用开源项目（含名称、英文简介、主题标签、主语言）。这些项目本身不是为 RoboMaster 写的，但能用于 RoboMaster 比赛的算法开发。请为每个生成：
- desc_zh: 简介的中文翻译，通顺自然，约 30-80 字；若英文简介为空，则据项目名/标签合理概括它大概做什么
- highlight_zh: 一句话说明「它能用在 RoboMaster 的什么地方」（具体到自瞄/装甲板检测、能量机关、哨兵建图导航、雷达定位、决策强化学习等场景，30 字内）

要求：忠实、不夸大、不杜撰功能；保留专有名词（如 YOLO、SLAM、ROS2、LiDAR、RL）。
严格返回 JSON：{"results":[{"i":0,"desc_zh":"","highlight_zh":""}, ...]}

输入数据：
${JSON.stringify(payload)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

export async function translateGeneralRepos(repos) {
  const { enabled, model } = getAIConfig();
  if (!enabled) {
    console.log("（未配置 AI_API_KEY，跳过通用库简介/用途生成）");
    return 0;
  }
  const todo = repos.filter((r) => !r.description_zh || !r.highlight_zh);
  if (!todo.length) return 0;
  console.log(`使用 ${model} 生成 ${todo.length} 个通用库的中文简介与 RM 用途…`);
  const batches = chunk(todo, BATCH);
  let done = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildGeneralMessages(batch));
      for (const r of json.results || []) {
        const repo = batch[r.i];
        if (!repo) continue;
        if (r.desc_zh) repo.description_zh = r.desc_zh;
        if (r.highlight_zh) repo.highlight_zh = r.highlight_zh;
      }
      done += batch.length;
      console.log(`  批次 ${b + 1}/${batches.length} 完成`);
    } catch (e) {
      console.log(`  批次 ${b + 1} 失败：${e.message}`);
    }
  }
  return done;
}

export async function translateRepos(repos) {
  const { enabled, model } = getAIConfig();
  if (!enabled) {
    console.log("（未配置 AI_API_KEY，跳过项目简介翻译）");
    return 0;
  }
  const todo = repos.filter((r) => !r.description_zh);
  if (!todo.length) return 0;
  console.log(`使用 ${model} 翻译 ${todo.length} 个项目简介…`);
  const batches = chunk(todo, BATCH);
  let done = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildMessages(batch));
      for (const r of json.results || []) {
        const repo = batch[r.i];
        if (!repo) continue;
        if (r.desc_zh) repo.description_zh = r.desc_zh;
        if (r.highlight_zh) repo.highlight_zh = r.highlight_zh;
      }
      done += batch.length;
      console.log(`  翻译批次 ${b + 1}/${batches.length} 完成`);
    } catch (e) {
      console.log(`  翻译批次 ${b + 1} 失败：${e.message}`);
    }
  }
  return done;
}
