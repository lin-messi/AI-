import test from "node:test";
import assert from "node:assert/strict";
import { applyRMUsageResult } from "../scripts/enrich-rm-usage.mjs";
import { RM_RULES } from "../scripts/robomaster-feeds.mjs";
test("AI usage cannot convert SLAM into battlefield radar or assembly", () => {
  const item = { full_name: "TixiaoShan/LIO-SAM", description_en: "Lidar inertial odometry and SLAM", url: "https://github.com/TixiaoShan/LIO-SAM" };
  assert.equal(applyRMUsageResult(item, { usage: "可参考其里程计模块。", task_id: "radar", value: "high" }), false);
  assert.equal(item.rm, undefined);
  assert.equal(applyRMUsageResult(item, { usage: "可参考其里程计模块，尚不构成全场定位。", task_id: "", value: "high" }), true);
  assert.equal(item.rm.value, "mid");
});
test("a directly relevant RM implementation can retain its verified task", () => {
  const item = { full_name: "team/rm_auto_aim", description_en: "RoboMaster auto aim armor detection and gimbal tracking" };
  applyRMUsageResult(item, { usage: "核对新赛季装甲外观后验证跟踪模块。", task_id: "autoaim", value: "high" }, RM_RULES);
  assert.equal(item.rm.task_id, "autoaim");
  assert.equal(item.rm.value, "high");
});
test("empty or malformed AI usage does not create a success record", () => {
  const item = { title_en: "Robot navigation" };
  assert.equal(applyRMUsageResult(item, { usage: null }), false);
  assert.equal(item.rm, undefined);
});
