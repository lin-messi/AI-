export const CITATION_SOURCE = "Semantic Scholar";

const BATCH_API = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=externalIds,citationCount,publicationDate";
const PAPER_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 8000;
const ARXIV_ID = /^(\d{2}(?:0[1-9]|1[0-2])\.\d{4,5})(?:v[1-9]\d*)?$/;
const DOI = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;

function sourceTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return NaN;
  return Date.parse(value);
}

function citationTargets(items, startedAt) {
  const targets = new Map();
  for (const item of items) {
    const lane = item?.recommendation?.lane;
    if (lane !== "recent" && lane !== "established") continue;
    const published = sourceTime(item.published_at);
    if (!Number.isFinite(published) || published > startedAt) continue;

    // Keep the arXiv identity across runs even after a manuscript gets a venue DOI.
    const arxiv = typeof item.arxiv_id === "string" ? ARXIV_ID.exec(item.arxiv_id) : null;
    const doi = typeof item.doi === "string" && DOI.test(item.doi) ? item.doi.toLowerCase() : null;
    let lookup;
    if (arxiv && (item.id === "arxiv:" + arxiv[1] || item.id === "arxiv:" + item.arxiv_id)) {
      lookup = { key: "ARXIV:" + arxiv[1], field: "ArXiv", value: arxiv[1] };
    } else if (!item.arxiv_id && doi && typeof item.id === "string" && item.id.toLowerCase() === "doi:" + doi) {
      lookup = { key: "DOI:" + doi, field: "DOI", value: doi };
    } else {
      continue;
    }

    if (!targets.has(lookup.key)) {
      if (targets.size >= PAPER_LIMIT) continue;
      targets.set(lookup.key, { ...lookup, paperIds: new Set() });
    }
    targets.get(lookup.key).paperIds.add(item.id);
  }
  return [...targets.values()];
}

/**
 * Observe the current graph citation totals in one request. Omitted records and
 * unsuccessful requests produce no observation; a verified zero is retained.
 */
export async function observeFrontierCitations(items, {
  request = fetch,
  now = () => Date.now(),
  apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY,
} = {}) {
  const targets = citationTargets(items, now());
  const observations = new Map();
  if (!targets.length) return observations;

  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  try {
    const response = await request(BATCH_API, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: targets.map(target => target.key) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return observations;
    }

    const rows = await response.json();
    const measuredAt = now();
    if (!Array.isArray(rows) || rows.length !== targets.length || !Number.isFinite(measuredAt)) return observations;
    for (const [index, target] of targets.entries()) {
      const paper = rows[index];
      const externalId = paper?.externalIds?.[target.field];
      if (typeof externalId !== "string" || externalId.toLowerCase() !== target.value
        || !Number.isSafeInteger(paper.citationCount) || paper.citationCount < 0) continue;
      // Some indexed works have a citation count without a graph publication day.
      // Every target already has a valid local publication day.
      if (paper.publicationDate != null) {
        const published = sourceTime(paper.publicationDate);
        if (!Number.isFinite(published) || published > measuredAt) continue;
      }

      const observation = { count: paper.citationCount, measuredAt: new Date(measuredAt).toISOString() };
      for (const id of target.paperIds) observations.set(id, observation);
    }
  } catch {
    // Timeouts, rate limits, and malformed responses leave the current run unobserved.
  }
  return observations;
}
