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
    try {
      if (typeof ClipboardEvent === 'function' && typeof DataTransfer === 'function') {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(
          new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          }),
        );
      }
    } catch {
      // ClipboardEvent / DataTransfer may be unavailable in headless environments
    }
  }

  if (readComposerText(el).trim() !== text.trim()) {
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

let programmaticSubmitActive = false;

/**
 * Whether triggerSubmit is currently dispatching a synthetic Enter key event.
 */
export function isProgrammaticSubmitActive(): boolean {
  return programmaticSubmitActive;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dispatchSyntheticEnter(input: HTMLElement): void {
  input.focus();
  const enterInit: KeyboardEventInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  programmaticSubmitActive = true;
  try {
    input.dispatchEvent(new KeyboardEvent('keydown', enterInit));
    input.dispatchEvent(new KeyboardEvent('keypress', enterInit));
    input.dispatchEvent(new KeyboardEvent('keyup', enterInit));
  } finally {
    programmaticSubmitActive = false;
  }
}

export interface TriggerSubmitOptions {
  waitMs?: number;
  maxButtonAttempts?: number;
  buttonPollMs?: number;
  verifySubmitted?: () => boolean;
  verifyTimeoutMs?: number;
}

async function waitForVerification(
  verifySubmitted: () => boolean,
  timeoutMs: number,
  pollMs = 80,
): Promise<boolean> {
  if (verifySubmitted()) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (verifySubmitted()) {
      return true;
    }
  }
  return verifySubmitted();
}

/**
 * Trigger submission by waiting briefly for framework state flush, clicking an
 * enabled Send button, or falling back to an Enter keyboard event.
 * When `verifySubmitted` is supplied, confirms the host accepted the submission.
 */
export async function triggerSubmit(
  input: HTMLElement,
  findSendButton: () => HTMLElement | null,
  optionsOrWaitMs: number | TriggerSubmitOptions = 100,
): Promise<boolean> {
  const opts: TriggerSubmitOptions =
    typeof optionsOrWaitMs === 'number'
      ? { waitMs: optionsOrWaitMs }
      : optionsOrWaitMs;

  const waitMs = opts.waitMs ?? 100;
  const maxButtonAttempts = opts.maxButtonAttempts ?? 8;
  const buttonPollMs = opts.buttonPollMs ?? 100;
  const verifyTimeoutMs = opts.verifyTimeoutMs ?? 600;

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const attemptTrigger = async (): Promise<void> => {
    for (let attempt = 0; attempt < maxButtonAttempts; attempt++) {
      const btn = findSendButton();
      if (isButtonEnabled(btn)) {
        btn!.click();
        return;
      }
      if (attempt < maxButtonAttempts - 1) {
        await sleep(buttonPollMs);
      }
    }
    dispatchSyntheticEnter(input);
  };

  await attemptTrigger();

  if (!opts.verifySubmitted) {
    return true;
  }

  if (await waitForVerification(opts.verifySubmitted, verifyTimeoutMs)) {
    return true;
  }

  // Recovery attempt: nudge host editor reactivity and try one more submit
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(60);

  const retryBtn = findSendButton();
  if (isButtonEnabled(retryBtn)) {
    retryBtn!.click();
  } else {
    dispatchSyntheticEnter(input);
  }

  return waitForVerification(opts.verifySubmitted, 400);
}
