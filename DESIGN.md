# 思源 AI 知识库：设计思路（总纲）

> 读者：接手的 AI（本地）或人。读完这份文档 + `KB_CONTRACT.md` + `GRAPH.md`，
> 即可实现 §10 的任务卡，无需追溯讨论过程。
> 当前工程状态：`npm test` 33/33 通过，分支 `arena/01a08b72-siyuan-ai-knowledge-base`。

## 1. 问题与目标

- 输入：思源笔记里的课程笔记（2808 文档，含正文、卡片、测验、闲聊）。
- 输出：干净、可引用、可追溯的知识库 + 关系图谱，供 AI 组装回答上下文。
- 核心矛盾：**笔记是写给人看的（自由、漂亮），知识库是写给检索看的（结构、干净）**。
  本设计的全部内容，都是为了解开这个矛盾，且**不牺牲任意一边**。

## 2. 核心判断（why，先于 how）

1. **先治理，后检索**：全文塞向量库是错的。原始资料先进来源层，经筛选去重人工确认，
   才成为 active 知识。检索只读 active。
2. **宁缺毋滥**：无命中返回空（`insufficient_evidence`），绝不编造；
   `deprecated/archived` 默认不可见；可疑的一律上报人工，不静默处理。
3. **显示与知识解耦**：正文归人，机器通道走 IAL 块属性（人眼无感）；
   显示随便变，提取只认契约（`KB_CONTRACT.md`）。
4. **人做判断，机器做苦力**：价值判断（哪块值得入库）、歧义消解永远归人；
   机器负责记住位置、发现变化、生成候选。全自动是伪命题，不追求。
5. **原生优先**：能用思源原生能力（模板/别名/嵌入块/闪卡/图谱/CSS片段）就不用自造；
   自造的部分只保留纸条命名和外部脚本。

## 3. 总架构

```text
思源笔记（L0 自由书写）
  │ 贴纸条（L1，2分钟/课：圈出值得入库的块）
  ▼
只读导出（SQL/API 快照，仓库外）─── token 只走环境变量，不落盘
  │ normalizeBlocks：IAL 过滤 + 引用解析 + content_hash
  ▼
块索引（index.json，仓库外）
  ├─→ 候选知识生成 ──→ 人工审核（review-state）──→ active 知识库
  │                                              │
  ├─→ 检索层 retrieve() ──→ context pack（summary/explanation/evidence 三模式）
  │                                              │
  └─→ 图谱层 buildGraph ──→ graph.json / Mermaid / MOC（块引地图）
  ▲
  └─ 回写（只写 IAL：custom-kb-status，永远不碰正文）
```

## 4. 数据契约

- `knowledge.json`：`knowledge_id/title/summary/body/topic/status/source_ids/relations/evidence`
  + 定位字段 `doc_id/root_id/block_id`。状态机 `candidate→active`，`deprecated/archived` 默认过滤。
- `sources.json`：来源元数据，`locator` 必须可定位（页码/时间戳/`block:id`）。
- 别名：优先读块原生别名（IAL `alias`，逗号分隔），`fixtures/aliases.json` 仅作全局兜底。
- IAL 纸条（完整优先级见 `KB_CONTRACT.md`）：
  `custom-kb-exclude`（丢弃）> `custom-kb-include`（救回）> 标题猜测；
  `custom-kb-topic` 覆盖主题；`custom-kb-status` 回写挂牌（`active/stale`）。
- 引用边：`((id))` / `siyuan://blocks/id` / 块引 HTML，`[[wiki]]` 只算弱链接不算边。

## 5. 检索设计（`src/retrieve.mjs`）

- 流程：意图识别 → active/课程硬过滤 → 字段加权评分（title 8 / alias 5 / topic 3 / text 1）
  → 去重（正文归一化，limit 前）→ 一跳关系扩展（按意图限关系类型）→ context pack。
- 每次命中必须可解释：`matches: [{term, field}]`。
- 已知短板（见 §10 T4）：中文靠 bigram、无 IDF、无分词；先上 `Intl.Segmenter`
  （零依赖），再评估 BM25/embedding，顺序不可反。
- 评测（`src/quality.mjs`）：Hit@K、MRR（只在有答案子集算）、污染率必须为 0、
  无答案误命中率；小样本只发现问题，不做统计结论；先冻结标注版本再跑基线。

## 6. 图谱设计（`src/graph.mjs`，详见 `GRAPH.md`）

- 三层边：引用边（全自动）+ 结构边（同文档/主题，全自动）+ 语义边（前置/对比，人定）。
- 导出三件套：`graph.json`（节点/边/未解析清单）+ `graph.md`（Mermaid）+ `moc.md`（块引地图）。
- 未解析引用进 `unresolved` 清单，不编造边。
- 思源内看图：MOC 文档（静态）或 SQL 嵌入块（活查，推荐），原生图谱 `Alt+8/9` 点亮；
  边自然生长靠“反链提及一键转块引”，不靠猜。

## 7. 思源原生适配（映射表在 `KB_CONTRACT.md` §5）

模板（`templates/lesson-template.md`，`data/templates/`，`/` 触发）→ 课程骨架；
原生别名 → 术语别名；SQL 嵌入块 → 活的已入库清单；原生闪卡（FSRS）→ 复习（与入库正交）；
CSS 片段（`snippets/kb-badges.css`）→ 已入库/待复核徽标；
反链提及 → 图谱边的零成本来源。

## 8. 工作流

- L0 写笔记（30分钟，零负担，脑子里没有知识库）→
  L1 轻标记（2分钟，套模板/贴纸条，只做“值不值得入库”的判断）→
  机器生成候选 → L2 审核（5分钟，逐条 yes/no，进 `review-state.json`）→ active。
- 回写铁律：只写 IAL（`custom-kb-status=active` + `custom-kb-id`），不改正文、不调顺序、
  不插摘要。违反此条即破坏人与机器的信任边界。
- 过期：笔记改了 → `content_hash` 变了 → 对应知识标 `stale` 待复核（黄牌），
  而不是静默撒谎。样式已在 CSS 片段预埋，检测脚本待实现（§10 T3）。

## 9. 工程现状（已实现，勿重复造）

- `src/block-index.mjs`：`parseIAL` / `extractRefs` / IAL 感知过滤 / `kb_topic/kb_status/kb_aliases`。
- `src/graph.mjs`：`buildGraph/toMermaid/toMOC/cleanLabel`；`scripts/export-graph.mjs`（`npm run graph`）。
- `src/retrieve.mjs` + `quality/source-quality/learning-quality` + 评测脚本。
- `test/`：33 测试全绿，含 `contract.test.mjs`（契约回归）与 `graph.test.mjs`。
- 约束：零依赖（只用 Node 内置模块）、只读优先、私有数据永不进仓库、
  新功能必须带测试且不破坏旧测试。

## 10. 待实现任务卡（给本地 AI，按顺序做）

### T1 回写挂牌脚本（最高优，约半天）

- 新文件 `scripts/apply-kb-status.mjs`，`package.json` 加 `npm run apply:status`。
- 输入：`active-knowledge.json`（仓库外私有路径，参数传入）+ 环境变量 `SIYUAN_TOKEN`。
- 行为：对每条 active 知识的 `block_id` 调 `/api/attr/setBlockAttrs`，
  写 `custom-kb-status=active`、`custom-kb-id=<knowledge_id>`。
- 铁律：只调属性接口，不调任何改正文的接口；必须支持 `--dry-run`（默认开启，
  只打印不写）；幂等（重复跑结果一致）；失败逐条报错不中断，最后给汇总。
- 验收：`--dry-run` 输出 N 条待写记录；`test/` 新增 mock fetch 测试
  （不断言真实 API，只断言请求体形状与幂等逻辑）。

### T2 批量打标脚本（约半天）

- 新文件 `scripts/suggest-tags.mjs`，只读 + 打印建议，不写思源。
- 输入：快照 index.json；行为：扫描标题（卡片/测验/导航变体）与知识区闲聊行，
  输出“建议贴纸条”清单（block_id + 建议属性 + 命中原因）。
- 验收：fixture 上跑，输出包含预期的 3 类建议；纯函数可测。

### T3 过期检测脚本（约 2 小时，有 100 条 active 后再做也行）

- 新文件 `scripts/check-stale.mjs`：对比知识条目入库时记录的 `content_hash`
  与新快照的当前 hash（入库 hash 存在哪由实现定，建议知识条目加 `source_hash` 字段），
  变了的输出待复核清单（可接 T1 标 `stale`）。
- 验收：构造“改前/改后”两份 fixture index，输出恰好标出改过的那条。

### T4 中文分词替换 bigram（约 1 天，先跑基线再改）

- 先用当前算法在私有集跑 `eval:quality` 存基线（仓库外），再改 `src/retrieve.mjs` 的 `terms()`：
  用 Node 原生 `Intl.Segmenter('zh')` 分词替代 bigram，保留字段权重与可解释 `matches`。
- 验收：旧测试全绿 + 新旧基线对比报告（Hit@K/MRR 变化 + 误召回 case 分析）；
  若指标倒退，保留两种分词的可切换实现，不硬切。

### T5 语义边标注链路（约半天）

- 把 `review-state.json` 的 `related` 人工标注，转成知识条目的 `relations`
 （`prerequisite_of/contrasts_with`），并让 `buildGraph` 合并引用边与语义边输出。
- 验收：端到端测试——含 2 条语义关系的 fixture → graph.json 里出现对应 typed 边。

### T6 真实快照试跑（人工 + AI 配合）

- 在仓库外真实快照上跑 `build-real-siyuan-index` + `export-graph`，
  只把聚合数字（块数/边数/未解析数/孤点率）记下来，不贴原文。
- 目标：回答“2808 文档里真实引用有多少”，决定补块引的工作量。

## 11. 铁律（永远不做，违反即否决该实现）

1. 不把课程原文/快照/token/视频/绝对路径放进仓库；报告只留哈希与聚合指标。
2. 回写只碰 IAL，不碰正文（§8 回写铁律）。
3. 不从正文猜语义（ no 新增正则猜关系/分类）；不确定的进清单给人。
4. 不静默丢弃：丢了什么、为什么丢，必须可查（测试或清单）。
5. 不引入依赖：Node 内置模块解决问题（分词用 `Intl.Segmenter`，不要 jieba）。
6. 不改契约不告示：动 `KB_CONTRACT.md` 的优先级 = 破坏性变更，必须同步改
   `test/contract.test.mjs` 并说明理由。

## 12. 术语表

L0/L1/L2（自由写/轻标记/已审核）、纸条（`custom-kb-*` IAL）、MOC（块引地图文档）、
context pack（喂给模型的少量可引用上下文）、stale（原文已变待复核）、
unresolved（引用目标不在索引中）。
