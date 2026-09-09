import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SiYuanAdapter } from '../src/siyuan-adapter.mjs';
import { retrieve } from '../src/retrieve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function getAdapter() {
  const { readFile } = await import('node:fs/promises');
  const samplesDir = join(root, 'fixtures', 'siyuan-samples');
  const [notebooks, documents, blocks] = await Promise.all([
    readFile(join(samplesDir, 'notebooks.json'), 'utf8').then(JSON.parse),
    readFile(join(samplesDir, 'documents.json'), 'utf8').then(JSON.parse),
    readFile(join(samplesDir, 'blocks.json'), 'utf8').then(JSON.parse),
  ]);
  return new SiYuanAdapter({ dryRun: true, fixtures: { notebooks, documents, blocks } });
}

test('adapter rejects non-localhost URL without SIYUAN_ALLOW_LOCAL', () => {
  assert.throws(() => {
    new SiYuanAdapter({ baseUrl: 'http://192.168.1.100:6806', dryRun: false });
  }, /rejected/);
});

test('dry-run adapter loads fixture documents', async () => {
  const adapter = await getAdapter();
  const docs = await adapter.fetchDocuments();
  assert.equal(docs.length, 3);
  assert.ok(docs.some((d) => d.content === '坐标空间与坐标转换'));
  assert.ok(docs.some((d) => d.content === 'Label 组件'));
  assert.ok(docs.some((d) => d.content === 'SPINE 骨骼动画'));
});

test('dry-run adapter filters by notebook ID', async () => {
  const adapter = await getAdapter();
  const docs = await adapter.fetchDocuments(new Set(['nb-game-dev']));
  assert.equal(docs.length, 3);
  const emptyDocs = await adapter.fetchDocuments(new Set(['nb-nonexistent']));
  assert.equal(emptyDocs.length, 0);
});

test('dry-run adapter returns child blocks for a document', async () => {
  const adapter = await getAdapter();
  const blocks = await adapter.fetchChildBlocks('20260801120000-coord01');
  assert.ok(blocks.length >= 4);
  assert.ok(blocks.every((b) => b.root_id === '20260801120000-coord01'));
});

test('card blocks are excluded from indexing', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();

  // The Label document has a card block (data-type="card") — it should not appear in the knowledge body
  const labelItem = dataset.knowledge.find((k) => k.title === 'Label 组件');
  assert.ok(labelItem);
  // The card block contains "闪卡复习" — this string must NOT appear in the indexed content
  assert.ok(!labelItem.body.includes('闪卡复习'), 'Card block content should not be indexed');
  assert.ok(!labelItem.summary.includes('闪卡复习'), 'Card block content should not be in summary');
});

test('source IDs are stable (based on document ID)', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  for (const item of dataset.knowledge) {
    assert.ok(item.source_ids.length > 0);
    for (const srcId of item.source_ids) {
      assert.match(srcId, /^siyuan-doc-/);
    }
  }
});

test('block references are extracted as relations', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();

  // SPINE doc references coord doc via ((20260801120000-coord01))
  const spineItem = dataset.knowledge.find((k) => k.title === 'SPINE 骨骼动画');
  assert.ok(spineItem);
  assert.ok(spineItem.relations.some((r) => r.target === 'siyuan-20260801120000-coord01'));
});

test('all items default to candidate status', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  // No custom-status attributes in fixtures, so all should be candidate
  assert.ok(dataset.knowledge.every((k) => k.status === 'candidate'));
});

test('evidence contains block-level locators', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  for (const item of dataset.knowledge) {
    assert.ok(item.evidence.length > 0, `${item.title} should have evidence`);
    for (const ev of item.evidence) {
      assert.match(ev.locator, /^block:/);
      assert.ok(ev.quote.length > 0);
    }
  }
});

test('dataset passes schema validation', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  const { validateDataset } = await import('../src/schema.mjs');
  assert.doesNotThrow(() => validateDataset(dataset.knowledge, dataset.sources));
});

test('retrieve works on adapter-produced dataset', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();

  // Override candidate status to active for retrieval testing
  // (retrieve defaults to activeOnly=true)
  const activeDataset = {
    knowledge: dataset.knowledge.map((k) => ({ ...k, status: 'active' })),
    sources: dataset.sources,
  };

  const result = retrieve(activeDataset, '坐标转换');
  assert.equal(result.answerability, 'supported');
  assert.ok(result.direct.length > 0);
  assert.equal(result.direct[0].item.title, '坐标空间与坐标转换');
});

test('retrieve finds Label by Chinese query', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  const activeDataset = {
    knowledge: dataset.knowledge.map((k) => ({ ...k, status: 'active' })),
    sources: dataset.sources,
  };

  const result = retrieve(activeDataset, 'Label 组件是什么');
  assert.equal(result.answerability, 'supported');
  assert.ok(result.direct.some((d) => d.item.title === 'Label 组件'));
});

test('retrieve finds SPINE with alias query', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  const activeDataset = {
    knowledge: dataset.knowledge.map((k) => ({ ...k, status: 'active' })),
    sources: dataset.sources,
  };

  const result = retrieve(activeDataset, 'SPINE 骨骼动画');
  assert.equal(result.answerability, 'supported');
  assert.ok(result.direct.some((d) => d.item.title === 'SPINE 骨骼动画'));
});

test('retrieve returns no results for unrelated query', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  const activeDataset = {
    knowledge: dataset.knowledge.map((k) => ({ ...k, status: 'active' })),
    sources: dataset.sources,
  };

  const result = retrieve(activeDataset, '量子计算纠错');
  assert.equal(result.direct.length, 0);
  assert.equal(result.answerability, 'insufficient_evidence');
});

test('context pack size is bounded', async () => {
  const adapter = await getAdapter();
  const dataset = await adapter.loadDataset();
  const activeDataset = {
    knowledge: dataset.knowledge.map((k) => ({ ...k, status: 'active' })),
    sources: dataset.sources,
  };

  const result = retrieve(activeDataset, '坐标空间');
  assert.ok(result.metrics.contextChars < 1000, `Context should be compact, got ${result.metrics.contextChars} chars`);
});
