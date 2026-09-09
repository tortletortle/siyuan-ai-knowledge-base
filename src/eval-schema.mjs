import { createHash } from 'node:crypto';

const MODES = new Set(['summary', 'explanation', 'evidence']);
export function validateEvalCases(cases, knowledgeIds = new Set()) {
  if (!Array.isArray(cases)) throw new Error('evaluation cases must be an array');
  const ids = new Set();
  return cases.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`case ${index} must be an object`);
    if (!item.id || typeof item.id !== 'string' || ids.has(item.id)) throw new Error(`case ${index} has missing or duplicate id`);
    if (!item.query || typeof item.query !== 'string' || !item.query.trim()) throw new Error(`case ${item.id} has empty query`);
    const expected = item.expected_ids ?? item.acceptable_ids;
    if (!Array.isArray(expected)) throw new Error(`case ${item.id} needs expected_ids or acceptable_ids`);
    if (expected.length && knowledgeIds.size && expected.some((id) => !knowledgeIds.has(id))) throw new Error(`case ${item.id} references unknown knowledge id`);
    if (!expected.length && item.expected_answerability !== 'insufficient_evidence') throw new Error(`negative case ${item.id} must expect insufficient_evidence`);
    const answerPolicy = item.answer_policy ?? (expected.length > 1 ? 'any' : 'primary');
    if (!['any', 'all', 'primary'].includes(answerPolicy)) throw new Error(`case ${item.id} has invalid answer_policy`);
    const options = item.options ?? {};
    if (options.mode !== undefined && !MODES.has(options.mode)) throw new Error(`case ${item.id} has invalid mode`);
    for (const key of ['limit', 'neighborLimit']) if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > 50)) throw new Error(`case ${item.id} has invalid ${key}`);
    if (item.requires_evidence && options.mode && options.mode !== 'evidence') throw new Error(`case ${item.id} requires evidence mode`);
    ids.add(item.id);
    return { ...item, expected_ids: expected, answer_policy: answerPolicy, split: item.split ?? 'smoke', tags: item.tags ?? [], annotation_version: item.annotation_version ?? '1' };
  });
}
export function sha256Json(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
