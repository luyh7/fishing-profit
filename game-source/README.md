# 游戏源码基准

本目录保存利润网使用的游戏源码基准和历史分析报告。游戏现已开源，因此不再归档源码压缩包。

## 目录结构

```text
game-source/
  ANALYSIS_CONTRACT.md  # 游戏源码分析的详细强制流程
  current/   # RShock/zhenxun_plugin_fishing Git 子模块
  analysis/  # 历史对比和复核报告
```

上游仓库：[`RShock/zhenxun_plugin_fishing`](https://github.com/RShock/zhenxun_plugin_fishing)

首次公开基准：`18a5c95b929c36a4b255ccc686e6560316cb3765`

当前固定 commit：`56a330a258dfc4ffdd0cd1011ad8898b717cd47b`

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

## 分析报告

- 初始对照：[`analysis/20260717_123059.md`](analysis/20260717_123059.md)
- 指定问题修复后复核：[`analysis/20260717_123059-after-fixes.md`](analysis/20260717_123059-after-fixes.md)
- 新版源码更新复核：[`analysis/20260719_134826.md`](analysis/20260719_134826.md)
- 新版逻辑同步后复核：[`analysis/20260719_134826-after-sync.md`](analysis/20260719_134826-after-sync.md)
- 开源子模块基准迁移：[`analysis/20260720-open-source-baseline.md`](analysis/20260720-open-source-baseline.md)
- 上游 `56a330a` 三类问题报告：[`analysis/20260720-56a330a.md`](analysis/20260720-56a330a.md)

旧版报告保留其生成时的快照口径和结论。旧压缩包及解压源码已经从当前工作树删除，但仍可从利润网历史提交 `267d99c` 找到；新的分析必须改用上游完整 commit SHA。
