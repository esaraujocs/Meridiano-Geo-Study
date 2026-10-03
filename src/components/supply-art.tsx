// Ilustrações dos suprimentos (Lupa, Bússola, Ampulheta): objetos de latão com um toque de cor, no lugar dos ícones de contorno.
// Usadas na Vitrine do Hub e na Loja. As cores são fixas de propósito (são itens, não interface) e funcionam em tema claro e escuro.
import { useId } from "react";
import type { SupplyId } from "../domain/supplies";

const BRASS = ["#f3d58f", "#c9953f", "#8a5f1f"] as const;

export function SupplyArt({ id, size = 64 }: { id: SupplyId; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const brass = `${uid}b`;
  const glass = `${uid}g`;
  const defs = <defs>
    <linearGradient id={brass} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={BRASS[0]} /><stop offset=".55" stopColor={BRASS[1]} /><stop offset="1" stopColor={BRASS[2]} /></linearGradient>
    <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9fbff" stopOpacity=".95" /><stop offset="1" stopColor="#7fc4d6" stopOpacity=".55" /></linearGradient>
  </defs>;
  return <svg className="supply-art" data-supply={id} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    {defs}
    {id === "lupa" && <>
      <rect x="38" y="38" width="9" height="22" rx="4.2" transform="rotate(-45 42.5 49)" fill="#5a3a1c" />
      <rect x="35.5" y="35.5" width="9" height="6" rx="2" transform="rotate(-45 40 38.5)" fill={`url(#${brass})`} />
      <circle cx="26" cy="26" r="19" fill={`url(#${glass})`} stroke={`url(#${brass})`} strokeWidth="5" />
      <path d="M14.5 22a12.5 12.5 0 0 1 9-8.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".85" />
      <circle cx="31" cy="33" r="1.6" fill="#fff" opacity=".6" />
    </>}
    {id === "bussola" && <>
      <circle cx="32" cy="32" r="28" fill={`url(#${brass})`} />
      <circle cx="32" cy="32" r="22.5" fill="#fbf1d6" stroke="#8a5f1f" strokeWidth="1.2" />
      <g stroke="#8a5f1f" strokeWidth="1.4" strokeLinecap="round">
        <path d="M32 11.5v4M32 48.5v4M11.5 32h4M48.5 32h4" />
        <path d="M17.5 17.5l2.4 2.4M46.5 17.5l-2.4 2.4M17.5 46.5l2.4-2.4M46.5 46.5l-2.4-2.4" strokeWidth="1" opacity=".7" />
      </g>
      <g transform="rotate(38 32 32)">
        <path d="M32 13l5.2 19H26.8z" fill="#c9493a" />
        <path d="M32 51l-5.2-19h10.4z" fill="#f4ead2" stroke="#8a5f1f" strokeWidth=".8" />
      </g>
      <circle cx="32" cy="32" r="3.2" fill={`url(#${brass})`} stroke="#6b4a18" strokeWidth=".8" />
    </>}
    {id === "ampulheta" && <>
      <path d="M17 12c0 11 10 14 12 20-2 6-12 9-12 20h30c0-11-10-14-12-20 2-6 12-9 12-20z" fill={`url(#${glass})`} stroke="#8a5f1f" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M22 14c1 6 5 9 10 12 5-3 9-6 10-12z" fill="#e9b94a" />
      <path d="M32 31v10" stroke="#e9b94a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M23.5 50c1.6-5 5-7 8.5-8 3.5 1 6.9 3 8.5 8z" fill="#e9b94a" />
      <rect x="12" y="7" width="40" height="6" rx="3" fill={`url(#${brass})`} />
      <rect x="12" y="51" width="40" height="6" rx="3" fill={`url(#${brass})`} />
      <path d="M21 17c.4 4 2 6.4 4.4 8.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity=".7" />
    </>}
  </svg>;
}
