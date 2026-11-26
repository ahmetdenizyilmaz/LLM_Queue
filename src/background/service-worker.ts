import { queryActiveTab, sendToTab } from '../shared/messaging';
import { getSettings } from '../shared/storage';
import type { BackgroundMessage, EngineStatus } from '../shared/types';

function badgeColorForStatus(status: EngineStatus): string {
  switch (status) {
    case 'paused':
      return '#F59E0B';
    case 'error':
      return '#EF4444';
    default:
      return '#6366F1';
  }
}

async function updateTabBadge(
  tabId: number | undefined,
  count: number,
  status: EngineStatus,
): Promise<void> {
  if (tabId === undefined) return;
  try {
    await chrome.action.setBadgeText({
      tabId,
      text: count > 0 ? String(count) : '',
    });
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: badgeColorForStatus(status),
      });
    }
  } catch {
    // Tab may have been closed before badge update completed.
  }
}

async function maybeShowCompletionNotification(
  siteName: string,
  sentCount: number,
): Promise<void> {
  const settings = await getSettings();
  if (!settings.notifyOnComplete) return;
  if (!chrome.notifications) return;

  const granted = await chrome.permissions.contains({
    permissions: ['notifications'],
  });
  if (!granted) return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'LLM Queue Complete',
    message: `Finished sending ${sentCount} prompt(s) on ${siteName}.`,
  });
}

async function injectCustomSiteScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      (window as unknown as { __LLM_QUEUE_FORCE_GENERIC__?: boolean }).__LLM_QUEUE_FORCE_GENERIC__ = true;
    },
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js'],
  });
}

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, sender, sendResponse) => {
    switch (message.type) {
      case 'BADGE_UPDATE': {
        void updateTabBadge(sender.tab?.id, message.count, message.status);
        return false;
      }
      case 'QUEUE_COMPLETED': {
        void maybeShowCompletionNotification(message.siteName, message.sentCount);
        return false;
      }
      case 'OPEN_OPTIONS': {
        void chrome.runtime.openOptionsPage();
        return false;
      }
      case 'INJECT_CUSTOM_SITE': {
        void injectCustomSiteScript(message.tabId)
          .then(() => sendResponse({ ok: true }))
          .catch((err) =>
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : 'Injection failed',
            }),
          );
        return true;
      }
    }
    return false;
  },
);

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    const tab = await queryActiveTab();
    if (!tab?.id) return;
    if (command === 'toggle-panel') {
      await sendToTab(tab.id, { type: 'TOGGLE_PANEL' });
    } else if (command === 'toggle-pause') {
      await sendToTab(tab.id, { type: 'TOGGLE_PAUSE' });
    }
  })();
});
