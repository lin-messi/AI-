"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";

export default function NewsCard({ item }) {
  const { lang, role, favs, reads, toggleFav, toggleRead } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const [copied, setCopied] = useState(false);

  const isFav = favs.has(item.id);
  const isRead = reads.has(item.id);
  // 身份影响展示深度：爱好者只看摘要，学生/从业者额外看“为何重要”
  const showWhy = role !== "fan";

  // 单语言条目优雅回退：缺失的语言用已有语言补上
  const pick = (zh, en) => {
    if (lang === "en") return { main: en || zh, alt: null };
    if (lang === "zh") return { main: zh || en, alt: null };
    // 中英对照：两者都有才显示副语言
    if (zh && en && zh !== en) return { main: zh, alt: en };
    return { main: zh || en, alt: null };
  };

  const { main: title, alt: titleAlt } = pick(item.title_zh, item.title_en);
  const { main: summary, alt: summaryAlt } = pick(
    item.summary_zh,
    item.summary_en
  );
  const { main: why, alt: whyAlt } = pick(item.why_zh, item.why_en);

  const onShare = async () => {
    const shareData = { title, text: summary, url: item.url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      /* 用户取消分享，忽略 */
    }
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用 */
    }
  };

  return (
    <article className={`card ${isRead ? "read" : ""}`}>
      <div className="card-top">
        <span className="source-chip">
          <span className="source-dot" />
          {item.source}
        </span>
        <span className="importance" title={`importance ${item.importance}/5`}>
          {"★".repeat(item.importance)}
          <span style={{ color: "var(--text-dim)" }}>
            {"★".repeat(5 - item.importance)}
          </span>
        </span>
      </div>

      <h3 className="card-title">
        {title}
        {titleAlt && <span className="alt">{titleAlt}</span>}
      </h3>

      <p className="card-summary">
        {summary}
        {summaryAlt && <span className="alt">{summaryAlt}</span>}
      </p>

      {showWhy && why && (
        <div className="why">
          <b>{t.why}：</b>
          {why}
          {whyAlt && <span style={{ display: "block", opacity: 0.7 }}>{whyAlt}</span>}
        </div>
      )}

      <div className="tags">
        {item.tags.map((tag) => (
          <span className="tag" key={tag}>
            #{tag}
          </span>
        ))}
      </div>

      <div className="card-foot">
        <span className="time">{timeAgo(item.published_at, lang)}</span>
        <div className="card-actions">
          <button
            className={`iconbtn ${isFav ? "on" : ""}`}
            onClick={() => toggleFav(item.id)}
            title={t.fav}
            aria-label={t.fav}
          >
            {isFav ? "★" : "☆"}
          </button>
          <button
            className={`iconbtn ${isRead ? "on" : ""}`}
            onClick={() => toggleRead(item.id)}
            title={t.read}
            aria-label={t.read}
          >
            ✓
          </button>
          <button
            className="iconbtn"
            onClick={onShare}
            title={copied ? t.copied : t.share}
            aria-label={t.share}
          >
            {copied ? "✔" : "↗"}
          </button>
          <a
            className="link-arrow"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 4 }}
          >
            {t.readMore} →
          </a>
        </div>
      </div>
    </article>
  );
}
