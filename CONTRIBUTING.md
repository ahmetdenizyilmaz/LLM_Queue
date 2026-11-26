# Contributing to LLM Queue

Thank you for helping improve **LLM Queue**!

## Project Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

Load the `dist/` directory via `chrome://extensions` → **Load unpacked** to test locally.

## Adding or Updating a Site Adapter

Site adapters live declaratively in [`src/adapters/sites.ts`](src/adapters/sites.ts) and host match patterns live in [`src/manifest.json`](src/manifest.json).

1. Add or update the entry in `SITE_CONFIGS` inside `src/adapters/sites.ts`:
   - `id`: unique lowercase slug
   - `name`: display name shown in the UI
   - `accentColor`: hex brand color
   - `hostPatterns`: domain(s) matched by the adapter
   - `inputSelectors`: prioritized list of CSS selectors for the chat input (`textarea` or `contenteditable`)
   - `sendButtonSelectors`: prioritized list of CSS selectors for the submit button
   - `stopButtonSelectors`: prioritized list of CSS selectors visible only while the AI is generating
2. Add the corresponding match pattern(s) to `content_scripts[0].matches` in `src/manifest.json`.
3. Add a unit test in `tests/adapters.test.ts` verifying URL resolution and DOM interaction.
4. Run `npm run typecheck && npm test && npm run build`.

## Code Style

- Keep UI rendering strictly safe against XSS: always use `textContent` / DOM APIs instead of `innerHTML` for user-provided text.
- Keep everything 100% local with zero external network requests.
