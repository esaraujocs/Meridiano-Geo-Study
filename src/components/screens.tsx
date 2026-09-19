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

export function Header({ legacy, economy, onSurface, onGrantDebugCoins, debugEntities, onDebugCollection }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void; onGrantDebugCoins?: () => void; debugEntities?: { id: string; name: string }[]; onDebugCollection?: (id: string, mastery: number, historical: boolean) => Promise<void> | void }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("carta-reduced-motion") === "1");
  const [debugEntity, setDebugEntity] = useState("");
  const [debugMastery, setDebugMastery] = useState("1");
  const [debugHistorical, setDebugHistorical] = useState(false);
  const [debugApplying, setDebugApplying] = useState(false);
  const [debugApplied, setDebugApplied] = useState(false);
  const debugCoinsEnabled = import.meta.env.DEV && new URLSearchParams(location.search).get("debug-coins") === "1";
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
        {onSurface && <button className="surface-menu" onClick={() => onSurface("progress")}>Progresso</button>}
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
         {debugCoinsEnabled && onGrantDebugCoins && <button className="button ghost" style={{ width: "100%", marginTop: 12 }} onClick={onGrantDebugCoins}>Conceder 10 moedas de teste</button>}
           {debugCoinsEnabled && onDebugCollection && debugEntities?.length && <div data-debug-collection style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
            <div className="eyebrow">Coleção de teste</div>
             <select style={{ width: "100%", padding: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }} value={debugEntity} onChange={(event) => setDebugEntity(event.target.value)} aria-label="Carta de teste">
              <option value="">Escolha uma entidade…</option>
              {debugEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
            </select>
             <select style={{ width: "100%", padding: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }} value={debugMastery} onChange={(event) => setDebugMastery(event.target.value)} aria-label="Nível de domínio">
              {[0, 1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Nível {level}</option>)}
            </select>
            <label><input type="checkbox" checked={debugHistorical} onChange={(event) => setDebugHistorical(event.target.checked)} /> Acervo histórico</label>
             <button className="button ghost" style={{ width: "100%", marginTop: 8 }} disabled={!debugEntity || debugApplying} onClick={async () => {
               setDebugApplying(true);
               setDebugApplied(false);
               try {
                 await onDebugCollection(debugEntity, Number(debugMastery), debugHistorical);
                 setDebugApplied(true);
               } finally {
                 setDebugApplying(false);
               }
             }}>{debugApplying ? "Aplicando…" : "Aplicar carta"}</button>
             {debugApplied && <span role="status">Carta aplicada.</span>}
          </div>}
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
  const familyGridRef = useRef<HTMLDivElement>(null);
  const [activeFamily, setActiveFamily] = useState(0);
  const [carouselMode, setCarouselMode] = useState(
    () => matchMedia("(max-width: 1399px)").matches,
  );
  const familyCount = 4;
  useEffect(() => {
    const media = matchMedia("(max-width: 1399px)");
    const update = () => setCarouselMode(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const scrollFamily = (index: number) => {
    const next = Math.max(0, Math.min(familyCount - 1, index));
    setActiveFamily(next);
    const card = familyGridRef.current?.children[next] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };
  const unlocked = (family: Family, variant: AnyQuizVariant) => {
    const policy = policyFor(family, variant, "caribe");
    return (
      !policy ||
      (policy.cost === 0 && policy.sessions === 0) ||
      Boolean(economy?.unlocked.includes(policy.key as UnlockKey))
    );
  };
  return (
    <main className="content">
      <div className="hero-row">
        <div>
          <div className="eyebrow">Visão geral / sessão local</div>
          <h1 style={{ marginTop: 14 }}>Seu percurso de hoje</h1>
          <p className="lede">Escolha uma família para continuar estudando.</p>
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
        <h2>Famílias de estudo</h2>
           <span className="mono">{economy ? `${economy.unlocked.length} liberadas` : "carregando economia"}</span>
      </div>
      {onSurface && <nav className="surface-nav" aria-label="Arquivo local">
        {(["progress", "collection", "achievements", "history"] as const).map((item) => <button key={item} onClick={() => onSurface(item)}>{item === "progress" ? "Progresso" : item === "collection" ? "Coleção" : item === "achievements" ? "Conquistas" : "Histórico"}</button>)}
      </nav>}
      <div className="family-carousel">
        <button type="button" className="carousel-arrow carousel-arrow-prev" aria-label="Família anterior" disabled={activeFamily === 0} onClick={() => scrollFamily(activeFamily - 1)}>‹</button>
        <div
          className="family-grid"
          ref={familyGridRef}
          role="region"
          aria-label="Famílias de estudo"
          onScroll={(event) => {
            const element = event.currentTarget;
            const cards = [...element.children] as HTMLElement[];
            const viewportCenter = element.scrollLeft + element.clientWidth / 2;
            const index = cards.reduce(
              (closest, card, index) =>
                Math.abs(card.offsetLeft + card.offsetWidth / 2 - viewportCenter) <
                Math.abs(cards[closest].offsetLeft + cards[closest].offsetWidth / 2 - viewportCenter)
                  ? index
                  : closest,
              0,
            );
            setActiveFamily(Math.max(0, Math.min(familyCount - 1, index)));
          }}
        >
        <button type="button"
          className={`family ${carouselMode && activeFamily === 0 ? "active" : ""} ${economy && !unlocked("mapa", "mapa") ? "locked" : ""}`}
          onClick={() => onSelect("mapa")}
          aria-hidden={carouselMode && activeFamily !== 0}
          inert={carouselMode && activeFamily !== 0 ? true : undefined}
        >
          <div className="family-geo" />
          <div>
            <div className="family-icon">
              <Icon type="map" />
            </div>
            <h3>Mapa</h3>
            <p>Localizar países e territórios.</p>
          </div>
          <div className="family-footer">
            <span>{unlocked("mapa", "mapa") ? "aberta" : "bloqueada"}</span>
            <Icon type="arrow" />
          </div>
        </button>
        <button type="button"
          className={`family ${carouselMode && activeFamily === 1 ? "active" : ""} ${economy && !unlocked("bandeiras", "bandeira-nome") ? "locked" : ""}`}
          onClick={() => onSelect("bandeiras")}
          aria-hidden={carouselMode && activeFamily !== 1}
          inert={carouselMode && activeFamily !== 1 ? true : undefined}
        >
          <div>
            <div className="family-icon" style={{ color: "var(--coral)" }}>
              <Icon type="flag" />
            </div>
            <h3>Bandeiras</h3>
          <p>Reconhecimento visual e escrita.</p>
          </div>
          <div className="family-footer">
            <span>{unlocked("bandeiras", "bandeira-nome") ? "aberta" : "bloqueada"}</span>
            <Icon type="arrow" />
          </div>
        </button>
        <button type="button"
          className={`family ${carouselMode && activeFamily === 2 ? "active" : ""} ${economy && !unlocked("capitais", "capital-pais") ? "locked" : ""}`}
          onClick={() => onSelect("capitais")}
          aria-hidden={carouselMode && activeFamily !== 2}
          inert={carouselMode && activeFamily !== 2 ? true : undefined}
        >
          <div>
            <div className="family-icon" style={{ color: "var(--gold)" }}>
              <Icon type="capital" />
            </div>
            <h3>Capitais</h3>
            <p>Recuperação de nomes.</p>
          </div>
          <div className="family-footer">
            <span>{unlocked("capitais", "capital-pais") ? "aberta" : "bloqueada"}</span>
            <Icon type="arrow" />
          </div>
        </button>
        <button type="button"
          className={`family ${carouselMode && activeFamily === 3 ? "active" : ""} ${economy && !unlocked("idiomas", "idioma-pais") ? "locked" : ""}`}
          onClick={() => onSelect("idiomas")}
          aria-hidden={carouselMode && activeFamily !== 3}
          inert={carouselMode && activeFamily !== 3 ? true : undefined}
        >
          <div><div className="family-icon" style={{ color: "var(--terracotta)" }}><Icon type="capital" /></div><h3>Idiomas</h3><p>Uma variante para ler escrita e território.</p></div>
          <div className="family-footer"><span>{unlocked("idiomas", "idioma-pais") ? "aberta" : "bloqueada"}</span><Icon type="arrow" /></div>
        </button>
        </div>
        <button type="button" className="carousel-arrow carousel-arrow-next" aria-label="Próxima família" disabled={activeFamily === familyCount - 1} onClick={() => scrollFamily(activeFamily + 1)}>›</button>
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
        <div className="legacy"><div className="eyebrow">Atlas pessoal</div><p>Seu progresso, coleção, conquistas e histórico ficam neste dispositivo.</p><button className="button ghost" style={{ marginTop: 12 }} onClick={() => onSurface?.("collection")}>Abrir coleção <Icon type="arrow" /></button></div>
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
    mapa: [["mapa", "mapa", "Clicar no mapa", "Localize o território pedido no atlas."], ["silhueta", "silhueta", "Silhueta", "Reconheça o contorno geográfico."], ["travel", "travel", "Travel", "Trace uma rota entre países."]],
    bandeiras: [["bandeiras", "bandeira-nome", "Bandeira → nome", "Reconheça o país pela bandeira."], ["bandeiras", "nome-bandeira", "Nome → bandeira", "Escolha a bandeira correspondente."], ["escrita", "escrita-pais", "Escrita · nome do país", "Digite o país a partir da bandeira."], ["historicas", "historica-nome", "Histórica → nome", "Reconheça uma bandeira histórica."], ["historicas", "nome-historica", "Nome → histórica", "Escolha a bandeira histórica."]],
    capitais: [["capitais", "capital-pais", "Clicar no mapa", "Encontre no mapa o país da capital."], ["escrita", "escrita-capital", "Escrita · nome da capital", "Digite a capital do país."]],
    idiomas: [["idiomas", "idioma-pais", "Idioma → países", "Associe uma escrita aos países."]],
  };
  const familyLabel = topFamily === "mapa" ? "Mapa" : topFamily === "bandeiras" ? "Bandeiras" : topFamily === "capitais" ? "Capitais" : "Idiomas";
  const continueWith = (engine: Family, key: AnyQuizVariant) => {
    setVariant(key);
    onSelectEngine(engine, key);
    onNext();
  };
  const directionCard = (
    engine: "bandeiras" | "historicas",
    title: string,
    description: string,
    first: [AnyQuizVariant, string],
    second: [AnyQuizVariant, string],
  ) => {
    const selected = variant === second[0] ? second[0] : first[0];
    const policy = policyFor(engine, selected, "caribe");
    const unlocked = !policy || (policy.cost === 0 && policy.sessions === 0) || Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
    return (
      <article className="family active" key={engine}>
        <div>
          <div className="family-icon"><Icon type="flag" /></div>
          <h3>{title}</h3>
          <p>{description}</p>
          <fieldset className="direction-toggle" aria-label={`Direção de ${title}`}>
            <legend>Direção da pergunta</legend>
            {[first, second].map(([key, label]) => (
              <button type="button" key={key} aria-pressed={selected === key} onClick={() => setVariant(key)}>{label}</button>
            ))}
          </fieldset>
          <button type="button" className="family-primary" onClick={() => continueWith(engine, selected)}>Começar {title}</button>
        </div>
        <div className="family-footer"><span>{unlocked ? "variante jogável" : `bloqueada · ${policy?.cost ?? 0} moedas + ${policy?.sessions ?? 0} sessão(ões)`}</span><Icon type="arrow" /></div>
      </article>
    );
  };
  return (
    <main className="content">
      <button className="back" onClick={onBack}>← Hub</button>
      <div style={{ marginTop: 38 }} className="eyebrow">{familyLabel} / escolha uma variante</div>
      <h1 style={{ marginTop: 18 }}>Como você quer estudar?</h1>
      <div style={{ maxWidth: 680, marginTop: 38 }}>
        {topFamily === "bandeiras" ? (
          <>
            {directionCard("bandeiras", "Atuais", "Reconheça bandeiras atuais ou escolha a bandeira pelo nome.", ["bandeira-nome", "Bandeira → nome"], ["nome-bandeira", "Nome → bandeira"])}
            {(() => {
              const [engine, key, label, description] = variants.bandeiras[2];
              return (
                <article className="family active" key={key}>
                  <div><div className="family-icon"><Icon type="flag" /></div><h3>{label}</h3><p>{description}</p></div>
                  <button type="button" className="family-primary" onClick={() => continueWith(engine, key)}>Começar Escrita</button>
                  <div className="family-footer"><span>variante jogável</span><Icon type="arrow" /></div>
                </article>
              );
            })()}
            {directionCard("historicas", "Históricas", "Reconheça um acervo histórico nos dois sentidos.", ["historica-nome", "Histórica → nome"], ["nome-historica", "Nome → histórica"])}
          </>
        ) : variants[topFamily].map(([engine, key, label, description]) => {
          const policy = policyFor(engine, key, "caribe");
          const unlocked =
            !policy ||
            (policy.cost === 0 && policy.sessions === 0) ||
            Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
          return (
          <button
            key={key}
            className={`family active ${variant === key ? "selected" : ""}`}
            style={{ minHeight: 150, width: "100%", marginBottom: 10 }}
            onClick={() => { setVariant(key); onSelectEngine(engine, key); onNext(); }}
          >
            <div>
              <div className="family-icon">
                <Icon type={engine === "mapa" || engine === "silhueta" || engine === "travel" ? "cross" : engine === "bandeiras" || engine === "historicas" || (engine === "escrita" && key === "escrita-pais") ? "flag" : "capital"} />
              </div>
              <h3>{label}</h3>
              <p>{description}</p>
            </div>
             <div className="family-footer"><span>{unlocked ? "variante jogável" : `bloqueada · ${policy?.cost ?? 0} moedas + ${policy?.sessions ?? 0} sessão(ões)`}</span><Icon type="arrow" /></div>
          </button>
          );
        })}
        <div className="diagnostic" style={{ marginTop: 14 }}>
          <div className="eyebrow">Percurso de estudo</div>
          <p>Cada sessão mantém o recorte escolhido e avança automaticamente após o feedback.</p>
        </div>
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
}) {
   const familyLabel = family === "mapa" ? "Mapa" : family === "bandeiras" ? "Bandeiras" : family === "capitais" ? "Capitais" : family === "escrita" ? "Escrita" : family === "historicas" ? "Históricas" : family === "idiomas" ? "Idiomas" : family === "silhueta" ? "Silhueta" : "Travel";
    const selectedPolicy = policyFor(family, variant, region);
    const selectedRegionItem = REGION_ITEMS.find(([key]) => key === region);
   const selectedUnlocked =
      !selectedPolicy ||
      (selectedPolicy.cost === 0 && selectedPolicy.sessions === 0) ||
      Boolean(economy?.unlocked.includes(selectedPolicy.key as UnlockKey));
    const canBuySelected = selectedPolicy
      ? canUnlock(selectedPolicy, economy?.balance ?? 0, economy?.sessions ?? 0)
      : false;
  return (
    <main className="rec-content">
      <button className="back" onClick={onBack}>
        ← Escolher variante
      </button>
      <div className="rec-grid">
        <div>
          <div className="eyebrow" style={{ marginTop: 38 }}>
            {familyLabel} / recorte
          </div>
          <h1 style={{ marginTop: 18 }}>Onde começa o seu {family === "mapa" ? "mundo" : "baralho"}?</h1>
          <p className="lede">
            Um conjunto menor ajuda a calibrar o olhar. Você pode voltar aqui a qualquer momento.
          </p>
        </div>
        <div>
           <div className="section-label">
             <h2>Configurar partida</h2>
             <span>{family === "mapa" ? "entidades com geometria real" : "entidades disponíveis"}</span>
           </div>
           <details className="config-details" open>
             <summary>Recorte do atlas</summary>
             <p>Escolha a região que vai compor o baralho. O recorte permanece salvo durante a sessão.</p>
           <div className="region-list" role="group" aria-label="Recortes disponíveis">
             {REGION_ITEMS.map(([key, label, description]) => {
                 const policy = policyFor(family, variant, key);
                const unlocked =
                  !policy ||
                  (policy.cost === 0 && policy.sessions === 0) ||
                  Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
               return (
              <button
                key={key}
                className="region"
                 aria-pressed={region === key}
                  disabled={counts[key] === 0}
                  onClick={() => setRegion(key)}
              >
                 <b>{label}</b>
                 <span>{counts[key] === 0 ? "indisponível" : unlocked ? "aberta" : "bloqueada"}</span>
               </button>
               );
             })}
          </div>
           <div className="region-detail" role="status" aria-live="polite">
             <div>
               <span className="eyebrow">{selectedRegionItem?.[1]}</span>
               <p>{selectedRegionItem?.[2]}</p>
             </div>
             <div className="region-detail-meta">
               <span>{selectedUnlocked ? "aberta" : "bloqueada"} · {selectedPolicy?.cost ?? 0} moedas · {selectedPolicy?.sessions ?? 0} sessão(ões)</span>
               <b>{counts[region]} cartas</b>
             </div>
           </div>
           </details>
           <details className="config-details">
             <summary>Ajustes aplicáveis</summary>
             <p>Feedback imediato e progressão por domínio estão ativos. As regras da variante escolhida serão usadas na partida.</p>
             {(family === "mapa" || family === "bandeiras" || family === "capitais" || family === "escrita" || family === "silhueta" || family === "travel") && <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--ink)", paddingBottom: 14 }}>
               <input type="checkbox" checked={onlyUn} onChange={(event) => setOnlyUn(event.target.checked)} />
               Só membros da ONU
             </label>}
           </details>
           {!selectedUnlocked && (
             <p className="diagnostic" role="status" style={{ marginTop: 14 }}>
                {selectedPolicy &&
                  (canBuySelected
                    ? `Libere esta variante por ${selectedPolicy.cost} moedas.`
                    : `Requisito: ${selectedPolicy.cost} moedas e ${selectedPolicy.sessions} sessão(ões). Saldo atual: ${economy?.balance ?? 0}; sessões: ${economy?.sessions ?? 0}.`)}
             </p>
           )}
            <button
            className="button coral"
            style={{ width: "100%", marginTop: 20 }}
             onClick={async () => {
               const policy = policyFor(family, variant, region);
                const unlocked =
                  (policy?.cost === 0 && policy.sessions === 0) ||
                  !policy ||
                  Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
                if (policy && !unlocked) {
                 const canBuyNow = canUnlock(policy, economy?.balance ?? 0, economy?.sessions ?? 0);
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
                return unlocked ? `Começar com ${counts[region]} cartas` : `Liberar por ${policy?.cost ?? 0} moedas`;
             })()} · {REGION_ITEMS.find(([key]) => key === region)?.[1]}{" "}
            <Icon type="arrow" />
          </button>
        </div>
      </div>
    </main>
  );
}