import { useState } from "react";
import { Icon } from "./icons";
import type { TopFamily } from "../domain/match-config";
import { MAX_PRESETS_PER_FAMILY, MAX_PRESET_NAME, configOf, presetLabel, presetsFor, sameConfig, type Preset, type PresetDraft, type PresetResult } from "../domain/presets";
import { t } from "../domain/i18n";

export type PresetApi = {
  list: Preset[];
  save: (draft: PresetDraft, name?: string) => PresetResult;
  update: (id: string, draft: PresetDraft) => PresetResult;
  rename: (id: string, name: string) => void;
  favorite: (id: string) => void;
  remove: (id: string) => void;
  apply: (preset: Preset) => void;
};

// Faixa "Favoritas" da tela "Configure a partida": chips das configurações guardadas desta família (★ = a principal).
// Tocar num chip preenche a tela (dá para ajustar e regravar); "Salvar" guarda o que está na tela como nova favorita.
export function PresetBar({ api, topFamily, draft, canSave, onApplied }: {
  api: PresetApi;
  topFamily: TopFamily;
  draft: PresetDraft;
  /** Só dá para guardar o que está liberado e tem cartas. */
  canSave: boolean;
  onApplied: (preset: Preset) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const mine = presetsFor(api.list, topFamily);
  const selected = mine.find((item) => item.id === selectedId) ?? null;
  const changed = selected ? !sameConfig(selected, configOf(draft)) : false;
  const full = mine.length >= MAX_PRESETS_PER_FAMILY;

  const save = () => {
    const result = api.save(draft);
    if (result.ok) {
      setSelectedId(result.preset.id);
      setMessage(result.preset.favorite ? t.presets.savedFavorite(presetLabel(result.preset)) : t.presets.saved(presetLabel(result.preset)));
    } else if (result.error === "duplicate" && result.existing) {
      setSelectedId(result.existing.id);
      setMessage(t.presets.duplicate(presetLabel(result.existing)));
    } else {
      setMessage(t.presets.limit(MAX_PRESETS_PER_FAMILY));
    }
  };
  const update = () => {
    if (!selected) return;
    const result = api.update(selected.id, draft);
    setMessage(result.ok ? t.presets.updated(presetLabel(result.preset)) : result.existing ? t.presets.clash(presetLabel(result.existing)) : t.presets.updateFailed);
  };
  const remove = () => {
    if (!selected || !window.confirm(t.presets.confirmDelete(presetLabel(selected)))) return;
    api.remove(selected.id);
    setSelectedId(null);
    setRenaming(null);
    setMessage(t.presets.deleted);
  };

  return <section className="cv-favs" aria-label={t.presets.aria}>
    <div className="cv-favs-head">
      <span className="cv-k">{t.presets.title}</span>
      <button type="button" className="cv-chip cv-favs-add" disabled={!canSave || full} title={full ? t.presets.limitTitle(MAX_PRESETS_PER_FAMILY) : undefined} onClick={save}>{t.presets.save}</button>
    </div>
    {mine.length > 0
      ? <div className="cv-chips cv-favs-list" role="group" aria-label={t.presets.listAria}>
        {mine.map((item) => <button type="button" key={item.id} className="cv-chip" aria-pressed={selectedId === item.id} onClick={() => { api.apply(item); onApplied(item); setSelectedId(item.id); setRenaming(null); setMessage(""); }}>
          <span className="cv-l">{item.favorite && <span className="cv-star" aria-label={t.presets.favoriteAria}>★</span>}<span>{presetLabel(item)}</span></span>
        </button>)}
      </div>
      : <p className="cv-hint">{t.presets.empty}</p>}
    {selected && <div className="cv-favs-actions">
      <button type="button" className="cv-chip" disabled={!changed || !canSave} onClick={update}>{t.presets.updateWithScreen}</button>
      <button type="button" className="cv-chip" disabled={selected.favorite} onClick={() => { api.favorite(selected.id); setMessage(t.presets.nowMain(presetLabel(selected))); }}>{selected.favorite ? t.presets.isMain : t.presets.makeMain}</button>
      <button type="button" className="cv-chip" onClick={() => setRenaming(presetLabel(selected))}>{t.presets.rename}</button>
      <button type="button" className="cv-chip" onClick={remove}>{t.presets.delete}</button>
    </div>}
    {selected && changed && <p className="cv-hint">{t.presets.pending(presetLabel(selected))}</p>}
    {renaming !== null && selected && <form className="cv-favs-rename" onSubmit={(event) => { event.preventDefault(); api.rename(selected.id, renaming); setRenaming(null); setMessage(t.presets.renamed); }}>
      <input value={renaming} maxLength={MAX_PRESET_NAME} aria-label={t.presets.nameField} autoFocus onChange={(event) => setRenaming(event.target.value)} />
      <button type="submit" className="cv-chip">{t.presets.saveName}</button>
      <button type="button" className="cv-chip" onClick={() => setRenaming(null)}>{t.presets.cancel}</button>
    </form>}
    {message && <p className="cv-hint" role="status"><Icon type="star" size={12} /> {message}</p>}
  </section>;
}
