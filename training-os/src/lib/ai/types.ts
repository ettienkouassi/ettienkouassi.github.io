export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema de l'entrée (objet) */
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  /** Exécuté côté serveur, dans le périmètre (centre, rôle, utilisateur) de l'appelant. */
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolsUsed: string[];
  status: "ok" | "refused" | "truncated";
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  chat(opts: { system: string; history: ChatTurn[]; tools: ToolDef[]; maxToolRounds?: number }): Promise<ChatResult>;
  json<T>(opts: { system: string; prompt: string; schema: Record<string, unknown> }): Promise<{ data: T; inputTokens: number; outputTokens: number; model: string }>;
}

export const NO_DATA_SENTENCE = "Je ne dispose pas de cette information dans les données actuellement accessibles.";
