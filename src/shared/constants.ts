import type { ExtensionSettings, PromptPreset } from './types';

export const GITHUB_URL = 'https://github.com/ahmetdenizyilmaz/LLM_Queue';

export const STORAGE_KEYS = {
  SETTINGS: 'llm_queue_settings_v1',
  QUEUES: 'llm_queue_queues_v1',
  PRESETS: 'llm_queue_presets_v1',
  CUSTOM_RULES: 'llm_queue_custom_rules_v1',
  UI_STATE: 'llm_queue_ui_state_v1',
} as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  autoQueueOnEnterWhileBusy: true,
  cooldownMs: 1500,
  scopePerConversation: true,
  theme: 'auto',
  dockPosition: 'bottom-right',
  soundOnComplete: false,
  notifyOnComplete: false,
  disabledSites: [],
  batchDelimiter: '---',
};

export const DEFAULT_PRESETS: PromptPreset[] = [
  {
    id: 'preset-deep-dive',
    name: 'Deep Dive & Critique',
    prompts: [
      'Identify the 3 weakest assumptions or potential failure modes in your previous answer and explain how each could fail in practice.',
      'Now revise your solution to address every failure mode you just identified, keeping the result concise and concrete.',
    ],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-code-review',
    name: 'Code Review & Tests',
    prompts: [
      'Review the implementation above for edge cases, race conditions, security flaws, and unnecessary complexity. List specific fixes.',
      'Write comprehensive unit tests covering the happy paths and edge cases you found.',
    ],
    createdAt: 1700000000001,
    updatedAt: 1700000000001,
  },
  {
    id: 'preset-exec-summary',
    name: 'Executive Summary & Action Plan',
    prompts: [
      'Distill everything we just discussed into a crisp 5-bullet executive summary.',
      'Turn that summary into a prioritized step-by-step action plan with clear owners, risks, and quick wins.',
    ],
    createdAt: 1700000000002,
    updatedAt: 1700000000002,
  },
];
