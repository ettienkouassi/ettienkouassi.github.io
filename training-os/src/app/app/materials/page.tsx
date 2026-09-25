import { MaterialsView } from "@/components/pedagogy/materials-view";
import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";

export const metadata = { title: "Supports pédagogiques" };

export default async function MaterialsPage() {
  const ctx = await requirePageOrg(STAFF, "materials.write");
  return (
    <>
      <PageHeader title="Supports pédagogiques" subtitle="Chaque support est associé à une formation, éventuellement un module, avec un niveau de visibilité." />
      <MaterialsView ctx={ctx} />
    </>
  );
}
