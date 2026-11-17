"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { ResearchLink, ResearchPage } from "@/components/AcademicResearch";

const heading = {
  papers: ["新论文", "New papers"],
  repos: ["近期活跃开源", "Recent open source"],
  news: ["相关资讯", "Related news"],
};

function TopicList({ kind, items, en }) {
  return (
    <section className="research-panel research-list">
      <h2>{heading[kind][Number(en)]}</h2>
      {items.length ? (
        <ul>
          {items.map(row => (
            <li key={row.url}>
              <ResearchLink href={row.url}>{(en ? row.title : row.title_zh) || row.title}</ResearchLink>
              <p className="research-meta">
                <time dateTime={row.date}>{row.date}</time>
                {kind === "repos" && (row.created ? (en ? " · Created" : " · 创建") : (en ? " · Last push" : " · 推送"))}
                {kind === "news" && row.source && " · " + row.source}
              </p>
              {kind === "repos" && (row.description || row.description_zh) && (
                <p className="research-description">{(en ? row.description : row.description_zh) || row.description}</p>
              )}
              {row.code && <p className="research-meta"><ResearchLink href={row.code}>{en ? "Verified author code" : "已核验作者代码"}</ResearchLink></p>}
              {row.paper && <p className="research-meta">{kind === "news" ? (en ? "Cited paper · " : "资讯引用的论文 · ") : (en ? "Author code for · " : "论文注明的作者代码 · ")}
                <ResearchLink href={row.paper.url}>{(en ? row.paper.title : row.paper.title_zh) || row.paper.title}</ResearchLink>
              </p>}
            </li>
          ))}
        </ul>
      ) : <p className="research-meta">{en ? "No matching items from this period." : "这段时间暂无符合条件的条目。"}</p>}
    </section>
  );
}

export default function AcademicTopics({ snapshot, comparisonTopics }) {
  const { lang } = useApp();
  const en = lang === "en";
  const [key, setKey] = useState(snapshot.topics[0]?.key);
  const topic = snapshot.topics.find(item => item.key === key);
  return (
    <ResearchPage tab="topics" title={en ? "Topic updates" : "专题进展"}
      intro={en
        ? "Browse seven days of papers, open-source activity and news across six research topics."
        : "按六个研究专题查看近七天发布的论文、活跃开源和相关资讯。"}>
      <div className="research-tabs" role="group" aria-label={en ? "Research topics" : "研究专题"}>
        {snapshot.topics.map(item => <button type="button" key={item.key} className="btn"
          aria-pressed={key === item.key} onClick={() => setKey(item.key)}>{item.title[Number(en)]}</button>)}
      </div>
      {topic && (
        <>
          <div className="research-toolbar">
            <span className="research-meta">{snapshot.start} — {snapshot.end} · {en ? "Beijing time" : "北京时间"}</span>
            {comparisonTopics.includes(key) && (
              <Link className="btn" href={"/papers/compare/#" + key}>{en ? "Compare papers on this topic" : "对照同题论文"}</Link>
            )}
          </div>
          <div className="research-columns">
            <TopicList kind="papers" items={topic.papers} en={en} />
            <TopicList kind="repos" items={topic.repos} en={en} />
            <TopicList kind="news" items={topic.news} en={en} />
          </div>
        </>
      )}
    </ResearchPage>
  );
}
