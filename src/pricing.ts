/**
 * Shared pricing utilities — single source of truth for cost estimation.
 *
 * Used by index.ts (CLI), proxy.ts, and mcp-server.ts.
 */

import { existsSync, readFileSync } from 'fs';
import { loadPricing, getPricingPath } from './db';

// ── Types ─────────────────────────────────────────────────────

export interface PricingEntry {
  input: number;
  output: number;
}

export interface PricingLookupResult {
  entry: PricingEntry;
  source: 'built-in' | 'custom';
  key: string;
}

export interface CostEstimate {
  cost: number;
  pricingInfo: {
    source: 'built-in' | 'custom' | 'manual';
    modelKnown: boolean;
    inputPer1M: number;
    outputPer1M: number;
  };
}

// ── Core functions ────────────────────────────────────────────

/** Check if a model key exists in the user's custom pricing file. */
export function isCustomPricing(key: string): boolean {
  const pPath = getPricingPath();
  if (!existsSync(pPath)) return false;
  try {
    const user = JSON.parse(readFileSync(pPath, 'utf-8'));
    return key in user;
  } catch (_) { return false; }
}

/**
 * Look up pricing for a model, trying provider-namespaced key first
 * (e.g. "anthropic/claude-sonnet-4") then falling back to plain model name.
 */
export function lookupPricing(model: string, provider?: string): PricingLookupResult | null {
  const pricing = loadPricing();
  // Try provider-namespaced key first
  if (provider) {
    const namespacedKey = `${provider}/${model}`;
    if (pricing[namespacedKey]) {
      const custom = isCustomPricing(namespacedKey);
      return { entry: pricing[namespacedKey], source: custom ? 'custom' : 'built-in', key: namespacedKey };
    }
  }
  // Fallback to plain model name
  if (pricing[model]) {
    const custom = isCustomPricing(model);
    return { entry: pricing[model], source: custom ? 'custom' : 'built-in', key: model };
  }
  return null;
}

/**
 * Estimate cost for a model call. Returns full metadata (source, rates).
 * Used by CLI `cs log-ai` for rich output.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider?: string,
): CostEstimate | null {
  const lookup = lookupPricing(model, provider);
  if (!lookup) return null;
  const cost = (promptTokens * lookup.entry.input + completionTokens * lookup.entry.output) / 1_000_000;
  return {
    cost,
    pricingInfo: {
      source: lookup.source,
      modelKnown: true,
      inputPer1M: lookup.entry.input,
      outputPer1M: lookup.entry.output,
    },
  };
}

/**
 * Estimate cost, returning just the dollar amount.
 * Returns 0 for unknown models (proxy behavior — never block the request).
 */
export function estimateCostSimple(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider?: string,
): number {
  const result = estimateCost(model, promptTokens, completionTokens, provider);
  return result ? result.cost : 0;
}

/**
 * Estimate cost, returning null for unknown models.
 * Used by MCP server which needs to distinguish unknown-model errors.
 */
export function estimateCostOrNull(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider?: string,
): number | null {
  const result = estimateCost(model, promptTokens, completionTokens, provider);
  return result ? result.cost : null;
}
