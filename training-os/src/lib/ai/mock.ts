import type { AIProvider, ChatResult, ChatTurn, ToolDef } from "./types";
import { NO_DATA_SENTENCE } from "./types";

/**
 * Fournisseur hors-ligne (développement, tests, démonstration sans clé API).
 * Il choisit un outil par mots-clés et restitue les données RÉELLES renvoyées
 * par cet outil : il n'invente aucun chiffre.
 */
const ROUTES: [RegExp, string][] = [
  [/aujourd|faire|priorit|action/i, "get_today_actions"],
  [/encaiss|chiffre|revenu|ca\b|recette/i, "get_revenue"],
  [/doi(ven)?t.*payer|impay|reste|retard.*paie|solde|relance/i, "list_unpaid"],
  [/pr[ée]sence|absent|assiduit/i, "list_low_attendance"],
  [/d[ée]croch|risque|suivi/i, "list_at_risk_students"],
  [/formation.*(plus|inscrit)|meilleure formation|statistique/i, "get_course_stats"],
  [/termin|fini|achev/i, "find_students_by_course"],
  [/int[ée]ress|recommand|proposer|anciens/i, "suggest_upsell_candidates"],
  [/certificat/i, "list_certificates_to_issue"],
  [/prospect|pipeline|crm/i, "list_prospects_pipeline"],
  [/combien|inscrit|[ée]tudiant|vue|r[ée]sum/i, "get_center_overview"],
  [/progress|note|r[ée]sultat|moyenne|paiement|mon /i, "get_my_overview"],
  [/cours|support|module|selon/i, "search_course_materials"],
];

export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock-local";

  async chat({ history, tools }: { system: string; history: ChatTurn[]; tools: ToolDef[] }): Promise<ChatResult> {
    const question = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
    const available = new Map(tools.map((t) => [t.name, t]));
    const route = ROUTES.find(([re, name]) => re.test(question) && available.has(name));
    if (!route) {
      return {
        text:
          tools.length === 0
            ? "Mode démonstration : configurez ANTHROPIC_API_KEY pour activer l'assistant pédagogique complet."
            : `${NO_DATA_SENTENCE}\n\n(Mode démonstration sans modèle d'IA : reformulez avec des mots-clés comme « encaissé », « impayés », « présence », « aujourd'hui ».)`,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
        toolsUsed: [],
        status: "ok",
      };
    }
    const tool = available.get(route[1])!;
    const input: Record<string, unknown> = {};
    if (tool.name === "search_course_materials") input.query = question;
    if (tool.name === "get_revenue") input.period = /ann[ée]e/i.test(question) ? "year" : /semaine/i.test(question) ? "week" : /jour/i.test(question) ? "today" : "month";
    const courseMatch = question.match(/(excel|power ?bi|word|project|bureautique|ia|chatgpt|microsoft 365)/i);
    if (courseMatch && ["find_students_by_course", "suggest_upsell_candidates"].includes(tool.name)) input.course = courseMatch[1];
    const data = await tool.run(input);
    return {
      text: `Voici les données calculées par TRAINING OS (mode démonstration, sans reformulation par l'IA) :\n\n${formatData(data)}`,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      toolsUsed: [tool.name],
      status: "ok",
    };
  }

  async json<T>(): Promise<{ data: T; inputTokens: number; outputTokens: number; model: string }> {
    throw new Error("Fonction IA indisponible en mode démonstration");
  }
}

function formatData(data: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (Array.isArray(data)) {
    if (data.length === 0) return `${pad}- (aucun élément)`;
    return data.slice(0, 25).map((x) => (typeof x === "object" && x ? `${pad}- ${Object.entries(x).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · ")}` : `${pad}- ${fmt(x)}`)).join("\n");
  }
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, unknown>)
      .map(([k, v]) => (v && typeof v === "object" ? `${pad}**${k}**\n${formatData(v, depth + 1)}` : `${pad}- ${k} : ${fmt(v)}`))
      .join("\n");
  }
  return `${pad}${fmt(data)}`;
}
const fmt = (v: unknown) => (typeof v === "number" ? new Intl.NumberFormat("fr-FR").format(v).replace(/ /g, " ") : v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
