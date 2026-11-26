# Chrome Web Store Publishing Guide

## 1. Build the Release Zip
```bash
npm run typecheck
npm test
npm run package
```
Upload `release/llm-queue-v1.0.1.zip` in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## 2. Store Listing Copy

- **Name:** LLM Queue
- **Category:** Productivity
- **Short Description (<= 132 chars):**
  Queue and auto-send follow-up prompts sequentially in web-based AI chat interfaces.

- **Detailed Description:**
  Stop waiting around for long AI responses just to paste your next follow-up prompt.

  LLM Queue adds a clean, unobtrusive prompt queue right inside popular web-based AI chat assistants and self-hosted chat interfaces. Write your full sequence of follow-up questions ahead of time, press Enter while the assistant is still streaming, or paste a multi-step workflow separated by `---`. LLM Queue watches the page and dispatches each prompt automatically as soon as the previous reply finishes.

  KEY FEATURES:
  • Auto-Queue on Enter: Keep typing while the assistant is generating—press Enter to add your next prompt to the queue instead of interrupting or losing momentum.
  • Smart Cooldown Dispatch: Watches the page for active generation indicators and waits through a configurable cooldown (default 1.5s) before sending the next prompt.
  • Batch Paste Splitting: Separate multiple prompts with `---` on its own line to enqueue an entire multi-step workflow in one paste.
  • Full Queue Control: Drag-and-drop reordering, inline editing, Pause/Resume, Step 1 mode, Send Now, and collapsible sent history.
  • Reusable Prompt Chains: Save and load your favorite multi-step workflows, with JSON export and import.
  • Custom Site Support: Add CSS selector rules in Settings or click "Enable on this tab" from the toolbar popup for self-hosted and custom web chat interfaces.
  • 100% Local & Open Source: All data stays locally in your browser. Zero tracking, zero telemetry, and zero external servers.

---

## 3. Permission Justifications (for Chrome Web Store Review)

- **`storage`**: Stores user settings, queued prompts, reusable prompt presets, and custom site CSS selector rules locally via `chrome.storage.local`.
- **`activeTab`**: Reads the active tab's URL/ID only when the user opens the toolbar popup or triggers an extension keyboard shortcut.
- **`scripting`**: Injects the content script on demand only when the user explicitly clicks "Enable on this tab" in the popup for a custom or self-hosted AI chat website.
- **`notifications` (optional)**: Requested at runtime only if the user enables desktop completion alerts in Settings.
- **Host permissions (`content_scripts.matches`)**: Required to render the isolated queue overlay, detect when an AI chat response finishes streaming, and insert or submit the next queued prompt into the chat input on supported AI chat websites.

---

## 4. Privacy Practices Tab

- **Single purpose:** Productivity tool for queuing and sequentially submitting prompts in LLM web chat interfaces.
- **Data collection:** None. Check "No, I am not collecting user data."
- **Privacy policy URL:** Link to `PRIVACY.md` in the GitHub repository (`https://github.com/ahmetdenizyilmaz/LLM_Queue/blob/main/PRIVACY.md`).
