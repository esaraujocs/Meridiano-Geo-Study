import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "./icons";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionCounts } from "../domain/types";
import { REGION_ITEMS } from "../domain/regions";
import type { LegacyProfile } from "../domain/legacy-migration";
import type { OfflineMapStatus } from "../domain/offline-map";
import type { EconomySnapshot } from "../domain/economy-store";
import { canUnlock, policyFor, type UnlockKey } from "../domain/economy-rules";
import { unlockContent } from "../domain/economy-store";

export type TopFamily = "mapa" | "bandeiras" | "capitais" | "idiomas";

export function Header({ legacy, economy, onSurface, onGrantCoins, onUnlockContent }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void; onGrantCoins?: (amount: number) => Promise<void>; onUnlockContent?: () => Promise<void> }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("carta-reduced-motion") === "1");
  const [debugAmount, setDebugAmount] = useState("10");
  const [debugStatus, setDebugStatus] = useState("");
  const debugEnabled = import.meta.env.DEV;
  useEffect(() => { document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false"; localStorage.setItem("carta-reduced-motion", reducedMotion ? "1" : "0"); }, [reducedMotion]);
  return (
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
      <div className="top-actions">
        <span className="pill mono">{economy?.balance ?? 0} moedas · {economy?.coverage ?? 0} dominados</span>
        <button className="icon-button" aria-label="Abrir opções" onClick={() => setOptionsOpen((value) => !value)}><Icon type="settings" /></button>
        {legacy?.detected && (
          <span className="pill" style={{ color: "var(--gold)" }}>
            {legacy.migrated ? "progresso legado importado" : "progresso legado detectado"}
          </span>
        )}
      </div>
       {optionsOpen && <div className="options-popover" role="dialog" aria-label="Opções">
        <h3>Opções de estudo</h3>
        <label>Movimento reduzido <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /></label>
        <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 12 }}>Preferências salvas neste dispositivo.</p>
           {debugEnabled && (onGrantCoins || onUnlockContent) && <section aria-label="Developer tools" style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
            <div className="eyebrow">Debug</div>
             {onGrantCoins && <label>Moedas de teste
              <input type="number" min="1" step="1" value={debugAmount} onChange={(event) => setDebugAmount(event.target.value)} />
              <button className="button ghost" onClick={async () => {
                const amount = Number(debugAmount);
                if (!Number.isInteger(amount) || amount <= 0) { setDebugStatus("Informe um inteiro positivo."); return; }
                setDebugStatus("Aplicando…");
                try { await onGrantCoins(amount); setDebugStatus("Moedas adicionadas."); } catch (error) { setDebugStatus(error instanceof Error ? error.message : "Falha ao aplicar."); }
              }}>Adicionar moedas</button>
            </label>}
            {onUnlockContent && <button className="button ghost" onClick={async () => { setDebugStatus("Aplicando…"); try { await onUnlockContent(); setDebugStatus("Conteúdo liberado."); } catch (error) { setDebugStatus(error instanceof Error ? error.message : "Falha ao liberar."); } }}>Liberar modos e recortes</button>}
            {debugStatus && <span role="status">{debugStatus}</span>}
          </section>}
      </div>}
    </header>
  );
}

export function Hub({
  onSelect,
  legacy,
  economy,
  offlineMap,
  onToggleOfflineMap,
  onSurface,
}: {
  onSelect: (family: Family) => void;
  legacy?: LegacyProfile | null;
  economy?: EconomySnapshot | null;
  offlineMap: OfflineMapStatus;
  onToggleOfflineMap: () => void;
  onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void;
}) {
  const [activeFamily, setActiveFamily] = useState(0);
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
  const scrollFamily = (index: number) => {
    const next = (index + familyCount) % familyCount;
    setActiveFamily(next);
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
    ? [(activeFamily + familyCount - 1) % familyCount, activeFamily, (activeFamily + 1) % familyCount]
    : familyItems.map((_, index) => index);
  return (
    <main className="content">
      <div className="hero-row">
        <div>
           <div className="eyebrow">Atlas de campo / partida local</div>
            <h1 style={{ marginTop: 14 }}>Escolha uma partida</h1>
            <p className="lede">Um recorte. Uma pergunta. O atlas responde.</p>
        </div>
        <div className="hero-side">
          <span className="mono" style={{ color: "var(--aqua)" }}>
            PERFIL LOCAL
          </span>
          <br />
           <b style={{ color: "var(--cream)" }}>{economy?.balance ?? 0} moedas</b> · {economy?.coverage ?? 0} cartas
          <br />
          <span>
             {economy
               ? `${economy.sessions} sessões · ${economy.coverage} entidades descobertas`
               : legacy?.migrated && legacy.sessions
              ? `${legacy.sessions} partidas · ${legacy.rounds} rodadas preservadas`
              : "Sem sessão em andamento"}
          </span>
        </div>
      </div>
      <div className="section-label">
         <h2>Famílias</h2>
           <span className="mono">{economy ? `${economy.unlocked.length} liberadas` : "carregando economia"}</span>
       </div>
      {onSurface && <nav className="surface-nav" aria-label="Arquivo local">
         {(["progress", "collection", "achievements", "history"] as const).map((item) => <button key={item} onClick={() => onSurface(item)}>{item === "progress" ? "Progresso" : item === "collection" ? "Coleção" : item === "achievements" ? "Achievements" : "Histórico"}</button>)}
      </nav>}
      <div className="family-carousel">
          <button type="button" className="carousel-arrow carousel-arrow-prev" aria-label="Modo anterior" onClick={() => scrollFamily(activeFamily - 1)}><Icon type="arrow" /></button>
        <div
          className={`family-grid ${carouselMode ? "is-carousel" : ""}`}
          role="region"
           aria-label="Modos de jogo"
          onTouchStart={(event) => { event.currentTarget.dataset.x = String(event.touches[0].clientX); }}
          onTouchEnd={(event) => {
            const start = Number(event.currentTarget.dataset.x);
            const end = event.changedTouches[0].clientX;
            if (Math.abs(end - start) > 40) scrollFamily(activeFamily + (end < start ? 1 : -1));
          }}
        >
        {visibleFamilyIndexes.map((index, positionIndex) => {
          const item = familyItems[index];
          const current = !carouselMode || positionIndex === 1;
          const isUnlocked = unlocked(item.family, item.variant);
          return <button
            type="button"
            key={carouselMode ? `${positionIndex}:${item.family}` : item.family}
            className={`family ${current && carouselMode ? "active" : ""} ${economy && !isUnlocked ? "locked" : ""}`}
            onClick={() => onSelect(item.family)}
            aria-hidden={carouselMode && !current ? true : undefined}
            inert={carouselMode && !current ? true : undefined}
          >
            {item.family === "mapa" && <div className="family-geo" />}
            <div><div className="family-icon" style={item.color ? { color: item.color } : undefined}><Icon type={item.icon} /></div><h3>{item.label}</h3><p>{item.description}</p></div>
            <div className="family-footer"><span>{isUnlocked ? "aberta" : "bloqueada"}</span><Icon type="arrow" /></div>
          </button>;
        })}
        </div>
          <button type="button" className="carousel-arrow carousel-arrow-next" aria-label="Próximo modo" onClick={() => scrollFamily(activeFamily + 1)}><Icon type="arrow" /></button>
        <div className="carousel-dots" aria-label="Posição no carrossel">
          {Array.from({ length: familyCount }, (_, index) => (
            <button type="button" key={index} aria-label={`Ir para família ${index + 1}`} aria-current={activeFamily === index ? "true" : undefined} onClick={() => scrollFamily(index)} />
          ))}
        </div>
      </div>
      <div className="lower-grid">
        <div className="diagnostic">
          <div className="eyebrow">Mapa offline</div>
          <p>Leve o atlas inteiro para estudar sem conexão.</p>
          <button
            className="button ghost"
            style={{ marginTop: 12 }}
            disabled={
              offlineMap === "checking" ||
              offlineMap === "downloading" ||
              offlineMap === "unavailable"
            }
            onClick={onToggleOfflineMap}
          >
            {offlineMap === "installed"
              ? "Remover mapa offline"
              : offlineMap === "downloading"
                ? "Baixando 27,7 MB…"
                : offlineMap === "error"
                  ? "Tentar download novamente"
                  : offlineMap === "unavailable"
                    ? "Offline indisponível neste navegador"
                    : "Baixar mapa offline · 27,7 MB"}
          </button>
        </div>
         <div className="legacy"><div className="eyebrow">Estudo offline</div><p>O mapa continua disponível mesmo sem conexão.</p></div>
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
    bandeiras: [["bandeiras", "bandeira-nome", "Atuais", "Bandeiras atuais nos dois sentidos."], ["escrita", "escrita-pais", "Escrita", "Digite o país pela bandeira."], ["historicas", "historica-nome", "Históricas", "Bandeiras históricas nos dois sentidos."]],
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
  region: Region;
  setRegion: Dispatch<SetStateAction<Region>>;
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
    const selectedPolicy = policyFor(family, variant, region);
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
      if (counts[region] > 0) return;
      const available = REGION_ITEMS.find(([key]) => counts[key] > 0)?.[0];
      if (available && available !== region) setRegion(available);
    }, [counts, region, setRegion]);
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
                  ? [["bandeira-nome","Atuais","bandeiras"],["escrita-pais","Escrita","escrita"],["historica-nome","Históricas","historicas"]]
                  : topFamily === "capitais"
                    ? [["capital-pais","Clicar no mapa","capitais"],["escrita-capital","Escrita","escrita"]]
                    : [["idioma-pais","Idiomas","idiomas"]]
              ).map(([key, label, engine]) => {
                const policy = policyFor(engine as Family, key as AnyQuizVariant, region);
                const isUnlocked = !policy || (policy.cost === 0 && policy.sessions === 0) || Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                return <button type="button" className={`chip ${!isUnlocked ? "chip-locked" : ""}`} aria-pressed={variant === key} key={key} onClick={() => { onFamilyChange(engine as Family, key as AnyQuizVariant); setVariant(key as AnyQuizVariant); localStorage.setItem(`carta-last-variant:${topFamily}`, key); }}>{label}{!isUnlocked ? ` · ${policy?.cost ?? 0} moedas` : ""}</button>;
              })}
            </div>
            <div className="section-label config-section-title"><h2>Recorte</h2></div>
           <div className="region-list" role="group" aria-label="Recortes disponíveis">
             {REGION_ITEMS.map(([key, label, description]) => {
               return (
              <button
                key={key}
                className="region"
                 aria-pressed={region === key}
                  disabled={counts[key] === 0}
                  onClick={() => setRegion(key)}
              >
                  <b>{label}</b><span>{counts[key] === 0 ? "0 cartas" : `${counts[key]} cartas`}</span>
               </button>
               );
             })}
          </div>
            {family === "bandeiras" || family === "historicas" ? <div className="config-row"><span>Direção</span><div className="chip-list">{(family === "bandeiras" ? [["bandeira-nome","Bandeira → nome"],["nome-bandeira","Nome → bandeira"]] : [["historica-nome","Histórica → nome"],["nome-historica","Nome → histórica"]]).map(([key,label]) => <button type="button" className="chip" key={key} aria-pressed={variant === key} onClick={() => setVariant(key as AnyQuizVariant)}>{label}</button>)}</div></div> : null}
            {(family === "mapa" || family === "bandeiras" || family === "capitais" || family === "escrita" || family === "silhueta" || family === "travel") && <div className="config-row"><span>Filtro</span><button type="button" className="chip" aria-pressed={onlyUn} onClick={() => setOnlyUn(!onlyUn)}>Só membros da ONU</button></div>}
            {family === "silhueta" && <div className="config-row"><span>Resposta</span><div className="chip-list"><button type="button" className="chip" aria-pressed={variant === "silhueta"} onClick={() => setVariant("silhueta")}>Escrever</button><button type="button" className="chip" aria-pressed={variant === "silhueta-opcoes"} onClick={() => setVariant("silhueta-opcoes")}>Alternativas</button></div></div>}
            <div className="config-empty-note">{counts[region] === 0 ? "Sem cartas neste recorte para esta variante." : "Selecione um recorte para continuar."}</div>
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
              disabled={counts[region] === 0}
             onClick={async () => {
               const policy = policyFor(family, variant, region);
                const unlocked =
                  (policy?.cost === 0 && policy.sessions === 0) ||
                  !policy ||
                  Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                if (policy && !unlocked) {
                  const coverage = policy.coverage ? economy?.coverageByColumn[policy.coverage] ?? 0 : 0;
                  const canBuyNow = canUnlock(policy, economy?.balance ?? 0, economy?.sessions ?? 0, coverage);
                 if (!canBuyNow) return;
                 await unlockContent(family, variant, region);
                 await onRefresh();
                 return;
               }
               onPlay();
             }}
          >
             {(() => {
               const policy = policyFor(family, variant, region);
                const unlocked =
                  !policy ||
                  (policy.cost === 0 && policy.sessions === 0) ||
                  Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                 if (counts[region] === 0) return "Sem cartas neste recorte";
                 return unlocked ? `Começar com ${counts[region]} cartas` : `Liberar por ${policy?.cost ?? 0} moedas`;
             })()} · {REGION_ITEMS.find(([key]) => key === region)?.[1]}{" "}
            <Icon type="arrow" />
          </button>
        </div>
      </div>
    </main>
  );
}