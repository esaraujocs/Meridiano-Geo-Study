import type { Dispatch, SetStateAction } from "react";
import { Icon } from "./icons";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionCounts } from "../domain/types";
import { REGION_ITEMS } from "../domain/regions";
import type { LegacyProfile } from "../domain/legacy-migration";
import type { OfflineMapStatus } from "../domain/offline-map";
import type { EconomySnapshot } from "../domain/economy-store";
import { canUnlock, policyFor, type UnlockKey } from "../domain/economy-rules";
import { unlockContent } from "../domain/economy-store";

export function Header({ legacy, economy, onSurface }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void }) {
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
        {legacy?.detected && (
          <span className="pill" style={{ color: "var(--gold)" }}>
            {legacy.migrated ? "progresso legado importado" : "progresso legado detectado"}
          </span>
        )}
      </div>
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
        <button className="family active" onClick={() => onSelect("mapa")}>
          <div className="family-geo" />
          <div>
            <div className="family-icon">
              <Icon type="map" />
            </div>
            <h3>Mapa</h3>
            <p>Localizar países e territórios.</p>
          </div>
          <div className="family-footer">
            <span>Caribe aberta · Mundo/Pacífico por moeda</span>
            <Icon type="arrow" />
          </div>
        </button>
        <button
          className="family"
          onClick={() => onSelect("bandeiras")}
        >
          <div>
            <div className="family-icon" style={{ color: "var(--coral)" }}>
              <Icon type="flag" />
            </div>
            <h3>Bandeiras</h3>
            <p>Reconhecimento visual.</p>
          </div>
          <div className="family-footer">
            <span>Caribe aberta · variantes por domínio</span>
            <Icon type="arrow" />
          </div>
        </button>
        <button className="family" onClick={() => onSelect("escrita")}>
          <div><div className="family-icon" style={{ color: "var(--aqua)" }}><Icon type="cross" /></div><h3>Escrita</h3><p>Recupere nomes sem alternativas.</p></div>
          <div className="family-footer"><span>país e capital · resposta livre</span><Icon type="arrow" /></div>
        </button>
        <button className="family" onClick={() => onSelect("historicas")}>
          <div><div className="family-icon" style={{ color: "var(--gold)" }}><Icon type="flag" /></div><h3>Históricas</h3><p>Bandeiras de entidades do passado.</p></div>
          <div className="family-footer"><span>universo histórico separado</span><Icon type="arrow" /></div>
        </button>
        <button className="family" onClick={() => onSelect("idiomas")}>
          <div><div className="family-icon" style={{ color: "var(--coral)" }}><Icon type="capital" /></div><h3>Idiomas</h3><p>Associe escrita, idioma e países.</p></div>
          <div className="family-footer"><span>acervo cultural separado</span><Icon type="arrow" /></div>
        </button>
        <button
          className="family"
          onClick={() => onSelect("capitais")}
        >
          <div>
            <div className="family-icon" style={{ color: "var(--gold)" }}>
              <Icon type="capital" />
            </div>
            <h3>Capitais</h3>
            <p>Recuperação de nomes.</p>
          </div>
          <div className="family-footer">
            <span>aberta · 2 variantes</span>
            <Icon type="arrow" />
          </div>
        </button>
        <button className="family" onClick={() => onSelect("silhueta")}>
          <div><div className="family-icon" style={{ color: "var(--aqua)" }}><Icon type="map" /></div><h3>Silhueta</h3><p>Reconheça o contorno do país.</p></div>
          <div className="family-footer"><span>geometria real · resposta livre</span><Icon type="arrow" /></div>
        </button>
        <button className="family" onClick={() => onSelect("travel")}>
          <div><div className="family-icon" style={{ color: "var(--coral)" }}><Icon type="arrow" /></div><h3>Travel</h3><p>Trace uma rota entre países.</p></div>
          <div className="family-footer"><span>fronteiras · até 10 tentativas</span><Icon type="arrow" /></div>
        </button>
      </div>
      <div className="lower-grid">
        <div className="diagnostic">
          <div className="eyebrow">Estado técnico · Fase 0</div>
          <p>
            <strong>PMTiles candidato: 27,7 MB.</strong> 225 fontes
            geoBoundaries e 25 fallbacks legados; Caribe e Pacífico validados
            no renderer.
          </p>
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
        <div className="legacy">
          <div className="eyebrow">Compatibilidade</div>
          <p>Abrir o percurso da versão anterior.</p>
          <a
            className="button ghost"
            style={{ marginTop: 12 }}
            href="/carta-cega-0.13.5.html"
          >
            Abrir versão clássica <Icon type="arrow" />
          </a>
        </div>
      </div>
    </main>
  );
}

export function Variant({
  family,
  variant,
  setVariant,
  onBack,
  onNext,
  economy,
}: {
  family: Family;
  variant: AnyQuizVariant;
  setVariant: (variant: AnyQuizVariant) => void;
  onBack: () => void;
  onNext: () => void;
  economy?: EconomySnapshot | null;
}) {
  const variants: Record<Family, [QuizVariant | string, string, string][]> = {
    mapa: [["mapa", "Localizar no mapa", "Clique no território pedido. Sem pistas visuais: apenas a sua leitura do espaço."]],
    bandeiras: [
      ["bandeira-nome", "Bandeira → nome", "Reconheça o país a partir da sua bandeira."],
      ["nome-bandeira", "Nome → bandeira", "Escolha a bandeira correspondente ao país."],
    ],
    capitais: [
      ["capital-pais", "Capital → país", "Relacione uma capital ao país correto."],
      ["pais-capital", "País → capital", "Recupere a capital de cada país."],
    ],
    escrita: [
      ["escrita-pais", "Escrita → país", "Digite o nome do país a partir da bandeira."],
      ["escrita-capital", "País → capital", "Digite a capital sem alternativas."],
    ],
    historicas: [
      ["historica-nome", "Bandeira histórica → nome", "Reconheça a entidade a partir da bandeira."],
      ["nome-historica", "Nome → bandeira histórica", "Escolha a bandeira histórica correspondente."],
    ],
    idiomas: [["idioma-pais", "Idioma → países", "Leia a escrita e escolha os países associados."]],
    silhueta: [["silhueta", "Silhueta", "Digite o país a partir do seu contorno geográfico."]],
    travel: [["travel", "Travel", "Descubra os países intermediários de uma rota."]],
  };
  const familyLabel = family === "mapa" ? "Mapa" : family === "bandeiras" ? "Bandeiras" : family === "capitais" ? "Capitais" : family === "escrita" ? "Escrita" : family === "historicas" ? "Históricas" : family === "idiomas" ? "Idiomas" : family === "silhueta" ? "Silhueta" : "Travel";
  return (
    <main className="content">
      <button className="back" onClick={onBack}>← Hub</button>
      <div style={{ marginTop: 38 }} className="eyebrow">{familyLabel} / escolha uma variante</div>
      <h1 style={{ marginTop: 18 }}>Como você quer estudar?</h1>
      <div style={{ maxWidth: 680, marginTop: 38 }}>
        {variants[family].map(([key, label, description]) => {
          const policy = policyFor(family, key as QuizVariant, "caribe");
          const unlocked =
            !policy ||
            (policy.cost === 0 && policy.sessions === 0) ||
            Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
          return (
          <button
            key={key}
            className={`family active ${variant === key ? "selected" : ""}`}
            style={{ minHeight: 150, width: "100%", marginBottom: 10 }}
            onClick={() => { setVariant(key as AnyQuizVariant); onNext(); }}
          >
            <div>
              <div className="family-icon">
                <Icon type={family === "mapa" ? "cross" : family === "bandeiras" ? "flag" : "capital"} />
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
            <h2>Recortes disponíveis</h2>
            <span>{family === "mapa" ? "entidades com geometria real" : "entidades disponíveis"}</span>
          </div>
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
               return unlocked ? "Abrir sessão" : `Liberar por ${policy?.cost ?? 0} moedas`;
             })()} · {REGION_ITEMS.find(([key]) => key === region)?.[1]}{" "}
            <Icon type="arrow" />
          </button>
        </div>
      </div>
    </main>
  );
}