import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, CATEGORY_RULES, RM_RULES } from "../scripts/robomaster-feeds.mjs";
import { hasKeyword, isAerialRelevant, rulesFingerprint, annotateRules, classifyRM, selectWithAerialCoverage, taskBonus } from "../scripts/rm-recommendation-policy.mjs";
import { selectRuleText, validateAerialCoverage } from "../scripts/rm-rule-corpus.mjs";
import { scorePaperRelevance } from "../scripts/relevance.mjs";

test("autonomous flight gets aerial tag even when other categories match; aerial imagery alone does not", () => {
  const text = "Quadrotor visual-inertial odometry, SLAM, motion planning, obstacle avoidance, target tracking and autonomous flight control";
  assert.ok(classifyRM(text, CATEGORIES, CATEGORY_RULES).includes("aerial"));
  assert.equal(isAerialRelevant("Object detection in aerial satellite images"), false);
  assert.equal(isAerialRelevant("Autonomous UAV precision landing"), true);
  assert.equal(hasKeyword("remote automotive model", "mot"), false);
  assert.equal(hasKeyword("visual-inertial odometry", "visual inertial odometry"), true);
  assert.equal(isAerialRelevant({ full_name: "ZJU-FAST-Lab/ego-planner", description_en: "" }), true);
});

test("new rules drive task matching and relevance, not just generic keyword heat", () => {
  const item = { title_en: "Autonomous quadrotor collision avoidance and visual inertial odometry", abstract_en: "Onboard drone flight control" };
  annotateRules(item, RM_RULES);
  assert.ok(item.rule_matches.some(t => t.task_id === "aerial"));
  assert.ok(taskBonus(item, RM_RULES) > 0);
  assert.equal(taskBonus(item, { tasks: [] }), 0);
  assert.ok(scorePaperRelevance(item) > scorePaperRelevance({ title_en: "A generic object detection model" }));
  const ground = { title_en: "Ground robot collision avoidance with visual inertial odometry" };
  annotateRules(ground, RM_RULES);
  assert.equal(ground.rule_matches.some(t => t.task_id === "aerial"), false);
});

test("coverage survives truncation and daily merging without exceeding limits or fabricating items", () => {
  const ordinary = Array.from({ length: 100 }, (_, i) => ({ id: `ground-${i}`, title_en: "Ground robot SLAM" }));
  const aerial = Array.from({ length: 15 }, (_, i) => ({ id: `flight-${i}`, title_en: "Quadrotor flight planning" }));
  for (const size of [60, 100]) {
    const selected = selectWithAerialCoverage([...ordinary, ...aerial], size, 12);
    assert.equal(selected.length, size);
    assert.equal(selected.filter(isAerialRelevant).length, 12);
    assert.equal(new Set(selected.map(x => x.id)).size, size);
  }
  assert.equal(selectWithAerialCoverage(aerial.slice(0, 2), 40, 10).length, 2);
  assert.equal(selectWithAerialCoverage([...ordinary, ...aerial], 3, 12).filter(isAerialRelevant).length, 3);
  const manyAerial = Array.from({ length: 90 }, (_, i) => ({ id: `a-${i}`, title_en: "Quadrotor flight" }));
  assert.equal(selectWithAerialCoverage([...manyAerial, ...ordinary], 100, 12).filter(isAerialRelevant).length, 35);
});

test("same printed rule version with changed tasks invalidates old usage, unchanged rules reuse it", () => {
  const current = rulesFingerprint(RM_RULES);
  const stale = { title_en: "Drone flight", rm: { usage: "Old advice" } };
  annotateRules(stale, RM_RULES);
  assert.equal(stale.rm, undefined);
  const cached = { rm: { usage: "Current advice", rules_fingerprint: current } };
  annotateRules(cached, RM_RULES);
  assert.equal(cached.rm.usage, "Current advice");
  const changed = structuredClone(RM_RULES);
  changed.tasks[0].desc_zh += "Changed communications restriction";
  assert.notEqual(rulesFingerprint(changed), current);
  annotateRules(cached, changed);
  assert.equal(cached.rm, undefined);
});

test("rule extraction keeps late aerial chapters and refuses a missing aerial task", () => {
  const raw = ["Manual title", ...Array.from({ length: 35 }, () => "一般内容".repeat(300)), "空中机器人 全自动 机库 运行要求"].join("\f");
  const text = selectRuleText(raw, 4000);
  assert.ok(text.includes("空中机器人 全自动 机库"));
  assert.ok(text.length <= 4000);
  assert.throws(() => validateAerialCoverage({ tasks: [] }, [{ text }]), /缺少 aerial/);
  assert.doesNotThrow(() => validateAerialCoverage(RM_RULES, [{ text }]));
});
