import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { SettingsTabs } from "../tabs";
import { analyzeImportAction, commitImportAction } from "./actions";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import Excel" };

export default async function ImportPage() {
  await requirePageOrg(STAFF, "import.run");
  return (
    <>
      <PageHeader title="Import Excel / CSV" subtitle="Reprenez vos fichiers existants : étudiants, inscriptions et paiements déjà reçus." />
      <SettingsTabs active="import" />
      <ImportWizard analyze={analyzeImportAction} commit={commitImportAction} aiAvailable={process.env.AI_PROVIDER === "anthropic" && !!process.env.ANTHROPIC_API_KEY} />
    </>
  );
}
