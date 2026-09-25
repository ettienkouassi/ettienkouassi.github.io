import Link from "next/link";
import { Field, Form, Submit } from "@/components/form";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Mot de passe oublié</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Saisissez votre email : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
      <Form action={forgotPasswordAction}>
        <Field name="email" label="Email" type="email" required autoComplete="username" />
        <Submit className="btn-primary w-full">Envoyer le lien</Submit>
      </Form>
      <div className="mt-4 text-center text-sm">
        <Link href="/login" className="link">
          Retour à la connexion
        </Link>
      </div>
    </>
  );
}
