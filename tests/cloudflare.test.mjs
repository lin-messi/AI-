import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import worker from "../worker/index.mjs";
import { GET as pdf } from "../app/api/paper-pdf/route.js";

const request = (path, body, extra = {}) => new Request(`https://example.com${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body),
});

test("export includes every indexed archive, current pages and a real 404", async () => {
  for (const page of ["", "papers/", "github/", "robomaster/", "404/"]) {
    await fs.access(`.cloudflare-build/out/${page}index.html`);
  }
  for (const [index, route] of [["index", "archive"], ["papers-index", "papers"], ["github-index", "github"], ["robomaster-index", "robomaster"]]) {
    const { dates } = JSON.parse(await fs.readFile(`data/${index}.json`, "utf8"));
    for (const date of dates) await fs.access(`.cloudflare-build/out/${route}/${date}/index.html`);
  }
});

test("live status matches latest source data and is not cached", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/status"), {});
  const status = await response.json();
  const { latest } = JSON.parse(await fs.readFile("data/index.json", "utf8"));
  const day = JSON.parse(await fs.readFile(`data/archive/${latest}.json`, "utf8"));
  assert.equal(status.news.generatedAt, day.generatedAt);
  assert.equal(status.news.count, day.items.length);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("translation rejects invalid inputs without making AI calls", async () => {
  for (const [body, expected] of [[{}, 400], [{ title: 42 }, 400], [{ title: "a".repeat(1001) }, 413], [{ title: "a".repeat(16001) }, 413]]) {
    assert.equal((await worker.fetch(request("/api/translate", body), {})).status, expected);
  }
  assert.equal((await worker.fetch(request("/api/translate", { title: "Paper" }, { origin: "https://evil.example" }), {})).status, 403);
  assert.equal((await worker.fetch(request("/api/translate", { title: "Paper" }), {})).status, 503);
  assert.equal((await worker.fetch(new Request("https://example.com/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), {})).status, 400);
});

test("translation uses Cloudflare bindings and returns the existing response fields", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://ai.example/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      assert.equal(JSON.parse(options.body).model, "test-model");
      return Response.json({ choices: [{ message: { content: JSON.stringify({ results: [{ title_zh: "标题", abstract_zh: "摘要", highlight_zh: "亮点", digest_zh: "精读" }] }) } }] });
    };
    const response = await worker.fetch(request("/api/translate", { title: "Paper", abstract: "Summary" }), { AI_API_KEY: "test-key", AI_BASE_URL: "https://ai.example/v1", AI_MODEL: "test-model" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).digest_zh, "精读");
  } finally { globalThis.fetch = original; }
});

test("PDF proxy streams allowed PDFs and checks every redirect", async () => {
  assert.equal((await pdf(new Request("https://example.com/api/paper-pdf?url=http://arxiv.org/pdf/test"))).status, 403);
  assert.equal((await pdf(new Request("https://example.com/api/paper-pdf?url=https://evil.example/test"))).status, 403);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/private" } });
    assert.equal((await pdf(new Request("https://example.com/api/paper-pdf?url=https://arxiv.org/pdf/test"))).status, 403);
    globalThis.fetch = async () => new Response("%PDF-test", { headers: { "content-type": "application/pdf" } });
    const response = await pdf(new Request("https://example.com/api/paper-pdf?url=https://arxiv.org/pdf/test"));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "%PDF-test");
  } finally { globalThis.fetch = original; }
});

test("unknown API routes return 404; non-API routes use assets binding", async () => {
  assert.equal((await worker.fetch(new Request("https://example.com/api/missing"), {})).status, 404);
  const response = await worker.fetch(new Request("https://example.com/papers/"), { ASSETS: { fetch: () => new Response("page") } });
  assert.equal(await response.text(), "page");
});
