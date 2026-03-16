import { describe, expect, it } from 'vitest';
import {
  findTextIssues,
  isTextFile,
  normalizeTextContent,
} from '../scripts/textEncodingTools.mjs';

describe('textEncodingTools', () => {
  it('treats source and config files as text', () => {
    expect(isTextFile('src/App.tsx')).toBe(true);
    expect(isTextFile('.editorconfig')).toBe(true);
    expect(isTextFile('public/logo.png')).toBe(false);
  });

  it('removes UTF-8 BOM without touching normal content', () => {
    expect(normalizeTextContent('\uFEFFhello')).toBe('hello');
    expect(normalizeTextContent('plain text')).toBe('plain text');
  });

  it('detects replacement, private-use and mojibake markers', () => {
    const issues = findTextIssues('\uFEFF关闭\u934f\u62bd\u68f4\uFFFD\uE0A2');
    const issueTypes = issues.map((issue) => issue.type);

    expect(issueTypes).toEqual(
      expect.arrayContaining(['bom', 'replacement', 'private-use', 'mojibake']),
    );
  });
});
