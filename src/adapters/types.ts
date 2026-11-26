export interface SiteConfig {
  id: string;
  name: string;
  accentColor: string;
  hostPatterns: string[];
  pathPrefixes?: string[];
  inputSelectors: string[];
  sendButtonSelectors: string[];
  stopButtonSelectors: string[];
  busySelectors?: string[];
  isCustom?: boolean;
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

export interface SiteAdapter {
  id: string;
  name: string;
  accentColor: string;
  isCustom?: boolean;
  getInput(): HTMLElement | null;
  getSendButton(): HTMLElement | null;
  getStopButton(): HTMLElement | null;
  isBusy(): boolean;
  isReadyToSend(): boolean;
  readInputText(): string;
  clearInput(): void;
  submitPrompt(text: string): Promise<SubmitResult>;
}
