import PapersPage from "@/components/PapersPage";
import { getLatestPapers } from "@/lib/papers";

// 每次请求读取最新论文归档
export const dynamic = "force-dynamic";

export const metadata = {
  title: "学术前沿 · AI 时事跟踪",
  description:
    "聚焦视觉/图像、生物、光学等方向，自动追踪 arXiv、bioRxiv 最新论文，中文精读站内直读。",
};

export default function Papers() {
  const day = getLatestPapers();
  return <PapersPage day={day} />;
}
