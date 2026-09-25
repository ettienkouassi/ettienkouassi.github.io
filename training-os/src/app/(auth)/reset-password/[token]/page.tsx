import Link from "next/link";
import { Field, Form, Submit } from "@/components/form";
import { withSystem } from "@/db/tenant";
import { peekAuthToken } from "@/server/auth-tokens";
import { resetPasswordAction } from "../../actions";

export const metadata = { title: "Nouveau mot de passe", referrer: "no-referrer" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await withSystem((tx) => peekAuthToken(tx, token));
  if (!t) {
    return (
      <>
        <h1 className="text-xl font-semibold">Lien invalide ou expiré</h1>
        <p className="mt-2 text-sm text-slate-500">Demandez un nouveau lien de réinitialisation.</p>
        <Link href="/forgot-password" className="btn-primary mt-6 w-full">
          Nouveau lien
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold">{t.type === "invitation" ? "Activez votre compte" : "Nouveau mot de passe"}</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Au moins 10 caractères, avec une majuscule, une minuscule et un chiffre.</p>
      <Form action={resetPasswordAction}>
        <input type="hidden" name="token" value={token} />
        <Field name="password" label="Nouveau mot de passe" type="password" required autoComplete="new-password" />
        <Field name="confirm" label="Confirmation" type="password" required autoComplete="new-password" />
        <Submit className="btn-primary w-full">Enregistrer</Submit>
      </Form>
      <div className="mt-4 text-center text-sm">
        <Link href="/login" className="link">
          Aller à la connexion
        </Link>
      </div>
    </>
  );
}
