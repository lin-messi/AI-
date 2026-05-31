import PapersPage from "@/components/PapersPage";
import { getLatestPapers, getPapersDates, getPapersIndex } from "@/lib/papers";

// 用 ISR 缓存：论文一天仅更新 2 次，缓存 10 分钟可大幅加速首屏；
// 每次自动抓取后会 git push 触发 Vercel 重新部署，缓存随之刷新，数据照样新。
export const revalidate = 600;

export const metadata = {
  title: "学术前沿 · AI 时事跟踪",
  description:
    "聚焦视觉/图像、生物、光学等方向，自动追踪 arXiv、bioRxiv 最新论文，中文精读站内直读。",
};

export default function Papers() {
  const day = getLatestPapers();
  const dates = getPapersDates();
  const latest = getPapersIndex().latest;
  return <PapersPage day={day} dates={dates} latest={latest} />;
}
