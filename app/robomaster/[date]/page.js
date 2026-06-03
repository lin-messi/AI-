import RoboMasterPage from "@/components/RoboMasterPage";
import {
  getRoboDay,
  getRoboDates,
  getRoboIndex,
  getRoboCurated,
  getRoboGeneral,
} from "@/lib/robomaster";
import { notFound } from "next/navigation";

// 历史 RM 资料页：与最新页同样用 ISR 缓存。过去日期数据不再变化，可长期缓存。
export const revalidate = 600;

export default async function RobomasterDay({ params }) {
  const { date } = await params;
  const dates = getRoboDates();
  if (!dates.includes(date)) notFound();
  const day = getRoboDay(date);
  const latest = getRoboIndex().latest;
  const curated = getRoboCurated();
  const general = getRoboGeneral();
  return (
    <RoboMasterPage
      day={day}
      dates={dates}
      latest={latest}
      curated={curated}
      general={general}
    />
  );
}
