# 测试计划

## 目标
验证“干净知识 + 可追溯来源 + 分层检索”在合成数据和已有 K17 课程资料上的搜索质量，同时发现转写、笔记、闪卡和测验中的疑似问题。所有检查只读，不修改原始文件和思源。

## 测试集

### 公开 smoke 集
仓库 `fixtures/` 中的合成 JSON，仅用于回归和公开 CI：

```bash
npm run eval:quality
npm test
```

### 私有真实课程集
真实文件只放在仓库外，不提交 GitHub。第一批使用：

- K17 第 009 课：坐标空间转换
- K17 第 014 课：Label 组件
- K17 第 017 课：SPINE 骨骼动画

每课四个文件：`transcript.txt`、`.md`、`.flashcards.html`、`.quiz.html`。原始视频不作为测试输入。

私有评测数据建议目录：

```text
C:/temp/knowledge-poc-private/k17/
  knowledge.json
  sources.json
  eval-cases.json
  runs/
```

## 评测用例

第一版准备 20–30 条私有问题，覆盖：

- 概念定义；
- 属性和应用；
- 概念对比；
- 前置知识；
- API/代码精确检索；
- 来源核验；
- 跨课程干扰；
- 知识库外问题；
- 过期内容或不应召回内容。

每条用例至少包含：`id`、`query`、`expected_ids` 或 `acceptable_ids`、`expected_answerability`、`requires_evidence`、`tags`、`annotation_version`。

## 运行外部评测

```bash
node scripts/quality-eval.mjs \
  --knowledge=C:/temp/knowledge-poc-private/k17/knowledge.json \
  --sources=C:/temp/knowledge-poc-private/k17/sources.json \
  --cases=C:/temp/knowledge-poc-private/k17/eval-cases.json \
  --out=C:/temp/knowledge-poc-private/k17/runs/latest
```

外部评测必须同时提供三个路径；外部数据必须位于公开仓库之外。报告只保存数据集哈希、数量、指标和逻辑用例 ID，不保存原文、quote、token 或绝对路径。

## 指标和门槛

先记录基线，再改算法：

- Hit@1：精确术语问题目标 ≥ 0.90；
- Hit@3：普通问题目标 ≥ 0.85；
- MRR；
- 平均 Precision；
- 无答案误命中率目标 ≤ 0.10；
- 证据问题覆盖率目标 = 1.0；
- deprecated/archived 污染率必须为 0；
- 上下文长度和 P95；
- 按意图、课程和标签分组。

小样本只用于发现问题，不能把门槛结果当作统计结论。

## 问题处理顺序

```text
主题/课程误召回 → 硬过滤和阈值
术语漏召回 → 术语表和字段权重
关系方向错误 → 修正关系查询
上下文过长 → 摘要优先、证据按需
仍有表达差异漏检 → 再评估 BM25/Embedding
```

质量报告是建议，不是自动修复。每条建议都需要人工确认。

## 数据安全

- 不把课程原文、HTML、思源快照、视频或 token 放入公开仓库；
- 不请求本机思源 API；本测试阶段只使用本地文件；
- 报告写到仓库外；
- 不写回、移动、删除或修改任何输入；
- 公开仓库只保留合成 fixture、代码、schema 和计划。
