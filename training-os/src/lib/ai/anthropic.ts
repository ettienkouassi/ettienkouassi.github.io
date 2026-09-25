import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatResult, ChatTurn, ToolDef } from "./types";

type Effort = "low" | "medium" | "high";

/**
 * Fournisseur Claude (Anthropic). La boucle d'outils est écrite à la main pour
 * garder le contrôle : nombre de tours borné, outils exécutés côté serveur dans
 * le périmètre de l'utilisateur, journalisation de chaque outil utilisé.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    readonly model: string,
    private effort: Effort,
    apiKey?: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  private refusalFallback() {
    // Repli serveur automatique en cas de refus par les classifieurs de sécurité
    // (activé par défaut ; AI_REFUSAL_FALLBACK=false pour le désactiver).
    return process.env.AI_REFUSAL_FALLBACK === "false"
      ? {}
      : { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const };
  }

  async chat({ system, history, tools, maxToolRounds = 6 }: { system: string; history: ChatTurn[]; tools: ToolDef[]; maxToolRounds?: number }): Promise<ChatResult> {
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
    const apiTools: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
    const byName = new Map(tools.map((t) => [t.name, t]));
    const used: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let round = 0; round <= maxToolRounds; round++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort },
        tools: apiTools.length ? apiTools : undefined,
        // Dernier tour autorisé : plus d'outils, réponse finale obligatoire
        tool_choice: apiTools.length ? (round === maxToolRounds ? { type: "none" } : { type: "auto" }) : undefined,
        messages,
        ...this.refusalFallback(),
      });
      inputTokens += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === "refusal") {
        return { text: "Je ne peux pas répondre à cette demande.", model: response.model, inputTokens, outputTokens, toolsUsed: used, status: "refused" };
      }

      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (response.stop_reason !== "tool_use") {
        return {
          text: text || "Je n'ai pas pu formuler de réponse.",
          model: response.model,
          inputTokens,
          outputTokens,
          toolsUsed: used,
          status: response.stop_reason === "max_tokens" ? "truncated" : "ok",
        };
      }

      // Conserver le contenu complet (blocs de réflexion inclus) pour la suite de la boucle
      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const tool = byName.get(tu.name);
          used.push(tu.name);
          if (!tool) return { type: "tool_result", tool_use_id: tu.id, content: "Outil inconnu.", is_error: true };
          try {
            const input = (tu.input && typeof tu.input === "object" ? tu.input : {}) as Record<string, unknown>;
            const out = await tool.run(input);
            return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 60_000) };
          } catch (e) {
            return { type: "tool_result", tool_use_id: tu.id, content: `Erreur : ${(e as Error).message.slice(0, 200)}`, is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
    return { text: "La demande est trop complexe ; merci de la reformuler plus précisément.", model: this.model, inputTokens, outputTokens, toolsUsed: used, status: "truncated" };
  }

  async json<T>({ system, prompt, schema }: { system: string; prompt: string; schema: Record<string, unknown> }) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      system,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new Error("Requête refusée par le modèle");
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
    return { data: JSON.parse(text) as T, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, model: response.model };
  }
}
