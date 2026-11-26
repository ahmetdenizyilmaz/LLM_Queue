import { BUILT_IN_SITES } from '../adapters/registry';
import { generateId, parsePrompts } from '../shared/parser';
import {
  exportAllData,
  getCustomRules,
  getPresets,
  getSettings,
  importAllData,
  saveCustomRules,
  savePresets,
  saveSettings,
} from '../shared/storage';
import type {
  CustomSiteRule,
  DockPosition,
  ExtensionSettings,
  PromptPreset,
  ThemeMode,
} from '../shared/types';

const toastEl = document.getElementById('toast')!;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2400);
}

// Navigation tabs
const navBtns = document.querySelectorAll<HTMLButtonElement>('.nav-btn');
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');
navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    navBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
    tabPanels.forEach((panel) => {
      panel.hidden = panel.id !== `tab-${target}`;
    });
  });
});

// Manifest version label
if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
  const versionLabel = document.getElementById('version-label');
  if (versionLabel) {
    versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
  }
}

let currentSettings: ExtensionSettings;
let currentPresets: PromptPreset[] = [];
let currentRules: CustomSiteRule[] = [];

// General tab bindings
const optEnabled = document.getElementById('opt-enabled') as HTMLInputElement;
const optAutoEnter = document.getElementById('opt-auto-enter') as HTMLInputElement;
const optScope = document.getElementById('opt-scope') as HTMLInputElement;
const optCooldown = document.getElementById('opt-cooldown') as HTMLInputElement;
const optCooldownVal = document.getElementById('opt-cooldown-val')!;
const optTheme = document.getElementById('opt-theme') as HTMLSelectElement;
const optDock = document.getElementById('opt-dock') as HTMLSelectElement;
const optDelimiter = document.getElementById('opt-delimiter') as HTMLInputElement;
const optSound = document.getElementById('opt-sound') as HTMLInputElement;
const optNotify = document.getElementById('opt-notify') as HTMLInputElement;

function renderGeneral(): void {
  optEnabled.checked = currentSettings.enabled;
  optAutoEnter.checked = currentSettings.autoQueueOnEnterWhileBusy;
  optScope.checked = currentSettings.scopePerConversation;
  optCooldown.value = String(currentSettings.cooldownMs);
  optCooldownVal.textContent = `${(currentSettings.cooldownMs / 1000).toFixed(2).replace(/\.?0+$/, '')}s`;
  optTheme.value = currentSettings.theme;
  optDock.value = currentSettings.dockPosition;
  optDelimiter.value = currentSettings.batchDelimiter;
  optSound.checked = currentSettings.soundOnComplete;
  optNotify.checked = currentSettings.notifyOnComplete;
}

async function patchSettings(patch: Partial<ExtensionSettings>): Promise<void> {
  currentSettings = await saveSettings(patch);
  showToast('Settings saved');
}

optEnabled.addEventListener('change', () => void patchSettings({ enabled: optEnabled.checked }));
optAutoEnter.addEventListener('change', () =>
  void patchSettings({ autoQueueOnEnterWhileBusy: optAutoEnter.checked }),
);
optScope.addEventListener('change', () =>
  void patchSettings({ scopePerConversation: optScope.checked }),
);
optCooldown.addEventListener('input', () => {
  const ms = Number(optCooldown.value);
  optCooldownVal.textContent = `${(ms / 1000).toFixed(2).replace(/\.?0+$/, '')}s`;
});
optCooldown.addEventListener('change', () =>
  void patchSettings({ cooldownMs: Number(optCooldown.value) }),
);
optTheme.addEventListener('change', () =>
  void patchSettings({ theme: optTheme.value as ThemeMode }),
);
optDock.addEventListener('change', () =>
  void patchSettings({ dockPosition: optDock.value as DockPosition }),
);
optDelimiter.addEventListener('change', () => {
  const val = optDelimiter.value.trim() || '---';
  optDelimiter.value = val;
  void patchSettings({ batchDelimiter: val });
});
optSound.addEventListener('change', () =>
  void patchSettings({ soundOnComplete: optSound.checked }),
);
optNotify.addEventListener('change', () => {
  if (!optNotify.checked) {
    void patchSettings({ notifyOnComplete: false });
    return;
  }
  if (typeof chrome !== 'undefined' && chrome.permissions?.request) {
    chrome.permissions.request({ permissions: ['notifications'] }, (granted) => {
      if (!granted) {
        optNotify.checked = false;
        showToast('Notification permission denied');
        return;
      }
      void patchSettings({ notifyOnComplete: true });
    });
  }
});

// Presets tab
const presetsList = document.getElementById('presets-list')!;
const presetForm = document.getElementById('preset-form') as HTMLFormElement;
const presetNameInput = document.getElementById('preset-name') as HTMLInputElement;
const presetPromptsInput = document.getElementById('preset-prompts') as HTMLTextAreaElement;

function renderPresets(): void {
  presetsList.replaceChildren();
  for (const preset of currentPresets) {
    const card = document.createElement('div');
    card.className = 'item-card';

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'setting-title';
    title.textContent = preset.name;

    const meta = document.createElement('div');
    meta.className = 'setting-desc';
    meta.textContent = `${preset.prompts.length} prompt(s): ${preset.prompts[0]?.slice(0, 90) ?? ''}…`;

    info.append(title, meta);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      currentPresets = currentPresets.filter((p) => p.id !== preset.id);
      void savePresets(currentPresets).then(() => {
        renderPresets();
        showToast('Preset deleted');
      });
    });

    card.append(info, delBtn);
    presetsList.appendChild(card);
  }
}

presetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = presetNameInput.value.trim();
  const prompts = parsePrompts(presetPromptsInput.value, currentSettings.batchDelimiter);
  if (!name || prompts.length === 0) return;

  const newPreset: PromptPreset = {
    id: generateId(),
    name,
    prompts,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  currentPresets = [...currentPresets, newPreset];
  void savePresets(currentPresets).then(() => {
    presetNameInput.value = '';
    presetPromptsInput.value = '';
    renderPresets();
    showToast('Preset added');
  });
});

// Export / Import
document.getElementById('export-btn')?.addEventListener('click', () => {
  void exportAllData().then((data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm-queue-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

const importInput = document.getElementById('import-input') as HTMLInputElement;
importInput.addEventListener('change', () => {
  const file = importInput.files?.[0];
  if (!file) return;
  void file.text().then(async (raw) => {
    try {
      await importAllData(JSON.parse(raw));
      await loadAll();
      showToast('Backup imported');
    } catch {
      showToast('Invalid JSON backup file');
    } finally {
      importInput.value = '';
    }
  });
});

// Sites tab
const builtinSitesList = document.getElementById('builtin-sites-list')!;
const customRulesList = document.getElementById('custom-rules-list')!;
const customRuleForm = document.getElementById('custom-rule-form') as HTMLFormElement;

function renderSites(): void {
  builtinSitesList.replaceChildren();
  for (const site of BUILT_IN_SITES) {
    const row = document.createElement('label');
    row.className = 'site-toggle';

    const meta = document.createElement('div');
    meta.className = 'site-meta';
    const dot = document.createElement('span');
    dot.className = 'site-dot';
    dot.style.background = site.accentColor;
    const label = document.createElement('span');
    label.textContent = site.name;
    meta.append(dot, label);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'toggle';
    cb.checked = !currentSettings.disabledSites.includes(site.id);
    cb.addEventListener('change', () => {
      const disabled = new Set(currentSettings.disabledSites);
      if (cb.checked) {
        disabled.delete(site.id);
      } else {
        disabled.add(site.id);
      }
      void patchSettings({ disabledSites: Array.from(disabled) });
    });

    row.append(meta, cb);
    builtinSitesList.appendChild(row);
  }
}

function renderCustomRules(): void {
  customRulesList.replaceChildren();
  for (const rule of currentRules) {
    const card = document.createElement('div');
    card.className = 'item-card';

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'setting-title';
    title.textContent = `${rule.name} (${rule.hostPattern})`;

    const meta = document.createElement('div');
    meta.className = 'setting-desc';
    meta.textContent = `Input: ${rule.inputSelector} · Send: ${rule.sendButtonSelector}`;

    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      currentRules = currentRules.filter((r) => r.id !== rule.id);
      void saveCustomRules(currentRules).then(() => {
        renderCustomRules();
        showToast('Rule removed');
      });
    });

    actions.appendChild(delBtn);
    card.append(info, actions);
    customRulesList.appendChild(card);
  }
}

customRuleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = (document.getElementById('rule-name') as HTMLInputElement).value.trim();
  const hostPattern = (document.getElementById('rule-host') as HTMLInputElement).value.trim();
  const inputSelector = (document.getElementById('rule-input') as HTMLInputElement).value.trim();
  const sendButtonSelector = (document.getElementById('rule-send') as HTMLInputElement).value.trim();
  const stopButtonSelector = (document.getElementById('rule-stop') as HTMLInputElement).value.trim();

  if (!name || !hostPattern || !inputSelector || !sendButtonSelector) return;

  const newRule: CustomSiteRule = {
    id: generateId(),
    name,
    hostPattern,
    inputSelector,
    sendButtonSelector,
    stopButtonSelector,
    enabled: true,
  };
  currentRules = [...currentRules, newRule];
  void saveCustomRules(currentRules).then(() => {
    customRuleForm.reset();
    renderCustomRules();
    showToast('Custom rule saved');
  });
});

async function loadAll(): Promise<void> {
  [currentSettings, currentPresets, currentRules] = await Promise.all([
    getSettings(),
    getPresets(),
    getCustomRules(),
  ]);
  renderGeneral();
  renderPresets();
  renderSites();
  renderCustomRules();
}

void loadAll();
