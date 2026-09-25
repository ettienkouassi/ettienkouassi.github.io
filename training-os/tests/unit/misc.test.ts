import { describe, expect, it } from "vitest";
import { can, homePathFor } from "@/lib/auth/rbac";
import { generateMeetingDates } from "@/lib/domain/schedule";
import { renderTemplate } from "@/lib/mail";
import { parseCsv, safeCell, toCsv } from "@/lib/tabular";
import { certificateCode } from "@/server/certificates";
import { chunkText } from "@/server/material-index";
import { suggestMapping, validateRows } from "@/server/import";
import { passwordSchema } from "@/lib/security/password";
import { slugify } from "@/lib/format";

describe("Rôles et permissions (§29)", () => {
  it("le gestionnaire n'a pas les droits d'administration", () => {
    expect(can("manager", "payments.write")).toBe(true);
    expect(can("manager", "payments.cancel")).toBe(false);
    expect(can("manager", "users.manage")).toBe(false);
    expect(can("manager", "settings.write")).toBe(false);
  });
  it("le formateur n'accède ni aux paiements ni aux étudiants globalement", () => {
    expect(can("instructor", "payments.read")).toBe(false);
    expect(can("instructor", "students.read")).toBe(false);
    expect(can("instructor", "attendance.write")).toBe(true);
  });
  it("l'étudiant et le super admin n'ont aucune permission dans les données d'un centre", () => {
    expect(can("student", "students.read")).toBe(false);
    expect(can("super_admin", "students.read")).toBe(false);
    expect(homePathFor("super_admin")).toBe("/admin");
  });
});

describe("Import Excel (§47)", () => {
  it("propose une correspondance de colonnes", () => {
    const m = suggestMapping(["Nom", "Prénom", "Téléphone", "E-mail", "Formation", "Montant"]);
    expect(m).toMatchObject({ lastName: 0, firstName: 1, phone: 2, email: 3, course: 4, amount: 5 });
  });
  it("détecte les erreurs de lignes", () => {
    const rows = validateRows(
      { headers: ["Nom", "Prénom", "Email"], rows: [["Kouadio", "Jean", "jean@x.ci"], ["", "Awa", "pas-un-email"]] },
      { lastName: 0, firstName: 1, email: 2 },
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual(["Nom manquant", "Email invalide"]);
  });
  it("découpe un nom complet", () => {
    const [r] = validateRows({ headers: ["Nom complet"], rows: [["KOUADIO Jean Marc"]] }, { fullName: 0 });
    expect(r.values.lastName).toBe("KOUADIO");
    expect(r.values.firstName).toBe("Jean Marc");
  });
});

describe("CSV", () => {
  it("lit un CSV français (point-virgule, guillemets, BOM)", () => {
    const t = parseCsv('﻿Nom;Prénom;Note\n"Kouadio; Jr";Jean;"a ""b"""\n');
    expect(t.headers).toEqual(["Nom", "Prénom", "Note"]);
    expect(t.rows[0]).toEqual(["Kouadio; Jr", "Jean", 'a "b"']);
  });
  it("neutralise l'injection de formules à l'export", () => {
    expect(safeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(safeCell("+225 07")).toBe("'+225 07");
    expect(toCsv(["a"], [["@x"]])).toContain("'@x");
  });
});

describe("Divers", () => {
  it("numéro de certificat unique et normalisé", () => {
    expect(certificateCode("cfcm", 2026, 125)).toBe("CFCM-2026-000125");
  });
  it("génère les séances selon les jours", () => {
    expect(generateMeetingDates("2026-09-28", "2026-10-04", [1, 3, 5])).toEqual(["2026-09-28", "2026-09-30", "2026-10-02"]);
  });
  it("modèles de message : variables et objet sur une ligne", () => {
    expect(renderTemplate("Bonjour {{prenom}} {{inconnu}}", { prenom: "Awa" })).toBe("Bonjour Awa ");
    expect(renderTemplate("Objet {{x}}", { x: "a\r\nBcc: pirate@x" }, true)).toBe("Objet a Bcc: pirate@x");
  });
  it("découpe les supports pour la recherche", () => {
    const chunks = chunkText("mot ".repeat(1000), 500, 50);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
  });
  it("politique de mot de passe", () => {
    expect(passwordSchema.safeParse("court").success).toBe(false);
    expect(passwordSchema.safeParse("sansmajuscule1").success).toBe(false);
    expect(passwordSchema.safeParse("Correct-Horse-9").success).toBe(true);
  });
  it("slug", () => {
    expect(slugify("Excel — Du débutant à Expert")).toBe("excel-du-debutant-a-expert");
  });
});

describe("Excel", () => {
  it("export puis relecture d'un fichier .xlsx", async () => {
    const { toXlsx, parseXlsx } = await import("@/lib/tabular");
    const buf = await toXlsx("Étudiants", ["Nom", "Prénom", "Montant"], [["Kouadio", "Jean", 100000], ["=cmd", "X", 1]]);
    const t = await parseXlsx(buf);
    expect(t.headers).toEqual(["Nom", "Prénom", "Montant"]);
    expect(t.rows[0]).toEqual(["Kouadio", "Jean", "100000"]);
    expect(t.rows[1][0]).toBe("'=cmd");
  });
});
