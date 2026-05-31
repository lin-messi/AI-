"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GithubGrid from "@/components/GithubGrid";
import LiveStatus from "@/components/LiveStatus";
import DateNav from "@/components/DateNav";
import { useApp } from "@/components/AppProvider";
import { STRINGS } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";

export default function GithubPage({ day, dates = [], latest }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const items = day.items || [];
  const isLatest = day.date === latest;
  const langs = new Set(items.map((i) => i.language).filter(Boolean));
  const totalStars = items.reduce((s, i) => s + (i.stars || 0), 0);

  return (
    <>
      <Header />
      <main className="container">
        <section className="hero">
          <div className="hero-date">{formatDateLong(day.date, lang)}</div>
          <h1 className="hero-title">{t.githubTitle}</h1>
          <p className="hero-desc">{t.githubDesc}</p>
          {isLatest && <LiveStatus kind="github" generatedAt={day.generatedAt} />}
          <div className="hero-stats">
            <div className="stat">
              <div className="num">{items.length}</div>
              <div className="lbl">{t.repoCount}</div>
            </div>
            <div className="stat">
              <div className="num">{langs.size}</div>
              <div className="lbl">{t.langCount}</div>
            </div>
            <div className="stat">
              <div className="num">
                {totalStars >= 1000
                  ? (totalStars / 1000).toFixed(0) + "k"
                  : totalStars}
              </div>
              <div className="lbl">{t.totalStars}</div>
            </div>
          </div>
        </section>
        <DateNav
          date={day.date}
          dates={dates}
          latest={latest}
          homeHref="/github"
          archivePrefix="/github"
        />
        <GithubGrid items={items} />
      </main>
      <Footer />
    </>
  );
}
