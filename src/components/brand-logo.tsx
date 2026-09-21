import { useId, useSyncExternalStore } from "react";
import { DEFAULT_LOGO_PALETTE, readLogoPalette, resolveLogoPalette, subscribeLogoPalette } from "../domain/logo-palette";

// Logo: um olho cujo "íris" é um globo, com um ponto de "onde fica". `paletteId` força uma paleta
// (usado na prévia do debug); sem ele vale a paleta escolhida neste navegador.
export function BrandLogo({ paletteId, className = "" }: { paletteId?: string; className?: string }) {
  const stored = useSyncExternalStore(subscribeLogoPalette, readLogoPalette, () => DEFAULT_LOGO_PALETTE);
  const palette = resolveLogoPalette(paletteId ?? stored);
  const clip = `logo-globe-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={`brand-logo ${className}`.trim()} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect width="100" height="100" rx="22" fill={palette.tile} />
      <path d="M8 50Q50 -12 92 50Q50 112 8 50Z" fill={palette.sclera} stroke={palette.outline} strokeWidth="4.5" strokeLinejoin="round" />
      <defs><clipPath id={clip}><circle cx="50" cy="50" r="24" /></clipPath></defs>
      <circle cx="50" cy="50" r="24" fill={palette.iris} />
      <g clipPath={`url(#${clip})`} fill="none" stroke={palette.grid} strokeWidth="2">
        <ellipse cx="50" cy="50" rx="10.8" ry="24" />
        <line x1="50" y1="26" x2="50" y2="74" />
        <line x1="26" y1="50" x2="74" y2="50" />
        <line x1="26" y1="38" x2="74" y2="38" />
        <line x1="26" y1="62" x2="74" y2="62" />
      </g>
      <circle cx="58.6" cy="39.9" r="4.6" fill={palette.dot} stroke={palette.ring} strokeWidth="1.4" />
    </svg>
  );
}
