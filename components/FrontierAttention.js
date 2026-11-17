"use client";

import { useEffect, useRef, useState } from "react";
import { STRINGS } from "@/lib/i18n";
import { useApp } from "./AppProvider";
import PaperReader from "./PaperReader";

const dayMilliseconds = 86400000;
const hourMilliseconds = 3600000;

function displayNumber(value, en, compact = false) {
  return new Intl.NumberFormat(en ? "en-US" : "zh-CN", compact ? { notation: "compact" } : {}).format(value);
}

function signedChange(value, en, compact = false) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + displayNumber(Math.abs(value), en, compact);
}

function measuredTime(value, en) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(en ? "en-GB" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function observedHours(interest) {
  if (!interest?.measuredAt || !interest?.baselineAt) return null;
  const span = (Date.parse(interest.measuredAt) - Date.parse(interest.baselineAt)) / hourMilliseconds;
  return Number.isFinite(span) && span > 0 ? Math.round(span * 10) / 10 : null;
}

function shortDate(date, en) {
  const [, month, day] = date.split("-");
  return en ? month + "/" + day : Number(month) + "月" + Number(day) + "日";
}

function titleOf(paper, en) {
  return en ? paper.title_en || paper.title_zh : paper.title_zh || paper.title_en;
}

export function interestCount(interest) {
  return interest?.count ?? interest?.likes;
}

function spanLabel(interest, isCitation, en) {
  const hours = observedHours(interest);
  if (hours === null) return null;
  if (isCitation && hours >= 48) {
    const days = Math.round(hours / 24 * 10) / 10;
    return en ? days + " days" : days + " 天";
  }
  return en ? hours + " hours" : hours + " 小时";
}

function metricSource(source, isCitation, en) {
  return source || (isCitation ? (en ? "Citation index" : "引文索引") : "Hugging Face");
}

export function CommunityInterestBadge({ interest, metric, source, en }) {
  const isCitation = metric === "citations";
  const count = interestCount(interest);
  if (!Number.isFinite(count)) {
    return <span className="community-likes missing">{isCitation
      ? (en ? "No citations recorded" : "暂无引用记录")
      : (en ? "No likes recorded" : "暂无热度记录")}</span>;
  }
  const span = spanLabel(interest, isCitation, en);
  const observed = measuredTime(interest.measuredAt, en);
  const baseline = measuredTime(interest.baselineAt, en);
  const notes = [
    metricSource(source, isCitation, en) + (isCitation ? (en ? " indexed citations" : " 索引引用") : (en ? " community likes" : " 社区点赞")),
    observed && (en ? "Measured " + observed + " Beijing time" : "采集于北京时间 " + observed),
    span && baseline && (en ? "Compared with " + baseline + " (" + span + " earlier)" : "与 " + baseline + " 相比，间隔 " + span),
  ];
  const value = displayNumber(count, en);
  return (
    <span className="community-likes" title={notes.filter(Boolean).join(" · ")}>
      <span>{isCitation ? (en ? value + " citations" : "引用 " + value + " 次") : (en ? "HF likes " + value : "HF 点赞 " + value)}</span>
      {Number.isFinite(interest.delta) && <span className="community-change" data-trend={Math.sign(interest.delta)}>
        {signedChange(interest.delta, en)}{span ? " / " + span : ""}
      </span>}
    </span>
  );
}

function DailyAttention({ leader, reproduction, papersById, isCitation, source, en, onOpen }) {
  const t = STRINGS[en ? "en" : "zh"];
  const leaderPaper = papersById.get(leader?.paperId);
  const interest = leaderPaper?.community_interest;
  const count = interestCount(interest);
  const hasLeader = leaderPaper && Number.isFinite(count);
  const growth = hasLeader && leader.mode === "growth" && Number.isFinite(interest.delta);
  const trending = isCitation ? (en ? "Citations rising" : "引用升温") : (en ? "Trending today" : "今日升温");
  const leaderTitle = growth || !hasLeader ? trending
    : isCitation ? (en ? "Most total citations" : "当前累计引用最高") : (en ? "Most total likes" : "当前累计点赞最高");
  const span = spanLabel(interest, isCitation, en);
  const measured = measuredTime(interest?.measuredAt, en);
  const reproduciblePaper = papersById.get(reproduction?.paperId);
  const sourceCode = reproduciblePaper?.ai_frontier?.resources?.find(resource => resource.kind === "code" && /^https:\/\//i.test(resource.url));
  const conditions = en ? reproduction?.note_en ?? reproduciblePaper?.recommendation?.limitations_en
    : reproduction?.note_zh ?? reproduciblePaper?.recommendation?.limitations_zh;

  return (
    <div className="frontier-daily">
      <article className="frontier-daily-card frontier-daily-trend">
        <h2>{leaderTitle}</h2>
        {hasLeader ? <>
          <div className="frontier-daily-metric">
            <strong>{growth ? signedChange(interest.delta, en) : displayNumber(count, en)}</strong>
            <span>{growth
              ? (isCitation ? (en ? "net citations" : "净增引用") : (en ? "net likes" : "净增点赞"))
              : (isCitation ? (en ? "cumulative citations" : "累计引用") : (en ? "cumulative likes" : "累计点赞"))}</span>
          </div>
          <h3>{titleOf(leaderPaper, en)}</h3>
          <p className="frontier-metric-detail">
            {growth && span && (en ? "Over " + span + " between observations. " : "两次观测间隔 " + span + "。")}
            {measured && (en ? "Measured " + measured + " Beijing time." : "截至北京时间 " + measured + "。")}
            {" " + source}{isCitation && (en ? " indexed citations." : " 索引引用。")}
          </p>
          <div className="paper-actions"><button type="button" className="btn" onClick={() => onOpen(leaderPaper)}>{t.readInSite}</button></div>
        </> : <p className="frontier-metric-detail">{isCitation
          ? (en ? "Waiting for citation index records." : "正在累计引文索引观测。")
          : (en ? "Waiting for Hugging Face community likes." : "正在累计 Hugging Face 社区点赞记录。")}</p>}
      </article>
      <article className="frontier-daily-card frontier-daily-code">
        <h2>{en ? "Reproduction pick" : "今日可复现精选"}</h2>
        {reproduction?.date && <time className="frontier-pick-date" dateTime={reproduction.date}>{shortDate(reproduction.date, en)}</time>}
        {reproduciblePaper && sourceCode ? <>
          <h3>{titleOf(reproduciblePaper, en)}</h3>
          <p className="frontier-metric-detail">{conditions || (en
            ? "Check the paper’s evaluation setup before running the author code."
            : "可从作者代码和论文中的实验设置入手。")}</p>
          <p className="frontier-metric-detail">{en ? "Author code and documented setup. Independent reproduction pending." : "基于作者代码和实验设置，尚未独立复现。"}</p>
          <div className="paper-actions">
            <button type="button" className="btn" onClick={() => onOpen(reproduciblePaper)}>{t.readInSite}</button>
            <a className="btn" href={sourceCode.url} target="_blank" rel="noopener noreferrer">{en ? "Author code" : "作者代码"} ↗</a>
          </div>
        </> : <p className="frontier-metric-detail">{en ? "Waiting for a recent paper with author code and a documented evaluation setup." : "等待有作者代码和明确实验设置的近期论文。"}</p>}
      </article>
    </div>
  );
}

function fallbackDays(asOf) {
  if (!asOf || !Number.isFinite(Date.parse(asOf))) return [];
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short" }).format(new Date(asOf));
  const midnight = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(midnight)) return [];
  return Array.from({ length: 14 }, (_, i) => ({
    date: new Date(midnight - (13 - i) * dayMilliseconds).toISOString().slice(0, 10),
    cells: {},
  }));
}

function metricOf(cell, mode) {
  return mode === "delta" ? cell?.delta : cell?.total ?? cell?.likes;
}

function cellTone(value, maximum) {
  if (!Number.isFinite(value)) return "missing";
  if (value === 0) return "zero";
  const intensity = Math.min(3, Math.max(1, Math.ceil(3 * Math.log1p(Math.abs(value)) / Math.log1p(maximum))));
  return (value > 0 ? "up-" : "down-") + intensity;
}

function cellLabel(cell, mode, isCitation, en) {
  const value = metricOf(cell, mode);
  if (!Number.isFinite(value)) return en ? "No observations" : "无可用记录";
  const noun = isCitation ? (en ? "citations" : "引用") : (en ? "likes" : "点赞");
  return mode === "delta"
    ? signedChange(value, en) + (en ? " net " : " 净增") + noun
    : displayNumber(value, en) + (en ? " total " : " 累计") + noun;
}

function coverageLabel(cell, mode, isCitation, en) {
  if (!Number.isFinite(cell?.eligible) || cell.eligible === 0) return en ? "No papers tracked" : "暂无入选论文记录";
  const observed = mode === "delta" ? cell.compared : cell.observed;
  const count = observed + " / " + cell.eligible;
  if (mode === "delta") return en ? count + " papers with comparable readings" : count + " 篇有可比观测";
  return en ? count + " papers observed" : count + (isCitation ? " 篇有引用记录" : " 篇有点赞记录");
}

function defaultCell(days, topics, mode) {
  for (let column = days.length - 1; column >= 0; column--) {
    const row = topics.findIndex(topic => Number.isFinite(metricOf(days[column].cells[topic.key], mode)));
    if (row >= 0) return { row, column };
  }
  return { row: 0, column: days.length - 1 };
}

function HeatmapDetails({ day, topic, mode, isCitation, en, papersById, onOpen }) {
  const cell = day.cells[topic.key];
  const t = STRINGS[en ? "en" : "zh"];
  const entries = (cell?.papers || [])
    .filter(paper => Number.isFinite(mode === "delta" ? paper.delta : interestCount(paper)))
    .sort((a, b) => (mode === "delta" ? b.delta - a.delta : 0) || interestCount(b) - interestCount(a));
  return (
    <div id="frontier-heatmap-details" className="frontier-heatmap-details" aria-live="polite">
      <h3><time dateTime={day.date}>{shortDate(day.date, en)}</time> · {en ? topic.label_en : topic.label_zh}</h3>
      <p className="frontier-metric-detail">{cellLabel(cell, mode, isCitation, en)} · {coverageLabel(cell, mode, isCitation, en)}</p>
      {entries.length > 0 && <ul className="frontier-heatmap-papers">
        {entries.map(paper => {
          const current = papersById.get(paper.id);
          const span = spanLabel(paper, isCitation, en);
          const total = displayNumber(interestCount(paper), en);
          const metric = mode === "delta"
            ? signedChange(paper.delta, en) + (span ? " / " + span : "")
            : total + (isCitation ? (en ? " citations" : " 次引用") : (en ? " likes" : " 赞"));
          return (
            <li key={paper.id}>
              <span className="frontier-heatmap-paper-title">{titleOf(paper, en)}</span>
              <span className="frontier-heatmap-paper-metric">{metric}</span>
              {current ? <button type="button" className="btn" onClick={() => onOpen(current)}>{t.readInSite}</button>
                : /^https:\/\//i.test(paper.url) && <a className="btn" href={paper.url} target="_blank" rel="noopener noreferrer">{t.openOriginal} ↗</a>}
            </li>
          );
        })}
      </ul>}
    </div>
  );
}

function AttentionHeatmap({ days, topics, isCitation, en, papersById, onOpen }) {
  const hasGrowth = days.some(day => topics.some(topic => Number.isFinite(day.cells[topic.key]?.delta)));
  const [mode, setMode] = useState(hasGrowth ? "delta" : "total");
  const [selection, setSelection] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Keep recent observations visible when the heatmap is wider than the viewport.
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [days.length]);

  const selected = selection ?? defaultCell(days, topics, mode);
  const selectedDay = days[selected.column];
  const selectedTopic = topics[selected.row];
  const maximum = Math.max(1, ...days.flatMap(day =>
    topics.map(topic => Math.abs(metricOf(day.cells[topic.key], mode) ?? 0))));

  const onMove = (event, row, column) => {
    let nextRow = row;
    let nextColumn = column;
    switch (event.key) {
      case "ArrowUp": nextRow = Math.max(0, row - 1); break;
      case "ArrowDown": nextRow = Math.min(topics.length - 1, row + 1); break;
      case "ArrowLeft": nextColumn = Math.max(0, column - 1); break;
      case "ArrowRight": nextColumn = Math.min(days.length - 1, column + 1); break;
      case "Home": nextColumn = 0; break;
      case "End": nextColumn = days.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setSelection({ row: nextRow, column: nextColumn });
    const button = event.currentTarget.closest("table")?.querySelector(
      '[data-heat-row="' + nextRow + '"][data-heat-column="' + nextColumn + '"]'
    );
    button?.focus();
  };

  return (
    <section className="frontier-heatmap" aria-labelledby="frontier-heatmap-title">
      <div className="frontier-heatmap-heading">
        <h2 id="frontier-heatmap-title">{en ? "14-day research heatmap" : "14 天研究热力图"}</h2>
        <div className="seg frontier-heatmap-modes" role="group" aria-label={en ? "Heatmap metric" : "热力图指标"}>
          <button type="button" className={mode === "delta" ? "active" : ""} aria-pressed={mode === "delta"} onClick={() => setMode("delta")}>
            {isCitation ? (en ? "Citation change" : "引用变化") : (en ? "Like change" : "点赞变化")}
          </button>
          <button type="button" className={mode === "total" ? "active" : ""} aria-pressed={mode === "total"} onClick={() => setMode("total")}>
            {isCitation ? (en ? "Cumulative citations" : "累计引用") : (en ? "Cumulative likes" : "累计点赞")}
          </button>
        </div>
      </div>
      <p className="frontier-metric-detail">
        {isCitation
          ? (en ? "By area and Beijing date. Totals add the observed papers’ indexed citations in that day’s snapshot. Changes compare readings around seven days apart."
            : "按方向和北京时间查看。累计引用是当日快照中各论文的索引引用之和，引用变化来自相隔约 7 日的两次观测。")
          : (en ? "By area and Beijing date. Totals add the observed papers’ likes in that day’s snapshot. Changes compare readings around 24 hours apart."
            : "按方向和北京时间查看。累计点赞是当日快照中有记录的论文点赞之和，点赞变化来自相隔约 24 小时的两次观测。")}
        {en ? " Select a cell to see the papers and coverage." : "选择格子可查看论文和覆盖情况。"}
      </p>
      {mode === "delta" && !hasGrowth && <p className="frontier-metric-detail">
        {en ? "Changes will appear once comparable readings are available." : "积累到可比快照后显示变化。"}
      </p>}
      {days.length > 0 && topics.length > 0 ? <>
        <div className="frontier-heatmap-scroll" ref={scrollRef}>
          <table className="frontier-heatmap-table">
            <thead>
              <tr>
                <th scope="col" className="frontier-heatmap-topic">{en ? "Research area" : "研究方向"}</th>
                {days.map(day => <th key={day.date} scope="col"><time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time></th>)}
              </tr>
            </thead>
            <tbody>
              {topics.map((topic, row) => (
                <tr key={topic.key}>
                  <th scope="row" className="frontier-heatmap-topic">{en ? topic.label_en : topic.label_zh}</th>
                  {days.map((day, column) => {
                    const cell = day.cells[topic.key];
                    const value = metricOf(cell, mode);
                    const active = row === selected.row && column === selected.column;
                    const label = [shortDate(day.date, en), en ? topic.label_en : topic.label_zh, cellLabel(cell, mode, isCitation, en), coverageLabel(cell, mode, isCitation, en)].join(" · ");
                    const shown = Number.isFinite(value) ? (mode === "delta" ? signedChange(value, en, true) : displayNumber(value, en, true)) : "–";
                    return (
                      <td key={day.date}>
                        <button type="button" className="frontier-heatmap-cell" data-tone={cellTone(value, maximum)}
                          data-heat-row={row} data-heat-column={column}
                          aria-label={label} title={label} aria-controls="frontier-heatmap-details"
                          aria-pressed={active} tabIndex={active ? 0 : -1}
                          onClick={() => setSelection({ row, column })}
                          onKeyDown={event => onMove(event, row, column)}>
                          {shown}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="frontier-heatmap-legend">
          <span><i data-tone="missing" />{en ? "Missing" : "缺记录"}</span>
          <span><i data-tone="zero" />{en ? "Recorded zero" : "实测为零"}</span>
          {mode === "delta" && <span><i data-tone="down-2" />{en ? "Decrease" : "减少"}</span>}
          <span><i data-tone="up-1" />{en ? "Smaller" : "较低"}<i data-tone="up-3" />{en ? "Larger" : "较高"}</span>
        </div>
        {selectedDay && selectedTopic && <HeatmapDetails day={selectedDay} topic={selectedTopic} mode={mode} isCitation={isCitation} en={en} papersById={papersById} onOpen={onOpen} />}
      </> : <p className="frontier-metric-detail">{en ? "No history yet." : "暂无历史观测记录。"}</p>}
    </section>
  );
}

export default function FrontierAttention({ attention, reproduction, items, topics, asOf, metric = "likes", onMetricChange }) {
  const { lang } = useApp();
  const en = lang === "en";
  const isCitation = metric === "citations";
  const source = metricSource(attention?.source, isCitation, en);
  const [active, setActive] = useState(null);
  const papersById = new Map(items.map(paper => [paper.id, paper]));
  const days = attention?.days?.length ? attention.days : fallbackDays(asOf);

  return (
    <div className="frontier-attention" data-active-metric={metric}>
      {onMetricChange && <div className="frontier-attention-source">
        <div className="seg" role="group" aria-label={en ? "Research metric" : "热度来源"}>
          <button type="button" className={isCitation ? "active" : ""} aria-pressed={isCitation} onClick={() => onMetricChange("citations")}>
            {en ? "Paper citations" : "论文引用"}
          </button>
          <button type="button" className={!isCitation ? "active" : ""} aria-pressed={!isCitation} onClick={() => onMetricChange("likes")}>
            {en ? "Community likes" : "社区点赞"}
          </button>
        </div>
        <span className="frontier-metric-detail">{source}{isCitation
          ? (en ? " indexed citations" : " 索引引用") : (en ? " community likes" : " 社区点赞")}</span>
      </div>}
      <DailyAttention leader={attention?.leader} reproduction={reproduction ?? attention?.reproduction}
        papersById={papersById} isCitation={isCitation} source={source} en={en} onOpen={setActive} />
      <AttentionHeatmap key={metric} days={days} topics={topics} isCitation={isCitation} en={en} papersById={papersById} onOpen={setActive} />
      {active && <PaperReader paper={active} onClose={() => setActive(null)} />}
    </div>
  );
}
