"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import PaperCard from "./PaperCard";
import PaperReader from "./PaperReader";

export default function PapersGrid({ items, fields }) {
  const { lang, favs } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [sort, setSort] = useState("heat");
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
    if (field !== "all") list = list.filter((p) => p.field === field);
    if (onlyFav) list = list.filter((p) => favs.has(p.id));
    if (onlyFeatured) list = list.filter((p) => p.featured);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) =>
        [p.title_zh, p.title_en, p.abstract_zh, p.abstract_en, ...(p.subtags || [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (sort === "heat") list.sort((a, b) => b.heat - a.heat);
    else list.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    return list;
  }, [items, field, sort, onlyFav, onlyFeatured, query, favs]);

  // 切换筛选/搜索/排序时重置可见数量，回到第一批
  useEffect(() => {
    setVisible(PAGE);
  }, [field, sort, onlyFav, onlyFeatured, query]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <span className="icon">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPh}
          />
        </div>
        <div className="filters">
          <button
            className={`btn ${sort === "heat" ? "active" : ""}`}
            onClick={() => setSort("heat")}
          >
            {t.sortHeat}
          </button>
          <button
            className={`btn ${sort === "time" ? "active" : ""}`}
            onClick={() => setSort("time")}
          >
            {t.sortNew}
          </button>
          <button
            className={`btn ${onlyFeatured ? "active" : ""}`}
            onClick={() => setOnlyFeatured((v) => !v)}
          >
            ✦ {t.onlyFeatured}
          </button>
          <button
            className={`btn ${onlyFav ? "active" : ""}`}
            onClick={() => setOnlyFav((v) => !v)}
          >
            ★ {t.fav}
          </button>
        </div>
      </div>

      <div className="filters" style={{ marginTop: 4 }}>
        <button
          className={`btn ${field === "all" ? "active" : ""}`}
          onClick={() => setField("all")}
        >
          {t.all}
        </button>
        {fields.map((f) => (
          <button
            key={f.key}
            className={`btn ${field === f.key ? "active" : ""}`}
            onClick={() => setField(f.key)}
          >
            {lang === "en" ? f.label_en : f.label_zh}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">{t.papersEmpty}</div>
      ) : (
        <div className="grid">
          {shown.map((p) => (
            <PaperCard
              key={p.id}
              paper={p}
              fieldLabel={labelMap[p.field] || p.field}
              onOpen={setActive}
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
