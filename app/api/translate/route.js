// 按需翻译单篇论文：前端点击「站内精读」时调用，节省预翻译成本。
import { translateOnePaper } from "@/scripts/enrich-papers.mjs";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { title, abstract } = await req.json();
    if (!title && !abstract) {
      return Response.json({ error: "缺少标题或摘要" }, { status: 400 });
    }
    const result = await translateOnePaper({
      title: title || "",
      abstract: abstract || "",
    });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e.message || "翻译失败" },
      { status: 500 }
    );
  }
}
