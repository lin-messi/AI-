// 通用 AI 客户端：兼容 OpenAI Chat Completions 接口。
// 默认使用 DeepSeek，可通过环境变量切换到任意兼容服务（智谱、OpenAI、Moonshot 等）。
//
// 环境变量（写在项目根目录 .env 文件，或在 GitHub Actions 用 Secret 注入）：
//   AI_API_KEY   你的 API Key（必填，留空则跳过翻译/摘要）
//   AI_BASE_URL  接口地址，默认 https://api.deepseek.com
//   AI_MODEL     模型名，默认 deepseek-chat

// 尝试加载 .env（Node 20.6+ 支持），失败则忽略
try {
  process.loadEnvFile();
} catch {
  /* 没有 .env 文件也没关系，可用系统环境变量 */
}

export function getAIConfig() {
  const apiKey = process.env.AI_API_KEY || "";
  const baseURL = (process.env.AI_BASE_URL || "https://api.deepseek.com").replace(
    /\/$/,
    ""
  );
  const model = process.env.AI_MODEL || "deepseek-chat";
  return { apiKey, baseURL, model, enabled: Boolean(apiKey) };
}

// 调用对话接口，要求返回 JSON 对象
export async function chatJSON(messages, { temperature = 0.2 } = {}) {
  const { apiKey, baseURL, model } = getAIConfig();
  if (!apiKey) throw new Error("缺少 AI_API_KEY");

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI 接口错误 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    // 个别模型可能包裹多余文本，尝试截取 JSON 部分
    const m = content.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

// 简单重试封装
export async function chatJSONWithRetry(messages, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await chatJSON(messages, opts);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}
