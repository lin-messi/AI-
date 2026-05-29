import NewsPage from "@/components/NewsPage";
import { getDay, getAvailableDates, getIndex } from "@/lib/news";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ArchiveDay({ params }) {
  const { date } = await params;
  const dates = getAvailableDates();
  if (!dates.includes(date)) notFound();
  const day = getDay(date);
  const latest = getIndex().latest;
  return <NewsPage day={day} dates={dates} latest={latest} />;
}
