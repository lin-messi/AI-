// 同域 PDF 代理：arXiv/bioRxiv 的 PDF 设置了 frame-ancestors，无法直接 iframe。
// 通过本域代理转发，去除限制头，使其可在站内 <iframe> 中打开。
// 仅允许白名单学术站点，防止 SSRF。
export const dynamic = "force-dynamic";

const ALLOW_HOSTS = [
  "arxiv.org",
  "www.arxiv.org",
  "biorxiv.org",
  "www.biorxiv.org",
  "medrxiv.org",
  "www.medrxiv.org",
];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url") || "";
  let u;
  try {
    u = new URL(target);
  } catch {
    return new Response("无效的 URL", { status: 400 });
  }
  if (u.protocol !== "https:" || !ALLOW_HOSTS.includes(u.host)) {
    return new Response("不允许的来源", { status: 403 });
  }
  try {
    const upstream = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AIPapersTracker/1.0)" },
      redirect: "follow",
    });
    if (!upstream.ok) {
      return new Response(`上游错误 ${upstream.status}`, { status: 502 });
    }
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(`代理失败：${e.message}`, { status: 502 });
  }
}
