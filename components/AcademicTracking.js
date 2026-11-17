"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { ResearchLink, ResearchPage } from "@/components/AcademicResearch";
import { beijingDate, safeResearchUrl } from "@/lib/academic-topics.mjs";

const STORAGE = "academicWatchSeen";
const ARXIV_ID = /^arxiv:(\d{4}\.\d{4,5})$/;
const OTHER_PAPER_ID = /^(?:doi|cvf|openreview):/;
const resourceKinds = {
  code: ["作者代码", "Author code"],
  data: ["作者数据", "Author data"],
  weights: ["作者权重", "Author weights"],
};

function readSeen() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function eventLabel(event, en) {
  if (event.kind === "version") return en ? "arXiv version v" + event.from + " → v" + event.to : "arXiv 版本 v" + event.from + " → v" + event.to;
  if (event.kind === "publication") return en ? "Publication verified" : "已核验正式发表";
  const label = resourceKinds[event.kind]?.[Number(en)];
  return en ? "First verified: " + (label || "author resource") : "首次核验" + (label || "作者资源");
}

function SavedPaper({ paper, seenAt, en, toggleFav }) {
  const latest = paper.events?.at(-1)?.observedAt;
  const unread = latest && latest > (seenAt || "");
  const title = en ? paper.title_en || paper.title_zh : paper.title_zh || paper.title_en;
  const original = safeResearchUrl(paper.url);
  return (
    <li className="research-panel">
      <div className="research-heading">
        <h2>{original ? <ResearchLink href={original}>{title || paper.id}</ResearchLink> : title || paper.id}</h2>
        {unread && <span className="research-tag">{en ? "New update" : "新变化"}</span>}
      </div>
      {paper.checkedAt ? (
        <>
          <p className="research-meta">
            {en ? "Last checked " : "核对于 "}{beijingDate(paper.checkedAt)}
            {paper.version && <> · <ResearchLink href={paper.versionUrl}>arXiv v{paper.version}</ResearchLink> · {beijingDate(paper.version_at)}</>}
          </p>
          {(paper.resources?.length > 0 || paper.publication) && (
            <ul className="research-resource-links">
              {paper.resources?.map(resource => (
                <li key={resource.kind + resource.url}>
                  <ResearchLink href={resource.url}>{resourceKinds[resource.kind]?.[Number(en)] || (en ? "Author resource" : "作者资源")}</ResearchLink>
                </li>
              ))}
              {paper.publication && <li><ResearchLink href={paper.publication.url}>{paper.publication.venue || (en ? "Publication" : "正式发表")}</ResearchLink></li>}
            </ul>
          )}
          {paper.events?.length > 0 ? (
            <ol className="research-events">
              {[...paper.events].reverse().map(event => (
                <li key={event.key}>
                  <time dateTime={event.observedAt}>{beijingDate(event.observedAt)}</time>
                  <ResearchLink href={event.url}>{eventLabel(event, en)}</ResearchLink>
                  {event.sourceAt && <span className="research-meta">{en ? "Source date " : "来源日期 "}{event.sourceAt.slice(0, 10)}</span>}
                </li>
              ))}
            </ol>
          ) : <p className="research-meta">{en ? "No new change verified since the first check." : "初次建立记录以来，暂无已核验的新变化。"}</p>}
        </>
      ) : (
        <p className="research-meta">{en ? "This paper has no verified tracking record yet." : "这篇论文暂无已核验的追踪记录。"}</p>
      )}
      <button type="button" className="research-text-button" onClick={() => toggleFav(paper.id)}>
        {en ? "Remove from saved papers" : "取消收藏"}
      </button>
    </li>
  );
}

export default function AcademicTracking({ snapshot }) {
  const { favs, favoritePaperMeta, ready, lang, toggleFav } = useApp();
  const en = lang === "en";
  const [seen, setSeen] = useState(null);
  useEffect(() => { setSeen(readSeen()); }, []);

  const recorded = new Map(snapshot.papers.map(paper => [paper.id, paper]));
  const favorites = [...favs].flatMap(id => {
    if (typeof id !== "string") return [];
    const stored = Object.hasOwn(favoritePaperMeta, id) ? favoritePaperMeta[id] : null;
    const arxiv = id.match(ARXIV_ID)?.[1];
    const record = recorded.get(id);
    if (!stored && !record && !arxiv && !OTHER_PAPER_ID.test(id)) return [];
    return [{
      ...stored, ...record, id,
      title_zh: record?.title_zh || stored?.title_zh,
      url: record?.url || stored?.url || (arxiv ? "https://arxiv.org/abs/" + arxiv : null),
    }];
  }).reverse().sort((a, b) => (b.events?.at(-1)?.observedAt || "").localeCompare(a.events?.at(-1)?.observedAt || ""));
  const unread = favorites.filter(paper => {
    const eventAt = paper.events?.at(-1)?.observedAt;
    return eventAt && eventAt > (seen?.[paper.id] || "");
  });

  function markSeen() {
    const next = { ...readSeen() };
    for (const paper of unread) next[paper.id] = paper.events.at(-1).observedAt;
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch {}
    setSeen(next);
  }

  return (
    <ResearchPage tab="tracking" title={en ? "Saved paper updates" : "收藏追踪"}
      intro={en ? "See new arXiv versions, verified author resources and publications for the papers you save." : "查看收藏论文的 arXiv 版本、已核验作者资源和正式发表变化。"}>
      <p className="research-meta">
        {en
          ? "Saved papers and read status stay in this browser. The site checks AI Frontier and featured arXiv papers, keeping up to 500 records and covering up to 90 days after their last listing."
          : "收藏与已读状态保存在当前浏览器。站点核对 AI 前沿和精选 arXiv 论文，最多保留 500 篇记录，离开榜单后最长追踪 90 天。"}
      </p>
      {!(ready && seen) ? (
        <p className="research-panel" role="status">{en ? "Loading saved papers…" : "正在读取收藏…"}</p>
      ) : favorites.length ? (
        <>
          <div className="research-toolbar">
            <span role="status">{en ? favorites.length + " saved · " + unread.length + " with new updates" : favorites.length + " 篇已收藏 · " + unread.length + " 篇有新变化"}</span>
            {unread.length > 0 && <button type="button" className="btn" onClick={markSeen}>{en ? "Mark updates as read" : "标记已查看"}</button>}
          </div>
          <ul className="research-stack">
            {favorites.map(paper => <SavedPaper key={paper.id} paper={paper} seenAt={seen[paper.id]} en={en} toggleFav={toggleFav} />)}
          </ul>
        </>
      ) : (
        <div className="research-panel">
          <h2>{en ? "No papers saved yet" : "还没有收藏论文"}</h2>
          <p>{en ? "Click the star on a paper card to follow it here." : "点击论文卡片上的收藏按钮，即可在这里查看后续变化。"}</p>
          <Link className="btn" href="/papers/ai-frontier/">{en ? "Browse AI Frontier" : "浏览 AI 前沿"}</Link>
        </div>
      )}
    </ResearchPage>
  );
}
