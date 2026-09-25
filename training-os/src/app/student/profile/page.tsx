import Link from "next/link";
import { Card, DL, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { studentScope } from "../scope";

export const metadata = { title: "Mon profil" };

export default async function Page() {
  const { me, ctx } = await studentScope();
  return (
    <>
      <PageHeader title="Mon profil" actions={<Link href="/change-password" className="btn-secondary">Changer mon mot de passe</Link>} />
      <Card>
        <DL
          items={[
            ["Nom", `${me.firstName} ${me.lastName}`],
            ["Matricule", me.matricule],
            ["Email de connexion", ctx.user.email],
            ["Téléphone", me.phone],
            ["Date de naissance", formatDate(me.birthDate)],
            ["Adresse", me.address],
            ["Profession", me.profession],
            ["Entreprise", me.company],
            ["Niveau d'études", me.educationLevel],
          ]}
        />
        <p className="mt-4 text-xs text-slate-500">Pour corriger une information, contactez le secrétariat du centre. Vos données sont utilisées uniquement pour le suivi de votre formation.</p>
      </Card>
    </>
  );
}
