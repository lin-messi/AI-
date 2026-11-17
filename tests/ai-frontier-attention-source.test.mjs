import test from "node:test";
import assert from "node:assert/strict";
import { observeFrontierLikes } from "../scripts/ai-frontier-attention-source.mjs";

const NOW = Date.parse("2026-11-17T12:30:00Z");
const PUBLISHED = "2026-11-16T10:00:00Z";

function recent(arxivId, extra = {}) {
  return {
    id: "arxiv:" + arxivId,
    arxiv_id: arxivId,
    published_at: PUBLISHED,
    recommendation: { lane: "recent" },
    ...extra,
  };
}

function officialId(url) {
  const endpoint = new URL(url);
  assert.equal(endpoint.origin, "https://huggingface.co");
  assert.match(endpoint.pathname, /^\/api\/papers\/\d{4}\.\d{5}$/);
  return endpoint.pathname.split("/").at(-1);
}

test("records verified numeric zero and skips missing or untrustworthy paper counts", async () => {
  const valid = recent("2611.00001v2", { url: "https://example.invalid/not-an-api" });
  const wrongSource = recent("2611.00002");
  const noResult = recent("2611.00003");
  const futureSource = recent("2611.00004");
  const futureItem = recent("2611.00005", { published_at: "2026-11-18T12:00:00Z" });
  const reference = recent("2611.00006", { recommendation: { lane: "established" } });
  const invalidId = recent("../untrusted");
  const missingCount = recent("2611.00007");
  const mismatchedItem = recent("2611.00008", { id: "arxiv:2611.99999" });
  const stringCount = recent("2611.00009");
  const networkError = recent("2611.00010");
  const invalidCount = recent("2611.00011");
  const requested = [];
  const observations = await observeFrontierLikes([
    valid, wrongSource, noResult, futureSource, futureItem, reference, invalidId, missingCount,
    mismatchedItem, stringCount, networkError, invalidCount,
  ], {
    now: () => NOW,
    request: async (url, options) => {
      const id = officialId(url);
      requested.push(id);
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      if (id === noResult.arxiv_id) return new Response(null, { status: 404 });
      if (id === networkError.arxiv_id) throw new Error("temporary failure");
      if (id === wrongSource.arxiv_id) return Response.json({ id: "2611.99999", upvotes: 31, publishedAt: PUBLISHED });
      if (id === futureSource.arxiv_id) return Response.json({ id, upvotes: 5, publishedAt: "2026-11-18" });
      if (id === missingCount.arxiv_id) return Response.json({ id, publishedAt: PUBLISHED });
      if (id === stringCount.arxiv_id) return Response.json({ id, upvotes: "12", publishedAt: PUBLISHED });
      if (id === invalidCount.arxiv_id) return Response.json({ id, upvotes: -1, publishedAt: PUBLISHED });
      return Response.json({ id, upvotes: 0, publishedAt: PUBLISHED });
    },
  });

  assert.equal(requested.length, 8);
  assert.deepEqual([...observations], [[valid.id, { likes: 0, measuredAt: new Date(NOW).toISOString() }]]);
});

test("limits the number of papers and concurrent requests", async () => {
  const targetPapers = Array.from({ length: 36 }, (_, index) => recent("2611." + String(index + 1).padStart(5, "0")));
  let active = 0;
  let peak = 0;
  const observations = await observeFrontierLikes(targetPapers, {
    now: () => NOW,
    request: async url => {
      const id = officialId(url);
      active++;
      peak = Math.max(active, peak);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return Response.json({ id, upvotes: 17, publishedAt: PUBLISHED });
    },
  });
  assert.equal(observations.size, 30);
  assert.equal(peak, 4);
  for (const paper of targetPapers.slice(30)) assert.ok(!observations.has(paper.id));
});

test("an API rate limit stops the queue and preserves successful in-flight observations", async () => {
  const targetPapers = Array.from({ length: 10 }, (_, index) => recent("2611." + String(index + 1).padStart(5, "0")));
  let calls = 0;
  const observations = await observeFrontierLikes(targetPapers, {
    now: () => NOW,
    request: async url => {
      const id = officialId(url);
      if (++calls === 1) return new Response(null, { status: 429, headers: { "Retry-After": "30" } });
      await new Promise(resolve => setImmediate(resolve));
      return Response.json({ id, upvotes: 1, publishedAt: PUBLISHED });
    },
  });
  assert.equal(calls, 4);
  assert.equal(observations.size, 3);
  assert.ok(!observations.has(targetPapers[0].id));
});
