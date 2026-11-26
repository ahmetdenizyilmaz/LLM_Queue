import { getTabStatus, queryActiveTab, sendToTab } from '../shared/messaging';
import type { EngineSnapshot } from '../shared/types';

const siteLabel = document.getElementById('site-label')!;
const activeView = document.getElementById('active-view')!;
const inactiveView = document.getElementById('inactive-view')!;
const statusDot = document.getElementById('status-dot')!;
const statusText = document.getElementById('status-text')!;
const pendingCount = document.getElementById('pending-count')!;
const togglePauseBtn = document.getElementById('toggle-pause-btn')!;
const togglePanelBtn = document.getElementById('toggle-panel-btn')!;
const quickForm = document.getElementById('quick-add-form') as HTMLFormElement;
const quickInput = document.getElementById('quick-input') as HTMLTextAreaElement;
const enableCustomBtn = document.getElementById('enable-custom-btn') as HTMLButtonElement;
const injectError = document.getElementById('inject-error')!;

let currentTabId: number | null = null;
let currentPanelOpen = false;
let currentPaused = false;

function openOptions(): void {
  void chrome.runtime.openOptionsPage();
}

document.getElementById('open-options')?.addEventListener('click', openOptions);
document.getElementById('footer-options')?.addEventListener('click', openOptions);

function describeStatus(snapshot: EngineSnapshot): string {
  switch (snapshot.status) {
    case 'idle':
      return snapshot.aiBusy ? 'AI generating' : 'Ready';
    case 'waiting_ai':
      return 'Waiting for AI…';
    case 'cooldown':
      return `Sending in ${(snapshot.cooldownRemainingMs / 1000).toFixed(1)}s`;
    case 'dispatching':
      return 'Dispatching…';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Error';
  }
}

function renderActive(snapshot: EngineSnapshot, panelOpen: boolean): void {
  activeView.hidden = false;
  inactiveView.hidden = true;
  currentPanelOpen = panelOpen;
  currentPaused = snapshot.paused;

  siteLabel.textContent = snapshot.siteName;
  statusText.textContent = describeStatus(snapshot);
  pendingCount.textContent = `${snapshot.pendingCount} queued`;

  statusDot.className = 'dot';
  if (snapshot.status === 'paused') {
    statusDot.classList.add('paused');
  } else if (snapshot.status === 'error') {
    statusDot.classList.add('error');
  } else if (snapshot.status !== 'idle' || snapshot.aiBusy) {
    statusDot.classList.add('active');
  }

  togglePauseBtn.textContent = currentPaused ? 'Resume' : 'Pause';
  togglePanelBtn.textContent = currentPanelOpen ? 'Hide Panel' : 'Show Panel';
}

async function refresh(): Promise<void> {
  const tab = await queryActiveTab();
  if (!tab?.id) {
    activeView.hidden = true;
    inactiveView.hidden = false;
    siteLabel.textContent = 'No active tab';
    return;
  }

  currentTabId = tab.id;
  const status = await getTabStatus(tab.id);
  if (status.active && status.snapshot) {
    renderActive(status.snapshot, Boolean(status.panelOpen));
  } else {
    activeView.hidden = true;
    inactiveView.hidden = false;
    try {
      siteLabel.textContent = tab.url ? new URL(tab.url).hostname : 'Unsupported page';
    } catch {
      siteLabel.textContent = 'Unsupported page';
    }
  }
}

togglePauseBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  void sendToTab(currentTabId, { type: 'TOGGLE_PAUSE' }).then(() => refresh());
});

togglePanelBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  void sendToTab(currentTabId, {
    type: 'TOGGLE_PANEL',
    open: !currentPanelOpen,
  }).then(() => refresh());
});

quickForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentTabId) return;
  const text = quickInput.value.trim();
  if (!text) return;
  void sendToTab(currentTabId, {
    type: 'ADD_PROMPT',
    text,
    splitBatch: true,
  }).then(() => {
    quickInput.value = '';
    void refresh();
  });
});

enableCustomBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  injectError.hidden = true;
  enableCustomBtn.disabled = true;
  enableCustomBtn.textContent = 'Enabling…';

  chrome.runtime.sendMessage(
    { type: 'INJECT_CUSTOM_SITE', tabId: currentTabId },
    (res?: { ok: boolean; error?: string }) => {
      enableCustomBtn.disabled = false;
      enableCustomBtn.textContent = 'Enable on this tab';
      if (chrome.runtime.lastError || !res?.ok) {
        injectError.hidden = false;
        injectError.textContent =
          res?.error ??
          chrome.runtime.lastError?.message ??
          'Unable to inject on this page (restricted browser page).';
        return;
      }
      setTimeout(() => {
        void sendToTab(currentTabId!, { type: 'TOGGLE_PANEL', open: true }).then(() =>
          refresh(),
        );
      }, 150);
    },
  );
});

void refresh();
