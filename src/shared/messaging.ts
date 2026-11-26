import type { BackgroundMessage, ContentMessage, TabStatusResponse } from './types';

export async function sendToBackground(message: BackgroundMessage): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return;
  }
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Service worker may be waking up or unavailable; ignore transient errors.
  }
}

export async function sendToTab<T = unknown>(
  tabId: number,
  message: ContentMessage,
): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
    return null;
  }
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    return null;
  }
}

export async function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return null;
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

export async function getTabStatus(tabId: number): Promise<TabStatusResponse> {
  const res = await sendToTab<TabStatusResponse>(tabId, { type: 'GET_STATUS' });
  if (!res) {
    return { active: false };
  }
  return res;
}
