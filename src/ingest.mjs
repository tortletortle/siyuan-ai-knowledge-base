import { readFile } from 'node:fs/promises';
import { validateDataset } from './schema.mjs';

export async function loadDataset({ knowledgePath, sourcesPath }) {
  const [knowledge, sources] = await Promise.all([
    readFile(knowledgePath, 'utf8').then(JSON.parse),
    readFile(sourcesPath, 'utf8').then(JSON.parse)
  ]);
  validateDataset(knowledge, sources);
  return { knowledge, sources };
}
