"use client";
import { useApp } from "./AppProvider";

export default function RecommendationNote({ item }) {
  const { lang } = useApp();
  const rec = item.recommendation;
  if (!rec) return null;
  const en = lang === "en";
  const receivers = {
    camera: en ? "Frame camera" : "帧相机接收",
    rolling_shutter_camera: en ? "Rolling-shutter camera" : "滚动快门相机接收",
    event_camera: en ? "Event camera" : "事件相机接收",
    photodiode: en ? "Photodiode" : "光电二极管接收",
    led: en ? "LED receiver" : "LED兼作接收器",
    unknown: en ? "Receiver unconfirmed" : "接收端待核验",
  };
  const lane = rec.lane === "recent" ? (en ? "Recent year" : "近一年成果")
    : rec.lane === "established" ? (en ? "Established reference" : "长期参考") : (en ? "Implementation reference" : "研究 / 实现参考");
  const date = item.full_name ? item.pushed_at : item.published_at;
  const dateLabel = date?.slice(0, item.published_precision === "year" ? 4 : item.published_precision === "month" ? 7 : 10);
  return (
    <div className="recommendation-note">
      <div className="subtags">
        <span className="conf-badge">{lane}</span>
        <span className="field-chip">{receivers[rec.receiver] || receivers.unknown}</span>
        {rec.quality === "simulation" && <span className="field-chip">{en ? "Simulation only" : "仅仿真"}</span>}
      </div>
      {date && <small>{item.full_name ? (en ? "Code updated: " : "代码更新：") : (en ? "Published: " : "发表：")}{dateLabel}</small>}
      <p><b>{en ? "Why this fits: " : "推荐理由："}</b>{rec.reason_zh}</p>
      {rec.limitations_zh && <p><b>{en ? "Adaptation needed: " : "适用限制："}</b>{rec.limitations_zh}</p>}
      {item.optical_review?.license_note && <p><b>{en ? "License: " : "许可说明："}</b>{item.optical_review.license_note}</p>}
      {item.optical_review?.code_url && <a href={item.optical_review.code_url} target="_blank" rel="noopener noreferrer">{en ? "Author resources" : "作者代码 / 资源"} ↗</a>}
      {rec.metric && <p><a href={rec.metric.source_url} target="_blank" rel="noopener noreferrer">{rec.metric.source}: {rec.metric.value}{rec.metric.source === "Crossref" ? (en ? " indexed citations" : " 次索引引用") : " ★"}</a>{rec.metric.checked_at && <small> · {rec.metric.checked_at.slice(0, 10)}</small>}</p>}
      {rec.evidence_url && <a href={rec.evidence_url} target="_blank" rel="noopener noreferrer">{en ? "Check primary source" : "核验原始来源"} ↗</a>}
    </div>
  );
}
