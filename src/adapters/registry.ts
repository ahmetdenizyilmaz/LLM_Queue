import type { CustomSiteRule } from '../shared/types';
import {
  clearComposerText,
  queryFirstVisible,
  readComposerText,
  setComposerText,
  triggerSubmit,
} from './dom-utils';
import { SITE_CONFIGS } from './sites';
import type { SiteAdapter, SiteConfig } from './types';

const GENERIC_CONFIG: SiteConfig = {
  id: 'custom-generic',
  name: 'Custom LLM Chat',
  accentColor: '#6366F1',
  hostPatterns: ['*'],
  isCustom: true,
  inputSelectors: [
    '#prompt-textarea',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="ask" i]',
    'textarea[placeholder*="prompt" i]',
    'div[contenteditable="true"][role="textbox"]',
    'div.ProseMirror[contenteditable="true"]',
    'textarea',
    'div[contenteditable="true"]',
  ],
  sendButtonSelectors: [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]',
    'form button[type="submit"]',
  ],
  stopButtonSelectors: [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop generating" i]',
    'button[aria-label*="Stop responding" i]',
    'button[aria-label*="Stop" i]',
  ],
};

function matchesHost(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const pat = pattern.trim().toLowerCase();
  if (!pat) return false;
  if (pat === '*') return true;
  if (pat.startsWith('*.')) {
    const suffix = pat.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === pat;
}

function matchesConfig(url: URL, config: SiteConfig): boolean {
  const hostOk = config.hostPatterns.some((pattern) => matchesHost(url.hostname, pattern));
  if (!hostOk) return false;

  if (config.pathPrefixes && config.pathPrefixes.length > 0) {
    // Only restrict x.com to /i/grok while allowing grok.com on all paths
    if (url.hostname.toLowerCase() === 'x.com') {
      return url.pathname.startsWith('/i/grok');
    }
    return config.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
  }
  return true;
}

function splitSelectors(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Create a resilient SiteAdapter instance from a declarative SiteConfig.
 */
export function createAdapterFromConfig(config: SiteConfig): SiteAdapter {
  const fallbackStopSelectors = [
    ...config.stopButtonSelectors,
    'button[aria-label*="Stop generating" i]',
    'button[aria-label*="Stop response" i]',
  ];

  const getInput = () => queryFirstVisible(config.inputSelectors);
  const getSendButton = () => queryFirstVisible(config.sendButtonSelectors);
  const getStopButton = () => queryFirstVisible(fallbackStopSelectors);

  const isBusy = () => {
    if (getStopButton() !== null) {
      return true;
    }
    if (config.busySelectors && config.busySelectors.length > 0) {
      return queryFirstVisible(config.busySelectors) !== null;
    }
    return false;
  };

  return {
    id: config.id,
    name: config.name,
    accentColor: config.accentColor,
    isCustom: config.isCustom,
    getInput,
    getSendButton,
    getStopButton,
    isBusy,
    isReadyToSend() {
      if (isBusy()) return false;
      return getInput() !== null;
    },
    readInputText() {
      const input = getInput();
      return input ? readComposerText(input) : '';
    },
    clearInput() {
      const input = getInput();
      if (input) {
        clearComposerText(input);
      }
    },
    async submitPrompt(text: string) {
      const input = getInput();
      if (!input) {
        return {
          ok: false,
          retryable: true,
          error: `Could not find ${config.name} chat input box.`,
        };
      }
      if (isBusy()) {
        return {
          ok: false,
          retryable: true,
          error: `${config.name} is still generating a response.`,
        };
      }

      const wrote = setComposerText(input, text);
      if (!wrote) {
        return {
          ok: false,
          retryable: true,
          error: `Unable to insert prompt into ${config.name} composer.`,
        };
      }

      const submitted = await triggerSubmit(input, getSendButton, {
        verifySubmitted: () =>
          !input.isConnected ||
          isBusy() ||
          readComposerText(input).trim().length === 0,
      });

      if (!submitted) {
        if (
          input.isConnected &&
          !isBusy() &&
          readComposerText(input).trim() === text.trim()
        ) {
          clearComposerText(input);
        }
        return {
          ok: false,
          retryable: true,
          error: `${config.name} did not accept the prompt yet.`,
        };
      }
      return { ok: true };
    },
  };
}

/**
 * Resolve the best SiteAdapter for a URL, checking user custom rules first,
 * then built-in site configs, and optionally falling back to a generic heuristic adapter.
 */
export function resolveAdapter(
  url: URL,
  customRules: CustomSiteRule[] = [],
  allowGenericFallback = false,
): SiteAdapter | null {
  for (const rule of customRules) {
    if (!rule.enabled) continue;
    if (!matchesHost(url.hostname, rule.hostPattern)) continue;
    const customConfig: SiteConfig = {
      id: `custom-${rule.id}`,
      name: rule.name || url.hostname,
      accentColor: '#6366F1',
      hostPatterns: [rule.hostPattern],
      inputSelectors: splitSelectors(rule.inputSelector),
      sendButtonSelectors: splitSelectors(rule.sendButtonSelector),
      stopButtonSelectors: splitSelectors(rule.stopButtonSelector),
      isCustom: true,
    };
    return createAdapterFromConfig(customConfig);
  }

  for (const site of SITE_CONFIGS) {
    if (matchesConfig(url, site)) {
      return createAdapterFromConfig(site);
    }
  }

  if (allowGenericFallback) {
    return createAdapterFromConfig({
      ...GENERIC_CONFIG,
      name: url.hostname,
    });
  }

  return null;
}

export const BUILT_IN_SITES = SITE_CONFIGS.map((site) => ({
  id: site.id,
  name: site.name,
  accentColor: site.accentColor,
  hosts: site.hostPatterns.join(', '),
}));
