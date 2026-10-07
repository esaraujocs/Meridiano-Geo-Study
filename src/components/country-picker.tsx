import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  DIVISION_CONTINENTS, DIVISION_COUNTRIES, divisionContinent, divisionCountry, divisionCountryMatches, divisionCountryPlays, divisionRegion, divisionRegionLabel,
  recentDivisionCountries, unitWord, type DivisionCountry, type DivisionCountryPlay,
} from "../domain/divisions";
import type { Legacy } from "../domain/types";
import { flagSource, loadFlags, type FlagCatalog } from "../domain/quiz";
import { querySessions } from "../domain/progress-surfaces";
import { t } from "../domain/i18n";

/** O seletor de país de "Estados e províncias" na Mesa (07/10/2026, opção A do mock, pensado para ~20 países): um botão com a bandeira e o país
 *  abre um painel com busca, filtro por continente, os jogados por último e a lista por continente, cada país com a palavra da unidade e a precisão
 *  (ou "novo"). No desktop é um painel sob o botão; no celular, uma folha de baixo. Esc, clique fora e escolher um país fecham. */
export function CountryPicker({ current, data, onPick }: { current: DivisionCountry; data: Legacy; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [continent, setContinent] = useState<string | null>(null);
  const [flags, setFlags] = useState<FlagCatalog>({});
  const [plays, setPlays] = useState<Record<string, DivisionCountryPlay> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => { loadFlags().then(setFlags).catch(() => undefined); }, []);
  useEffect(() => {
    if (!open) return;
    querySessions().then((sessions) => setPlays(divisionCountryPlays(sessions))).catch(() => setPlays({}));
    searchRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  const close = () => { setOpen(false); setQuery(""); setContinent(null); buttonRef.current?.focus(); };
  const pick = (id: string) => { onPick(id); close(); };
  const nameOf = (country: DivisionCountry) => divisionRegionLabel(divisionRegion(country.id));
  const flagOf = (country: DivisionCountry) => {
    const code = data.meta[country.carta]?.fl;
    const value = code ? flags[code.toLowerCase()] : undefined;
    return value ? flagSource(value) : undefined;
  };
  const unitsOf = (country: DivisionCountry) => t.divisions.picker.units(country.count, unitWord(country));
  const continentOf = (country: DivisionCountry) => divisionContinent(country, data.meta);
  const continents = DIVISION_CONTINENTS.filter((key) => DIVISION_COUNTRIES.some((country) => continentOf(country) === key));
  const visible = DIVISION_COUNTRIES.filter((country) =>
    divisionCountryMatches(country, query, [data.meta[country.carta]?.pt, data.meta[country.carta]?.en]) && (!continent || continentOf(country) === continent));
  const recent = !query && !continent && plays ? recentDivisionCountries(plays).map((id) => divisionCountry(id)).filter((country): country is DivisionCountry => Boolean(country)) : [];
  const groups = [...continents, null]
    .map((key) => ({ key, countries: visible.filter((country) => continentOf(country) === key && !recent.includes(country)) }))
    .filter((group) => group.countries.length > 0);

  const flag = (country: DivisionCountry) => {
    const src = flagOf(country);
    return src ? <img className="cp-flag" src={src} alt="" /> : <span className="cp-flag" aria-hidden="true" />;
  };
  const row = (country: DivisionCountry) => {
    const play = plays?.[country.id];
    return <button type="button" key={country.id} className="cp-row" aria-pressed={country.id === current.id} onClick={() => pick(country.id)}>
      {flag(country)}
      <span className="cp-name"><b>{nameOf(country)}</b><small>{unitsOf(country)}</small></span>
      {plays && (play
        ? <span className="cp-tag" aria-label={t.divisions.picker.accuracy(play.accuracy)}>{play.accuracy}%</span>
        : <span className="cp-tag is-new">{t.divisions.picker.fresh}</span>)}
    </button>;
  };

  return (
    <div className={`mz-country cp${open ? " is-open" : ""}`} ref={wrapRef}>
      <button ref={buttonRef} type="button" className="cp-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => (open ? close() : setOpen(true))}>
        {flag(current)}
        <span className="cp-btn-t"><b>{nameOf(current)}</b><small>{unitsOf(current)}<span className="cp-change"> · {t.divisions.picker.change}</span></small></span>
        <i aria-hidden="true"><Icon type="chevron" size={14} /></i>
      </button>
      {open && <>
        <div className="cp-shade" aria-hidden="true" onClick={close} />
        <div id={panelId} className="cp-panel" role="dialog" aria-labelledby={titleId}>
          <div className="cp-top">
            <h2 id={titleId}>{t.divisions.picker.title}</h2>
            <button type="button" className="cp-close" aria-label={t.divisions.picker.close} onClick={close}><Icon type="close" size={18} /></button>
          </div>
          <label className="cp-search">
            <Icon type="search" size={16} />
            <input ref={searchRef} type="search" value={query} placeholder={t.divisions.picker.search} aria-label={t.divisions.picker.search} autoComplete="off" spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {continents.length > 1 && <div className="cp-tabs" role="group" aria-label={t.divisions.country}>
            <button type="button" className="cv-chip" aria-pressed={continent === null} onClick={() => setContinent(null)}>{t.divisions.picker.all} <em>{DIVISION_COUNTRIES.length}</em></button>
            {continents.map((key) => <button type="button" key={key} className="cv-chip" aria-pressed={continent === key} onClick={() => setContinent(continent === key ? null : key)}>
              {t.divisions.picker.continents[key] ?? key} <em>{DIVISION_COUNTRIES.filter((country) => continentOf(country) === key).length}</em>
            </button>)}
          </div>}
          <div className="cp-list">
            {recent.length > 0 && <section><h3 className="cp-sec">{t.divisions.picker.recent}</h3><div className="cp-grid">{recent.map(row)}</div></section>}
            {groups.map((group) => <section key={group.key ?? "other"}>
              {group.key && <h3 className="cp-sec">{t.divisions.picker.continents[group.key] ?? group.key}</h3>}
              <div className="cp-grid">{group.countries.map(row)}</div>
            </section>)}
            {visible.length === 0 && <p className="cp-empty">{t.divisions.picker.empty}</p>}
          </div>
        </div>
      </>}
    </div>
  );
}
