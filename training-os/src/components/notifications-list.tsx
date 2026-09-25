import Link from "next/link";
import { markAllReadAction } from "@/app/shared/notification-actions";
import { ActionButton } from "@/components/form";
import { Empty } from "@/components/ui";
import type { OrgContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { listNotifications } from "@/server/notifications";

const ICONS = { info: "ℹ️", success: "✅", warning: "⚠️", urgent: "🚨" } as const;

export async function NotificationsList({ ctx }: { ctx: OrgContext }) {
  const list = await listNotifications(ctx);
  if (!list.length) return <Empty title="Aucune notification" />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ActionButton action={markAllReadAction}>Tout marquer comme lu</ActionButton>
      </div>
      <ul className="card divide-y divide-slate-100">
        {list.map((n) => {
          const inner = (
            <div className={`flex gap-3 p-3 ${n.readAt ? "opacity-60" : ""}`}>
              <span aria-hidden>{ICONS[n.level]}</span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</div>
                {n.body && <div className="text-xs text-slate-600">{n.body}</div>}
                <div className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</div>
              </div>
            </div>
          );
          return <li key={n.id}>{n.link?.startsWith("/") ? <Link href={n.link}>{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}
