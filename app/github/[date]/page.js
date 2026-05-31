import GithubPage from "@/components/GithubPage";
import { getGithubDay, getGithubDates, getGithubIndex } from "@/lib/github";
import { notFound } from "next/navigation";

// 历史开源推荐页：与最新页同样用 ISR 缓存。过去日期数据不再变化，可长期缓存。
export const revalidate = 600;

export default async function GithubDay({ params }) {
  const { date } = await params;
  const dates = getGithubDates();
  if (!dates.includes(date)) notFound();
  const day = getGithubDay(date);
  const latest = getGithubIndex().latest;
  return <GithubPage day={day} dates={dates} latest={latest} />;
}
