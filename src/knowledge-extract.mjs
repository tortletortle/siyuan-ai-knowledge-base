export function parseKnowledgePoint(text) {
  const cleaned = String(text).replace(/^\s*(?:[-*+\u2022]|#+)\s*/u, '').replace(/^\s*\d+[.、]\s*/u, '').trim();
  const match = cleaned.match(/^([^：:]+?)[：:]\s*(.+)$/us);
  if (!match) return null;
  const title = match[1].trim();
  const definition = match[2].trim();
  if (!title || !definition) return null;
  return { title, definition };
}

export function isHeading(block, base) {
  const t = String(block.text ?? block.content ?? block.markdown ?? '').trim();
  return t === base || t === `## ${base}` || t === `# ${base}`;
}

export function categoryFor(title, definition) {
  const text = `${title} ${definition}`;
  if (/方法|调用|getComponent|convert|获取|设置|配置|清理|播放/u.test(text)) return 'usage';
  if (/属性|参数|文件|组成|构成|规则/u.test(text)) return 'property';
  if (/区别|优势|原理|作用|应用|场景|特点/u.test(text)) return 'concept';
  return 'concept';
}

export function extractCorePoints(ordered) {
  const sourceId = ordered.find((block) => block.source_id)?.source_id ?? null;
  const title = ordered[0]?.title ?? ordered[0]?.root_id;
  let inCore = false;
  const points = [];
  const seenTitles = new Set();
  for (const block of ordered) {
    if (block.type === 'h' && isHeading(block, '核心知识点')) { inCore = true; continue; }
    if (inCore && block.type === 'h' && (isHeading(block, '术语表') || isHeading(block, '卡片') || isHeading(block, '测验') || isHeading(block, '课程导航'))) break;
    if (!inCore || !['p', 'i'].includes(block.type)) continue;
    const parsed = parseKnowledgePoint(block.text ?? '');
    if (!parsed) continue;
    if (seenTitles.has(parsed.title)) continue;
    seenTitles.add(parsed.title);
    points.push({ block, ...parsed });
  }
  return { sourceId, title, points };
}
