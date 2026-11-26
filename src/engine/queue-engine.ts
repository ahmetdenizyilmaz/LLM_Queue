import type { SiteAdapter } from '../adapters/types';
import { generateId, parsePrompts } from '../shared/parser';
import type {
  EngineSnapshot,
  EngineStatus,
  ExtensionSettings,
  QueueItem,
} from '../shared/types';

export interface QueueEngineOptions {
  adapter: SiteAdapter;
  settings: ExtensionSettings;
  conversationKey: string;
  initialItems?: QueueItem[];
  onChange: (snapshot: EngineSnapshot) => void;
  onQueueComplete?: (sentCount: number) => void;
  persistItems: (conversationKey: string, items: QueueItem[]) => Promise<void> | void;
  tickIntervalMs?: number;
  postDispatchGraceMs?: number;
}

/**
 * State machine that observes the host AI chat UI and dispatches queued
 * prompts safely once generation finishes and the cooldown expires.
 */
export class QueueEngine {
  private adapter: SiteAdapter;
  private settings: ExtensionSettings;
  private conversationKey: string;
  private items: QueueItem[];
  private onChange: (snapshot: EngineSnapshot) => void;
  private onQueueComplete?: (sentCount: number) => void;
  private persistItems: (conversationKey: string, items: QueueItem[]) => Promise<void> | void;
  private tickIntervalMs: number;
  private postDispatchGraceMs: number;

  private status: EngineStatus = 'idle';
  private paused = false;
  private stepMode = false;
  private lastError: string | null = null;
  private aiBusy = false;
  private lastBusyAt = 0;
  private cooldownStartedAt: number | null = null;
  private cooldownRemainingMs = 0;
  private lastDispatchedAt = 0;
  private isDispatching = false;
  private destroyed = false;
  private retryCounts = new Map<string, number>();

  private observer: MutationObserver | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: QueueEngineOptions) {
    this.adapter = options.adapter;
    this.settings = options.settings;
    this.conversationKey = options.conversationKey;
    this.items = (options.initialItems ?? []).map((item) => ({ ...item }));
    this.onChange = options.onChange;
    this.onQueueComplete = options.onQueueComplete;
    this.persistItems = options.persistItems;
    this.tickIntervalMs = options.tickIntervalMs ?? 250;
    this.postDispatchGraceMs = options.postDispatchGraceMs ?? 1200;

    this.startWatching();
    this.evaluate();
  }

  private startWatching(): void {
    if (typeof MutationObserver !== 'undefined' && document.body) {
      this.observer = new MutationObserver(() => {
        if (this.destroyed || this.mutationDebounceTimer) return;
        this.mutationDebounceTimer = setTimeout(() => {
          this.mutationDebounceTimer = null;
          this.evaluate();
        }, 80);
      });
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'aria-label', 'data-is-streaming', 'class'],
      });
    }

    this.tickTimer = setInterval(() => {
      if (!this.destroyed) {
        this.evaluate();
      }
    }, this.tickIntervalMs);
  }

  public destroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.mutationDebounceTimer) {
      clearTimeout(this.mutationDebounceTimer);
      this.mutationDebounceTimer = null;
    }
  }

  public getLastDispatchedAt(): number {
    return this.lastDispatchedAt;
  }

  public wasRecentlyBusy(windowMs = 600): boolean {
    if (this.aiBusy) return true;
    return this.lastBusyAt > 0 && Date.now() - this.lastBusyAt <= windowMs;
  }

  public getSnapshot(): EngineSnapshot {
    const pendingCount = this.items.filter(
      (i) => i.status === 'pending' || i.status === 'sending',
    ).length;
    const sentCount = this.items.filter((i) => i.status === 'sent').length;
    return {
      status: this.status,
      items: this.items.map((i) => ({ ...i })),
      pendingCount,
      sentCount,
      aiBusy: this.aiBusy,
      cooldownRemainingMs: this.cooldownRemainingMs,
      paused: this.paused,
      stepMode: this.stepMode,
      lastError: this.lastError,
      siteId: this.adapter.id,
      siteName: this.adapter.name,
      conversationKey: this.conversationKey,
    };
  }

  private emit(): void {
    this.onChange(this.getSnapshot());
  }

  private saveAndEmit(): void {
    void this.persistItems(
      this.conversationKey,
      this.items.map((i) => ({ ...i })),
    );
    this.evaluate();
  }

  private getPendingItems(): QueueItem[] {
    return this.items.filter((i) => i.status === 'pending');
  }

  /**
   * Re-evaluate AI state, cooldown countdown, and dispatch readiness.
   */
  public evaluate(): void {
    if (this.destroyed) return;

    const busy = this.adapter.isBusy();
    this.aiBusy = busy;
    if (busy) {
      this.lastBusyAt = Date.now();
    }

    if (this.isDispatching) {
      this.status = 'dispatching';
      this.cooldownRemainingMs = 0;
      this.emit();
      return;
    }

    if (this.lastError && this.paused) {
      this.status = 'error';
      this.cooldownRemainingMs = 0;
      this.cooldownStartedAt = null;
      this.emit();
      return;
    }

    if (this.paused) {
      this.status = 'paused';
      this.cooldownRemainingMs = 0;
      this.cooldownStartedAt = null;
      this.emit();
      return;
    }

    const pending = this.getPendingItems();
    if (pending.length === 0) {
      this.status = 'idle';
      this.cooldownRemainingMs = 0;
      this.cooldownStartedAt = null;
      this.emit();
      return;
    }

    const now = Date.now();
    const inGraceWindow =
      this.lastDispatchedAt > 0 && now - this.lastDispatchedAt < this.postDispatchGraceMs;

    if (busy || inGraceWindow) {
      this.status = 'waiting_ai';
      this.cooldownStartedAt = null;
      this.cooldownRemainingMs = this.settings.cooldownMs;
      this.emit();
      return;
    }

    // AI is idle and we have pending items
    if (this.cooldownStartedAt === null) {
      this.cooldownStartedAt = now;
    }

    const elapsed = now - this.cooldownStartedAt;
    const remaining = Math.max(0, this.settings.cooldownMs - elapsed);
    this.cooldownRemainingMs = remaining;

    if (remaining > 0) {
      this.status = 'cooldown';
      this.emit();
      return;
    }

    // Cooldown complete; ensure composer is mounted before dispatching
    if (!this.adapter.isReadyToSend()) {
      this.status = 'waiting_ai';
      this.emit();
      return;
    }

    const nextItem = pending[0];
    if (nextItem) {
      void this.dispatchItem(nextItem.id);
    }
  }

  private async dispatchItem(itemId: string): Promise<boolean> {
    if (this.isDispatching || this.destroyed) return false;

    const target = this.items.find((i) => i.id === itemId && i.status === 'pending');
    if (!target) return false;

    this.isDispatching = true;
    this.cooldownStartedAt = null;
    this.cooldownRemainingMs = 0;
    this.lastError = null;
    target.status = 'sending';
    this.status = 'dispatching';
    this.emit();

    let result: { ok: boolean; error?: string; retryable?: boolean };
    try {
      result = await this.adapter.submitPrompt(target.text);
    } catch (err) {
      result = {
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected dispatch error.',
      };
    }

    this.isDispatching = false;
    if (this.destroyed) return false;

    if (result.ok) {
      this.retryCounts.delete(target.id);
      target.status = 'sent';
      target.sentAt = Date.now();
      delete target.error;
      this.lastDispatchedAt = Date.now();

      if (this.stepMode) {
        this.stepMode = false;
        this.paused = true;
      }

      const remainingPending = this.getPendingItems().length;
      if (remainingPending === 0 && !this.paused) {
        const totalSent = this.items.filter((i) => i.status === 'sent').length;
        this.onQueueComplete?.(totalSent);
      }

      this.saveAndEmit();
      return true;
    } else {
      const retries = this.retryCounts.get(target.id) ?? 0;
      if (result.retryable && retries < 2) {
        this.retryCounts.set(target.id, retries + 1);
        target.status = 'pending';
        delete target.error;
        this.lastDispatchedAt = Date.now();
        this.saveAndEmit();
        return false;
      }

      target.status = 'failed';
      target.error = result.error ?? 'Failed to submit prompt.';
      this.lastError = target.error;
      this.paused = true;
      this.stepMode = false;
      this.saveAndEmit();
      return false;
    }
  }

  public enqueue(text: string): QueueItem | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const item: QueueItem = {
      id: generateId(),
      text: trimmed,
      createdAt: Date.now(),
      status: 'pending',
    };
    this.items.push(item);
    this.lastError = null;
    this.saveAndEmit();
    return { ...item };
  }

  public enqueueBatch(rawText: string, delimiter?: string): QueueItem[] {
    const prompts = parsePrompts(rawText, delimiter ?? this.settings.batchDelimiter);
    if (prompts.length === 0) return [];
    const created: QueueItem[] = prompts.map((text, idx) => ({
      id: generateId(),
      text,
      createdAt: Date.now() + idx,
      status: 'pending',
    }));
    this.items.push(...created);
    this.lastError = null;
    this.saveAndEmit();
    return created.map((i) => ({ ...i }));
  }

  public updateItem(id: string, newText: string): boolean {
    const trimmed = newText.trim();
    if (!trimmed) return false;
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status === 'sending') return false;
    item.text = trimmed;
    if (item.status === 'failed') {
      item.status = 'pending';
      delete item.error;
      this.lastError = null;
    }
    this.saveAndEmit();
    return true;
  }

  public removeItem(id: string): boolean {
    const index = this.items.findIndex((i) => i.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    this.retryCounts.delete(id);
    if (!this.items.some((i) => i.status === 'failed')) {
      this.lastError = null;
    }
    this.saveAndEmit();
    return true;
  }

  public reorderItem(draggedId: string, targetId: string): boolean {
    if (draggedId === targetId) return false;
    const fromIndex = this.items.findIndex((i) => i.id === draggedId);
    const toIndex = this.items.findIndex((i) => i.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return false;

    const fromItem = this.items[fromIndex];
    const toItem = this.items[toIndex];
    if (!fromItem || !toItem || fromItem.status !== 'pending' || toItem.status !== 'pending') {
      return false;
    }

    this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, fromItem);
    this.saveAndEmit();
    return true;
  }

  public moveItem(id: string, direction: 'up' | 'down'): boolean {
    const pendingIndices: number[] = [];
    this.items.forEach((item, idx) => {
      if (item.status === 'pending') {
        pendingIndices.push(idx);
      }
    });

    const currentPosInPending = pendingIndices.findIndex(
      (idx) => this.items[idx]?.id === id,
    );
    if (currentPosInPending === -1) return false;

    const swapPosInPending =
      direction === 'up' ? currentPosInPending - 1 : currentPosInPending + 1;
    if (swapPosInPending < 0 || swapPosInPending >= pendingIndices.length) {
      return false;
    }

    const idxA = pendingIndices[currentPosInPending]!;
    const idxB = pendingIndices[swapPosInPending]!;
    const temp = this.items[idxA]!;
    this.items[idxA] = this.items[idxB]!;
    this.items[idxB] = temp;

    this.saveAndEmit();
    return true;
  }

  public duplicateItem(id: string): QueueItem | null {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const source = this.items[idx]!;
    const copy: QueueItem = {
      id: generateId(),
      text: source.text,
      createdAt: Date.now(),
      status: 'pending',
    };
    this.items.splice(idx + 1, 0, copy);
    this.saveAndEmit();
    return { ...copy };
  }

  public requeueSentItem(id: string): QueueItem | null {
    const source = this.items.find((i) => i.id === id);
    if (!source) return null;
    const copy: QueueItem = {
      id: generateId(),
      text: source.text,
      createdAt: Date.now(),
      status: 'pending',
    };
    this.items.push(copy);
    this.saveAndEmit();
    return { ...copy };
  }

  public async sendNow(id: string): Promise<boolean> {
    if (this.isDispatching || this.adapter.isBusy()) {
      return false;
    }
    const item = this.items.find((i) => i.id === id && (i.status === 'pending' || i.status === 'failed'));
    if (!item) return false;
    item.status = 'pending';
    delete item.error;
    this.lastError = null;
    return this.dispatchItem(item.id);
  }

  public pause(): void {
    this.paused = true;
    this.stepMode = false;
    this.cooldownStartedAt = null;
    this.evaluate();
  }

  public resume(): void {
    this.paused = false;
    this.stepMode = false;
    this.lastError = null;
    this.cooldownStartedAt = null;
    this.evaluate();
  }

  public togglePause(): boolean {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.paused;
  }

  public stepNext(): void {
    if (this.getPendingItems().length === 0) return;
    this.paused = false;
    this.stepMode = true;
    this.lastError = null;
    this.cooldownStartedAt = null;
    this.evaluate();
  }

  public retryFailed(): void {
    let changed = false;
    for (const item of this.items) {
      if (item.status === 'failed') {
        item.status = 'pending';
        delete item.error;
        this.retryCounts.delete(item.id);
        changed = true;
      }
    }
    this.lastError = null;
    this.paused = false;
    if (changed) {
      this.saveAndEmit();
    } else {
      this.evaluate();
    }
  }

  public clearPending(): void {
    this.items = this.items.filter((i) => i.status === 'sent');
    this.retryCounts.clear();
    this.lastError = null;
    this.stepMode = false;
    this.saveAndEmit();
  }

  public clearHistory(): void {
    this.items = this.items.filter((i) => i.status !== 'sent');
    this.saveAndEmit();
  }

  public updateSettings(next: ExtensionSettings): void {
    this.settings = next;
    this.cooldownStartedAt = null;
    this.evaluate();
  }

  public setConversation(conversationKey: string, items: QueueItem[]): void {
    this.conversationKey = conversationKey;
    this.items = items.map((i) => ({ ...i }));
    this.cooldownStartedAt = null;
    this.lastError = null;
    this.evaluate();
  }
}
