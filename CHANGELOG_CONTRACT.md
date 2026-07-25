# 提交前 Changelog 契约

准备 commit 时遵守本文件；`AGENTS.md` 只保留入口。

## 规则

- 跳过：`docs` / `chore` / `merge`。其余影响用户可见行为或收益计算的提交必须写。
- 混有可跳过与需写入内容时，仍要写。
- 源码分析阶段不得改 `config.js` 时，不要为补 changelog 破约；获得实现授权后再补。
- `config.changelog` 每次 commit 一条，插到数组顶部；同日合并只由前端做。
- 字段：

```js
{
  version: "{versionPrefix}.{git rev-list --count HEAD + 1}",
  date: "yyyy-MM-dd", // Asia/Shanghai
  summary: "用户可感知的一句话，去掉 feat:/fix: 前缀",
}
```

- `version` 必须用提交当下的 `HEAD+1` 计算，与 pre-commit 写入的 `gitCommitCount` 一致。
- 不得手改 `gitCommitCount`；不得按上一条 changelog 版本 +1（docs/chore/merge 也会占号）。
- 非用户要求不要改 `versionPrefix`。
