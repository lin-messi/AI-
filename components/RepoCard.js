"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { downloadItem } from "@/lib/paperDownload";

// 主语言对应的小圆点颜色（覆盖常见语言，其余用默认色）
const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Shell: "#89e051",
  Jupyter: "#DA5B0B",
  "Jupyter Notebook": "#DA5B0B",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
};

function fmtStars(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

export default function RepoCard({ repo, tags, badge, isNew }) {
  const { lang, favs, reads, toggleFav, toggleRead } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];

  const isFav = favs.has(repo.id);
  const isRead = reads.has(repo.id);
  const [downloading, setDownloading] = useState(false);

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadItem(repo, { type: "repo" });
    } catch (e) {
      alert((lang === "en" ? "Download failed: " : "下载失败：") + e.message);
    } finally {
      setDownloading(false);
    }
  };

  const pick = (zh, en) => {
    if (lang === "en") return { main: en || zh, alt: null };
    if (lang === "zh") return { main: zh || en, alt: null };
    if (zh && en && zh !== en) return { main: zh, alt: en };
    return { main: zh || en, alt: null };
  };
  const { main: desc, alt: descAlt } = pick(repo.description_zh, repo.description_en);

  const rmValue = repo.rm?.value;
  const rmValueLabel =
    rmValue === "high" ? t.roboUsageHigh : rmValue === "low" ? t.roboUsageLow : t.roboUsageMid;

  return (
    <article className={`card ${isRead ? "read" : ""}`}>
      <div className="card-top">
        <span className="source-chip">
          <span className="source-dot" />
          {repo.owner}
        </span>
        {badge && (
          <span className={`repo-badge ${badge.kind === "general" ? "general" : "native"}`}>
            {badge.label}
          </span>
        )}
        {repo.stars > 0 && (
          <span className="heat" title={t.stars}>
            ★ {fmtStars(repo.stars)}
          </span>
        )}
      </div>

      <h3 className="card-title">
        <a href={repo.url} target="_blank" rel="noopener noreferrer">
          {repo.name}
        </a>
      </h3>

      <div className="subtags">
        {isNew && (
          <span className="new-badge" title={t.roboNewHint}>
            {t.roboNew}
          </span>
        )}
        {rmValue && (
          <span className={`usage-badge ${rmValue}`} title={t.roboUsageValue}>
            {rmValueLabel}
          </span>
        )}
        {repo.rm?.task && <span className="task-chip">{repo.rm.task}</span>}
        {tags?.map((s) => (
          <span className="field-chip" key={s}>
            {s}
          </span>
        ))}
        {repo.language && (
          <span className="lang-chip">
            <span
              className="lang-dot"
              style={{ background: LANG_COLORS[repo.language] || "#9aa0a6" }}
            />
            {repo.language}
          </span>
        )}
        {repo.topics?.map((s) => (
          <span className="tag" key={s}>
            #{s}
          </span>
        ))}
      </div>

      {repo.highlight_zh && (
        <div className="why">
          <b>{t.highlight}：</b>
          {repo.highlight_zh}
        </div>
      )}

      {desc && (
        <p className="card-summary clamp">
          {desc}
          {descAlt && <span className="alt">{descAlt}</span>}
        </p>
      )}

      <div className="paper-actions">
        <a
          className="btn active"
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.viewRepo} →
        </a>
        {repo.homepage && (
          <a
            className="btn"
            href={repo.homepage}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.homepage}
          </a>
        )}
        <button className="btn" onClick={onDownload} disabled={downloading}>
          {downloading ? t.downloading : `↓ ${t.download}`}
        </button>
      </div>

      <div className="card-foot">
        <span className="time">
          {repo.pushed_at ? timeAgo(repo.pushed_at, lang) : ""}
        </span>
        <div className="card-actions">
          <button
            className={`iconbtn ${isFav ? "on" : ""}`}
            onClick={() => toggleFav(repo.id)}
            title={t.fav}
            aria-label={t.fav}
          >
            {isFav ? "★" : "☆"}
          </button>
          <button
            className={`iconbtn ${isRead ? "on" : ""}`}
            onClick={() => toggleRead(repo.id)}
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
