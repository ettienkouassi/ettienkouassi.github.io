import { Tabs } from "@/components/ui";

export function SettingsTabs({ active }: { active: string }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "org", label: "Centre", href: "/app/settings" },
        { key: "users", label: "Utilisateurs & rôles", href: "/app/settings/users" },
        { key: "instructors", label: "Formateurs", href: "/app/settings/instructors" },
        { key: "import", label: "Import Excel", href: "/app/settings/import" },
        { key: "audit", label: "Journal d'audit", href: "/app/settings/audit" },
        { key: "subscription", label: "Abonnement", href: "/app/settings/subscription" },
      ]}
    />
  );
}
