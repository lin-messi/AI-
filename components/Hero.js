"use client";

import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";

export default function Hero({ date, count, avgImportance, sources }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  return (
    <section className="hero">
      <div className="hero-date">{formatDateLong(date, lang)}</div>
      <h1 className="hero-title">
        {lang === "en" ? "Today in AI" : "今日 AI 大事"}
      </h1>
      <p className="hero-desc">{t.heroDesc}</p>

      <div className="hero-stats">
        <div className="stat">
          <div className="num">{count}</div>
          <div className="lbl">{t.todayCount}</div>
        </div>
        <div className="stat">
          <div className="num">{avgImportance}</div>
          <div className="lbl">{t.avgImportance}</div>
        </div>
        <div className="stat">
          <div className="num">{sources}</div>
          <div className="lbl">{t.sources}</div>
        </div>
      </div>
    </section>
  );
}
