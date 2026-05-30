// 服务端数据读取：从 data/papers 与 data/papers-index.json 读取每日论文
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const PAPERS = path.join(DATA, "papers");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export function getPapersIndex() {
  return readJson(path.join(DATA, "papers-index.json"), {
    latest: null,
    dates: [],
  });
}

export function getPapersDates() {
  return getPapersIndex().dates || [];
}

export function getPapersDay(date) {
  const day = readJson(path.join(PAPERS, `${date}.json`), null);
  if (day) return day;
  return { date, count: 0, fields: [], items: [] };
}

export function getLatestPapers() {
  const idx = getPapersIndex();
  if (idx.latest) return getPapersDay(idx.latest);
  return { date: "", count: 0, fields: [], items: [] };
}

export function findPaper(id) {
  const day = getLatestPapers();
  return (day.items || []).find((p) => p.id === id) || null;
}
