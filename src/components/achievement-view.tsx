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
import { t } from "../domain/i18n";
import { ACHIEVEMENT_ICON, CATEGORY_ICON, Glyph, Medallion, type MedallionState } from "./achievement-art";

function ProgressBar({ item }: { item: Achievement }) {
  return <div className="ach-bar" role="progressbar" aria-label={t.achievementsView.progressAria(item.name)} aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={item.current ?? 0}><i style={{ width: `${progressRatio(item) * 100}%` }} /></div>;
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
      <span className="ach-rarity">{hidden ? t.achievementsView.rarityUnknown : RARITY_LABELS[rarity]}</span>
      <h3>{hidden ? "???" : item.name}</h3>
      <p>{hidden ? t.achievementsView.hiddenHint : item.description}</p>
      {counted && <ProgressBar item={item} />}
      <div className="ach-foot">
        {item.unlocked ? <><span className="ach-done"><Glyph name="check" size={14} stroke={2.2} /> {t.achievementsView.unlocked}</span><span>{formatUnlockDate(item.unlockedAt)}</span></>
          : hidden ? <span>{t.achievementsView.hidden}</span>
          : counted ? <><span><b>{item.current ?? 0}</b> / {item.target}</span><span>{Math.round(progressRatio(item) * 100)}%</span></>
          : <span>{t.achievementsView.notYet}</span>}
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
    ? t.achievementsView.allDone
    : next ? <><b>{t.achievementsView.nextLabel}</b>{t.achievementsView.nextText(next.name, Math.max(0, Number(next.target) - Number(next.current ?? 0)))}</>
    : t.achievementsView.playFirst;
  const categories = ACHIEVEMENT_CATEGORIES.filter((category) => filter === "todas" || filter === category.id);
  // No celular a fila de chips rola de lado: mantém o chip escolhido à vista.
  const pick = (id: string, chip: HTMLElement) => {
    setFilter(id);
    chip.scrollIntoView?.({ inline: "center", block: "nearest" });
  };

  return <section className="ach" aria-label={t.achievementsView.aria}>
    <ProgressHero
      value={unlocked} total={total} ringLabel={t.achievementsView.ringLabel(unlocked, total)}
      eyebrow={t.achievementsView.eyebrow} title={t.achievementsView.title}
      lede={t.achievementsView.lede}
      summary={summary} legendLabel={t.achievementsView.legend}
      legend={rarityBreakdown(items).map(({ rarity, unlocked: got, total: all }) => <li key={rarity} className={`ach-r${rarity}`}><Medallion icon="star" rarity={rarity} state="unlocked" size={22} />{RARITY_LABELS[rarity]} <b>{got}/{all}</b></li>)}
    />

    {near.length > 0 && filter === "todas" && <>
      <h2 className="ach-sec">{t.achievementsView.almost} <small>{t.achievementsView.inProgress(near.length)}</small></h2>
      <div className="ach-near" role="region" aria-label={t.achievementsView.almost} tabIndex={0}>
        {near.map((item) => {
          const rarity = rarityLevel(item.rarity);
          return <div className={`ach-nr ach-r${rarity}`} key={item.id}>
            <Medallion icon={ACHIEVEMENT_ICON[item.id] ?? "star"} rarity={rarity} state="locked" size={52} />
            <div><b>{item.name}</b><ProgressBar item={item} /><div className="ach-meta"><span>{item.current ?? 0} / {item.target}</span><span>{t.achievementsView.left(Math.max(0, Number(item.target) - Number(item.current ?? 0)))}</span></div></div>
          </div>;
        })}
      </div>
    </>}

    <div className="pg-chips" role="group" aria-label={t.achievementsView.filter}>
      <button type="button" className="pg-chip" aria-pressed={filter === "todas"} onClick={(event) => pick("todas", event.currentTarget)}>{t.achievementsView.all} <em>{unlocked}/{total}</em></button>
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
