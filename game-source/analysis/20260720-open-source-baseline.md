# 2026-07-20 开源子模块基准迁移

## 结论

游戏源码现已迁移为上游 Git 子模块。利润网不再在主仓库中保存解压源码或源码压缩包，后续分析通过固定的上游 commit 保证可复现。

## 基准

- 上游仓库：[`RShock/zhenxun_plugin_fishing`](https://github.com/RShock/zhenxun_plugin_fishing)
- 首次固定 commit：[`18a5c95b929c36a4b255ccc686e6560316cb3765`](https://github.com/RShock/zhenxun_plugin_fishing/commit/18a5c95b929c36a4b255ccc686e6560316cb3765)
- 上游提交时间：2026-07-20 00:02:59 +08:00
- 旧压缩包快照：`zhenxun_plugin_fishing_20260719_134826.7z`
- 旧快照固定位置：利润网提交 [`267d99c`](https://github.com/luyh7/fishing-profit/tree/267d99c/game-source/current)

## 迁移边界

上游仓库从旧压缩包生成之后才建立，现有公开历史中没有与旧快照完全一致的 commit。忽略换行符差异后，最接近的上游首个提交仍有 16 个同路径文件存在实质内容差异；因此本次操作既是存储方式迁移，也是一次明确的源码基准升级，不能视为无内容变化的目录调整。

首次基准选择迁移时的上游 HEAD `18a5c95`。该 commit 与利润网已经生成并校验的星空评分源码哈希一致。以后日常拉取只恢复主仓库记录的该固定 SHA；只有开始新版分析时才比较并推进子模块指针。

## 后续分析口径

每次分析必须记录旧 SHA、目标 SHA 和固定 compare 链接，先审查游戏实际结算变化，再同步利润网实现、测试及文档。验证完成前不得提交新的子模块指针。

## 验证

- 子模块以 detached HEAD 固定到 `18a5c95b929c36a4b255ccc686e6560316cb3765`，其 `origin/main` 在迁移时指向同一 commit。
- 利润网完整 Node.js 测试 `52/52` 通过，其中包含 Python 评分源码漂移校验和星空评分数据重复生成测试。
- `app.js`、`catch-outcome.js`、`config.js`、`starry-expectation.js`、`starry-score-pmf.js` 与评分生成器语法检查通过。
- Git 补丁格式检查通过；Pages 部署不初始化子模块，网页运行时也不依赖子模块内容。
