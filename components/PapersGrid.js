"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import PaperCard from "./PaperCard";
import PaperReader from "./PaperReader";
import { interestCount } from "./FrontierAttention";

function compareObservedValues(first, second) {
  if (Number.isFinite(first) && Number.isFinite(second)) return second - first;
  return Number(Number.isFinite(second)) - Number(Number.isFinite(first));
}

function compareInterest(a, b, countOnly = false) {
  const first = a.community_interest;
  const second = b.community_interest;
  const countRanking = compareObservedValues(interestCount(first), interestCount(second));
  return countOnly ? countRanking : compareObservedValues(first?.delta, second?.delta) || countRanking;
}

export default function PapersGrid({ items, fields, aiFrontier = false, interestMetric = "likes", interestSource }) {
  const { lang, favs } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [sort, setSort] = useState("recommendation");
  const usesCitations = aiFrontier && interestMetric === "citations";
  const citationSort = sort === "citations" || sort === "citation-change";
  const displayedSort = usesCitations && sort === "heat" ? "citations" : !usesCitations && citationSort ? "heat" : sort;
  const [lane, setLane] = useState("all");
  const [onlyWithResources, setOnlyWithResources] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [active, setActive] = useState(null); // 当前打开的论文

  const PAGE = 60; // 每批渲染数量，避免一次渲染数百张卡片导致卡顿
  const [visible, setVisible] = useState(PAGE);

  const labelMap = useMemo(() => {
    const m = {};
    for (const f of fields) m[f.key] = lang === "en" ? f.label_en : f.label_zh;
    return m;
  }, [fields, lang]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (field !== "all") {
      if (aiFrontier) list = list.filter((p) => p.ai_frontier?.topics?.includes(field));
      else if (field === "frontier") list = list.filter((p) => p.frontier);
      else list = list.filter((p) => p.field === field);
    }
    if (onlyFav) list = list.filter((p) => favs.has(p.id));
    if (onlyFeatured) list = list.filter((p) => p.featured);
    if (lane !== "all") list = list.filter((p) => p.recommendation?.lane === lane);
    if (onlyWithResources) list = list.filter((p) => p.ai_frontier?.resources?.length > 0);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) =>
        [p.title_zh, p.title_en, p.abstract_zh, p.abstract_en, ...(p.subtags || []),
          ...(p.ai_frontier?.topics || []).map((key) => labelMap[key])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (displayedSort === "recommendation") {
      // The AI Frontier snapshot already interleaves directions and evidence lanes.
      if (aiFrontier) return list;
      list.sort((a, b) => {
        const ar = Number.isFinite(a.recommendation?.score), br = Number.isFinite(b.recommendation?.score);
        return ar && br ? b.recommendation.score - a.recommendation.score || (b.heat || 0) - (a.heat || 0)
          : Number(br) - Number(ar) || (b.heat || 0) - (a.heat || 0);
      });
      // Keep small fields visible in the combined feed; rank within each field first.
      if (field === "all") {
        const groups = new Map(fields.filter(entry => entry.key !== "frontier").map(entry => [entry.key, []]));
        for (const paper of list) {
          const key = paper.field || "other";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(paper);
        }
        const queues = [...groups.values()];
        list = [];
        for (let i = 0; queues.some(group => i < group.length); i++) for (const group of queues) if (group[i]) list.push(group[i]);
      }
    }
    else if (displayedSort === "heat") list.sort(aiFrontier ? compareInterest : (a, b) => (b.heat || 0) - (a.heat || 0));
    else if (displayedSort === "citations") list.sort((a, b) => compareInterest(a, b, true));
    else if (displayedSort === "citation-change") list.sort(compareInterest);
    else list.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    return list;
  }, [items, fields, field, displayedSort, lane, onlyFav, onlyFeatured, onlyWithResources, query, favs, aiFrontier, labelMap]);

  // 切换筛选/搜索/排序时重置可见数量，回到第一批
  useEffect(() => {
    setVisible(PAGE);
  }, [field, displayedSort, lane, onlyFav, onlyFeatured, onlyWithResources, query]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <span className="icon">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={lang === "en" ? "Search papers" : "搜索论文"}
            placeholder={t.searchPh}
          />
        </div>
        <div className="filters">
          <button className={`btn ${displayedSort === "recommendation" ? "active" : ""}`} onClick={() => setSort("recommendation")}>
            {lang === "en" ? "Recommended" : "综合推荐"}
          </button>
          {usesCitations ? <>
            <button className={`btn ${displayedSort === "citations" ? "active" : ""}`}
              aria-pressed={displayedSort === "citations"} onClick={() => setSort("citations")}>
              {lang === "en" ? "By citation count" : "按引用数"}
            </button>
            <button className={`btn ${displayedSort === "citation-change" ? "active" : ""}`}
              aria-pressed={displayedSort === "citation-change"} onClick={() => setSort("citation-change")}>
              {lang === "en" ? "By citation change" : "按引用变化"}
            </button>
          </> : <button
            className={`btn ${displayedSort === "heat" ? "active" : ""}`}
            aria-pressed={displayedSort === "heat"}
            onClick={() => setSort("heat")}
          >
            {t.sortHeat}
          </button>}
          <button
            className={`btn ${displayedSort === "time" ? "active" : ""}`}
            onClick={() => setSort("time")}
          >
            {t.sortNew}
          </button>
          {!aiFrontier && <button
            className={`btn ${onlyFeatured ? "active" : ""}`}
            onClick={() => setOnlyFeatured((v) => !v)}
          >
            ✦ {t.onlyFeatured}
          </button>}
          <button
            className={`btn ${onlyFav ? "active" : ""}`}
            onClick={() => setOnlyFav((v) => !v)}
          >
            ★ {t.fav}
          </button>
        </div>
      </div>

      <div className={aiFrontier ? "frontier-filters" : undefined}>
        <label className="evidence-filter">
          {lang === "en" ? "Recommendation type: " : "推荐类型："}
          <select value={lane} onChange={e => setLane(e.target.value)}>
            <option value="all">{t.all}</option>
            <option value="recent">{aiFrontier ? (lang === "en" ? "Last 30 days" : "近 30 天") : (lang === "en" ? "Recent research" : "近期成果")}</option>
            <option value="established">{lang === "en" ? "Established references" : "长期参考"}</option>
            {!aiFrontier && <option value="reference">{lang === "en" ? "Research references" : "研究 / 实现参考"}</option>}
          </select>
        </label>
        {aiFrontier && <label className="evidence-filter">
          <input type="checkbox" checked={onlyWithResources} onChange={e => setOnlyWithResources(e.target.checked)} />
          {lang === "en" ? "Has author resources" : "有作者资源"}
        </label>}
      </div>

      <div className="filters" style={{ marginTop: 4 }}>
        <button
          className={`btn ${field === "all" ? "active" : ""}`}
          aria-pressed={field === "all"}
          onClick={() => setField("all")}
        >
          {t.all}
        </button>
        {fields.map((f) => (
          <button
            key={f.key}
            className={`btn ${field === f.key ? "active" : ""}`}
            aria-pressed={field === f.key}
            onClick={() => setField(f.key)}
          >
            {lang === "en" ? f.label_en : f.label_zh}
          </button>
        ))}
      </div>

      {aiFrontier && <div className="frontier-result-count" aria-live="polite">
        <p>{lang === "en" ? `${filtered.length} papers` : `${filtered.length} 篇论文`}</p>
        {displayedSort === "heat" && <p>{lang === "en"
          ? "Hugging Face likes ranked by comparable change first, then by cumulative likes."
          : "热度来自 Hugging Face。先按可比较的点赞变化排序，其余论文按累计点赞排序。"}</p>}
        {displayedSort === "citations" && <p>{lang === "en"
          ? "Papers with citation records appear first, ranked by indexed count."
          : "有索引记录的论文按累计引用数排序。"}</p>}
        {displayedSort === "citation-change" && <p>{lang === "en"
          ? "Ranked by comparable citation change over about seven days, with cumulative citations as the fallback."
          : "优先按近 7 日的可比引用变化排序，其余论文按累计引用数排序。"}</p>}
      </div>}
      {filtered.length === 0 ? (
        <div className="empty">{aiFrontier ? (lang === "en" ? "No papers match these filters." : "没有符合当前筛选条件的论文。") : t.papersEmpty}</div>
      ) : (
        <div className="grid">
          {shown.map((p) => (
            <PaperCard
              key={p.id}
              paper={p}
              fieldLabel={labelMap[aiFrontier ? p.ai_frontier?.primary_topic : p.field] || p.field}
              onOpen={setActive}
              interestMetric={interestMetric}
              interestSource={interestSource}
            />
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

      {active && <PaperReader paper={active} onClose={() => setActive(null)} />}
    </>
  );
}
