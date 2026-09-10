/**
 * 关系图谱 v1：节点 = 索引块，边 = 块引用（全自动）。
 * 语义边（前置/对比）需要人工或模型判断，不在此层猜测，见 GRAPH.md。
 */

export function cleanLabel(text) {
  return String(text ?? '')
    .replace(/\(\(\d[0-9A-Za-z-]{9,}\s+"([^"]*)"\)\)/g, '$1')
    .replace(/\(\(\d[0-9A-Za-z-]{9,}\)\)/g, '')
    .replace(/\[([^\]]*)\]\(siyuan:\/\/blocks\/[^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortLabel(block, maxLength = 24) {
  const text = cleanLabel(block.text);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function buildGraph(blocks = []) {
  const byId = new Map(blocks.map((block) => [block.block_id, block]));
  const nodes = blocks.map((block) => ({
    id: block.block_id,
    label: shortLabel(block),
    doc: block.title ?? block.path ?? null,
    topic: block.kb_topic ?? block.path ?? null
  }));
  const edges = [];
  const unresolved = [];
  for (const block of blocks) {
    for (const target of block.refs ?? []) {
      if (byId.has(target)) edges.push({ from: block.block_id, to: target, type: 'references' });
      else unresolved.push({ from: block.block_id, target });
    }
  }
  const uniqueEdges = [...new Map(edges.map((edge) => [`${edge.from}>${edge.to}`, edge])).values()];
  return {
    nodes,
    edges: uniqueEdges,
    unresolved,
    stats: { node_count: nodes.length, edge_count: uniqueEdges.length, unresolved_count: unresolved.length }
  };
}

const safeId = (id) => `n${String(id).replace(/[^A-Za-z0-9]/g, '_')}`;
const escapeMermaid = (value) => String(value).replace(/"/g, '#quot;').replace(/`/g, '');
const escapeAnchor = (value) => String(value).replace(/"/g, '＂');

export function toMermaid(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`  ${safeId(node.id)}["${escapeMermaid(node.label)}"]`);
  for (const edge of graph.edges) lines.push(`  ${safeId(edge.from)} --> ${safeId(edge.to)}`);
  return lines.join('\n');
}

/**
 * 生成 MOC（Map of Content）文档：把边写成 ((块引)) 行。
 * 粘贴进思源一个新文档，原生关系图谱即被点亮，且原文零污染。
 */
export function toMOC(graph) {
  const labelOf = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const lines = ['# 知识地图（MOC）', '', '> 由 export-graph 自动生成：只含块引，不含正文；原文无需任何改动。', ''];
  const byDoc = new Map();
  for (const node of graph.nodes) {
    const key = node.doc ?? '未分类';
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key).push(node);
  }
  for (const [doc, nodes] of byDoc) {
    lines.push(`## ${doc}`, '');
    for (const node of nodes) lines.push(`- ((${node.id} "${escapeAnchor(node.label)}"))`);
    lines.push('');
  }
  if (graph.edges.length) {
    lines.push('## 引用关系', '');
    for (const edge of graph.edges) {
      lines.push(`- ((${edge.from} "${escapeAnchor(labelOf.get(edge.from) ?? edge.from)}")) → ((${edge.to} "${escapeAnchor(labelOf.get(edge.to) ?? edge.to)}"))`);
    }
    lines.push('');
  }
  if (graph.unresolved.length) {
    lines.push('## 未解析引用（需人工确认目标）', '');
    for (const item of graph.unresolved) lines.push(`- ((${item.from} "${escapeAnchor(labelOf.get(item.from) ?? item.from)}")) → \`${item.target}\`（索引中不存在）`);
    lines.push('');
  }
  return lines.join('\n');
}
