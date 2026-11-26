import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearComposerText,
  isButtonEnabled,
  isElementVisible,
  queryFirstVisible,
  readComposerText,
  setComposerText,
  triggerSubmit,
} from '../src/adapters/dom-utils';

describe('dom-utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sets, reads, and clears native textarea text', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);

    expect(setComposerText(textarea, 'Hello LLM')).toBe(true);
    expect(readComposerText(textarea)).toBe('Hello LLM');
    expect(onInput).toHaveBeenCalled();

    clearComposerText(textarea);
    expect(readComposerText(textarea)).toBe('');
  });

  it('sets, reads, and clears contenteditable composer text', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    const onInput = vi.fn();
    editor.addEventListener('input', onInput);

    expect(setComposerText(editor, 'Line 1\nLine 2')).toBe(true);
    expect(readComposerText(editor)).toContain('Line 1');
    expect(readComposerText(editor)).toContain('Line 2');
    expect(onInput).toHaveBeenCalled();

    clearComposerText(editor);
    expect(readComposerText(editor).trim()).toBe('');
  });

  it('evaluates element visibility and button enabled state', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    expect(isElementVisible(btn)).toBe(true);
    expect(isButtonEnabled(btn)).toBe(true);

    btn.disabled = true;
    expect(isButtonEnabled(btn)).toBe(false);

    btn.disabled = false;
    btn.setAttribute('aria-disabled', 'true');
    expect(isButtonEnabled(btn)).toBe(false);

    btn.style.display = 'none';
    expect(isElementVisible(btn)).toBe(false);
  });

  it('ignores hidden elements in queryFirstVisible', () => {
    const hiddenInput = document.createElement('textarea');
    hiddenInput.id = 'prompt-textarea';
    hiddenInput.hidden = true;

    const visibleInput = document.createElement('textarea');
    visibleInput.className = 'fallback-input';

    document.body.append(hiddenInput, visibleInput);

    const found = queryFirstVisible(['#prompt-textarea', '.fallback-input']);
    expect(found).toBe(visibleInput);
  });

  it('clicks send button when enabled or falls back to Enter', async () => {
    const input = document.createElement('textarea');
    const sendBtn = document.createElement('button');
    document.body.append(input, sendBtn);

    const onClick = vi.fn();
    sendBtn.addEventListener('click', onClick);

    await triggerSubmit(input, () => sendBtn, 0);
    expect(onClick).toHaveBeenCalledTimes(1);

    // Fallback to Enter when no button exists
    const onKeyDown = vi.fn();
    input.addEventListener('keydown', onKeyDown);
    await triggerSubmit(input, () => null, 0);
    expect(onKeyDown).toHaveBeenCalled();
  });
});
