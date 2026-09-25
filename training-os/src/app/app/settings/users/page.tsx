import { asc, eq } from "drizzle-orm";
import { Checkbox, Field, Form, Select, Submit } from "@/components/form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { users } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { formatDateTime } from "@/lib/format";
import { inviteUserAction, updateUserAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Utilisateurs" };

export default async function UsersPage() {
  const ctx = await requirePageOrg(STAFF, "users.manage");
  const list = await ctx.db((tx) => tx.select().from(users).where(eq(users.organizationId, ctx.orgId)).orderBy(asc(users.role), asc(users.lastName)));
  const staff = list.filter((u) => u.role !== "student");
  return (
    <>
      <PageHeader title="Utilisateurs & rôles" subtitle={`${staff.length} compte(s) du personnel · ${list.length - staff.length} compte(s) étudiant(s)`} />
      <SettingsTabs active="users" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Personnel" className="lg:col-span-2" bodyClassName="overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Dernière connexion</th>
                <th>Modifier</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.firstName} {u.lastName}
                    <div className="text-xs text-slate-500">{u.email}</div>
                    {!u.passwordHash && <Badge tone="amber">Invitation en attente</Badge>}
                    {!u.isActive && <Badge tone="red">Désactivé</Badge>}
                  </td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td className="text-xs">{formatDateTime(u.lastLoginAt)}</td>
                  <td>
                    {u.id === ctx.user.id ? (
                      <span className="text-xs text-slate-400">vous</span>
                    ) : (
                      <Form action={updateUserAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="role" defaultValue={u.role} className="input w-auto py-1 text-xs">
                          <option value="org_admin">Administrateur</option>
                          <option value="manager">Gestionnaire</option>
                          <option value="instructor">Formateur</option>
                        </select>
                        <Checkbox name="isActive" label="Actif" defaultChecked={u.isActive} />
                        <Submit className="btn-secondary btn-sm">OK</Submit>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Inviter un membre du personnel">
          <Form action={inviteUserAction} resetOnSuccess>
            <Field name="firstName" label="Prénom" required />
            <Field name="lastName" label="Nom" required />
            <Field name="email" label="Email" type="email" required />
            <Select
              name="role"
              label="Rôle"
              required
              defaultValue="manager"
              options={[
                { value: "org_admin", label: "Administrateur — accès complet au centre" },
                { value: "manager", label: "Gestionnaire — accès administratif limité" },
                { value: "instructor", label: "Formateur — ses sessions uniquement" },
              ]}
            />
            <Submit className="btn-primary w-full">Envoyer l&apos;invitation</Submit>
            <p className="text-xs text-slate-500">La personne reçoit un lien sécurisé (72 h) pour choisir son mot de passe. Aucun mot de passe n&apos;est envoyé par email.</p>
          </Form>
        </Card>
      </div>
    </>
  );
}
