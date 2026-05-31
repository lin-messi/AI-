// 服务端数据读取：从 data/github 与 data/github-index.json 读取每日推荐开源项目
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const GH = path.join(DATA, "github");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export function getGithubIndex() {
  return readJson(path.join(DATA, "github-index.json"), {
    latest: null,
    dates: [],
  });
}

export function getGithubDates() {
  return getGithubIndex().dates || [];
}

export function getGithubDay(date) {
  const day = readJson(path.join(GH, `${date}.json`), null);
  if (day) return day;
  return { date, count: 0, items: [] };
}

export function getLatestGithub() {
  const idx = getGithubIndex();
  if (idx.latest) return getGithubDay(idx.latest);
  return { date: "", count: 0, items: [] };
}
