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

// 条目的“时间”：优先首见时间 first_seen，其次发布/更新时间。用于“最新”排序与 NEW 角标。
function itemTime(it) {
  const ts = it.first_seen || it.published_at || it.pushed_at || it.created_at;
  const n = ts ? new Date(ts).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
}

export default function RoboMasterPage({ day, dates = [], latest, curated, general, rules }) {
  const { lang, favs } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const categories = day.categories || [];
  const papers = day.papers?.items || [];
  const nativeRepos = day.repos?.items || [];
  const generalRepos = general?.items || [];
  const curatedItems = curated?.items || [];
  const isLatest = day.date === latest;

  const [view, setView] = useState("papers"); // papers | repos
  const [repoSub, setRepoSub] = useState("all"); // all | rm | general
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [active, setActive] = useState(null);
  const [curatedOpen, setCuratedOpen] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  // 排序方式（论文 / 开源库 各自独立记忆）：default = 热度/星标，new = 最新收录
  const [sort, setSort] = useState({ papers: "default", repos: "default" });
  // 上次访问时间（论文 / 开源库 各自独立）：用于标 NEW；首次访问为 null（不标）
  const [lastVisit, setLastVisit] = useState({ papers: null, repos: null });

  // 开源库子集：全部 = RM 原生 + 通用利器
  const repos = useMemo(() => {
    if (repoSub === "rm") return nativeRepos;
    if (repoSub === "general") return generalRepos;
    return [...nativeRepos, ...generalRepos];
  }, [repoSub, nativeRepos, generalRepos]);

  const badgeFor = (r) =>
    r.source === "general"
      ? { kind: "general", label: t.roboBadgeGeneral }
      : { kind: "native", label: t.roboBadgeNative };

  useEffect(() => {
    try {
      const v = localStorage.getItem("robo_curated_open");
      if (v !== null) setCuratedOpen(v === "1");
      const vr = localStorage.getItem("robo_rules_open");
      if (vr !== null) setRulesOpen(vr === "1");

      // 读取记忆的排序方式
      const sp = localStorage.getItem("robo_sort_papers");
      const sr = localStorage.getItem("robo_sort_repos");
      const validSort = (v) => ["new", "default", "relevance"].includes(v);
      setSort((s) => ({
        papers: validSort(sp) ? sp : s.papers,
        repos: validSort(sr) ? sr : s.repos,
      }));

      // 读取上次访问时间（用于 NEW 角标），随后把本次访问时间写回，作为下次基准
      const lp = localStorage.getItem("robo_lastvisit_papers");
      const lr = localStorage.getItem("robo_lastvisit_repos");
      setLastVisit({
        papers: lp ? Number(lp) : null,
        repos: lr ? Number(lr) : null,
      });
      const now = String(Date.now());
      localStorage.setItem("robo_lastvisit_papers", now);
      localStorage.setItem("robo_lastvisit_repos", now);
    } catch {}
  }, []);

  const changeSort = (val) =>
    setSort((s) => {
      const key = view === "papers" ? "papers" : "repos";
      try {
        localStorage.setItem(`robo_sort_${key}`, val);
      } catch {}
      return { ...s, [key]: val };
    });

  const toggleCurated = () =>
    setCuratedOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("robo_curated_open", next ? "1" : "0");
      } catch {}
      return next;
    });

  const toggleRules = () =>
    setRulesOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("robo_rules_open", next ? "1" : "0");
      } catch {}
      return next;
    });

  const labelMap = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.key] = lang === "en" ? c.label_en : c.label_zh;
    return m;
  }, [categories, lang]);

  const isPapers = view === "papers";
  const curSort = isPapers ? sort.papers : sort.repos;
  const curLastVisit = isPapers ? lastVisit.papers : lastVisit.repos;
  // 仅当有上次访问记录时才标 NEW；首次访问（null）不标。
  const isNew = (it) => curLastVisit != null && itemTime(it) > curLastVisit;

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
    if (curSort === "new") list.sort((a, b) => itemTime(b) - itemTime(a));
    else if (curSort === "relevance")
      // 按相关度排序；同分时论文退回热度、库退回星标（Q40）。缺失视为 0（Q48）。
      list.sort(
        (a, b) =>
          (b.relevance || 0) - (a.relevance || 0) ||
          (isPapers ? (b.heat || 0) - (a.heat || 0) : (b.stars || 0) - (a.stars || 0))
      );
    else if (isPapers) list.sort((a, b) => (b.heat || 0) - (a.heat || 0));
    else list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    return list;
  }, [isPapers, papers, repos, cat, onlyFav, query, favs, curSort]);

  useEffect(() => {
    setVisible(PAGE);
  }, [view, repoSub, cat, onlyFav, query]);

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
              <div className="num">{nativeRepos.length}</div>
              <div className="lbl">{t.roboNative}</div>
            </div>
            <div className="stat">
              <div className="num">{generalRepos.length}</div>
              <div className="lbl">{t.roboGeneral}</div>
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

        {rules && (
          <section className="curated rules-panel">
            <button
              type="button"
              className="section-head"
              onClick={toggleRules}
              aria-expanded={rulesOpen}
            >
              <span className={`chevron ${rulesOpen ? "open" : ""}`}>▸</span>
              <span className="section-title">📖 {t.roboRules}</span>
              <span className="section-count">
                {rules.season} · {rules.competition}
              </span>
            </button>
            {rulesOpen && (
              <div className="rules-body">
                <p className="section-sub">{t.roboRulesDesc}</p>
                {rules.summary_zh && lang !== "en" && (
                  <p className="rules-summary">{rules.summary_zh}</p>
                )}

                {rules.changes_zh?.length > 0 && lang !== "en" && (
                  <div className="rules-block">
                    <h4>{t.roboRulesChanges}</h4>
                    <ul>
                      {rules.changes_zh.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {rules.tasks?.length > 0 && (
                  <div className="rules-block">
                    <h4>{t.roboRulesTasks}</h4>
                    <div className="rules-tasks">
                      {rules.tasks.map((task) => (
                        <div className="rules-task" key={task.id}>
                          <div className="rules-task-top">
                            <span className="rules-task-name">{task.name_zh}</span>
                            {(task.categories || []).map((k) => (
                              <span className="field-chip" key={k}>
                                {labelMap[k] || k}
                              </span>
                            ))}
                          </div>
                          {task.desc_zh && (
                            <p className="rules-task-desc">{task.desc_zh}</p>
                          )}
                          {task.scoring_zh && (
                            <p className="rules-task-score">
                              <b>{t.roboRulesScoring}：</b>
                              {task.scoring_zh}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {rules.sources?.length > 0 && (
                  <div className="rules-block">
                    <h4>{t.roboRulesSource}</h4>
                    <ul className="rules-sources">
                      {rules.sources.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
            {t.roboViewRepos}（{nativeRepos.length + generalRepos.length}）
          </button>
        </div>

        {!isPapers && (
          <div className="filters subfilters" style={{ marginTop: 8 }}>
            <button
              className={`btn ${repoSub === "all" ? "active" : ""}`}
              onClick={() => setRepoSub("all")}
            >
              {t.all}（{nativeRepos.length + generalRepos.length}）
            </button>
            <button
              className={`btn ${repoSub === "rm" ? "active" : ""}`}
              onClick={() => setRepoSub("rm")}
            >
              {t.roboBadgeNative}（{nativeRepos.length}）
            </button>
            <button
              className={`btn ${repoSub === "general" ? "active" : ""}`}
              onClick={() => setRepoSub("general")}
            >
              {t.roboBadgeGeneral}（{generalRepos.length}）
            </button>
          </div>
        )}

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
            <label className="sort-select" title={t.roboSortLabel}>
              <span className="sort-label">{t.roboSortLabel}</span>
              <select value={curSort} onChange={(e) => changeSort(e.target.value)}>
                <option value="default">{t.roboSortDefault}</option>
                <option value="relevance">{t.roboSortRelevance}</option>
                <option value="new">{t.roboSortNewest}</option>
              </select>
            </label>
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
                    isNew={isNew(p)}
                  />
                ))
              : shown.map((r) => (
                  <RepoCard
                    key={r.id}
                    repo={r}
                    tags={(r.categories || []).map((k) => labelMap[k] || k)}
                    badge={badgeFor(r)}
                    isNew={isNew(r)}
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
