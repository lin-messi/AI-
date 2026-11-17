import AcademicCompare from "@/components/AcademicCompare";
import { comparisons } from "@/lib/academic-comparisons.mjs";

export const metadata = {
  title: "同题论文对照 · AI 时事跟踪",
  description: "核对同类论文的任务、实验设置、基线、结果和作者代码。",
};

export default function Compare() {
  return <AcademicCompare groups={comparisons} />;
}
