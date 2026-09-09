import { readFile } from 'node:fs/promises';
import { validateDataset } from './schema.mjs';

export async function loadDataset({ knowledgePath, sourcesPath, aliasesPath }) {
  const files = [readFile(knowledgePath, 'utf8'), readFile(sourcesPath, 'utf8')];
  if (aliasesPath) files.push(readFile(aliasesPath, 'utf8'));
  const [knowledge, sources, aliases = []] = await Promise.all(files).then((values) => values.map(JSON.parse));
  validateDataset(knowledge, sources);
  return { knowledge, sources, aliases };
}
