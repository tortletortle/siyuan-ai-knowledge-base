# knowledge-poc：思源 + RAG 最小离线竖切片

这个原型验证修订后的设计：**思源保存经过筛选的干净知识，来源保存证据，检索层为 AI 组装少量可引用上下文**。

## 当前已实现

- `fixtures/knowledge.json`：模拟从思源导出的精炼知识条目。
- `fixtures/sources.json`：模拟 PDF、视频和 Markdown 来源元数据。
- `fixtures/siyuan-samples/`：三篇真实样例文档（坐标空间、Label 组件、SPINE 骨骼动画）的模拟思源块结构。
- `src/schema.mjs`：校验状态、来源和关系。
- `src/retrieve.mjs`：状态/主题过滤、可解释关键词评分、一跳关系扩展、来源证据拼装。
- `src/siyuan-security.mjs`：安全策略——URL 校验、凭据管理、只读 API 白名单。
- `src/siyuan-adapter.mjs`：思源只读适配器（支持 dry-run 和真实 API）。
- `src/cli.mjs`：输出 JSON context pack，供后续模型调用。
- `scripts/siyuan-audit.mjs`：安全审计脚本——评估真实数据映射和检索质量。
- `test/retrieve.test.mjs`：精确检索、关系问题、过期过滤和无答案保护。
- `test/security.test.mjs`：URL 校验、凭据安全、SQL 模板不可变、API 白名单。
- `test/siyuan-adapter.test.mjs`：适配器 dry-run、卡片块过滤、双链提取、schema 校验、检索集成。

## 运行

```bash
# 运行全部测试（39 个）
npm test

# 运行 demo 查询
npm run demo

# 自定义查询
npm run query -- "学习状态机前需要什么"

# Dry-run 审计（使用 fixture 样例，不连接网络）
npm run audit

# 上下文压缩基线对比
npm run baseline
```

## 思源审计

审计脚本用于验证真实思源数据能否正确映射到检索系统。

### Dry-run 模式（不需要思源）

```bash
npm run audit
```

使用 `fixtures/siyuan-samples/` 中的三篇样例文档运行完整审计流程。

### Live 模式（连接本地思源）

**安全约束：**
- 凭据文件路径必须通过 `SIYUAN_TOKEN_FILE` 环境变量指定——代码中不保留任何路径。
- 默认拒绝环回和私有地址。访问本地思源必须显式设置 `SIYUAN_ALLOW_LOCAL=1`。
- SQL 使用固定查询模板——外部值不拼入 SQL，在 JavaScript 中过滤。
- 只允许只读 API 端点，写接口被白名单排除。

```bash
SIYUAN_TOKEN_FILE=/path/to/token.txt \
SIYUAN_ALLOW_LOCAL=1 \
SIYUAN_BASE_URL=http://127.0.0.1:6806 \
SIYUAN_NOTEBOOK_IDS=notebook-id-1,notebook-id-2 \
node scripts/siyuan-audit.mjs
```

## 数据边界

原始 PDF、视频转写、网页全文和 API 快照应先进入来源层，经筛选、去重和人工确认后，才形成 `knowledge.json` 中的 active 知识。真实接入时，思源只读适配器应替换 fixture，不改变 `retrieve()` 的输出契约。

从思源读取的文档默认为 `candidate` 状态，需人工确认后改为 `active` 才会进入默认检索。

## 试点验收

- 精确问题能命中目标概念并返回页码/时间戳等定位。
- 关系问题能扩展一跳关系。
- `deprecated` 不会进入默认答案。
- 无答案时直接返回空命中，不编造事实。
- context pack 只包含少量精炼内容和证据，不发送整份来源资料。
- 卡片块（`data-type="card"`）不被索引。
- 双链引用（`((block-id))`）被正确提取为检索关系。
- 悬空关系（指向不存在条目的引用）被过滤。

## 下一步（按优先级）

1. ~~修正只读适配器的凭据和 SQL 安全问题~~ ✅
2. ~~明确本机思源 API 的安全访问策略~~ ✅
3. ~~读取三篇真实样例~~ ✅（fixture 模拟，待替换为真实 API 数据）
4. 建立块级索引（从真实思源 API 批量读取）
5. 用真实问题测试召回
6. 增加术语词典和字段权重
7. 评估是否需要 BM25
8. 仍不足时加入 Embedding
9. 最后接入 LLM 生成和引用校验

### 暂时不做

- `nodejieba` 分词依赖
- Embedding 模型 / 向量数据库
- LLM 生成层
- Web UI
- 自动回写思源
- 批量整理 652 篇笔记
