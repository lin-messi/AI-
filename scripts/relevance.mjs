// 相关度评分（需求3）：离线在抓取时算好，写入 relevance 字段，前端直接排序。
// 论文：关键词三档加权命中 + 顶会加权（Q32/Q36）。
// 开源库：关键词三档命中 + topic 含 robomaster + 星标轻量加权（Q33）。
import { RELEVANCE_WEIGHTS, RELEVANCE_TIER_SCORE, RM_RULES } from "./robomaster-feeds.mjs";
import { hasKeyword, taskBonus } from "./rm-recommendation-policy.mjs";
import { isOpticalRelevant, recommendationProfile } from "./optical-policy.mjs";
import { rmTopicProfile } from "./rm-topic-policy.mjs";

// 统计三档关键词命中得分（每词命中只计一次，避免长文堆词刷分）。
function keywordScore(text) {
  const lower = (text || "").toLowerCase();
  let score = 0;
  for (const tier of ["high", "mid", "low"]) {
    const per = RELEVANCE_TIER_SCORE[tier];
    for (const kw of RELEVANCE_WEIGHTS[tier]) {
      if (hasKeyword(lower, kw)) score += per;
    }
  }
  return score;
}

// 论文相关度：关键词得分 + 顶会权重（命中顶会额外加分）。
export function scorePaperRelevance(p) {
  const text = `${p.title_en || ""} ${p.title_zh || ""} ${p.abstract_en || ""} ${p.abstract_zh || ""}`;
  const optical = isOpticalRelevant(p);
  const profile = optical ? recommendationProfile(p, "paper") : rmTopicProfile(p, "paper");
  if (!optical && !profile.relevant) return 0;
  let score = profile.score + Math.min(8, keywordScore(text)) + taskBonus(p, RM_RULES);
  if (p.conf) score += Math.min(2, p.confWeight || 0);
  return score;
}

// 开源库相关度：关键词得分 + robomaster 专属 topic 加分 + 星标 log 轻量加权。
export function scoreRepoRelevance(r) {
  const text = `${r.full_name || ""} ${r.description_en || ""} ${r.description_zh || ""} ${r.highlight_zh || ""} ${(r.topics || []).join(" ")}`;
  const optical = isOpticalRelevant(r);
  const profile = optical ? recommendationProfile(r, "repo") : rmTopicProfile(r, "repo");
  if (!optical && !profile.relevant) return 0;
  let score = profile.score + Math.min(8, keywordScore(text)) + taskBonus(r, RM_RULES);
  const topics = (r.topics || []).map((x) => String(x).toLowerCase());
  if (topics.includes("robomaster")) score += 3;
  // 星标 log 加权（≤约5分），仅作轻量 tie-break，不让大库压过强相关小库。
  score += Math.min(2, Math.log10((r.stars || 0) + 1) / 2);
  return Math.round(score * 100) / 100;
}
