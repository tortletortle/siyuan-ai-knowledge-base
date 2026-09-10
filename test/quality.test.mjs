import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQueries } from '../src/quality.mjs';

const dataset = { knowledge: [{ knowledge_id: 'a', status: 'active' }, { knowledge_id: 'b', status: 'active' }], sources: [] };
const fake = (_dataset, query) => {
  const ids = query === 'first' ? ['a', 'b'] : query === 'second' ? ['b', 'a'] : query === 'one' ? ['a'] : [];
  return { intent: 'definition', direct: ids.map((id) => ({ item: { knowledge_id: id, status: 'active' } })), evidence: [], answerability: ids.length ? 'supported' : 'insufficient_evidence', metrics: { contextChars: 10 } };
};

test('quality preserves standard hit_at_1 independently of answer policy', () => {
  const result = evaluateQueries(dataset, [{ id: 't', query: 'second', expected_ids: ['a'], answer_policy: 'any' }], fake);
  assert.equal(result.rows[0].hit_at_1, false);
  assert.equal(result.rows[0].answer_hit, true);
  assert.equal(result.aggregate.hit_at_1, 0);
});

test('hit and mrr aggregates only count answerable cases', () => {
  const result = evaluateQueries(dataset, [
    { id: 'yes', query: 'first', expected_ids: ['a'] },
    { id: 'no', query: 'nothing-matches', expected_ids: [] }
  ], fake);
  assert.equal(result.aggregate.answerable, 1);
  assert.equal(result.aggregate.hit_at_1, 1);
  assert.equal(result.aggregate.mrr, 1);
  assert.equal(result.aggregate.no_answer_false_hit_rate, 0);
});

test('any and all policies distinguish partial and complete answers', () => {
  const result = evaluateQueries(dataset, [
    { id: 'any', query: 'one', expected_ids: ['a', 'b'], answer_policy: 'any' },
    { id: 'all', query: 'one', expected_ids: ['a', 'b'], answer_policy: 'all' },
    { id: 'all-complete', query: 'first', expected_ids: ['a', 'b'], answer_policy: 'all' }
  ], fake);
  assert.equal(result.rows.find((row) => row.id === 'any').answer_hit, true);
  assert.equal(result.rows.find((row) => row.id === 'all').answer_hit, false);
  assert.equal(result.rows.find((row) => row.id === 'all-complete').answer_hit, true);
});
