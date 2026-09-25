import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";
import { NavLinks, type NavItem } from "./nav-links";

export function AppShell({
  nav,
  user,
  orgName,
  unread = 0,
  notificationsHref,
  children,
}: {
  nav: NavItem[];
  user: { firstName: string; lastName: string; role: Role; email: string };
  orgName?: string | null;
  unread?: number;
  notificationsHref?: string;
  children: ReactNode;
}) {
  const brand = (
    <Link href="/" className="flex items-center gap-2 px-4 py-4 font-bold text-brand-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">T</span>
      <span className="leading-tight">
        TRAINING OS <span className="text-brand-600">AI</span>
        {orgName && <span className="block max-w-40 truncate text-xs font-medium text-slate-500">{orgName}</span>}
      </span>
    </Link>
  );
  const footer = (
    <div className="border-t border-slate-200 p-3 text-sm">
      <div className="truncate font-medium text-slate-800">
        {user.firstName} {user.lastName}
      </div>
      <div className="truncate text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
      <div className="mt-2 flex gap-2">
        <Link href="/change-password" className="btn-ghost btn-sm px-2">
          Mot de passe
        </Link>
        <form action={logoutAction}>
          <button className="btn-ghost btn-sm px-2 text-red-600">Déconnexion</button>
        </form>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:fixed lg:inset-y-0">
        {brand}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <NavLinks items={nav} />
        </nav>
        {footer}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
          {/* Menu mobile/tablette sans JavaScript */}
          <details className="relative lg:hidden">
            <summary className="btn-secondary btn-sm cursor-pointer list-none">☰ Menu</summary>
            <div className="absolute left-0 z-30 mt-2 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <NavLinks items={nav} />
              {footer}
            </div>
          </details>
          <div className="hidden text-sm text-slate-500 lg:block">{orgName}</div>
          <div className="flex items-center gap-2">
            {notificationsHref && (
              <Link href={notificationsHref} className="btn-ghost btn-sm relative" aria-label="Notifications">
                🔔
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            )}
            <span className="hidden text-sm text-slate-600 sm:inline">{user.firstName}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
