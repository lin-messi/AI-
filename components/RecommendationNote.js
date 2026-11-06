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
  const lane = rec.lane === "recent" ? (rec.scope === "news" ? (en ? "Recent report" : "近期资讯") : rec.scope === "repo" ? (en ? "New project" : "近期新项目") : item.full_name ? (en ? "Recently updated" : "近期更新") : (en ? "Recent research" : "近期成果"))
    : rec.lane === "established" ? (en ? "Established reference" : "长期参考") : (en ? "Implementation reference" : "研究 / 实现参考");
  const sourceTypes = {
    primary: en ? "Primary release" : "一手发布",
    report: en ? "Media report" : "媒体报道",
    aggregator: en ? "Aggregator" : "聚合入口",
    unknown: en ? "Source unverified" : "来源待核验",
  };
  const metricSource = String(rec.metric?.source || "").toLowerCase();
  const metricUnit = /crossref|openalex/.test(metricSource) ? (en ? " indexed citations" : " 次索引引用")
    : /hugging|^hf$/.test(metricSource) ? (en ? " community likes" : " 个社区点赞")
    : metricSource.includes("github") ? " ★" : "";
  const metricNote = metricSource.includes("github") ? (en ? "Total stars; not recent growth or a quality guarantee." : "累计星标，非近期增长或质量认证。")
    : /hugging|^hf$/.test(metricSource) ? (en ? "Community likes; not citations or peer review." : "社区点赞，非论文引用或同行评审结论。") : "";
  const date = item.full_name ? item.pushed_at : item.published_at;
  const codeUrl = rec.code_url || item.reference_review?.code_url || item.optical_review?.code_url;
  const dateLabel = date?.slice(0, item.published_precision === "year" ? 4 : item.published_precision === "month" ? 7 : 10);
  return (
    <div className="recommendation-note">
      <div className="subtags">
        <span className="conf-badge">{lane}</span>
        {rec.receiver && <span className="field-chip">{receivers[rec.receiver] || receivers.unknown}</span>}
        {rec.source_type && <span className="field-chip">{sourceTypes[rec.source_type] || sourceTypes.unknown}</span>}
        {(rec.topics || []).slice(0, 3).map(topic => <span className="field-chip" key={topic.key}>{en ? topic.label_en || topic.label_zh : topic.label_zh || topic.label_en}</span>)}
        {rec.quality === "simulation" && <span className="field-chip">{en ? "Simulation only" : "仅仿真"}</span>}
      </div>
      {rec.scope === "repo" && item.created_at && <small>{en ? "Project created: " : "项目创建："}{item.created_at.slice(0, 10)} · </small>}
      {date && <small>{item.full_name ? (en ? "Code updated: " : "代码更新：") : (en ? "Published: " : "发表：")}{dateLabel}</small>}
      {rec.reason_zh && <p><b>{en ? "Why this fits: " : "推荐理由："}</b>{rec.reason_zh}</p>}
      {rec.limitations_zh && <p><b>{rec.scope === "news" ? (en ? "Reading note: " : "阅读提示：") : (en ? "Adaptation needed: " : "适用限制：")}</b>{rec.limitations_zh}</p>}
      {item.optical_review?.license_note && <p><b>{en ? "License: " : "许可说明："}</b>{item.optical_review.license_note}</p>}
      {codeUrl && <a href={codeUrl} target="_blank" rel="noopener noreferrer">{en ? "Author resources" : "作者代码 / 资源"} ↗</a>}
      {rec.metric && <p><a href={rec.metric.source_url} target="_blank" rel="noopener noreferrer">{rec.metric.source}: {rec.metric.value}{metricUnit}</a>{rec.metric.checked_at && <small> · {rec.metric.checked_at.slice(0, 10)}</small>}{metricNote && <small className="evidence-caveat">{metricNote}</small>}</p>}
      {rec.evidence_url && <a href={rec.evidence_url} target="_blank" rel="noopener noreferrer">{en ? "Check source" : "核验来源"} ↗</a>}
    </div>
  );
}
