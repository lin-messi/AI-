import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchAIFrontier, frontierArxivQuery, parseFrontierAtom } from "../scripts/fetch-ai-frontier.mjs";

const NOW = Date.parse("2026-11-17T12:30:00Z");

test("arXiv candidates preserve first submission and author resource mentions", async () => {
  const entry = (id, published) => `
    <entry>
      <id>http://arxiv.org/abs/${id}v2</id>
      <updated>2026-11-17T00:00:00Z</updated>
      ${published ? `<published>${published}</published>` : ""}
      <title>Visual Understanding</title>
      <summary>Author code at https://github.com/example/project</summary>
      <author><name>Ada Example</name></author>
      <category term="cs.LG"/>
      <category term="cs.CV"/>
      <arxiv:primary_category term="cs.CV"/>
      <arxiv:comment>Data: https://huggingface.co/datasets/example/project</arxiv:comment>
    </entry>`;
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
    <title>arXiv Query</title>
    ${entry("2611.00001", "2026-11-01T04:12:00Z")}
    ${entry("2611.00002")}
    ${entry("2611.00003", "2026-11-18T00:00:00Z")}
  </feed>`;
  const [paper, ...others] = await parseFrontierAtom(atom, NOW);
  assert.deepEqual(others, []);
  assert.equal(paper.id, "arxiv:2611.00001");
  assert.equal(paper.published_at, "2026-11-01T04:12:00.000Z");
  assert.equal(paper.field, "vision");
  assert.deepEqual(paper.authors, ["Ada Example"]);
  assert.match(paper.source_comment, /huggingface\.co\/datasets\/example\/project/);
  assert.match(paper.abstract_en, /https:\/\/github\.com\/example\/project/);
  assert.equal(paper.frontier_resources, undefined, "an author mention is not yet verified");
});

test("directed arXiv queries apply subject and date constraints", () => {
  const query = frontierArxivQuery({ cats: ["cs.CV", "cs.LG"], queryTerms: ["visual grounding", "video diffusion"] }, NOW);
  assert.match(query, /^\(cat:cs\.CV OR cat:cs\.LG\) AND /);
  assert.match(query, /ti:"visual grounding" OR abs:"visual grounding"/);
  assert.match(query, /submittedDate:\[202610181230 TO 202611171230\]$/);
});

test("empty offline refresh emits a usable snapshot without inventing a successful update time", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "frontier-collector-"));
  try {
    const result = await fetchAIFrontier({ archiveOnly: true, dataDir, now: NOW });
    assert.equal(result.generatedAt, null);
    assert.deepEqual(result.items, []);
    assert.equal(result.topics.length, 6);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, "ai-frontier.json"), "utf8")), result);
  } finally {
    await fs.rm(path.join(dataDir, "ai-frontier.json"), { force: true });
    await fs.rmdir(dataDir);
  }
});
