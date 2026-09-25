import Link from "next/link";
import { redirect } from "next/navigation";
import { Field, Form, Submit } from "@/components/form";
import { getCurrentUser } from "@/lib/auth/context";
import { homePathFor } from "@/lib/auth/rbac";
import { loginAction } from "../actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));
  return (
    <>
      <h1 className="text-xl font-semibold">Connexion</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Accédez à votre espace centre, formateur ou étudiant.</p>
      <Form action={loginAction}>
        <Field name="email" label="Email" type="email" required autoComplete="username" />
        <Field name="password" label="Mot de passe" type="password" required autoComplete="current-password" />
        <Submit className="btn-primary w-full" pendingText="Connexion…">
          Se connecter
        </Submit>
      </Form>
      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="link">
          Mot de passe oublié ?
        </Link>
      </div>
    </>
  );
}
