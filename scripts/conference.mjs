// 顶会识别（需求1）：从 arXiv 的 comment 字段优先识别论文被哪个顶会接收，
// 兜底再扫描标题/摘要。返回 { conf, confYear, confTag, confWeight, confVision }。
// 仅认定近 CONF_RECENT_YEARS 年的顶会，避免老会议噪声。
import { CONFERENCES, CONF_RECENT_YEARS } from "./robomaster-feeds.mjs";

const NOW_YEAR = new Date().getFullYear();

// 在一段文本里，紧邻会议名附近找 4 位年份（20xx）。找不到则返回 0。
function nearbyYear(text, matchIndex, matchLen) {
  // 取会议名前后各 12 个字符的窗口找年份
  const start = Math.max(0, matchIndex - 12);
  const end = Math.min(text.length, matchIndex + matchLen + 12);
  const window = text.slice(start, end);
  const m = window.match(/20\d{2}/);
  return m ? Number(m[0]) : 0;
}

// 对单条文本判定顶会。优先按 CONFERENCES 顺序（视觉顶会在前，权重高的优先）。
function detectInText(text) {
  if (!text) return null;
  for (const conf of CONFERENCES) {
    const m = conf.re.exec(text);
    if (!m) continue;
    const year = nearbyYear(text, m.index, m[0].length);
    // 有年份则要求在近 N 年内；无年份则保守接受（comment 里常省略年份）。
    if (year && year < NOW_YEAR - CONF_RECENT_YEARS) continue;
    return {
      conf: conf.key,
      confYear: year || 0,
      confTag: year ? `${conf.key} ${year}` : conf.key,
      confWeight: conf.weight,
      confVision: !!conf.vision,
    };
  }
  return null;
}

// item: 论文对象（含 comment、title_en、abstract_en）。
// comment 命中最可信；否则用标题/摘要兜底（Q9/Q62）。
export function detectConference(item) {
  const fromComment = detectInText(item.comment || "");
  if (fromComment) return fromComment;
  const fromTitleAbs = detectInText(
    `${item.title_en || ""} ${item.abstract_en || ""}`
  );
  return fromTitleAbs;
}
