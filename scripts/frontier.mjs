// 交叉前沿判定与打分。
//   - detectFrontier：按「信号分组 + 强组合 + 强关键词」判断一篇论文是否属于跨学科前沿，并给出中文交叉标签。
//   - fallbackFrontierField：把只命中前沿专属分类、没有基础领域的交叉论文回退到就近基础领域。
//   - scoreFrontier：用便宜的 deepseek-chat 给候选论文打 high/mid/low，过滤掉误判（单学科）的 low。
import {
  FRONTIER,
  FRONTIER_GROUPS,
  FRONTIER_COMBOS,
  FRONTIER_STRONG_KW,
} from "./papers-feeds.mjs";
import { getAIConfig, chatJSONWithRetry } from "./ai.mjs";

const SCORE_BATCH = 15;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function textOf(item) {
  return ((item.title_en || "") + " " + (item.abstract_en || "")).toLowerCase();
}

// 返回命中的信号组集合（如 Set{"ai","optics"}）。
function hitGroups(item) {
  const cats = item.cats || [];
  const text = textOf(item);
  const hits = new Set();
  for (const [g, def] of Object.entries(FRONTIER_GROUPS)) {
    if (def.cats.some((c) => cats.includes(c)) || def.kw.some((k) => text.includes(k))) {
      hits.add(g);
    }
  }
  return hits;
}

// 判定是否前沿交叉，返回 { frontier, crossTag }
export function detectFrontier(item) {
  const text = textOf(item);
  // 1) 强关键词直接命中
  for (const r of FRONTIER_STRONG_KW) {
    if (r.kw.some((k) => text.includes(k))) return { frontier: true, crossTag: r.tag };
  }
  // 2) 信号组的强组合（两组都触发）
  const hits = hitGroups(item);
  for (const c of FRONTIER_COMBOS) {
    if (c.groups.every((g) => hits.has(g))) return { frontier: true, crossTag: c.tag };
  }
  return { frontier: false, crossTag: "" };
}

// 交叉论文若没有基础领域，回退到就近基础领域（保证它也出现在原领域）。
export function fallbackFrontierField(item) {
  const cats = item.cats || [];
  for (const r of FRONTIER.fallback) {
    if (r.cats.some((c) => cats.includes(c))) return r.field;
  }
  return "ml";
}

function buildScoreMessages(batch) {
  const payload = batch.map((p, i) => ({
    i,
    title: p.title_en || "",
    crossTag: p.crossTag || "",
    abstract: (p.abstract_en || "").slice(0, 600),
  }));
  const sys =
    "你是交叉学科科研编辑，判断论文是否属于前沿交叉融合。只输出 JSON，不要多余文字。";
  const user = `判断每篇论文与「前沿交叉学科」的契合度。前沿交叉指：AI+光学+芯片融合（光子计算/硅光/神经形态/在内存计算）、生物+光学（生物光子/光遗传/医学光学成像）、量子+AI、AI+材料、脑机接口、DNA 存储等真正跨两个及以上学科的融合工作。
对每篇给出 value：
- high：典型的跨学科前沿融合（多个学科深度结合）
- mid：部分相关（沾边但不是核心）
- low：其实是单一学科、被关键词误判
严格返回 JSON：{"results":[{"i":0,"value":"high"}, ...]}

输入：
${JSON.stringify(payload)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// 给候选论文写入 p.frontierScore（high/mid/low）。未配置 AI 时直接返回（不打分、不过滤）。
export async function scoreFrontier(papers) {
  const { enabled, model } = getAIConfig();
  if (!enabled || !papers.length) {
    if (!enabled) console.log("（未配置 AI_API_KEY，跳过交叉前沿打分，全部保留）");
    return papers;
  }
  console.log(`使用 ${model} 给交叉前沿候选打分 ${papers.length} 篇…`);
  const batches = chunk(papers, SCORE_BATCH);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const json = await chatJSONWithRetry(buildScoreMessages(batch));
      for (const r of json.results || []) {
        const p = batch[r.i];
        if (p && r.value) p.frontierScore = String(r.value).toLowerCase();
      }
    } catch (e) {
      console.log(`  前沿打分批次 ${b + 1} 失败：${e.message}`);
    }
  }
  return papers;
}
