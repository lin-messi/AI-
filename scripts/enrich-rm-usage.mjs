// RM 用途评估：依据 data/rm-rules.json（赛事规则提炼）为论文 / 通用利器库生成
//   rm = { usage: 用途建议(中文), task: 对应赛事任务(中文), task_id, value: "high"|"mid"|"low" }
// 仅对缺少 rm 字段的新条目增量生成（成本随新内容增长，不重算历史条目）。
// 规则每年更新后（npm run rules:build），新抓取条目会自动按新规则评估。
import { getAIConfig, chatJSONWithRetry } from "./ai.mjs";
import { RM_RULES } from "./robomaster-feeds.mjs";

const BATCH = 8;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// 紧凑的赛事任务清单，作为评估上下文喂给模型。
function rulesContext() {
  const tasks = RM_RULES?.tasks || [];
  const lines = tasks.map(
    (t) => `- ${t.name_zh}（id=${t.id}）：${(t.desc_zh || "").slice(0, 70)}`
  );
  const season = RM_RULES?.season ? `赛季 ${RM_RULES.season}` : "";
  return `${season} RoboMaster 算法相关任务：\n${lines.join("\n")}`;
}

const VALID_TASK_IDS = new Set((RM_RULES?.tasks || []).map((t) => t.id));
const TASK_NAME_BY_ID = new Map((RM_RULES?.tasks || []).map((t) => [t.id, t.name_zh]));

function buildMessages(batch, kind) {
  const isPaper = kind === "paper";
  const payload = batch.map((it, idx) =>
    isPaper
      ? {
          i: idx,
          title: it.title_zh || it.title_en || "",
          abstract: (it.abstract_zh || it.abstract_en || "").slice(0, 600),
        }
      : {
          i: idx,
          name: it.full_name,
          desc: (it.description_zh || it.description_en || "").slice(0, 300),
          topics: it.topics || [],
        }
  );

  const what = isPaper ? "学术论文（含标题与摘要）" : "通用开源项目（含名称、简介、标签）";
  const sys =
    "你是 RoboMaster 战队的算法负责人，熟悉自瞄、能量机关、哨兵导航决策、雷达全场定位、飞镖、工程视觉装配、强化学习与仿真等环节。" +
    "你的任务是判断给定材料对 RoboMaster 比赛的可用性。只输出 JSON，不要多余文字。";

  const user = `${rulesContext()}

下面是若干${what}。请结合上面的赛事任务，为每条判断它对 RoboMaster 比赛的用途，生成：
- usage: 中文，1-2 句，说明「具体能怎么用在 RoboMaster 上」（落到具体任务/环节，给出可操作的思路；若几乎用不上就直说关联很弱）
- task_id: 最相关的赛事任务 id（只能从这些里选其一：${[...VALID_TASK_IDS].join(" / ") || "无"}；若都不相关填 ""）
- value: 实用度，只能是 "high"/"mid"/"low" 之一
    high = 直接对应某核心任务、拿来就能显著帮上忙；
    mid = 相关但需改造，或只是支撑性工具/思路参考；
    low = 关联很弱、基本用不上。

要求：实事求是、不夸大；judgement 要严格，大多数通用成果应是 mid 或 low，只有真正切题的才给 high。
严格返回 JSON：{"results":[{"i":0,"usage":"","task_id":"","value":"mid"}, ...]}

输入数据：
${JSON.stringify(payload)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

function normValue(v) {
  const s = String(v || "").toLowerCase();
  return s === "high" || s === "mid" || s === "low" ? s : "mid";
}

// 为缺少 rm 的条目生成 RM 用途评估。kind: "paper" | "repo"
export async function assessRMUsage(items, kind = "paper") {
  const { enabled, model } = getAIConfig();
  if (!enabled) {
    console.log("（未配置 AI_API_KEY，跳过 RM 用途评估）");
    return 0;
  }
  if (!RM_RULES || !(RM_RULES.tasks || []).length) {
    console.log("（缺少 data/rm-rules.json，跳过 RM 用途评估）");
    return 0;
  }
  const todo = items.filter((it) => !it.rm || !it.rm.usage);
  if (!todo.length) return 0;
  console.log(`使用 ${model} 评估 ${todo.length} 条的 RoboMaster 用途（${kind}）…`);
  const batches = chunk(todo, BATCH);
  let done = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildMessages(batch, kind));
      for (const r of json.results || []) {
        const it = batch[r.i];
        if (!it) continue;
        const taskId = VALID_TASK_IDS.has(r.task_id) ? r.task_id : "";
        it.rm = {
          usage: r.usage || "",
          task_id: taskId,
          task: taskId ? TASK_NAME_BY_ID.get(taskId) || "" : "",
          value: normValue(r.value),
        };
      }
      done += batch.length;
      console.log(`  RM 用途批次 ${b + 1}/${batches.length} 完成`);
    } catch (e) {
      console.log(`  RM 用途批次 ${b + 1} 失败：${e.message}`);
    }
  }
  return done;
}
