// 抓取 GitHub 每日推荐开源项目（全领域热门，综合选取约 20 个/天）
// → GitHub Search API（新晋高星 + 近期活跃高星混合）→ 清洗 → 去重 → 翻译简介
// → 当天增量合并写入 data/github/<date>.json
// 运行：npm run fetch:github
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateRepos } from "./enrich-github.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const GH = path.join(DATA, "github");

const DAILY_TARGET = 20; // 每日推荐数量
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function todayStr() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

// 返回 N 天前的 UTC 日期（YYYY-MM-DD），用于 GitHub Search 的 created/pushed 过滤
function daysAgoStr(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// —— GitHub Search API ——
// 未配置 token 也能用（限频 10 次/分钟，本地测试足够）；
// 在 Actions 里用内置 GITHUB_TOKEN 注入，可提升到 30 次/分钟。
async function searchRepos(q, perPage = 30) {
  const token = process.env.GITHUB_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AINewsTracker/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url =
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=stars&order=desc&per_page=${perPage}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 403 || res.status === 429) {
        console.log(`  · 限频(${res.status})，退避重试…`);
        await sleep(8000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      console.log(`  · 查询第 ${attempt + 1} 次失败 (${e.message})，重试…`);
      await sleep(4000 * (attempt + 1));
    }
  }
  console.log(`  ✗ 查询失败：${q}`);
  return [];
}

function normalize(r) {
  return {
    id: r.full_name, // owner/repo，作为去重与收藏的稳定 key
    full_name: r.full_name,
    name: r.name,
    owner: r.owner?.login || "",
    owner_avatar: r.owner?.avatar_url || "",
    description_en: (r.description || "").trim(),
    description_zh: "",
    highlight_zh: "",
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    language: r.language || "",
    topics: Array.isArray(r.topics) ? r.topics.slice(0, 6) : [],
    url: r.html_url,
    homepage: r.homepage || "",
    created_at: r.created_at || "",
    pushed_at: r.pushed_at || r.updated_at || "",
  };
}

function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    const key = (it.id || it.full_name || "").toLowerCase();
    if (key && !seen.has(key)) seen.set(key, it);
  }
  return [...seen.values()];
}

async function main() {
  console.log("开始抓取 GitHub 推荐开源项目…");
  fs.mkdirSync(GH, { recursive: true });

  // 综合选取：A 桶=近 30 天新晋高星（新鲜、每天滑动变化）；
  //           B 桶=近 2 天活跃的中高星项目（覆盖正在迭代的成熟项目，增加多样性）。
  const bucketA = (await searchRepos(`created:>=${daysAgoStr(30)} stars:>=50`, 30)).map(
    normalize
  );
  console.log(`  ✓ A 桶（近 30 天新晋高星）：${bucketA.length} 个`);
  await sleep(2000);
  const bucketB = (
    await searchRepos(`pushed:>=${daysAgoStr(2)} stars:200..20000`, 30)
  ).map(normalize);
  console.log(`  ✓ B 桶（近 2 天活跃中高星）：${bucketB.length} 个`);

  // A 优先（更新鲜），合并去重，截取目标数量
  const picked = dedupe([...bucketA, ...bucketB]).slice(0, DAILY_TARGET);
  console.log(`  · 综合去重后取前 ${picked.length} 个`);

  // 翻译简介 + 生成一句话中文亮点（仅这 ~20 条，成本低）
  await translateRepos(picked);

  // 写入归档（当天增量合并：existing 在前，dedupe 保留已翻译版本，新项目追加，不截断）
  const date = todayStr();
  const file = path.join(GH, `${date}.json`);
  let existing = [];
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8")).items || [];
    } catch {}
  }
  const finalItems = dedupe([...existing, ...picked]).sort(
    (a, b) => (b.stars || 0) - (a.stars || 0)
  );

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    count: finalItems.length,
    items: finalItems,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `  合并：已有 ${existing.length} + 本次 ${picked.length} → 去重后 ${finalItems.length}`
  );

  // 更新索引
  const dates = fs
    .readdirSync(GH)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
  fs.writeFileSync(
    path.join(DATA, "github-index.json"),
    JSON.stringify({ latest: dates[0], dates }, null, 2),
    "utf8"
  );

  console.log(`\n完成：${date} 共 ${finalItems.length} 个项目，已写入 ${file}`);
}

main();
