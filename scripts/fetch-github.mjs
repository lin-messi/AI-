// Topic-directed AI/research repositories, with separate new and established lanes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateRepos } from "./enrich-github.mjs";
import { REPO_TOPICS, mergeEditorialItems } from "./editorial-policy.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const GH = path.join(DATA, "github");
const DAILY_TARGET = 32;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const daysAgoStr = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function searchRepos(query, perPage = 15) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "AINewsTracker/1.0", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { items: (await response.json()).items || [], checked_at: new Date().toISOString() };
    } catch (error) {
      console.log(`  · 查询第 ${attempt + 1} 次失败 (${error.message})`);
      if (attempt < 2) await sleep(8000 * (attempt + 1));
    }
  }
  return null;
}

export function normalizeGithubRepo(repo, checked_at = "") {
  return {
    id: repo.full_name, full_name: repo.full_name, name: repo.name,
    owner: typeof repo.owner === "string" ? repo.owner : repo.owner?.login || "",
    owner_avatar: repo.owner?.avatar_url || repo.owner_avatar || "",
    description_en: (repo.description || repo.description_en || "").trim(), description_zh: repo.description_zh || "", highlight_zh: repo.highlight_zh || "",
    stars: repo.stargazers_count ?? repo.stars ?? 0, forks: repo.forks_count ?? repo.forks ?? 0,
    language: repo.language || "", topics: Array.isArray(repo.topics) ? repo.topics : [],
    url: repo.html_url || repo.url, homepage: repo.homepage || "",
    created_at: repo.created_at || "", pushed_at: repo.pushed_at || "",
    license: typeof repo.license === "string" ? repo.license : repo.license?.spdx_id || "",
    archived: !!repo.archived, disabled: !!repo.disabled, is_fork: !!(repo.fork || repo.is_fork),
    checked_at: checked_at || repo.checked_at || "",
  };
}

export async function main() {
  fs.mkdirSync(GH, { recursive: true });
  const candidates = [];
  let successfulQueries = 0;
  for (const topic of REPO_TOPICS) {
    for (const lane of ["recent", "established"]) {
      const constraint = lane === "recent" ? `created:>=${daysAgoStr(90)} pushed:>=${daysAgoStr(90)} stars:>=5` : `created:<=${daysAgoStr(730)} pushed:>=${daysAgoStr(365)} stars:>=500`;
      const result = await searchRepos(`${topic.query} ${constraint} archived:false fork:false`);
      if (result) { successfulQueries++; candidates.push(...result.items.map(item => normalizeGithubRepo(item, result.checked_at))); }
      console.log(`  · ${topic.label_zh} / ${lane}: ${result?.items.length ?? "失败"}`);
      await sleep(process.env.GITHUB_TOKEN ? 2200 : 6500);
    }
  }
  if (!successfulQueries || !candidates.length) {
    console.log("所有定向查询均未返回可用项目，保留原快照及其抓取时间。");
    return;
  }
  const date = todayStr(), file = path.join(GH, `${date}.json`);
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(file, "utf8")).items || []; } catch {}
  const items = mergeEditorialItems(existing, candidates, { kind: "repo", maxItems: DAILY_TARGET });
  await translateRepos(items);
  fs.writeFileSync(file, JSON.stringify({ date, generatedAt: new Date().toISOString(), count: items.length, items }, null, 2), "utf8");
  const dates = fs.readdirSync(GH).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(name => name.slice(0, -5)).sort().reverse();
  fs.writeFileSync(path.join(DATA, "github-index.json"), JSON.stringify({ latest: dates[0], dates }, null, 2), "utf8");
  console.log(`完成：${date}，${items.length} 个相关项目（${successfulQueries} 个查询成功）。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
