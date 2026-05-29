import NewsPage from "@/components/NewsPage";
import { getLatest, getAvailableDates, getIndex } from "@/lib/news";

// 每次请求读取最新归档（开发期改数据即刷新）
export const dynamic = "force-dynamic";

export default function Home() {
  const day = getLatest();
  const dates = getAvailableDates();
  const latest = getIndex().latest || day.date;
  return <NewsPage day={day} dates={dates} latest={latest} />;
}
