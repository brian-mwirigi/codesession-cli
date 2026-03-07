/**
 * Configurable pricing store — load/save user pricing overrides.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DB_DIR } from './connection';

const PRICING_PATH = join(DB_DIR, 'pricing.json');

const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic (per 1M tokens)
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-3.5': { input: 0.80, output: 4 },
  // OpenAI (per 1M tokens)
  'gpt-4o': { input: 2.50, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-codex': { input: 1.25, output: 10 },
  'gpt-5.1-codex': { input: 1.25, output: 10 },
  'gpt-5.1-codex-max': { input: 1.25, output: 10 },
  'gpt-5.1-codex-mini': { input: 0.25, output: 2 },
  'gpt-5.2-codex': { input: 1.75, output: 14 },
  'gpt-5.3-codex': { input: 1.75, output: 14 },
  'codex-mini-latest': { input: 1.50, output: 6 },
  'o3': { input: 2, output: 8 },
  'o4-mini': { input: 1.10, output: 4.40 },
  // Google (per 1M tokens)
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  // DeepSeek
  'deepseek-r1': { input: 0.55, output: 2.19 },
  'deepseek-v3': { input: 0.27, output: 1.10 },
};

export function loadPricing(): Record<string, { input: number; output: number }> {
  const merged = { ...DEFAULT_PRICING };
  if (existsSync(PRICING_PATH)) {
    try {
      const user = JSON.parse(readFileSync(PRICING_PATH, 'utf-8'));
      Object.assign(merged, user);
    } catch (_) { /* ignore bad JSON */ }
  }
  return merged;
}

export function setPricing(model: string, input: number, output: number): void {
  let user: Record<string, { input: number; output: number }> = {};
  if (existsSync(PRICING_PATH)) {
    try { user = JSON.parse(readFileSync(PRICING_PATH, 'utf-8')); } catch (_) { user = {}; }
  }
  user[model] = { input, output };
  writeFileSync(PRICING_PATH, JSON.stringify(user, null, 2));
}

export function resetPricing(): void {
  if (existsSync(PRICING_PATH)) {
    writeFileSync(PRICING_PATH, '{}');
  }
}

export function getPricingPath(): string {
  return PRICING_PATH;
}
