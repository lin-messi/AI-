// Shared by both collectors: task matching, aerial recall and bounded coverage.
import { createHash } from "node:crypto";

export function hasKeyword(text, keyword) {
  const normalize = (s) => String(s || "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  const term = normalize(keyword).trim();
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${/^[a-z0-9]/.test(term) ? "(?<![a-z0-9])" : ""}${escaped}${/[a-z0-9]$/.test(term) ? "(?![a-z0-9])" : ""}`, "i").test(normalize(text));
}

export function itemText(item) {
  return [item.title_en, item.title_zh, item.abstract_en, item.abstract_zh,
    item.full_name, item.description_en, item.description_zh, ...(item.topics || [])].filter(Boolean).join(" ");
}

export function isAerialRelevant(item) {
  const text = typeof item === "string" ? item : itemText(item);
  // Reviewed source repositories sometimes have an empty or extremely short description.
  const reviewed = ["px4/px4-autopilot", "mavlink/mavsdk", "bitcraze/crazyflie-firmware", "imrclab/crazyswarm2", "hkust-aerial-robotics/vins-fusion", "zju-fast-lab/ego-planner", "zju-fast-lab/ego-planner-swarm", "zju-fast-lab/fast-drone-250", "uzh-rpg/rpg_mpc", "uzh-rpg/agilicious", "ethz-asl/mav_trajectory_generation", "hkust-aerial-robotics/fast-planner"];
  if (reviewed.some(name => hasKeyword(text, name))) return true;
  const platform = ["drone", "uav", "quadrotor", "quadcopter", "multirotor", "multicopter", "micro aerial vehicle", "aerial robot", "aerial robotics", "crazyflie", "crazyswarm", "px4", "mavlink", "无人机", "空中机器人", "四旋翼"];
  const capability = ["flight", "flying", "hover", "navigation", "planning", "planner", "control", "controller", "odometry", "estimation", "estimator", "localization", "avoidance", "landing", "swarm", "firmware", "autopilot", "sdk", "autonomous", "飞行", "定位", "避障", "降落", "飞控", "集群"];
  return platform.some(k => hasKeyword(text, k) || hasKeyword(text, `${k}s`)) && capability.some(k => hasKeyword(text, k));
}

export function rulesFingerprint(rules) {
  return createHash("sha256").update(JSON.stringify({ season: rules?.season, version: rules?.version, tasks: rules?.tasks || [], searchKeywords: rules?.searchKeywords || {}, qa: rules?.clarifications?.fingerprint })).digest("hex").slice(0, 16);
}

export function matchRuleTasks(item, rules) {
  const text = itemText(item);
  return (rules?.tasks || []).filter(task => task.id !== "aerial" || isAerialRelevant(item)).map(task => ({
    task_id: task.id, task: task.name_zh,
    keywords: [...(task.keywords_en || []), ...(task.keywords_zh || [])].filter(k => hasKeyword(text, k)),
  })).filter(match => match.keywords.length || (match.task_id === "aerial" && isAerialRelevant(item)));
}

export function annotateRules(item, rules) {
  item.rule_matches = matchRuleTasks(item, rules);
  item.rules_fingerprint = rulesFingerprint(rules);
  // Keep generated prose only when it was assessed against this exact task set.
  if (item.rm && item.rm.rules_fingerprint !== item.rules_fingerprint) delete item.rm;
  return item;
}

export function classifyRM(text, categories, categoryRules) {
  const hits = categoryRules.filter(rule => rule.kw.some(k => hasKeyword(text, k))).map(rule => rule.key);
  if (isAerialRelevant(text)) hits.push("aerial");
  // Do not drop aerial because detection/navigation already consumed three labels.
  return categories.map(c => c.key).filter(k => hits.includes(k)).length
    ? categories.map(c => c.key).filter(k => hits.includes(k)) : ["other"];
}

export function taskBonus(item, rules) {
  const matches = matchRuleTasks(item, rules);
  return Math.min(12, matches.reduce((sum, m) => sum + Math.min(3, m.keywords.length) * 2, 0))
    + (isAerialRelevant(item) && (rules?.tasks || []).some(t => t.id === "aerial") ? 12 : 0);
}

// Reserve relevant aerial candidates; never fabricate padding or exceed the pool limit.
// Caller supplies an already ranked, eligible and deduplicated pool.
export function selectWithAerialCoverage(ranked, limit, minimum, maximum = Math.max(minimum, Math.ceil(limit * 0.35))) {
  const reserved = ranked.filter(isAerialRelevant).slice(0, Math.min(limit, minimum));
  const selected = new Set(reserved);
  let aerialCount = reserved.length;
  for (const item of ranked) {
    if (selected.size >= limit) break;
    if (selected.has(item)) continue;
    if (isAerialRelevant(item) && aerialCount >= maximum) continue;
    selected.add(item);
    if (isAerialRelevant(item)) aerialCount++;
  }
  // If there are insufficient other subjects, retain real candidates rather than empty slots.
  for (const item of ranked) { if (selected.size >= limit) break; selected.add(item); }
  return ranked.filter(item => selected.has(item)).slice(0, limit);
}
