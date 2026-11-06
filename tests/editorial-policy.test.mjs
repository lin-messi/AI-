import test from "node:test";
import assert from "node:assert/strict";
import { repoProfile, newsProfile, classifyNewsSource, validPublicationDate, selectEditorialItems, mergeEditorialItems } from "../scripts/editorial-policy.mjs";
import { normalizeGithubRepo } from "../scripts/fetch-github.mjs";
import { normalizeNewsEntry, refreshNewsMetadata, classifyNewsCategory, dedupeNews } from "../scripts/fetch-news.mjs";

const now = Date.parse("2026-11-06T12:00:00Z");
const checked_at = "2026-11-06T11:00:00Z";
const repo = (extra = {}) => ({ id: "lab/inference", full_name: "lab/inference", owner: "lab", description_en: "A large language model inference framework", url: "https://github.com/lab/inference", stars: 20, created_at: "2026-10-20T00:00:00Z", pushed_at: "2026-11-06T00:00:00Z", checked_at, license: "Apache-2.0", ...extra });
const news = (extra = {}) => ({ id: "news1", title_en: "An AI model release", summary_en: "The company released its model.", url: "https://techcrunch.com/2026/model/", published_at: "2026-11-06T08:00:00Z", lang: "en", category: "product", ...extra });

test("reject popular unrelated applications even when incidental MCP or AI is mentioned", () => {
  for (const [name, description] of [
    ["cleanyourtv", "Debloat any Android or Google TV over Wi-Fi and get an Apple TV-style home."],
    ["wordcraft", "An open-source, clean-room reimplementation of Microsoft Word in pure Rust"],
    ["solidcraft", "An open-source parametric 3D CAD application. Desktop, web, and automation through MCP."],
    ["nxnative", "Switch games running natively on iPhone, iPad and Mac"],
    ["aerial-tv", "给国产电视的一块干净桌面：开源 Android TV 桌面，没有广告。"],
    ["random", "A program for retail scheduling and email management"],
  ]) assert.equal(repoProfile(repo({ name, full_name: `example/${name}`, description_en: description, topics: ["ai", "machine-learning"], stars: 1000000 }), now), null, name);
});

test("an owner or repository name containing an AI brand is not evidence of the project's purpose", () => {
  for (const full_name of ["deepseek-fan/camping", "pytorch-fan/camping", "holiday/pytorch-fan", "holiday/deepseek-travel", "holiday/scipy-fan", "holiday/vllm-fan"]) {
    assert.equal(repoProfile(repo({ full_name, name: full_name.split("/")[1], description_en: "Camping reservations and holiday travel itinerary management", created_at: "2020-01-01", stars: 10000 }), now), null, full_name);
  }
});

test("specific AI, robotics, language, and scientific purposes qualify without giant stars", () => {
  for (const description_en of ["A machine learning toolkit in Python", "An autonomous agent system", "Computer vision object detection", "Speech recognition and text-to-speech", "Robot navigation using SLAM", "Differentiable simulation for scientific computing", "CUDA kernels for model inference"]) {
    const result = repoProfile(repo({ description_en, stars: 5 }), now);
    assert.equal(result.lane, "recent", description_en);
    assert.ok(result.topics.length);
  }
});

test("specific research purposes outrank generic ML words without inferring an AI systems category from a brand", () => {
  assert.equal(repoProfile(repo({ description_en: "SDK for robotics teams to verify AI model training data" }), now).topics[0].key, "robotics");
  assert.equal(repoProfile(repo({ full_name: "scipy/scipy", description_en: "SciPy library main repository", url: "https://github.com/scipy/scipy" }), now).topics[0].key, "science");
  assert.equal(repoProfile(repo({ description_en: "A high-precision physics toolkit driven by LLM agents" }), now).topics[0].key, "science");
  assert.equal(repoProfile(repo({ description_en: "A large language model for DeepSeek" }), now).topics.some(topic => topic.key === "systems"), false);
  assert.equal(repoProfile(repo({ description_en: "MATLAB Pro Windows Installer steps in README", topics: ["scientific-computing"] }), now), null);
});

test("old maintained repositories are not called new and established needs dated evidence", () => {
  const old = repo({ created_at: "2020-01-01T00:00:00Z", stars: 10000 });
  assert.equal(repoProfile(old, now).lane, "established");
  assert.equal(repoProfile({ ...old, checked_at: "" }, now).lane, "reference");
  assert.equal(repoProfile({ ...old, stars: 20 }, now).lane, "reference");
  assert.equal(repoProfile({ ...old, created_at: "" }, now).lane, "reference");
  assert.equal(repoProfile({ ...old, checked_at: "2027-01-01" }, now).lane, "reference");
});

test("a million stars add only bounded score and cannot admit unrelated repositories", () => {
  const small = repoProfile(repo({ stars: 5 }), now);
  const large = repoProfile(repo({ stars: 1000000 }), now);
  assert.ok(large.score - small.score < 2);
  assert.equal(repoProfile(repo({ description_en: "TV launcher", stars: 1000000 }), now), null);
  for (const flag of ["archived", "disabled", "is_fork"]) assert.equal(repoProfile(repo({ [flag]: true }), now), null);
});

test("normalization preserves actual API safety, license, date and popularity metadata", () => {
  const normalized = normalizeGithubRepo({ full_name: "lab/code", name: "code", owner: { login: "lab" }, html_url: "https://github.com/lab/code", stargazers_count: 42, forks_count: 3, license: { spdx_id: "MIT" }, archived: true, disabled: true, fork: true, updated_at: "2026-11-06" }, checked_at);
  assert.equal(normalized.license, "MIT"); assert.equal(normalized.checked_at, checked_at);
  assert.equal(normalized.stars, 42); assert.equal(normalized.forks, 3);
  assert.ok(normalized.archived && normalized.disabled && normalized.is_fork);
  assert.equal(normalized.pushed_at, "", "metadata updated_at is not a code push");
});

test("same-day merge updates real metadata and fills old translations, removes now archived repos", () => {
  const existing = [repo({ stars: 10, description_zh: "已有中文", highlight_zh: "已有亮点" })];
  const result = mergeEditorialItems(existing, [repo({ stars: 50, description_zh: "", highlight_zh: "" })], { kind: "repo", now });
  assert.equal(result.length, 1); assert.equal(result[0].stars, 50); assert.equal(result[0].recommendation.metric.value, 50);
  assert.equal(result[0].description_zh, "已有中文"); assert.equal(result[0].highlight_zh, "已有亮点");
  assert.equal(mergeEditorialItems(existing, [repo({ archived: true })], { kind: "repo", now }).length, 0);
});

test("repository selection bounds total, owner and topic dominance while retaining niche lanes", () => {
  const candidates = Array.from({ length: 50 }, (_, index) => repo({ id: `org${index}/model`, full_name: `org${index}/model`, owner: `org${index}`, url: `https://github.com/org${index}/model`, stars: 100000 - index }));
  candidates.push(repo({ id: "niche/robot", full_name: "niche/robot", owner: "niche", url: "https://github.com/niche/robot", description_en: "Robot navigation using SLAM", stars: 5 }));
  candidates.push(repo({ id: "old/robot", full_name: "old/robot", owner: "old", url: "https://github.com/old/robot", description_en: "Robot navigation using SLAM", created_at: "2017-01-01", stars: 800 }));
  const selected = selectEditorialItems(candidates, { kind: "repo", now, maxItems: 10 });
  assert.ok(selected.length <= 10);
  assert.ok(selected.some(item => item.id === "niche/robot"));
  assert.ok(selected.some(item => item.id === "old/robot"));
  assert.ok(selected.filter(item => item.recommendation.topics[0].key === "models").length <= 3);
});

test("news provenance uses URL domain, never the self-reported source name", () => {
  assert.equal(classifyNewsSource("https://openai.com/index/announcement"), "primary");
  assert.equal(classifyNewsSource("https://news.google.com/rss/articles/123"), "aggregator");
  assert.equal(classifyNewsSource("https://techcrunch.com/story"), "report");
  assert.equal(classifyNewsSource("https://openai.com.untrusted.example/story"), "unknown");
  const result = newsProfile(news({ url: "https://news.google.com/rss/articles/123", source: "OpenAI Official" }), now);
  assert.equal(result.source_type, "aggregator");
  assert.ok(result.limitations_zh.includes("不代表已交叉核实"));
});

test("missing, invalid and future dates never become today; RSS RFC dates are accepted", () => {
  for (const value of ["", undefined, "not-a-date", "2027-01-01", "2026-02-31", "5"]) assert.equal(validPublicationDate(value, now), null);
  assert.equal(validPublicationDate("Fri, 06 Nov 2026 08:00:00 GMT", now), "2026-11-06T08:00:00.000Z");
  const feed = { source: "Test", lang: "en", url: "https://example.org/feed" };
  for (const pubDate of [undefined, "invalid", "2027-01-01"]) {
    const result = normalizeNewsEntry({ title: "An AI model release", link: "https://example.org/story", pubDate }, feed, now);
    assert.equal(result.published_at, "");
    assert.equal(result.recommendation.lane, "reference");
    assert.equal(selectEditorialItems([result], { kind: "news", now }).length, 0);
  }
});

test("word-boundary classification prevents act/law inside unrelated words from becoming policy", () => {
  assert.equal(classifyNewsCategory("An AI factory demonstrates interactive model training"), "product");
  assert.equal(classifyNewsCategory("Researchers study an AI benchmark"), "research");
  assert.equal(classifyNewsCategory("The EU AI Act regulation"), "policy");
  assert.equal(refreshNewsMetadata(news({ title_en: "An AI benchmark", category: "policy" }), now).category, "research");
});

test("news relevance rejects incidental character sequences and AI translations cannot admit unrelated originals", () => {
  assert.equal(newsProfile(news({ title_en: "Retail chain reports gains", summary_en: "The company announced a new railway route.", title_zh: "AI 模型发布" }), now), null);
  assert.ok(newsProfile(news({ title_en: "An artificial intelligence model release" }), now));
  const original = { ...news(), source_title: "Retail store opens", source_summary: "A new local store.", summary_en: "AI artificial intelligence model benchmark " .repeat(20) };
  assert.equal(newsProfile(original, now), null);
  const minimal = { ...news(), source_title: "AI model release", source_summary: "Only a headline.", summary_en: "A long generated AI explanation ".repeat(40) };
  assert.ok(newsProfile(minimal, now).limitations_zh.includes("原文内容较少"));
  assert.equal(newsProfile(minimal, now).score, newsProfile({ ...minimal, summary_en: "" }, now).score);
  assert.equal(newsProfile(news({ title_en: "A phone system update", summary_en: "Routine device maintenance and installation details. ".repeat(20) + "Related links: AI release" }), now), null);
  assert.ok(newsProfile(news({ title_en: "An AI phone system update" }), now).score > newsProfile(news({ title_en: "A phone system update", summary_en: "An AI assistant feature is included." }), now).score);
});

test("news selection excludes duplicate papers, enforces source/category caps and recent real dates", () => {
  const articles = Array.from({ length: 30 }, (_, index) => news({ id: `n${index}`, url: `https://techcrunch.com/news${index}`, title_en: `AI model release ${index}` }));
  articles.push(news({ id: "paper", url: "https://arxiv.org/abs/1234", source: "arXiv cs.AI", category: "research" }));
  articles.push(news({ id: "old", url: "https://theverge.com/old", published_at: "2026-10-01" }));
  articles.push(news({ id: "policy", url: "https://openai.com/policy", title_en: "AI policy announcement", category: "policy" }));
  const selected = selectEditorialItems(articles, { kind: "news", now, maxItems: 10 });
  assert.ok(selected.length <= 10); assert.ok(selected.filter(item => new URL(item.url).hostname === "techcrunch.com").length <= 3);
  assert.ok(selected.every(item => !["old", "paper"].includes(item.id)));
  assert.ok(selected.some(item => item.id === "policy"));
});

test("duplicate-title news does not consume multiple recommendation slots or lose translations", () => {
  const first = news({ title_zh: "已有中文" });
  const second = news({ url: "https://theverge.com/model", summary_en: "A more detailed original description of the AI model release." });
  const deduped = dedupeNews([first, second]);
  assert.equal(deduped.length, 1); assert.equal(deduped[0].title_zh, "已有中文");
  assert.equal(selectEditorialItems([first, second], { kind: "news", now }).length, 1);
});
