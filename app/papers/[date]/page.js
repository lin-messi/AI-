import PapersPage from "@/components/PapersPage";
import { getPapersDay, getPapersDates, getPapersIndex } from "@/lib/papers";
import { notFound } from "next/navigation";

// 历史论文页：与最新页同样用 ISR 缓存。过去日期数据不再变化，可长期缓存。
export const revalidate = 600;

export default async function PapersDay({ params }) {
  const { date } = await params;
  const dates = getPapersDates();
  if (!dates.includes(date)) notFound();
  const day = getPapersDay(date);
  const latest = getPapersIndex().latest;
  return <PapersPage day={day} dates={dates} latest={latest} />;
}
