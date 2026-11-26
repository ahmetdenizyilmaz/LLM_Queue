import { isButtonEnabled, isProgrammaticSubmitActive } from '../adapters/dom-utils';
import type { SiteAdapter } from '../adapters/types';
import type { QueueEngine } from '../engine/queue-engine';
import type { ExtensionSettings } from '../shared/types';

export interface InterceptorCallbacks {
  onQueued: (text: string, reason: 'busy' | 'shortcut', count: number) => void;
}

/**
 * Intercepts Enter while the AI is generating (when enabled) and Ctrl/Cmd+Shift+Enter
 * inside the host site's chat composer to route prompts straight into the queue.
 */
export class ComposerInterceptor {
  private adapter: SiteAdapter;
  private engine: QueueEngine;
  private settings: ExtensionSettings;
  private callbacks: InterceptorCallbacks;
  private listener: (event: KeyboardEvent) => void;

  constructor(
    adapter: SiteAdapter,
    engine: QueueEngine,
    settings: ExtensionSettings,
    callbacks: InterceptorCallbacks,
  ) {
    this.adapter = adapter;
    this.engine = engine;
    this.settings = settings;
    this.callbacks = callbacks;

    this.listener = (event: KeyboardEvent) => this.handleKeyDown(event);
    document.addEventListener('keydown', this.listener, true);
  }

  public updateSettings(next: ExtensionSettings): void {
    this.settings = next;
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.listener, true);
  }

  private isEventInsideComposer(event: KeyboardEvent, input: HTMLElement): boolean {
    const target = event.target;
    if (target instanceof Node && input.contains(target)) {
      return true;
    }
    const active = document.activeElement;
    return active instanceof Node && input.contains(active);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || event.key !== 'Enter' || isProgrammaticSubmitActive()) {
      return;
    }

    const input = this.adapter.getInput();
    if (!input || !this.isEventInsideComposer(event, input)) {
      return;
    }

    const isManualQueueShortcut =
      (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey;

    const isPlainEnter =
      !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;

    if (isManualQueueShortcut) {
      const text = this.adapter.readInputText().trim();
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const created = this.engine.enqueueBatch(text);
      if (created.length === 0) return;
      this.adapter.clearInput();
      const snapshot = this.engine.getSnapshot();
      this.callbacks.onQueued(
        text,
        'shortcut',
        created.length > 1 ? created.length : snapshot.pendingCount,
      );
      return;
    }

    const shouldAutoQueue =
      isPlainEnter &&
      this.settings.autoQueueOnEnterWhileBusy &&
      (this.adapter.isBusy() ||
        (this.engine.wasRecentlyBusy(600) &&
          !isButtonEnabled(this.adapter.getSendButton())));

    if (shouldAutoQueue) {
      const text = this.adapter.readInputText().trim();
      if (!text) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const item = this.engine.enqueue(text);
      if (!item) return;
      this.adapter.clearInput();
      const snapshot = this.engine.getSnapshot();
      this.callbacks.onQueued(text, 'busy', snapshot.pendingCount);
    }
  }
}
