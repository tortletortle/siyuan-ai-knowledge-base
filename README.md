# knowledge-poc：思源 + RAG 最小离线竖切片

这个原型验证修订后的设计：**思源保存经过筛选的干净知识，来源保存证据，检索层为 AI 组装少量可引用上下文**。

## 当前已实现

- `fixtures/knowledge.json`：模拟从思源导出的精炼知识条目。
- `fixtures/sources.json`：模拟 PDF、视频和 Markdown 来源元数据。
- `src/schema.mjs`：校验状态、来源和关系。
- `src/retrieve.mjs`：状态/主题过滤、可解释关键词评分、一跳关系扩展、来源证据拼装。
- `src/cli.mjs`：输出 JSON context pack，供后续模型调用。
- `test/retrieve.test.mjs`：精确检索、关系问题、过期过滤和无答案保护。

## 运行

```bash
cd knowledge-poc
npm test
npm run demo
npm run query -- "学习状态机前需要什么"
```

第一版只使用 Node 内置模块，不调用模型、向量数据库、网络或真实思源 API。当前检索已支持问题意图（定义/前置/对比/应用/证据）、状态过滤、术语别名、关系方向和三种上下文模式：`summary`（默认只给摘要）、`explanation`（加入正文）、`evidence`（加入可定位来源）。中文检索使用可解释的词语/二元组匹配，不等同于 embedding RAG；它只是验证接口、数据边界和上下文压缩方向。

## 数据边界

原始 PDF、视频转写、网页全文和 API 快照应先进入来源层，经筛选、去重和人工确认后，才形成 `knowledge.json` 中的 active 知识。真实接入时，思源只读适配器应替换 fixture，不改变 `retrieve()` 的输出契约。笔记显示与知识提取的协调规则见 `KB_CONTRACT.md`，新课骨架见 `templates/lesson-template.md`。关系图谱见 `GRAPH.md`，用 `npm run graph -- <index.json> <out-dir>` 导出 Mermaid 图和思源 MOC 文档。

## 试点验收

- 精确问题能命中目标概念并返回页码/时间戳等定位。
- 关系问题能扩展一跳关系。
- `deprecated` 不会进入默认答案。
- 无答案时直接返回空命中，不编造事实。
- context pack 只包含少量精炼内容和证据，不发送整份来源资料。

## 下一步（未实现）

1. 只读思源 HTTP API 导出文档/块和属性。
2. PDF、视频转写、网页清洗、API 增量同步适配器。
3. 关键词 + embedding 的混合检索。
4. 从思源块引用抽取图关系。
5. 接入模型，强制回答携带证据并区分“不足依据”。
6. 仅把人工确认的候选条目回写思源。
