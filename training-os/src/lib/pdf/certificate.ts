import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

export type CertificateData = {
  code: string;
  organizationName: string;
  studentName: string;
  courseName: string;
  durationHours: number | null;
  completionDate: string; // texte déjà formaté
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  verifyUrl: string;
  logo?: { bytes: Buffer; mime: string } | null;
};

/** Les polices standard PDF sont en WinAnsi : on remplace les caractères non représentables. */
function winAnsi(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function centered(page: ReturnType<PDFDocument["addPage"]>, text: string, y: number, font: PDFFont, size: number, color = rgb(0.1, 0.12, 0.2)) {
  const t = winAnsi(text);
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

export async function renderCertificatePdf(d: CertificateData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificat ${d.code}`);
  pdf.setAuthor(winAnsi(d.organizationName));
  pdf.setProducer("TRAINING OS AI");
  const page = pdf.addPage([842, 595]); // A4 paysage
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const W = page.getWidth();
  const H = page.getHeight();
  const accent = rgb(0.16, 0.33, 0.85);

  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: accent, borderWidth: 3 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: rgb(0.8, 0.84, 0.95), borderWidth: 1 });

  if (d.logo) {
    try {
      const img = d.logo.mime === "image/png" ? await pdf.embedPng(d.logo.bytes) : await pdf.embedJpg(d.logo.bytes);
      const scale = Math.min(70 / img.height, 160 / img.width);
      page.drawImage(img, { x: (W - img.width * scale) / 2, y: H - 125, width: img.width * scale, height: img.height * scale });
    } catch {
      // logo illisible : on continue sans
    }
  }

  centered(page, d.organizationName.toUpperCase(), H - 150, bold, 16, accent);
  centered(page, "CERTIFICAT DE FORMATION", H - 200, bold, 30);
  centered(page, "Ce certificat est décerné à", H - 240, regular, 13, rgb(0.35, 0.38, 0.45));
  centered(page, d.studentName, H - 285, serif, 34);
  centered(page, "pour avoir suivi avec succès la formation", H - 320, regular, 13, rgb(0.35, 0.38, 0.45));
  centered(page, d.courseName, H - 352, bold, 20, accent);
  const details = [d.durationHours ? `Durée : ${d.durationHours} heures` : null, `Date : ${d.completionDate}`].filter(Boolean).join("   •   ");
  centered(page, details, H - 382, regular, 12);

  // Signature
  page.drawLine({ start: { x: 90, y: 110 }, end: { x: 290, y: 110 }, thickness: 1, color: rgb(0.5, 0.5, 0.55) });
  page.drawText(winAnsi(d.signatoryName ?? "La Direction"), { x: 90, y: 92, size: 11, font: bold });
  if (d.signatoryTitle) page.drawText(winAnsi(d.signatoryTitle), { x: 90, y: 78, size: 10, font: regular, color: rgb(0.4, 0.4, 0.45) });

  // QR code de vérification
  const qr = await QRCode.toBuffer(d.verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 240 });
  const qrImg = await pdf.embedPng(qr);
  page.drawImage(qrImg, { x: W - 180, y: 60, width: 100, height: 100 });
  page.drawText(winAnsi(`N° ${d.code}`), { x: W - 190, y: 48, size: 9, font: bold });
  const vt = winAnsi("Vérifier l'authenticité :");
  page.drawText(vt, { x: 330, y: 92, size: 9, font: regular, color: rgb(0.4, 0.4, 0.45) });
  page.drawText(winAnsi(d.verifyUrl), { x: 330, y: 78, size: 9, font: regular, color: accent });

  return Buffer.from(await pdf.save());
}
