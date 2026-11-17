import test from "node:test";
import assert from "node:assert/strict";
import { CITATION_SOURCE, observeFrontierCitations } from "../scripts/ai-frontier-citation-source.mjs";

const NOW = Date.parse("2026-11-17T12:30:00Z");
const PUBLISHED = "2026-11-16";

function paper(arxivId, extra = {}) {
  return {
    id: "arxiv:" + arxivId,
    arxiv_id: arxivId,
    published_at: PUBLISHED,
    recommendation: { lane: "recent" },
    ...extra,
  };
}

test("batches known arXiv and DOI identities and records an observed zero", async () => {
  const current = paper("2611.00001v2", { doi: "10.2222/published", url: "https://example.invalid" });
  const reference = {
    id: "doi:10.2222/Research",
    doi: "10.2222/Research",
    published_at: "2020-12-31",
    recommendation: { lane: "established" },
  };
  const unindexed = paper("2611.00003");
  const wrong = paper("2611.00004");
  const stringCount = paper("2611.00005");
  const futureGraph = paper("2611.00006");
  const malformed = paper("../elsewhere");
  const futureLocal = paper("2611.00007", { published_at: "2026-11-19" });
  let requestCount = 0;
  const observed = await observeFrontierCitations(
    [current, reference, unindexed, wrong, stringCount, futureGraph, malformed, futureLocal],
    {
      now: () => NOW,
      apiKey: undefined,
      request: async (url, options) => {
        requestCount++;
        const endpoint = new URL(url);
        assert.equal(endpoint.origin, "https://api.semanticscholar.org");
        assert.equal(endpoint.pathname, "/graph/v1/paper/batch");
        assert.equal(endpoint.searchParams.get("fields"), "externalIds,citationCount,publicationDate");
        assert.equal(options.method, "POST");
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        assert.deepEqual(JSON.parse(options.body).ids, [
          "ARXIV:2611.00001", "DOI:10.2222/research", "ARXIV:2611.00003", "ARXIV:2611.00004",
          "ARXIV:2611.00005", "ARXIV:2611.00006",
        ]);
        return Response.json([
          { externalIds: { ArXiv: "2611.00001" }, citationCount: 0, publicationDate: PUBLISHED },
          { externalIds: { DOI: "10.2222/Research" }, citationCount: 241, publicationDate: null },
          null,
          { externalIds: { ArXiv: "2611.99999" }, citationCount: 7 },
          { externalIds: { ArXiv: "2611.00005" }, citationCount: "8" },
          { externalIds: { ArXiv: "2611.00006" }, citationCount: 8, publicationDate: "2026-11-19" },
        ]);
      },
    },
  );
  assert.equal(CITATION_SOURCE, "Semantic Scholar");
  assert.equal(requestCount, 1);
  assert.deepEqual([...observed], [
    [current.id, { count: 0, measuredAt: new Date(NOW).toISOString() }],
    [reference.id, { count: 241, measuredAt: new Date(NOW).toISOString() }],
  ]);
});

test("does not turn lookup errors or incomplete batch responses into zero citations", async () => {
  const items = [paper("2611.00001"), paper("2611.00002")];
  for (const request of [
    async () => new Response(null, { status: 429 }),
    async () => { throw new Error("temporarily unreachable"); },
    async () => Response.json([{ externalIds: { ArXiv: "2611.00001" }, citationCount: 9 }]),
  ]) {
    const observed = await observeFrontierCitations(items, { request, now: () => NOW });
    assert.equal(observed.size, 0);
  }
});

test("limits the single batch to 50 distinct papers and accepts an optional API key", async () => {
  const items = Array.from({ length: 60 }, (_, index) => paper("2611." + String(index + 1).padStart(5, "0")));
  const observed = await observeFrontierCitations(items, {
    now: () => NOW,
    apiKey: "test-key",
    request: async (_, options) => {
      assert.equal(options.headers["x-api-key"], "test-key");
      const { ids } = JSON.parse(options.body);
      assert.equal(ids.length, 50);
      return Response.json(ids.map(key => ({ externalIds: { ArXiv: key.slice(6) }, citationCount: 5 })));
    },
  });
  assert.equal(observed.size, 50);
});
