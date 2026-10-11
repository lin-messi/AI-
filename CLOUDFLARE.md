# Cloudflare 上线（保留新闻、论文、开源库、RM、翻译和 PDF）

本项目使用 **Workers + Static Assets**。Next.js 在构建时生成全部页面，只有 `/api/status`、`/api/translate` 和 `/api/paper-pdf` 由 Worker 执行。普通页面直接由静态资源服务处理。数据抓取和翻译仍由现有 GitHub Actions 完成。

## 1. 注册并创建 Cloudflare 账号

打开 https://dash.cloudflare.com/sign-up 注册、验证邮箱并登录。先使用免费的 Workers 套餐即可开始；动态接口仍受免费套餐额度限制。无需购买域名，首次上线可使用 `workers.dev` 地址。

## 2. 在 GitHub 配置自动部署（推荐）

代码合并到 `main` 后，在 Cloudflare Dashboard 的 Workers & Pages 页面找到 **Account ID**。

在 Cloudflare **My Profile → API Tokens → Create Token** 使用 **Edit Cloudflare Workers** 模板，仅授权你要部署的账号。没有自定义域名时不需要配置域名权限。复制新建的 Token。

打开仓库 https://github.com/lin-messi/AI-/settings/secrets/actions ，新增两个 Repository secrets：

| 名称 | 值 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号的 Account ID |
| `CLOUDFLARE_API_TOKEN` | 刚创建的 API Token |

这两个值只保存在 GitHub Secrets，不要写进代码、Issue 或聊天。原有抓取用 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 保持原位置。

打开仓库 **Actions → Cloudflare 构建与部署 → Run workflow**，选择 `main` 运行。任务会安装依赖、生成全部页面、测试接口、验证 Worker 包并部署。日志里会给出 `https://ai-news-tracker.<你的子域>.workers.dev` 地址。

如果账号首次使用 Workers 要求创建 workers.dev 子域，先在 Cloudflare **Workers & Pages** 完成子域设置，再重跑工作流。

**不要同时开启 Cloudflare 的 Git 构建**：本项目已经由 GitHub Actions 管理部署，避免重复构建。

## 3. 开启站内按需翻译

GitHub Secrets 中的 AI 密钥供抓取任务使用，不会自动出现在 Cloudflare 运行环境。

首次部署后打开 Cloudflare **Workers & Pages → ai-news-tracker → Settings → Variables and Secrets**：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `AI_API_KEY` | Secret | 你当前 AI 服务的密钥 |
| `AI_BASE_URL` | Variable | 与 GitHub 抓取任务一致的接口地址；默认 `https://api.deepseek.com` |
| `AI_MODEL` | Variable | 与 GitHub 抓取任务一致的模型；默认 `deepseek-v4-flash` |

保存并应用配置。没配置密钥时网站、预翻译内容和 PDF 仍能使用，按需翻译接口会返回明确的配置提示。

## 4. 验证上线与自动更新

- 检查首页、论文、开源库和 RM 页面，以及各自历史日期链接，直接刷新历史 URL。
- 打开 `/api/status`，核对最新日期和条数。
- 打开论文精读和 PDF；选择未预翻译的论文测试按需翻译。
- 在 GitHub Actions 手动运行“每日抓取 AI 新闻”。成功后，“Cloudflare 构建与部署”应自动运行，上线的数据应与新提交一致。
- 现有抓取定时任务用 `GITHUB_TOKEN` 提交数据，GitHub 不会再触发另一条 push 工作流。因此部署工作流专门监听抓取、规则抓取、规则监测的 `workflow_run` 成功事件，再检出最新 `main` 部署。
- GitHub 的定时任务可能排队延迟；公开仓库长期无活动也可能暂停定时任务，必要时在 Actions 页面重新启用。

## 5. 域名与 Vercel

没有自己的域名：直接使用新的 `workers.dev` 地址，更新书签和仓库 About 的网站链接。Vercel 的 `*.vercel.app` 地址不能迁移。

已有自己的域名：在 Cloudflare 管理域名 DNS 后，打开 Worker **Settings → Domains & Routes → Add → Custom Domain**，按提示添加。验证新地址和接口后，再断开 Vercel 的仓库自动部署；不要在验证前删除旧项目。

## 本地构建和预览

需要 Node.js 22 或更高版本。

```powershell
npm ci
npm run build:cloudflare
npm run test:cloudflare
npx wrangler deploy --dry-run
npx wrangler dev
```

`wrangler dev` 的本地地址通常是 `http://localhost:8787`。如需本地真实翻译，在项目根目录创建 `.dev.vars`，写入 `AI_API_KEY` 等配置；文件已被 Git 忽略。

原有 `npm run dev` 仍使用 Next.js 开发服务器与原 API，读取 `.env`。Cloudflare 构建生成在 `.cloudflare-build/`，不会改动原始页面或把 `.env` 发布出去。

也可以登录后从本机部署：

```powershell
npx wrangler login
npm run deploy:cloudflare
```

## 费用与排错

- 普通页面和静态文件使用静态资源服务；翻译、PDF 代理和状态轮询使用动态请求额度。Cloudflare 免费套餐不是所有接口无限使用。
- 站内翻译仍消耗 AI 服务商的额度，与网站托管额度分别计算。
- 构建成功却没部署：检查 GitHub Secrets 的两个 Cloudflare 项目；没有密钥时工作流只做检查并输出警告。
- 部署失败：检查 API Token 的账号授权、Workers 编辑权限，以及账号的 workers.dev 初始化情况。
- 按需翻译返回 503：在 **Cloudflare Worker** 添加运行时 `AI_API_KEY`，仅配置 GitHub Secrets 不够。
- 数据没更新：确认抓取任务成功且提交到 `main`，检查后续 Cloudflare 工作流是否成功。
- PDF 上游不可达：代理只访问白名单学术站点，上游限流或网络异常会返回 502，可重试或打开原文。

官方资料：
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/platform/pricing/
