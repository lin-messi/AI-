import AcademicTracking from "@/components/AcademicTracking";
import { getAcademicWatch } from "@/lib/papers";

export const metadata = {
  title: "收藏追踪 · AI 时事跟踪",
  description: "追踪收藏论文的 arXiv 版本、已核验作者资源和发表状态。",
};

export default function Tracking() {
  return <AcademicTracking snapshot={getAcademicWatch()} />;
}
