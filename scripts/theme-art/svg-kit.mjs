// Kit de desenho dos temas elaborados: cores de tinta, curvas (spline), faixas com espessura, ondas e o galeão. Gera SVG em texto, sem dependências.
export const INK = "#4A3320";
export const PAPER = "#EFE2BA";
export const SAIL = "#F5EBCB";
export const f = (n) => Math.round(n * 10) / 10;
const uri = (s) => "data:image/svg+xml," + encodeURIComponent(s);

/** Catmull-Rom → pontos amostrados. */
export function spline(points, per = 14) {
  const out = [];
  const p = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < p.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let s = 0; s < per; s += 1) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
/** Faixa em torno de uma linha central: bordas, normais e tangentes. */
export function band(center, width) {
  const n = center.length, left = [], right = [], tan = [], nor = [];
  for (let i = 0; i < n; i += 1) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx, w = width(i / (n - 1)) / 2;
    tan.push([tx, ty]); nor.push([nx, ny]);
    left.push([center[i][0] + nx * w, center[i][1] + ny * w]);
    right.push([center[i][0] - nx * w, center[i][1] - ny * w]);
  }
  return { left, right, tan, nor, center };
}
export const poly = (arr) => arr.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");
const at = (c, nor, i, w) => [c[i][0] + nor[i][0] * w, c[i][1] + nor[i][1] * w];

/** Onda ao longo de uma linha de água. */
export const wavePath = (x0, x1, y, amp, len, phase = 0) => {
  let d = `M${x0} ${f(y)}`;
  for (let x = x0; x < x1; x += len) d += ` q${f(len / 4)} ${f(-amp)} ${f(len / 2)} 0 t${f(len / 2)} 0`;
  return d;
};

export function galleonSvg(ink = INK) {
  const W = 300, H = 232, wl = 190;
  const sail = (d, seams = [], cross = null) => `<path d='${d}' fill='${SAIL}' stroke='${ink}' stroke-width='1.5' stroke-linejoin='round'/>${seams.map((s) => `<path d='${s}' fill='none' stroke='${ink}' stroke-width='.7' stroke-opacity='.5'/>`).join("")}${cross ? `<g transform='translate(${cross[0]} ${cross[1]}) scale(${cross[2] || 1})' fill='${ink}' fill-opacity='.85'><path d='M-2.4-13H2.4V-2.4H13V2.4H2.4V13H-2.4V2.4H-13V-2.4H-2.4Z'/></g>` : ""}`;
  const yard = (x0, x1, y) => `<path d='M${x0} ${y}Q${(x0 + x1) / 2} ${y + 2} ${x1} ${y}' fill='none' stroke='${ink}' stroke-width='2.4' stroke-linecap='round'/>`;
  const flag = (x, y, len, h) => `<path d='M${x} ${y}C${x + len * 0.3} ${y - 3} ${x + len * 0.6} ${y + 3} ${x + len} ${y}L${x + len - 9} ${y + h / 2}L${x + len} ${y + h}C${x + len * 0.6} ${y + h + 3} ${x + len * 0.3} ${y + h - 3} ${x} ${y + h}Z' fill='${ink}' fill-opacity='.82' stroke='${ink}' stroke-width='.8' stroke-linejoin='round'/>`;
  const hullPath = "M50 192C44 176 41 160 40 128L98 128L100 142Q160 154 214 140L226 134L232 126Q254 136 258 154Q250 176 226 188Q160 198 50 192Z";
  const parts = [];
  // velas ao fundo: estais e joanete
  parts.push(`<path d='M206 30L286 104M206 30L222 128M206 44L282 102' fill='none' stroke='${ink}' stroke-width='.8' stroke-opacity='.7'/>`);
  parts.push(`<path d='M206 46Q246 64 280 100Q262 106 230 102Q212 98 208 100Z' fill='${SAIL}' stroke='${ink}' stroke-width='1.3' stroke-linejoin='round'/>`);
  // enxárcias (atrás das velas)
  parts.push(`<g fill='none' stroke='${ink}' stroke-width='.7' stroke-opacity='.65'><path d='M144 70L106 140M144 70L116 141M144 70L178 143M144 70L188 142M206 80L190 140M206 80L224 137M74 100L52 128M74 100L96 128'/></g>`);
  // mastros
  parts.push(`<g stroke='${ink}' stroke-linecap='round'><path d='M144 144V16' stroke-width='3'/><path d='M206 138V30' stroke-width='2.6'/><path d='M74 130V46' stroke-width='2.4'/><path d='M234 128L290 100' stroke-width='3'/></g>`);
  // mezena (latina)
  parts.push(`<path d='M48 50Q80 62 116 100Q88 106 54 102Q40 78 48 50Z' fill='${SAIL}' stroke='${ink}' stroke-width='1.5' stroke-linejoin='round'/><path d='M46 48L118 102' stroke='${ink}' stroke-width='2.4' stroke-linecap='round'/><path d='M62 62Q58 82 62 100M78 72Q74 88 76 102M94 86Q90 96 92 104' fill='none' stroke='${ink}' stroke-width='.7' stroke-opacity='.5'/>`);
  // grande: pano baixo, gávea e joanete
  parts.push(sail("M106 74Q102 100 108 122Q144 134 182 122Q188 100 182 74Z", ["M124 74Q121 100 125 128", "M144 74Q142 100 144 132", "M164 74Q163 100 165 128"], [144, 98, 1.05]));
  parts.push(yard(102, 188, 74));
  parts.push(sail("M116 38Q112 54 116 68Q144 76 172 68Q176 54 172 38Z", ["M130 38Q128 54 130 72", "M144 38Q143 54 144 74", "M158 38Q157 54 159 72"]));
  parts.push(yard(112, 178, 38));
  parts.push(sail("M124 16Q121 26 124 33Q144 38 164 33Q167 26 164 16Z", ["M144 16V38"]));
  parts.push(yard(120, 168, 16));
  // traquete
  parts.push(sail("M180 80Q176 100 181 118Q206 126 232 118Q236 100 231 80Z", ["M194 80Q192 100 195 122", "M206 80V124", "M218 80Q220 100 219 122"], [206, 100, .8]));
  parts.push(yard(176, 236, 80));
  parts.push(sail("M188 50Q185 64 188 76Q206 80 224 76Q227 64 224 50Z", ["M206 50V80"]));
  parts.push(yard(184, 228, 50));
  // flâmulas
  parts.push(flag(145, 8, 44, 12), flag(207, 24, 32, 10), flag(75, 44, 28, 9));
  // enxárcias
    // casco
  parts.push(`<path d='${hullPath}' fill='${PAPER}' stroke='${ink}' stroke-width='1.8' stroke-linejoin='round'/>`);
  parts.push(`<clipPath id='hull'><path d='${hullPath}'/></clipPath><g clip-path='url(#hull)'><path d='M30 158Q150 176 270 156V200H30Z' fill='url(#hat)'/><path d='M38 130Q150 154 262 132V146Q150 168 38 146Z' fill='${ink}' fill-opacity='.2'/></g>`);
  parts.push(`<g fill='none' stroke='${ink}' stroke-linecap='round'><path d='M41 146Q150 166 254 148' stroke-width='1.4'/><path d='M44 160Q150 180 248 162' stroke-width='1.1'/><path d='M42 136Q150 158 256 138' stroke-width='.9' stroke-opacity='.7'/></g>`);
  // portinholas
  parts.push(`<g fill='${ink}' fill-opacity='.85'>${[112, 128, 144, 160, 176, 192, 208].map((x) => `<rect x='${x}' y='${150 + Math.sin((x - 112) / 96 * Math.PI) * 1.6}' width='6' height='5' rx='.6'/>`).join("")}</g>`);
  // castelo de popa e proa
  parts.push(`<path d='M42 128L42 106Q42 98 50 98H90Q98 98 98 106L100 130Z' fill='${PAPER}' stroke='${ink}' stroke-width='1.6' stroke-linejoin='round'/><path d='M42 114H99' stroke='${ink}' stroke-width='1' stroke-opacity='.7'/>`);
  parts.push(`<g fill='${ink}' fill-opacity='.85'>${[50, 62, 74, 86].map((x) => `<path d='M${x - 3} 128V121Q${x - 3} 116 ${x} 116Q${x + 3} 116 ${x + 3} 121V128Z'/>`).join("")}</g>`);
  parts.push(`<g stroke='${ink}' stroke-width='1' fill='none'><path d='M42 98V92H98V98M42 92l4-4M98 92l-4-4'/>${Array.from({ length: 10 }, (_, i) => `<path d='M${48 + i * 5.2} 92V98'/>`).join("")}</g>`);
  parts.push(`<path d='M214 140L226 134L232 126L226 124L212 130Z' fill='${PAPER}' stroke='${ink}' stroke-width='1.4' stroke-linejoin='round'/><path d='M60 90V74L74 70' stroke='${ink}' stroke-width='1' fill='none'/>`);
  parts.push(`<path d='M226 124V116M226 116l14 4' stroke='${ink}' stroke-width='1' fill='none'/><circle cx='50' cy='90' r='2.2' fill='${ink}'/>`);
  // água
  parts.push(`<path d='${wavePath(6, 296, wl + 2, 2.6, 15)}' fill='none' stroke='${ink}' stroke-width='1.3' stroke-opacity='.85'/><path d='${wavePath(20, 282, wl + 11, 2.3, 22)}' fill='none' stroke='${ink}' stroke-width='1' stroke-opacity='.55'/><path d='${wavePath(38, 260, wl + 20, 2, 28)}' fill='none' stroke='${ink}' stroke-width='.9' stroke-opacity='.4'/>`);
  parts.push(`<g fill='none' stroke='${ink}' stroke-width='1.1' stroke-linecap='round' stroke-opacity='.85'><path d='M232 190q8-2 12-8M240 192q10 0 16-8M258 188q8 0 12-6'/><path d='M50 192q-8-2-14-8M40 196q-10-1-18-8'/></g>`);
  const defs = `<defs><pattern id='hat' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(40)'><path d='M0 0V5' stroke='${ink}' stroke-width='.8' stroke-opacity='.55'/></pattern></defs>`;
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'>${defs}${parts.join("")}</svg>`;
}

/** Engrossa todos os traços: figuras pequenas precisam de linha mais grossa para não sumir. */
export const bold = (svg, k) => svg.replace(/stroke-width='([0-9.]+)'/g, (m, w) => `stroke-width='${(+w * k).toFixed(2)}'`);
export const uriOf = (svg) => "data:image/svg+xml," + encodeURIComponent(svg);
