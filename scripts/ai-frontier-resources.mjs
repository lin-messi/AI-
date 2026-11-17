// Follow links explicitly connected to artifacts by authors in arXiv records.
// Requests go only to the public GitHub and Hugging Face metadata APIs.
const DAY = 86400000;
const PATH_PART = /^[a-z0-9][a-z0-9_.-]*$/i;
const CODE_FILE = /\.(?:py|ipynb|rs|c|cc|cpp|cu|go|jl|r|m|js|ts|java|sh)$/i;
const DATA_FILE = /\.(?:parquet|arrow|csv|tsv|jsonl|zip|tar|gz|hdf5|mp4|png)$/i;
const WEIGHTS_FILE = /\.(?:safetensors|gguf|pt|pth|ckpt|bin|onnx)$/i;

function parseArtifact(value, kind) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.every(part => PATH_PART.test(part))) return null;
  if (kind === "code" && url.hostname === "github.com" && parts.length === 2) {
    return { kind, url: `https://github.com/${parts.join("/")}`, endpoint: `https://api.github.com/repos/${parts.join("/")}` };
  }
  if (url.hostname === "huggingface.co") {
    const isDataset = kind === "data" && parts.length === 3 && parts[0] === "datasets";
    const isModel = kind === "weights" && parts.length === 2;
    if (isDataset || isModel) return { kind, url: `https://huggingface.co/${parts.join("/")}`, endpoint: `https://huggingface.co/api/${isDataset ? "datasets" : "models"}/${parts.slice(-2).join("/")}` };
  }
  return null;
}

const AUTHOR_LINKS = [
  ["code", /\b(?:source code|code(?: repository)?|implementation)(?: (?:and|with) (?:models?|weights|data))?(?: (?:is|are) (?:publicly )?(?:available|released) (?:at|on|from)|\s*:)\s*(https:\/\/github\.com\/[^\s<>}]+)/gi],
  ["data", /\b(?:benchmark dataset|dataset|data)(?: (?:is|are) (?:publicly )?(?:available|released) (?:at|on|from)|\s*:)\s*(https:\/\/huggingface\.co\/datasets\/[^\s<>}]+)/gi],
  ["weights", /\b(?:model weights|weights|checkpoints?)(?: (?:is|are) (?:publicly )?(?:available|released) (?:at|on|from)|\s*:)\s*(https:\/\/huggingface\.co\/[^\s<>}]+)/gi],
];

export function authorArtifactLinks(item) {
  const text = `${item.abstract_en || ""}\n${item.source_comment || ""}`;
  const links = new Map();
  for (const [kind, pattern] of AUTHOR_LINKS) {
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(Math.max(0, match.index - 75), match.index);
      if (/\b(?:baseline|third.party|unofficial|reference|prior work|original)\b[^.!?\n]{0,45}$/i.test(prefix)) continue;
      const artifact = parseArtifact(match[1].replace(/[,.);\]]+$/, ""), kind);
      if (artifact) links.set(artifact.url.toLowerCase(), artifact);
    }
  }
  return [...links.values()].slice(0, 3);
}

async function fetchMetadata(url, request) {
  const headers = { Accept: "application/json", "User-Agent": "AIFrontierTracker/1.0" };
  if (new URL(url).hostname === "api.github.com" && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await request(url, { headers, redirect: "error", signal: AbortSignal.timeout(8000) });
  if ([404, 410, 451].includes(response.status)) return false;
  if (!response.ok) return null;
  return response.json();
}

async function artifactExists(artifact, request) {
  const metadata = await fetchMetadata(artifact.endpoint, request);
  if (!metadata) return metadata;
  if (metadata.private || metadata.disabled || metadata.gated) return false;
  if (artifact.kind === "code") {
    if (!metadata.default_branch || !metadata.size) return false;
    const tree = await fetchMetadata(`${artifact.endpoint}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`, request);
    if (!tree) return tree;
    if (tree.tree?.some(file => file.type === "blob" && CODE_FILE.test(file.path) && !file.path.startsWith(".github/"))) return true;
    return tree.truncated ? null : false;
  }
  const files = metadata.siblings;
  if (!Array.isArray(files)) return null;
  return files.some(file => (artifact.kind === "data" ? DATA_FILE : WEIGHTS_FILE).test(file.rfilename));
}

export async function verifyFrontierResources(candidates, { limit = 20, now = Date.now(), request = fetch } = {}) {
  let requests = 0;
  const checked = new Map();
  for (const paper of candidates) {
    const known = [...(paper.frontier_review?.resources || []), ...(paper.frontier_resources || [])];
    const present = new Map(known.map(resource => [resource.url.toLowerCase(), resource]));
    const unavailable = new Set(paper.frontier_unavailable || []);
    const possible = new Map(authorArtifactLinks(paper).map(artifact => [artifact.url.toLowerCase(), artifact]));
    for (const resource of known) {
      const artifact = parseArtifact(resource.url, resource.kind);
      if (artifact) possible.set(artifact.url.toLowerCase(), artifact);
    }
    for (const [url, artifact] of possible) {
      const prior = present.get(url);
      if (prior && !unavailable.has(url) && now - Date.parse(prior.checked_at) < 7 * DAY) continue;
      if (!checked.has(url)) {
        if (requests >= limit) continue;
        requests++;
        try { checked.set(url, await artifactExists(artifact, request)); }
        catch { checked.set(url, null); }
      }
      if (checked.get(url) === null) continue;
      if (checked.get(url)) {
        present.set(url, { kind: artifact.kind, url: artifact.url, checked_at: new Date(now).toISOString() });
        unavailable.delete(url);
      } else {
        present.delete(url);
        unavailable.add(url);
      }
    }
    if (present.size) paper.frontier_resources = [...present.values()];
    else delete paper.frontier_resources;
    if (unavailable.size) paper.frontier_unavailable = [...unavailable];
    else delete paper.frontier_unavailable;
  }
  return candidates;
}
