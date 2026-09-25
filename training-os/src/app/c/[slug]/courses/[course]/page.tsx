import { notFound } from "next/navigation";
import { Checkbox, Field, Form, Submit, TextArea } from "@/components/form";
import { Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { readSP, type SP } from "@/lib/search-params";
import { publicCenter } from "@/server/public-center";
import { publicRegisterAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; course: string }> }) {
  const { slug, course } = await params;
  const c = await publicCenter(slug);
  const co = c?.courses.find((x) => x.slug === course);
  return co ? { title: `${co.name} — ${c!.org.name}`, description: co.description ?? undefined } : {};
}

export default async function PublicCoursePage({ params, searchParams }: { params: Promise<{ slug: string; course: string }>; searchParams: SP }) {
  const { slug, course } = await params;
  const { get } = await readSP(searchParams);
  const c = await publicCenter(slug);
  const co = c?.courses.find((x) => x.slug === course);
  if (!c || !co) notFound();
  const sessions = c.sessions.filter((s) => s.s.courseId === co.id);
  const mods = c.mods.filter((m) => m.courseId === co.id);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <div className="text-sm uppercase tracking-wide text-brand-600">{co.category}</div>
          <h1 className="mt-1 text-3xl font-bold">{co.name}</h1>
          <p className="mt-2 text-slate-600">
            {co.durationHours} heures · {co.level} · <strong className="text-brand-700">{formatMoney(co.price, co.currency)}</strong>
          </p>
        </div>
        {co.description && <p className="whitespace-pre-line text-slate-700">{co.description}</p>}
        {co.objectives && (
          <Card title="Objectifs">
            <p className="whitespace-pre-line text-sm">{co.objectives}</p>
          </Card>
        )}
        {mods.length > 0 && (
          <Card title="Programme">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {mods.map((m) => (
                <li key={m.id}>{m.title}</li>
              ))}
            </ol>
          </Card>
        )}
        {co.prerequisites && (
          <Card title="Prérequis">
            <p className="text-sm">{co.prerequisites}</p>
          </Card>
        )}
      </div>
      <div id="inscription">
        <Card title="Demande d'inscription">
          <Form action={publicRegisterAction} resetOnSuccess>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="courseId" value={co.id} />
            <div aria-hidden className="hidden">
              <label>
                Site web <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {sessions.length > 0 ? (
              <div>
                <label className="label" htmlFor="f-sessionId">
                  Session
                </label>
                <select id="f-sessionId" name="sessionId" className="input" defaultValue={get("session")}>
                  {sessions.map(({ s, taken }) => (
                    <option key={s.id} value={s.id} disabled={taken >= s.capacity}>
                      {formatDate(s.startDate)} → {formatDate(s.endDate)} {taken >= s.capacity ? "(complet)" : `(${s.capacity - taken} places)`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Aucune session ouverte : laissez vos coordonnées, nous vous informerons de la prochaine.</p>
            )}
            <Field name="lastName" label="Nom" required autoComplete="family-name" />
            <Field name="firstName" label="Prénom" required autoComplete="given-name" />
            <Field name="phone" label="Téléphone" type="tel" required autoComplete="tel" />
            <Field name="email" label="Email" type="email" required autoComplete="email" />
            <TextArea name="message" label="Message (facultatif)" rows={2} />
            <Checkbox name="consent" label={`J'accepte que ${c.org.name} utilise ces informations pour traiter ma demande.`} />
            <Submit className="btn-primary w-full">Envoyer ma demande</Submit>
            <p className="text-xs text-slate-500">Le paiement en ligne n&apos;est pas activé : le centre vous contactera pour les modalités.</p>
          </Form>
        </Card>
      </div>
    </div>
  );
}
