import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "./icons";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionCounts } from "../domain/types";
import { REGION_ITEMS } from "../domain/regions";
import type { LegacyProfile } from "../domain/legacy-migration";
import type { OfflineMapStatus } from "../domain/offline-map";
import type { EconomySnapshot } from "../domain/economy-store";
import { canUnlock, policyFor, type UnlockKey } from "../domain/economy-rules";
import { unlockContent } from "../domain/economy-store";

export type TopFamily = "mapa" | "bandeiras" | "capitais" | "idiomas";

export function Header({ legacy, economy, onSurface }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("carta-reduced-motion") === "1");
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
      <div className="family-grid">
        <article className={`family active ${economy && !unlocked("mapa", "mapa") ? "locked" : ""}`}>
          <div className="family-geo" />
          <div>
            <div className="family-icon">
              <Icon type="map" />
            </div>
            <h3>Mapa</h3>
            <p>Localizar países e territórios.</p>
            <button className="family-primary" onClick={() => onSelect("mapa")}>Abrir Mapa</button>
            <div className="family-variants" onClick={(event) => event.stopPropagation()}>
              <button onClick={() => onSelect("silhueta")}>Silhueta</button>
              <button onClick={() => onSelect("travel")}>Travel</button>
            </div>
          </div>
          <div className="family-footer">
            <span>{unlocked("mapa", "mapa") ? "Caribe aberta · Mundo/Pacífico por moeda" : "bloqueada · desbloqueie no recorte"}</span>
            <Icon type="arrow" />
          </div>
        </article>
        <article
          className={`family ${economy && !unlocked("bandeiras", "bandeira-nome") ? "locked" : ""}`}
        >
          <div>
            <div className="family-icon" style={{ color: "var(--coral)" }}>
              <Icon type="flag" />
            </div>
            <h3>Bandeiras</h3>
          <p>Reconhecimento visual e escrita.</p>
          <button className="family-primary" onClick={() => onSelect("bandeiras")}>Abrir Bandeiras</button>
          <div className="family-variants" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => onSelect("escrita")}>Escrita · nome do país</button>
            <button onClick={() => onSelect("historicas")}>Históricas</button>
          </div>
          </div>
          <div className="family-footer">
            <span>{unlocked("bandeiras", "bandeira-nome") ? "Caribe aberta · variantes por domínio" : "bloqueada · desbloqueie no recorte"}</span>
            <Icon type="arrow" />
          </div>
        </article>
        <article
          className={`family ${economy && !unlocked("capitais", "capital-pais") ? "locked" : ""}`}
        >
          <div>
            <div className="family-icon" style={{ color: "var(--gold)" }}>
              <Icon type="capital" />
            </div>
            <h3>Capitais</h3>
            <p>Recuperação de nomes.</p>
            <button className="family-primary" onClick={() => onSelect("capitais")}>Abrir Capitais</button>
          </div>
          <div className="family-footer">
            <span>{unlocked("capitais", "capital-pais") ? "aberta · 2 variantes" : "bloqueada · desbloqueie no recorte"}</span>
            <Icon type="arrow" />
          </div>
        </article>
        <article className={`family ${economy && !unlocked("idiomas", "idioma-pais") ? "locked" : ""}`}>
          <div><div className="family-icon" style={{ color: "var(--terracotta)" }}><Icon type="capital" /></div><h3>Idiomas</h3><p>Uma variante para ler escrita e território.</p></div>
          <button className="family-primary" onClick={() => onSelect("idiomas")}>Abrir Idiomas</button>
          <div className="family-footer"><span>acervo cultural · variante única</span><Icon type="arrow" /></div>
        </article>
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
  return (
    <main className="content">
      <button className="back" onClick={onBack}>← Hub</button>
      <div style={{ marginTop: 38 }} className="eyebrow">{familyLabel} / escolha uma variante</div>
      <h1 style={{ marginTop: 18 }}>Como você quer estudar?</h1>
      <div style={{ maxWidth: 680, marginTop: 38 }}>
        {variants[topFamily].map(([engine, key, label, description]) => {
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
          <div className="region-list">
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
                  disabled={counts[key] === 0}
                  onClick={() => setRegion(key)}
                style={{
                  borderColor: region === key ? "var(--aqua)" : undefined,
                }}
              >
                <span>
                  <b>{label}</b>
                  <br />
                  <small>{description}</small>
                </span>
                 <strong>{!unlocked ? `${policy?.cost ?? 0} moedas · ${policy?.sessions ?? 0} sessão(ões)` : null}{" "}
                  {counts[key]}{" "}
                  <span style={{ fontSize: 10, fontWeight: 400 }}>lugares</span>
                </strong>
               </button>
               );
             })}
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
            <div className="deck-line"><span className="mono">TAMANHO DO BARALHO</span><b>{counts[region]} cartas</b></div>
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