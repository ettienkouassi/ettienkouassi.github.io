"use client";

export function PrintButton({ label = "🖨 Imprimer / PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-secondary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
