# Codex 项目说明

- 每次完成代码或文档改动后，在最终回复中提供一条可直接使用的 git commit message。
- 尽量使用 Conventional Commit 风格，类型前缀可保留英文，描述尽量使用中文，例如 `fix: 调整成就榜标签浮窗位置`。

## 游戏源码分析入口

- `game-source/current/` 是固定上游 commit 的 Git 子模块；日常操作不得使用 `git submodule update --remote` 或在子模块内执行 `git pull` 来自动跟随上游。
- 用户要求“分析游戏源码”或提出等价请求时，必须在采取分析操作前完整阅读并遵守 [`game-source/ANALYSIS_CONTRACT.md`](game-source/ANALYSIS_CONTRACT.md)。
- 仅分析不授权修改利润网。分析阶段只能改分析报告、报告索引、固定 SHA 说明及验证后的子模块 gitlink；不得修改利润网实现、测试、配置、PRD 或生成产物。
- 只有用户在报告完成后明确要求修复、同步或更新利润网，才能进入独立的实现阶段。
- 不得修改或提交子模块内的上游源码；分析失败时必须按详细契约恢复旧 SHA，不得留下半更新的 gitlink。
