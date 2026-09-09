import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEndpoint, readTokenFromEnv, FIXED_QUERIES, isAllowedApiPath, ALLOWED_API_PATHS } from '../src/siyuan-security.mjs';

// ─── URL Validation ─────────────────────────────────────────────

test('rejects invalid URLs', () => {
  const result = validateEndpoint('not-a-url');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Invalid URL/);
});

test('rejects non-http protocols', () => {
  const result = validateEndpoint('ftp://example.com');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Protocol/);
});

test('rejects localhost by default', () => {
  const result = validateEndpoint('http://localhost:6806');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /blocked by security policy/);
});

test('rejects 127.0.0.1 by default', () => {
  const result = validateEndpoint('http://127.0.0.1:6806');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /blocked by security policy/);
});

test('rejects private IPs by default', () => {
  assert.equal(validateEndpoint('http://192.168.1.1:6806').allowed, false);
  assert.equal(validateEndpoint('http://10.0.0.1:6806').allowed, false);
  assert.equal(validateEndpoint('http://172.16.0.1:6806').allowed, false);
});

test('rejects ::1 loopback by default', () => {
  const result = validateEndpoint('http://[::1]:6806');
  assert.equal(result.allowed, false);
});

test('allows localhost when SIYUAN_ALLOW_LOCAL=1', () => {
  const prev = process.env.SIYUAN_ALLOW_LOCAL;
  process.env.SIYUAN_ALLOW_LOCAL = '1';
  try {
    const result = validateEndpoint('http://localhost:6806');
    assert.equal(result.allowed, true);
  } finally {
    if (prev === undefined) delete process.env.SIYUAN_ALLOW_LOCAL;
    else process.env.SIYUAN_ALLOW_LOCAL = prev;
  }
});

test('allows 127.0.0.1 when SIYUAN_ALLOW_LOCAL=1', () => {
  const prev = process.env.SIYUAN_ALLOW_LOCAL;
  process.env.SIYUAN_ALLOW_LOCAL = '1';
  try {
    const result = validateEndpoint('http://127.0.0.1:6806');
    assert.equal(result.allowed, true);
  } finally {
    if (prev === undefined) delete process.env.SIYUAN_ALLOW_LOCAL;
    else process.env.SIYUAN_ALLOW_LOCAL = prev;
  }
});

test('SIYUAN_ALLOW_LOCAL still rejects private IPs', () => {
  const prev = process.env.SIYUAN_ALLOW_LOCAL;
  process.env.SIYUAN_ALLOW_LOCAL = '1';
  try {
    const result = validateEndpoint('http://192.168.1.1:6806');
    assert.equal(result.allowed, false);
    assert.match(result.reason, /only permits localhost/);
  } finally {
    if (prev === undefined) delete process.env.SIYUAN_ALLOW_LOCAL;
    else process.env.SIYUAN_ALLOW_LOCAL = prev;
  }
});

test('allows public HTTPS URLs', () => {
  const result = validateEndpoint('https://siyuan.example.com');
  assert.equal(result.allowed, true);
});

// ─── Token Reading ──────────────────────────────────────────────

test('readTokenFromEnv returns reason when env var is not set', () => {
  const prev = process.env.SIYUAN_TOKEN_FILE;
  delete process.env.SIYUAN_TOKEN_FILE;
  try {
    const result = readTokenFromEnv();
    assert.equal(result.token, null);
    assert.match(result.reason, /SIYUAN_TOKEN_FILE/);
  } finally {
    if (prev !== undefined) process.env.SIYUAN_TOKEN_FILE = prev;
  }
});

test('readTokenFromEnv returns file path when env var is set', () => {
  const prev = process.env.SIYUAN_TOKEN_FILE;
  process.env.SIYUAN_TOKEN_FILE = '/tmp/test-token.txt';
  try {
    const result = readTokenFromEnv();
    assert.equal(result.tokenFile, '/tmp/test-token.txt');
    assert.equal(result.reason, null);
  } finally {
    if (prev === undefined) delete process.env.SIYUAN_TOKEN_FILE;
    else process.env.SIYUAN_TOKEN_FILE = prev;
  }
});

// ─── SQL Templates ──────────────────────────────────────────────

test('FIXED_QUERIES are frozen (immutable)', () => {
  assert.throws(() => {
    FIXED_QUERIES.allDocuments = 'DROP TABLE blocks';
  });
});

test('FIXED_QUERIES contain no placeholder patterns for user input', () => {
  // allDocuments should have no parameter markers — broad fetch + JS filter
  assert.ok(!FIXED_QUERIES.allDocuments.includes('${'));
  assert.ok(!FIXED_QUERIES.allDocuments.includes('?'));
});

test('childBlocksByRootId uses ? parameter, not string concatenation', () => {
  assert.ok(FIXED_QUERIES.childBlocksByRootId.includes('?'));
  // Should NOT contain any notebook-specific values
  assert.ok(!FIXED_QUERIES.childBlocksByRootId.includes('nb-'));
});

// ─── API Path Allowlist ─────────────────────────────────────────

test('read endpoints are allowed', () => {
  assert.equal(isAllowedApiPath('/api/query/sql'), true);
  assert.equal(isAllowedApiPath('/api/block/getBlockKramdown'), true);
  assert.equal(isAllowedApiPath('/api/notebook/lsNotebooks'), true);
  assert.equal(isAllowedApiPath('/api/attr/getBlockAttrs'), true);
});

test('write endpoints are rejected', () => {
  assert.equal(isAllowedApiPath('/api/filetree/createDocWithMd'), false);
  assert.equal(isAllowedApiPath('/api/block/updateBlock'), false);
  assert.equal(isAllowedApiPath('/api/block/deleteBlock'), false);
  assert.equal(isAllowedApiPath('/api/block/insertBlock'), false);
  assert.equal(isAllowedApiPath('/api/attr/setBlockAttrs'), false);
});

test('ALLOWED_API_PATHS is frozen', () => {
  assert.throws(() => {
    ALLOWED_API_PATHS.push('/api/block/updateBlock');
  });
});
