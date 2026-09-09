# 知识库质量评估

本阶段增加了只读质量评估：

- `src/quality.mjs`：检索 Recall@K、MRR、误召回、证据覆盖和优化建议。
- `src/source-quality.mjs`：转写重复、模板元话语、音频描述、乱码和异常长行检查。
- `src/learning-quality.mjs`：转写、笔记、闪卡、测验文件配对和笔记术语初步核验。
- `scripts/quality-eval.mjs`：输出 `quality-report.json` 和 `quality-report.md`。
- `fixtures/eval-cases.json`：离线检索评测用例。

运行 fixture 质量评估：

```bash
npm run eval:quality
```

运行真实课程的只读质量评估时，传入每课按顺序排列的四个文件：

```bash
npm run eval:quality -- --out=C:/temp/k17-quality \
  "...transcript.txt" "...note.md" "...flashcards.html" "...quiz.html"
```

报告只写入指定输出目录，不修改原始转写、笔记、闪卡、测验或思源。规则发现的是“需要复核的信号”，不是自动确认的事实错误；每条建议都要求人工确认。真实课程文件不要提交到公开仓库。