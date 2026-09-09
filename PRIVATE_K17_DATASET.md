# 私有 K17 测试集说明

真实课程资料不进入本仓库。使用时在仓库外生成数据集：

1. 从三篇课程的 transcript、Markdown、flashcards 和 quiz 建立外部 `knowledge.json`、`sources.json`；
2. 为每个知识条目使用私有逻辑 ID；
3. 从真实问题人工建立 `eval-cases.json`；
4. 通过 `npm run eval:quality -- --knowledge=... --sources=... --cases=... --out=...` 运行；
5. 只保留脱敏聚合指标和数据集哈希。

建议每课至少准备：

- 5 个定义问题；
- 3 个属性/应用问题；
- 2 个对比或前置问题；
- 1 个来源问题；
- 1 个跨课干扰问题；
- 1 个知识库外问题。

这形成约 39 条问题的初始集合。第一轮也可以先用 20 条，确认标注流程后再扩大。