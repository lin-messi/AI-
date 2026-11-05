import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQARow, qaContext, qaFingerprint } from "../scripts/rm-qa.mjs";
import { rulesFingerprint } from "../scripts/rm-recommendation-policy.mjs";
const row = (number, question, answer, attachments = []) => ({ lastUpdateTime: 1790000000000,
  answers: [ [0, String(number)], [479990952, "超级对抗赛 University Championship"], [479990953, "制作规范"], [479990955, question], [479990959, answer], [479990947, "School to omit"] ]
    .map(([queId, value]) => ({ queId, values: [{ value }] })).concat([{ queId: 479990956, values: attachments }]) });

test("preserve a short official answer together with the exact question and scope, omit identity fields", () => {
  const entry = normalizeQARow(row(331, "无人机遥控器是否允许其他品牌？", "不可以"));
  assert.equal(entry.answer, "不可以");
  assert.equal(entry.competition, "RMUC");
  assert.equal(entry.status, "answered");
  assert.equal(JSON.stringify(entry).includes("School to omit"), false);
});

test("unanswered, administrative or unseen image-dependent cases are excluded from automated advice", () => {
  const items = [ normalizeQARow(row(326, "无人机故障如何处理", "请正确填写身份信息后进行规则答疑。")),
    normalizeQARow(row(100, "无人机通信问题", "")), normalizeQARow(row(101, "无人机如图是否合规", "允许", [{ value: "image" }])) ];
  const context = qaContext([{ title_en: "Quadrotor flight control" }], { title: "2027", source_url: "source", items });
  for (const item of items) assert.equal(context.includes(`[答疑 #${item.number}`), false);
});

test("include complete numbered questions and answers, flag future updates and honor context budget", () => {
  const q = normalizeQARow(row(294, "1.无人机通信？\n2.飞行中？", "1.仅库内\n2.可见光通信，后续更新具体要求"));
  assert.equal(q.provisional, true);
  const qa = { title: "2027", source_url: "source", items: [q] };
  const text = qaContext([{ title_en: "Quadrotor flight control" }], qa, 1000);
  assert.ok(text.includes(q.question) && text.includes(q.answer));
  assert.ok(text.includes("含待更新说明"));
  assert.ok(text.length <= 1000);
  const changed = structuredClone(qa); changed.items[0].answer = "New official answer";
  assert.notEqual(qaFingerprint(qa.items), qaFingerprint(changed.items));
  assert.notEqual(rulesFingerprint({ clarifications: { fingerprint: qaFingerprint(qa.items) } }), rulesFingerprint({ clarifications: { fingerprint: qaFingerprint(changed.items) } }));
});
