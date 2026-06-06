// 相关度评分（需求3）：离线在抓取时算好，写入 relevance 字段，前端直接排序。
// 论文：关键词三档加权命中 + 顶会加权（Q32/Q36）。
// 开源库：关键词三档命中 + topic 含 robomaster + 星标轻量加权（Q33）。
import { RELEVANCE_WEIGHTS, RELEVANCE_TIER_SCORE } from "./robomaster-feeds.mjs";

// 统计三档关键词命中得分（每词命中只计一次，避免长文堆词刷分）。
function keywordScore(text) {
  const lower = (text || "").toLowerCase();
  let score = 0;
  for (const tier of ["high", "mid", "low"]) {
    const per = RELEVANCE_TIER_SCORE[tier];
    for (const kw of RELEVANCE_WEIGHTS[tier]) {
      if (lower.includes(kw.toLowerCase())) score += per;
    }
  }
  return score;
}

// 论文相关度：关键词得分 + 顶会权重（命中顶会额外加分）。
export function scorePaperRelevance(p) {
  const text = `${p.title_en || ""} ${p.title_zh || ""} ${p.abstract_en || ""} ${p.abstract_zh || ""}`;
  let score = keywordScore(text);
  if (p.conf) score += (p.confWeight || 0);
  return score;
}

// 开源库相关度：关键词得分 + robomaster 专属 topic 加分 + 星标 log 轻量加权。
export function scoreRepoRelevance(r) {
  const text = `${r.full_name || ""} ${r.description_en || ""} ${r.description_zh || ""} ${r.highlight_zh || ""} ${(r.topics || []).join(" ")}`;
  let score = keywordScore(text);
  const topics = (r.topics || []).map((x) => String(x).toLowerCase());
  if (topics.includes("robomaster")) score += 5;
  // 星标 log 加权（≤约5分），仅作轻量 tie-break，不让大库压过强相关小库。
  score += Math.min(5, Math.log10((r.stars || 0) + 1));
  return Math.round(score * 100) / 100;
}
