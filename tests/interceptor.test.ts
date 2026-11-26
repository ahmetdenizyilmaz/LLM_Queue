import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerSubmit } from '../src/adapters/dom-utils';
import type { SiteAdapter } from '../src/adapters/types';
import { ComposerInterceptor } from '../src/content/interceptor';
import { QueueEngine } from '../src/engine/queue-engine';
import { DEFAULT_SETTINGS } from '../src/shared/constants';

describe('ComposerInterceptor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues Enter during the transition window right after AI finishes while send button is disabled', async () => {
    const textarea = document.createElement('textarea');
    const sendBtn = document.createElement('button');
    sendBtn.disabled = true;
    document.body.append(textarea, sendBtn);

    let busy = true;
    const adapter: SiteAdapter = {
      id: 'mock',
      name: 'MockLLM',
      accentColor: '#6366F1',
      getInput: () => textarea,
      getSendButton: () => sendBtn,
      getStopButton: () => null,
      isBusy: () => busy,
      isReadyToSend: () => !busy,
      readInputText: () => textarea.value,
      clearInput: () => {
        textarea.value = '';
      },
      submitPrompt: async () => ({ ok: true }),
    };

    const engine = new QueueEngine({
      adapter,
      settings: { ...DEFAULT_SETTINGS, cooldownMs: 1000 },
      conversationKey: 'test',
      onChange: () => {},
      persistItems: () => {},
      tickIntervalMs: 50,
    });

    const onQueued = vi.fn();
    const interceptor = new ComposerInterceptor(
      adapter,
      engine,
      DEFAULT_SETTINGS,
      { onQueued },
    );

    // AI flips from busy -> idle, but send button is still disabled in the 100ms transition
    busy = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.wasRecentlyBusy(600)).toBe(true);

    textarea.value = 'Follow-up right at boundary';
    textarea.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('');
    expect(engine.getSnapshot().pendingCount).toBe(1);
    expect(engine.getSnapshot().items[0]?.text).toBe('Follow-up right at boundary');
    expect(onQueued).toHaveBeenCalledWith('Follow-up right at boundary', 'busy', 1);

    interceptor.destroy();
    engine.destroy();
  });

  it('ignores programmatic Enter dispatched by triggerSubmit', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Programmatic dispatch';
    document.body.appendChild(textarea);

    const adapter: SiteAdapter = {
      id: 'mock',
      name: 'MockLLM',
      accentColor: '#6366F1',
      getInput: () => textarea,
      getSendButton: () => null,
      getStopButton: () => null,
      isBusy: () => true,
      isReadyToSend: () => false,
      readInputText: () => textarea.value,
      clearInput: () => {
        textarea.value = '';
      },
      submitPrompt: async () => ({ ok: true }),
    };

    const engine = new QueueEngine({
      adapter,
      settings: DEFAULT_SETTINGS,
      conversationKey: 'test',
      onChange: () => {},
      persistItems: () => {},
    });

    const onQueued = vi.fn();
    const interceptor = new ComposerInterceptor(
      adapter,
      engine,
      DEFAULT_SETTINGS,
      { onQueued },
    );

    await triggerSubmit(textarea, () => null, {
      waitMs: 0,
      maxButtonAttempts: 1,
    });

    expect(onQueued).not.toHaveBeenCalled();
    expect(engine.getSnapshot().pendingCount).toBe(0);
    expect(textarea.value).toBe('Programmatic dispatch');

    interceptor.destroy();
    engine.destroy();
  });
});
