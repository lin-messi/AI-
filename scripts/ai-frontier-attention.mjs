const HOUR = 3600000;
const DAY = 24 * HOUR;
export const HEATMAP_DAYS = 14;
const HISTORY_DAYS = HEATMAP_DAYS + 2;
const WINDOWS = {
  likes: { hours: 24, min: 18, max: 30, expires: 48 },
  citations: { hours: 168, min: 120, max: 216, expires: 14 * 24 },
};
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});

const toDay = time => dateFormat.format(new Date(time));
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const valueOf = point => point?.count ?? point?.likes;
const compareTime = (a, b) => Date.parse(a) - Date.parse(b);

export function attentionPaperRecord(paper) {
  const arxivId = String(paper.arxiv_id || "").match(/^\d{4}\.\d{4,5}$/)?.[0];
  if (!arxivId || paper.id !== "arxiv:" + arxivId || !paper.ai_frontier?.primary_topic) return null;
  return {
    id: paper.id,
    topic: paper.ai_frontier.primary_topic,
    lane: paper.recommendation?.lane,
    title_zh: paper.title_zh || "",
    title_en: paper.title_en,
    url: "https://arxiv.org/abs/" + arxivId,
  };
}

function validObservation(value, now) {
  const timestamp = Date.parse(value?.measuredAt);
  return isCount(valueOf(value)) && Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= HOUR;
}

function compactHistory(history, now) {
  const cutoff = toDay(now - (HISTORY_DAYS - 1) * DAY);
  const batches = history.filter(batch => {
    const at = Date.parse(batch.at);
    return Number.isFinite(at) && at <= now && toDay(at) >= cutoff;
  }).sort((a, b) => compareTime(a.at, b.at));
  // Keep the last four runs per Beijing day. Multiple retries within the
  // same hour add no useful baseline, but can add newly observed papers.
  const days = new Map();
  for (const raw of batches) {
    const batch = { at: raw.at, papers: raw.papers.map(({ likes, ...paper }) => isCount(paper.count ?? likes) ? { ...paper, count: paper.count ?? likes } : paper) };
    const time = Date.parse(batch.at);
    const date = toDay(time);
    const group = days.get(date) || [];
    const previous = group.at(-1);
    if (previous && Math.floor(Date.parse(previous.at) / HOUR) === Math.floor(time / HOUR)) {
      const rows = new Map(previous.papers.map(paper => [paper.id, paper]));
      for (const paper of batch.papers) {
        const existing = rows.get(paper.id);
        rows.set(paper.id, paper.measuredAt || !existing ? paper : { ...paper, count: existing.count, measuredAt: existing.measuredAt });
      }
      group[group.length - 1] = { at: batch.at, papers: [...rows.values()] };
    } else {
      group.push(batch);
    }
    days.set(date, group.slice(-4));
  }
  return [...days.values()].flat();
}

function getObservations(history) {
  const byId = new Map();
  for (const batch of history) {
    for (const paper of batch.papers) {
      if (!isCount(paper.count) || !Number.isFinite(Date.parse(paper.measuredAt))) continue;
      const list = byId.get(paper.id) || [];
      if (!list.some(existing => existing.measuredAt === paper.measuredAt)) list.push(paper);
      byId.set(paper.id, list);
    }
  }
  for (const list of byId.values()) list.sort((a, b) => compareTime(a.measuredAt, b.measuredAt));
  return byId;
}

function paperInterest(sample, observations, window) {
  const prior = observations.get(sample.id) || [];
  const end = Date.parse(sample.measuredAt);
  let baseline = null;
  let closest = Infinity;
  for (const point of prior) {
    const elapsed = (end - Date.parse(point.measuredAt)) / HOUR;
    if (elapsed < window.min || elapsed > window.max) continue;
    const distance = Math.abs(window.hours - elapsed);
    if (distance <= closest) {
      closest = distance;
      baseline = point;
    }
  }
  return {
    count: sample.count,
    measuredAt: sample.measuredAt,
    delta: baseline ? sample.count - baseline.count : null,
    baselineAt: baseline?.measuredAt || null,
  };
}

function latestByDate(history) {
  const days = new Map();
  for (const batch of history) {
    const date = toDay(Date.parse(batch.at));
    const latest = days.get(date) || new Map();
    for (const row of batch.papers) {
      const previous = latest.get(row.id);
      // Later misses don't erase a successful observation from the same day.
      latest.set(row.id, row.measuredAt || !previous ? row : { ...row, count: previous.count, measuredAt: previous.measuredAt });
    }
    days.set(date, latest);
  }
  return days;
}

function dailyHeatmap(history, topics, observations, now, window) {
  const daily = latestByDate(history);
  return Array.from({ length: HEATMAP_DAYS }, (_, i) => {
    const date = toDay(now - (HEATMAP_DAYS - 1 - i) * DAY);
    const rows = [...(daily.get(date)?.values() || [])];
    const cells = {};
    for (const key of topics) {
      const monitored = rows.filter(row => row.topic === key && row.lane !== "established");
      const papers = monitored.filter(row => isCount(row.count)).map(row => ({
        id: row.id, title_zh: row.title_zh, title_en: row.title_en, url: row.url,
        ...paperInterest(row, observations, window),
      }));
      const compared = papers.filter(paper => paper.delta !== null);
      cells[key] = {
        eligible: monitored.length, observed: papers.length, compared: compared.length,
        delta: compared.length ? compared.reduce((total, paper) => total + paper.delta, 0) : null,
        total: papers.length ? papers.reduce((sum, paper) => sum + paper.count, 0) : null,
        papers,
      };
    }
    return { date, cells };
  });
}

function selectReproduction(items, picks, today, now, leaderId) {
  const qualified = items.filter(paper => {
    const published = Date.parse(paper.published_at);
    const publicCode = paper.ai_frontier?.resources?.some(resource => {
      const checked = Date.parse(resource.checked_at);
      return resource.kind === "code" && Number.isFinite(checked) && checked <= now && now - checked <= 30 * DAY;
    });
    return paper.recommendation?.lane === "recent" && publicCode
      && published <= now && now - published <= 30 * DAY
      && Boolean(paper.recommendation.limitations_zh)
      && /\b(?:experiment\w*|benchmarks?|evaluation|evaluat\w+|ablations?|measured)\b/i.test(paper.abstract_en || "");
  });
  const distinct = qualified.filter(paper => paper.id !== leaderId);
  const candidates = distinct.length ? distinct : qualified;
  const sameDayPick = picks.find(pick => pick.date === today);
  if (sameDayPick && candidates.some(paper => paper.id === sameDayPick.paperId)) return sameDayPick;
  const recentPicks = new Set(picks.slice(-3).map(pick => pick.paperId));
  candidates.sort((a, b) => {
    const avoidRepeat = Number(recentPicks.has(a.id)) - Number(recentPicks.has(b.id));
    const materials = b.ai_frontier.resources.length - a.ai_frontier.resources.length;
    return avoidRepeat || materials || b.recommendation.score - a.recommendation.score || compareTime(b.published_at, a.published_at) || a.id.localeCompare(b.id);
  });
  return candidates[0] ? { date: today, paperId: candidates[0].id } : null;
}

export function buildFrontierAttention({ items, topics, previous = {}, observed = new Map(), now = Date.now(), metric = "likes", source = "Hugging Face" }) {
  const window = WINDOWS[metric];
  if (!window) throw new Error("Unknown frontier metric: " + metric);
  const today = toDay(now);
  const topicKeys = topics.map(topic => topic.key);
  const tracked = new Map();
  for (const item of items) {
    const lane = item.recommendation?.lane;
    if (lane !== "recent" && !(metric === "citations" && lane === "established")) continue;
    const published = Date.parse(item.published_at);
    if (!Number.isFinite(published) || published > now || (lane === "recent" && now - published > 30 * DAY)) continue;
    const record = attentionPaperRecord(item);
    if (record && topicKeys.includes(record.topic)) tracked.set(item.id, record);
  }

  const history = [...(previous.history || [])];
  if (tracked.size) {
    const papers = [...tracked.values()].map(paper => {
      const point = observed.get(paper.id);
      return validObservation(point, now) ? { ...paper, count: valueOf(point), measuredAt: point.measuredAt } : paper;
    });
    history.push({ at: new Date(now).toISOString(), papers });
  }
  const retained = compactHistory(history, now);
  const observations = getObservations(retained);
  const byPaper = {};
  let updatedAt = null;
  for (const list of observations.values()) {
    const last = list.at(-1);
    if (updatedAt === null || compareTime(last.measuredAt, updatedAt) > 0) updatedAt = last.measuredAt;
    if (!tracked.has(last.id) || now - Date.parse(last.measuredAt) > window.expires * HOUR) continue;
    const interest = paperInterest(last, observations, window);
    if (toDay(Date.parse(last.measuredAt)) !== today) {
      interest.delta = null;
      interest.baselineAt = null;
    }
    byPaper[last.id] = interest;
  }
  const ranked = Object.entries(byPaper).filter(([id]) => tracked.get(id)?.lane !== "established");
  const growth = ranked.filter(([, point]) => point.delta > 0)
    .sort(([idA, a], [idB, b]) => b.delta - a.delta || b.count - a.count || idA.localeCompare(idB))[0];
  const total = ranked.filter(([, point]) => point.count > 0)
    .sort(([idA, a], [idB, b]) => b.count - a.count || idA.localeCompare(idB))[0];
  const leader = growth ? { paperId: growth[0], mode: "growth" } : total ? { paperId: total[0], mode: "total" } : null;
  const picks = (previous.picks || []).filter(pick => pick.date <= today && pick.date >= toDay(now - 4 * DAY)).sort((a, b) => a.date.localeCompare(b.date));
  const reproduction = selectReproduction(items, picks, today, now, leader?.paperId);
  return {
    history: retained,
    picks: [...picks.filter(pick => pick.date !== today), ...(reproduction ? [reproduction] : [])],
    dashboard: {
      updatedAt, source, periodHours: window.hours, byPaper, leader, reproduction,
      days: dailyHeatmap(retained, topicKeys, observations, now, window),
    },
  };
}
