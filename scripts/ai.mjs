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

// 规则提炼专用配置：走 DeepSeek 的 Anthropic 兼容端点（base_url .../anthropic），
// 默认模型 deepseek-v4-pro（更强、更贵，仅用于"读规则"这种低频重任务）。
// Key 复用 AI_API_KEY（也可单独配 AI_RULES_API_KEY）。
export function getRulesAIConfig() {
  const apiKey = process.env.AI_RULES_API_KEY || process.env.AI_API_KEY || "";
  const baseURL = (
    process.env.AI_RULES_BASE_URL || "https://api.deepseek.com/anthropic"
  ).replace(/\/$/, "");
  const model = process.env.AI_RULES_MODEL || "deepseek-v4-pro";
  return { apiKey, baseURL, model, enabled: Boolean(apiKey) };
}

// 调用 Anthropic Messages 接口（POST /v1/messages），要求返回 JSON 对象。
// DeepSeek 的 /anthropic 端点用 x-api-key 鉴权、Anthropic 风格请求体；不支持
// response_format，因此靠提示词约束"只输出 JSON"，再从返回文本里解析。
export async function chatAnthropicJSON(
  messages,
  { system = "", temperature = 0.2, maxTokens = 8000 } = {}
) {
  const { apiKey, baseURL, model } = getRulesAIConfig();
  if (!apiKey) throw new Error("缺少 AI_API_KEY / AI_RULES_API_KEY");

  const res = await fetch(`${baseURL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI(Anthropic) 接口错误 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  // Anthropic 返回 content: [{type:"text", text:"..."}, ...]
  const content = Array.isArray(data?.content)
    ? data.content
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
    : "";
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

export async function chatAnthropicJSONWithRetry(messages, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await chatAnthropicJSON(messages, opts);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
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
