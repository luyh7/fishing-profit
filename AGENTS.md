# Codex 项目说明

- 每次完成代码或文档改动后，在最终回复中提供一条可直接使用的 git commit message。
- 尽量使用 Conventional Commit 风格，类型前缀可保留英文，描述尽量使用中文，例如 `fix: 调整成就榜标签浮窗位置`。

## 游戏源码更新契约

- `game-source/current/` 是上游仓库 `https://github.com/RShock/zhenxun_plugin_fishing.git` 的 Git 子模块；利润网主仓库只记录经过确认的固定 commit，不归档源码压缩包，也不直接提交上游源码文件。
- 日常拉取利润网时只能同步主仓库已经记录的子模块 commit，不得自动跟随上游 `main`；禁止把 `git submodule update --remote` 或子模块内的 `git pull` 作为日常更新步骤。
- 只有用户明确要求分析新版游戏源码时，才可在子模块中执行 `git fetch`。更新前必须记录旧 SHA 和目标 SHA，并先检查 `旧 SHA..目标 SHA` 的源码差异。
- 新版分析应以游戏实际结算路径为准，同步检查利润网实现、测试和文档；验证完成后才可将子模块以 detached HEAD 固定到目标 SHA，并在主仓库提交新的 gitlink。
- 不得直接修改或提交子模块内的上游源码。若抓取、分析、检出或验证失败，必须把 `game-source/current/` 恢复到主仓库原先记录的 commit，不得提交半更新的子模块指针。
- 历史分析必须记录完整的上游 commit SHA，并优先使用带 commit 的固定链接，不得用会随子模块更新而漂移的 `game-source/current/` 路径作为长期证据链接。
