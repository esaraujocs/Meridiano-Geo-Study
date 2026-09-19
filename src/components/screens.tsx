import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction, type TransitionEvent } from "react";
import { Icon } from "./icons";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionSelection, RegionCounts } from "../domain/types";
import { normalizeRegionSelection, REGION_ITEMS } from "../domain/regions";
import type { LegacyProfile } from "../domain/legacy-migration";
import type { OfflineMapStatus } from "../domain/offline-map";
import type { EconomySnapshot } from "../domain/economy-store";
import { canUnlock, policyFor, type UnlockKey } from "../domain/economy-rules";
import { unlockContent } from "../domain/economy-store";

export type TopFamily = "mapa" | "bandeiras" | "capitais" | "idiomas";

export function Header({ legacy, economy, current = "hub", onNavigate, onSurface }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; current?: "hub" | "progress" | "collection" | "achievements" | "options"; onNavigate?: (destination: "hub" | "progress" | "collection" | "achievements" | "options") => void; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void }) {
  const items = [
    ["hub", "Modos", "map"], ["collection", "Coleção", "collection"],
    ["achievements", "Achievements", "achievements"], ["progress", "Progresso", "progress"],
  ] as const;
  return (
    <>
    <header className="topbar">
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          if (location.pathname === "/") {
            event.preventDefault();
            location.reload();
          }
        }}
      >
        <span className="brand-mark">
          <span className="brand-dot" />
        </span>
        <span>CARTA CEGA</span>
      </a>
      <nav className="desktop-nav" aria-label="Navegação principal">
        {items.map(([key, label]) => <button key={key} onClick={() => onNavigate?.(key)}>{label}</button>)}
        <button onClick={() => onNavigate?.("options")}>Opções</button>
      </nav>
      <div className="top-actions"><span className="pill mono">{economy?.balance ?? 0} moedas</span><button className="settings-button" aria-label="Abrir Opções" title="Opções" onClick={() => onNavigate?.("options")}><Icon type="settings" /></button></div>
    </header>
    <nav className="mobile-nav" aria-label="Navegação principal">
      {items.map(([key, label, icon]) => <button key={key} aria-label={label} title={label} aria-current={current === key ? "page" : undefined} onClick={() => onNavigate?.(key)}><Icon type={icon} /><span>{label}</span></button>)}
    </nav>
    </>
  );
}

export function OptionsScreen({ offlineMap, onToggleOfflineMap, onGrantCoins, onUnlockContent, onBack }: {
  offlineMap: OfflineMapStatus;
  onToggleOfflineMap: () => Promise<void>;
  onGrantCoins: (amount: number) => Promise<void>;
  onUnlockContent: () => Promise<void>;
  onBack: () => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("carta-reduced-motion") === "1");
  const [debugAmount, setDebugAmount] = useState("10");
  const [debugStatus, setDebugStatus] = useState("");
  const [cacheReport, setCacheReport] = useState("Consultando cache do app…");
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false";
    localStorage.setItem("carta-reduced-motion", reducedMotion ? "1" : "0");
  }, [reducedMotion]);
  useEffect(() => {
    if (!("caches" in window)) { setCacheReport("Cache offline não disponível neste navegador."); return; }
    caches.keys().then(async (keys) => {
      const entries = (await Promise.all(keys.map((key) => caches.open(key).then((cache) => cache.keys())))).flat();
      const paths = entries.map((request) => new URL(request.url).pathname);
      const app = paths.some((path) => path === "/" || path.endsWith(".js") || path.endsWith(".css"));
      const data = paths.some((path) => /data|json|geo|special/i.test(path));
      const flags = paths.some((path) => /flag|bandeir/i.test(path));
      setCacheReport(`App (shell): ${app ? "cacheado" : "precacheado no build"} · dados (catálogo, mapa-base, históricas e idiomas): ${data ? "cacheados" : "precacheados pelo service worker"} · bandeiras atuais/históricas: ${flags ? "cacheadas" : "precacheadas pelo service worker"}`);
    }).catch(() => setCacheReport("Não foi possível consultar o cache offline."));
  }, []);
  const mapLabel = offlineMap === "installed" ? "Baixado" : offlineMap === "downloading" ? "Baixando…" : offlineMap === "error" ? "Falha — tentar novamente" : "Disponível para baixar";
  return <main className="content options-screen">
    <button className="back" onClick={onBack}>← Voltar</button>
    <div className="eyebrow options-kicker">Preferências</div><h1>Opções</h1>
    <section className="options-grid" aria-label="Preferências e disponibilidade offline">
      <article className="surface-card"><h2>Movimento</h2><label className="option-toggle">Movimento reduzido <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /></label><p>Desativa transições e animações decorativas.</p></article>
      <article className="surface-card"><h2>Offline</h2><p className="offline-status">App e dados locais: {cacheReport}</p><p className="offline-status">Mapa: {mapLabel} · 27,7 MB</p><button className="button ghost" disabled={offlineMap === "checking" || offlineMap === "downloading" || offlineMap === "unavailable"} onClick={() => void onToggleOfflineMap()}>{offlineMap === "installed" ? "Remover mapa" : "Baixar mapa · 27,7 MB"}</button></article>
      {import.meta.env.DEV && <article className="surface-card options-debug"><h2>Debug</h2><label>Moedas de teste<input type="number" min="1" step="1" value={debugAmount} onChange={(event) => setDebugAmount(event.target.value)} /></label><button className="button ghost" onClick={async () => { const amount = Number(debugAmount); if (!Number.isInteger(amount) || amount <= 0) { setDebugStatus("Informe um inteiro positivo."); return; } await onGrantCoins(amount); setDebugStatus("Moedas adicionadas."); }}>Adicionar moedas</button><button className="button ghost" onClick={async () => { await onUnlockContent(); setDebugStatus("Conteúdo liberado."); }}>Liberar modos e recortes</button>{debugStatus && <span role="status">{debugStatus}</span>}</article>}
    </section>
  </main>;
}

export function Hub({
  onSelect,
  legacy,
  economy,
  offlineMap,
  onToggleOfflineMap,
  onSurface,
  onNavigate,
}: {
  onSelect: (family: Family) => void;
  legacy?: LegacyProfile | null;
  economy?: EconomySnapshot | null;
  offlineMap?: OfflineMapStatus;
  onToggleOfflineMap?: () => void;
  onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void;
  onNavigate?: (destination: "hub" | "progress" | "collection" | "achievements" | "options") => void;
}) {
  const [activeFamily, setActiveFamily] = useState(0);
  const [familyTrackIndex, setFamilyTrackIndex] = useState(1);
  const [familyTrackTransition, setFamilyTrackTransition] = useState(false);
  const [carouselMode, setCarouselMode] = useState(
     () => matchMedia("(max-width: 899px)").matches,
  );
  const familyCount = 4;
  useEffect(() => {
    const media = matchMedia("(max-width: 899px)");
    const update = () => setCarouselMode(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!carouselMode) return;
    const frame = requestAnimationFrame(() => setFamilyTrackTransition(true));
    return () => cancelAnimationFrame(frame);
  }, [carouselMode]);
  const scrollFamily = (index: number) => {
    const next = (index + familyCount) % familyCount;
    setActiveFamily(next);
    setFamilyTrackTransition(true);
    setFamilyTrackIndex((current) => (
      (index < 0 || next === familyCount - 1) && current === 1 ? 0 :
        (index >= familyCount || next === 0) && current === familyCount ? familyCount + 1 :
          next + 1
    ));
  };
  const finishFamilyTrack = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (familyTrackIndex !== 0 && familyTrackIndex !== familyCount + 1) return;
    setFamilyTrackTransition(false);
    requestAnimationFrame(() => {
      setFamilyTrackIndex(familyTrackIndex === 0 ? familyCount : 1);
      requestAnimationFrame(() => setFamilyTrackTransition(true));
    });
  };
  const unlocked = (family: Family, variant: AnyQuizVariant) => {
    const policy = policyFor(family, variant, "caribe");
    return (
      !policy ||
      (policy.cost === 0 && policy.sessions === 0) ||
      Boolean(economy?.unlocked.includes(policy.key as UnlockKey))
    );
  };
  const familyItems: Array<{ family: Family; variant: AnyQuizVariant; label: string; description: string; icon: Parameters<typeof Icon>[0]["type"]; color?: string }> = [
    { family: "mapa", variant: "mapa", label: "Mapa", description: "Localizar países e territórios.", icon: "map" },
    { family: "bandeiras", variant: "bandeira-nome", label: "Bandeiras", description: "Reconhecimento visual e escrita.", icon: "flag", color: "var(--coral)" },
    { family: "capitais", variant: "capital-pais", label: "Capitais", description: "Recuperação de nomes.", icon: "capital", color: "var(--gold)" },
    { family: "idiomas", variant: "idioma-pais", label: "Idiomas", description: "Uma variante para ler escrita e território.", icon: "capital", color: "var(--terracotta)" },
  ];
  const visibleFamilyIndexes = carouselMode
    ? [familyCount - 1, ...familyItems.map((_, index) => index), 0]
    : familyItems.map((_, index) => index);
  return (
    <main className="content hub-content">
      <div className="hub-profile-bar" aria-label="Perfil de atividade">
        <div className="level-badge"><span>Nível</span><strong>{economy?.level ?? 1}</strong></div>
        <div className="hub-xp"><div className="hub-xp-label"><span>{(economy?.xp ?? 0) - (economy?.xpBase ?? 0)} / {(economy?.xpNext ?? 100) - (economy?.xpBase ?? 0)} XP</span></div><div className="hub-xp-track"><i style={{ width: `${Math.min(100, Math.round((((economy?.xp ?? 0) - (economy?.xpBase ?? 0)) / Math.max(1, (economy?.xpNext ?? 100) - (economy?.xpBase ?? 0))) * 100))}%` }} /></div><span className="hub-xp-next">{Math.max(0, (economy?.xpNext ?? 100) - (economy?.xp ?? 0))} para o próximo</span></div>
        <div className="hub-coins" aria-label={`${economy?.balance ?? 0} moedas`}><i aria-hidden="true">$</i><strong>{economy?.balance ?? 0}</strong></div>
      </div>
      <div className="section-label"><h2>Modos</h2></div>
      <div className="family-carousel">
          {carouselMode && <button type="button" className="carousel-arrow carousel-arrow-prev" aria-label="Modo anterior" onClick={() => scrollFamily(activeFamily - 1)}><Icon type="arrow" /></button>}
        <div
          className={`family-grid ${carouselMode ? "is-carousel" : ""}`}
          style={carouselMode ? {
            "--track-index": familyTrackIndex,
            transition: familyTrackTransition ? undefined : "none",
          } as CSSProperties : undefined}
          onTransitionEnd={carouselMode ? finishFamilyTrack : undefined}
          role="region"
           aria-label="Modos de jogo"
          onTouchStart={(event) => { event.currentTarget.dataset.x = String(event.touches[0].clientX); }}
          onTouchEnd={(event) => {
            const start = Number(event.currentTarget.dataset.x);
            const end = event.changedTouches[0].clientX;
            if (Math.abs(end - start) > 40) scrollFamily(activeFamily + (end < start ? 1 : -1));
          }}
        >
        {visibleFamilyIndexes.map((index, position) => {
          const item = familyItems[index];
            const clone = carouselMode && (position === 0 || position === visibleFamilyIndexes.length - 1);
            const current = !carouselMode || position === familyTrackIndex;
          const isUnlocked = unlocked(item.family, item.variant);
          return <button
            type="button"
             key={`${clone ? "clone" : "real"}-${item.family}`}
            className={`family ${current && carouselMode ? "active" : ""} ${economy && !isUnlocked ? "locked" : ""}`}
            onClick={() => onSelect(item.family)}
            aria-hidden={carouselMode && !current ? true : undefined}
            inert={carouselMode && !current ? true : undefined}
          >
            <div className="family-visual" style={item.color ? { color: item.color } : undefined}>{item.family === "mapa" && <div className="family-geo" />}<div className="family-icon"><Icon type={item.icon} /></div></div>
            <div className="family-copy"><h3>{item.label}</h3><p>{item.description}</p></div>
            <div className="family-footer"><span>{isUnlocked ? "aberta" : "bloqueada"}</span><span className="family-play">Jogar <Icon type="arrow" /></span></div>
          </button>;
        })}
        </div>
          {carouselMode && <button type="button" className="carousel-arrow carousel-arrow-next" aria-label="Próximo modo" onClick={() => scrollFamily(activeFamily + 1)}><Icon type="arrow" /></button>}
        {carouselMode && <div className="carousel-dots" aria-label="Posição no carrossel">
          {Array.from({ length: familyCount }, (_, index) => (
            <button type="button" key={index} aria-label={`Ir para família ${index + 1}`} aria-current={activeFamily === index ? "true" : undefined} onClick={() => scrollFamily(index)} />
          ))}
        </div>}
      </div>
    </main>
  );
}

export function Variant({
  topFamily,
  family,
  variant,
  setVariant,
  onBack,
  onNext,
  onSelectEngine,
  economy,
}: {
  topFamily: TopFamily;
  family: Family;
  variant: AnyQuizVariant;
  setVariant: (variant: AnyQuizVariant) => void;
  onBack: () => void;
  onNext: () => void;
  onSelectEngine: (family: Family, variant: AnyQuizVariant) => void;
  economy?: EconomySnapshot | null;
}) {
  const variants: Record<TopFamily, [Family, AnyQuizVariant, string, string][]> = {
    mapa: [["mapa", "mapa", "Clicar no mapa", "Localize o território pedido."], ["silhueta", "silhueta", "Silhueta", "Escreva ou escolha entre quatro nomes."], ["travel", "travel", "Travel", "Trace uma rota entre países."]],
     bandeiras: [["bandeiras", "nome-bandeira", "Atuais", "Bandeiras atuais nos dois sentidos."], ["bandeiras", "bandeira-nome", "Bandeira → nome", "Reconheça o país pela bandeira."], ["escrita", "escrita-pais", "Escrita", "Digite o país pela bandeira."], ["historicas", "nome-historica", "Históricas", "Bandeiras históricas nos dois sentidos."]],
    capitais: [["capitais", "capital-pais", "Clicar no mapa", "Localize o país da capital."], ["escrita", "escrita-capital", "Escrita", "Digite a capital do país."]],
    idiomas: [["idiomas", "idioma-pais", "Idioma", "Associe uma escrita aos países."]],
  };
  const familyLabel = topFamily === "mapa" ? "Mapa" : topFamily === "bandeiras" ? "Bandeiras" : topFamily === "capitais" ? "Capitais" : "Idiomas";
  const continueWith = (engine: Family, key: AnyQuizVariant) => {
    setVariant(key);
    onSelectEngine(engine, key);
    onNext();
  };
  const cards = topFamily === "bandeiras"
    ? variants.bandeiras
    : variants[topFamily];
  const [active, setActive] = useState(Math.max(0, cards.findIndex(([, key]) => key === variant)));
  const wrap = (index: number) => (index + cards.length) % cards.length;
  const move = (index: number) => setActive(wrap(index));
  const current = cards[active];
  const policy = policyFor(current[0], current[1], "caribe");
  const unlocked = !policy || (policy.cost === 0 && policy.sessions === 0) || Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
  const visibleCards = cards.length === 1
    ? [{ index: 0, position: "current" as const }]
    : [
        { index: wrap(active - 1), position: "previous" as const },
        { index: active, position: "current" as const },
        { index: wrap(active + 1), position: "next" as const },
      ];
  return (
    <main className="content">
       <button className="back" onClick={onBack}>← Modos</button>
       <div style={{ marginTop: 38 }} className="eyebrow">{familyLabel} / variante</div>
       <h1 style={{ marginTop: 18 }}>Escolha a variante</h1>
      <div className="variant-carousel" onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.x = String(e.touches[0].clientX); }} onTouchEnd={(e) => { const start = Number((e.currentTarget as HTMLElement).dataset.x); const end = e.changedTouches[0].clientX; if (Math.abs(end - start) > 40) move(active + (end < start ? 1 : -1)); }}>
        {cards.length > 1 && <button className="carousel-arrow carousel-arrow-prev" aria-label="Variante anterior" onClick={() => move(active - 1)}>‹</button>}
        <div className="variant-track" aria-label="Variantes">
          {visibleCards.map(({ index, position }) => {
            const [engine, key, label, description] = cards[index];
            const cardPolicy = policyFor(engine, key, "caribe");
            const cardUnlocked = !cardPolicy || cardPolicy.cost === 0 || Boolean(economy?.unlocked.includes(cardPolicy.key as UnlockKey));
            return (
            <button key={`${position}:${key}`} type="button" className={`family variant-card variant-card-${position} ${position === "current" ? "active" : ""}`} aria-current={position === "current" ? "true" : undefined} aria-hidden={position === "current" ? undefined : "true"} inert={position === "current" ? undefined : true} onClick={() => continueWith(engine, key)}>
              <div><div className="family-icon"><Icon type={engine === "capitais" ? "capital" : engine === "bandeiras" || engine === "historicas" || engine === "escrita" ? "flag" : "cross"} /></div><h3>{label}</h3><p>{description}</p></div>
              <div className="family-footer"><span>{position === "current" ? (cardUnlocked ? "disponível" : `bloqueada · ${cardPolicy?.cost ?? 0} moedas`) : "próxima variante"}</span><Icon type="arrow" /></div>
            </button>
          )})}
        </div>
        {cards.length > 1 && <button className="carousel-arrow carousel-arrow-next" aria-label="Próxima variante" onClick={() => move(active + 1)}>›</button>}
        {cards.length > 1 && <div className="carousel-dots">{cards.map(([, key], index) => <button type="button" key={key} aria-label={`Ir para variante ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => move(index)} />)}</div>}
      </div>
    </main>
  );
}

export function Recorte({
  family,
  counts,
  selectedCount: selectedCountProp,
  variant,
  region,
  setRegion,
  onBack,
  onPlay,
  economy,
  onRefresh,
  onlyUn,
  setOnlyUn,
    setVariant,
  topFamily,
  onFamilyChange,
}: {
  data: Legacy;
  family: Family;
  variant: AnyQuizVariant;
  counts: RegionCounts;
  selectedCount?: number;
  region: RegionSelection;
  setRegion: Dispatch<SetStateAction<RegionSelection>>;
  onBack: () => void;
  onPlay: () => void;
  economy?: EconomySnapshot | null;
  onRefresh: () => Promise<unknown> | void;
  onlyUn: boolean;
  setOnlyUn: (value: boolean) => void;
  setVariant: (variant: AnyQuizVariant) => void;
  topFamily: TopFamily;
  onFamilyChange: (family: Family, variant: AnyQuizVariant) => void;
}) {
   const familyLabel = family === "mapa" ? "Mapa" : family === "bandeiras" ? "Bandeiras" : family === "capitais" ? "Capitais" : family === "escrita" ? "Escrita" : family === "historicas" ? "Históricas" : family === "idiomas" ? "Idiomas" : family === "silhueta" ? "Silhueta" : "Travel";
    const selectedRegions = normalizeRegionSelection(region);
    const policyRegion = selectedRegions.length === 1 ? selectedRegions[0] : "mundo";
    const selectedCountFromCards = selectedRegions.length === 1 && selectedRegions[0] === "mundo"
      ? counts.mundo
      : selectedRegions.reduce((total, item) => total + (counts[item] ?? 0), 0);
    const selectedCount = selectedCountProp ?? selectedCountFromCards;
     const selectedPolicy = policyFor(family, variant, policyRegion);
   const selectedUnlocked =
      !selectedPolicy ||
      (selectedPolicy.cost === 0 && selectedPolicy.sessions === 0) ||
      Boolean(economy?.unlocked.includes(selectedPolicy.key as UnlockKey));
    const selectedCoverage = selectedPolicy?.coverage
      ? economy?.coverageByColumn[selectedPolicy.coverage] ?? 0
      : 0;
    const canBuySelected = selectedPolicy
      ? canUnlock(selectedPolicy, economy?.balance ?? 0, economy?.sessions ?? 0, selectedCoverage)
      : false;
    useEffect(() => {
       if (selectedCount > 0) return;
       setRegion("mundo");
     }, [selectedCount, setRegion]);
  return (
    <main className="rec-content">
       <button className="back" onClick={onBack}>
         ← Famílias
      </button>
      <div className="rec-grid">
        <div>
          <div className="eyebrow" style={{ marginTop: 38 }}>
             {familyLabel} / configuração
          </div>
             <h1 style={{ marginTop: 18 }}>Configure a partida</h1>
        </div>
        <div>
            <div className="section-label"><h2>Variante</h2></div>
            <div className="chip-list variant-chips" role="group" aria-label="Variantes">
              {(topFamily === "mapa"
                ? [["mapa","Clicar no mapa","mapa"],["silhueta","Silhueta","silhueta"],["travel","Travel","travel"]]
                 : topFamily === "bandeiras"
                   ? [["nome-bandeira","Nome → bandeira","bandeiras"],["bandeira-nome","Bandeira → nome","bandeiras"],["escrita-pais","Escrita","escrita"],["nome-historica","Nome → histórica","historicas"],["historica-nome","Histórica → nome","historicas"]]
                  : topFamily === "capitais"
                    ? [["capital-pais","Clicar no mapa","capitais"],["escrita-capital","Escrita","escrita"]]
                    : [["idioma-pais","Idiomas","idiomas"]]
              ).map(([key, label, engine]) => {
                const policy = policyFor(engine as Family, key as AnyQuizVariant, policyRegion);
                const isUnlocked = !policy || (policy.cost === 0 && policy.sessions === 0) || Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                return <button type="button" className={`chip ${!isUnlocked ? "chip-locked" : ""}`} aria-pressed={variant === key} key={key} onClick={() => { onFamilyChange(engine as Family, key as AnyQuizVariant); setVariant(key as AnyQuizVariant); localStorage.setItem(`carta-last-variant:${topFamily}`, key); }}>{label}{!isUnlocked ? ` · ${policy?.cost ?? 0} moedas` : ""}</button>;
              })}
            </div>
            <div className="section-label config-section-title"><h2>Recorte</h2></div>
           <div className="region-list" role="group" aria-label="Recortes disponíveis">
              {REGION_ITEMS.map(([key, label, description]) => {
                const selected = selectedRegions.includes(key);
                const toggle = () => {
                  if (key === "mundo") return setRegion("mundo");
                  const next = selectedRegions.includes("mundo")
                    ? [key]
                    : selected
                      ? selectedRegions.filter((item) => item !== key)
                      : [...selectedRegions, key];
                  setRegion(next.length ? normalizeRegionSelection(next) : "mundo");
                };
               return (
              <button
                key={key}
                className="region"
                  aria-pressed={selected}
                  disabled={counts[key] === 0}
                  onClick={toggle}
              >
                  <b>{label}</b><span>{counts[key] === 0 ? "0 cartas" : `${counts[key]} cartas`}</span>
               </button>
               );
             })}
          </div>
            {(family === "mapa" || family === "bandeiras" || family === "capitais" || family === "escrita" || family === "silhueta" || family === "travel") && <div className="config-row"><span>Filtro</span><button type="button" className="chip" aria-pressed={onlyUn} onClick={() => setOnlyUn(!onlyUn)}>Só membros da ONU</button></div>}
            {family === "silhueta" && <div className="config-row"><span>Resposta</span><div className="chip-list"><button type="button" className="chip" aria-pressed={variant === "silhueta"} onClick={() => setVariant("silhueta")}>Escrever</button><button type="button" className="chip" aria-pressed={variant === "silhueta-opcoes"} onClick={() => setVariant("silhueta-opcoes")}>Alternativas</button></div></div>}
             {selectedCount === 0 && <div className="config-empty-note">Sem cartas neste recorte para esta variante.</div>}
           {!selectedUnlocked && (
             <p className="diagnostic" role="status" style={{ marginTop: 14 }}>
                {selectedPolicy &&
                  (canBuySelected
                    ? `Libere esta variante por ${selectedPolicy.cost} moedas.`
                    : `Requisito: ${selectedPolicy.cost} moedas e ${selectedPolicy.coverageCount} descobertas em ${selectedPolicy.coverage}. Saldo: ${economy?.balance ?? 0}; cobertura: ${selectedCoverage}.`)}
             </p>
           )}
            <button
            className="button coral"
            style={{ width: "100%", marginTop: 20 }}
             disabled={selectedCount === 0}
             onClick={async () => {
                const policy = policyFor(family, variant, policyRegion);
                const unlocked =
                  (policy?.cost === 0 && policy.sessions === 0) ||
                  !policy ||
                  Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                if (policy && !unlocked) {
                  const coverage = policy.coverage ? economy?.coverageByColumn[policy.coverage] ?? 0 : 0;
                  const canBuyNow = canUnlock(policy, economy?.balance ?? 0, economy?.sessions ?? 0, coverage);
                 if (!canBuyNow) return;
                  await unlockContent(family, variant, policyRegion);
                 await onRefresh();
                 return;
               }
               onPlay();
             }}
          >
             {(() => {
                  const policy = policyFor(family, variant, policyRegion);
                const unlocked =
                  !policy ||
                  (policy.cost === 0 && policy.sessions === 0) ||
                  Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                  if (selectedCount === 0) return "Sem cartas neste recorte";
                  return unlocked ? `Começar com ${selectedCount} cartas` : `Liberar por ${policy?.cost ?? 0} moedas`;
              })()} · {selectedRegions.length === 1 ? REGION_ITEMS.find(([key]) => key === selectedRegions[0])?.[1] : `${selectedRegions.length} recortes`}{" "}
            <Icon type="arrow" />
          </button>
        </div>
      </div>
    </main>
  );
}