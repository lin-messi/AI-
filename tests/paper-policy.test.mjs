import test from "node:test";
import assert from "node:assert/strict";
import { arxivQueryGroups, classifyPaperField, mergePaperRecords, paperProfile, selectPapers } from "../scripts/paper-policy.mjs";
import { crossrefMatches } from "../scripts/fetch-research-references.mjs";
const now = Date.parse("2026-11-06T12:00:00Z");
const fields = [{ key: "vision", arxiv: ["cs.CV"] }, { key: "robotics", arxiv: ["cs.RO"] }, { key: "bio", arxiv: ["q-bio.BM"] }, { key: "optics", arxiv: ["physics.optics"] }];
const paper = (id, field = "vision", extra = {}) => ({ id, title_en: "Real-time object detection on edge devices", abstract_en: "We evaluate object detection using labeled images and present measurements of accuracy, memory use and runtime on embedded devices. The method is compared to public baselines on a held-out test set.", url: `https://arxiv.org/abs/${id}`, field, published_at: "2026-11-05T10:00:00Z", ...extra });
test("publication date is required and future items never become recent", () => {
  assert.equal(paperProfile(paper("a", "vision", { published_at: null }), now), null);
  assert.equal(paperProfile(paper("a", "vision", { published_at: "2027-01-01" }), now), null);
  assert.equal(paperProfile(paper("a", "vision", { published_at: "nonsense" }), now), null);
});
test("primary arXiv category wins over display order", () => {
  assert.equal(classifyPaperField(paper("a", "vision", { cats: ["cs.RO", "cs.CV"] }), fields), "robotics");
  assert.equal(classifyPaperField(paper("b", "vision", { source: "medRxiv" }), fields), "bio");
});
test("each field has its own query budget including a distinct frontier group", () => {
  const groups = arxivQueryGroups(fields, ["cs.ET"]);
  assert.equal(groups.length, 5);
  assert.deepEqual(groups[1], { key: "robotics", cats: ["cs.RO"] });
});
test("community reactions are capped and never become citation evidence", () => {
  const zero = paperProfile(paper("a", "vision", { upvotes: 0 }), now);
  const viral = paperProfile(paper("b", "vision", { upvotes: 1e9 }), now);
  assert.ok(viral.score - zero.score <= 4.001);
  assert.equal(viral.metric, undefined);
  assert.equal(viral.lane, "recent");
});
test("long-term badge requires dated real citation evidence and age", () => {
  const old = paper("a", "vision", { published_at: "2020-01-01", impact: { source: "Crossref", citations: 300, source_url: "https://api.crossref.org/works/10.123/a", checked_at: "2026-11-05" } });
  assert.equal(paperProfile(old, now).lane, "established");
  assert.equal(paperProfile({ ...old, impact: { ...old.impact, checked_at: "" } }, now).lane, "reference");
  assert.equal(paperProfile({ ...old, impact: { ...old.impact, source_url: "https://untrusted.example/count" } }, now).lane, "reference");
  assert.equal(paperProfile({ ...old, published_at: "2026-11-05" }, now).lane, "recent");
});
test("a metadata-only reference does not invent an abstract or implementation", () => {
  const item = paper("a", "bio", { abstract_en: "", reference_review: { source_url: "https://doi.org/10.123/a" } });
  assert.equal(paperProfile(item, now).quality, "metadata_only");
  assert.match(paperProfile(item, now).limitations_zh, /不会仅凭标题/);
  assert.equal(item.abstract_en, "");
  assert.equal(paperProfile({ ...item, reference_review: undefined }, now), null);
});
test("same-day merge refreshes measured fields while preserving Chinese", () => {
  const old = paper("arxiv:1234.56789", "vision", { arxiv_id: "1234.56789", title_zh: "旧译文", abstract_zh: "已有摘要", upvotes: 1, impact: { citations: 100 } });
  const fresh = { ...old, title_zh: "", abstract_zh: "", upvotes: 5, impact: undefined };
  const result = mergePaperRecords([old], [fresh]);
  assert.equal(result.length, 1);
  assert.equal(result[0].upvotes, 5);
  assert.equal(result[0].title_zh, "旧译文");
  assert.equal(result[0].abstract_zh, "已有摘要");
  assert.equal(result[0].impact.citations, 100);
});
test("caps apply after same-day merge and fields are interleaved", () => {
  const items = [...Array.from({ length: 20 }, (_, i) => paper(`v${i}`)), paper("b1", "bio"), paper("o1", "optics")];
  const result = selectPapers(items, { now, perField: 3 });
  assert.equal(result.length, 5);
  assert.deepEqual(result.slice(0, 3).map(p => p.field), ["vision", "bio", "optics"]);
  assert.equal(result.filter(p => p.field === "vision").length, 3);
});
test("stale daily items drop while a measured reference retains a slot", () => {
  const ref = paper("ref", "vision", { published_at: "2020-01-01", reference_review: { source_url: "https://doi.org/10.123/a" }, impact: { source: "Crossref", citations: 300, source_url: "https://api.crossref.org/works/10.123/a", checked_at: "2026-11-05" } });
  const items = [paper("stale", "vision", { published_at: "2026-01-01" }), paper("new"), ref];
  assert.deepEqual(new Set(selectPapers(items, { now, perField: 2 }).map(p => p.id)), new Set(["new", "ref"]));
});
test("Crossref DOI and title must both identify the catalog item", () => {
  const review = { doi: "10.123/example", title_match: "Target study" };
  assert.equal(crossrefMatches({ DOI: "10.123/example", title: ["Target study: methods"] }, review), true);
  assert.equal(crossrefMatches({ DOI: "10.123/example", title: ["Unrelated study"] }, review), false);
  assert.equal(crossrefMatches({ DOI: "10.123/other", title: ["Target study"] }, review), false);
});
