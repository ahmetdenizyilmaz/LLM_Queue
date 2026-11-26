export type QueueItemStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface QueueItem {
  id: string;
  text: string;
  createdAt: number;
  status: QueueItemStatus;
  sentAt?: number;
  error?: string;
}

export type EngineStatus =
  | 'idle'
  | 'waiting_ai'
  | 'cooldown'
  | 'dispatching'
  | 'paused'
  | 'error';

export interface EngineSnapshot {
  status: EngineStatus;
  items: QueueItem[];
  pendingCount: number;
  sentCount: number;
  aiBusy: boolean;
  cooldownRemainingMs: number;
  paused: boolean;
  stepMode: boolean;
  lastError: string | null;
  siteId: string;
  siteName: string;
  conversationKey: string;
}

export type ThemeMode = 'auto' | 'dark' | 'light';
export type DockPosition = 'bottom-right' | 'bottom-left' | 'top-right';

export interface ExtensionSettings {
  enabled: boolean;
  autoQueueOnEnterWhileBusy: boolean;
  cooldownMs: number;
  scopePerConversation: boolean;
  theme: ThemeMode;
  dockPosition: DockPosition;
  soundOnComplete: boolean;
  notifyOnComplete: boolean;
  disabledSites: string[];
  batchDelimiter: string;
}

export interface PromptPreset {
  id: string;
  name: string;
  prompts: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CustomSiteRule {
  id: string;
  name: string;
  hostPattern: string;
  inputSelector: string;
  sendButtonSelector: string;
  stopButtonSelector: string;
  enabled: boolean;
}

export interface UiState {
  panelOpen: boolean;
  pillPosition?: { x: number; y: number } | null;
}

export interface TabStatusResponse {
  active: boolean;
  snapshot?: EngineSnapshot;
  panelOpen?: boolean;
}

export type ContentMessage =
  | { type: 'GET_STATUS' }
  | { type: 'TOGGLE_PANEL'; open?: boolean }
  | { type: 'TOGGLE_PAUSE'; paused?: boolean }
  | { type: 'ADD_PROMPT'; text: string; splitBatch?: boolean }
  | { type: 'SETTINGS_UPDATED' };

export type BackgroundMessage =
  | {
      type: 'BADGE_UPDATE';
      count: number;
      status: EngineStatus;
    }
  | {
      type: 'QUEUE_COMPLETED';
      siteName: string;
      sentCount: number;
    }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'INJECT_CUSTOM_SITE'; tabId: number };
