import RoboMasterPage from "@/components/RoboMasterPage";
import {
  getLatestRobo,
  getRoboDates,
  getRoboIndex,
  getRoboCurated,
  getRoboGeneral,
  getRoboRules,
} from "@/lib/robomaster";

// ISR 缓存：RM 资料每 2 小时抓取一次，缓存 10 分钟可加速首屏；
// 每次自动抓取后 git push 触发 Vercel 重新部署，缓存随之刷新。
export const revalidate = 600;

export const metadata = {
  title: "RM算法 · AI 时事跟踪",
  description:
    "RoboMaster 算法资料自动收集：自瞄、能量机关、SLAM、导航、路径规划、强化学习等方向的最新论文与开源库。",
};

export default function Robomaster() {
  const day = getLatestRobo();
  const dates = getRoboDates();
  const latest = getRoboIndex().latest;
  const curated = getRoboCurated();
  const general = getRoboGeneral();
  const rules = getRoboRules();
  return (
    <RoboMasterPage
      day={day}
      dates={dates}
      latest={latest}
      curated={curated}
      general={general}
      rules={rules}
    />
  );
}
