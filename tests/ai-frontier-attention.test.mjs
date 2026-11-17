import test from "node:test";
import assert from "node:assert/strict";
import { buildFrontierAttention } from "../scripts/ai-frontier-attention.mjs";

const now = Date.parse("2026-11-17T03:00:00Z");
const hour = 3600000;
const topics = [{ key: "vision" }, { key: "learning" }];
const record = (number, topic = "vision", reproduction = true) => {
  const arxiv_id = "2611." + String(number).padStart(5, "0");
  return {
    id: "arxiv:" + arxiv_id,
    arxiv_id,
    published_at: "2026-11-13T03:00:00Z",
    title_en: "Paper " + number,
    title_zh: "论文 " + number,
    abstract_en: "The paper documents experiments on the test benchmark.",
    ai_frontier: { primary_topic: topic, resources: reproduction ? [{ kind: "code", url: "https://github.com/lab/project", checked_at: "2026-11-16" }] : [] },
    recommendation: { lane: "recent", score: 45, limitations_zh: "对照作者的数据和实验设置。" },
  };
};
const read = (pairs, time) => new Map(pairs.map(([paper, likes]) => [paper.id, { likes, measuredAt: new Date(time).toISOString() }]));

test("first snapshot shows real zero, distinguishes unobserved papers and falls back to cumulative likes", () => {
  const high = record(1);
  const zero = record(2);
  const missing = record(3);
  const fixture = buildFrontierAttention({ items: [high, zero, missing], topics, now, observed: read([[high, 21], [zero, 0]], now) });
  const { dashboard } = fixture;
  assert.equal(dashboard.days.length, 14);
  assert.equal(dashboard.days[0].date, "2026-11-04");
  assert.deepEqual(dashboard.leader, { paperId: high.id, mode: "total" });
  assert.equal(dashboard.byPaper[zero.id].count, 0);
  assert.equal(dashboard.byPaper[missing.id], undefined);
  const { vision, learning } = dashboard.days.at(-1).cells;
  assert.deepEqual([vision.eligible, vision.observed, vision.compared, vision.total, vision.delta], [3, 2, 0, 21, null]);
  assert.equal(learning.total, null);
  assert.equal(dashboard.reproduction.paperId, zero.id);
});

test("around-24-hour growth uses the closest measured baseline and can rank below a larger cumulative total", () => {
  const topTotal = record(1);
  const topGrowth = record(2);
  const falling = record(3, "learning");
  const constant = record(4);
  const items = [topTotal, topGrowth, falling, constant];
  const baseline = now - 23 * hour;
  const first = buildFrontierAttention({ items, topics, now: baseline, observed: read([[topTotal, 95], [topGrowth, 5], [falling, 3], [constant, 0]], baseline) });
  const impossible = new Map([[topGrowth.id, { likes: 120, measuredAt: new Date(now + hour).toISOString() }]]);
  const earlier = buildFrontierAttention({ items, topics, previous: first, now: now - 3 * hour, observed: impossible });
  const current = buildFrontierAttention({ items, topics, previous: earlier, now, observed: read([[topTotal, 100], [topGrowth, 13], [falling, 2], [constant, 0]], now) });
  const { dashboard } = current;
  assert.deepEqual(dashboard.leader, { paperId: topGrowth.id, mode: "growth" });
  assert.equal(dashboard.byPaper[topGrowth.id].delta, 8);
  assert.equal(Date.parse(dashboard.byPaper[topGrowth.id].baselineAt), baseline);
  assert.equal(dashboard.byPaper[constant.id].delta, 0);
  const { vision, learning } = dashboard.days.at(-1).cells;
  assert.deepEqual([vision.eligible, vision.observed, vision.compared, vision.delta], [3, 3, 3, 13]);
  assert.equal(learning.delta, -1);
});

test("shorter intervals do not produce a near-24-hour delta, and failures do not erase same-day observations", () => {
  const a = record(1);
  const b = record(2, "learning", false);
  const items = [a, b];
  const first = buildFrontierAttention({ items, topics, now: now - 2 * hour, observed: read([[a, 4]], now - 2 * hour) });
  const second = buildFrontierAttention({ items, topics, previous: first, now, observed: read([[a, 7], [b, 0]], now) });
  const outage = buildFrontierAttention({ items, topics, previous: second, now: now + 10 * 60000 });
  assert.equal(outage.dashboard.byPaper[a.id].count, 7);
  assert.equal(outage.dashboard.byPaper[a.id].delta, null);
  assert.equal(outage.dashboard.byPaper[b.id].count, 0);
  assert.equal(outage.dashboard.updatedAt, new Date(now).toISOString());
  assert.equal(outage.dashboard.reproduction.paperId, a.id);
});

test("article changes and recommendations are dated in Beijing, with no stale growth on the next day", () => {
  const a = record(1);
  const baseline = now - 24 * hour;
  const first = buildFrontierAttention({ items: [a], topics, now: baseline, observed: read([[a, 4]], baseline) });
  const second = buildFrontierAttention({ items: [a], topics, previous: first, now, observed: read([[a, 7]], now) });
  const later = buildFrontierAttention({ items: [a], topics, previous: second, now: now + 14 * hour });
  assert.equal(later.dashboard.days.at(-1).date, "2026-11-18");
  assert.equal(later.dashboard.byPaper[a.id].delta, null);
  assert.equal(later.dashboard.leader.mode, "total");
  assert.equal(later.dashboard.reproduction.date, "2026-11-18");
  assert.equal(later.dashboard.days.at(-2).cells.vision.delta, 3);
});


test("citations use separate seven-day baselines, including historical counts for sorting only", () => {
  const a = { ...record(1), published_at: "2026-11-01T03:00:00Z" };
  const baselinePaper = { ...record(2), published_at: "2020-01-01T03:00:00Z", recommendation: { lane: "established" } };
  const items = [a, baselinePaper];
  const options = { items, topics, metric: "citations", source: "Citation index" };
  const lastWeek = now - 7 * 24 * hour;
  const first = buildFrontierAttention({ ...options, now: lastWeek, observed: read([[a, 1], [baselinePaper, 20]], lastWeek) });
  const yesterday = now - 24 * hour;
  const middle = buildFrontierAttention({ ...options, now: yesterday, previous: first, observed: read([[a, 2], [baselinePaper, 50]], yesterday) });
  const finish = buildFrontierAttention({ ...options, now, previous: middle, observed: read([[a, 4], [baselinePaper, 80]], now) });
  assert.equal(finish.dashboard.periodHours, 168);
  assert.equal(finish.dashboard.source, "Citation index");
  assert.equal(finish.dashboard.byPaper[a.id].delta, 3);
  assert.equal(finish.dashboard.byPaper[baselinePaper.id].count, 80);
  assert.equal(finish.dashboard.byPaper[baselinePaper.id].delta, 60);
  assert.equal(finish.dashboard.leader.paperId, a.id);
  assert.equal(finish.dashboard.days.at(-1).cells.vision.total, 4);
});
