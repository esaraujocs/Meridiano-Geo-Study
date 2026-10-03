// Ilustrações dos suprimentos (Lupa, Bússola, Primeira letra, Pular, Segunda chance, Escudo, Ampulheta): objetos de latão com um toque de cor, no lugar dos ícones de contorno.
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
    {id === "tonico" && <g transform="translate(-6.400 -5.800) scale(1.200)">
      <rect x="27" y="5" width="10" height="8" rx="2.4" fill={`url(#${brass})`} />
      <path d="M28.5 13h7v8.5c6.8 2.6 11.5 8.4 11.5 15.4A15 15 0 0 1 32 52 15 15 0 0 1 17 36.900c0-7 4.700-12.800 11.500-15.400z" fill={`url(#${glass})`} stroke="#8a5f1f" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M17.600 35.500c4.200-2.600 8.400 1.600 14.400-.4 5.200-1.700 9.200.5 14.400 1.300A14.400 14.400 0 0 1 32 51.400 14.400 14.400 0 0 1 17.600 35.500z" fill="#45b98c" />
      <path d="M17.600 35.500c4.200-2.600 8.400 1.600 14.400-.4 5.200-1.700 9.200.5 14.400 1.300-.4 1.800-1 3.400-1.800 4.800H19.500a14 14 0 0 1-1.900-5.700z" fill="#d6e86a" opacity=".55" />
      <path d="M32 31.500l1.900 4.600 4.600 1.900-4.600 1.900L32 44.500l-1.900-4.600-4.600-1.900 4.600-1.900z" fill="#fff8d8" stroke="#e6b04a" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M22.500 31c.9-2.400 2.800-4.200 5.200-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <circle cx="39.500" cy="29" r="1.400" fill="#fff" opacity=".6" />
    </g>}
    {id === "lanterna" && <>
      <circle cx="32" cy="36" r="27" fill="#ffe7a0" opacity=".32" />
      <path d="M24.5 15a7.5 7.5 0 0 1 15 0" fill="none" stroke={`url(#${brass})`} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M21 24h22l-3-9H24z" fill={`url(#${brass})`} />
      <rect x="19.5" y="23" width="25" height="26" rx="4.5" fill="#fff2bd" stroke="#8a5f1f" strokeWidth="1.4" />
      <rect x="19.5" y="23" width="25" height="26" rx="4.5" fill="#f6b73b" opacity=".35" />
      <path d="M32 29c1.6 3.6 5.2 5.4 5.2 9.6a5.2 5.2 0 0 1-10.4 0c0-2.2 1.1-3.7 2.2-4.8.2 1.5.9 2.2 1.6 2.6C30.4 34.4 30.8 31.6 32 29z" fill="#ee8a22" stroke="#fde7a6" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M26.2 24v25M37.8 24v25" stroke="#8a5f1f" strokeWidth="1.2" opacity=".55" />
      <rect x="17" y="48" width="30" height="8" rx="3.2" fill={`url(#${brass})`} />
      <path d="M23 27.5v8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".75" />
    </>}
    {id === "vizinho" && <>
      <circle cx="32" cy="32" r="28" fill={`url(#${brass})`} />
      <circle cx="32" cy="32" r="22.5" fill="#fbf1d6" stroke="#8a5f1f" strokeWidth="1.2" />
      <path d="M31 17.5L17.5 21.5 15.5 37 30 45z" fill="#cfdcc6" stroke="#6b4a18" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M31 17.5L46 20.5 49 36 40 46 30 45z" fill="#e6b04a" stroke="#6b4a18" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M31 17.5L30 45" stroke="#6b4a18" strokeWidth="1.4" strokeDasharray="2.6 2.4" />
      <circle cx="41" cy="31" r="3.4" fill="#fff" opacity=".85" /><circle cx="41" cy="31" r="1.5" fill="#c9493a" />
    </>}
    {id === "letra" && <>
      <rect x="8" y="7" width="48" height="40" rx="8" fill={`url(#${brass})`} />
      <rect x="12" y="11" width="40" height="32" rx="5.5" fill="#fbf1d6" stroke="#8a5f1f" strokeWidth="1.1" />
      <path d="M21.5 38L32 14.5 42.5 38M25.4 30h13.2" fill="none" stroke="#c9493a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="54" r="3.6" fill={`url(#${brass})`} /><circle cx="32" cy="54" r="3.6" fill={`url(#${brass})`} /><circle cx="43" cy="54" r="3.6" fill={`url(#${brass})`} />
      <path d="M16 16.5h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </>}
    {id === "pular" && <>
      <circle cx="32" cy="32" r="28" fill={`url(#${brass})`} />
      <circle cx="32" cy="32" r="22.5" fill="#3f8f7c" stroke="#2a6a5a" strokeWidth="1.2" />
      <path d="M20 21.5v21L38 32z" fill="#fbf1d6" strokeLinejoin="round" stroke="#fbf1d6" strokeWidth="2.4" />
      <rect x="40.5" y="21" width="5.5" height="22" rx="2.2" fill="#fbf1d6" />
      <path d="M17.5 24a17 17 0 0 1 9-9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".5" />
    </>}
    {id === "retorno" && <>
      <circle cx="32" cy="32" r="28" fill={`url(#${brass})`} />
      <circle cx="32" cy="32" r="22.5" fill="#d9783f" stroke="#a24f22" strokeWidth="1.2" />
      <path d="M44.5 32A12.5 12.5 0 1 1 40.8 23.2" fill="none" stroke="#fbf1d6" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M44.4 19.4L37.2 26.8 46.4 28.6z" fill="#fbf1d6" stroke="#fbf1d6" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17.5 24a17 17 0 0 1 9-9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".45" />
    </>}
    {id === "escudo" && <>
      <path d="M32 4L55 11.5V30C55 44.5 45 54.5 32 60 19 54.5 9 44.5 9 30V11.5z" fill={`url(#${brass})`} />
      <path d="M32 9.5L49.5 15.2V30C49.5 41.5 41.8 49.6 32 54.2 22.2 49.6 14.5 41.5 14.5 30V15.2z" fill="#2f6f9a" stroke="#1d4a6b" strokeWidth="1.2" />
      <path d="M32 9.5L49.5 15.2V30C49.5 41.5 41.8 49.6 32 54.2z" fill="#000" opacity=".12" />
      <g transform="translate(21.4 19.2) scale(.9)"><path d="M12 1c1 5 7 7.5 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5.3 2 1.2 3 2.2 3.5C10 9 10.5 5 12 1z" fill="#f4b73a" stroke="#fde7a6" strokeWidth="1.1" strokeLinejoin="round" /></g>
      <path d="M19.5 17.6l8-2.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".5" />
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
