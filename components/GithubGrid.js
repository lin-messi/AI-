"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import RepoCard from "./RepoCard";

export default function GithubGrid({ items }) {
  const { lang, favs } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [sort, setSort] = useState("recommendation");
  const [lane, setLane] = useState("all");
  const [topic, setTopic] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);

  const PAGE = 60;
  const [visible, setVisible] = useState(PAGE);

  const topics = useMemo(() => {
    const map = new Map();
    for (const repo of items) for (const entry of repo.recommendation?.topics || []) map.set(entry.key, entry);
    return [...map.values()];
  }, [items]);

  // 当前数据里出现过的语言（按项目数排序，取前 10 个做筛选标签）
  const languages = useMemo(() => {
    const m = new Map();
    for (const r of items) {
      if (r.language) m.set(r.language, (m.get(r.language) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0]);
  }, [items]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (language !== "all") list = list.filter((r) => r.language === language);
    if (lane !== "all") list = list.filter((r) => r.recommendation?.lane === lane);
    if (topic !== "all") list = list.filter((r) => (r.recommendation?.topics || []).some(entry => entry.key === topic));
    if (onlyFav) list = list.filter((r) => favs.has(r.id));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((r) =>
        [r.full_name, r.description_zh, r.description_en, ...(r.topics || [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (sort === "recommendation") list.sort((a, b) => {
      const ar = Number.isFinite(a.recommendation?.score), br = Number.isFinite(b.recommendation?.score);
      return ar && br ? b.recommendation.score - a.recommendation.score || (b.stars || 0) - (a.stars || 0)
        : Number(br) - Number(ar) || (b.stars || 0) - (a.stars || 0);
    });
    else if (sort === "stars") list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    else list.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
    return list;
  }, [items, language, sort, lane, topic, onlyFav, query, favs]);

  useEffect(() => {
    setVisible(PAGE);
  }, [language, sort, lane, topic, onlyFav, query]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <span className="icon">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.repoSearchPh}
          />
        </div>
        <div className="filters">
          <button className={`btn ${sort === "recommendation" ? "active" : ""}`} onClick={() => setSort("recommendation")}>
            {lang === "en" ? "Recommended" : "综合推荐"}
          </button>
          <button
            className={`btn ${sort === "stars" ? "active" : ""}`}
            onClick={() => setSort("stars")}
          >
            {t.sortStars}
          </button>
          <button
            className={`btn ${sort === "time" ? "active" : ""}`}
            onClick={() => setSort("time")}
          >
            {t.sortNew}
          </button>
          <button
            className={`btn ${onlyFav ? "active" : ""}`}
            onClick={() => setOnlyFav((v) => !v)}
          >
            ★ {t.fav}
          </button>
        </div>
      </div>

      <div className="evidence-filters">
        <label className="evidence-filter">
          {lang === "en" ? "Recommendation type: " : "推荐类型："}
          <select value={lane} onChange={e => setLane(e.target.value)}>
            <option value="all">{t.all}</option>
            <option value="recent">{lang === "en" ? "Recently updated" : "近期更新"}</option>
            <option value="established">{lang === "en" ? "Established references" : "长期参考"}</option>
            <option value="reference">{lang === "en" ? "Implementation references" : "研究 / 实现参考"}</option>
          </select>
        </label>
        {topics.length > 0 && <label className="evidence-filter">
          {lang === "en" ? "Topic: " : "方向："}
          <select value={topic} onChange={e => setTopic(e.target.value)}>
            <option value="all">{t.all}</option>
            {topics.map(entry => <option key={entry.key} value={entry.key}>{lang === "en" ? entry.label_en || entry.label_zh : entry.label_zh || entry.label_en}</option>)}
          </select>
        </label>}
      </div>

      {languages.length > 0 && (
        <div className="filters" style={{ marginTop: 4 }}>
          <button
            className={`btn ${language === "all" ? "active" : ""}`}
            onClick={() => setLanguage("all")}
          >
            {t.all}
          </button>
          {languages.map((l) => (
            <button
              key={l}
              className={`btn ${language === l ? "active" : ""}`}
              onClick={() => setLanguage(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">{t.githubEmpty}</div>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
      )}

      {visible < filtered.length && (
        <div className="load-more">
          <button className="btn" onClick={() => setVisible((v) => v + PAGE)}>
            {t.loadMore}（{filtered.length - visible}）
          </button>
        </div>
      )}
    </>
  );
}
