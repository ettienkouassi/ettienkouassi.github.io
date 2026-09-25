import { AppShell } from "@/components/shell";
import { requirePageUser } from "@/lib/auth/context";
import { superAdminNav } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(["super_admin"]);
  return (
    <AppShell nav={superAdminNav} user={user} orgName="Plateforme TRAINING OS">
      {children}
    </AppShell>
  );
}
