const fs = await import('node:fs/promises');
const path = await import('node:path');

const files = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const output = process.env.SIYUAN_SNAPSHOT_OUTPUT;
if (!files.length) {
  console.error('usage: node scripts/inspect-siyuan-snapshot.mjs <snapshot.json> ...');
  process.exitCode = 2;
  process.exit();
}
function shape(value) {
  if (Array.isArray(value)) return { kind: 'array', length: value.length, sample: value.length ? shape(value[0]) : null };
  if (value && typeof value === 'object') {
    return { kind: 'object', keys: Object.keys(value).sort(), samples: Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, item]) => [key, simple(item)])) };
  }
  return { kind: typeof value, sample: simple(value) };
}
function simple(value) {
  if (Array.isArray(value)) return { kind: 'array', length: value.length };
  if (value && typeof value === 'object') return { kind: 'object', keys: Object.keys(value).sort() };
  return typeof value === 'string' ? `${value.slice(0, 80)}${value.length > 80 ? '…' : ''}` : value;
}
const report = [];
for (const file of files) {
  const absolute = path.resolve(file);
  const value = JSON.parse(await fs.readFile(absolute, 'utf8'));
  report.push({ file: absolute, shape: shape(value) });
}
const result = { policy: 'offline shape inspection; no network, no credentials, no source mutation', files: report };
if (output) await fs.writeFile(path.resolve(output), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
