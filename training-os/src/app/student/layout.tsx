import { AppShell } from "@/components/shell";
import { requirePageOrg } from "@/lib/auth/context";
import { studentNav } from "@/lib/nav";
import { unreadCount } from "@/server/notifications";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageOrg(["student"]);
  return (
    <AppShell nav={studentNav} user={ctx.user} orgName={ctx.user.organizationName} unread={await unreadCount(ctx)} notificationsHref="/student/notifications">
      {children}
    </AppShell>
  );
}
