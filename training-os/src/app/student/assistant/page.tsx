import { Chat } from "@/components/chat";
import { PageHeader } from "@/components/ui";
import { studentScope } from "../scope";

export const metadata = { title: "Mon assistant IA" };

export default async function Page() {
  await studentScope();
  return (
    <>
      <PageHeader title="Mon assistant pédagogique" subtitle="Explications, exercices, questions de révision, aide sur une erreur, résumé d'un support, plan de révision." />
      <Chat
        kind="student"
        suggestions={["Explique-moi RECHERCHEX simplement.", "Selon le cours, quelles sont les fonctions vues dans le module 3 ?", "Quel est mon taux de présence ?", "Propose-moi un plan de révision pour l'examen final", "Génère 5 exercices pour m'entraîner"]}
        disclaimer="L'assistant n'a accès qu'à vos propres données et aux supports de vos formations."
      />
    </>
  );
}
