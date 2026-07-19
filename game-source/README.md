# 游戏源码基准

本目录保存利润网使用的游戏源码基准和历史分析报告。游戏现已开源，因此不再归档源码压缩包。

## 目录结构

```text
game-source/
  current/   # RShock/zhenxun_plugin_fishing Git 子模块
  analysis/  # 历史对比和复核报告
```

上游仓库：[`RShock/zhenxun_plugin_fishing`](https://github.com/RShock/zhenxun_plugin_fishing)

当前首次公开基准：`18a5c95b929c36a4b255ccc686e6560316cb3765`

主仓库记录的是固定的子模块 commit。普通拉取不会自动跟随上游 `main`，只有开始一次明确的新版分析时才推进该指针。

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

## 分析新版

只有用户明确要求分析新版时，才执行以下流程：

1. 记录 `game-source/current` 当前完整 SHA。
2. 在子模块中执行 `git fetch origin main`，解析新的 `origin/main` SHA，但不执行日常式 `git pull`。
3. 使用 `git diff <旧 SHA>..<新 SHA>` 审查游戏源码变化，并以实际结算路径为准检查利润网实现、测试和文档。
4. 完成同步和验证后，以 detached HEAD 检出新 SHA，再由利润网主仓库提交 `game-source/current` 的 gitlink 变化。
5. 任一步失败都恢复旧 SHA，不提交半更新状态。

禁止直接修改子模块源码，也不使用 `git submodule update --remote` 自动推进版本。

## 分析报告

- 初始对照：[`analysis/20260717_123059.md`](analysis/20260717_123059.md)
- 指定问题修复后复核：[`analysis/20260717_123059-after-fixes.md`](analysis/20260717_123059-after-fixes.md)
- 新版源码更新复核：[`analysis/20260719_134826.md`](analysis/20260719_134826.md)
- 新版逻辑同步后复核：[`analysis/20260719_134826-after-sync.md`](analysis/20260719_134826-after-sync.md)
- 开源子模块基准迁移：[`analysis/20260720-open-source-baseline.md`](analysis/20260720-open-source-baseline.md)

旧版报告保留其生成时的快照口径和结论。旧压缩包及解压源码已经从当前工作树删除，但仍可从利润网历史提交 `267d99c` 找到；新的分析必须改用上游完整 commit SHA。
