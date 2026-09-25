import { Chat } from "@/components/chat";
import { PageHeader } from "@/components/ui";
import { instructorScope } from "../scope";

export const metadata = { title: "Assistant pédagogique" };

export default async function Page() {
  await instructorScope();
  return (
    <>
      <PageHeader title="Assistant pédagogique" subtitle="Préparation de séances, exercices, quiz, suivi de vos étudiants." />
      <Chat
        kind="instructor"
        suggestions={["Quels étudiants de mes sessions ont besoin d'un suivi ?", "Propose 5 exercices progressifs sur les tableaux croisés dynamiques", "Crée un quiz de 10 questions sur RECHERCHEX avec corrigé", "Selon le cours, quelles fonctions sont vues dans le module 3 ?"]}
      />
    </>
  );
}
