import "server-only";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AIProvider } from "./types";

/** Point unique de sélection du modèle : changer de fournisseur = ajouter une implémentation d'AIProvider. */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.AI_MODEL || "claude-opus-5", (process.env.AI_EFFORT as "low" | "medium" | "high") || "medium", process.env.ANTHROPIC_API_KEY);
  }
  return new MockProvider();
}

/** Tarifs indicatifs (USD par million de jetons) pour l'estimation des coûts (§51). */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5-1": [10, 50],
};

export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  const [i, o] = key ? PRICES[key] : [5, 25];
  return Math.round(inputTokens * i + outputTokens * o); // $/M jetons × jetons = micro-dollars
}
