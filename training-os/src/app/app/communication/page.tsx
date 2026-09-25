import { desc, eq } from "drizzle-orm";
import { Checkbox, Field, Form, Select, Submit, TextArea } from "@/components/form";
import { Badge, Card, PageHeader, Tabs } from "@/components/ui";
import { communications, messageTemplates } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { readSP, type SP } from "@/lib/search-params";
import { DEFAULT_TEMPLATES } from "@/server/communications";
import { sessionOptions } from "@/server/lookups";
import { saveTemplateAction, sendMessageAction } from "./actions";

export const metadata = { title: "Communication" };

export default async function CommunicationPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "communications.send");
  const { get } = await readSP(searchParams);
  const tab = get("tab") || "send";
  const data = await ctx.db(async (tx) => ({
    sessions: await sessionOptions(tx, ctx.orgId, { active: true }),
    templates: await tx.select().from(messageTemplates).where(eq(messageTemplates.organizationId, ctx.orgId)),
    history: await tx.select().from(communications).where(eq(communications.organizationId, ctx.orgId)).orderBy(desc(communications.createdAt)).limit(100),
  }));
  return (
    <>
      <PageHeader title="Communication" subtitle="Notifications internes, emails et modèles de messages. WhatsApp/SMS : prévus en V2." />
      <Tabs
        active={tab}
        tabs={[
          { key: "send", label: "Envoyer un message", href: "?tab=send" },
          { key: "templates", label: "Modèles automatiques", href: "?tab=templates" },
          { key: "history", label: "Historique", href: "?tab=history" },
        ]}
      />
      {tab === "send" && (
        <Card className="max-w-2xl">
          <Form action={sendMessageAction} resetOnSuccess confirm="Envoyer ce message aux destinataires sélectionnés ?">
            <Select name="sessionId" label="Destinataires" options={data.sessions.map((s) => ({ value: s.id, label: `Étudiants de : ${s.courseName} — ${s.name}` }))} placeholder="Tous les étudiants actifs" />
            <Field name="subject" label="Objet" required />
            <TextArea name="message" label="Message" required rows={6} hint="Le message commence automatiquement par « Bonjour [prénom] » et se termine par le nom du centre." />
            <Checkbox name="notifyApp" label="Envoyer aussi une notification dans l'espace étudiant" defaultChecked />
            <Submit pendingText="Envoi…">Envoyer</Submit>
          </Form>
        </Card>
      )}
      {tab === "templates" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(DEFAULT_TEMPLATES)
            .filter(([k]) => !["account_created", "custom"].includes(k))
            .map(([key, def]) => {
              const t = data.templates.find((x) => x.key === key);
              return (
                <Card key={key} title={def.name}>
                  <Form action={saveTemplateAction}>
                    <input type="hidden" name="key" value={key} />
                    <Field name="subject" label="Objet" required defaultValue={t?.subject ?? def.subject} />
                    <TextArea name="body" label="Contenu" required rows={6} defaultValue={t?.body ?? def.body} hint="Variables : {{prenom}}, {{formation}}, {{session}}, {{montant}}, {{date_echeance}}, {{centre}}…" />
                    <Checkbox name="isActive" label="Envoi automatique activé" defaultChecked={t?.isActive ?? true} />
                    <Submit className="btn-secondary btn-sm">Enregistrer</Submit>
                  </Form>
                </Card>
              );
            })}
        </div>
      )}
      {tab === "history" && (
        <Card bodyClassName="overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Destinataire</th>
                <th>Objet</th>
                <th>Type</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(c.createdAt)}</td>
                  <td className="text-xs">{c.toAddress}</td>
                  <td>{c.subject}</td>
                  <td className="text-xs">{c.templateKey ? (DEFAULT_TEMPLATES[c.templateKey]?.name ?? c.templateKey) : "—"}</td>
                  <td>{c.status === "sent" ? <Badge tone="green">Envoyé</Badge> : c.status === "failed" ? <Badge tone="red">Échec</Badge> : <Badge>En attente</Badge>}</td>
                </tr>
              ))}
              {data.history.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500">
                    Aucun message.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
