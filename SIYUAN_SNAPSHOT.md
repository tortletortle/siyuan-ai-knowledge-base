# 思源离线快照验证

本目录不提交真实快照。可以使用本机已有的脱敏/审计 JSON 做字段形状检查：

```bash
node scripts/inspect-siyuan-snapshot.mjs \
  C:/Users/tortl/AI/tools/siyuan/full_all_docs.json \
  C:/Users/tortl/AI/tools/siyuan/siyuan_course_tree_backup_20260906-183212.json \
  C:/Users/tortl/AI/tools/siyuan/content_manifest.json
```

该脚本只读取 JSON，输出顶层字段、数组长度和少量字段形状，不读取 token、不请求网络、不修改文件、不把快照复制进仓库。

当前发现的可复用事实：

- `full_all_docs.json` 是 2,808 个文档的轻量列表，含 `hpath`、`id`、`root_id`。
- `content_manifest.json` 有 652 条来源记录，并包含 `siyuan_authoritative`、`siyuan_legacy`、`root_id`、`doc_id`、`block_count` 等审计字段。
- 这些快照没有提供完整块正文，不能替代真实块级 API 响应；下一步仍需要获得至少一个样例文档的脱敏 blocks/kramdown 响应，才能验证 `content`、`markdown`、`ial`、块类型和双链映射。