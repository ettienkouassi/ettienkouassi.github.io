import { AppShell } from "@/components/shell";
import { requirePageOrg } from "@/lib/auth/context";
import { instructorNav } from "@/lib/nav";
import { unreadCount } from "@/server/notifications";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageOrg(["instructor"]);
  return (
    <AppShell nav={instructorNav} user={ctx.user} orgName={ctx.user.organizationName} unread={await unreadCount(ctx)} notificationsHref="/instructor/notifications">
      {children}
    </AppShell>
  );
}
