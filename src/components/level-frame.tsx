import { useId } from "react";

// Moldura do nível do Mecenato ("Teatro do mundo", da peça de Ortelius): um anel gravado em latão por fora do anel de nível, com quatro rosetas e a
// hachura de gravura. Vai por cima do `.hub-level` (posição absoluta, sem clique) no Hub e na revelação do duelo; quem tem moldura de liga vê esta no lugar.
export function LevelFrame({ id }: { id: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (id !== "moldura-teatro") return null;
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2, r1 = 61, r2 = i % 4 === 0 ? 55.5 : 58;
    return `M${(66 + Math.cos(angle) * r1).toFixed(1)} ${(66 + Math.sin(angle) * r1).toFixed(1)}L${(66 + Math.cos(angle) * r2).toFixed(1)} ${(66 + Math.sin(angle) * r2).toFixed(1)}`;
  }).join("");
  const rosette = (x: number, y: number) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}><circle r="7.5" fill={`url(#${uid}m)`} stroke="#5a3d16" strokeWidth="1" /><path d="M0-5.5l1.6 3.9 3.9 1.6-3.9 1.6L0 5.5l-1.6-3.9-3.9-1.6 3.9-1.6z" fill="#fff4cf" opacity=".9" /></g>;
  return <svg className="mc-level-frame" viewBox="0 0 132 132" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${uid}m`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7df9a" /><stop offset=".5" stopColor="#c9953f" /><stop offset="1" stopColor="#7a5012" /></linearGradient></defs>
    <circle cx="66" cy="66" r="63" fill="none" stroke={`url(#${uid}m)`} strokeWidth="5" />
    <circle cx="66" cy="66" r="59.5" fill="none" stroke="#5a3d16" strokeWidth=".9" opacity=".8" />
    <path d={ticks} stroke="#5a3d16" strokeWidth="1" opacity=".75" />
    {[[66, 3.5], [128.5, 66], [66, 128.5], [3.5, 66]].map(([x, y]) => rosette(x, y))}
  </svg>;
}
