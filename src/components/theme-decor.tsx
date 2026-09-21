// Decoração dos temas do Hub: filtros SVG das pinceladas (uma vez, no documento) e as manchas de aquarela atrás do Hub.

// Bordas irregulares de pincel (V = faixa vertical, H = horizontal, O = anel) e o deslocamento suave das manchas (wc).
// Sem suporte a filtro SVG em CSS o desenho continua igual, só com as bordas lisas.
export function ThemeFilters() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <filter id="roughV" x="-25%" y="-12%" width="150%" height="124%"><feTurbulence type="fractalNoise" baseFrequency="0.022 0.05" numOctaves="2" seed="11" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="24" xChannelSelector="R" yChannelSelector="G" /></filter>
        <filter id="roughH" x="-12%" y="-45%" width="124%" height="190%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.02" numOctaves="2" seed="5" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" /></filter>
        <filter id="roughO" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="8" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" /></filter>
        <filter id="wc" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.011" numOctaves="2" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="55" xChannelSelector="R" yChannelSelector="G" /></filter>
      </defs>
    </svg>
  );
}

// Cor de cada mancha (0 Mapa, 1 Bandeiras, 2 Capitais, 3 Idiomas); posição e tamanho ficam em themes.css.
const BLOBS = [0, 0, 1, 2, 3, 1, 3, 2, 1, 0] as const;

export function ThemeWash() {
  return <div className="wash" aria-hidden="true">{BLOBS.map((tone, index) => <i key={index} className={`wk${tone}`} />)}</div>;
}
