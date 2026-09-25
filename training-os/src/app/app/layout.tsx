import { AppShell } from "@/components/shell";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { staffNav } from "@/lib/nav";
import { unreadCount } from "@/server/notifications";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageOrg(STAFF);
  const unread = await unreadCount(ctx);
  return (
    <AppShell nav={staffNav(ctx.role)} user={ctx.user} orgName={ctx.user.organizationName} unread={unread} notificationsHref="/app/notifications">
      {children}
    </AppShell>
  );
}
