"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PapersGrid from "@/components/PapersGrid";
import LiveStatus from "@/components/LiveStatus";
import DateNav from "@/components/DateNav";
import { useApp } from "@/components/AppProvider";
import { STRINGS } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";

export default function PapersPage({ day, dates = [], latest }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const items = day.items || [];
  const fields = day.fields || [];
  const usedFields = new Set(items.map((i) => i.field));
  const isLatest = day.date === latest;

  return (
    <>
      <Header />
      <main className="container">
        <section className="hero">
          <div className="hero-date">{formatDateLong(day.date, lang)}</div>
          <h1 className="hero-title">{t.papersTitle}</h1>
          <p className="hero-desc">{t.papersDesc}</p>
          {isLatest && <LiveStatus kind="papers" generatedAt={day.generatedAt} />}
          <div className="hero-stats">
            <div className="stat">
              <div className="num">{items.length}</div>
              <div className="lbl">{t.papersCount}</div>
            </div>
            <div className="stat">
              <div className="num">{usedFields.size}</div>
              <div className="lbl">{t.fields}</div>
            </div>
            <div className="stat">
              <div className="num">{items.filter((i) => i.featured).length}</div>
              <div className="lbl">{t.featuredBadge}</div>
            </div>
          </div>
        </section>
        <DateNav
          date={day.date}
          dates={dates}
          latest={latest}
          homeHref="/papers"
          archivePrefix="/papers"
        />
        <PapersGrid items={items} fields={fields} />
      </main>
      <Footer />
    </>
  );
}
