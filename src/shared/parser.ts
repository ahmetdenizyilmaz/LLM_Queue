/**
 * Generate a collision-safe unique identifier.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Split raw composer text into one or more trimmed prompts using a standalone
 * delimiter line (defaults to `---`). Empty segments are dropped.
 */
export function parsePrompts(raw: string, delimiter = '---'): string[] {
  const normalized = raw.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const effectiveDelimiter = delimiter.trim();
  if (!effectiveDelimiter) {
    return [normalized];
  }

  const escaped = effectiveDelimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const splitRegex = new RegExp(`^\\s*${escaped}\\s*$`, 'm');

  if (!splitRegex.test(normalized)) {
    return [normalized];
  }

  return normalized
    .split(splitRegex)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Build a stable conversation storage key from a URL string.
 */
export function getConversationKey(urlStr: string, scopePerConversation = true): string {
  try {
    const url = new URL(urlStr);
    if (!scopePerConversation) {
      return `${url.origin}::global`;
    }
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${cleanPath}`;
  } catch {
    return 'default::global';
  }
}

const NEW_CHAT_PATHS = new Set([
  '/',
  '/new',
  '/app',
  '/chat',
  '/c/new',
  '/i/grok',
  '/chats/new',
]);

/**
 * Detect whether a URL points to a fresh/landing chat route prior to thread creation.
 */
export function isNewChatPath(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    return NEW_CHAT_PATHS.has(cleanPath);
  } catch {
    return false;
  }
}
