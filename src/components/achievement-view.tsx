import { useState } from "react";
import { ACHIEVEMENT_CATEGORIES } from "../domain/achievements";
import {
  RARITY_LABELS,
  categoryTally,
  formatUnlockDate,
  nearAchievements,
  progressRatio,
  rarityBreakdown,
  rarityLevel,
} from "../domain/achievement-summary";
import type { Achievement } from "../domain/progress-surfaces";
import { ProgressHero } from "./progress-hero";
import { ACHIEVEMENT_ICON, CATEGORY_ICON, Glyph, Medallion, type MedallionState } from "./achievement-art";

function ProgressBar({ item }: { item: Achievement }) {
  return <div className="ach-bar" role="progressbar" aria-label={`Progresso de ${item.name}`} aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={item.current ?? 0}><i style={{ width: `${progressRatio(item) * 100}%` }} /></div>;
}

function AchievementCard({ item }: { item: Achievement }) {
  const rarity = rarityLevel(item.rarity);
  const hidden = Boolean(item.hidden) && !item.unlocked;
  const state: MedallionState = item.unlocked ? "unlocked" : hidden ? "hidden" : "locked";
  const counted = !item.unlocked && !hidden && Number(item.target ?? 0) > 1;
  const icon = ACHIEVEMENT_ICON[item.id] ?? "star";
  return <article className={`ach-card ach-r${rarity} is-${state}`}>
    <Medallion icon={icon} rarity={rarity} state={state} size={60} />
    <div className="ach-body">
      <span className="ach-rarity">{hidden ? "Raridade ?" : RARITY_LABELS[rarity]}</span>
      <h3>{hidden ? "???" : item.name}</h3>
      <p>{hidden ? "Continue jogando para descobrir." : item.description}</p>
      {counted && <ProgressBar item={item} />}
      <div className="ach-foot">
        {item.unlocked ? <><span className="ach-done"><Glyph name="check" size={14} stroke={2.2} /> Desbloqueada</span><span>{formatUnlockDate(item.unlockedAt)}</span></>
          : hidden ? <span>Conquista oculta</span>
          : counted ? <><span><b>{item.current ?? 0}</b> / {item.target}</span><span>{Math.round(progressRatio(item) * 100)}%</span></>
          : <span>Ainda não conquistada</span>}
      </div>
    </div>
  </article>;
}

export function AchievementView({ achievements }: { achievements: Achievement[] }) {
  const [filter, setFilter] = useState<string>("todas");
  const items = achievements.filter((item) => !item.deprecated);
  const total = items.length;
  const unlocked = items.filter((item) => item.unlocked).length;
  const near = nearAchievements(items);
  const next = near[0];
  const summary = total > 0 && unlocked === total
    ? "Você desbloqueou todas. Um atlas completo."
    : next ? <><b>Próximo marco:</b> {next.name}, faltam {Math.max(0, Number(next.target) - Number(next.current ?? 0))}.</>
    : "Jogue uma partida para começar a desbloquear os marcos.";
  const categories = ACHIEVEMENT_CATEGORIES.filter((category) => filter === "todas" || filter === category.id);
  // No celular a fila de chips rola de lado: mantém o chip escolhido à vista.
  const pick = (id: string, chip: HTMLElement) => {
    setFilter(id);
    chip.scrollIntoView?.({ inline: "center", block: "nearest" });
  };

  return <section className="ach" aria-label="Achievements">
    <ProgressHero
      value={unlocked} total={total} ringLabel={`${unlocked} de ${total} achievements desbloqueados`}
      eyebrow="Perfil local · Achievements" title="Achievements"
      lede="Marcos de quem joga de verdade: sequências, domínio e cantos do mapa que quase ninguém visita."
      summary={summary} legendLabel="Achievements por raridade"
      legend={rarityBreakdown(items).map(({ rarity, unlocked: got, total: all }) => <li key={rarity} className={`ach-r${rarity}`}><Medallion icon="star" rarity={rarity} state="unlocked" size={22} />{RARITY_LABELS[rarity]} <b>{got}/{all}</b></li>)}
    />

    {near.length > 0 && filter === "todas" && <>
      <h2 className="ach-sec">Quase lá <small>{near.length} em andamento</small></h2>
      <div className="ach-near" role="region" aria-label="Quase lá" tabIndex={0}>
        {near.map((item) => {
          const rarity = rarityLevel(item.rarity);
          return <div className={`ach-nr ach-r${rarity}`} key={item.id}>
            <Medallion icon={ACHIEVEMENT_ICON[item.id] ?? "star"} rarity={rarity} state="locked" size={52} />
            <div><b>{item.name}</b><ProgressBar item={item} /><div className="ach-meta"><span>{item.current ?? 0} / {item.target}</span><span>faltam {Math.max(0, Number(item.target) - Number(item.current ?? 0))}</span></div></div>
          </div>;
        })}
      </div>
    </>}

    <div className="pg-chips" role="group" aria-label="Filtrar por categoria">
      <button type="button" className="pg-chip" aria-pressed={filter === "todas"} onClick={(event) => pick("todas", event.currentTarget)}>Todas <em>{unlocked}/{total}</em></button>
      {ACHIEVEMENT_CATEGORIES.map((category) => {
        const tally = categoryTally(items, category.id);
        return <button type="button" className="pg-chip" key={category.id} aria-pressed={filter === category.id} onClick={(event) => pick(category.id, event.currentTarget)}>{category.label} <em>{tally.unlocked}/{tally.total}</em></button>;
      })}
    </div>

    {categories.map((category) => {
      const group = items.filter((item) => item.category === category.id);
      const tally = categoryTally(items, category.id);
      return <section className="ach-cat" key={category.id} aria-labelledby={`ach-cat-${category.id}`}>
        <div className="ach-cat-head"><span className="ach-cat-icon"><Glyph name={CATEGORY_ICON[category.icon] ?? "star"} size={20} /></span><h2 id={`ach-cat-${category.id}`}>{category.label}</h2><span className="ach-cat-count">{tally.unlocked}/{tally.total}</span><span className="ach-rule" /></div>
        <div className="ach-grid">{group.map((item) => <AchievementCard key={item.id} item={item} />)}</div>
      </section>;
    })}
  </section>;
}
