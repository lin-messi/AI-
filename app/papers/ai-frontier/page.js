import AIFrontierPage from "@/components/AIFrontierPage";
import { getAIFrontier } from "@/lib/papers";

export const metadata = {
  title: "AI 前沿 · AI 时事跟踪",
  description: "追踪机器学习与计算机视觉的近期成果，提供长期基线与可核对的作者资源。",
};

export default function AIFrontier() {
  return <AIFrontierPage snapshot={getAIFrontier()} />;
}
