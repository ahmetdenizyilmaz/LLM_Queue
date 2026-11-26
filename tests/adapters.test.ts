import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdapter } from '../src/adapters/registry';
import type { CustomSiteRule } from '../src/shared/types';

describe('site adapters & registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves built-in adapters for major LLM platforms', () => {
    expect(resolveAdapter(new URL('https://chatgpt.com/c/123'))?.id).toBe('chatgpt');
    expect(resolveAdapter(new URL('https://claude.ai/chat/abc'))?.id).toBe('claude');
    expect(resolveAdapter(new URL('https://gemini.google.com/app'))?.id).toBe('gemini');
    expect(resolveAdapter(new URL('https://www.perplexity.ai/'))?.id).toBe('perplexity');
    expect(resolveAdapter(new URL('https://chat.deepseek.com/'))?.id).toBe('deepseek');
    expect(resolveAdapter(new URL('https://grok.com/'))?.id).toBe('grok');
    expect(resolveAdapter(new URL('https://x.com/i/grok'))?.id).toBe('grok');
    expect(resolveAdapter(new URL('https://x.com/home'))).toBeNull();
  });

  it('prioritizes enabled custom site rules over built-in adapters', () => {
    const rules: CustomSiteRule[] = [
      {
        id: 'r1',
        name: 'My Custom ChatGPT',
        hostPattern: 'chatgpt.com',
        inputSelector: '#custom-box',
        sendButtonSelector: '#custom-send',
        stopButtonSelector: '#custom-stop',
        enabled: true,
      },
    ];
    const adapter = resolveAdapter(new URL('https://chatgpt.com/'), rules);
    expect(adapter?.id).toBe('custom-r1');
    expect(adapter?.name).toBe('My Custom ChatGPT');
  });

  it('supports generic fallback when explicitly enabled', () => {
    expect(resolveAdapter(new URL('https://my-local-llm.internal/'), [], false)).toBeNull();
    const fallback = resolveAdapter(new URL('https://my-local-llm.internal/'), [], true);
    expect(fallback?.id).toBe('custom-generic');
    expect(fallback?.name).toBe('my-local-llm.internal');
  });

  it('detects busy state and submits prompt on mocked ChatGPT DOM', async () => {
    document.body.innerHTML = `
      <form>
        <div id="prompt-textarea" contenteditable="true"></div>
        <button data-testid="send-button" type="button">Send</button>
      </form>
    `;
    const sendBtn = document.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    const onSend = vi.fn();
    sendBtn.addEventListener('click', onSend);

    const adapter = resolveAdapter(new URL('https://chatgpt.com/'))!;
    expect(adapter.isBusy()).toBe(false);
    expect(adapter.isReadyToSend()).toBe(true);

    // Add stop button -> busy
    const stopBtn = document.createElement('button');
    stopBtn.setAttribute('data-testid', 'stop-button');
    document.body.appendChild(stopBtn);
    expect(adapter.isBusy()).toBe(true);

    const blockedResult = await adapter.submitPrompt('Should fail while busy');
    expect(blockedResult.ok).toBe(false);

    // Remove stop button -> ready to send
    stopBtn.remove();
    expect(adapter.isBusy()).toBe(false);

    const okResult = await adapter.submitPrompt('Explain quantum tunneling simply.');
    expect(okResult.ok).toBe(true);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(adapter.readInputText()).toContain('Explain quantum tunneling simply.');
  });
});
