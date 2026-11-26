import { resolveAdapter } from '../adapters/registry';
import { QueueEngine } from '../engine/queue-engine';
import { STORAGE_KEYS } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';
import { getConversationKey, isNewChatPath } from '../shared/parser';
import {
  getCustomRules,
  getPresets,
  getQueue,
  getSettings,
  getUiState,
  migrateQueue,
  savePresets,
  saveQueue,
  saveUiState,
} from '../shared/storage';
import type { ContentMessage, TabStatusResponse } from '../shared/types';
import { ComposerInterceptor } from './interceptor';
import { OverlayUI } from './overlay';

declare global {
  interface Window {
    __LLM_QUEUE_INITIALIZED__?: boolean;
    __LLM_QUEUE_FORCE_GENERIC__?: boolean;
  }
}

async function bootstrap(): Promise<void> {
  if (window.__LLM_QUEUE_INITIALIZED__) {
    return;
  }

  const [settings, customRules, presets, uiState] = await Promise.all([
    getSettings(),
    getCustomRules(),
    getPresets(),
    getUiState(),
  ]);

  if (!settings.enabled) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  const adapter = resolveAdapter(
    currentUrl,
    customRules,
    Boolean(window.__LLM_QUEUE_FORCE_GENERIC__),
  );

  if (!adapter || settings.disabledSites.includes(adapter.id)) {
    return;
  }

  window.__LLM_QUEUE_INITIALIZED__ = true;

  let conversationKey = getConversationKey(
    window.location.href,
    settings.scopePerConversation,
  );
  let lastHref = window.location.href;
  let lastWasNewChat = isNewChatPath(lastHref);

  const initialItems = await getQueue(conversationKey);

  let overlay: OverlayUI | null = null;
  let interceptor: ComposerInterceptor | null = null;

  const engine = new QueueEngine({
    adapter,
    settings,
    conversationKey,
    initialItems,
    persistItems: (key, items) => saveQueue(key, items),
    onChange: (snapshot) => {
      overlay?.updateSnapshot(snapshot);
      void sendToBackground({
        type: 'BADGE_UPDATE',
        count: snapshot.pendingCount,
        status: snapshot.status,
      });
    },
    onQueueComplete: (sentCount) => {
      overlay?.playCompletionChime();
      overlay?.showToast(`All ${sentCount} prompt(s) sent`);
      void sendToBackground({
        type: 'QUEUE_COMPLETED',
        siteName: adapter.name,
        sentCount,
      });
    },
  });

  overlay = new OverlayUI({
    adapter,
    engine,
    settings,
    presets,
    initialOpen: uiState.panelOpen,
    initialPosition: uiState.pillPosition ?? null,
    onUiStateChange: (panelOpen, pillPosition) => {
      void saveUiState({ panelOpen, pillPosition });
    },
    onSavePresets: (updatedPresets) => savePresets(updatedPresets),
  });

  interceptor = new ComposerInterceptor(adapter, engine, settings, {
    onQueued: (_text, reason, count) => {
      if (reason === 'busy') {
        overlay?.showToast(`AI is generating — queued (#${count})`);
      } else {
        overlay?.showToast(`Queued (#${count})`);
      }
    },
  });

  // Handle SPA route transitions (e.g. ChatGPT/Claude creating /c/<id> after first prompt)
  const checkNavigation = async () => {
    const nextHref = window.location.href;
    if (nextHref === lastHref) return;

    const currentSettings = await getSettings();
    const nextKey = getConversationKey(nextHref, currentSettings.scopePerConversation);
    const prevHref = lastHref;
    lastHref = nextHref;

    if (nextKey === conversationKey) {
      lastWasNewChat = isNewChatPath(nextHref);
      return;
    }

    const liveSnapshot = engine.getSnapshot();
    const dispatchedRecently = Date.now() - engine.getLastDispatchedAt() < 15000;
    const shouldCarryQueue =
      lastWasNewChat &&
      !isNewChatPath(nextHref) &&
      (dispatchedRecently || liveSnapshot.pendingCount > 0);

    const oldKey = conversationKey;
    conversationKey = nextKey;
    lastWasNewChat = isNewChatPath(nextHref);

    if (shouldCarryQueue && prevHref !== nextHref) {
      const migrated = await migrateQueue(oldKey, nextKey, liveSnapshot.items);
      engine.setConversation(nextKey, migrated);
    } else {
      const nextItems = await getQueue(nextKey);
      engine.setConversation(nextKey, nextItems);
    }
  };

  window.addEventListener('popstate', () => {
    void checkNavigation();
  });
  const navTimer = setInterval(() => {
    void checkNavigation();
  }, 900);

  // Sync settings/presets when changed in Options page
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!(STORAGE_KEYS.SETTINGS in changes) && !(STORAGE_KEYS.PRESETS in changes)) {
        return;
      }
      void (async () => {
        const [nextSettings, nextPresets] = await Promise.all([
          getSettings(),
          getPresets(),
        ]);
        engine.updateSettings(nextSettings);
        interceptor?.updateSettings(nextSettings);
        overlay?.updateSettings(nextSettings, nextPresets);
        if (!nextSettings.enabled || nextSettings.disabledSites.includes(adapter.id)) {
          clearInterval(navTimer);
          interceptor?.destroy();
          engine.destroy();
          overlay?.destroy();
          window.__LLM_QUEUE_INITIALIZED__ = false;
        } else {
          const nextKey = getConversationKey(
            window.location.href,
            nextSettings.scopePerConversation,
          );
          if (nextKey !== conversationKey) {
            conversationKey = nextKey;
            const items = await getQueue(nextKey);
            engine.setConversation(nextKey, items);
          }
        }
      })();
    });
  }

  // Handle popup & keyboard command messages
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(
      (message: ContentMessage, _sender, sendResponse) => {
        switch (message.type) {
          case 'GET_STATUS': {
            const response: TabStatusResponse = {
              active: true,
              snapshot: engine.getSnapshot(),
              panelOpen: overlay?.getIsOpen() ?? false,
            };
            sendResponse(response);
            return false;
          }
          case 'TOGGLE_PANEL': {
            const open =
              typeof message.open === 'boolean'
                ? (overlay?.setOpen(message.open), message.open)
                : overlay?.toggleOpen() ?? false;
            sendResponse({ panelOpen: open });
            return false;
          }
          case 'TOGGLE_PAUSE': {
            const paused =
              typeof message.paused === 'boolean'
                ? (message.paused ? engine.pause() : engine.resume(), message.paused)
                : engine.togglePause();
            sendResponse({ paused });
            return false;
          }
          case 'ADD_PROMPT': {
            const created = message.splitBatch
              ? engine.enqueueBatch(message.text)
              : [engine.enqueue(message.text)].filter(Boolean);
            overlay?.showToast(`Queued ${created.length} prompt(s)`);
            sendResponse({ added: created.length, snapshot: engine.getSnapshot() });
            return false;
          }
          case 'SETTINGS_UPDATED': {
            void getSettings().then((s) => {
              engine.updateSettings(s);
              interceptor?.updateSettings(s);
              overlay?.updateSettings(s);
            });
            return false;
          }
        }
        return false;
      },
    );
  }
}

void bootstrap();
