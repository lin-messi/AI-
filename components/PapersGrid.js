"use client";

import { useMemo, useState } from "react";
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
          {filtered.map((p) => (
            <PaperCard
              key={p.id}
              paper={p}
              fieldLabel={labelMap[p.field] || p.field}
              onOpen={setActive}
            />
          ))}
        </div>
      )}

      {active && <PaperReader paper={active} onClose={() => setActive(null)} />}
    </>
  );
}
