import test from "node:test";
import assert from "node:assert/strict";
import { fillTranslationGaps, translateRMContent, missingRMTranslation } from "../scripts/rm-translations.mjs";
import { translateOnePaper, translatePapersFull } from "../scripts/enrich-papers.mjs";

test("digest APIs and batch enrichment never invent content from a title without an abstract", async () => {
  await assert.rejects(translateOnePaper({ title: "Only a title", abstract: "" }, { env: {} }), /来源未提供摘要/);
  assert.equal(await translatePapersFull([{ title_en: "Only a title", abstract_en: "" }]), 0);
});

test("new translations fill old cumulative blanks without replacing good translations or metadata", () => {
  const old = { id: "same", title_zh: "", abstract_zh: " ", digest_zh: "已有精读", rm: { usage: "Old rules" }, first_seen: "old-date" };
  fillTranslationGaps(old, { title_zh: "中文标题", abstract_zh: "中文摘要", digest_zh: "其他精读", rm: { usage: "Different rules" }, first_seen: "new-date" });
  assert.equal(old.title_zh, "中文标题");
  assert.equal(old.abstract_zh, "中文摘要");
  assert.equal(old.digest_zh, "已有精读");
  assert.equal(old.first_seen, "old-date");
  assert.equal(old.rm.usage, "Old rules");
  fillTranslationGaps(old, { title_zh: "", abstract_zh: "" });
  assert.equal(old.abstract_zh, "中文摘要");
});

test("final pool beyond the old 40-title limit gets both titles and abstracts, existing prose is preserved", async () => {
  const items = Array.from({ length: 55 }, (_, i) => ({ id: i, title_en: `Paper ${i}`, abstract_en: `English abstract ${i}` }));
  items[0].title_zh = "已校对的标题";
  const result = await translateRMContent(items, "paper", {
    config: { enabled: true },
    chat: async messages => {
      const user = messages[1].content;
      const input = JSON.parse(user.slice(user.lastIndexOf("\n") + 1));
      return { results: input.map(p => ({ i: p.i, title_zh: `译文${p.title}`, abstract_zh: `中文摘要：${p.abstract}` })) };
    },
  });
  assert.deepEqual(result, { completed: 55, remaining: 0 });
  assert.equal(items[0].title_zh, "已校对的标题");
  assert.ok(items.every(p => !missingRMTranslation(p, "paper")));
  assert.ok(items[54].abstract_zh.includes("中文摘要"));
});

test("failed or malformed translation is reported as incomplete and never clears existing Chinese", async () => {
  const item = { title_en: "Paper", title_zh: "原有标题", abstract_en: "Abstract", abstract_zh: "" };
  let checkpoints = 0;
  const failed = await translateRMContent([item], "paper", {
    config: { enabled: true }, chat: async () => { throw new Error("upstream"); }, checkpoint: () => checkpoints++,
  });
  assert.equal(failed.remaining, 1);
  assert.equal(item.title_zh, "原有标题");
  assert.equal(checkpoints, 1);
  const malformed = await translateRMContent([item], "paper", {
    config: { enabled: true }, chat: async () => ({ results: [{ i: 0, title_zh: "English only", abstract_zh: "Still English" }, { i: 20, abstract_zh: "越界" }] }),
  });
  assert.equal(malformed.remaining, 1);
  assert.equal(item.abstract_zh, "");
});

test("new general repos get Chinese descriptions; unavailable AI never claims success", async () => {
  const repo = { full_name: "org/uav", description_en: "Autopilot" };
  const unavailable = await translateRMContent([repo], "repo", { config: { enabled: false } });
  assert.equal(unavailable.remaining, 1);
  const result = await translateRMContent([repo], "repo", { config: { enabled: true }, chat: async () => ({ results: [{ i: 0, description_zh: "自主飞行控制软件" }] }) });
  assert.equal(result.remaining, 0);
  assert.equal(repo.description_zh, "自主飞行控制软件");
});

test("a source with no original abstract never acquires a fabricated abstract from translation", async () => {
  const item = { title_en: "Paper with DOI metadata only", abstract_en: "" };
  await translateRMContent([item], "paper", { config: { enabled: true }, chat: async () => ({ results: [{ i: 0, title_zh: "仅有元数据的论文", abstract_zh: "不能当作原文摘要的内容" }] }) });
  assert.equal(item.title_zh, "仅有元数据的论文");
  assert.equal(item.abstract_zh, undefined);
});
