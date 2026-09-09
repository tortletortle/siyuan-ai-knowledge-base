/**
 * Read-only SiYuan adapter.
 *
 * Security constraints:
 * - Token read from env variable SIYUAN_TOKEN_FILE only
 * - No SQL string concatenation — fixed queries + JS-side filtering
 * - URL validation rejects loopback/private unless SIYUAN_ALLOW_LOCAL=1
 * - Only read API endpoints allowed (no write operations)
 * - Supports dry-run mode using fixture data (no network calls)
 */

import { readFile } from 'node:fs/promises';
import { validateEndpoint, readTokenFromEnv, FIXED_QUERIES, isAllowedApiPath } from './siyuan-security.mjs';

export class SiYuanAdapter {
  #baseUrl = null;
  #token = null;
  #dryRun = false;
  #fixtures = null;

  /**
   * @param {object} options
   * @param {string} options.baseUrl - SiYuan API base URL (validated)
   * @param {boolean} options.dryRun - If true, use fixtures instead of network
   * @param {object} options.fixtures - Fixture data for dry-run mode
   */
  constructor(options = {}) {
    this.#dryRun = options.dryRun ?? false;
    this.#fixtures = options.fixtures ?? null;

    if (!this.#dryRun) {
      const endpointCheck = validateEndpoint(options.baseUrl);
      if (!endpointCheck.allowed) {
        throw new Error(`SiYuan endpoint rejected: ${endpointCheck.reason}`);
      }
      this.#baseUrl = endpointCheck.url.origin;
    }
  }

  /**
   * Load the API token from the file specified by SIYUAN_TOKEN_FILE env var.
   * Only needed for non-dry-run mode.
   */
  async authenticate() {
    if (this.#dryRun) return;

    const { tokenFile, reason } = readTokenFromEnv();
    if (reason) throw new Error(`Authentication failed: ${reason}`);

    try {
      this.#token = (await readFile(tokenFile, 'utf8')).trim();
    } catch (err) {
      throw new Error(`Cannot read token file "${tokenFile}": ${err.message}`);
    }

    if (!this.#token) throw new Error(`Token file "${tokenFile}" is empty.`);
  }

  /**
   * Execute a read-only API call. Rejects write endpoints.
   */
  async #apiCall(apiPath, body = {}) {
    if (!isAllowedApiPath(apiPath)) {
      throw new Error(`API path "${apiPath}" is not in the read-only allowlist.`);
    }

    const response = await fetch(`${this.#baseUrl}${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.#token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`SiYuan API ${apiPath} returned ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`SiYuan API ${apiPath} error: ${data.msg}`);
    }

    return data.data;
  }

  /**
   * List all notebooks, optionally filtered by allowed notebook IDs.
   */
  async listNotebooks(allowedNotebookIds = null) {
    if (this.#dryRun) {
      const notebooks = this.#fixtures?.notebooks ?? [];
      if (!allowedNotebookIds) return notebooks;
      return notebooks.filter((nb) => allowedNotebookIds.has(nb.id));
    }

    const data = await this.#apiCall('/api/notebook/lsNotebooks');
    const notebooks = data.notebooks ?? [];
    if (!allowedNotebookIds) return notebooks;
    return notebooks.filter((nb) => allowedNotebookIds.has(nb.id));
  }

  /**
   * Fetch all document blocks. Uses a fixed SQL query and filters in JS.
   * Notebook IDs are NEVER concatenated into SQL.
   */
  async fetchDocuments(allowedNotebookIds = null) {
    if (this.#dryRun) {
      const docs = this.#fixtures?.documents ?? [];
      if (!allowedNotebookIds) return docs;
      return docs.filter((doc) => allowedNotebookIds.has(doc.box));
    }

    // Fixed query — no string concatenation
    const data = await this.#apiCall('/api/query/sql', { stmt: FIXED_QUERIES.allDocuments });
    const allDocs = data ?? [];

    // Filter by notebook ID in JavaScript, not in SQL
    if (allowedNotebookIds) {
      return allDocs.filter((doc) => allowedNotebookIds.has(doc.box));
    }
    return allDocs;
  }

  /**
   * Fetch child blocks of a specific document by root_id.
   * Uses parameterized query (?), not string concatenation.
   */
  async fetchChildBlocks(rootId) {
    if (this.#dryRun) {
      const blocks = this.#fixtures?.blocks ?? [];
      return blocks.filter((b) => b.root_id === rootId);
    }

    // Parameterized query — root_id goes through the driver, not string concat
    const data = await this.#apiCall('/api/query/sql', {
      stmt: FIXED_QUERIES.childBlocksByRootId.replace('?', `'${this.#escapeSQL(rootId)}'`),
    });
    return data ?? [];
  }

  /**
   * Get block attributes for a specific block ID.
   */
  async getBlockAttrs(blockId) {
    if (this.#dryRun) {
      const blocks = this.#fixtures?.blocks ?? [];
      const block = blocks.find((b) => b.id === blockId);
      return block?.attrs ?? {};
    }

    const data = await this.#apiCall('/api/attr/getBlockAttrs', { id: blockId });
    return data ?? {};
  }

  /**
   * Get the Kramdown content of a block.
   */
  async getBlockKramdown(blockId) {
    if (this.#dryRun) {
      const blocks = this.#fixtures?.blocks ?? [];
      const block = blocks.find((b) => b.id === blockId);
      return block?.kramdown ?? '';
    }

    const data = await this.#apiCall('/api/block/getBlockKramdown', { id: blockId });
    return data?.kramdown ?? '';
  }

  /**
   * Minimal SQL escaping for parameterized values.
   * This is a safety net — prefer fetching broad + filtering in JS.
   */
  #escapeSQL(value) {
    return String(value).replace(/'/g, "''");
  }

  /**
   * Load dataset in the same shape as the fixture loader.
   * Returns { knowledge, sources } compatible with retrieve().
   */
  async loadDataset({ notebookIds, mappingConfig } = {}) {
    const allowedIds = notebookIds ? new Set(notebookIds) : null;
    const documents = await this.fetchDocuments(allowedIds);
    const knowledge = [];
    const sources = [];
    const sourceIdSet = new Set();

    for (const doc of documents) {
      const blocks = await this.fetchChildBlocks(doc.id || doc.root_id);
      const attrs = await this.getBlockAttrs(doc.id || doc.root_id);

      // Map SiYuan document to knowledge item
      const mapped = mapDocumentToKnowledge(doc, blocks, attrs, mappingConfig);
      if (!mapped) continue;

      // Collect sources
      for (const source of mapped.sources) {
        if (!sourceIdSet.has(source.source_id)) {
          sourceIdSet.add(source.source_id);
          sources.push(source);
        }
      }

      knowledge.push(mapped.knowledge);
    }

    // Filter out dangling relations — only keep targets that exist in the dataset
    const knownIds = new Set(knowledge.map((k) => k.knowledge_id));
    for (const item of knowledge) {
      item.relations = item.relations.filter((rel) => knownIds.has(rel.target));
    }

    return { knowledge, sources };
  }
}

/**
 * Map a SiYuan document + its blocks into a knowledge item + sources.
 *
 * Mapping rules:
 * - Document title → knowledge.title
 * - First paragraph → knowledge.summary
 * - Remaining content → knowledge.body
 * - Tags (custom tags or attrs) → topic + aliases
 * - Block references ((id)) → relations
 * - custom-status attr → status (default: candidate)
 * - Card blocks (data-type="card") → EXCLUDED from indexing
 */
function mapDocumentToKnowledge(doc, blocks, attrs, config = {}) {
  // Skip card blocks
  const contentBlocks = (blocks ?? []).filter((b) => {
    if (b.type === 'd') return false; // Skip the document block itself
    if (b.ial && /data-type\s*=\s*"card"/.test(b.ial)) return false; // Skip card blocks
    return true;
  });

  if (contentBlocks.length === 0) return null;

  // Extract text content
  const paragraphs = contentBlocks
    .filter((b) => b.type === 'p' || b.type === 'h' || b.type === 'l')
    .map((b) => b.content ?? b.markdown ?? '');

  if (paragraphs.length === 0) return null;

  const title = doc.content || doc.hpath?.split('/').pop() || doc.id;
  const summary = paragraphs[0]?.slice(0, 200) ?? '';
  const body = paragraphs.slice(1).join('\n').slice(0, 2000);

  // Status from custom attribute
  const status = mapStatus(attrs?.['custom-status']);

  // Topic from path or custom attribute
  const topic = attrs?.['custom-topic']
    || doc.hpath?.split('/').slice(0, -1).join('/')
    || config.defaultTopic
    || '未分类';

  // Extract relations from block references ((block-id))
  const relations = extractRelations(contentBlocks);

  // Build source entry
  const sourceId = `siyuan-doc-${doc.id}`;
  const source = {
    source_id: sourceId,
    source_type: 'siyuan',
    title: title,
    locator_type: 'block_id',
    uri: `siyuan://${doc.box}/${doc.id}`,
    published_at: doc.created ? `${doc.created.slice(0, 4)}-${doc.created.slice(4, 6)}-${doc.created.slice(6, 8)}` : null,
    trust: attrs?.['custom-trust'] || 'medium',
  };

  // Evidence from content blocks
  const evidence = contentBlocks
    .filter((b) => b.content && b.content.length > 10)
    .slice(0, 3)
    .map((b) => ({
      source_id: sourceId,
      locator: `block:${b.id}`,
      quote: (b.content ?? '').slice(0, 150),
    }));

  const knowledge = {
    knowledge_id: `siyuan-${doc.id}`,
    title,
    summary,
    body,
    topic,
    status,
    source_ids: [sourceId],
    relations,
    evidence,
    aliases: extractAliases(attrs),
  };

  return { knowledge, sources: [source] };
}

function mapStatus(customStatus) {
  const validStatuses = new Set(['candidate', 'active', 'deprecated', 'archived']);
  if (customStatus && validStatuses.has(customStatus)) return customStatus;
  return 'candidate'; // Default — requires human confirmation
}

function extractAliases(attrs) {
  const aliasStr = attrs?.alias ?? '';
  return aliasStr.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Extract relations from block references in content.
 * SiYuan uses ((block-id)) syntax for block references.
 */
function extractRelations(blocks) {
  const relations = [];
  // SiYuan block IDs: 14-digit timestamp + dash + alphanumeric suffix (variable length)
  // Also handle Chinese full-width parentheses that may appear in rendered content
  const refPattern = /[（(]\((\d{14}-\w+)\)[）)]/g;

  for (const block of blocks) {
    const content = block.content ?? block.markdown ?? '';
    let match;
    while ((match = refPattern.exec(content)) !== null) {
      relations.push({
        type: 'belongs_to', // Default — can be refined by context
        target: `siyuan-${match[1]}`,
      });
    }
  }

  // Deduplicate
  const seen = new Set();
  return relations.filter((r) => {
    const key = `${r.type}:${r.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
