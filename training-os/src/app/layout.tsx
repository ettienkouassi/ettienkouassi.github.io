import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TRAINING OS AI", template: "%s · TRAINING OS AI" },
  description: "Le système d'exploitation des centres de formation : gestion, pédagogie, finances et intelligence artificielle.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2554eb" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lecture des en-têtes : rendu dynamique obligatoire pour appliquer le nonce CSP à chaque requête
  await headers();
  return (
    <html lang="fr">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
