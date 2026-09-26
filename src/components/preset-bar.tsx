import { useState } from "react";
import { Icon } from "./icons";
import type { TopFamily } from "../domain/match-config";
import { MAX_PRESETS_PER_FAMILY, MAX_PRESET_NAME, configOf, presetsFor, sameConfig, type Preset, type PresetDraft, type PresetResult } from "../domain/presets";

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
      setMessage(result.preset.favorite ? `Salva como “${result.preset.name}” e marcada ★ (favorita principal desta família).` : `Salva como “${result.preset.name}”.`);
    } else if (result.error === "duplicate" && result.existing) {
      setSelectedId(result.existing.id);
      setMessage(`Esta configuração já está salva como “${result.existing.name}”.`);
    } else {
      setMessage(`Você já tem ${MAX_PRESETS_PER_FAMILY} favoritas nesta família. Apague uma para salvar outra.`);
    }
  };
  const update = () => {
    if (!selected) return;
    const result = api.update(selected.id, draft);
    setMessage(result.ok ? `“${result.preset.name}” atualizada com a configuração da tela.` : result.existing ? `Outra favorita já tem esta configuração: “${result.existing.name}”.` : "Não foi possível atualizar.");
  };
  const remove = () => {
    if (!selected || !window.confirm(`Apagar a favorita “${selected.name}”?`)) return;
    api.remove(selected.id);
    setSelectedId(null);
    setRenaming(null);
    setMessage("Favorita apagada.");
  };

  return <section className="cv-favs" aria-label="Favoritas">
    <div className="cv-favs-head">
      <span className="cv-k">Favoritas</span>
      <button type="button" className="cv-chip cv-favs-add" disabled={!canSave || full} title={full ? `Limite de ${MAX_PRESETS_PER_FAMILY} favoritas por família` : undefined} onClick={save}>+ Salvar esta configuração</button>
    </div>
    {mine.length > 0
      ? <div className="cv-chips cv-favs-list" role="group" aria-label="Favoritas desta família">
        {mine.map((item) => <button type="button" key={item.id} className="cv-chip" aria-pressed={selectedId === item.id} onClick={() => { api.apply(item); onApplied(item); setSelectedId(item.id); setRenaming(null); setMessage(""); }}>
          <span className="cv-l">{item.favorite && <span className="cv-star" aria-label="favorita">★</span>}<span>{item.name}</span></span>
        </button>)}
      </div>
      : <p className="cv-hint">Monte a partida acima e salve para reusar depois.</p>}
    {selected && <div className="cv-favs-actions">
      <button type="button" className="cv-chip" disabled={!changed || !canSave} onClick={update}>Atualizar com a tela</button>
      <button type="button" className="cv-chip" disabled={selected.favorite} onClick={() => { api.favorite(selected.id); setMessage(`“${selected.name}” agora é a ★ (principal).`); }}>{selected.favorite ? "★ Principal" : "Marcar ★"}</button>
      <button type="button" className="cv-chip" onClick={() => setRenaming(selected.name)}>Renomear</button>
      <button type="button" className="cv-chip" onClick={remove}>Apagar</button>
    </div>}
    {selected && changed && <p className="cv-hint">A tela tem ajustes que ainda não estão em “{selected.name}”.</p>}
    {renaming !== null && selected && <form className="cv-favs-rename" onSubmit={(event) => { event.preventDefault(); api.rename(selected.id, renaming); setRenaming(null); setMessage("Nome atualizado."); }}>
      <input value={renaming} maxLength={MAX_PRESET_NAME} aria-label="Nome da favorita" autoFocus onChange={(event) => setRenaming(event.target.value)} />
      <button type="submit" className="cv-chip">Salvar nome</button>
      <button type="button" className="cv-chip" onClick={() => setRenaming(null)}>Cancelar</button>
    </form>}
    {message && <p className="cv-hint" role="status"><Icon type="star" size={12} /> {message}</p>}
  </section>;
}
