# 规则更新通道

把官方 RoboMaster 规则 **PDF** 放进这个目录，然后运行：

```bash
npm run rules:build
```

脚本会：

1. 抽取目录下所有 `*.pdf` 的文本（优先 `pdftotext`，回退 `python + pypdf`）。
2. 调用 AI 提炼成结构化的 `data/rm-rules.json`（赛事任务、得分点、检索关键词等）。
3. 把上一版 `data/rm-rules.json` 归档到 `data/rm-rules-archive/`。

## 注意

- **PDF 不会被提交**（已在 `.gitignore` 忽略 `rules/*.pdf`），只提交提炼后的 `data/rm-rules.json`。
- 需要 `AI_API_KEY`（与翻译/摘要共用，写在根目录 `.env`）。
- 比赛规则手册 + 参赛手册、RMUC + RMUL 都可以放进来，脚本会合并提炼。
- 提炼后请人工核对 `data/rm-rules.json`（尤其 `tasks` 的 `categories` 标签与数值）再提交。

## 每年新规则出来时

1. 下载新赛季 PDF，替换/放入本目录。
2. `npm run rules:build`。
3. 检查 `data/rm-rules.json` 的 `season`/`version`/`changes_zh`，确认无误。
4. 提交 `data/rm-rules.json`（及归档文件）。后续抓取的论文/开源会自动按新规则调整检索词与用途评估。
