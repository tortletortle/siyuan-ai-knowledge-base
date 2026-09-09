#!/usr/bin/env node
/**
 * SiYuan read-only audit script.
 *
 * Usage:
 *   # Dry-run with fixture samples (no network):
 *   node scripts/siyuan-audit.mjs --dry-run
 *
 *   # Live audit against local SiYuan (requires explicit opt-in):
 *   SIYUAN_TOKEN_FILE=/path/to/token.txt \
 *   SIYUAN_ALLOW_LOCAL=1 \
 *   SIYUAN_BASE_URL=http://127.0.0.1:6806 \
 *   node scripts/siyuan-audit.mjs
 *
 * Security:
 * - Token path comes ONLY from SIYUAN_TOKEN_FILE env var — never hardcoded.
 * - SQL queries are fixed templates — no string concatenation.
 * - Loopback/private addresses are blocked unless SIYUAN_ALLOW_LOCAL=1.
 * - Only read API endpoints are permitted.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SiYuanAdapter } from '../src/siyuan-adapter.mjs';
import { retrieve } from '../src/retrieve.mjs';
import { validateDataset } from '../src/schema.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// ─── Configuration ──────────────────────────────────────────────
// These are the notebook IDs we want to audit.
// In dry-run mode, these map to fixture data.
const TARGET_NOTEBOOKS = new Set(
  (process.env.SIYUAN_NOTEBOOK_IDS ?? '').split(',').filter(Boolean)
);

// Test queries to validate retrieval quality
const AUDIT_QUERIES = [
  '坐标空间与坐标转换',
  'Label 组件是什么',
  'SPINE 骨骼动画怎么用',
  '坐标转换的前置知识',
  'Label 和 SPINE 的区别',
];

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 SiYuan Audit — mode: ${dryRun ? 'DRY RUN (fixtures)' : 'LIVE'}\n`);

  let adapter;

  if (dryRun) {
    // Load fixture samples
    const samples = await loadFixtureSamples();
    adapter = new SiYuanAdapter({ dryRun: true, fixtures: samples });
    console.log('✅ Dry-run mode: using fixture samples, no network access.\n');
  } else {
    // Live mode — all security constraints apply
    const baseUrl = process.env.SIYUAN_BASE_URL;
    if (!baseUrl) {
      console.error('❌ SIYUAN_BASE_URL environment variable is required for live mode.');
      console.error('   For dry-run, use: node scripts/siyuan-audit.mjs --dry-run');
      process.exit(1);
    }

    adapter = new SiYuanAdapter({ baseUrl });
    await adapter.authenticate();
    console.log(`✅ Connected to SiYuan at ${baseUrl} (token from env).\n`);
  }

  // ─── Step 1: Load dataset ────────────────────────────────────
  const notebookIds = TARGET_NOTEBOOKS.size > 0 ? [...TARGET_NOTEBOOKS] : null;
  const dataset = await adapter.loadDataset({ notebookIds });

  console.log(`📦 Loaded ${dataset.knowledge.length} knowledge items, ${dataset.sources.length} sources.\n`);

  if (dataset.knowledge.length === 0) {
    console.log('⚠️  No knowledge items found. Check notebook IDs or fixture data.');
    return;
  }

  // ─── Step 2: Validate schema ─────────────────────────────────
  try {
    validateDataset(dataset.knowledge, dataset.sources);
    console.log('✅ Schema validation passed.\n');
  } catch (err) {
    console.error(`❌ Schema validation failed: ${err.message}\n`);
    // Continue anyway to show what we got
  }

  // ─── Step 3: Print knowledge items ───────────────────────────
  console.log('── Knowledge Items ──');
  for (const item of dataset.knowledge) {
    console.log(`  [${item.status}] ${item.knowledge_id}: ${item.title}`);
    console.log(`    topic: ${item.topic}`);
    console.log(`    summary: ${item.summary.slice(0, 80)}...`);
    console.log(`    sources: ${item.source_ids.join(', ')}`);
    console.log(`    relations: ${item.relations.length}`);
    console.log(`    evidence: ${item.evidence.length} entries`);
    console.log();
  }

  // ─── Step 4: Run audit queries ───────────────────────────────
  // Use activeOnly=false because audit items are candidate status (not yet human-confirmed).
  // This tests retrieval quality independently of the status workflow.
  console.log('── Audit Queries (activeOnly: false) ──');
  for (const query of AUDIT_QUERIES) {
    const result = retrieve(dataset, query, { activeOnly: false });
    console.log(`  Q: "${query}"`);
    console.log(`    intent: ${result.intent} | answerability: ${result.answerability}`);
    console.log(`    direct: ${result.direct.length} | neighbors: ${result.neighbors.length} | evidence: ${result.evidence.length}`);
    if (result.direct.length > 0) {
      console.log(`    top hit: ${result.direct[0].item.title} (score: ${result.direct[0].score})`);
    }
    console.log(`    context: ${result.metrics.contextChars} chars (~${result.metrics.approximateTokens} tokens)`);
    console.log();
  }

  // ─── Step 5: Summary ─────────────────────────────────────────
  const totalChars = dataset.knowledge.reduce((sum, k) => sum + k.body.length + k.summary.length, 0);
  console.log('── Summary ──');
  console.log(`  Total knowledge items: ${dataset.knowledge.length}`);
  console.log(`  Total source entries: ${dataset.sources.length}`);
  console.log(`  Total content size: ${totalChars} chars`);
  console.log(`  Status distribution:`, statusDistribution(dataset.knowledge));
  console.log(`  Mode: ${dryRun ? 'dry-run (fixtures)' : 'live API'}`);
}

function statusDistribution(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

async function loadFixtureSamples() {
  const samplesDir = join(root, 'fixtures', 'siyuan-samples');
  try {
    const [notebooks, documents, blocks] = await Promise.all([
      readFile(join(samplesDir, 'notebooks.json'), 'utf8').then(JSON.parse),
      readFile(join(samplesDir, 'documents.json'), 'utf8').then(JSON.parse),
      readFile(join(samplesDir, 'blocks.json'), 'utf8').then(JSON.parse),
    ]);
    return { notebooks, documents, blocks };
  } catch (err) {
    console.error(`Warning: Could not load fixture samples from ${samplesDir}: ${err.message}`);
    return { notebooks: [], documents: [], blocks: [] };
  }
}

main().catch((err) => {
  console.error(`\n❌ Audit failed: ${err.message}`);
  process.exit(1);
});
