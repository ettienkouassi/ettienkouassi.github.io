import { logoutAction } from "../actions";

export const metadata = { title: "Centre suspendu" };

export default function SuspendedPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Accès suspendu</h1>
      <p className="mt-2 text-sm text-slate-600">
        L&apos;accès de votre centre de formation à TRAINING OS AI est actuellement suspendu. Vos données sont conservées. Contactez le support ou votre
        administrateur pour réactiver le compte.
      </p>
      <form action={logoutAction} className="mt-6">
        <button className="btn-secondary w-full">Se déconnecter</button>
      </form>
    </>
  );
}
