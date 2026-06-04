// 轻量状态接口：返回新闻与论文的最新生成时间/条数，供前端轮询判断是否有新内容。
import { getLatest } from "@/lib/news";
import { getLatestPapers } from "@/lib/papers";
import { getLatestGithub } from "@/lib/github";
import { getLatestRobo, getRoboGeneral, getRoboRules } from "@/lib/robomaster";

export const dynamic = "force-dynamic";

export async function GET() {
  const news = getLatest();
  const papers = getLatestPapers();
  const github = getLatestGithub();
  const robo = getLatestRobo();
  const roboGeneral = getRoboGeneral();
  const rules = getRoboRules();
  return Response.json(
    {
      news: {
        date: news.date || null,
        generatedAt: news.generatedAt || null,
        count: (news.items || []).length,
      },
      papers: {
        date: papers.date || null,
        generatedAt: papers.generatedAt || null,
        count: (papers.items || []).length,
      },
      github: {
        date: github.date || null,
        generatedAt: github.generatedAt || null,
        count: (github.items || []).length,
      },
      robomaster: {
        date: robo.date || null,
        generatedAt: robo.generatedAt || null,
        count:
          (robo.papers?.items || []).length +
          (robo.repos?.items || []).length +
          (roboGeneral.items || []).length,
      },
      rules: rules
        ? {
            season: rules.season || null,
            version: rules.version || null,
            extractedAt: rules.extractedAt || null,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
