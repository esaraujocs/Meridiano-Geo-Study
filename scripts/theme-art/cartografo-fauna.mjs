// Navios e criaturas do mar do tema Cartógrafo, no espírito da Carta Marina e da arte nórdica: cabeças de dragão, fitas entrelaçadas, espirais,
// drakkar, kraken, serpente-do-mar, baleia-ilha, cavalo-d'água e a serpente de Midgard. Cada figura sai por código, com o traço pensado para 90–150 px na tela.
import { INK, PAPER, SAIL, f, spline, band, poly, wavePath, galleonSvg, bold } from "./svg-kit.mjs";

const svgOf = (w, h, body, defs = "") => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${defs}${body}</svg>`;
const line = (ink, w = 2.4, extra = "") => `fill='none' stroke='${ink}' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round' ${extra}`;
const fillP = (ink, w = 2.4, fill = PAPER) => `fill='${fill}' stroke='${ink}' stroke-width='${w}' stroke-linejoin='round' stroke-linecap='round'`;
const water = (x0, x1, y, ink) => `<path d='${wavePath(x0, x1, y, 2.6, 15)}' ${line(ink, 2, "stroke-opacity='.85'")}/><path d='${wavePath(x0 + 10, x1 - 14, y + 9, 2.4, 22)}' ${line(ink, 1.6, "stroke-opacity='.5'")}/>`;
const flag = (ink, x, y, len = 34, h = 11) => `<path d='M${x} ${y}C${x + len * 0.3} ${y - 3} ${x + len * 0.6} ${y + 3} ${x + len} ${y}L${x + len - 8} ${y + h / 2}L${x + len} ${y + h}C${x + len * 0.6} ${y + h + 3} ${x + len * 0.3} ${y + h - 3} ${x} ${y + h}Z' fill='${ink}' fill-opacity='.85' stroke='${ink}' stroke-width='1' stroke-linejoin='round'/>`;
const hatchDefs = (ink, id = "h") => `<pattern id='${id}' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(40)'><path d='M0 0V5' stroke='${ink}' stroke-width='1' stroke-opacity='.55'/></pattern>`;
/** Fita nórdica: um traço de tinta com o miolo de papel por cima (dois filetes paralelos). */
const ribbon = (d, ink, w = 5.4) => `<path d='${d}' ${line(ink, w)}/><path d='${d}' ${line(PAPER, w * 0.46)}/>`;
/** Espiral de quadril (motivo nórdico), do raio r para dentro. */
const spiral = (cx, cy, r, turns, ink, w = 1.6, start = 0) => {
  let d = "";
  for (let i = 0; i <= 28; i += 1) { const t = i / 28, a = start + t * turns * Math.PI * 2, rad = r * (1 - t * 0.85); d += `${i ? "L" : "M"}${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`; }
  return `<path d='${d}' ${line(ink, w)}/>`;
};
const clipAbove = (id, W, wl) => `<clipPath id='${id}'><path d='${wavePath(0, W, wl, 2.4, 14)} V0 H0Z'/></clipPath>`;

/** Cabeça de dragão nórdica, virada para a direita (coordenadas locais com ~64 de comprimento), com focinho de ponta enrolada, presas e cristas em espiral. */
export function dragonHead(ink, x, y, rot = 0, k = 1) {
  return `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${k})'>
${ribbon("M8 -12C0 -24 -14 -26 -22 -18C-28 -12 -22 -4 -16 -8C-12 -11 -16 -15 -20 -13", ink, 5.2)}${ribbon("M0 5C-10 5 -20 11 -24 21C-27 28 -20 32 -17 27C-15 23 -19 20 -22 22", ink, 5.2)}
<path d='M-2 6C0 -8 10 -15 22 -14C32 -13 40 -11 50 -13C56 -15 60 -21 58 -28C66 -22 68 -12 62 -6C58 -2 50 0 42 1C34 2 26 3 18 7L-2 12Z' ${fillP(ink, 2.6)}/>
<path d='M18 7C28 6 40 4 52 2C50 10 38 15 26 15C16 15 6 13 -2 12Z' ${fillP(ink, 2.6)}/><path d='M18 7C28 6 40 4 52 2C50 10 38 15 26 15C16 15 6 13 -2 12Z' fill='${ink}' fill-opacity='.22'/>
<g fill='${PAPER}' stroke='${ink}' stroke-width='1.5' stroke-linejoin='round'><path d='M30 2.6l2.8 7l2.8-7.4Z'/><path d='M40 1.8l2.6 6.6l2.6-7Z'/><path d='M48 1l2.2 5.6l2.2-6Z'/></g>
<path d='M17 -7Q23 -12 29 -7Q23 -3.6 17 -7Z' fill='${ink}'/><circle cx='52' cy='-11' r='1.5' fill='${ink}'/>${spiral(11, 0, 6.5, 1.6, ink, 1.7)}
</g>`;
}

/** Drakkar: proa de dragão, popa em espiral, escudos e vela de losangos. */
export function drakkarSvg(ink = INK) {
  const W = 260, H = 140, wl = 112;
  const sail = "M78 26H158L154 72Q118 80 82 72Z";
  const bez = (t) => [0, 1].map((k) => { const p0 = [16, 56][k], p1 = [118, 100][k], p2 = [220, 54][k]; return (1 - t) * (1 - t) * p0 + 2 * t * (1 - t) * p1 + t * t * p2; });
  const shields = Array.from({ length: 9 }, (_, i) => { const [x, y] = bez(0.18 + i * 0.08); return `<circle cx='${f(x)}' cy='${f(y + 8)}' r='6.4' fill='${i % 2 ? PAPER : ink}' fill-opacity='${i % 2 ? 1 : 0.55}' stroke='${ink}' stroke-width='1.8'/><path d='M${f(x - 6)} ${f(y + 8)}H${f(x + 6)}M${f(x)} ${f(y + 2)}V${f(y + 14)}' ${line(ink, 1.2, "stroke-opacity='.7'")}/>`; }).join("");
  return svgOf(W, H, `<clipPath id='sl'><path d='${sail}'/></clipPath><pattern id='dm' width='16' height='16' patternUnits='userSpaceOnUse'><path d='M8 0L16 8L8 16L0 8Z' fill='none' stroke='${ink}' stroke-width='2' stroke-opacity='.75'/></pattern>
${ribbon("M16 56C6 46 4 32 13 26C21 21 27 29 21 33C17 35 15 31 18 29", ink, 5.6)}
<path d='${sail}' ${fillP(ink, 2.6, SAIL)}/><path d='${sail}' fill='url(#dm)' clip-path='url(#sl)'/><path d='M76 26H160' ${line(ink, 3.4)}/><path d='M118 84V16' ${line(ink, 3.4)}/>${flag(ink, 119, 14, 32, 10)}
<path d='M16 56Q118 100 220 54Q216 100 174 110Q118 120 62 110Q24 102 16 56Z' ${fillP(ink, 2.6)}/>
<path d='M22 70Q118 108 214 68M30 84Q118 114 204 84' ${line(ink, 1.6, "stroke-opacity='.65'")}/>${shields}
${ribbon("M206 76C222 68 226 56 222 48", ink, 7)}${dragonHead(ink, 220, 50, -46, 0.78)}
${Array.from({ length: 5 }, (_, i) => `<path d='M${74 + i * 24} 108L${62 + i * 24} 128' ${line(ink, 2.2)}/>`).join("")}
${water(4, 256, wl + 4, ink)}`);
}

/** Snekkja: barco de guerra pequeno, vela de xadrez e proa e popa em curva. */
export function snekkjaSvg(ink = INK) {
  const W = 230, H = 130, wl = 104;
  const sail = "M76 28H148L144 66Q112 72 80 66Z";
  return svgOf(W, H, `<clipPath id='sl'><path d='${sail}'/></clipPath><pattern id='ck' width='24' height='24' patternUnits='userSpaceOnUse'><rect width='12' height='12' fill='${ink}' fill-opacity='.55'/><rect x='12' y='12' width='12' height='12' fill='${ink}' fill-opacity='.55'/></pattern>
${ribbon("M18 62C8 52 8 40 16 36C23 33 26 41 20 43", ink, 5.4)}${ribbon("M208 60C218 50 218 38 210 34C203 31 200 39 206 41", ink, 5.4)}
<path d='${sail}' ${fillP(ink, 2.6, SAIL)}/><path d='${sail}' fill='url(#ck)' clip-path='url(#sl)'/><path d='M74 28H150' ${line(ink, 3.2)}/><path d='M112 80V20' ${line(ink, 3.2)}/>${flag(ink, 113, 18, 28, 9)}
<path d='M18 62Q112 94 208 60Q202 94 162 102Q112 110 62 102Q28 94 18 62Z' ${fillP(ink, 2.6)}/>
<path d='M26 74Q112 100 200 72' ${line(ink, 1.6, "stroke-opacity='.65'")}/>
${Array.from({ length: 6 }, (_, i) => `<circle cx='${58 + i * 20}' cy='${86 + Math.sin(i / 5 * Math.PI) * 3}' r='5.2' fill='${i % 2 ? PAPER : ink}' fill-opacity='${i % 2 ? 1 : 0.55}' stroke='${ink}' stroke-width='1.6'/>`).join("")}
${Array.from({ length: 4 }, (_, i) => `<path d='M${68 + i * 26} 100L${58 + i * 26} 118' ${line(ink, 2.2)}/>`).join("")}
${water(4, 226, wl + 3, ink)}`);
}

/** Knarr: navio de carga de casco largo, tábuas sobrepostas, vela listrada, barris e remo de leme. */
export function knarrSvg(ink = INK) {
  const W = 240, H = 140, wl = 112;
  const sail = "M62 28H164L162 70Q112 78 64 70Z";
  const hull = "M22 76Q120 88 220 72Q216 108 176 114Q120 122 64 114Q30 106 22 76Z";
  return svgOf(W, H, `<clipPath id='sl'><path d='${sail}'/></clipPath><clipPath id='hl'><path d='${hull}'/></clipPath>${hatchDefs(ink)}
${ribbon("M222 72C230 64 230 52 224 48", ink, 5.2)}${ribbon("M22 76C14 68 14 56 20 52", ink, 5.2)}
<path d='M62 28H164L162 70Q112 78 64 70Z' ${fillP(ink, 2.6, SAIL)}/><g clip-path='url(#sl)' fill='${ink}' fill-opacity='.5'><rect x='62' y='26' width='26' height='60'/><rect x='114' y='26' width='24' height='60'/></g>
<path d='M64 28H162' ${line(ink, 3.4)}/><path d='M113 84V18' ${line(ink, 3.4)}/>${flag(ink, 114, 16, 30, 10)}<path d='M113 30L176 76M113 30L48 76' ${line(ink, 1.2, "stroke-opacity='.55'")}/>
<path d='M52 78L34 116L44 118L64 82Z' ${fillP(ink, 2.2)}/>
<path d='${hull}' ${fillP(ink, 2.6)}/><g clip-path='url(#hl)'><path d='M20 104Q120 118 224 100V124H20Z' fill='url(#h)'/></g>
<path d='M26 86Q120 98 218 82M30 96Q120 108 212 92' ${line(ink, 1.7, "stroke-opacity='.7'")}/>${Array.from({ length: 11 }, (_, i) => `<path d='M${40 + i * 16} ${87 + Math.sin(i / 10 * Math.PI) * 3}v-4' ${line(ink, 1.2, "stroke-opacity='.6'")}/>`).join("")}
<g ${fillP(ink, 2, PAPER)}><rect x='138' y='62' width='13' height='15' rx='3'/><rect x='153' y='64' width='12' height='13' rx='3'/><rect x='84' y='65' width='12' height='12' rx='3'/></g>
${water(4, 236, wl + 4, ink)}`);
}

/** Corpo em faixa com entrelaçado (duas fitas que se cruzam), dorso de espinhos e escamas; usado na serpente-do-mar. */
function serpentBody(ink, b, { weave = true, spineH = 11 }) {
  const outline = poly([...b.left, ...[...b.right].reverse()]) + "Z";
  const width = (i) => Math.hypot(b.left[i][0] - b.right[i][0], b.left[i][1] - b.right[i][1]);
  let ribbons = "";
  if (weave) {
    for (const sign of [1, -1]) {
      const pts = b.center.map((c, i) => { const off = sign * width(i) * 0.24 * Math.sin((i / 5.5) * Math.PI); return [c[0] + b.nor[i][0] * off, c[1] + b.nor[i][1] * off]; });
      ribbons += ribbon(poly(pts), ink, 3.6);
    }
  }
  let spines = "";
  for (let i = 2; i < b.center.length - 3; i += 3) {
    const a = b.right[i], c = b.right[i + 2], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], [nx, ny] = b.nor[i + 1], [tx, ty] = b.tan[i + 1];
    const hh = spineH * Math.min(1, width(i + 1) / 22);
    if (hh < 3) continue;
    const tip = [mid[0] - nx * hh - tx * 3.5, mid[1] - ny * hh - ty * 3.5];
    spines += `M${f(a[0])} ${f(a[1])}Q${f((a[0] + tip[0]) / 2)} ${f((a[1] + tip[1]) / 2)} ${f(tip[0])} ${f(tip[1])}Q${f((c[0] + tip[0]) / 2)} ${f((c[1] + tip[1]) / 2)} ${f(c[0])} ${f(c[1])}Z`;
  }
  return `<path d='${outline}' ${fillP(ink, 2.6)}/><path d='${outline}' fill='${ink}' fill-opacity='.16'/>${ribbons}<path d='${spines}' fill='${ink}' fill-opacity='.85' stroke='${ink}' stroke-width='1' stroke-linejoin='round'/><path d='${poly(b.left)}' ${line(ink, 2.6)}/><path d='${poly(b.right)}' ${line(ink, 2.6)}/>`;
}

/** Serpente-do-mar (sjøorm): três arcos entrelaçados, pescoço em S e cabeça de dragão nórdica. */
export function sjoormSvg(ink = INK) {
  const W = 480, H = 236, wl = 204;
  const arc = (cx, rx, ry, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const th = Math.PI - (Math.PI * i) / n; return [cx + rx * Math.cos(th), wl + 10 - ry * Math.sin(th)]; });
  const bodyCtl = [[8, wl - 40], [16, wl - 18], [30, wl + 2], [46, wl + 12], ...arc(86, 36, 42), [132, wl + 20], ...arc(178, 40, 56), [226, wl + 20], ...arc(270, 36, 46), [316, wl + 20], [330, wl + 28]];
  const body = band(spline(bodyCtl, 6), (t) => 3 + 27 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.5);
  const neck = band(spline([[338, wl + 24], [342, wl - 6], [350, wl - 38], [358, wl - 68], [354, wl - 96], [356, wl - 120], [366, wl - 138]], 16), (t) => 28 - 15 * t);
  const cp = (id, b) => `<clipPath id='${id}'><path d='${poly([...b.left, ...[...b.right].reverse()])}Z'/></clipPath>`;
  const surf = `<path d='${wavePath(0, W - 40, wl + 1, 2.4, 14)}' ${line(ink, 1.6, "stroke-opacity='.85'")}/><path d='${wavePath(8, W - 60, wl + 9, 2.2, 20)}' ${line(ink, 1.3, "stroke-opacity='.55'")}/><path d='${wavePath(22, W - 90, wl + 17, 2, 26)}' ${line(ink, 1.1, "stroke-opacity='.4'")}/>
<g ${line(ink, 1.3, "stroke-opacity='.85'")}>${[36, 132, 226, 316, 352].map((x) => `<path d='M${x - 10} ${wl + 6}q-3-8 4-9M${x + 10} ${wl + 6}q3-8-4-9M${x - 5} ${wl}q5-6 10 0'/>`).join("")}</g>`;
  return svgOf(W, H, `<defs>${clipAbove("wl", W, wl)}</defs><g clip-path='url(#wl)'>${serpentBody(ink, body, { spineH: 11 })}${serpentBody(ink, neck, { weave: false, spineH: 8 })}</g>${dragonHead(ink, 362, 70, -6, 1.32)}${surf}`);
}

/** Jörmungandr: a serpente de Midgard em anel, mordendo a própria cauda, com o mar dentro. */
export function jormungandrSvg(ink = INK) {
  const W = 220, H = 150, cx = 110, cy = 70, rx = 74, ry = 38;
  const pts = Array.from({ length: 60 }, (_, i) => { const th = ((22 + (i / 59) * 330) * Math.PI) / 180; return [cx + rx * Math.cos(th), cy + ry * Math.sin(th)]; });
  const body = band(pts, (t) => 4 + 18 * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.7);
  const outline = poly([...body.left, ...[...body.right].reverse()]) + "Z";
  // escamas em arco ao longo do dorso
  let scales = "";
  for (let i = 4; i < 56; i += 2) { const [nx, ny] = body.nor[i], [x, y] = body.center[i], w = Math.hypot(body.left[i][0] - body.right[i][0], body.left[i][1] - body.right[i][1]) / 2; scales += `M${f(x - nx * w * 0.5)} ${f(y - ny * w * 0.5)}q${f(nx * w * 0.5 + body.tan[i][0] * 3)} ${f(ny * w * 0.5 + body.tan[i][1] * 3)} ${f(nx * w)} ${f(ny * w)}`; }
  let spines = "";
  for (let i = 3; i < 52; i += 3) { const a = body.right[i], c = body.right[i + 2], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], [nx, ny] = body.nor[i + 1]; const tip = [mid[0] - nx * 8, mid[1] - ny * 8]; spines += `M${f(a[0])} ${f(a[1])}L${f(tip[0])} ${f(tip[1])}L${f(c[0])} ${f(c[1])}Z`; }
  const end = body.center[59], [tx, ty] = body.tan[59];
  const inner = `<ellipse cx='${cx}' cy='${cy + 2}' rx='${rx - 22}' ry='${ry - 14}' ${line(ink, 1.6, "stroke-opacity='.5'")}/><path d='${wavePath(66, 154, cy - 4, 2.4, 15)}' ${line(ink, 1.6, "stroke-opacity='.7'")}/><path d='${wavePath(78, 142, cy + 6, 2.2, 18)}' ${line(ink, 1.4, "stroke-opacity='.5'")}/>`;
  return svgOf(W, H, `${inner}<path d='${outline}' ${fillP(ink, 2.6)}/><path d='${outline}' fill='${ink}' fill-opacity='.16'/><path d='${scales}' ${line(ink, 1.1, "stroke-opacity='.55'")}/>
<path d='${spines}' fill='${ink}' fill-opacity='.85' stroke='${ink}' stroke-width='1' stroke-linejoin='round'/><path d='${poly(body.left)}' ${line(ink, 2.6)}/><path d='${poly(body.right)}' ${line(ink, 2.6)}/>
${dragonHead(ink, end[0] - tx * 4, end[1] - ty * 4, (Math.atan2(ty, tx) * 180) / Math.PI, 0.7)}
<path d='${wavePath(6, 214, 132, 2.6, 15)}' ${line(ink, 2, "stroke-opacity='.85'")}/><path d='${wavePath(20, 200, 141, 2.4, 22)}' ${line(ink, 1.6, "stroke-opacity='.5'")}/>`);
}

/** Kraken (kraken vem do folclore norueguês): cúpula, olhos e tentáculos com ventosas. */
export function krakenSvg(ink = INK) {
  const W = 220, H = 150, wl = 120;
  const tent = (ctl, w0, w1, side = 1) => {
    const b = band(spline(ctl, 9), (t) => w0 + (w1 - w0) * t);
    const suckers = b.center.map((c, i) => (i > 3 && i % 3 === 0 ? `<circle cx='${f(c[0] + b.nor[i][0] * side * (w0 + (w1 - w0) * (i / b.center.length)) * 0.16)}' cy='${f(c[1] + b.nor[i][1] * side * (w0 + (w1 - w0) * (i / b.center.length)) * 0.16)}' r='${f(Math.max(1.1, (w0 + (w1 - w0) * (i / b.center.length)) * 0.17))}' fill='${ink}' fill-opacity='.55'/>` : "")).join("");
    const outline = poly([...b.left, ...[...b.right].reverse()]) + "Z";
    return `<path d='${outline}' ${fillP(ink, 2.3)}/><path d='${outline}' fill='${ink}' fill-opacity='.14'/>${suckers}`;
  };
  const tents = [
    tent([[52, 134], [48, 104], [34, 80], [30, 56], [42, 36], [58, 34], [64, 44], [56, 52]], 18, 3, -1),
    tent([[160, 134], [168, 104], [182, 82], [186, 56], [174, 38], [158, 38], [154, 50], [162, 58]], 18, 3, 1),
    tent([[80, 134], [74, 108], [58, 92], [56, 74], [64, 62]], 13, 3, -1),
    tent([[136, 134], [144, 110], [160, 96], [164, 78], [154, 66]], 13, 3, 1),
  ].join("");
  return svgOf(W, H, `${clipAbove("wl", W, wl)}
<g clip-path='url(#wl)'>${tents}
<path d='M80 130C74 86 90 44 110 38C130 44 146 86 140 130Z' ${fillP(ink, 2.5)}/><path d='M80 130C74 86 90 44 110 38C130 44 146 86 140 130Z' fill='${ink}' fill-opacity='.16'/>
<path d='M110 40Q98 70 96 98M110 40Q122 70 124 98' ${line(ink, 1.6, "stroke-opacity='.55'")}/>${spiral(110, 62, 9, 1.7, ink, 1.6)}
<g fill='${ink}' fill-opacity='.4'>${[[96, 60, 2.6], [124, 64, 2.2], [104, 76, 2], [118, 82, 2.6], [90, 84, 1.8], [130, 90, 1.8]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}'/>`).join("")}</g>
<g><circle cx='97' cy='104' r='9' fill='${PAPER}' stroke='${ink}' stroke-width='2.2'/><circle cx='123' cy='104' r='9' fill='${PAPER}' stroke='${ink}' stroke-width='2.2'/><path d='M96 99V109M124 99V109' ${line(ink, 3.4)}/><path d='M86 96Q97 90 106 96M114 96Q123 90 134 96' ${line(ink, 2)}/></g></g>
${water(4, 216, wl + 2, ink)}<g fill='${ink}' fill-opacity='.7'><circle cx='40' cy='112' r='1.8'/><circle cx='176' cy='110' r='1.8'/><circle cx='186' cy='118' r='1.4'/></g>`);
}

/** Baleia mergulhando; com `island` é a hafgufa, a baleia que os marinheiros tomam por ilha (árvores, cabana e fogueira nas costas); com `tusk`, o narval. */
export function baleiaSvg(ink = INK, mode = "whale") {
  const tusk = mode === "narwhal", island = mode === "island";
  const W = tusk ? 300 : 250, H = island ? 150 : 134, wl = island ? 118 : 102, dx = tusk ? 52 : 0, dy = island ? 16 : 0;
  const body = "M18 102C16 82 30 66 56 62C96 56 150 66 178 102Z";
  const flukes = "M208 66C198 64 186 54 176 40C190 42 202 48 208 56C214 48 226 42 240 40C232 54 220 64 208 66Z";
  const g = `<clipPath id='bd'><path d='${body}'/></clipPath>${clipAbove("wl", W, wl - dy)}${hatchDefs(ink)}
<g clip-path='url(#wl)'>
<path d='M180 104C192 100 202 86 202 66L214 66C214 88 210 100 206 104Z' ${fillP(ink, 2.4)}/><path d='${flukes}' ${fillP(ink, 2.4)}/><path d='M208 66V54M198 56L204 62M218 56L212 62' ${line(ink, 1.4, "stroke-opacity='.6'")}/>
<path d='${body}' ${fillP(ink, 2.5)}/><path d='M12 104H190V90Q100 84 12 92Z' fill='url(#h)' clip-path='url(#bd)'/>
<path d='M22 94Q42 100 74 94' ${line(ink, 2)}/><path d='M132 68Q146 50 154 72Z' ${fillP(ink, 2.2)}/>
<circle cx='44' cy='82' r='3' fill='${ink}'/><path d='M36 76Q44 72 52 76' ${line(ink, 1.8)}/>
<path d='M26 100Q34 96 42 100M40 102Q48 98 56 102M54 102Q62 98 70 102' ${line(ink, 1.3, "stroke-opacity='.6'")}/>${spiral(120, 82, 8, 1.5, ink, 1.5)}
<g fill='${ink}' fill-opacity='.45'>${[[100, 74, 1.8], [86, 72, 1.5], [150, 84, 1.6]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}'/>`).join("")}</g></g>`;
  const spout = `<g ${line(ink, 2, "stroke-opacity='.8'")}><path d='M60 62Q60 40 48 26M60 62Q62 38 72 24M60 62Q60 34 60 18'/></g><g fill='${ink}' fill-opacity='.7'><circle cx='46' cy='22' r='1.8'/><circle cx='74' cy='20' r='1.8'/><circle cx='60' cy='12' r='1.8'/><circle cx='52' cy='34' r='1.4'/><circle cx='68' cy='32' r='1.4'/></g>`;
  const tuskSvg = `<g><path d='M18 84L-42 56L14 94Z' ${fillP(ink, 2.2)}/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d='M${12 - i * 8.4} ${84 - i * 4.1}l${5 - i * 0.4} ${8 - i * 0.9}' ${line(ink, 1.5, "stroke-opacity='.85'")}/>`).join("")}</g>`;
  const tree = (x, y, h) => `<g><path d='M${x} ${y}V${y - h}' ${line(ink, 2)}/><path d='M${x - 7} ${y - h * 0.35}L${x} ${y - h * 0.85}L${x + 7} ${y - h * 0.35}Z M${x - 5.5} ${y - h * 0.62}L${x} ${y - h * 1.05}L${x + 5.5} ${y - h * 0.62}Z' fill='${ink}' fill-opacity='.85' stroke='${ink}' stroke-width='1.4' stroke-linejoin='round'/></g>`;
  const isle = `${tree(94, 66, 22)}${tree(108, 62, 26)}${tree(126, 66, 18)}<path d='M136 68l8-9l8 9Z' ${fillP(ink, 1.8)}/><path d='M118 60q-6-6 2-11q7-5 0-10' ${line(ink, 1.4, "stroke-opacity='.7'")}/>`;
  if (tusk) return svgOf(W, H, `<g transform='translate(${dx} 0)'>${g}${tuskSvg}</g>${water(4, W - 4, wl + 2, ink)}`);
  if (island) return svgOf(W, H, `<g transform='translate(0 ${dy})'>${g}${isle}</g>${water(4, W - 4, wl + 2, ink)}`);
  return svgOf(W, H, `${g}${spout}${water(4, W - 4, wl + 2, ink)}`);
}

/** Cavalo-d'água (nykur): pescoço arqueado com crina em espirais, cabeça de cavalo e cauda de peixe enrolada. */
export function nykurSvg(ink = INK) {
  const W = 200, H = 140, wl = 112;
  const neck = band(spline([[64, 128], [72, 98], [90, 68], [114, 50], [136, 48]], 10), (t) => 28 - 15 * t);
  const tail = band(spline([[128, 126], [154, 120], [174, 108], [186, 92], [180, 80], [169, 83], [171, 93]], 9), (t) => 20 - 17 * t);
  const outline = (b) => poly([...b.left, ...[...b.right].reverse()]) + "Z";
  let mane = "";
  for (let i = 1; i < neck.center.length - 2; i += 2) { const a = neck.right[i], [nx, ny] = neck.nor[i], [tx, ty] = neck.tan[i]; mane += ribbon(`M${f(a[0])} ${f(a[1])}C${f(a[0] - nx * 12 - tx * 6)} ${f(a[1] - ny * 12 - ty * 6)} ${f(a[0] - nx * 16 - tx * 14)} ${f(a[1] - ny * 8 - ty * 14)} ${f(a[0] - nx * 10 - tx * 16)} ${f(a[1] - ny * 3 - ty * 16)}`, ink, 4.2); }
  const head = `<g transform='translate(138 46) rotate(22)'><path d='M-6 -8C2 -16 14 -16 24 -10C32 -6 40 2 42 8C44 13 40 16 35 14C30 12 26 9 20 9C12 11 4 10 -6 6Z' ${fillP(ink, 2.6)}/><path d='M2 -13L8 -26L14 -14Z' ${fillP(ink, 2)}/><circle cx='16' cy='-4' r='2.6' fill='${ink}'/><circle cx='37' cy='8' r='1.5' fill='${ink}'/><path d='M12 4Q22 8 34 12' ${line(ink, 1.4, "stroke-opacity='.6'")}/></g>`;
  return svgOf(W, H, `${clipAbove("wl", W, wl)}<g clip-path='url(#wl)'>
<path d='${outline(tail)}' ${fillP(ink, 2.5)}/><path d='${outline(tail)}' fill='${ink}' fill-opacity='.15'/>${ribbon("M172 96C164 94 162 84 170 82", ink, 3.6)}
<path d='${outline(neck)}' ${fillP(ink, 2.6)}/><path d='${outline(neck)}' fill='${ink}' fill-opacity='.16'/><path d='${poly(neck.left)}' ${line(ink, 2.6)}/><path d='${poly(neck.right)}' ${line(ink, 2.6)}/>${spiral(84, 96, 8, 1.6, ink, 1.6)}${mane}</g>
${head}${water(4, 196, wl + 3, ink)}`);
}

/** Peixe-monstro de gravura antiga: mandíbula aberta, barbatana com espinhos, espiral no flanco e cauda bifurcada. */
export function peixeSvg(ink = INK) {
  const W = 250, H = 134, wl = 106;
  const b = band(spline([[214, 90], [190, 86], [160, 82], [124, 82], [92, 84], [66, 88]], 8), (t) => (t < 0.5 ? 8 + 38 * Math.sin((t / 0.5) * Math.PI / 2) : 46 - 4 * ((t - 0.5) / 0.5)));
  const outline = poly([...b.left, ...[...b.right].reverse()]) + "Z";
  const teethTop = [34, 42, 50, 58].map((x, i) => `<path d='M${x} ${82 + i * 1.5}l4 9l4-9Z'/>`).join("");
  const teethBot = [30, 38, 46, 54].map((x, i) => `<path d='M${x} ${100 - i * 0.5}l4-9l4 9Z'/>`).join("");
  return svgOf(W, H, `${clipAbove("wl", W, wl)}<clipPath id='bd'><path d='${outline}'/></clipPath>${hatchDefs(ink)}
<g clip-path='url(#wl)'>
<path d='M208 90Q224 76 240 60Q232 90 240 118Q224 104 208 90Z' ${fillP(ink, 2.4)}/><path d='M214 90H238M216 82L232 70M216 98L232 110' ${line(ink, 1.3, "stroke-opacity='.6'")}/>
<path d='${outline}' ${fillP(ink, 2.5)}/><path d='${outline}' fill='${ink}' fill-opacity='.14'/>
<g clip-path='url(#bd)'><path d='M60 104H214V96Q140 92 60 96Z' fill='url(#h)'/>${Array.from({ length: 9 }, (_, i) => `<path d='M${100 + i * 12} 68q7 8 0 16M${106 + i * 12} 84q7 8 0 16' ${line(ink, 1.2, "stroke-opacity='.5'")}/>`).join("")}</g>${spiral(150, 84, 9, 1.7, ink, 1.7)}
<path d='M112 62Q122 34 134 40Q140 44 146 36Q150 50 154 66Z' ${fillP(ink, 2.2)}/><path d='M122 62L126 44M134 62L136 44M144 62L146 42' ${line(ink, 1.3, "stroke-opacity='.65'")}/>
<path d='M84 68Q66 64 48 74Q38 80 32 86L58 92L84 88Z' ${fillP(ink, 2.4)}/><path d='M32 86L58 92L20 104Z' fill='${ink}' fill-opacity='.6'/>
<path d='M58 92L16 102Q34 114 66 108L84 98Z' ${fillP(ink, 2.4)}/>
<g fill='${PAPER}' stroke='${ink}' stroke-width='1.1' stroke-linejoin='round'>${teethTop}${teethBot}</g>
<path d='M90 72Q98 88 90 104M98 72Q106 88 98 104' ${line(ink, 1.6, "stroke-opacity='.7'")}/>
<circle cx='62' cy='76' r='5.4' fill='${PAPER}' stroke='${ink}' stroke-width='2'/><circle cx='63' cy='76.4' r='2.4' fill='${ink}'/><path d='M54 70Q62 64 70 68' ${line(ink, 1.8)}/>
<path d='M66 100Q74 116 88 118Q86 108 80 100Z' ${fillP(ink, 2)}/></g>
${water(4, 246, wl + 2, ink)}`);
}

export const galeaoSmall = (ink = INK) => bold(galleonSvg(ink), 2.2);

/** Catálogo: gerador, proporção do desenho e (no jogo) largura em px e posição no mapa-múndi. */
export const FIGURES = {
  drakkar: { label: "Drakkar", svg: drakkarSvg, w: 260, h: 140 },
  snekkja: { label: "Snekkja", svg: snekkjaSvg, w: 230, h: 130 },
  knarr: { label: "Knarr", svg: knarrSvg, w: 240, h: 140 },
  galeao: { label: "Galeão", svg: galeaoSmall, w: 300, h: 232 },
  sjoorm: { label: "Sjøorm", svg: sjoormSvg, w: 480, h: 236 },
  jormungandr: { label: "Jörmungandr", svg: jormungandrSvg, w: 220, h: 150 },
  kraken: { label: "Kraken", svg: krakenSvg, w: 220, h: 150 },
  hafgufa: { label: "Hafgufa", svg: (ink) => baleiaSvg(ink, "island"), w: 250, h: 150 },
  narval: { label: "Narval", svg: (ink) => baleiaSvg(ink, "narwhal"), w: 300, h: 134 },
  nykur: { label: "Nykur", svg: nykurSvg, w: 200, h: 140 },
  peixe: { label: "Peixe-monstro", svg: peixeSvg, w: 250, h: 134 },
};
/** SVG espelhado na horizontal (para variar a direção sem desenhar de novo). */
export const flipSvg = (svg, w) => svg.replace(/^<svg([^>]*)>/, (m, a) => `<svg${a}><g transform='translate(${w} 0) scale(-1 1)'>`).replace(/<\/svg>$/, "</g></svg>");
