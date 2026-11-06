import test from "node:test";
import assert from "node:assert/strict";
import { rmTopicProfile, topicTaskIds, isRMTopicRelevant, validSourceDate, sourceAgeHours } from "../scripts/rm-topic-policy.mjs";
import { annotateRules, classifyRM, selectWithTopicCoverage } from "../scripts/rm-recommendation-policy.mjs";
import { CATEGORIES, CATEGORY_RULES, RM_RULES } from "../scripts/robomaster-feeds.mjs";
import { scorePaperRelevance } from "../scripts/relevance.mjs";

const now = Date.parse("2026-11-06T00:00:00Z");
const paper = (title_en, abstract_en = "") => ({ title_en, abstract_en, published_at: "2026-10-20T00:00:00Z", url: "https://arxiv.org/abs/2610.00001" });
const keys = item => rmTopicProfile(item).topics.map(topic => topic.key);

test("ordinary simulation experiments and incompatible application domains do not create RM capabilities", () => {
  assert.equal(keys(paper("Robot trajectory tracking with feedback control", "We test a robot controller using simulation and real robot experiments.")).includes("sim"), false);
  for (const item of [paper("Underwater visual target tracking", "An AUV uses visual servoing."), paper("Robotic feeding with visual servoing", "AprilTag registers the meal and tool."), paper("Fish tracking with multi camera triangulation", "We study fish schools in aquariums."), paper("5G robot vision offloading", "Wireless resource optimization for object detection and robot navigation.")]) assert.equal(isRMTopicRelevant(item), false, item.title_en);
  assert.equal(topicTaskIds(paper("Omnidirectional aerial navigation", "A drone uses omnidirectional cameras for obstacle avoidance.")).includes("sentry"), false);
});

test("measured non-optical historical methods retain a place alongside recent papers", () => {
  const old = paper("FAST-LIO2: lidar inertial odometry", "A robot SLAM method with real robot experiments.");
  old.published_at = "2021-01-01";
  old.impact = { source: "Crossref", citations: 1000, source_url: "https://api.crossref.org/works/10.123/valid", checked_at: "2026-11-05" };
  const recent = Array.from({ length: 20 }, (_, n) => ({ ...paper(`Robot path planning ${n}`, "A mobile robot uses motion planning."), id: `new-${n}` }));
  assert.ok(selectWithTopicCoverage([...recent, old], 12).includes(old));
});

test("provider source dates reject missing, malformed, impossible and future values", () => {
  for (const value of [undefined, null, "", "garbage", "0", "2026-02-30", "2027-01-01T00:00:00Z"])
    assert.equal(validSourceDate(value, now), "", String(value));
  assert.equal(validSourceDate("2026-11-05T00:00:00Z", now), "2026-11-05T00:00:00.000Z");
  assert.equal(validSourceDate("Thu, 05 Nov 2026 00:00:00 GMT", now), "2026-11-05T00:00:00.000Z");
  assert.equal(sourceAgeHours("2026-11-05T00:00:00Z", now), 24);
  assert.equal(Number.isFinite(sourceAgeHours("2027-01-01", now)), false);
  assert.equal(Number.isFinite(sourceAgeHours("", now)), false);
});

test("generic vocabulary and prestigious venues do not make an RM recommendation", () => {
  for (const item of [paper("A generic computer vision model"), paper("Monocular human head pose estimation", "Real-time pose estimation using a camera"),
    paper("JoPPO: Hierarchical Photography Assessment via Reinforcement Learning", "A VLM as a judge for image aesthetics"),
    paper("Clinician-AI Collaboration in Endovascular Neurointerventions", "Robotic navigation and reinforcement learning"),
    paper("Remote Sensing Image Segmentation", "Object detection for autonomous agents")]) {
    item.conf = "CVPR"; item.confWeight = 6;
    assert.equal(isRMTopicRelevant(item), false, item.title_en);
    assert.equal(scorePaperRelevance(item), 0);
  }
});

test("a generic navigation title cannot conceal a clinical subject in the source abstract", () => {
  const item = paper("Reactive motion planning for autonomous robots", "Endovascular surgical robot navigation inside blood vessels and arteries, validated in clinical simulation.");
  assert.equal(isRMTopicRelevant(item), false);
  assert.equal(rmTopicProfile(item).quality, "excluded");
  assert.equal(scorePaperRelevance(item), 0);
  assert.deepEqual(topicTaskIds(item), []);
});

test("tracking, navigation, control and assembly need distinct combinations of evidence", () => {
  const vio = paper("Visual inertial odometry for quadrotor state estimation", "Onboard flight experiments");
  assert.ok(keys(vio).includes("slam"));
  assert.equal(keys(vio).includes("radar"), false);
  assert.equal(keys(vio).includes("assembly"), false);
  assert.equal(keys(vio).includes("aim"), false);
  const planner = paper("Path planning for autonomous quadrotor robots");
  assert.ok(keys(planner).includes("planning"));
  assert.equal(topicTaskIds(planner).includes("engineer"), false);
  assert.ok(keys(paper("Visual servoing for robotic peg-in-hole assembly")).includes("assembly"));
  assert.ok(keys(paper("MPC trajectory tracking for wheeled robots")).includes("control"));
  assert.ok(keys(paper("Real-time multi-object tracking with multi-camera calibration")).includes("radar"));
});

test("RM rune, ground navigation, camera calibration and embedded code are recalled without buff false positives", () => {
  for (const [item, expected] of [
    [{ full_name: "SZURPVision/RuneDetectionModel", description_en: "RoboMaster Energy Rune 5-Keypoint Pose Detection Model" }, "rune"],
    [{ full_name: "SMBU/team", description_en: "Sentry Navigation Sim2Real Package for RoboMaster2025", topics: ["ros2", "robomaster"] }, "nav"],
    [{ full_name: "team/calibration", description_en: "LiDAR-camera extrinsic calibration validation", topics: ["robomaster"] }, "radar"],
    [{ full_name: "team/embedded", description_en: "RoboMaster embedded firmware for STM32" }, "control"],
  ]) assert.ok(rmTopicProfile(item, "repo").topics.some(topic => topic.key === expected), expected);
  assert.equal(keys(paper("A robot simulation buffer for training navigation policies")).includes("rune"), false);
});

test("aerial navigation methods survive while ground categories and battlefield claims stay separate", () => {
  for (const title of ["TransNav: Quadrotor obstacle avoidance", "Stereo-to-Trajectory Planning for Quadrotor Navigation"])
    assert.ok(keys(paper(title)).includes("planning"));
  assert.equal(keys(paper("Quadrotor obstacle avoidance")).includes("nav"), false);
  assert.equal(isRMTopicRelevant(paper("Autonomous fixed-wing interception using reinforcement learning", "Quadcopter interceptors and autonomous flight control")), false);
});

test("source evidence cannot be created by a generated Chinese translation or RM suggestion", () => {
  const item = paper("An image aesthetics benchmark", "Ranking photo composition");
  item.abstract_zh = "机器人自主导航，状态估计，多目标跟踪，点阵装甲板自瞄";
  item.rm = { task_id: "autoaim", usage: "用于装甲板" };
  assert.equal(isRMTopicRelevant(item), false);
});

test("recent and established lanes use real dates and checked primary metrics", () => {
  const item = { full_name: "ros-navigation/navigation2", url: "https://github.com/ros-navigation/navigation2", created_at: "2018-01-01", pushed_at: "2023-01-01", stars: 10000, first_seen: "2026-11-05", license: "Apache-2.0" };
  assert.equal(rmTopicProfile(item, "repo", now).lane, "reference");
  assert.equal(rmTopicProfile(item, "repo", now).metric, undefined);
  item.metadata_fetched_at = "2026-11-05";
  assert.equal(rmTopicProfile(item, "repo", now).lane, "established");
  assert.equal(rmTopicProfile(item, "repo", now).metric.checked_at, "2026-11-05");
  item.metadata_fetched_at = "2027-01-01";
  assert.equal(rmTopicProfile(item, "repo", now).lane, "reference");
  const recent = paper("Model predictive control for mobile robots");
  assert.equal(rmTopicProfile(recent, "paper", now).lane, "recent");
  recent.published_at = "2027-01-01";
  assert.equal(rmTopicProfile(recent, "paper", now).lane, "reference");
});

test("longstanding papers require Crossref is-referenced-by evidence and explicit source date", () => {
  const item = { ...paper("Visual SLAM for mobile robots", "Real robot experiments"), published_at: "2020-01-01",
    impact: { source: "Crossref", citations: 40, source_url: "https://api.crossref.org/works/10.1000/example", checked_at: "2026-11-05" } };
  assert.equal(rmTopicProfile(item, "paper", now).lane, "established");
  item.impact.source_url = "https://example.org/works/10.1000/example";
  assert.equal(rmTopicProfile(item, "paper", now).lane, "reference");
  assert.equal(rmTopicProfile(item, "paper", now).metric, undefined);
  item.impact.source_url = "http://api.crossref.org/works/10.1000/example";
  assert.equal(rmTopicProfile(item, "paper", now).lane, "reference");
  item.impact.source_url = "https://api.crossref.org.evil.example/works/10.1000/example";
  assert.equal(rmTopicProfile(item, "paper", now).lane, "reference");
  item.impact.source_url = "https://api.crossref.org/works/10.1000/example";
  delete item.impact.checked_at;
  assert.equal(rmTopicProfile(item, "paper", now).lane, "reference");
});

test("balanced optical slice preserves camera, photodiode, recent and established evidence", () => {
  const review = receiver => ({ verified: true, kind: "implementation", receiver, source_url: "https://example.org/author", reason_zh: "作者收发原型", limitations_zh: "需适配" });
  const camera = { ...paper("LED camera visible light communication prototype"), id: "camera", optical_review: review("event_camera") };
  const duplicateCameras = Array.from({ length: 30 }, (_, i) => ({ ...camera, id: `cam-${i}` }));
  const diode = { ...paper("Visible light communication LED photodiode firmware prototype"), id: "diode", optical_review: review("photodiode"), published_at: "2020-01-01" };
  const established = { ...camera, id: "classic", published_at: "2015-01-01", impact: { source: "Crossref", citations: 50,
    source_url: "https://api.crossref.org/works/10.1000/example", checked_at: "2026-11-01" } };
  const ground = Array.from({ length: 100 }, (_, i) => ({ ...paper("Ground robot visual SLAM"), id: `ground-${i}` }));
  const selected = selectWithTopicCoverage([...duplicateCameras, ...ground, camera, diode, established], 40, { opticalMinimum: 4 });
  assert.ok(selected.includes(diode));
  assert.ok(selected.includes(established));
  assert.ok(selected.some(item => item.optical_review?.receiver === "event_camera" && item.published_at === camera.published_at));
  assert.equal(selected.length, 40);
});

test("references and partial tools expose limitations and resource lists cannot become implementations", () => {
  const list = { full_name: "author/awesome-robot-navigation", description_en: "A curated list of robot navigation and SLAM papers", stars: 10000 };
  assert.equal(isRMTopicRelevant(list, "repo"), false);
  const detector = { full_name: "ultralytics/ultralytics", description_en: "Object detection, pose estimation", url: "https://github.com/ultralytics/ultralytics" };
  const profile = rmTopicProfile(detector, "repo", now);
  assert.ok(profile.limitations_zh.includes("弹道闭环"));
  assert.equal(topicTaskIds(detector).includes("engineer"), false);
  assert.equal(profile.lane, "reference");
});

test("annotation and categorization share capability evidence", () => {
  const item = paper("Visual servoing for robotic assembly");
  annotateRules(item, RM_RULES);
  assert.equal(item.recommendation.scope, "rm");
  assert.ok(item.rule_matches.some(match => match.task_id === "engineer"));
  assert.ok(classifyRM(item, CATEGORIES, CATEGORY_RULES).includes("assembly"));
  const state = paper("An estimator for quadrotor state estimation");
  annotateRules(state, RM_RULES);
  assert.equal(state.rule_matches.some(match => match.task_id === "radar"), false);
});

test("balanced selection preserves available subjects before highly ranked aerial and optical pools", () => {
  const aerial = Array.from({ length: 80 }, (_, i) => ({ ...paper("Quadrotor model predictive flight control"), id: `air-${i}` }));
  const topics = ["RoboMaster armor detection and auto aim", "RoboMaster power rune detection", "Ground robot visual SLAM",
    "Autonomous mobile robot navigation", "Path planning for wheeled robots", "RoboMaster radar station",
    "MPC motor control for wheeled robots", "Visual servoing for robotic assembly", "Gazebo robot simulator", "Mobile robot reinforcement learning"];
  const others = topics.map((title, i) => ({ ...paper(title), id: `topic-${i}` }));
  const selected = selectWithTopicCoverage([...aerial, ...others], 20, { aerialMinimum: 12, opticalMinimum: 6 });
  assert.equal(selected.length, 20);
  for (const item of others) assert.ok(selected.includes(item), item.title_en);
  assert.equal(new Set(selected.map(item => item.id)).size, selected.length);
  assert.deepEqual(selectWithTopicCoverage([], 20), []);
});
