import { NotificationsList } from "@/components/notifications-list";
import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requirePageOrg(STAFF);
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationsList ctx={ctx} />
    </>
  );
}
