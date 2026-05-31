import GithubPage from "@/components/GithubPage";
import { getLatestGithub, getGithubDates, getGithubIndex } from "@/lib/github";

// ISR 缓存：开源推荐每天仅更新 1 次，缓存 10 分钟可大幅加速首屏；
// 每次自动抓取后 git push 触发 Vercel 重新部署，缓存随之刷新。
export const revalidate = 600;

export const metadata = {
  title: "开源精选 · AI 时事跟踪",
  description: "每日精选 GitHub 热门开源项目，全领域综合推荐，中文简介一目了然。",
};

export default function Github() {
  const day = getLatestGithub();
  const dates = getGithubDates();
  const latest = getGithubIndex().latest;
  return <GithubPage day={day} dates={dates} latest={latest} />;
}
