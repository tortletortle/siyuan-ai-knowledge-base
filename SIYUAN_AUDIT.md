# 思源只读实时审计脚本

`scripts/siyuan-audit.mjs` 只读取本机 `http://127.0.0.1:6806` 的思源 API，并且只从环境变量 `SIYUAN_TOKEN` 读取凭据。token 不会打印，也不会写入报告。

运行：

```bash
npm run audit:siyuan
SIYUAN_AUDIT_OUTPUT=out/siyuan-sample-audit-live.json npm run audit:siyuan
```

可通过环境变量覆盖：

- `SIYUAN_API`：仅允许本机 6806 API
- `SIYUAN_TOKEN_FILE`：token 文件路径
- `SIYUAN_NOTEBOOK`：笔记本名称
- `SIYUAN_AUDIT_OUTPUT`：审计 JSON 输出路径

当前只审计交接说明中的三个样例 source ID，不修改、创建、移动、重命名或删除任何思源内容。