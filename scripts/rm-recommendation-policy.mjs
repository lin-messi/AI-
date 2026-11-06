// Shared by both collectors: task matching, aerial recall and bounded coverage.
import { createHash } from "node:crypto";
import { isOpticalRelevant, recommendationProfile } from "./optical-policy.mjs";
import { rmTopicProfile, topicTaskIds } from "./rm-topic-policy.mjs";

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
  return createHash("sha256").update(JSON.stringify({ policy: "rm-capabilities-v1", season: rules?.season, version: rules?.version, tasks: rules?.tasks || [], searchKeywords: rules?.searchKeywords || {}, qa: rules?.clarifications?.fingerprint })).digest("hex").slice(0, 16);
}

export function matchRuleTasks(item, rules) {
  const text = itemText(item);
  const tasks = new Set(topicTaskIds(item));
  return (rules?.tasks || []).filter(task => task.id === "aerial" ? isAerialRelevant(item) && (isOpticalRelevant(item) || rmTopicProfile(item).relevant)
    : task.id === "optical" ? isOpticalRelevant(item) : tasks.has(task.id)).map(task => ({
    task_id: task.id, task: task.name_zh,
    keywords: [...(task.keywords_en || []), ...(task.keywords_zh || [])].filter(k => hasKeyword(text, k)),
  }));
}

export function annotateRules(item, rules) {
  item.rule_matches = matchRuleTasks(item, rules);
  item.rules_fingerprint = rulesFingerprint(rules);
  if (isOpticalRelevant(item)) {
    item.recommendation = recommendationProfile(item, item.full_name ? "repo" : "paper");
    item.categories = [...new Set(["optical", ...(item.categories || [])])];
  } else {
    const profile = rmTopicProfile(item, item.full_name ? "repo" : "paper");
    const { relevant, ...recommendation } = profile;
    item.recommendation = recommendation;
  }
  // Keep generated prose only when it was assessed against this exact task set.
  if (item.rm && item.rm.rules_fingerprint !== item.rules_fingerprint) delete item.rm;
  return item;
}

export function classifyRM(text, categories, categoryRules) {
  const hits = rmTopicProfile(text).topics.map(topic => topic.key);
  if (isAerialRelevant(text)) hits.push("aerial");
  if (isOpticalRelevant(text)) hits.push("optical");
  // Do not drop aerial because detection/navigation already consumed three labels.
  return categories.map(c => c.key).filter(k => hits.includes(k)).length
    ? categories.map(c => c.key).filter(k => hits.includes(k)) : ["other"];
}

export function taskBonus(item, rules) {
  const matches = matchRuleTasks(item, rules);
  // English/Chinese synonyms and several unrelated task words cannot stack a score.
  return Math.min(8, matches.length * 3);
}

// Reserve a small slice of every available capability before ranked fill. Multi-label
// candidates can satisfy several subjects, and no specialty receives a fixed 35% share.
export function selectWithTopicCoverage(ranked, limit, { aerialMinimum = 0, opticalMinimum = 0 } = {}) {
  const unique = [...new Set(ranked)];
  const selected = new Set();
  const topicKeys = ["aim", "rune", "slam", "nav", "planning", "radar", "control", "assembly", "sim", "rl", "aerial", "optical"];
  const keyMap = new Map(unique.map(item => {
    const list = rmTopicProfile(item, item.full_name ? "repo" : "paper").topics.map(topic => topic.key);
    if (isAerialRelevant(item)) list.push("aerial");
    if (isOpticalRelevant(item)) list.push("optical");
    return [item, list];
  }));
  const keys = item => keyMap.get(item);
  const byTopic = new Map(topicKeys.map(key => [key, unique.filter(item => keys(item).includes(key))]));
  const quota = Math.max(1, Math.floor(limit / topicKeys.length));
  const counts = new Map(topicKeys.map(key => [key, 0]));
  const add = item => {
    if (selected.has(item)) return;
    selected.add(item);
    for (const key of keys(item)) counts.set(key, counts.get(key) + 1);
  };
  // Preserve both hardware receiver routes and both evidence lanes inside the optical
  // slice; high-ranked camera papers must not crowd out the diode implementation.
  const optical = byTopic.get("optical");
  const opticalTarget = Math.min(opticalMinimum || quota, Math.max(quota, Math.floor(limit * 0.15)));
  const opticalProfiles = new Map(optical.map(item => [item, recommendationProfile(item, item.full_name ? "repo" : "paper")]));
  const opticalPriority = [...new Set([
    optical.find(item => ["camera", "rolling_shutter_camera", "event_camera"].includes(opticalProfiles.get(item).receiver)),
    optical.find(item => ["photodiode", "led"].includes(opticalProfiles.get(item).receiver)),
    optical.find(item => opticalProfiles.get(item).lane === "recent"),
    optical.find(item => opticalProfiles.get(item).lane === "established"),
    ...optical,
  ].filter(Boolean))];
  for (const item of opticalPriority.slice(0, Math.min(limit, opticalTarget))) add(item);
  // Reserve measured historical methods in every capability, not just optical links.
  for (const key of topicKeys.filter(key => key !== "optical")) {
    for (const item of byTopic.get(key).filter(item => rmTopicProfile(item, item.full_name ? "repo" : "paper").lane === "established").slice(0, 2)) {
      if (selected.size < limit) add(item);
    }
  }
  for (let round = 0; round < quota; round++) for (const key of topicKeys) {
    if (selected.size >= limit) break;
    if ((counts.get(key) || 0) > round) continue;
    const candidate = byTopic.get(key).find(item => !selected.has(item));
    if (candidate) add(candidate);
  }
  // Specialist minima are bounded by the same modest share as other capabilities.
  for (const [key, requested] of [["aerial", aerialMinimum]]) {
    const target = Math.min(requested, Math.max(quota, Math.floor(limit * 0.15)));
    for (const item of byTopic.get(key)) {
      if (selected.size >= limit || counts.get(key) >= target) break;
      add(item);
    }
  }
  const specialistCap = Math.max(quota, Math.ceil(limit * 0.2));
  for (const item of unique) {
    if (selected.size >= limit) break;
    if (selected.has(item)) continue;
    if (keys(item).some(key => ["optical", "aerial"].includes(key) && counts.get(key) >= specialistCap)) continue;
    add(item);
  }
  // Do not fabricate subjects or reject the only available real candidates.
  for (const item of unique) { if (selected.size >= limit) break; add(item); }
  return unique.filter(item => selected.has(item)).slice(0, limit);
}

// Reserve relevant aerial candidates; never fabricate padding or exceed the pool limit.
// Caller supplies an already ranked, eligible and deduplicated pool.
export function selectWithAerialCoverage(ranked, limit, minimum, maximum = Math.max(minimum, Math.ceil(limit * 0.35)), opticalMinimum = 0) {
  const reserved = ranked.filter(isAerialRelevant).slice(0, Math.min(limit, minimum));
  const selected = new Set(reserved);
  // Protect specialist optical implementations and proven references alongside aerial navigation.
  const optical = ranked.filter(isOpticalRelevant);
  const priority = [...new Set([
    optical.find(item => recommendationProfile(item, item.full_name ? "repo" : "paper").lane === "recent"),
    optical.find(item => recommendationProfile(item, item.full_name ? "repo" : "paper").lane === "established"),
    optical.find(item => ["photodiode", "led"].includes(recommendationProfile(item, item.full_name ? "repo" : "paper").receiver)),
    optical.find(item => ["camera", "rolling_shutter_camera", "event_camera"].includes(recommendationProfile(item, item.full_name ? "repo" : "paper").receiver)),
    ...optical,
  ].filter(Boolean))];
  for (const item of priority.slice(0, Math.min(opticalMinimum, Math.max(0, limit - selected.size)))) selected.add(item);
  let aerialCount = [...selected].filter(isAerialRelevant).length;
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
