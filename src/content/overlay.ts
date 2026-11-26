import type { SiteAdapter } from '../adapters/types';
import type { QueueEngine } from '../engine/queue-engine';
import { parsePrompts } from '../shared/parser';
import { sendToBackground } from '../shared/messaging';
import type {
  DockPosition,
  EngineSnapshot,
  ExtensionSettings,
  PromptPreset,
  QueueItem,
  ThemeMode,
} from '../shared/types';
import { createSvgIcon, type IconName } from './icons';
import stylesCss from './styles.css';

export interface OverlayOptions {
  adapter: SiteAdapter;
  engine: QueueEngine;
  settings: ExtensionSettings;
  presets: PromptPreset[];
  initialOpen: boolean;
  initialPosition: { x: number; y: number } | null;
  onUiStateChange: (open: boolean, position: { x: number; y: number } | null) => void;
  onSavePresets: (presets: PromptPreset[]) => Promise<void> | void;
}

/**
 * Shadow DOM floating pill and drawer UI injected into supported LLM sites.
 */
export class OverlayUI {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private shell: HTMLElement;
  private adapter: SiteAdapter;
  private engine: QueueEngine;
  private settings: ExtensionSettings;
  private presets: PromptPreset[];
  private onUiStateChange: OverlayOptions['onUiStateChange'];
  private onSavePresets: OverlayOptions['onSavePresets'];

  private isOpen: boolean;
  private pillPos: { x: number; y: number } | null;
  private snapshot: EngineSnapshot;
  private presetsMenuOpen = false;
  private historyExpanded = false;
  private editingId: string | null = null;
  private draggedId: string | null = null;
  private composerDraft = '';
  private toastMessage: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeListener: () => void;

  // Persistent DOM elements for smooth updates without losing focus
  private pillEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private statusDotEl: HTMLElement | null = null;
  private statusLabelEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private errorBannerEl: HTMLElement | null = null;
  private presetsMenuEl: HTMLElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private splitPillEl: HTMLElement | null = null;
  private queueBtnEl: HTMLButtonElement | null = null;
  private toastEl: HTMLElement | null = null;

  constructor(options: OverlayOptions) {
    this.adapter = options.adapter;
    this.engine = options.engine;
    this.settings = options.settings;
    this.presets = options.presets;
    this.isOpen = options.initialOpen;
    this.pillPos = options.initialPosition;
    this.onUiStateChange = options.onUiStateChange;
    this.onSavePresets = options.onSavePresets;
    this.snapshot = this.engine.getSnapshot();

    this.host = document.createElement('div');
    this.host.id = 'llm-queue-root';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = stylesCss;
    this.shadow.appendChild(styleEl);

    this.shell = document.createElement('div');
    this.shell.className = 'lq-shell';
    this.shadow.appendChild(this.shell);

    (document.documentElement || document.body).appendChild(this.host);

    this.resizeListener = () => this.applyPosition();
    window.addEventListener('resize', this.resizeListener);

    this.applyTheme();
    this.renderShell();
    this.applyPosition();
  }

  public destroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.host.remove();
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public setOpen(open: boolean): void {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.presetsMenuOpen = false;
    this.editingId = null;
    this.onUiStateChange(this.isOpen, this.pillPos);
    this.renderShell();
    this.applyPosition();
    if (this.isOpen) {
      setTimeout(() => this.textareaEl?.focus(), 20);
    }
  }

  public toggleOpen(): boolean {
    this.setOpen(!this.isOpen);
    return this.isOpen;
  }

  public updateSnapshot(snapshot: EngineSnapshot): void {
    this.snapshot = snapshot;
    if (!this.isOpen) {
      this.renderPill();
    } else {
      this.updateStatusDisplay();
      this.renderControls();
      this.renderErrorBanner();
      if (!this.editingId) {
        this.renderList();
      }
    }
  }

  public updateSettings(next: ExtensionSettings, presets?: PromptPreset[]): void {
    this.settings = next;
    if (presets) {
      this.presets = presets;
    }
    this.applyTheme();
    this.applyPosition();
    this.updateComposerMeta();
    if (this.presetsMenuOpen) {
      this.renderPresetsMenu();
    }
  }

  public showToast(message: string): void {
    this.toastMessage = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.renderToast();
    this.toastTimer = setTimeout(() => {
      this.toastMessage = null;
      this.renderToast();
    }, 2600);
  }

  public playCompletionChime(): void {
    if (!this.settings.soundOnComplete) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      playTone(587.33, now, 0.16);
      playTone(880, now + 0.11, 0.24);
      setTimeout(() => void ctx.close(), 600);
    } catch {
      // Ignore audio errors if blocked by browser autoplay policy.
    }
  }

  private detectTheme(mode: ThemeMode): 'dark' | 'light' {
    if (mode === 'dark' || mode === 'light') return mode;
    const html = document.documentElement;
    if (
      html.classList.contains('dark') ||
      html.getAttribute('data-theme') === 'dark' ||
      document.body?.classList.contains('dark')
    ) {
      return 'dark';
    }
    const bg = window.getComputedStyle(document.body || html).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
      if (alpha > 0.1) {
        const r = Number(match[1]);
        const g = Number(match[2]);
        const b = Number(match[3]);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5 ? 'dark' : 'light';
      }
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applyTheme(): void {
    const resolved = this.detectTheme(this.settings.theme);
    this.shell.classList.toggle('theme-dark', resolved === 'dark');
    this.shell.classList.toggle('theme-light', resolved === 'light');
  }

  private applyPosition(): void {
    const margin = 18;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;

    if (!this.isOpen && this.pillPos) {
      const maxX = Math.max(margin, vw - 170);
      const maxY = Math.max(margin, vh - 56);
      const x = Math.min(Math.max(margin, this.pillPos.x), maxX);
      const y = Math.min(Math.max(margin, this.pillPos.y), maxY);
      this.shell.style.left = `${x}px`;
      this.shell.style.top = `${y}px`;
      this.shell.style.right = 'auto';
      this.shell.style.bottom = 'auto';
      return;
    }

    const pos: DockPosition = this.settings.dockPosition;
    this.shell.style.left = pos === 'bottom-left' ? `${margin}px` : 'auto';
    this.shell.style.right = pos === 'bottom-left' ? 'auto' : `${margin}px`;
    this.shell.style.top = pos === 'top-right' ? `${margin}px` : 'auto';
    this.shell.style.bottom = pos === 'top-right' ? 'auto' : `${margin}px`;
  }

  private renderShell(): void {
    this.shell.replaceChildren();
    this.pillEl = null;
    this.panelEl = null;
    this.textareaEl = null;

    if (this.isOpen) {
      this.renderPanel();
    } else {
      this.renderPill();
    }
    this.renderToast();
  }

  private getStatusText(): string {
    const s = this.snapshot;
    switch (s.status) {
      case 'idle':
        return s.aiBusy ? 'AI generating · Queue empty' : 'Ready · Queue empty';
      case 'waiting_ai':
        return 'Waiting for AI to finish…';
      case 'cooldown': {
        const secs = (s.cooldownRemainingMs / 1000).toFixed(1);
        return `Sending next in ${secs}s`;
      }
      case 'dispatching':
        return 'Sending prompt…';
      case 'paused':
        return s.pendingCount > 0 ? `Paused · ${s.pendingCount} queued` : 'Paused';
      case 'error':
        return 'Stopped due to error';
    }
  }

  private renderPill(): void {
    if (!this.pillEl) {
      this.pillEl = document.createElement('div');
      this.pillEl.className = 'lq-pill';
      this.pillEl.setAttribute('role', 'button');
      this.pillEl.setAttribute('tabindex', '0');
      this.pillEl.title = 'Open LLM Queue (Alt+Q)';
      this.attachPillDrag(this.pillEl);
      this.shell.appendChild(this.pillEl);
    }

    const pill = this.pillEl;
    pill.replaceChildren();

    const logo = document.createElement('span');
    logo.className = 'lq-pill-logo';
    logo.appendChild(createSvgIcon('logo', 13));

    const dot = document.createElement('span');
    dot.className = `lq-dot status-${this.snapshot.status}`;

    const label = document.createElement('span');
    label.className = 'lq-pill-label';
    label.textContent = 'Queue';

    const badge = document.createElement('span');
    badge.className = `lq-badge ${this.snapshot.pendingCount === 0 ? 'is-empty' : ''}`;
    badge.textContent = String(this.snapshot.pendingCount);

    pill.append(logo, dot, label, badge);

    if (this.snapshot.pendingCount > 0) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'lq-pill-action';
      toggleBtn.title = this.snapshot.paused ? 'Resume queue' : 'Pause queue';
      toggleBtn.appendChild(
        createSvgIcon(this.snapshot.paused ? 'play' : 'pause', 12),
      );
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.togglePause();
      });
      pill.appendChild(toggleBtn);
    }
  }

  private attachPillDrag(pill: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;
    let moved = false;

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (e.button !== 0) return;
      const rect = this.shell.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origX = rect.left;
      origY = rect.top;
      moved = false;

      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        this.pillPos = { x: origX + dx, y: origY + dy };
        this.applyPosition();
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (moved) {
          this.onUiStateChange(this.isOpen, this.pillPos);
        } else {
          this.setOpen(true);
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    pill.addEventListener('pointerdown', onPointerDown);
    pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.setOpen(true);
      }
    });
  }

  private renderPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'lq-panel';
    this.panelEl = panel;

    // Header
    const header = document.createElement('div');
    header.className = 'lq-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'lq-header-left';

    const logo = document.createElement('span');
    logo.className = 'lq-pill-logo';
    logo.appendChild(createSvgIcon('logo', 13));

    const title = document.createElement('span');
    title.className = 'lq-title';
    title.textContent = 'LLM Queue';

    const siteTag = document.createElement('span');
    siteTag.className = 'lq-site-tag';
    siteTag.textContent = this.adapter.name;
    siteTag.style.borderLeft = `3px solid ${this.adapter.accentColor}`;

    headerLeft.append(logo, title, siteTag);

    const headerActions = document.createElement('div');
    headerActions.className = 'lq-header-actions';

    const settingsBtn = this.makeIconButton('settings', 'Open settings', () => {
      void sendToBackground({ type: 'OPEN_OPTIONS' });
    });
    const closeBtn = this.makeIconButton('x', 'Collapse panel (Alt+Q)', () => {
      this.setOpen(false);
    });
    headerActions.append(settingsBtn, closeBtn);
    header.append(headerLeft, headerActions);

    // Status Strip
    const statusStrip = document.createElement('div');
    statusStrip.className = 'lq-status-strip';

    const statusLeft = document.createElement('div');
    statusLeft.className = 'lq-status-text';
    this.statusDotEl = document.createElement('span');
    this.statusLabelEl = document.createElement('span');
    statusLeft.append(this.statusDotEl, this.statusLabelEl);

    const pendingSummary = document.createElement('span');
    pendingSummary.className = 'lq-preset-count';
    pendingSummary.textContent = `Cooldown ${(this.settings.cooldownMs / 1000).toFixed(1)}s`;
    statusStrip.append(statusLeft, pendingSummary);

    // Controls Bar
    this.controlsEl = document.createElement('div');
    this.controlsEl.className = 'lq-controls';
    this.presetsMenuEl = document.createElement('div');
    this.presetsMenuEl.className = 'lq-presets-menu';
    this.presetsMenuEl.hidden = true;

    // Error Banner
    this.errorBannerEl = document.createElement('div');
    this.errorBannerEl.className = 'lq-error-banner';
    this.errorBannerEl.hidden = true;

    // List Container
    this.listEl = document.createElement('div');
    this.listEl.className = 'lq-list';

    // Composer Footer
    const composer = this.buildComposer();

    panel.append(
      header,
      statusStrip,
      this.controlsEl,
      this.errorBannerEl,
      this.listEl,
      composer,
    );
    this.shell.appendChild(panel);

    this.updateStatusDisplay();
    this.renderControls();
    this.renderErrorBanner();
    this.renderList();
  }

  private makeIconButton(
    icon: IconName,
    title: string,
    onClick: () => void,
    className = 'lq-icon-btn',
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.appendChild(createSvgIcon(icon, 14));
    btn.addEventListener('click', onClick);
    return btn;
  }

  private updateStatusDisplay(): void {
    if (!this.statusDotEl || !this.statusLabelEl) return;
    this.statusDotEl.className = `lq-dot status-${this.snapshot.status}`;
    this.statusLabelEl.textContent = this.getStatusText();
  }

  private renderControls(): void {
    if (!this.controlsEl) return;
    this.controlsEl.replaceChildren();

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = `lq-btn ${
      this.snapshot.paused ? 'lq-btn-primary' : 'lq-btn-warning'
    }`;
    pauseBtn.append(
      createSvgIcon(this.snapshot.paused ? 'play' : 'pause', 12),
      document.createTextNode(this.snapshot.paused ? 'Resume' : 'Pause'),
    );
    pauseBtn.addEventListener('click', () => this.engine.togglePause());

    const stepBtn = document.createElement('button');
    stepBtn.type = 'button';
    stepBtn.className = 'lq-btn';
    stepBtn.title = 'Send next prompt then pause';
    stepBtn.disabled = this.snapshot.pendingCount === 0;
    stepBtn.append(createSvgIcon('step', 12), document.createTextNode('Step 1'));
    stepBtn.addEventListener('click', () => this.engine.stepNext());

    const presetsBtn = document.createElement('button');
    presetsBtn.type = 'button';
    presetsBtn.className = 'lq-btn';
    presetsBtn.append(createSvgIcon('presets', 12), document.createTextNode('Presets'));
    presetsBtn.addEventListener('click', () => {
      this.presetsMenuOpen = !this.presetsMenuOpen;
      this.renderPresetsMenu();
    });

    const spacer = document.createElement('div');
    spacer.className = 'lq-controls-spacer';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'lq-btn lq-btn-danger-ghost';
    clearBtn.title = 'Clear pending queue';
    clearBtn.disabled = this.snapshot.pendingCount === 0;
    clearBtn.append(createSvgIcon('trash', 12), document.createTextNode('Clear'));
    clearBtn.addEventListener('click', () => this.engine.clearPending());

    this.controlsEl.append(pauseBtn, stepBtn, presetsBtn, spacer, clearBtn);
    if (this.presetsMenuEl) {
      this.controlsEl.appendChild(this.presetsMenuEl);
      this.renderPresetsMenu();
    }
  }

  private renderPresetsMenu(): void {
    if (!this.presetsMenuEl) return;
    this.presetsMenuEl.hidden = !this.presetsMenuOpen;
    if (!this.presetsMenuOpen) return;

    this.presetsMenuEl.replaceChildren();

    for (const preset of this.presets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lq-preset-item';

      const name = document.createElement('span');
      name.textContent = preset.name;
      const count = document.createElement('span');
      count.className = 'lq-preset-count';
      count.textContent = `${preset.prompts.length} prompts`;

      btn.append(name, count);
      btn.addEventListener('click', () => {
        for (const p of preset.prompts) {
          this.engine.enqueue(p);
        }
        this.presetsMenuOpen = false;
        this.renderPresetsMenu();
        this.showToast(`Loaded "${preset.name}" (${preset.prompts.length})`);
      });
      this.presetsMenuEl.appendChild(btn);
    }

    const pending = this.snapshot.items.filter((i) => i.status === 'pending');
    if (pending.length > 0) {
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'lq-preset-item';
      saveBtn.style.borderTop = '1px solid var(--lq-border)';
      saveBtn.style.marginTop = '4px';
      saveBtn.style.paddingTop = '8px';
      saveBtn.style.color = 'var(--lq-accent)';
      saveBtn.textContent = `+ Save current ${pending.length} prompt(s) as preset`;
      saveBtn.addEventListener('click', () => {
        const name = window.prompt('Preset name:');
        if (!name || !name.trim()) return;
        const newPreset: PromptPreset = {
          id: `preset-${Date.now()}`,
          name: name.trim(),
          prompts: pending.map((i) => i.text),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.presets = [...this.presets, newPreset];
        void this.onSavePresets(this.presets);
        this.presetsMenuOpen = false;
        this.renderPresetsMenu();
        this.showToast(`Saved preset "${newPreset.name}"`);
      });
      this.presetsMenuEl.appendChild(saveBtn);
    }
  }

  private renderErrorBanner(): void {
    if (!this.errorBannerEl) return;
    if (this.snapshot.status !== 'error' || !this.snapshot.lastError) {
      this.errorBannerEl.hidden = true;
      return;
    }
    this.errorBannerEl.hidden = false;
    this.errorBannerEl.replaceChildren();

    const msgWrap = document.createElement('div');
    msgWrap.className = 'lq-error-msg';
    msgWrap.appendChild(createSvgIcon('alert', 14));
    const txt = document.createElement('span');
    txt.textContent = this.snapshot.lastError;
    msgWrap.appendChild(txt);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'lq-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => this.engine.retryFailed());

    this.errorBannerEl.append(msgWrap, retryBtn);
  }

  private renderList(): void {
    if (!this.listEl) return;
    this.listEl.replaceChildren();

    const pendingAndFailed = this.snapshot.items.filter((i) => i.status !== 'sent');
    const sentItems = this.snapshot.items.filter((i) => i.status === 'sent');

    if (pendingAndFailed.length === 0 && sentItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lq-empty';

      const title = document.createElement('div');
      title.className = 'lq-empty-title';
      title.textContent = 'No prompts queued yet';

      const sub = document.createElement('div');
      sub.className = 'lq-empty-sub';
      sub.append(
        document.createTextNode('Press '),
        this.makeKbd('Enter'),
        document.createTextNode(' in the chat box while AI replies, or '),
        this.makeKbd('Ctrl+Shift+Enter'),
        document.createTextNode(' anytime. Separate batch prompts with '),
        this.makeKbd(this.settings.batchDelimiter || '---'),
        document.createTextNode('.'),
      );

      empty.append(title, sub);
      this.listEl.appendChild(empty);
      return;
    }

    pendingAndFailed.forEach((item, idx) => {
      this.listEl!.appendChild(this.buildQueueCard(item, idx, pendingAndFailed.length));
    });

    if (sentItems.length > 0) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'lq-history-toggle';

      const left = document.createElement('span');
      left.style.display = 'inline-flex';
      left.style.alignItems = 'center';
      left.style.gap = '5px';
      left.append(
        createSvgIcon(this.historyExpanded ? 'chevron-down' : 'chevron-right', 13),
        document.createTextNode(`Sent (${sentItems.length})`),
      );

      const clearHistoryBtn = document.createElement('span');
      clearHistoryBtn.textContent = 'Clear';
      clearHistoryBtn.style.color = 'var(--lq-text-muted)';
      clearHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.clearHistory();
      });

      toggle.append(left, clearHistoryBtn);
      toggle.addEventListener('click', () => {
        this.historyExpanded = !this.historyExpanded;
        this.renderList();
      });
      this.listEl.appendChild(toggle);

      if (this.historyExpanded) {
        for (const item of sentItems) {
          this.listEl.appendChild(this.buildSentCard(item));
        }
      }
    }
  }

  private makeKbd(text: string): HTMLElement {
    const kbd = document.createElement('span');
    kbd.className = 'lq-kbd';
    kbd.textContent = text;
    return kbd;
  }

  private buildQueueCard(item: QueueItem, index: number, total: number): HTMLElement {
    const card = document.createElement('div');
    card.className = `lq-card ${item.status === 'sending' ? 'is-sending' : ''} ${
      item.status === 'failed' ? 'is-failed' : ''
    }`;
    card.draggable = item.status === 'pending' && this.editingId !== item.id;

    card.addEventListener('dragstart', (e) => {
      this.draggedId = item.id;
      e.dataTransfer?.setData('text/plain', item.id);
    });
    card.addEventListener('dragover', (e) => {
      if (!this.draggedId || this.draggedId === item.id) return;
      e.preventDefault();
      card.classList.add('is-drag-over');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('is-drag-over');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('is-drag-over');
      if (this.draggedId && this.draggedId !== item.id) {
        this.engine.reorderItem(this.draggedId, item.id);
      }
      this.draggedId = null;
    });

    if (this.editingId === item.id) {
      const editBox = document.createElement('textarea');
      editBox.className = 'lq-textarea';
      editBox.value = item.text;
      const row = document.createElement('div');
      row.className = 'lq-composer-btns';
      row.style.justifyContent = 'flex-end';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'lq-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        this.editingId = null;
        this.renderList();
      });

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'lq-btn lq-btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => {
        this.editingId = null;
        this.engine.updateItem(item.id, editBox.value);
      });

      row.append(cancelBtn, saveBtn);
      card.append(editBox, row);
      setTimeout(() => editBox.focus(), 10);
      return card;
    }

    const row = document.createElement('div');
    row.className = 'lq-card-row';

    const grip = document.createElement('span');
    grip.className = 'lq-drag-handle';
    grip.appendChild(createSvgIcon('grip', 13));

    const badge = document.createElement('span');
    badge.className = 'lq-index';
    badge.textContent = item.status === 'sending' ? 'NOW' : `#${index + 1}`;

    const textEl = document.createElement('div');
    textEl.className = 'lq-card-text';
    textEl.textContent = item.text;
    textEl.title = 'Click to edit';
    textEl.addEventListener('click', () => {
      if (item.status === 'sending') return;
      this.editingId = item.id;
      this.renderList();
    });

    row.append(grip, badge, textEl);
    card.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'lq-card-actions';

    const upBtn = this.makeIconButton('arrow-up', 'Move up', () => {
      this.engine.moveItem(item.id, 'up');
    }, 'lq-mini-btn');
    upBtn.disabled = index === 0 || item.status !== 'pending';

    const downBtn = this.makeIconButton('arrow-down', 'Move down', () => {
      this.engine.moveItem(item.id, 'down');
    }, 'lq-mini-btn');
    downBtn.disabled = index >= total - 1 || item.status !== 'pending';

    const sendNowBtn = this.makeIconButton('send', 'Send immediately', () => {
      void this.engine.sendNow(item.id).then((ok) => {
        if (!ok) this.showToast('Wait for AI to finish before sending now.');
      });
    }, 'lq-mini-btn');
    sendNowBtn.disabled = this.snapshot.aiBusy || item.status === 'sending';

    const editBtn = this.makeIconButton('edit', 'Edit prompt', () => {
      this.editingId = item.id;
      this.renderList();
    }, 'lq-mini-btn');

    const delBtn = this.makeIconButton('trash', 'Remove prompt', () => {
      this.engine.removeItem(item.id);
    }, 'lq-mini-btn danger');

    actions.append(upBtn, downBtn, sendNowBtn, editBtn, delBtn);
    card.appendChild(actions);
    return card;
  }

  private buildSentCard(item: QueueItem): HTMLElement {
    const card = document.createElement('div');
    card.className = 'lq-card is-sent';

    const row = document.createElement('div');
    row.className = 'lq-card-row';

    const check = document.createElement('span');
    check.style.color = 'var(--lq-success)';
    check.appendChild(createSvgIcon('check', 13));

    const textEl = document.createElement('div');
    textEl.className = 'lq-card-text';
    textEl.textContent = item.text;

    const requeueBtn = this.makeIconButton('copy', 'Re-queue prompt', () => {
      this.engine.requeueSentItem(item.id);
      this.showToast('Added back to queue');
    }, 'lq-mini-btn');

    row.append(check, textEl, requeueBtn);
    card.appendChild(row);
    return card;
  }

  private buildComposer(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'lq-composer';

    const textarea = document.createElement('textarea');
    textarea.className = 'lq-textarea';
    textarea.placeholder = `Type follow-up prompt… (use "${this.settings.batchDelimiter}" on its own line to split multiple)`;
    textarea.value = this.composerDraft;
    this.textareaEl = textarea;

    textarea.addEventListener('input', () => {
      this.composerDraft = textarea.value;
      this.updateComposerMeta();
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submitComposer();
      }
    });

    const bar = document.createElement('div');
    bar.className = 'lq-composer-bar';

    const meta = document.createElement('div');
    meta.className = 'lq-composer-meta';
    this.splitPillEl = document.createElement('span');
    this.splitPillEl.className = 'lq-split-pill';
    this.splitPillEl.hidden = true;

    const hint = document.createElement('span');
    hint.textContent = 'Enter to queue · Shift+Enter newline';
    meta.append(this.splitPillEl, hint);

    const btns = document.createElement('div');
    btns.className = 'lq-composer-btns';

    const grabBtn = document.createElement('button');
    grabBtn.type = 'button';
    grabBtn.className = 'lq-btn';
    grabBtn.title = 'Pull text from the chat input box';
    grabBtn.append(createSvgIcon('grab', 12), document.createTextNode('Grab'));
    grabBtn.addEventListener('click', () => {
      const text = this.adapter.readInputText().trim();
      if (!text) {
        this.showToast('Chat input is empty');
        return;
      }
      this.adapter.clearInput();
      this.engine.enqueueBatch(text);
      this.showToast('Grabbed from chat input');
    });

    const queueBtn = document.createElement('button');
    queueBtn.type = 'button';
    queueBtn.className = 'lq-btn lq-btn-primary';
    queueBtn.append(createSvgIcon('plus', 12), document.createTextNode('Queue'));
    queueBtn.addEventListener('click', () => this.submitComposer());
    this.queueBtnEl = queueBtn;

    btns.append(grabBtn, queueBtn);
    bar.append(meta, btns);
    wrap.append(textarea, bar);

    this.updateComposerMeta();
    return wrap;
  }

  private updateComposerMeta(): void {
    const text = this.composerDraft;
    const prompts = parsePrompts(text, this.settings.batchDelimiter);
    if (this.splitPillEl) {
      if (prompts.length > 1) {
        this.splitPillEl.hidden = false;
        this.splitPillEl.textContent = `Split: ${prompts.length} prompts`;
      } else {
        this.splitPillEl.hidden = true;
      }
    }
    if (this.queueBtnEl) {
      this.queueBtnEl.disabled = prompts.length === 0;
    }
  }

  private submitComposer(): void {
    const created = this.engine.enqueueBatch(this.composerDraft);
    if (created.length === 0) return;
    this.composerDraft = '';
    if (this.textareaEl) {
      this.textareaEl.value = '';
    }
    this.updateComposerMeta();
    if (created.length > 1) {
      this.showToast(`Queued ${created.length} prompts`);
    }
  }

  private renderToast(): void {
    if (!this.toastMessage) {
      this.toastEl?.remove();
      this.toastEl = null;
      return;
    }
    if (!this.toastEl) {
      this.toastEl = document.createElement('div');
      this.toastEl.className = 'lq-toast';
      this.shell.appendChild(this.toastEl);
    }
    this.toastEl.textContent = this.toastMessage;
  }
}
