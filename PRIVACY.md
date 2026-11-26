# Privacy Policy for LLM Queue

**Effective Date:** 2026-11-26  
**Repository:** https://github.com/ahmetdenizyilmaz/LLM_Queue

LLM Queue is designed with privacy as a core principle.

## 1. Data Collection & Transmission
LLM Queue **does not collect, transmit, sell, or share** any personal data, conversation content, prompts, browsing history, or telemetry. There are no remote servers, analytics SDKs, or external API calls made by this extension.

## 2. Local Storage
All extension data — including your queued prompts, prompt presets, custom site selector rules, and preferences — is stored exclusively on your device using the browser's `chrome.storage.local` API. You can inspect, export, or delete this data at any time from the extension's Settings page or by uninstalling the extension.

## 3. Permissions Used
- **`storage`**: Saves your prompt queues, reusable presets, custom site rules, and preferences locally.
- **`activeTab` & `scripting`**: Only used when you explicitly click **"Enable on this tab"** in the extension popup to attach LLM Queue to a self-hosted or custom AI chat page.
- **`notifications` (optional)**: Only requested if you enable desktop notifications when a queue completes.

## 4. Open Source Verification
The full source code is publicly auditable at https://github.com/ahmetdenizyilmaz/LLM_Queue.

## 5. Contact
For privacy questions or issues, please open an issue on the [GitHub repository](https://github.com/ahmetdenizyilmaz/LLM_Queue/issues).
