import status from "../.cloudflare-build/status.json" with { type: "json" };
import { translateOnePaper } from "../scripts/enrich-papers.mjs";
import { GET as getPDF } from "../app/api/paper-pdf/route.js";

const json = (body, code = 200) => Response.json(body, {
  status: code,
  headers: { "Cache-Control": "no-store" },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/status") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return json(status);
    }
    if (url.pathname === "/api/paper-pdf") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return getPDF(request);
    }
    if (url.pathname === "/api/translate") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "不允许跨站调用" }, 403);
      if (!(request.headers.get("content-type") || "").includes("application/json")) {
        return json({ error: "请使用 JSON 请求" }, 415);
      }
      // Bound the actual streamed body, not only a caller-controlled Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "缺少请求内容" }, 400);
      const chunks = [];
      let length = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16000) { await reader.cancel(); return json({ error: "请求内容过长" }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return json({ error: "无效的 JSON" }, 400); }
      const { title = "", abstract = "" } = body || {};
      if (typeof title !== "string" || typeof abstract !== "string" || (!title && !abstract)) {
        return json({ error: "缺少有效的标题或摘要" }, 400);
      }
      if (title.length > 1000 || abstract.length > 10000) return json({ error: "标题或摘要过长" }, 413);
      if (!env.AI_API_KEY) return json({ error: "未配置站内翻译密钥，请在 Cloudflare 添加 AI_API_KEY" }, 503);
      try {
        return json(await translateOnePaper({ title, abstract }, { env, timeoutMs: 60000 }));
      } catch (error) {
        console.error("Paper translation failed:", error.name);
        return json({ error: "翻译服务暂时不可用，请稍后重试" }, 502);
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
