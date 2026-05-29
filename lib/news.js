// 服务端数据读取：从 data/archive 与 data/index.json 读取每日新闻
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const ARCHIVE = path.join(DATA, "archive");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export function getIndex() {
  return readJson(path.join(DATA, "index.json"), { latest: null, dates: [] });
}

export function getAvailableDates() {
  return getIndex().dates || [];
}

export function getDay(date) {
  const day = readJson(path.join(ARCHIVE, `${date}.json`), null);
  if (day) return day;
  // 兜底：还没抓取时，使用手写示例数据
  const sample = readJson(path.join(DATA, "news.json"), null);
  if (sample) return { ...sample, count: sample.items.length };
  return { date, count: 0, items: [] };
}

export function getLatest() {
  const idx = getIndex();
  if (idx.latest) return getDay(idx.latest);
  return getDay("");
}
