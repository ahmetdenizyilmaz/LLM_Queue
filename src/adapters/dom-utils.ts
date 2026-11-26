/**
 * Determine whether an element is rendered and visible on screen.
 * Handles both real browser layout engines and headless DOMs like jsdom.
 */
export function isElementVisible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement) || !el.isConnected) {
    return false;
  }
  if (el.closest('[hidden], [aria-hidden="true"]')) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }
  const hasLayoutEngine =
    typeof document.body?.getBoundingClientRect === 'function' &&
    document.body.getBoundingClientRect().width > 0;
  if (hasLayoutEngine && el.getClientRects().length === 0) {
    return false;
  }
  return true;
}

/**
 * Determine whether a button element is visible and interactive.
 */
export function isButtonEnabled(el: HTMLElement | null): boolean {
  if (!isElementVisible(el)) {
    return false;
  }
  if ('disabled' in el && (el as HTMLButtonElement).disabled) {
    return false;
  }
  if (el.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  return true;
}

/**
 * Query a prioritized list of CSS selectors and return the first visible match.
 */
export function queryFirstVisible(
  selectors: string[],
  root: ParentNode = document,
): HTMLElement | null {
  for (const selector of selectors) {
    const trimmed = selector.trim();
    if (!trimmed) continue;
    try {
      const matches = root.querySelectorAll(trimmed);
      for (const node of matches) {
        if (isElementVisible(node)) {
          return node;
        }
      }
    } catch {
      // Ignore invalid user-supplied CSS selector without crashing adapter resolution.
    }
  }
  return null;
}

/**
 * Read current text from either a native textarea/input or a contenteditable composer.
 */
export function readComposerText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  return (el.innerText ?? el.textContent ?? '').replace(/\u200B/g, '');
}

function setNativeFormValue(
  el: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setContentEditableText(el: HTMLElement, text: string): void {
  el.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let insertedViaCommand = false;
  try {
    if (typeof document.execCommand === 'function') {
      insertedViaCommand = document.execCommand('insertText', false, text);
    }
  } catch {
    insertedViaCommand = false;
  }

  if (!insertedViaCommand || readComposerText(el).trim() !== text.trim()) {
    const lines = text.split('\n');
    el.replaceChildren();
    for (const line of lines) {
      const p = document.createElement('p');
      if (line.length === 0) {
        p.appendChild(document.createElement('br'));
      } else {
        p.textContent = line;
      }
      el.appendChild(p);
    }
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      }),
    );
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      }),
    );
  }
}

/**
 * Populate text into a React/ProseMirror/Quill-managed chat composer.
 */
export function setComposerText(el: HTMLElement, text: string): boolean {
  if (!el.isConnected) {
    return false;
  }
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    setNativeFormValue(el, text);
    return true;
  }
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    setContentEditableText(el, text);
    return true;
  }
  return false;
}

/**
 * Clear text from a chat composer cleanly.
 */
export function clearComposerText(el: HTMLElement): void {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    setNativeFormValue(el, '');
    return;
  }
  el.focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  let cleared = false;
  try {
    if (typeof document.execCommand === 'function') {
      cleared = document.execCommand('delete', false);
    }
  } catch {
    cleared = false;
  }
  if (!cleared || readComposerText(el).trim().length > 0) {
    el.replaceChildren();
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
        data: null,
      }),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trigger submission by waiting briefly for framework state flush, clicking an
 * enabled Send button, or falling back to an Enter keyboard event.
 */
export async function triggerSubmit(
  input: HTMLElement,
  findSendButton: () => HTMLElement | null,
  waitMs = 90,
): Promise<boolean> {
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const btn = findSendButton();
    if (isButtonEnabled(btn)) {
      btn!.click();
      return true;
    }
    await sleep(60);
  }

  // Fallback: dispatch Enter on the composer itself
  input.focus();
  const enterInit: KeyboardEventInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  input.dispatchEvent(new KeyboardEvent('keydown', enterInit));
  input.dispatchEvent(new KeyboardEvent('keypress', enterInit));
  input.dispatchEvent(new KeyboardEvent('keyup', enterInit));
  return true;
}
