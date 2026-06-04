// 抓取「通用利器库」：本身不带 robomaster、但能直接用于 RM 任务的通用优质开源库。
// 来源 = 机构/仓库白名单（取实时数据）+ 主题搜索补充（严格门槛）。
// → 黑名单/相关性/星标/活跃度过滤 → 综合排序 → 翻译+RM用途 → 翻译后分类
// → 增量合并写入 data/robomaster-general.json（滚动池，非按日期）。
// 运行：npm run fetch:robomaster:general
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  CATEGORY_RULES,
  REPO_BLOCK_KW,
  GENERAL_WHITELIST,
  GENERAL_TOPIC_QUERIES,
  GENERAL_RELEVANCE_KW,
  GENERAL_MIN_STARS,
  GENERAL_ACTIVE_DAYS,
  GENERAL_MAX,
} from "./robomaster-feeds.mjs";
import { translateGeneralRepos } from "./enrich-github.mjs";
import { assessRMUsage } from "./enrich-rm-usage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const OUT = path.join(DATA, "robomaster-general.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RMAlgoTracker/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// 多标签分类：与 RM 原生库共用一套规则（CATEGORY_RULES / CATEGORIES）
function classify(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.kw.some((k) => lower.includes(k.toLowerCase()))) hits.push(rule.key);
  }
  const ordered = CATEGORIES.map((c) => c.key).filter((k) => hits.includes(k));
  return ordered.length ? ordered.slice(0, 3) : ["other"];
}

function normalizeRepo(r) {
  return {
    id: r.full_name,
    full_name: r.full_name,
    name: r.name,
    owner: r.owner?.login || (r.full_name || "").split("/")[0] || "",
    owner_avatar: r.owner?.avatar_url || "",
    description_en: (r.description || "").trim(),
    description_zh: "",
    highlight_zh: "",
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    language: r.language || "",
    topics: Array.isArray(r.topics) ? r.topics.slice(0, 6) : [],
    url: r.html_url || `https://github.com/${r.full_name}`,
    homepage: r.homepage || "",
    created_at: r.created_at || "",
    pushed_at: r.pushed_at || r.updated_at || "",
    source: "general",
    categories: [],
  };
}

function dedupeBy(items, keyFn) {
  const seen = new Map();
  for (const it of items) {
    const key = keyFn(it);
    if (key && !seen.has(key)) seen.set(key, it);
  }
  return [...seen.values()];
}

function daysSince(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 1e9;
  return (Date.now() - t) / 86400000;
}

// 综合评分：星标(对数) + 近期活跃 + 相关度命中 + 白名单加权
function scoreRepo(r) {
  const starScore = Math.log10((r.stars || 0) + 1); // 0 ~ ~5
  const d = daysSince(r.pushed_at);
  const activeBonus = d <= 90 ? 2 : d <= 365 ? 1 : 0;
  const text = `${r.full_name} ${r.description_en} ${(r.topics || []).join(" ")}`.toLowerCase();
  const relHits = GENERAL_RELEVANCE_KW.filter((k) => text.includes(k.toLowerCase())).length;
  const relScore = Math.min(relHits, 4) * 0.4;
  const whitelistBoost = r._whitelist ? 3 : 0;
  return starScore + activeBonus + relScore + whitelistBoost;
}

async function fetchWhitelistRepo(fullName) {
  const url = `https://api.github.com/repos/${fullName}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: ghHeaders() });
      if (res.status === 403 || res.status === 429) {
        console.log(`  · 限频(${res.status})，退避重试…`);
        await sleep(8000 * (attempt + 1));
        continue;
      }
      if (res.status === 404) {
        console.log(`  ✗ 白名单仓库不存在/已迁移：${fullName}`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.log(`  · ${fullName} 第 ${attempt + 1} 次失败 (${e.message})，重试…`);
      await sleep(4000 * (attempt + 1));
    }
  }
  console.log(`  ✗ 白名单仓库抓取失败：${fullName}`);
  return null;
}

async function searchRepos(q, perPage = 30) {
  const url =
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=stars&order=desc&per_page=${perPage}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: ghHeaders() });
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

function passesGates(r, { isWhitelist }) {
  const topics = (r.topics || []).map((x) => x.toLowerCase());
  const text = `${r.full_name} ${r.description_en} ${topics.join(" ")}`.toLowerCase();
  // 黑名单：FPS 游戏外挂等一律剔除
  if (REPO_BLOCK_KW.some((k) => text.includes(k.toLowerCase()))) return false;
  if (isWhitelist) return true; // 白名单：星标/活跃度/相关性均豁免
  if ((r.stars || 0) < GENERAL_MIN_STARS) return false;
  if (daysSince(r.pushed_at) > GENERAL_ACTIVE_DAYS) return false;
  // 相关性：需命中机器人/视觉语境词，避免纯 NLP/前端等无关高星库
  return GENERAL_RELEVANCE_KW.some((k) => text.includes(k.toLowerCase()));
}

async function main() {
  console.log("开始抓取 RoboMaster「通用利器库」…");

  // ===== 白名单 =====
  console.log(`\n[白名单] 取 ${GENERAL_WHITELIST.length} 个仓库实时数据…`);
  let pool = [];
  for (const fullName of GENERAL_WHITELIST) {
    const raw = await fetchWhitelistRepo(fullName);
    if (raw && raw.full_name) {
      const repo = normalizeRepo(raw);
      repo._whitelist = true;
      pool.push(repo);
      console.log(`  ✓ ${repo.full_name}  ★${repo.stars}`);
    }
    await sleep(700);
  }

  // ===== 主题搜索补充 =====
  console.log("\n[主题搜索] 自动发现新项目…");
  for (const q of GENERAL_TOPIC_QUERIES) {
    const items = (await searchRepos(q, 30)).map(normalizeRepo);
    console.log(`  ✓ 「${q}」：${items.length} 个`);
    pool.push(...items);
    await sleep(2500);
  }

  // ===== 过滤 + 去重 =====
  const whitelistSet = new Set(GENERAL_WHITELIST.map((s) => s.toLowerCase()));
  pool = dedupeBy(pool, (r) => (r.id || "").toLowerCase()).filter((r) =>
    passesGates(r, { isWhitelist: whitelistSet.has((r.id || "").toLowerCase()) || r._whitelist })
  );
  // 综合排序，截断
  pool = pool
    .map((r) => ({ r, s: scoreRepo(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, GENERAL_MAX)
    .map(({ r }) => {
      delete r._whitelist;
      return r;
    });
  console.log(`  · 过滤+排序后保留通用库：${pool.length}`);

  // ===== 增量合并（保留已翻译条目）=====
  let existing = [];
  if (fs.existsSync(OUT)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT, "utf8")).items || [];
    } catch {}
  }
  const existingMap = new Map(existing.map((r) => [(r.id || "").toLowerCase(), r]));
  const now = new Date().toISOString();
  // 用已有译文回填本次抓到的同一仓库（避免重复翻译），并刷新实时星标
  for (const r of pool) {
    const prev = existingMap.get((r.id || "").toLowerCase());
    if (prev) {
      if (!r.description_zh && prev.description_zh) r.description_zh = prev.description_zh;
      if (!r.highlight_zh && prev.highlight_zh) r.highlight_zh = prev.highlight_zh;
      if (!r.rm && prev.rm) r.rm = prev.rm; // 沿用已生成的 RM 用途评估，避免重复消耗
      // first_seen：沿用历史值；历史条目缺失则回填其更新时间，避免被误标为新。
      r.first_seen = prev.first_seen || prev.pushed_at || prev.created_at || now;
    } else {
      // 本次新发现的库：记为当前时间，供「最新」排序与 NEW 角标使用。
      r.first_seen = now;
    }
  }

  // 翻译简介 + 一句话用途亮点（仅缺失的）
  await translateGeneralRepos(pool);
  // 结构化 RM 用途评估（用途建议 + 对应赛事任务 + 实用度），仅评估缺失的条目
  await assessRMUsage(pool, "repo");
  // 翻译后分类：中文简介/用途更丰富，分类更准
  for (const r of pool) {
    const text = `${r.full_name} ${r.description_en} ${r.description_zh} ${r.highlight_zh} ${(r.topics || []).join(" ")}`;
    r.categories = classify(text);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    note: "通用利器：本身不带 robomaster、但能直接用于 RM 任务的优质开源库（白名单 + 主题搜索，每日刷新）。",
    count: pool.length,
    items: pool,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\n完成：通用利器库 ${pool.length} 个，已写入 ${OUT}`);
}

main();
