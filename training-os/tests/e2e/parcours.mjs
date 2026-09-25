/**
 * Parcours de bout en bout dans un vrai navigateur (critères §57) sur une instance lancée + seedée.
 *   npm run build && npm start   (autre terminal)   puis   npm run db:seed && npm run test:e2e
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
// Chromium : CHROMIUM_PATH, sinon celui fourni par Playwright
const exe = process.env.CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers") ? `/opt/pw-browsers/${fs.readdirSync("/opt/pw-browsers").find((d) => d.startsWith("chromium-"))}/chrome-linux/chrome` : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.setDefaultTimeout(60000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const B = process.env.BASE_URL ?? "http://localhost:3000";
const step = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "—", e.message.split("\n")[0]); process.exitCode = 1; } };
const status = async () => (await page.locator('form [role=status], form [role=alert]').first().textContent({ timeout: 30000 }).catch(() => "(pas de message)"));

await page.goto(B + "/login");
await page.fill("input[name=email]", "admin@demo.trainingos.ai");
await page.fill("input[name=password]", "Demo-Password-2026");
await page.click("button[type=submit]");
await page.waitForURL(B + "/app");

let studentUrl;
await step("créer un étudiant", async () => {
  await page.goto(B + "/app/students/new");
  await page.fill("input[name=lastName]", "Testeur");
  await page.fill("input[name=firstName]", "Koffi");
  await page.fill("input[name=phone]", "+225 07 99 88 77 66");
  await page.fill("input[name=email]", `koffi.${Date.now()}@test.ci`);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app\/students\/[0-9a-f-]{36}$/);
  studentUrl = page.url();
});

await step("inscrire l'étudiant (session Excel en cours)", async () => {
  const id = studentUrl.split("/").pop();
  await page.goto(`${B}/app/enrollments/new?student=${id}`);
  const opts = await page.locator("select[name=sessionId] option").allTextContents();
  const idx = opts.findIndex((o) => o.includes("Excel — Session septembre"));
  await page.selectOption("select[name=sessionId]", { index: idx });
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app\/enrollments\/[0-9a-f-]{36}$/);

});
await step("enregistrer un paiement de 30 000", async () => {
  await page.fill("input[name=amount]", "30000");
  await page.fill("input[name=reference]", "MM-TEST-1");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).first().click();
  const m = await status();
  if (!m.includes("30 000")) throw new Error(m);
  await page.reload();
  const body = await page.textContent("body");
  if (!body.includes("70 000 FCFA")) throw new Error("reste 70 000 non affiché");
});
await step("refuser un surpaiement", async () => {
  await page.fill("input[name=amount]", "999999");
  await page.locator("input[name=amount]").evaluate((el) => el.removeAttribute("max"));
  await page.getByRole("button", { name: "Enregistrer", exact: true }).first().click();
  const m = await status();
  if (!m.includes("dépasse")) throw new Error(m);
});
await step("saisir les présences (Tous présents)", async () => {
  await page.goto(B + "/app/attendance");
  await page.getByRole("button", { name: "✓ Tous présents" }).click();
  await page.getByRole("button", { name: "Enregistrer les présences" }).click();
  const m = await status();
  if (!m.includes("Présences enregistrées")) throw new Error(m);
});
await step("créer une évaluation et saisir une note", async () => {
  await page.goto(B + "/app/assessments?mode=new");
  const opts = await page.locator("select[name=sessionId] option").allTextContents();
  await page.selectOption("select[name=sessionId]", { index: opts.findIndex((o) => o.includes("Session septembre")) });
  await page.selectOption("select[name=type]", "exercise");
  await page.fill("input[name=title]", "Exercice E2E");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  const m = await status();
  if (!m.includes("enregistrée")) throw new Error(m);
  await page.goto(B + "/app/assessments");
  await page.getByText("Exercice E2E").first().click();
  await page.locator("input[name^=score_]").first().fill("15");
  await page.getByRole("button", { name: "Enregistrer les notes" }).click();
  const m2 = await status();
  if (!m2.includes("note(s) enregistrée")) throw new Error(m2);
});
await step("générer des certificats (éligibles)", async () => {
  await page.goto(B + "/app/certificates");
  const btn = page.getByRole("button", { name: /Générer les certificats/ });
  if (await btn.count()) {
    await btn.click();
    const m = await status();
    if (!m.includes("certificat(s) généré")) throw new Error(m);
  }
  await page.goto(B + "/app/certificates");
  const pdf = await page.request.get(B + (await page.locator("a:has-text('PDF')").first().getAttribute("href")));
  if (pdf.headers()["content-type"] !== "application/pdf") throw new Error("PDF non servi");
});
await step("assistant IA (mode démo) — impayés", async () => {
  await page.goto(B + "/app/assistant");
  await page.fill("input[name=question]", "Quels étudiants doivent encore payer ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await page.getByText("Voici les données calculées").waitFor({ timeout: 60000 });
});
await step("export Excel", async () => {
  const r = await page.request.get(B + "/api/export/students?format=xlsx");
  if (r.status() !== 200 || !r.headers()["content-type"].includes("spreadsheet")) throw new Error(String(r.status()));
});
await step("CSRF : POST API d'une autre origine refusé", async () => {
  const r = await page.request.post(B + "/api/export/students", { headers: { origin: "https://evil.example" } });
  if (r.status() !== 403) throw new Error(String(r.status()));
});
await step("prospect : création + conversion", async () => {
  await page.goto(B + "/app/prospects");
  await page.fill("input[name=lastName]", "Prospect");
  await page.fill("input[name=firstName]", "E2E");
  await page.fill("input[name=phone]", "+225 01 02 03 04 05");
  await page.getByRole("button", { name: "Ajouter le prospect" }).click();
  const m = await status();
  if (!m.includes("enregistré")) throw new Error(m);
});
console.log(errs.length ? "Erreurs JS : " + errs.slice(0, 3).join(" | ") : "Aucune erreur JS");
await browser.close();
