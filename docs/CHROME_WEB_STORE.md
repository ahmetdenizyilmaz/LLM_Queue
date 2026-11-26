# Chrome Web Store Publishing Guide

## 1. Build the Release Zip
```bash
npm run typecheck
npm test
npm run package
```
Upload `release/llm-queue-v1.0.0.zip` in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## 2. Store Listing Copy

- **Name:** LLM Queue
- **Category:** Productivity
- **Short Description (<= 132 chars):**
  Queue and auto-send follow-up prompts across ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok, and more AI chats.

- **Detailed Description:**
  Stop waiting around for long AI responses just to send your next follow-up prompt.

  LLM Queue adds a clean, unobtrusive prompt queue right inside ChatGPT, Claude, Google Gemini, Perplexity, DeepSeek, Grok, Mistral Le Chat, Poe, Qwen, Kimi, HuggingChat, Microsoft Copilot, OpenRouter, and custom self-hosted AI web apps.

  KEY FEATURES:
  • Auto-Queue on Enter: Keep typing while the AI is generating—press Enter to add your next prompt to the queue instead of interrupting or losing momentum.
  • Smart Cooldown Dispatch: Watches the page for streaming/Stop indicators and waits for a configurable cooldown (default 1.5s) before sending the next prompt.
  • Batch Paste Splitting: Separate multiple prompts with `---` on its own line to enqueue an entire multi-step workflow in one paste.
  • Full Queue Control: Drag-and-drop reordering, inline editing, Pause/Resume, Step 1 mode, Send Now, and collapsible sent history.
  • Reusable Prompt Chains: Save and load your favorite multi-step workflows, with JSON export/import.
  • Custom Site Support: Add CSS selector rules in Settings or click "Enable on this tab" from the toolbar popup for Open WebUI, LibreChat, and other self-hosted interfaces.
  • 100% Local & Open Source: All data stays locally in your browser. Zero tracking, zero telemetry, zero external servers.

---

## 3. Permission Justifications (for Chrome Web Store Review)

- **`storage`**: Stores user settings, queued prompts, reusable prompt presets, and custom site CSS selector rules locally via `chrome.storage.local`.
- **`activeTab`**: Reads the active tab's URL/ID only when the user opens the toolbar popup or triggers an extension keyboard shortcut.
- **`scripting`**: Injects the content script on demand only when the user explicitly clicks "Enable on this tab" in the popup for a custom/self-hosted AI chat website.
- **`notifications` (optional)**: Requested at runtime only if the user enables desktop completion alerts in Settings.
- **Host permissions (`content_scripts.matches`)**: Required to render the queue overlay and interact with the chat composer on supported LLM chat websites.

---

## 4. Privacy Practices Tab

- **Single purpose:** Productivity tool for queuing and sequentially submitting prompts in LLM web chat interfaces.
- **Data collection:** None. Check "No, I am not collecting user data."
- **Privacy policy URL:** Link to `PRIVACY.md` in the GitHub repository (`https://github.com/ahmetdenizyilmaz/LLM_Queue/blob/main/PRIVACY.md`).
