import { NotificationsList } from "@/components/notifications-list";
import { PageHeader } from "@/components/ui";
import { requirePageOrg } from "@/lib/auth/context";

export default async function Page() {
  const ctx = await requirePageOrg(["instructor"]);
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationsList ctx={ctx} />
    </>
  );
}
