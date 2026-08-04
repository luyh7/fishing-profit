# 游戏源码基准

本目录保存利润网使用的游戏源码基准和历史分析报告。游戏现已开源，因此不再归档源码压缩包。

## 目录结构

```text
game-source/
  ANALYSIS_CONTRACT.md  # 游戏源码分析的详细强制流程
  current/   # RShock/zhenxun_plugin_fishing Git 子模块
  analysis/  # Markdown 源文档、HTML 阅读版和 PNG 图片报告
```

上游仓库：[`RShock/zhenxun_plugin_fishing`](https://github.com/RShock/zhenxun_plugin_fishing)

首次公开基准：`18a5c95b929c36a4b255ccc686e6560316cb3765`

当前固定 commit：`bd4cbbddcdea34d02155c6a2d9e67fdc3011b49f`

主仓库记录的是固定的子模块 commit。普通拉取不会自动跟随上游 `main`；用户要求“分析游戏源码”或提出等价请求时，才启动新版只读分析流程并在验证后推进该指针。

## 获取固定源码

首次克隆利润网时：

```bash
git clone --recurse-submodules <利润网仓库地址>
```

已有利润网工作区首次初始化子模块：

```bash
git submodule update --init --recursive
```

日常拉取利润网及其已经固定的游戏版本：

```bash
git pull --recurse-submodules
```

也可以为当前仓库启用递归子模块操作：

```bash
git config submodule.recurse true
```

这些命令只会检出利润网主仓库记录的 SHA，不会擅自切换到上游最新源码。

## 分析契约

用户要求“分析游戏源码”或提出等价请求时，必须先完整阅读并遵守 [`ANALYSIS_CONTRACT.md`](ANALYSIS_CONTRACT.md)。源码分析是只读检查利润网并提交三类问题报告的独立阶段，不包含利润网修复授权。

## 报告生成

Markdown 是报告的审查源文档。完成分析后，在仓库根目录运行以下命令，会为每份报告生成同名 HTML 和整页 PNG：

```bash
node scripts/render-analysis-report.js game-source/analysis/<report>.md
```

也可以用 `--all` 批量重新生成历史报告；`--no-image` 只生成 HTML。HTML 可直接在浏览器打开，PNG 适合在变更记录或讨论中快速查看。

## 分析报告

每份报告提供 HTML 阅读版、PNG 图片和 Markdown 源文档：

- 初始对照：[`HTML`](analysis/20260717_123059.html) / [`PNG`](analysis/20260717_123059.png) / [`Markdown`](analysis/20260717_123059.md)
- 指定问题修复后复核：[`HTML`](analysis/20260717_123059-after-fixes.html) / [`PNG`](analysis/20260717_123059-after-fixes.png) / [`Markdown`](analysis/20260717_123059-after-fixes.md)
- 新版源码更新复核：[`HTML`](analysis/20260719_134826.html) / [`PNG`](analysis/20260719_134826.png) / [`Markdown`](analysis/20260719_134826.md)
- 新版逻辑同步后复核：[`HTML`](analysis/20260719_134826-after-sync.html) / [`PNG`](analysis/20260719_134826-after-sync.png) / [`Markdown`](analysis/20260719_134826-after-sync.md)
- 开源子模块基准迁移：[`HTML`](analysis/20260720-open-source-baseline.html) / [`PNG`](analysis/20260720-open-source-baseline.png) / [`Markdown`](analysis/20260720-open-source-baseline.md)
- 上游 `56a330a` 三类问题报告：[`HTML`](analysis/20260720-56a330a.html) / [`PNG`](analysis/20260720-56a330a.png) / [`Markdown`](analysis/20260720-56a330a.md)
- 上游 `fbd5567` 三类问题报告：[`HTML`](analysis/20260720-fbd5567.html) / [`PNG`](analysis/20260720-fbd5567.png) / [`Markdown`](analysis/20260720-fbd5567.md)
- 上游 `fbd5567` 同 SHA 闭环复核：[`HTML`](analysis/20260721-fbd5567.html) / [`PNG`](analysis/20260721-fbd5567.png) / [`Markdown`](analysis/20260721-fbd5567.md)
- 上游 `29e6047` 三类问题报告：[`HTML`](analysis/20260722-29e6047.html) / [`PNG`](analysis/20260722-29e6047.png) / [`Markdown`](analysis/20260722-29e6047.md)
- 上游 `6ba6fce` 三类问题报告：[`HTML`](analysis/20260725-6ba6fce.html) / [`PNG`](analysis/20260725-6ba6fce.png) / [`Markdown`](analysis/20260725-6ba6fce.md)
- 上游 `afb892f` 三类问题报告：[`HTML`](analysis/20260726-afb892f.html) / [`PNG`](analysis/20260726-afb892f.png) / [`Markdown`](analysis/20260726-afb892f.md)
- 上游 `e6a2161` 三类问题报告：[`HTML`](analysis/20260728-e6a2161.html) / [`PNG`](analysis/20260728-e6a2161.png) / [`Markdown`](analysis/20260728-e6a2161.md)
- 上游 `e6a2161` 同 SHA 闭环复核：[`HTML`](analysis/20260728-e6a2161-same-sha.html) / [`PNG`](analysis/20260728-e6a2161-same-sha.png) / [`Markdown`](analysis/20260728-e6a2161-same-sha.md)
- 上游 `e6a2161` 地图配置同 SHA 闭环复核：[`HTML`](analysis/20260729-e6a2161-same-sha.html) / [`PNG`](analysis/20260729-e6a2161-same-sha.png) / [`Markdown`](analysis/20260729-e6a2161-same-sha.md)
- 上游 `bd4cbbd` 三类问题报告：[`HTML`](analysis/20260731-bd4cbbd.html) / [`PNG`](analysis/20260731-bd4cbbd.png) / [`Markdown`](analysis/20260731-bd4cbbd.md)

旧版报告保留其生成时的快照口径和结论。旧压缩包及解压源码已经从当前工作树删除，但仍可从利润网历史提交 `267d99c` 找到；新的分析必须改用上游完整 commit SHA。
