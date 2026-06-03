"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PaperCard from "@/components/PaperCard";
import PaperReader from "@/components/PaperReader";
import RepoCard from "@/components/RepoCard";
import LiveStatus from "@/components/LiveStatus";
import DateNav from "@/components/DateNav";
import { useApp } from "@/components/AppProvider";
import { STRINGS } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";

const PAGE = 60;

export default function RoboMasterPage({ day, dates = [], latest, curated }) {
  const { lang, favs } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const categories = day.categories || [];
  const papers = day.papers?.items || [];
  const repos = day.repos?.items || [];
  const curatedItems = curated?.items || [];
  const isLatest = day.date === latest;

  const [view, setView] = useState("papers"); // papers | repos
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [active, setActive] = useState(null);
  const [curatedOpen, setCuratedOpen] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem("robo_curated_open");
      if (v !== null) setCuratedOpen(v === "1");
    } catch {}
  }, []);

  const toggleCurated = () =>
    setCuratedOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("robo_curated_open", next ? "1" : "0");
      } catch {}
      return next;
    });

  const labelMap = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.key] = lang === "en" ? c.label_en : c.label_zh;
    return m;
  }, [categories, lang]);

  const isPapers = view === "papers";

  const filtered = useMemo(() => {
    let list = isPapers ? [...papers] : [...repos];
    if (cat !== "all") list = list.filter((it) => (it.categories || []).includes(cat));
    if (onlyFav) list = list.filter((it) => favs.has(it.id));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((it) =>
        (isPapers
          ? [it.title_zh, it.title_en, it.abstract_zh, it.abstract_en]
          : [it.full_name, it.description_zh, it.description_en, ...(it.topics || [])]
        )
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (isPapers) list.sort((a, b) => (b.heat || 0) - (a.heat || 0));
    else list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    return list;
  }, [isPapers, papers, repos, cat, onlyFav, query, favs]);

  useEffect(() => {
    setVisible(PAGE);
  }, [view, cat, onlyFav, query]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <Header />
      <main className="container">
        <section className="hero">
          <div className="hero-date">{formatDateLong(day.date, lang)}</div>
          <h1 className="hero-title">{t.roboTitle}</h1>
          <p className="hero-desc">{t.roboDesc}</p>
          {isLatest && <LiveStatus kind="robomaster" generatedAt={day.generatedAt} />}
          <div className="hero-stats">
            <div className="stat">
              <div className="num">{papers.length}</div>
              <div className="lbl">{t.roboPapers}</div>
            </div>
            <div className="stat">
              <div className="num">{repos.length}</div>
              <div className="lbl">{t.roboRepos}</div>
            </div>
            <div className="stat">
              <div className="num">{categories.length}</div>
              <div className="lbl">{t.roboCats}</div>
            </div>
          </div>
        </section>

        {curatedItems.length > 0 && (
          <section className="curated">
            <button
              type="button"
              className="section-head"
              onClick={toggleCurated}
              aria-expanded={curatedOpen}
            >
              <span className={`chevron ${curatedOpen ? "open" : ""}`}>▸</span>
              <span className="section-title">★ {t.roboCurated}</span>
              <span className="section-count">{curatedItems.length}</span>
            </button>
            {curatedOpen && (
              <>
                <p className="section-sub">{t.roboCuratedDesc}</p>
                <div className="grid">
                  {curatedItems.map((r) => (
                    <RepoCard
                      key={r.id}
                      repo={r}
                      tags={(r.categories || []).map((k) => labelMap[k] || k)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <DateNav
          date={day.date}
          dates={dates}
          latest={latest}
          homeHref="/robomaster"
          archivePrefix="/robomaster"
        />

        <div className="filters" style={{ marginTop: 12 }}>
          <button
            className={`btn ${isPapers ? "active" : ""}`}
            onClick={() => setView("papers")}
          >
            {t.roboViewPapers}（{papers.length}）
          </button>
          <button
            className={`btn ${!isPapers ? "active" : ""}`}
            onClick={() => setView("repos")}
          >
            {t.roboViewRepos}（{repos.length}）
          </button>
        </div>

        <div className="toolbar">
          <div className="search">
            <span className="icon">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isPapers ? t.searchPh : t.repoSearchPh}
            />
          </div>
          <div className="filters">
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
          {categories.map((c) => (
            <button
              key={c.key}
              className={`btn ${cat === c.key ? "active" : ""}`}
              onClick={() => setCat(c.key)}
            >
              {lang === "en" ? c.label_en : c.label_zh}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty">{t.roboEmpty}</div>
        ) : (
          <div className="grid">
            {isPapers
              ? shown.map((p) => (
                  <PaperCard
                    key={p.id}
                    paper={p}
                    fieldLabel={labelMap[(p.categories || [])[0]] || t.roboOther}
                    onOpen={setActive}
                  />
                ))
              : shown.map((r) => (
                  <RepoCard
                    key={r.id}
                    repo={r}
                    tags={(r.categories || []).map((k) => labelMap[k] || k)}
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
      </main>
      <Footer />
    </>
  );
}
