"use client";

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PapersGrid from "@/components/PapersGrid";
import LiveStatus from "@/components/LiveStatus";
import DateNav from "@/components/DateNav";
import { useApp } from "@/components/AppProvider";
import { STRINGS } from "@/lib/i18n";
import { formatDateLong } from "@/lib/format";

export function AcademicNav({ frontier = false, tab }) {
  const { lang } = useApp();
  const en = lang === "en";
  const active = tab || (frontier ? "frontier" : "papers");
  const links = [
    ["papers", "/papers/", "学术论文", "Academic papers"],
    ["frontier", "/papers/ai-frontier/", "AI 前沿", "AI Frontier"],
    ["tracking", "/papers/tracking/", "收藏追踪", "Saved paper updates"],
    ["compare", "/papers/compare/", "论文对照", "Compare papers"],
    ["topics", "/papers/topics/", "专题进展", "Topic updates"],
  ];

  return (
    <nav className="filters academic-nav" aria-label={en ? "Academic collections" : "学术栏目"}>
      {links.map(([key, href, zh, english]) => <Link key={key} href={href}
        className={active === key ? "btn active" : "btn"} aria-current={active === key ? "page" : undefined}>
        {en ? english : zh}
      </Link>)}
    </nav>
  );
}

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
          <AcademicNav />
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
