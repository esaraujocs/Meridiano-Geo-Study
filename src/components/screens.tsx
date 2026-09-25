import { lazy, Suspense, useEffect, useState, type CSSProperties, type TransitionEvent } from "react";
import { Icon } from "./icons";
import { BrandLogo } from "./brand-logo";
import type { AnyQuizVariant, Family, Legacy } from "../domain/types";
import type { LegacyProfile } from "../domain/legacy-migration";
import { isDebugEnabled } from "../domain/debug-flag";
import { EMPTY_ACHIEVEMENT_SUMMARY, achievementCaption, collectionCaption, hubProfile, ratioPercent, type AchievementSummary } from "../domain/hub-profile";
import type { OfflineMapStatus } from "../domain/offline-map";
import type { EconomySnapshot } from "../domain/economy-store";
import { policyFor, type UnlockKey } from "../domain/economy-rules";
import type { TopFamily } from "../domain/match-config";
import { THEMES, isThemeOwned } from "../domain/themes";
import { BACKUP_STORES, coinBalance, exportProgress, importProgress, parseBackup, previewImport } from "../domain/progress-backup";

export type { TopFamily };

export function Header({ legacy, economy, current = "hub", onNavigate, onSurface }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; current?: "hub" | "progress" | "collection" | "achievements" | "store" | "options"; onNavigate?: (destination: "hub" | "progress" | "collection" | "achievements" | "store" | "options") => void; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void }) {
  const items = [
    ["hub", "Modos", "map"], ["collection", "Coleção", "collection"],
    ["achievements", "Achievements", "achievements"], ["progress", "Progresso", "progress"],
    ["store", "Loja", "store"],
  ] as const;
  // no celular a Loja abre pela moeda do Hub; o lugar dela na barra de baixo é das Opções
  const mobileItems = [...items.slice(0, 4), ["options", "Opções", "settings"] as const];
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
        <BrandLogo />
        <span>MERIDIANO</span>
      </a>
      <nav className="desktop-nav" aria-label="Navegação principal">
        {items.map(([key, label, icon]) => <button key={key} aria-current={current === key ? "page" : undefined} onClick={() => onNavigate?.(key)}><Icon type={icon} /><span>{label}</span></button>)}
      </nav>
      <div className="top-actions"><button className="settings-button" aria-label="Abrir Opções" aria-current={current === "options" ? "page" : undefined} title="Opções" onClick={() => onNavigate?.("options")}><Icon type="settings" /></button></div>
    </header>
    <nav className="mobile-nav" aria-label="Navegação principal">
      {mobileItems.map(([key, label, icon]) => <button key={key} aria-label={label} title={label} aria-current={current === key ? "page" : undefined} onClick={() => onNavigate?.(key)}><Icon type={icon} /><span>{label}</span></button>)}
    </nav>
    </>
  );
}

// Painel de debug carregado só quando ligado (npm run dev, ou ?debug=1 em qualquer build).
const DebugPanel = lazy(() => import("./debug-panel"));

// Backup do progresso: o navegador guarda por endereço, então um arquivo é a forma de levar tudo para outro link/aparelho.
function BackupRow() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const file = await exportProgress();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
      link.download = `meridiano-progresso-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setMessage(`Arquivo salvo: ${file.stores.sessions.length} partidas, ${file.stores.progress.length} cartas, ${coinBalance(file.stores.ledger).toLocaleString("pt-BR")} moedas.`);
    } catch { setMessage("Não foi possível exportar o progresso."); }
    setBusy(false);
  };
  const upload = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) return;
    setBusy(true);
    try {
      const file = parseBackup(await chosen.text());
      if (!file) { setMessage("Este arquivo não é um backup do Meridiano."); setBusy(false); return; }
      const plan = await previewImport(file);
      if (plan.alreadyImported) { setMessage("Este arquivo já foi importado aqui. Nada mudou."); setBusy(false); return; }
      const news = BACKUP_STORES.filter((name) => name !== "state").reduce((sum, name) => sum + plan.added[name], 0);
      const ask = `Importar este progresso? Entram ${news} registros novos e ${plan.summed} cartas têm os acertos somados. Moedas: ${plan.coinsBefore.toLocaleString("pt-BR")} → ${plan.coinsAfter.toLocaleString("pt-BR")}. Nada do que já existe aqui é apagado.`;
      if (!window.confirm(ask)) { setMessage("Importação cancelada."); setBusy(false); return; }
      await importProgress(file);
      setMessage("Progresso importado. Recarregando…");
      window.setTimeout(() => window.location.reload(), 700);
    } catch { setMessage("Falha ao importar; nada foi alterado."); setBusy(false); }
  };
  return <div className="cv-row">
    <span className="cv-k">Progresso</span>
    <div className="cv-ctl">
      <p className="cv-hint">O navegador guarda o progresso por endereço: outro link ou aparelho começa do zero. Exporte um arquivo e importe onde quiser; ao importar, o que já existe é somado, nunca apagado.</p>
      <div className="cv-chips">
        <button type="button" className="cv-chip" disabled={busy} onClick={() => void download()}>Exportar progresso</button>
        <label className="cv-chip" aria-disabled={busy}>Importar progresso<input type="file" accept="application/json,.json" hidden disabled={busy} onChange={(event) => void upload(event.currentTarget)} /></label>
      </div>
      {message && <p className="cv-hint" role="status">{message}</p>}
    </div>
  </div>;
}

export function OptionsScreen({ data, theme, ownedUnlocks, onTheme, onOpenStore, offlineMap, onToggleOfflineMap, onDebugChange, onBack }: {
  data: Legacy;
  theme: string;
  ownedUnlocks: readonly string[];
  onTheme: (id: string) => void;
  onOpenStore: () => void;
  offlineMap: OfflineMapStatus;
  onToggleOfflineMap: () => Promise<void>;
  onDebugChange: (options: { announce: boolean }) => Promise<void> | void;
  onBack: () => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("carta-reduced-motion") === "1");
  const [timerLate, setTimerLate] = useState(() => localStorage.getItem("carta-timer-late") === "1");
  const [cacheReport, setCacheReport] = useState("Consultando cache do app…");
  useEffect(() => {
    document.documentElement.dataset.timerReveal = timerLate ? "late" : "always";
    localStorage.setItem("carta-timer-late", timerLate ? "1" : "0");
  }, [timerLate]);
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
  const ownedThemes = THEMES.filter((item) => isThemeOwned(item.id, ownedUnlocks));
  const toBuy = THEMES.length - ownedThemes.length;
  const mapBusy = offlineMap === "checking" || offlineMap === "downloading" || offlineMap === "unavailable";
  // Mesmo molde da tela "Configure a partida": título simples e um cartão só, com uma linha rotulada por assunto.
  return <main className="content cv-page options-screen">
    <div className="cv-top"><button type="button" className="back" onClick={onBack}>← Hub</button></div>
    <div className="cv">
      <header className="cv-head"><span className="eyebrow">Preferências · este aparelho</span><h1>Opções</h1></header>
      <section className="cv-card" aria-label="Preferências e disponibilidade offline">
        <div className="cv-row">
          <span className="cv-k">Aparência</span>
          <div className="cv-ctl">
            <div className="cv-chips" role="group" aria-label="Tema do Hub">
              {ownedThemes.map((item) => <button type="button" key={item.id} className="cv-chip" aria-pressed={theme === item.id} onClick={() => onTheme(item.id)}>{item.name}</button>)}
            </div>
            <p className="cv-hint">{toBuy > 0 ? `${toBuy} ${toBuy === 1 ? "tema" : "temas"} para comprar na Loja.` : "Você já tem todos os temas."} <button type="button" className="cv-buy" onClick={onOpenStore}>Abrir a Loja</button></p>
          </div>
        </div>
        <div className="cv-row">
          <span className="cv-k">Movimento</span>
          <div className="cv-ctl">
            <button type="button" role="switch" aria-checked={reducedMotion} className="cv-switch" onClick={() => setReducedMotion(!reducedMotion)}><i aria-hidden="true" /><span>Movimento reduzido</span></button>
            <p className="cv-hint">Desativa transições e animações decorativas.</p>
          </div>
        </div>
        <div className="cv-row">
          <span className="cv-k">Barra de tempo</span>
          <div className="cv-ctl">
            <button type="button" role="switch" aria-checked={timerLate} className="cv-switch" onClick={() => setTimerLate(!timerLate)}><i aria-hidden="true" /><span>Mostrar só na segunda metade</span></button>
            <p className="cv-hint">Na Partida com tempo, uma barra curta acompanha a pergunta. Ligando esta opção, ela só aparece quando falta menos da metade do tempo.</p>
          </div>
        </div>
        <BackupRow />
        <div className="cv-row cv-last">
          <span className="cv-k">Offline</span>
          <div className="cv-ctl">
            <p className="cv-hint offline-status">App e dados locais: {cacheReport}</p>
            <p className="cv-hint offline-status">Mapa: {mapLabel} · 27,7 MB</p>
            <div className="cv-chips"><button type="button" className="cv-chip" disabled={mapBusy} onClick={() => void onToggleOfflineMap()}>{offlineMap === "installed" ? "Remover mapa" : "Baixar mapa · 27,7 MB"}</button></div>
          </div>
        </div>
      </section>
      {isDebugEnabled() && <section className="options-grid" aria-label="Ferramentas de debug"><Suspense fallback={<article className="surface-card dbg"><p>Carregando ferramentas de debug…</p></article>}><DebugPanel data={data} onChange={onDebugChange} /></Suspense></section>}
    </div>
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
  totalEntities = 0,
  collectionSummary = { discovered: 0, total: 0 },
  achievementSummary = EMPTY_ACHIEVEMENT_SUMMARY,
}: {
  onSelect: (family: Family) => void;
  legacy?: LegacyProfile | null;
  economy?: EconomySnapshot | null;
  offlineMap?: OfflineMapStatus;
  onToggleOfflineMap?: () => void;
  onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void;
  onNavigate?: (destination: "hub" | "progress" | "collection" | "achievements" | "store" | "options") => void;
  totalEntities?: number;
  collectionSummary?: { discovered: number; total: number };
  achievementSummary?: AchievementSummary;
}) {
  const [activeFamily, setActiveFamily] = useState(0);
  const formatNumber = (value: number) => value.toLocaleString("pt-BR");
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
    { family: "idiomas", variant: "idioma-nome", label: "Idiomas", description: "Reconhecer idiomas pela escrita e pelos países.", icon: "language", color: "var(--terracotta)" },
  ];
  const level = economy?.level ?? 1;
  const xpInLevel = Math.max(0, (economy?.xp ?? 0) - (economy?.xpBase ?? 0));
  const xpSpan = Math.max(1, (economy?.xpNext ?? 100) - (economy?.xpBase ?? 0));
  const xpToNext = Math.max(0, (economy?.xpNext ?? 100) - (economy?.xp ?? 0));
  const masteryPct = ratioPercent(economy?.dominated ?? 0, totalEntities);
  const profile = hubProfile({ masteryPct, titleIds: achievementSummary.titles });
  const [masteryHead, ...masteryRest] = profile.masteryLine.split(" · ");
  const progressTiles = [
    { key: "collection", icon: "collection", target: "collection", big: `${collectionSummary.discovered}/${collectionSummary.total}`, label: "Coleção · cartas descobertas", pct: ratioPercent(collectionSummary.discovered, collectionSummary.total), caption: collectionCaption(collectionSummary.discovered, collectionSummary.total) },
    { key: "achievements", icon: "achievements", target: "achievements", big: `${achievementSummary.unlocked}/${achievementSummary.total}`, label: "Achievements desbloqueados", pct: ratioPercent(achievementSummary.unlocked, achievementSummary.total), caption: achievementCaption(achievementSummary) },
    { key: "progress", icon: "progress", target: "progress", big: `${masteryPct}%`, label: "Maestria · ver progresso", pct: masteryPct, caption: profile.caption },
  ] as const;
  const visibleFamilyIndexes = carouselMode
    ? [familyCount - 1, ...familyItems.map((_, index) => index), 0]
    : familyItems.map((_, index) => index);
  return (
    <main className="content hub-content">
      <h1 className="sr-only">Meridiano</h1>
      <div className="hub-bar" aria-label="Perfil de atividade">
        <svg className="hub-meridian" width="300" height="300" viewBox="0 0 170 170" aria-hidden="true">
          <defs><clipPath id="hub-globe"><circle cx="85" cy="85" r="78" /></clipPath></defs>
          <circle cx="85" cy="85" r="78" fill="none" strokeWidth="1" opacity=".5" />
          <g clipPath="url(#hub-globe)" fill="none" strokeWidth=".8" opacity=".3"><ellipse cx="85" cy="85" rx="30" ry="78" /><ellipse cx="85" cy="85" rx="58" ry="78" /><line x1="85" y1="7" x2="85" y2="163" /><line x1="7" y1="85" x2="163" y2="85" /><line x1="15" y1="55" x2="155" y2="55" /><line x1="15" y1="115" x2="155" y2="115" /></g>
        </svg>
        <div className="hub-brand" aria-hidden="true"><BrandLogo /><span>MERIDIANO</span></div>
        <div className="hub-player">
          <div className="hub-level" role="img" aria-label={`Nível ${level}, ${xpInLevel} de ${xpSpan} XP`}>
            <svg className="hub-level-ring" viewBox="0 0 132 132" aria-hidden="true"><circle className="hub-ring-track" cx="66" cy="66" r="58" />{xpInLevel > 0 && xpSpan > 0 && <circle className="hub-ring-arc" cx="66" cy="66" r="58" strokeDasharray={`${2 * Math.PI * 58 * Math.min(1, xpInLevel / xpSpan)} ${2 * Math.PI * 58}`} />}</svg>
            <strong>{level}</strong>
            <span className="hub-level-cap">nível</span>
          </div>
          <div className="hub-head">
            <span className="hub-eyebrow">Nível {level} · {xpInLevel}/{xpSpan} XP</span>
            <p className="hub-title">{profile.title}</p>
            {profile.earned.length > 0 && <ul className="hub-badges" aria-label="Títulos conquistados">{profile.earned.map((title) => <li key={title.id} className="hub-badge"><Icon type={title.icon} /><span className="hub-badge-label">{title.label}</span></li>)}</ul>}
            <p className="hub-mastery"><b>{masteryHead}</b>{masteryRest.length > 0 && ` · ${masteryRest.join(" · ")}`}</p>
          </div>
          <div className="hub-xp">
            <span className="hub-xp-label">Nível {level} · {xpInLevel} / {xpSpan} XP</span>
            <div className="hub-track" role="progressbar" aria-label="Progresso de XP" aria-valuemin={0} aria-valuemax={xpSpan} aria-valuenow={xpInLevel}><i style={{ width: `${ratioPercent(xpInLevel, xpSpan)}%` }} /></div>
            <span className="hub-xp-next">{xpToNext} para o próximo</span>
          </div>
        </div>
        <div className="hub-stats">
          <div className="hub-totals" aria-label="Estatísticas do jogador"><span><small>Partidas</small><strong>{formatNumber(economy?.completedSessions ?? 0)}</strong></span><span><small>Rodadas</small><strong>{formatNumber(economy?.rounds ?? 0)}</strong></span></div>
          <button type="button" className="hub-coin" aria-label={`${(economy?.balance ?? 0).toLocaleString("pt-BR")} moedas · abrir a Loja`} title="Loja" onClick={() => onNavigate?.("store")}><i aria-hidden="true">$</i><strong>{(economy?.balance ?? 0).toLocaleString("pt-BR")}</strong><Icon type="store" size={17} /></button>
          <button type="button" className="hub-gear" aria-label="Abrir Opções" title="Opções" onClick={() => onNavigate?.("options")}><Icon type="settings" /></button>
        </div>
      </div>
      <div className="hub-rule" aria-hidden="true" />
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
          const isUnlocked = item.family === "idiomas"
            ? unlocked("idiomas", "idioma-nome") || unlocked("idiomas", "idioma-pais")
            : unlocked(item.family, item.variant);
          return <button
            type="button"
             key={`${clone ? "clone" : "real"}-${item.family}`}
            data-fam={item.family}
            className={`family ${current && carouselMode ? "active" : ""} ${economy && !isUnlocked ? "locked" : ""}`}
            onClick={() => onSelect(item.family)}
            aria-hidden={carouselMode && !current ? true : undefined}
            inert={carouselMode && !current ? true : undefined}
          >
             <div className="family-visual" style={item.color ? { color: item.color } : undefined}><div className="family-geo" /><div className="family-icon"><Icon type={item.icon} /></div></div>
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
      <section className="hub-progress" aria-labelledby="hub-progress-title">
        <div className="section-label"><h2 id="hub-progress-title">Seu progresso</h2></div>
        <div className="hub-progress-grid">
          {progressTiles.map((tile) => <button type="button" key={tile.key} data-tile={tile.key} onClick={() => onNavigate?.(tile.target)}><span className="hub-progress-icon"><Icon type={tile.icon} /></span><span className="hub-progress-text"><strong>{tile.big}</strong><small>{tile.label}</small><span className="hub-progress-bar" aria-hidden="true"><i style={{ width: `${tile.pct}%` }} /></span><em className="hub-progress-caption">{tile.caption}</em></span><Icon type="arrow" /></button>)}
        </div>
      </section>
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
    idiomas: [["idiomas", "idioma-nome", "Nome do idioma", "Reconheça o idioma pela escrita."], ["idiomas", "idioma-pais", "Países do idioma", "Associe uma escrita aos países."]],
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
              <div className="family-footer"><span>{position === "current" ? (cardUnlocked ? "disponível" : `bloqueada · ${(cardPolicy?.cost ?? 0).toLocaleString("pt-BR")} moedas`) : "próxima variante"}</span><Icon type="arrow" /></div>
            </button>
          )})}
        </div>
        {cards.length > 1 && <button className="carousel-arrow carousel-arrow-next" aria-label="Próxima variante" onClick={() => move(active + 1)}>›</button>}
        {cards.length > 1 && <div className="carousel-dots">{cards.map(([, key], index) => <button type="button" key={key} aria-label={`Ir para variante ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => move(index)} />)}</div>}
      </div>
    </main>
  );
}
