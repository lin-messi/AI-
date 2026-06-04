# 规则更新通道

规则有两条互补的通道：

| 通道 | 命令 | 产物 | 用途 |
| --- | --- | --- | --- |
| **PDF 提炼（权威）** | `npm run rules:build` | `data/rm-rules.json` | 含确切数值的结构化规则（任务/得分/关键词），驱动检索与用途评估 |
| **网页发现（辅助）** | `npm run rules:fetch` | `data/rm-rules-web.json` | 自动发现规则文件入口地址 + 整站目录快照 + 关键词建议 |

> 提炼用的模型是 **deepseek-v4-pro**（走 DeepSeek 的 Anthropic 兼容端点）。日常翻译仍用便宜的 `deepseek-chat`，互不影响。
> 配置自检：`npm run ai:ping`（确认 key/端点可用）。

## 一、PDF 提炼（权威，含确切数值）

把官方 RoboMaster 规则 **PDF** 放进本目录，然后运行 `npm run rules:build`。脚本会：

1. 抽取目录下所有 `*.pdf` 的文本（优先 `pdftotext`，回退 `python + pypdf`）。
2. 调用 deepseek-v4-pro 提炼成结构化的 `data/rm-rules.json`（赛事任务、得分点、检索关键词等）。
3. 把上一版 `data/rm-rules.json` 归档到 `data/rm-rules-archive/`。

注意：

- **PDF 不会被提交**（`.gitignore` 已忽略 `rules/*.pdf`），只提交提炼后的 `data/rm-rules.json`。
- 需要 `AI_API_KEY`（与翻译共用）。规则模型/端点可用 `AI_RULES_MODEL`、`AI_RULES_BASE_URL` 覆盖（默认 `deepseek-v4-pro` / `https://api.deepseek.com/anthropic`）。
- 比赛规则手册 + 参赛手册、RMUC + RMUL 都可放进来，脚本会合并提炼。
- 提炼后请人工核对 `data/rm-rules.json`（尤其 `tasks` 的 `categories` 标签与数值）再提交。

## 二、网页发现（自动找规则页地址）

```bash
npm run rules:fetch            # 发现入口 + 目录 + 关键词建议
npm run rules:fetch -- --no-ai # 只发现 + 目录，不调用模型（省 token）
```

- 从官方总入口（`data/rm-rules.json` 的 `monitorUrl`，默认 `https://bbs.robomaster.com/wiki/20204847`）出发，
  自动发现当前赛季 **RMUC / RMUL / RMUA「比赛规则文件」入口地址**——因为子页地址每赛季会变，但总入口稳定。
- 结果写入 `data/rm-rules-web.json`（边车文件，**不会覆盖** 权威的 `data/rm-rules.json`）。
- **局限**：该 Wiki 是客户端渲染（Nuxt SPA），规则**正文需要在浏览器里点击进入才看得到**，普通抓取拿不到正文，
  也没有可直接下载的 PDF。因此网页通道只做「发现入口 + 目录快照 + 关键词建议」，**确切数值仍以 PDF 提炼为准**。

## 三、自动监测

`npm run rules:monitor`（GitHub Action 每周自动跑，见 `.github/workflows/monitor-rm-rules.yml`）：

- 抓总入口、解析目录，**分别**为 RMUC / RMUL / RMUA 的规则入口算指纹，并对整站目录算全局指纹。
- 入口地址/名称变化或目录变化 → 存档快照到 `data/rm-rules-monitor-archive/` 并自动建 Issue 提醒复核。
- 抓不到时**保留旧状态**、不误报。
- 手动发现流程见 `.github/workflows/rules-fetch.yml`（`workflow_dispatch` 手动触发）。

## 每年新规则出来时

1. （可选）先 `npm run rules:fetch`，确认最新规则入口地址与关键词建议。
2. 下载新赛季 PDF，替换/放入本目录，`npm run rules:build`。
3. 检查 `data/rm-rules.json` 的 `season`/`version`/`changes_zh`，确认无误。
4. 提交 `data/rm-rules.json`（及归档文件）。后续抓取的论文/开源会自动按新规则调整检索词与用途评估。
