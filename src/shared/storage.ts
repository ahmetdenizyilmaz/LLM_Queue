import { DEFAULT_PRESETS, DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import type {
  CustomSiteRule,
  ExtensionSettings,
  PromptPreset,
  QueueItem,
  UiState,
} from './types';

interface StoredQueueRecord {
  items: QueueItem[];
  updatedAt: number;
}

type QueueMap = Record<string, StoredQueueRecord>;

const memoryStore = new Map<string, unknown>();
let queueWriteChain: Promise<unknown> = Promise.resolve();

function serializeQueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = queueWriteChain.then(task, task);
  queueWriteChain = next.catch(() => undefined);
  return next;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

async function readStorage<T>(key: string, fallback: T): Promise<T> {
  if (!hasChromeStorage()) {
    return memoryStore.has(key) ? (memoryStore.get(key) as T) : fallback;
  }
  try {
    const result = await chrome.storage.local.get(key);
    return key in result ? (result[key] as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeStorage<T>(key: string, value: T): Promise<void> {
  if (!hasChromeStorage()) {
    memoryStore.set(key, value);
    return;
  }
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await readStorage<Partial<ExtensionSettings>>(STORAGE_KEYS.SETTINGS, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    disabledSites: Array.isArray(stored.disabledSites)
      ? stored.disabledSites
      : DEFAULT_SETTINGS.disabledSites,
  };
}

export async function saveSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next: ExtensionSettings = { ...current, ...patch };
  await writeStorage(STORAGE_KEYS.SETTINGS, next);
  return next;
}

export async function getQueue(conversationKey: string): Promise<QueueItem[]> {
  const map = await readStorage<QueueMap>(STORAGE_KEYS.QUEUES, {});
  const entry = map[conversationKey];
  if (!entry || !Array.isArray(entry.items)) {
    return [];
  }
  return entry.items.map((item) =>
    item.status === 'sending' ? { ...item, status: 'pending' } : item,
  );
}

export function saveQueue(conversationKey: string, items: QueueItem[]): Promise<void> {
  return serializeQueueWrite(async () => {
    const map = await readStorage<QueueMap>(STORAGE_KEYS.QUEUES, {});
    if (items.length === 0) {
      delete map[conversationKey];
    } else {
      map[conversationKey] = {
        items,
        updatedAt: Date.now(),
      };
    }
    await writeStorage(STORAGE_KEYS.QUEUES, pruneQueueMap(map, 40));
  });
}

export function migrateQueue(
  oldKey: string,
  newKey: string,
  inMemoryItems?: QueueItem[],
): Promise<QueueItem[]> {
  return serializeQueueWrite(async () => {
    if (oldKey === newKey) {
      return getQueue(newKey);
    }
    const map = await readStorage<QueueMap>(STORAGE_KEYS.QUEUES, {});
    const oldItems = map[oldKey]?.items ?? [];
    const existingNew = map[newKey]?.items ?? [];
    const liveItems =
      inMemoryItems && inMemoryItems.length > 0 ? inMemoryItems : oldItems;
    const merged = existingNew.length > 0 ? existingNew : liveItems;
    if (oldKey in map) {
      delete map[oldKey];
    }
    if (merged.length > 0) {
      map[newKey] = { items: merged, updatedAt: Date.now() };
    }
    await writeStorage(STORAGE_KEYS.QUEUES, pruneQueueMap(map, 40));
    return merged;
  });
}

function pruneQueueMap(map: QueueMap, maxKeys: number): QueueMap {
  const entries = Object.entries(map);
  if (entries.length <= maxKeys) {
    return map;
  }
  entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  return Object.fromEntries(entries.slice(0, maxKeys));
}

export function pruneOldQueues(maxKeys = 40): Promise<void> {
  return serializeQueueWrite(async () => {
    const map = await readStorage<QueueMap>(STORAGE_KEYS.QUEUES, {});
    await writeStorage(STORAGE_KEYS.QUEUES, pruneQueueMap(map, maxKeys));
  });
}

export async function getPresets(): Promise<PromptPreset[]> {
  const stored = await readStorage<PromptPreset[] | null>(STORAGE_KEYS.PRESETS, null);
  if (!stored || !Array.isArray(stored)) {
    return DEFAULT_PRESETS;
  }
  return stored;
}

export async function savePresets(presets: PromptPreset[]): Promise<void> {
  await writeStorage(STORAGE_KEYS.PRESETS, presets);
}

export async function getCustomRules(): Promise<CustomSiteRule[]> {
  const stored = await readStorage<CustomSiteRule[]>(STORAGE_KEYS.CUSTOM_RULES, []);
  return Array.isArray(stored) ? stored : [];
}

export async function saveCustomRules(rules: CustomSiteRule[]): Promise<void> {
  await writeStorage(STORAGE_KEYS.CUSTOM_RULES, rules);
}

export async function getUiState(): Promise<UiState> {
  const stored = await readStorage<UiState>(STORAGE_KEYS.UI_STATE, {
    panelOpen: false,
    pillPosition: null,
  });
  return {
    panelOpen: Boolean(stored.panelOpen),
    pillPosition: stored.pillPosition ?? null,
  };
}

export async function saveUiState(patch: Partial<UiState>): Promise<UiState> {
  const current = await getUiState();
  const next: UiState = { ...current, ...patch };
  await writeStorage(STORAGE_KEYS.UI_STATE, next);
  return next;
}

export interface ExportedBackup {
  version: 1;
  exportedAt: number;
  settings: ExtensionSettings;
  presets: PromptPreset[];
  customRules: CustomSiteRule[];
}

export async function exportAllData(): Promise<ExportedBackup> {
  const [settings, presets, customRules] = await Promise.all([
    getSettings(),
    getPresets(),
    getCustomRules(),
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    settings,
    presets,
    customRules,
  };
}

export async function importAllData(raw: unknown): Promise<void> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid backup payload.');
  }
  const data = raw as Partial<ExportedBackup>;
  if (data.settings && typeof data.settings === 'object') {
    await saveSettings(data.settings);
  }
  if (Array.isArray(data.presets)) {
    await savePresets(data.presets);
  }
  if (Array.isArray(data.customRules)) {
    await saveCustomRules(data.customRules);
  }
}
