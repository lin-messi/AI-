// 自检脚本：验证“规则提炼专用”的 AI 端点（默认 deepseek-v4-pro，走 Anthropic 兼容端点）是否可用。
//
// 使用方法：
//   npm run ai:ping
//
// 它会发一个极小的请求（要求模型回 {"ok":true}），打印当前使用的模型/端点与返回结果。
// 不依赖任何 PDF 或网络资源，用来快速确认 .env 里的 AI_API_KEY / AI_RULES_* 配置正确。

import { getRulesAIConfig, chatAnthropicJSON } from "./ai.mjs";

async function main() {
  const cfg = getRulesAIConfig();
  console.log(`端点：${cfg.baseURL}`);
  console.log(`模型：${cfg.model}`);
  console.log(`Key ：${cfg.apiKey ? cfg.apiKey.slice(0, 6) + "…（已配置）" : "（缺失）"}`);

  if (!cfg.enabled) {
    console.error("\n✗ 未检测到 AI_API_KEY / AI_RULES_API_KEY，请在 .env 中配置后重试。");
    process.exit(1);
  }

  console.log("\n发送测试请求…");
  const t0 = Date.now();
  // 注意：deepseek-v4-pro 是带 thinking 的推理模型，会先产生思考再产生正文，
  // max_tokens 给小了会被思考占满、导致没有正文返回，所以这里给足额度。
  const res = await chatAnthropicJSON(
    [{ role: "user", content: '只回一个 JSON 对象：{"ok": true, "model": "<你的模型名>"}，不要任何多余文字。' }],
    { temperature: 0, maxTokens: 2000 }
  );
  const ms = Date.now() - t0;

  console.log(`\n✓ 调用成功（${ms} ms），返回：`);
  console.log(JSON.stringify(res, null, 2));

  if (res && res.ok === true) {
    console.log("\n规则提炼端点工作正常。");
  } else {
    console.log("\n⚠ 端点有响应，但返回内容与预期不符（不一定是错误，模型可能没严格照格式回）。");
  }
}

main().catch((e) => {
  console.error("\n✗ 自检失败：", e?.message || e);
  console.error("  请检查 AI_API_KEY 是否有效、AI_RULES_BASE_URL 是否为 https://api.deepseek.com/anthropic、AI_RULES_MODEL 是否为 deepseek-v4-pro。");
  process.exit(1);
});
