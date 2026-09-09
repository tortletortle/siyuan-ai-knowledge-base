import { basename, dirname, extname, resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { lintTranscript } from './source-quality.mjs';

export async function auditLesson(transcriptPath, notePath, flashcardPath, quizPath) {
  const files = { transcript: transcriptPath, note: notePath, flashcards: flashcardPath, quiz: quizPath };
  const checks = [];
  for (const [kind, file] of Object.entries(files)) {
    let exists = true;
    let bytes = 0;
    try { const stat = await import('node:fs/promises').then(({ stat }) => stat(file)); bytes = stat.size; } catch { exists = false; }
    checks.push({ kind, path: resolve(file), exists, bytes });
  }
  const transcript = checks.find((item) => item.kind === 'transcript');
  const note = checks.find((item) => item.kind === 'note');
  const pairingWarning = basename(transcript.path, extname(transcript.path)).replace(/\.transcript$/i, '') !== basename(note.path, extname(note.path));
  const transcriptText = transcript.exists ? await readFile(transcript.path, 'utf8') : '';
  const noteText = note.exists ? await readFile(note.path, 'utf8') : '';
  const transcriptTerms = new Set((transcriptText.match(/[A-Za-z_][A-Za-z0-9_.-]{2,}|[\u3400-\u9fff]{2,8}/gu) ?? []).map((term) => term.toLowerCase()));
  const noteTerms = [...new Set((noteText.match(/[A-Za-z_][A-Za-z0-9_.-]{2,}|[\u3400-\u9fff]{2,8}/gu) ?? []).map((term) => term.toLowerCase()))];
  const unsupportedTerms = noteTerms.filter((term) => term.length >= 3 && !transcriptTerms.has(term)).slice(0, 30);
  const findings = [];
  if (pairingWarning) findings.push({ issue_type: 'file.pairing', severity: 'warning', target_file: note.path, target_locator: 'filename', current_excerpt: basename(note.path), proposed_action: '确认转写、笔记和输出文件属于同一课程', confidence: 0.8, requires_confirmation: true });
  for (const check of checks.filter((item) => !item.exists || item.bytes === 0)) findings.push({ issue_type: 'file.missing-or-empty', severity: 'error', target_file: check.path, target_locator: 'file', current_excerpt: check.kind, proposed_action: '补齐或重新生成配套文件', confidence: 1, requires_confirmation: true });
  for (const term of unsupportedTerms) findings.push({ issue_type: 'note.term-needs-review', severity: 'info', target_file: note.path, target_locator: 'term', current_excerpt: term, evidence: [transcript.path], proposed_action: '对照原始转写或其他权威来源，确认是否为扩写、术语变体或整理错误', confidence: 0.55, requires_confirmation: true });
  return { files: checks, transcript_quality: lintTranscript(transcriptText), findings, stats: { unsupported_note_terms: unsupportedTerms.length, transcript_chars: transcriptText.length, note_chars: noteText.length } };
}
