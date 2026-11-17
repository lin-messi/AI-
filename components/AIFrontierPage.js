"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PapersGrid from "@/components/PapersGrid";
import FrontierAttention from "@/components/FrontierAttention";
import { AcademicNav } from "@/components/PapersPage";
import { useApp } from "@/components/AppProvider";

export default function AIFrontierPage({ snapshot }) {
  const { lang } = useApp();
  const en = lang === "en";
  const { generatedAt, topics } = snapshot;
  const [metric, setMetric] = useState("citations");
  const isCitation = metric === "citations";
  const attention = isCitation ? snapshot.citations : snapshot.attention;
  const items = snapshot.items.map(paper => ({
    ...paper,
    community_interest: attention?.byPaper?.[paper.id] ?? (isCitation ? undefined : paper.community_interest),
  }));
  const reproduction = snapshot.attention?.reproduction ?? snapshot.citations?.reproduction;
  const fetchedAt = generatedAt ? new Date(generatedAt) : null;
  const updateLabel = fetchedAt && Number.isFinite(fetchedAt.getTime())
    ? new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(fetchedAt)
    : null;

  return (
    <>
      <Header />
      <main className="container">
        <section className="hero">
          <h1 className="hero-title">{en ? "AI Frontier" : "AI 前沿"}</h1>
          <p className="hero-desc">{en
            ? "Explore machine learning and computer vision papers first posted in the 30 days before the update, alongside established references. Use the linked author resources to check what can be reproduced."
            : "查看截至本次更新近 30 天首次公开的机器学习、计算机视觉研究及长期参考。可用作者提供的代码、数据和权重核对复现条件。"}</p>
          <AcademicNav frontier />
          {updateLabel && <p className="hero-date">
            {en ? "Updated " : "更新于 "}<time dateTime={generatedAt}>{updateLabel}</time>{en ? " Beijing time" : "（北京时间）"}
          </p>}
        </section>
        {items.length > 0 && <FrontierAttention attention={attention} reproduction={reproduction}
          items={items} topics={topics} asOf={generatedAt} metric={metric} onMetricChange={setMetric} />}
        {items.length > 0
          ? <PapersGrid items={items} fields={topics} aiFrontier interestMetric={metric} interestSource={attention?.source} />
          : <p className="empty">{en ? "No selected papers have been published here yet." : "暂未发布精选论文。"}</p>}
      </main>
      <Footer />
    </>
  );
}
