import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteAdapter } from '../src/adapters/types';
import { QueueEngine } from '../src/engine/queue-engine';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import type { EngineSnapshot, ExtensionSettings } from '../src/shared/types';

function createMockAdapter(overrides?: Partial<SiteAdapter>): {
  adapter: SiteAdapter;
  setBusy: (busy: boolean) => void;
  submitted: string[];
  setFailNext: (error: string | null) => void;
} {
  let busy = false;
  let failError: string | null = null;
  const submitted: string[] = [];

  const adapter: SiteAdapter = {
    id: 'mock',
    name: 'MockLLM',
    accentColor: '#6366F1',
    getInput: () => document.createElement('textarea'),
    getSendButton: () => document.createElement('button'),
    getStopButton: () => null,
    isBusy: () => busy,
    isReadyToSend: () => !busy,
    readInputText: () => '',
    clearInput: () => {},
    async submitPrompt(text: string) {
      if (failError) {
        const msg = failError;
        failError = null;
        return { ok: false, error: msg };
      }
      submitted.push(text);
      return { ok: true };
    },
    ...overrides,
  };

  return {
    adapter,
    setBusy: (val) => {
      busy = val;
    },
    submitted,
    setFailNext: (err) => {
      failError = err;
    },
  };
}

describe('QueueEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits while AI is busy, runs cooldown, cancels if AI resumes, then dispatches', async () => {
    const mock = createMockAdapter();
    mock.setBusy(true);

    const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, cooldownMs: 1000 };
    const snapshots: EngineSnapshot[] = [];
    const onComplete = vi.fn();

    const engine = new QueueEngine({
      adapter: mock.adapter,
      settings,
      conversationKey: 'https://chatgpt.com/c/1',
      onChange: (s) => snapshots.push(s),
      onQueueComplete: onComplete,
      persistItems: () => {},
      tickIntervalMs: 100,
      postDispatchGraceMs: 200,
    });

    engine.enqueue('Prompt 1');
    expect(engine.getSnapshot().status).toBe('waiting_ai');

    // AI finishes -> enters cooldown
    mock.setBusy(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.getSnapshot().status).toBe('cooldown');
    expect(mock.submitted).toEqual([]);

    // AI becomes busy again mid-cooldown -> resets cooldown
    mock.setBusy(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(engine.getSnapshot().status).toBe('waiting_ai');

    // AI finishes permanently -> waits full 1000ms cooldown and dispatches
    mock.setBusy(false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(mock.submitted).toEqual(['Prompt 1']);
    expect(engine.getSnapshot().pendingCount).toBe(0);
    expect(engine.getSnapshot().sentCount).toBe(1);
    expect(onComplete).toHaveBeenCalledWith(1);

    engine.destroy();
  });

  it('supports step mode, pause/resume, reordering, and editing', async () => {
    const mock = createMockAdapter();
    const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, cooldownMs: 200 };

    const engine = new QueueEngine({
      adapter: mock.adapter,
      settings,
      conversationKey: 'test',
      onChange: () => {},
      persistItems: () => {},
      tickIntervalMs: 50,
      postDispatchGraceMs: 100,
    });

    engine.pause();
    const items = engine.enqueueBatch('First\n---\nSecond\n---\nThird');
    expect(items).toHaveLength(3);

    // Reorder Third before Second and edit First
    engine.moveItem(items[2]!.id, 'up');
    engine.updateItem(items[0]!.id, 'First Edited');

    await vi.advanceTimersByTimeAsync(500);
    expect(mock.submitted).toEqual([]); // Still paused

    // Step 1 -> dispatches only First Edited, then auto-pauses
    engine.stepNext();
    await vi.advanceTimersByTimeAsync(300);
    expect(mock.submitted).toEqual(['First Edited']);
    expect(engine.getSnapshot().paused).toBe(true);

    // Resume -> sends Third then Second
    engine.resume();
    await vi.advanceTimersByTimeAsync(800);
    expect(mock.submitted).toEqual(['First Edited', 'Third', 'Second']);

    engine.destroy();
  });

  it('pauses with error status on submit failure and recovers on retry', async () => {
    const mock = createMockAdapter();
    mock.setFailNext('Input box disappeared');

    const engine = new QueueEngine({
      adapter: mock.adapter,
      settings: { ...DEFAULT_SETTINGS, cooldownMs: 100 },
      conversationKey: 'test',
      onChange: () => {},
      persistItems: () => {},
      tickIntervalMs: 50,
      postDispatchGraceMs: 100,
    });

    engine.enqueue('Recoverable prompt');
    await vi.advanceTimersByTimeAsync(200);

    const errSnap = engine.getSnapshot();
    expect(errSnap.status).toBe('error');
    expect(errSnap.paused).toBe(true);
    expect(errSnap.lastError).toBe('Input box disappeared');
    expect(mock.submitted).toEqual([]);

    engine.retryFailed();
    await vi.advanceTimersByTimeAsync(200);
    expect(mock.submitted).toEqual(['Recoverable prompt']);
    expect(engine.getSnapshot().status).toBe('idle');

    engine.destroy();
  });

  it('automatically retries retryable submit failures without dropping or pausing', async () => {
    let attempts = 0;
    const mock = createMockAdapter({
      async submitPrompt(text: string) {
        attempts++;
        if (attempts === 1) {
          return { ok: false, retryable: true, error: 'Host composer not ready yet' };
        }
        mock.submitted.push(text);
        return { ok: true };
      },
    });

    const engine = new QueueEngine({
      adapter: mock.adapter,
      settings: { ...DEFAULT_SETTINGS, cooldownMs: 100 },
      conversationKey: 'test',
      onChange: () => {},
      persistItems: () => {},
      tickIntervalMs: 50,
      postDispatchGraceMs: 100,
    });

    engine.enqueue('Retryable prompt');
    await vi.advanceTimersByTimeAsync(150);

    // First attempt failed retryably: stays pending and unpaused
    const midSnap = engine.getSnapshot();
    expect(midSnap.paused).toBe(false);
    expect(midSnap.pendingCount).toBe(1);
    expect(attempts).toBe(1);

    // After grace + cooldown, second attempt succeeds
    await vi.advanceTimersByTimeAsync(300);
    expect(attempts).toBe(2);
    expect(mock.submitted).toEqual(['Retryable prompt']);
    expect(engine.getSnapshot().sentCount).toBe(1);
    expect(engine.getSnapshot().pendingCount).toBe(0);

    engine.destroy();
  });

  it('tracks wasRecentlyBusy window right after AI finishes generating', async () => {
    const mock = createMockAdapter();
    mock.setBusy(true);

    const engine = new QueueEngine({
      adapter: mock.adapter,
      settings: { ...DEFAULT_SETTINGS, cooldownMs: 1000 },
      conversationKey: 'test',
      onChange: () => {},
      persistItems: () => {},
      tickIntervalMs: 50,
      postDispatchGraceMs: 100,
    });

    expect(engine.wasRecentlyBusy(600)).toBe(true);

    mock.setBusy(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(engine.wasRecentlyBusy(600)).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(engine.wasRecentlyBusy(600)).toBe(false);

    engine.destroy();
  });
});
