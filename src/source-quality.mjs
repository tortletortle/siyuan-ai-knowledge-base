const DEFAULT_RULES = [
  { id: 'meta.template', severity: 'warning', pattern: /没问题|稍等片刻|以下是.*整理|你稍等|我这就开始处理/iu, action: '复核并删除转写中的模板化元话语' },
  { id: 'meta.audio-description', severity: 'warning', pattern: /人声[A-Z]|音色|普通话标准|键盘敲击|录音环境|三十来岁|音频文件的描述/iu, action: '对照音频，移除音频人格或环境描述' },
  { id: 'meta.stage-direction', severity: 'warning', pattern: /（人声|\(人声|专心点|歇会儿/iu, action: '复核并移除舞台提示或非课程对白' },
  { id: 'text.garbled', severity: 'warning', pattern: /�|�{2,}|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u, action: '复核乱码或不可见控制字符' }
];

export function lintTranscript(text, options = {}) {
  const lines = String(text).split(/\r?\n/);
  const findings = [];
  const rules = options.rules ?? DEFAULT_RULES;
  const seen = new Map();
  let nonEmpty = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line) continue;
    nonEmpty += 1;
    if (line.length > (options.maxLineLength ?? 1200)) findings.push(finding('text.long-line', 'info', index + 1, line, '检查异常长行是否由切片失败造成', 0.75));
    for (const rule of rules) if (rule.pattern.test(line)) findings.push(finding(rule.id, rule.severity, index + 1, line, rule.action, 0.9));
    const normalized = normalize(line);
    if (normalized.length >= 12) {
      const previous = seen.get(normalized);
      if (previous !== undefined) findings.push(finding('asr.duplicate-line', 'warning', index + 1, line, `与第 ${previous} 行重复，复核 ASR 重复片段`, 0.95));
      else seen.set(normalized, index + 1);
    }
  }
  return { line_count: lines.length, non_empty_lines: nonEmpty, duplicate_line_count: findings.filter((item) => item.rule_id === 'asr.duplicate-line').length, findings };
}

export function finding(rule_id, severity, line, excerpt, proposed_action, confidence) {
  return { rule_id, severity, target_locator: `line ${line}`, line, current_excerpt: excerpt.slice(0, 300), proposed_action, confidence, requires_confirmation: true };
}
function normalize(value) { return value.replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase(); }
