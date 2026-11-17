import test from "node:test";
import assert from "node:assert/strict";
import { selectAIFrontier } from "../scripts/ai-frontier-policy.mjs";
import { authorArtifactLinks, verifyFrontierResources } from "../scripts/ai-frontier-resources.mjs";

const now = Date.parse("2026-11-17T12:00:00Z");
const paper = (id, title, fields = {}) => ({
  id: `arxiv:${id}`, arxiv_id: id, url: `https://arxiv.org/abs/${id}`,
  title_en: title, cats: ["cs.CV", "cs.LG"], field: "vision", published_at: "2026-11-15T12:00:00Z",
  abstract_en: "We report experiments against controlled baselines and compare results across benchmarks using the stated data and evaluation settings.",
  ...fields,
});

test("uses the original publication date and treats narrow title matches as the primary direction", () => {
  const newPaper = paper("2611.00001", "Speculative decoding for vision-language models");
  const future = paper("2611.00002", "An image generation benchmark", { published_at: "2026-11-18" });
  const stale = paper("2610.00003", "An image generation benchmark", { published_at: "2026-10-17" });
  const missing = paper("2611.00004", "An image generation benchmark", { published_at: "" });
  const incidental = paper("2611.00005", "Adaptive software licensing", { abstract_en: `Past papers on image generation compare various benchmarks. ${newPaper.abstract_en}` });
  const result = selectAIFrontier([incidental, future, stale, missing, newPaper], { now });
  assert.deepEqual(result.map(item => item.id), [newPaper.id]);
  assert.deepEqual(result[0].ai_frontier.topics, ["efficiency", "multimodal"]);
  assert.equal(result[0].ai_frontier.stage, "preprint");
});

test("balances the directions and keeps a measured historical baseline alongside recent artifacts", () => {
  const code = { kind: "code", url: "https://github.com/lab/implementation", checked_at: "2026-11-16" };
  const codePaper = paper("2611.00011", "Semantic segmentation with author implementation", { frontier_resources: [code] });
  const otherDirection = paper("2611.00012", "Fine-tuning vision-language models");
  const baseline = paper("2001.00001", "Neural radiance fields for novel view synthesis", {
    published_at: "2020-01-01", doi: "10.0000/example",
    reference_review: { doi: "10.0000/example", source_url: "https://doi.org/10.0000/example" },
    impact: { source: "Crossref", source_url: "https://api.crossref.org/works/10.0000%2Fexample", citations: 300, checked_at: "2026-11-16" },
  });
  const fake = paper("2001.00002", "Semantic segmentation", { ...baseline, id: "arxiv:2001.00002", url: "https://arxiv.org/abs/2001.00002", impact: { ...baseline.impact, source_url: "https://api.crossref.org/works/10.0000/other" } });
  const similar = Array.from({ length: 12 }, (_, i) => paper(`2611.001${String(i).padStart(2,"0")}`, `Semantic segmentation method ${i}`));
  const result = selectAIFrontier([otherDirection, baseline, fake, ...similar, codePaper], { now });
  assert.deepEqual(result.slice(0, 2).map(item => item.id), [otherDirection.id, codePaper.id]);
  assert.equal(result.length, 6);
  assert.equal(result.find(item => item.id === baseline.id).recommendation.lane, "established");
  assert.equal(result.find(item => item.id === baseline.id).ai_frontier.stage, "published");
  assert.deepEqual(result.find(item => item.id === codePaper.id).ai_frontier.resources, [code]);
});

test("a paper's claimed repository must expose source files before receiving a resource badge", async () => {
  const paperWithLinks = paper("2611.00021", "An object detection benchmark", {
    source_comment: "Code is available at https://github.com/lab/code. Our dataset is available at https://huggingface.co/datasets/lab/cases. Code will be available at https://github.com/lab/future. Baseline code is available at https://github.com/lab/baseline.",
  });
  assert.deepEqual(authorArtifactLinks(paperWithLinks).map(link => link.kind), ["code", "data"]);
  const request = async url => {
    if (url.includes("api.github.com/repos/lab/code/git/trees/")) return Response.json({ tree: [{ type: "blob", path: "README.md" }] });
    if (url === "https://api.github.com/repos/lab/code") return Response.json({ size: 10, default_branch: "main" });
    if (url === "https://huggingface.co/api/datasets/lab/cases") return Response.json({ siblings: [{ rfilename: "test.parquet" }] });
    throw Error(`Unexpected request ${url}`);
  };
  await verifyFrontierResources([paperWithLinks], { request, now });
  const selected = selectAIFrontier([paperWithLinks], { now })[0];
  assert.deepEqual(selected.ai_frontier.resources.map(resource => resource.kind), ["data"]);
  assert.deepEqual(paperWithLinks.frontier_unavailable, ["https://github.com/lab/code"]);
});
