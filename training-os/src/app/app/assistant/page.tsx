import { Chat } from "@/components/chat";
import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { readSP, type SP } from "@/lib/search-params";

export const metadata = { title: "Assistant IA" };

export default async function AssistantPage({ searchParams }: { searchParams: SP }) {
  await requirePageOrg(STAFF, "ai.director");
  const { get } = await readSP(searchParams);
  return (
    <>
      <PageHeader title="Assistant du directeur" subtitle="Réponses calculées à partir des données de votre centre — l'IA n'invente pas les chiffres." />
      <Chat
        kind="director"
        initialQuestion={get("q") || undefined}
        suggestions={[
          "Qu'est-ce que je dois faire aujourd'hui ?",
          "Combien d'étudiants sont actuellement inscrits ?",
          "Combien avons-nous encaissé ce mois-ci ?",
          "Quels étudiants doivent encore payer ?",
          "Quelle formation possède le plus d'inscrits ?",
          "Quels étudiants ont un faible taux de présence ?",
          "Quels étudiants ont terminé Excel ?",
          "Quels anciens étudiants pourraient être intéressés par Power BI ?",
        ]}
        disclaimer="Les données transmises à l'IA sont limitées au nécessaire (aucun téléphone ni email). Chaque requête est journalisée."
      />
    </>
  );
}
