import { describe, expect, it } from 'vitest';
import { getConversationKey, isNewChatPath, parsePrompts } from '../src/shared/parser';

describe('parsePrompts', () => {
  it('returns empty array for blank input', () => {
    expect(parsePrompts('')).toEqual([]);
    expect(parsePrompts('   \n\t  ')).toEqual([]);
  });

  it('keeps single prompt intact when no delimiter is present', () => {
    const raw = 'First line\nSecond line\n---not-a-delimiter';
    expect(parsePrompts(raw)).toEqual([raw]);
  });

  it('splits prompts on standalone delimiter lines and trims segments', () => {
    const raw = `
      Step 1: Summarize the paper.
      ---
      Step 2: List 3 weaknesses.

      ---

      Step 3: Propose a fix.
    `;
    expect(parsePrompts(raw)).toEqual([
      'Step 1: Summarize the paper.',
      'Step 2: List 3 weaknesses.',
      'Step 3: Propose a fix.',
    ]);
  });

  it('supports custom delimiters with regex special characters', () => {
    const raw = 'First\n***\nSecond\n***\nThird';
    expect(parsePrompts(raw, '***')).toEqual(['First', 'Second', 'Third']);
  });

  it('ignores empty sections between consecutive delimiters', () => {
    const raw = '---\nPrompt A\n---\n---\nPrompt B\n---';
    expect(parsePrompts(raw)).toEqual(['Prompt A', 'Prompt B']);
  });
});

describe('getConversationKey & isNewChatPath', () => {
  it('builds scoped and global conversation keys', () => {
    expect(getConversationKey('https://chatgpt.com/c/abc-123/', true)).toBe(
      'https://chatgpt.com/c/abc-123',
    );
    expect(getConversationKey('https://chatgpt.com/c/abc-123', false)).toBe(
      'https://chatgpt.com::global',
    );
  });

  it('detects fresh chat routes accurately', () => {
    expect(isNewChatPath('https://chatgpt.com/')).toBe(true);
    expect(isNewChatPath('https://claude.ai/new')).toBe(true);
    expect(isNewChatPath('https://gemini.google.com/app')).toBe(true);
    expect(isNewChatPath('https://gemini.google.com/u/0/app')).toBe(true);
    expect(isNewChatPath('https://gemini.google.com/u/1/app/abc123')).toBe(false);
    expect(isNewChatPath('https://chatgpt.com/c/12345')).toBe(false);
    expect(isNewChatPath('https://claude.ai/chat/999')).toBe(false);
  });
});
