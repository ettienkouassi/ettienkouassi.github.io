import { redirect } from "next/navigation";
import { Field, Form, Submit } from "@/components/form";
import { Alert } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/context";
import { changePasswordAction, logoutAction } from "../actions";

export const metadata = { title: "Changer le mot de passe" };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <h1 className="text-xl font-semibold">Changer le mot de passe</h1>
      {user.mustChangePassword && (
        <div className="mt-3">
          <Alert tone="amber">Pour votre sécurité, vous devez définir un nouveau mot de passe avant de continuer.</Alert>
        </div>
      )}
      <Form action={changePasswordAction} className="mt-6 space-y-4">
        <Field name="current" label="Mot de passe actuel" type="password" required autoComplete="current-password" />
        <Field name="password" label="Nouveau mot de passe" type="password" required autoComplete="new-password" hint="10 caractères minimum, majuscule, minuscule et chiffre." />
        <Field name="confirm" label="Confirmation" type="password" required autoComplete="new-password" />
        <Submit className="btn-primary w-full">Enregistrer</Submit>
      </Form>
      <form action={logoutAction} className="mt-4 text-center">
        <button className="link text-sm">Se déconnecter</button>
      </form>
    </>
  );
}
