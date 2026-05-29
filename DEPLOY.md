# 部署上线指南（AI 时事跟踪）

把网站发布成公网地址，并让它每天在云端自动抓取 + 翻译。
全程不需要你写代码，按下面步骤点几下即可。涉及账号注册的部分需要你本人完成。

---

## 第 1 步：建一个 GitHub 仓库（放代码的地方）

1. 打开 https://github.com 注册并登录
2. 右上角 **＋ → New repository**
3. 仓库名随意（如 `ai-news-tracker`），Public / Private 都行
4. **不要**勾选 “Add a README”，直接点 **Create repository**
5. 复制页面上显示的仓库地址（形如 `https://github.com/你的用户名/ai-news-tracker.git`）

## 第 2 步：把本地代码推上去

代码已经初始化并提交好了。在项目目录打开终端，运行（把地址换成你的）：

```bash
git remote add origin https://github.com/你的用户名/ai-news-tracker.git
git branch -M main
git push -u origin main
```

> 首次 push 可能弹出 GitHub 登录授权，按提示登录即可。

## 第 3 步：开启 Actions 的写入权限（很重要）

GitHub 仓库页面 → **Settings → Actions → General** →
下方 **Workflow permissions** 选 **Read and write permissions** → Save。
（不然机器人无法把每天抓到的新闻提交回仓库。）

## 第 4 步：配置 AI 翻译密钥（Secret）

GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，
新建以下密钥：

| Name | Value（值） |
|------|------------|
| `AI_API_KEY` | 你的 API Key |

如果用**免费的智谱**，再加两个（用 DeepSeek 可跳过这两个）：

| Name | Value |
|------|-------|
| `AI_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` |
| `AI_MODEL` | `glm-4-flash` |

> 不配 `AI_API_KEY` 也能上线，只是新闻显示英文原文、没有“为何重要”。

## 第 5 步：部署到 Vercel（变成公网网站）

1. 打开 https://vercel.com，点 **Continue with GitHub** 用 GitHub 账号登录
2. **Add New… → Project** → 找到刚才的仓库点 **Import**
3. 框架会自动识别为 **Next.js**，其它默认即可，点 **Deploy**
4. 等几分钟，得到一个公网网址（形如 `https://ai-news-tracker.vercel.app`），打开就是你的网站

## 第 6 步：触发一次 / 之后全自动

- 手动跑一次：GitHub 仓库 → **Actions → 每日抓取 AI 新闻 → Run workflow**
- 之后**全自动**：每天北京时间约 08:00 / 20:00 云端自动抓取+翻译 → 自动提交数据 → Vercel 自动重新部署 → 网站更新。你只管打开看。

---

## 常见问题

- **本机 `npm run fetch` 抓不到新闻？** 因为本地访问不了 Google。上线后由云端（GitHub Actions）抓取，不受影响。
- **想本地先把现有 100 条翻成中文？** 在项目根目录建 `.env`（参考 `.env.example`）填入 Key，运行 `npm run enrich`，再 `npm run dev` 查看。
- **想换模型？** 改 Secret 里的 `AI_BASE_URL` / `AI_MODEL` 即可（兼容 OpenAI 接口的服务都行）。
- **定时任务没跑？** 确认 workflow 文件在默认分支 `main` 上，且第 3 步的写入权限已开启。
