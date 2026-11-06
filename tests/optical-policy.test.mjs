import test from "node:test";
import assert from "node:assert/strict";
import { isOpticalRelevant, opticalProfile, recommendationProfile, rejectUnrelatedOpticalTopic } from "../scripts/optical-policy.mjs";
import { validOpticalLibrary, mergeOpticalArxivMetadata } from "../scripts/fetch-rm-optical.mjs";
import { selectWithAerialCoverage, annotateRules, classifyRM } from "../scripts/rm-recommendation-policy.mjs";
import { CATEGORIES, CATEGORY_RULES, RM_RULES } from "../scripts/robomaster-feeds.mjs";
import { qaContext } from "../scripts/rm-qa.mjs";

const now = Date.parse("2026-11-05T12:00:00Z");
const paper = { title_en: "A rolling-shutter LED-camera visible light communication prototype", abstract_en: "A hardware transmitter and camera receiver decode a data link.", published_at: "2026-05-01", url: "https://example.org/paper" };
const review = (receiver = "camera", kind = "implementation") => ({ verified: true, kind, receiver, source_url: "https://example.org/author", reason_zh: "作者公开的可见光收发实现", limitations_zh: "光源和部署条件需改造" });

test("audited historical mentions do not masquerade as reusable optical firmware", () => {
  for (const full_name of ["Tomer27cz/xt211", "omron-sinicx/maru"]) assert.equal(isOpticalRelevant({ full_name, description_en: "LED photodiode visible light communication firmware" }), false);
  const link = opticalProfile({ full_name: "toggio/PacketLED", description_en: "Visible light communication between LEDs", readme_excerpt: "There is no photodiode: each LED emits light to transmit and is used as a light sensor to receive." });
  assert.equal(link.relevant, true);
  assert.equal(link.receiver, "led");
  assert.match(link.limitations_zh, /1024/);
});

test("generic mobile/control context cannot let rejected NOMA theory re-enter the RM pool", () => {
  assert.equal(rejectUnrelatedOpticalTopic({ title_en: "NOMA power allocation for mobile visible light communication networks" }), true);
  assert.equal(rejectUnrelatedOpticalTopic(paper), false);
  assert.equal(rejectUnrelatedOpticalTopic({ title_en: "Robot navigation using SLAM and visible light positioning" }), false);
});

test("optical candidates survive both collection and daily merge without a UAV word; both receiver routes survive", () => {
  const camera = { ...paper, optical_review: review("rolling_shutter_camera") };
  const diode = { title_en: "Visible light communication LED photodiode firmware prototype", optical_review: review("photodiode"), published_at: "2025-01-01" };
  const generic = Array.from({ length: 100 }, (_, i) => ({ id: i, title_en: "Ground robot SLAM" }));
  for (const n of [60, 100]) {
    const selected = selectWithAerialCoverage([...generic, camera, diode], n, 12, undefined, 4);
    assert.ok(selected.includes(camera) && selected.includes(diode));
  }
  camera.categories = classifyRM(camera.title_en + " " + camera.abstract_en, CATEGORIES, CATEGORY_RULES);
  annotateRules(camera, RM_RULES);
  assert.ok(camera.categories.includes("optical"));
  assert.ok(camera.rule_matches.some(m => m.task_id === "optical"));
});

test("optical implementations receive modulation and link Q&A without UAV classification", () => {
  const qa = { title: "2027", source_url: "source", items: [{ number: 184, competition: "RMUC", status: "answered", aerial: true,
    question: "额外通信LED是否允许PWM/OOK", answer: "允许，指示灯照度有要求" }] };
  assert.ok(qaContext([paper], qa).includes("[答疑 #184"));
});

test("different DOI-only papers cannot share a cache identity", () => {
  assert.equal(validOpticalLibrary({ papers: [{ id: "doi:a", doi: "a" }, { id: "doi:b", doi: "b" }], repos: [] }), true);
  assert.equal(validOpticalLibrary({ papers: [{ id: "doi:a", doi: "b" }], repos: [] }), false);
  assert.equal(validOpticalLibrary({ papers: [{ id: "doi:a", doi: "a" }, { id: "doi:a", doi: "a" }], repos: [] }), false);
});

test("refreshing arXiv metadata preserves previously verified citation evidence when its provider is unavailable", () => {
  const impact = { source: "Crossref", citations: 32, source_url: "https://api.crossref.org/works/test", checked_at: "2026-11-01" };
  const result = mergeOpticalArxivMetadata({ doi: "test", impact, title_zh: "已有中文" }, { title: "New title", content: "New abstract", isoDate: "2026-11-05" }, { arxiv_id: "1234.5678" });
  assert.equal(result.impact, impact);
  assert.equal(result.impact.checked_at, "2026-11-01");
  assert.equal(result.title_en, "New title");
  assert.equal(result.title_zh, "已有中文");
});

test("accepts concrete optical links without requiring a UAV word, including README-only evidence", () => {
  assert.equal(isOpticalRelevant(paper), true);
  assert.equal(opticalProfile(paper).receiver, "rolling_shutter_camera");
  assert.equal(isOpticalRelevant({ full_name: "lab/modem", readme_excerpt: "Visible light communication prototype. Arduino LED transmitter and photodiode receiver." }), true);
  assert.equal(opticalProfile({ title_en: "Event-based camera decoding for LED visible light communication" }).receiver, "event_camera");
  assert.equal(opticalProfile("LED as receiver for bidirectional visible light communication").receiver, "led");
});

test("rejects media-player acronym, pure IR, fiber, laser FSO and generic communications theory", () => {
  for (const text of [
    "Python VLC media player using VideoLAN libvlc", "Infrared LED modem with photodiode receiver",
    "Fiber optic LED transmitter and photodiode communications receiver", "Laser free-space optical FSO communications prototype",
    "RIS NOMA visible light communication power allocation and secrecy rate", "VLC stream decoder", "Optical flow for robot control",
  ]) assert.equal(isOpticalRelevant(text), false, text);
  assert.equal(isOpticalRelevant({ full_name: "videolan/vlc", description_en: "VLC media player", optical_review: review() }), false);
  assert.equal(isOpticalRelevant({ title_en: "NOMA visible light communication LED photodiode channel model capacity analysis" }), false);
  assert.equal(isOpticalRelevant({ title_en: "Hardware-aware NOMA visible light communication LED photodiode power allocation analysis" }), false);
  assert.equal(isOpticalRelevant({ title_en: "Bayesian channel estimation for mobile visible light communication", abstract_en: "A model of an LED and photodiode link. Numerical simulation results compare channel estimates." }), false);
});

test("simulation stays a low-score reference and survey metadata never masquerades as an implementation", () => {
  const item = { title_en: "LED camera visible light communication simulation and decoding", published_at: "2026-08-01", optical_review: review("camera", "simulation") };
  const profile = recommendationProfile(item, "paper", now);
  assert.equal(profile.quality, "simulation");
  assert.equal(profile.lane, "reference");
  assert.ok(profile.score < recommendationProfile(paper, "paper", now).score);
  assert.equal(isOpticalRelevant({ ...paper, optical_review: review("camera", "survey") }), false);
  assert.equal(isOpticalRelevant({ title_en: "A survey of LED camera visible light communication" }), false);
});

test("receiver needs explicit source text or verified metadata and is never guessed as photodiode", () => {
  const item = { title_en: "A visible light communication hardware prototype", optical_review: { ...review("unknown"), receiver: "unknown" } };
  assert.equal(opticalProfile(item).receiver, "unknown");
  assert.equal(opticalProfile({ ...item, optical_review: { ...review("photodiode"), verified: false } }).receiver, "unknown");
  assert.equal(opticalProfile({ ...item, optical_review: review("photodiode") }).receiver, "photodiode");
});

test("recent lanes use actual dates, never first-seen, missing timestamps or future dates", () => {
  assert.equal(recommendationProfile(paper, "paper", now).lane, "recent");
  for (const date of [undefined, "bad", "2027-01-01", "2022-02-01"]) {
    assert.equal(recommendationProfile({ ...paper, published_at: date, first_seen: "2026-11-05" }, "paper", now).lane, "reference");
  }
  const repo = { description_en: paper.title_en, created_at: "2026-02-01", pushed_at: "2026-10-01", stars: 5, url: "https://github.com/lab/modem" };
  assert.equal(recommendationProfile(repo, "repo", now).lane, "recent");
  assert.equal(recommendationProfile({ ...repo, pushed_at: "2027-01-01" }, "repo", now).lane, "reference");
});

test("established paper needs verifiable Crossref evidence and a real age of at least two years", () => {
  const classic = { ...paper, published_at: "2020-01-01", impact: { citations: 50, source: "Crossref", source_url: "https://api.crossref.org/works/10.1/example", checked_at: "2026-11-01" } };
  const result = recommendationProfile(classic, "paper", now);
  assert.equal(result.lane, "established");
  assert.equal(result.metric.value, 50);
  for (const invalid of [{ ...classic.impact, source: "unknown" }, { ...classic.impact, source_url: "" }, { ...classic.impact, citations: 29 }, { ...classic.impact, checked_at: "2027-01-01" }]) {
    assert.equal(recommendationProfile({ ...classic, impact: invalid }, "paper", now).lane, "reference");
  }
});

test("old reviewed repositories can be established without recent commits; stars alone cannot establish quality", () => {
  const classic = { full_name: "lab/openvlc", description_en: "Open source visible light communication hardware platform", created_at: "2014-01-01", pushed_at: "2025-09-01", stars: 173, forks: 20, url: "https://github.com/lab/openvlc", optical_review: review("photodiode") };
  assert.equal(recommendationProfile(classic, "repo", now).lane, "established");
  assert.equal(recommendationProfile({ ...classic, stars: 14 }, "repo", now).lane, "reference");
  assert.equal(recommendationProfile({ ...classic, optical_review: undefined }, "repo", now).lane, "reference");
  const recent = { ...paper, optical_review: review(), published_at: "2026-10-01" };
  assert.ok(recommendationProfile(recent, "paper", now).score >= recommendationProfile(classic, "repo", now).score);
  const player = recommendationProfile({ full_name: "videolan/vlc", description_en: "VLC media player", stars: 100000, created_at: "2010-01-01", pushed_at: "2026-10-01", optical_review: review() }, "repo", now);
  assert.equal(player.score, 0);
  assert.equal(player.metric, undefined);
});
