import AcademicTopics from "@/components/AcademicTopics";
import { getAIFrontier, getPapersDates, getPapersDay } from "@/lib/papers";
import { getAvailableDates, getDay } from "@/lib/news";
import { getGithubDates, getGithubDay } from "@/lib/github";
import { comparisons } from "@/lib/academic-comparisons.mjs";
import { buildAcademicTopics } from "@/lib/academic-topics.mjs";

export const metadata = {
  title: "专题进展 · AI 时事跟踪",
  description: "查看六个 AI 学术方向在近七天的论文、开源和资讯。",
};

function recentDays(dates, readDay) {
  return dates.slice(0, 8).flatMap(date => {
    const day = readDay(date);
    return day.date === date ? day.items || [] : [];
  });
}

export default function Topics() {
  const snapshot = buildAcademicTopics({
    frontier: getAIFrontier().items,
    papers: recentDays(getPapersDates(), getPapersDay),
    news: recentDays(getAvailableDates(), getDay),
    repos: recentDays(getGithubDates(), getGithubDay),
    asOf: new Date().toISOString(),
  });
  return <AcademicTopics snapshot={snapshot} comparisonTopics={comparisons.map(group => group.key)} />;
}
