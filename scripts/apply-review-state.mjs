import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [knowledgePath, reviewPath, outputPath] = process.argv.slice(2);
if (!knowledgePath || !reviewPath || !outputPath) throw new Error('usage: node scripts/apply-review-state.mjs <candidate-knowledge.json> <review-state.json> <active-knowledge.json>');
const knowledge = JSON.parse(await readFile(resolve(knowledgePath), 'utf8'));
const review = JSON.parse(await readFile(resolve(reviewPath), 'utf8'));
const decisions = review.decisions ?? {};
const ids = new Set(knowledge.knowledge.map((item) => item.knowledge_id));
const missing = Object.keys(decisions).filter((id) => !ids.has(id));
if (missing.length) throw new Error(`review contains unknown knowledge IDs: ${missing.join(', ')}`);
const reviewed = knowledge.knowledge.map((item) => {
  const decision = decisions[item.knowledge_id];
  if (!decision?.evidence_verified || !decision?.content_matches_source) throw new Error(`unverified item: ${item.knowledge_id}`);
  return { ...item, status: decision.status, related: decision.related ?? item.related, pitfalls: decision.pitfalls ?? item.pitfalls, review: { reviewed_at: review.reviewed_at, reviewer: review.reviewer, note: decision.note ?? null } };
});
if (reviewed.some((item) => item.status !== 'active')) throw new Error('all first-batch items must be explicitly approved as active');
const output = { ...knowledge, generated_at: new Date().toISOString(), policy: 'reviewed first-batch Siyuan knowledge base; original Siyuan content remains read-only', knowledge: reviewed, review_state: reviewPath };
await writeFile(resolve(outputPath), JSON.stringify(output, null, 2), 'utf8');
console.log(JSON.stringify({ output: resolve(outputPath), knowledge: reviewed.length, active: reviewed.filter((item) => item.status === 'active').length, evidence_complete: reviewed.every((item) => item.evidence?.length > 0) }, null, 2));
