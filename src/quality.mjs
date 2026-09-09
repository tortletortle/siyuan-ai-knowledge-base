function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function firstRelevantRank(result, expectedIds) {
  const expected = new Set(expectedIds);
  const ranked = result.direct.map(({ item }) => item.knowledge_id);
  const index = ranked.findIndex((id) => expected.has(id));
  return index === -1 ? null : index + 1;
}

export function evaluateQueries(dataset, cases, retrieveFn) {
  const rows = cases.map((testCase) => {
    const result = retrieveFn(dataset, testCase.query, testCase.options ?? {});
    const expected = new Set(testCase.expected_ids ?? []);
    const directIds = result.direct.map(({ item }) => item.knowledge_id);
    const relevantCount = directIds.filter((id) => expected.has(id)).length;
    const rank = firstRelevantRank(result, expected);
    const irrelevantIds = directIds.filter((id) => !expected.has(id));
    const pollutedIds = result.direct.filter(({ item }) => ['deprecated', 'archived'].includes(item.status)).map(({ item }) => item.knowledge_id);
    const requiresEvidence = Boolean(testCase.requires_evidence);
    const evidenceCovered = !requiresEvidence || result.evidence.length > 0;
    return {
      id: testCase.id ?? testCase.query,
      query: testCase.query,
      intent: result.intent,
      expected_ids: [...expected],
      direct_ids: directIds,
      first_relevant_rank: rank,
      hit_at_1: rank === 1,
      hit_at_3: rank !== null && rank <= 3,
      hit_at_5: rank !== null && rank <= 5,
      precision_at_k: directIds.length ? relevantCount / directIds.length : 0,
      irrelevant_ids: irrelevantIds,
      deprecated_or_archived_ids: pollutedIds,
      evidence_covered: evidenceCovered,
      answerability: result.answerability,
      metrics: result.metrics,
      suggestions: suggestionsFor({ rank, irrelevantIds, pollutedIds, evidenceCovered, testCase, result })
    };
  });
  const ranks = rows.filter((row) => row.first_relevant_rank !== null).map((row) => row.first_relevant_rank);
  const noAnswerCases = rows.filter((row) => !(cases.find((item) => (item.id ?? item.query) === row.id)?.expected_ids ?? []).length);
  const noAnswerFalseHits = noAnswerCases.filter((row) => row.direct_ids.length > 0);
  const allContextChars = rows.map((row) => row.metrics.contextChars);
  const aggregate = {
    total: rows.length,
    hit_at_1: ratio(rows.filter((row) => row.hit_at_1).length, rows.length),
    hit_at_3: ratio(rows.filter((row) => row.hit_at_3).length, rows.length),
    hit_at_5: ratio(rows.filter((row) => row.hit_at_5).length, rows.length),
    mrr: ranks.length ? ranks.reduce((sum, rank) => sum + 1 / rank, 0) / rows.length : 0,
    mean_precision: mean(rows.map((row) => row.precision_at_k)),
    evidence_coverage: ratio(rows.filter((row) => row.evidence_covered).length, rows.length),
    deprecated_or_archived_pollution_rate: ratio(rows.filter((row) => row.deprecated_or_archived_ids.length).length, rows.length),
    no_answer_false_hit_rate: ratio(noAnswerFalseHits.length, noAnswerCases.length),
    context_chars: { mean: Math.round(mean(allContextChars)), p95: percentile(allContextChars, 0.95) },
    suggestions: [...new Set(rows.flatMap((row) => row.suggestions))]
  };
  return { aggregate, rows };
}

function suggestionsFor({ rank, irrelevantIds, pollutedIds, evidenceCovered, testCase, result }) {
  const suggestions = [];
  if (rank !== 1 && rank !== null) suggestions.push('提高标题、主题或术语字段权重，让正确条目更早出现');
  if (rank === null && (testCase.expected_ids ?? []).length) suggestions.push('增加术语别名或语义召回，当前查询未命中标注条目');
  if (irrelevantIds.length) suggestions.push('限制主题范围或提高最低匹配分数，减少误召回');
  if (pollutedIds.length) suggestions.push('默认过滤 deprecated/archived，并为历史查询提供显式模式');
  if (!evidenceCovered) suggestions.push('补充可定位来源后再允许生成确定性答案');
  if (!result.direct.length && !(testCase.expected_ids ?? []).length) suggestions.push('无答案行为符合预期');
  return suggestions;
}
function ratio(a, b) { return b ? Number((a / b).toFixed(4)) : 0; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
