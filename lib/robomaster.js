// 服务端数据读取：从 data/robomaster 与 data/robomaster-index.json 读取每日 RM 算法资料，
// 并读取手工精选 data/robomaster-curated.json。
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const RM = path.join(DATA, "robomaster");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

const EMPTY_DAY = {
  date: "",
  count: 0,
  categories: [],
  papers: { count: 0, items: [] },
  repos: { count: 0, items: [] },
};

export function getRoboIndex() {
  return readJson(path.join(DATA, "robomaster-index.json"), {
    latest: null,
    dates: [],
  });
}

export function getRoboDates() {
  return getRoboIndex().dates || [];
}

export function getRoboDay(date) {
  const day = readJson(path.join(RM, `${date}.json`), null);
  if (day) return day;
  return { ...EMPTY_DAY, date };
}

export function getLatestRobo() {
  const idx = getRoboIndex();
  if (idx.latest) return getRoboDay(idx.latest);
  return { ...EMPTY_DAY };
}

export function getRoboCurated() {
  return readJson(path.join(DATA, "robomaster-curated.json"), {
    updatedAt: "",
    items: [],
  });
}

// 通用利器库（滚动池，非按日期）：本身不带 robomaster 但能用于 RM 的优质开源库。
export function getRoboGeneral() {
  return readJson(path.join(DATA, "robomaster-general.json"), {
    updatedAt: "",
    count: 0,
    items: [],
  });
}
