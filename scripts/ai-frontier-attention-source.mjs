const PAPERS_API = "https://huggingface.co/api/papers/";
const PAPER_LIMIT = 30;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 6000;
const ARXIV_ID = /^(\d{2}(?:0[1-9]|1[0-2])\.\d{4,5})(?:v[1-9]\d*)?$/;

function sourceTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return NaN;
  return Date.parse(value);
}

function recentArxivPapers(items, startedAt) {
  const targets = new Map();
  for (const item of items) {
    if (item?.recommendation?.lane !== "recent" || typeof item.arxiv_id !== "string") continue;
    const match = ARXIV_ID.exec(item.arxiv_id);
    if (!match || (item.id !== "arxiv:" + match[1] && item.id !== "arxiv:" + item.arxiv_id)) continue;
    const publishedAt = sourceTime(item.published_at);
    if (!Number.isFinite(publishedAt) || publishedAt > startedAt) continue;
    if (!targets.has(match[1])) targets.set(match[1], new Set());
    targets.get(match[1]).add(item.id);
    if (targets.size === PAPER_LIMIT) break;
  }
  return [...targets];
}

/**
 * Observe upvote totals for the current recent-paper selection. Missing papers,
 * errors, and malformed counts produce no sample. A returned zero is observed.
 */
export async function observeFrontierLikes(items, { request = fetch, now = () => Date.now() } = {}) {
  const targets = recentArxivPapers(items, now());
  const observations = new Map();
  let next = 0;
  let rateLimited = false;

  async function sample() {
    while (!rateLimited && next < targets.length) {
      const [arxivId, paperIds] = targets[next++];
      try {
        const response = await request(PAPERS_API + arxivId, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          if (response.status === 429) rateLimited = true;
          await response.body?.cancel();
          continue;
        }
        const paper = await response.json();
        const measuredAt = now();
        const publishedAt = sourceTime(paper?.publishedAt);
        if (paper?.id !== arxivId || !Number.isSafeInteger(paper.upvotes) || paper.upvotes < 0
          || !Number.isFinite(publishedAt) || publishedAt > measuredAt) continue;

        const observation = { likes: paper.upvotes, measuredAt: new Date(measuredAt).toISOString() };
        for (const id of paperIds) observations.set(id, observation);
      } catch {
        // Transport and decoding failures leave this paper unobserved.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, sample));
  return observations;
}
