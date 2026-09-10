import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, parseIAL } from '../src/block-index.mjs';
import { blockIndexToDataset } from '../src/block-dataset.mjs';
import { retrieve } from '../src/retrieve.mjs';

const documents = [{ id: 'doc-1', root_id: 'root-1', hpath: '/课程/K17-014', title: 'Label 组件' }];
const docBlock = { id: 'root-1', root_id: 'root-1', type: 'd', content: '文档' };
const ids = (index) => index.blocks.map((block) => block.block_id);
const texts = (index) => index.blocks.map((block) => block.text);

test('parseIAL 能读真实思源 IAL 字符串', () => {
  const attrs = parseIAL('{: id="20240101120000-abc1234" updated="20240101120000" custom-kb-exclude="true" style="color: var(--b3-font-color-red);"}');
  assert.equal(attrs['custom-kb-exclude'], 'true');
  assert.equal(attrs.style, 'color: var(--b3-font-color-red);');
  assert.deepEqual(parseIAL(null), {});
  assert.deepEqual(parseIAL(''), {});
  assert.deepEqual(parseIAL(undefined), {});
});

test('显示随便变，契约不变则提取结果完全一致', () => {
  const plain = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'h-core', root_id: 'root-1', type: 'h', content: '核心知识点' },
      { id: 'k1', root_id: 'root-1', parent_id: 'h-core', type: 'p', content: '行高：控制文本行与行之间的距离' },
      { id: 'h-cards', root_id: 'root-1', type: 'h', content: '卡片' },
      { id: 'c1', root_id: 'root-1', parent_id: 'h-cards', type: 'p', content: '行高是什么？' }
    ]
  });
  // 花哨版：同一份知识，标题改了名、加了样式 IAL（页面上是红色大字+高亮）。
  const fancy = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'h-core', root_id: 'root-1', type: 'h', content: '核心知识点', ial: '{: style="font-size: 1.5em; color: red;" }' },
      { id: 'k1', root_id: 'root-1', parent_id: 'h-core', type: 'p', content: '行高：控制文本行与行之间的距离', ial: '{: style="background: yellow;" }' },
      // 标题变成“复习卡片”（旧正则认不出），但贴了排除纸条。
      { id: 'h-cards', root_id: 'root-1', type: 'h', content: '复习卡片', ial: '{: custom-kb-exclude="true" }' },
      { id: 'c1', root_id: 'root-1', parent_id: 'h-cards', type: 'p', content: '行高是什么？' }
    ]
  });
  assert.deepEqual(ids(plain), ['h-core', 'k1']);
  assert.deepEqual(ids(fancy), ids(plain));
  assert.deepEqual(texts(fancy), texts(plain));
});

test('纸条说了算：排除纸条干掉知识区闲聊，纳入纸条救回排除区金子', () => {
  const index = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'h-core', root_id: 'root-1', type: 'h', content: '核心知识点' },
      { id: 'k1', root_id: 'root-1', parent_id: 'h-core', type: 'p', content: '行高：控制文本行与行之间的距离' },
      { id: 'k-noisy', root_id: 'root-1', parent_id: 'h-core', type: 'p', content: '老师今天嗓子不舒服', ial: '{: custom-kb-exclude="true" }' },
      { id: 'h-quiz', root_id: 'root-1', type: 'h', content: '测验' },
      { id: 'q1', root_id: 'root-1', parent_id: 'h-quiz', type: 'p', content: '随堂小测：string 为空会怎样' },
      { id: 'q-gold', root_id: 'root-1', parent_id: 'h-quiz', type: 'p', content: '空字符串在原生平台可能闪退，务必判空', ial: '{: custom-kb-include="true" }' }
    ]
  });
  assert.deepEqual(ids(index), ['h-core', 'k1', 'q-gold']);
});

test('纸条贴在标题上则整区连坐，子孙一并排除', () => {
  const index = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'h-cards', root_id: 'root-1', type: 'h', content: 'Cards', ial: '{: custom-kb-exclude="true" }' },
      { id: 'child', root_id: 'root-1', parent_id: 'h-cards', type: 'p', content: 'Q: 被排除' },
      { id: 'grandchild', root_id: 'root-1', parent_id: 'child', type: 'p', content: 'A: 也被排除' },
      { id: 'kept', root_id: 'root-1', type: 'p', content: '正文保留' }
    ]
  });
  assert.deepEqual(ids(index), ['kept']);
});

test('又纳入又排除时排除获胜：宁缺毋滥', () => {
  const index = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'confused', root_id: 'root-1', type: 'p', content: '自相矛盾的块', ial: '{: custom-kb-include="true" custom-kb-exclude="true" }' },
      { id: 'kept', root_id: 'root-1', type: 'p', content: '正文保留' }
    ]
  });
  assert.deepEqual(ids(index), ['kept']);
});

test('custom-kb-topic 覆盖主题且不改动正文，并透传到数据集', () => {
  const index = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'k1', root_id: 'root-1', type: 'p', content: 'lineHeight 控制行高', ial: '{: custom-kb-topic="Label/属性" }' }
    ]
  });
  assert.equal(index.blocks[0].kb_topic, 'Label/属性');
  assert.equal(index.blocks[0].text, 'lineHeight 控制行高');
  const dataset = blockIndexToDataset(index);
  assert.equal(dataset.knowledge[0].topic, 'Label/属性');
});

test('原生别名进 IAL，直达检索加权（不再只靠 aliases.json）', () => {
  const index = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'k1', root_id: 'root-1', type: 'p', content: '有限状态机由状态、转移和输出组成', ial: '{: alias="FSM,finite state machine"}' }
    ]
  });
  assert.deepEqual(index.blocks[0].kb_aliases, ['FSM', 'finite state machine']);
  const dataset = blockIndexToDataset(index);
  assert.deepEqual(dataset.knowledge[0].aliases, ['FSM', 'finite state machine']);
  // 英文缩写能命中中文知识：靠的就是原生别名，不是全局别名表。
  const result = retrieve({ knowledge: dataset.knowledge, sources: dataset.sources, aliases: [] }, 'FSM 是什么', { minScore: 1 });
  assert.equal(result.direct[0].item.knowledge_id, 'block-k1');
  assert.ok(result.direct[0].matches.some((match) => match.field === 'alias'));
});

test('没有纸条时行为与旧版完全一致（向后兼容）', () => {
  const index = buildIndex({
    documents,
    blocks: [
      docBlock,
      { id: 'cards', root_id: 'root-1', type: 'p', content: '卡片' },
      { id: 'child', root_id: 'root-1', parent_id: 'cards', type: 'p', content: '应排除' },
      { id: 'kept', root_id: 'root-1', type: 'p', content: '正文保留' }
    ]
  });
  assert.deepEqual(ids(index), ['kept']);
  assert.equal(index.blocks[0].kb_topic, null);
  assert.equal(index.blocks[0].kb_status, null);
});
