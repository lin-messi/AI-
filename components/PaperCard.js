"use client";

import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";

export default function PaperCard({ paper, fieldLabel, onOpen }) {
  const { lang, favs, reads, toggleFav, toggleRead } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const isFav = favs.has(paper.id);
  const isRead = reads.has(paper.id);

  const pick = (zh, en) => {
    if (lang === "en") return { main: en || zh, alt: null };
    if (lang === "zh") return { main: zh || en, alt: null };
    if (zh && en && zh !== en) return { main: zh, alt: en };
    return { main: zh || en, alt: null };
  };

  const { main: title, alt: titleAlt } = pick(paper.title_zh, paper.title_en);
  const { main: abstract } = pick(paper.abstract_zh, paper.abstract_en);

  return (
    <article className={`card ${isRead ? "read" : ""}`}>
      <div className="card-top">
        <span className="source-chip">
          <span className="source-dot" />
          {paper.source}
        </span>
        <span className="heat" title={`${t.heat} ${Math.round(paper.heat)}`}>
          🔥 {paper.upvotes > 0 ? paper.upvotes : Math.round(paper.heat)}
        </span>
      </div>

      <div className="subtags">
        <span className="field-chip">{fieldLabel}</span>
        {paper.featured && <span className="featured-badge">{t.featuredBadge}</span>}
        {paper.subtags?.map((s) => (
          <span className="tag" key={s}>
            #{s}
          </span>
        ))}
      </div>

      <h3 className="card-title">
        {title}
        {titleAlt && <span className="alt">{titleAlt}</span>}
      </h3>

      {paper.authors?.length > 0 && (
        <div className="paper-authors">{paper.authors.join(", ")}</div>
      )}

      {paper.highlight_zh && (
        <div className="why">
          <b>{t.highlight}：</b>
          {paper.highlight_zh}
        </div>
      )}

      <p className="card-summary clamp">{abstract}</p>

      <div className="paper-actions">
        <button className="btn active" onClick={() => onOpen(paper)}>
          {t.readInSite}
        </button>
        <a className="btn" href={paper.url} target="_blank" rel="noopener noreferrer">
          {t.openOriginal} →
        </a>
      </div>

      <div className="card-foot">
        <span className="time">{timeAgo(paper.published_at, lang)}</span>
        <div className="card-actions">
          <button
            className={`iconbtn ${isFav ? "on" : ""}`}
            onClick={() => toggleFav(paper.id)}
            title={t.fav}
            aria-label={t.fav}
          >
            {isFav ? "★" : "☆"}
          </button>
          <button
            className={`iconbtn ${isRead ? "on" : ""}`}
            onClick={() => toggleRead(paper.id)}
            title={t.read}
            aria-label={t.read}
          >
            ✓
          </button>
        </div>
      </div>
    </article>
  );
}
