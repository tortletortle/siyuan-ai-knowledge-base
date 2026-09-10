# 首批真实思源知识库

本目录由只读思源块索引生成，保存结构化候选知识，不回写思源。

## 当前范围

- 坐标空间与坐标转换：11 条候选知识
- Label 组件：9 条候选知识
- SPINE 骨骼动画：18 条候选知识
- 合计：38 条候选知识

## 状态

38 条候选知识已通过逐条人工审核，全部升级为 `active`。每条条目保留真实 `block:{block_id}` 证据定位。

审核台账 `review-state.json` 独立于原始候选知识保存，包含每条知识的：
- `content_matches_source`：内容与源块是否一致
- `evidence_verified`：证据 block ID 是否可解析
- `related`：相关概念
- `pitfalls`：易错点（来自课程测验解析）
- `note`：审核备注

## 文件

- `candidate-knowledge.json`：结构化候选知识、来源和审核字段
- `candidate-knowledge.md`：便于人工审核的阅读版
- `coverage-report.json`：三篇文档的核心知识点覆盖和排除区段报告
- `review-state.json`：逐条审核台账
- `active-knowledge.json`：审核后的正式知识库（38 条全部 active）

原始思源快照和课程正文位于仓库外，不应提交到公开仓库。
