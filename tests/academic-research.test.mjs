import assert from "node:assert/strict";
import test from "node:test";
import { buildAcademicTopics, safeResearchUrl } from "../lib/academic-topics.mjs";
import { comparisons } from "../lib/academic-comparisons.mjs";
import { confirmedPublication, mergeWatchRecord, parseWatchAtom } from "../scripts/fetch-academic-watch.mjs";

const now = "2026-11-17T01:00:00.000Z";
const previousAt = "2026-11-16T01:00:00.000Z";
const updatedAt = "2026-11-17T12:00:00.000Z";
const id = "2611.12345";
const base = {
  id: "arxiv:" + id, url: "https://arxiv.org/abs/" + id,
  title_en: "Test Model", title_zh: "测试模型",
};
const initial = { version: 1, version_at: previousAt, title_en: base.title_en };
const doi = "10.1234/test.model";

test("only requested, explicitly versioned arXiv records can produce a revision", async () => {
  const entry = (recordId, version, revised) => `<entry><id>http://arxiv.org/abs/${recordId}${version}</id>
<published>2026-11-16T01:00:00Z</published><updated>${revised}</updated><title> Test   Model </title>
<arxiv:doi>${doi}</arxiv:doi><summary>Author resources</summary></entry>`;
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
${entry(id, "v2", now)}${entry(id, "", now)}${entry(id, "v3", "2026-12-01T00:00:00Z")}${entry("2611.99999", "v1", now)}</feed>`;
  const [entryV2, ...others] = await parseWatchAtom(xml, new Set([id]), Date.parse(now));
  assert.deepEqual(others, []);
  assert.equal(entryV2.version, 2);
  assert.equal(entryV2.version_at, now);
  assert.equal(entryV2.doi, doi);
  assert.equal(entryV2.title_en, base.title_en);
});

test("publication requires a matching deposited DOI, title, type and date", () => {
  const row = { ...base, doi };
  const matching = { DOI: doi.toUpperCase(), type: "proceedings-article", title: [" Test-Model "],
    published: { "date-parts": [[2026, 11, 16]] }, "container-title": ["Test Conference"] };
  const published = confirmedPublication(row, matching, Date.parse(now));
  assert.equal(published.url, "https://doi.org/" + doi);
  assert.equal(published.venue, "Test Conference");
  for (const changes of [
    { DOI: "10.1234/other" }, { type: "posted-content" }, { title: ["Another model"] },
    { published: { "date-parts": [[2026, 11, 18]] } },
    { published: { "date-parts": [[2026, 2, 31]] } },
  ]) assert.equal(confirmedPublication(row, { ...matching, ...changes }, Date.parse(now)), null);
});

test("watch creates events only after baseline and avoids replay on retries or regressions", () => {
  const v1 = mergeWatchRecord(base, initial, previousAt);
  assert.deepEqual(v1.events, []);
  const resources = [{ kind: "code", url: "https://github.com/example/Model", checked_at: now }];
  const publication = { doi, url: "https://doi.org/" + doi, published: "2026-11-16" };
  const changed = { ...initial, version: 2, version_at: now, resources, publication };
  const v2 = mergeWatchRecord(v1, changed, now);
  assert.deepEqual(v2.events.map(event => event.kind), ["version", "code", "publication"]);
  assert.equal(v2.events[0].url, base.url + "v2");
  assert.equal(v2.events[0].sourceAt, now);
  assert.deepEqual(mergeWatchRecord(v2, changed, updatedAt).events, v2.events);
  assert.equal(mergeWatchRecord(v2, initial, updatedAt), v2);
  assert.equal(mergeWatchRecord(v2, null, updatedAt), v2);
  const unavailable = mergeWatchRecord(v2, { ...changed, resources: [], frontier_unavailable: [resources[0].url.toLowerCase()] }, updatedAt);
  assert.deepEqual(unavailable.resources, []);
  assert.deepEqual(mergeWatchRecord(unavailable, changed, updatedAt).events, v2.events);
});

test("topic pages use Beijing calendar dates, de-duplicate results and link only verified author repositories", () => {
  const paper = { ...base, arxiv_id: id, published_at: "2026-11-10T16:00:00Z", published_precision: "day",
    ai_frontier: { topics: ["efficiency"], resources: [{ kind: "code",
      url: "https://github.com/author/VLM/tree/main", checked_at: "2026-11-16" }] } };
  const older = { ...paper, arxiv_id: "2611.54321", published_at: "2026-11-10T15:59:59.999Z" };
  const future = { ...paper, arxiv_id: "2611.11111", published_at: "2026-11-17T05:00:00Z" };
  const partial = { ...paper, arxiv_id: "2611.22222", published_precision: "month" };
  const repo = { full_name: "Author/VLM", url: "https://github.com/Author/VLM", created_at: previousAt };
  const unrelatedRepo = { ...repo, full_name: "Other/VLM", url: "https://github.com/Other/VLM", description_en: "Speculative decoding" };
  const news = { title_en: "Inference engine release", url: "https://example.com/news?a=1&utm_source=src", published_at: previousAt };
  const digest = buildAcademicTopics({
    frontier: [paper, older, future, partial], papers: [paper],
    news: [news, { ...news, url: "https://example.com/news?a=1#notice" },
      { ...news, title_en: "New research roundup", url: "https://example.com/roundup", source_summary: "Paper: " + base.url + "v2." }],
    repos: [repo, unrelatedRepo], asOf: now,
  });
  const group = digest.topics.find(topic => topic.key === "efficiency");
  assert.equal(digest.start, "2026-11-11");
  assert.equal(digest.end, "2026-11-17");
  assert.deepEqual(group.papers.map(item => item.title), ["Test Model"]);
  assert.equal(group.news.length, 2);
  assert.equal(group.news.find(item => item.title === news.title_en).paper, null);
  assert.equal(group.news.find(item => item.title === "New research roundup").paper.url, base.url);
  assert.equal(group.repos.find(item => item.title === "Author/VLM").paper.url, base.url);
  assert.equal(group.repos.find(item => item.title === "Other/VLM").paper, null);
  assert.equal(safeResearchUrl("https://github.com@evil.example/test"), null);
});

test("each comparison contains 2–3 papers with versioned primary evidence and task conditions", () => {
  assert.equal(comparisons.length, 3);
  for (const group of comparisons) {
    assert.ok(group.papers.length >= 2 && group.papers.length <= 3);
    for (const paper of group.papers) {
      assert.match(paper.url, /^https:\/\/arxiv\.org\/html\/\d{4}\.\d{4,5}v\d+$/);
      for (const key of ["method", "dataset", "baseline", "result", "setup"]) {
        assert.ok(paper.fields[key].every(value => value.length > 0));
      }
    }
  }
});
