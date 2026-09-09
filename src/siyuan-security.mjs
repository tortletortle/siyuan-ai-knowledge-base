/**
 * SiYuan API security policy.
 *
 * Rules:
 * 1. Credentials are read ONLY from environment variables — never hardcoded.
 * 2. SQL queries are fixed templates — no external values concatenated in.
 * 3. API endpoint URLs are validated against a strict allowlist.
 * 4. Loopback and private addresses are REJECTED by default.
 * 5. Localhost access requires an explicit opt-in flag (SIYUAN_ALLOW_LOCAL).
 */

import { isIP } from 'node:net';

const PRIVATE_RANGES = [
  // IPv4 private ranges (as numeric)
  { start: 0x0A000000, end: 0x0AFFFFFF },   // 10.0.0.0/8
  { start: 0xAC100000, end: 0xAC1FFFFF },   // 172.16.0.0/12
  { start: 0xC0A80000, end: 0xC0A8FFFF },   // 192.168.0.0/16
  { start: 0x7F000000, end: 0x7FFFFFFF },   // 127.0.0.0/8 (loopback)
  { start: 0xA9FE0000, end: 0xA9FEFFFF },   // 169.254.0.0/16 (link-local)
];

function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateOrLoopback(hostname) {
  // Strip IPv6 brackets (URL parser keeps them as [::1])
  const bare = hostname.replace(/^\[|\]$/g, '');

  // Check IPv4
  if (isIP(bare) === 4) {
    const num = ipv4ToNumber(bare);
    return PRIVATE_RANGES.some((range) => num >= range.start && num <= range.end);
  }
  // Check IPv6 (bare or loopback)
  if (isIP(bare) === 6) {
    if (bare === '::1' || bare === '::' || bare === '0:0:0:0:0:0:0:1') return true;
    // fc00::/7 unique local, fe80::/10 link-local
    const lower = bare.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    return false;
  }
  // Check localhost hostname
  if (bare === 'localhost' || bare === 'localhost.localdomain') return true;
  return false;
}

/**
 * Validate a SiYuan API base URL against the security policy.
 * Returns { allowed, reason } — never throws.
 *
 * By default, loopback and private addresses are rejected.
 * Set SIYUAN_ALLOW_LOCAL=1 to explicitly permit localhost/127.0.0.1
 * for auditing a local SiYuan instance you control.
 */
export function validateEndpoint(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { allowed: false, reason: `Invalid URL: ${urlString}` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: `Protocol ${url.protocol} not allowed. Only http/https.` };
  }

  const hostname = url.hostname;
  const isLocal = isPrivateOrLoopback(hostname);

  if (isLocal) {
    const allowLocal = process.env.SIYUAN_ALLOW_LOCAL === '1';
    if (!allowLocal) {
      return {
        allowed: false,
        reason: `Loopback/private address "${hostname}" is blocked by security policy. ` +
                `Set SIYUAN_ALLOW_LOCAL=1 to explicitly permit local SiYuan access.`
      };
    }
    // Even with allow-local, restrict to localhost/127.0.0.1 only (not arbitrary private IPs)
    const strictlyLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!strictlyLocal) {
      return {
        allowed: false,
        reason: `SIYUAN_ALLOW_LOCAL only permits localhost/127.0.0.1, not "${hostname}".`
      };
    }
  }

  return { allowed: true, reason: null, url };
}

/**
 * Read the SiYuan API token from a file path specified by environment variable.
 * NEVER hardcode a token or token file path in source code.
 */
export function readTokenFromEnv() {
  const tokenFile = process.env.SIYUAN_TOKEN_FILE;
  if (!tokenFile) {
    return { token: null, reason: 'SIYUAN_TOKEN_FILE environment variable is not set.' };
  }
  return { tokenFile, reason: null };
}

/**
 * Fixed SQL query templates.
 * External values (notebook IDs, block IDs) are NEVER concatenated into SQL.
 * Instead, we fetch broad results and filter in JavaScript.
 */
export const FIXED_QUERIES = Object.freeze({
  /** Fetch all document blocks (type 'd') — filter by notebook in JS. */
  allDocuments: `SELECT * FROM blocks WHERE type = 'd' ORDER BY updated DESC`,
  /** Fetch child blocks of a specific document — uses parameterized block ID. */
  childBlocksByRootId: `SELECT * FROM blocks WHERE root_id = ? ORDER BY sort ASC`,
  /** Fetch all blocks with specific attributes — broad fetch, filter in JS. */
  blocksWithCustomAttrs: `SELECT * FROM blocks WHERE markdown LIKE '%custom-%' ORDER BY updated DESC`,
  /** Fetch attribute view entries. */
  attributeView: `SELECT * FROM attribute_views`,
});

/**
 * Allowed API paths — only read endpoints.
 * Write endpoints (createDoc, updateBlock, etc.) are explicitly excluded.
 */
export const ALLOWED_API_PATHS = Object.freeze([
  '/api/query/sql',
  '/api/block/getBlockKramdown',
  '/api/block/getBlockInfo',
  '/api/attr/getBlockAttrs',
  '/api/notebook/lsNotebooks',
]);

export function isAllowedApiPath(path) {
  return ALLOWED_API_PATHS.includes(path);
}
