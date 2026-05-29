"use client";

import { useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import NewsCard from "./NewsCard";

export default function NewsGrid({ items }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("importance");
  const [onlyFav, setOnlyFav] = useState(false);
  const { favs } = useApp();

  // 收集分类
  const cats = useMemo(() => {
    const s = new Set(items.map((i) => i.category));
    return [...s];
  }, [items]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (cat !== "all") list = list.filter((i) => i.category === cat);
    if (onlyFav) list = list.filter((i) => favs.has(i.id));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) =>
        [
          i.title_zh,
          i.title_en,
          i.summary_zh,
          i.summary_en,
          ...i.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (sort === "importance") {
      list.sort((a, b) => b.importance - a.importance);
    } else {
      list.sort(
        (a, b) => new Date(b.published_at) - new Date(a.published_at)
      );
    }
    return list;
  }, [items, cat, query, sort, onlyFav, favs]);

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
            className={`btn ${sort === "importance" ? "active" : ""}`}
            onClick={() => setSort("importance")}
          >
            {t.sortImp}
          </button>
          <button
            className={`btn ${sort === "time" ? "active" : ""}`}
            onClick={() => setSort("time")}
          >
            {t.sortTime}
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
          className={`btn ${cat === "all" ? "active" : ""}`}
          onClick={() => setCat("all")}
        >
          {t.all}
        </button>
        {cats.map((c) => (
          <button
            key={c}
            className={`btn ${cat === c ? "active" : ""}`}
            onClick={() => setCat(c)}
          >
            {t.categories[c] || c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">{t.empty}</div>
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
