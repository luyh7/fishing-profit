# 钓鱼收益计算器

一个用于计算钓鱼游戏收益的静态网页工具。

## 功能特性

- 📊 实时计算不同鱼饵的收益对比
- 🎣 支持多种鱼钩和鱼竿等级配置
- 🗺️ 多地图选择和收益分析
- 💰 24小时收益预测
- 📱 响应式设计，支持移动端

## 在线访问

部署后可通过 GitHub Pages 访问：`https://你的用户名.github.io/仓库名/`

## 本地使用

直接在浏览器中打开 `index.html` 文件即可使用。

## 自动部署

本项目已配置 GitHub Actions，每次推送到 `main` 或 `master` 分支时会自动部署到 GitHub Pages。

仓库还包含一个定时同步工作流，会按固定间隔拉取 `http://223.109.140.105:4158/` 的最新数据，并把 `gh-pages` 分支里的 `nest-buff.json` 更新为最新内容，然后自动提交到仓库。

### 首次部署设置步骤

1. 将代码推送到 GitHub 仓库
2. 进入仓库的 Settings > Pages
3. 在 "Build and deployment" 部分：
   - Source 选择 "GitHub Actions"
4. 推送代码后，Actions 会自动运行并部署

## 配置说明

所有游戏数据配置都在 `config.js` 文件中，包括：

- 鱼钩等级和加速效果
- 鱼饵类型和价格
- 地图信息和鱼类数据
- 稀有度概率分布
- 打窝数据静态源地址 `nestBuffSourceUrl`

如果你要把定时程序输出到 GitHub Pages 可访问的静态数据源，建议把 `nestBuffSourceUrl` 改成 gh-pages 分支对应的 raw JSON 地址，例如：

```js
nestBuffSourceUrl: "https://raw.githubusercontent.com/luyh7/fishing-profit/gh-pages/nest-buff.json";
```

如果你想改同步频率，编辑 `.github/workflows/sync-nest-buff.yml` 里的 cron 表达式即可。

仓库内还提供了 `.githooks/pre-commit`，本地启用后会在每次提交前自动递增 `gitCommitCount` 并重新暂存 `config.js`。

## 技术栈

- 纯 HTML + CSS + JavaScript
- 无需构建工具
- 无外部依赖

## License

MIT

## Cloudflare Worker nest buff sync

Nest buff data is served by the Worker in `workers/nest-buff-sync`.
Because the original IP source returns HTTP 403 to Cloudflare Worker egress,
the Worker stores JSON in Cloudflare KV and only reads it at request time.
The Tencent Cloud Function in `tencent-scf/nest-buff-sync` fetches the upstream
JSON and writes it directly to Cloudflare KV.

Deploy the Worker, then replace the placeholder in `config.js`:

```js
nestBuffSourceUrl: "https://<your-worker-host>/nest-buff.json";
```

Deploy the Tencent Cloud Function with a timer trigger so it can refresh the KV
entry on a schedule.
