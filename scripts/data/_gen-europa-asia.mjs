// Gera scripts/data/languages-europa-asia.json (idiomas novos da Europa e da Ásia + países acrescentados a idiomas antigos).
// Reg/sub vêm do catálogo (país listado primeiro). Rode: node scripts/data/_gen-europa-asia.mjs && node scripts/merge-languages.mjs
import { readFileSync, writeFileSync } from "node:fs";

const cat = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8")).meta;
const byPt = new Map(Object.values(cat).map((m) => [m.pt, m]));
const P = "Paczolay, “European Proverbs in 55 languages” (1997)";
const W = (lingua, pagina) => `Provérbio tradicional ${lingua} · Wikiquote (${pagina})`;
// [id, idioma, países, texto, significado, fonte, falantes]
const rows = [
  ["albanes", "Albanês", "Albânia", "Mali me mal nuk piqen, njeriu me njeriun piqen.", "Uma montanha nunca encontra outra montanha, mas as pessoas se encontram (as pessoas sempre voltam a se cruzar)", `Provérbio tradicional albanês · Wikiquote (Albanian proverbs), citando ${P}`, "cerca de 5,4 milhões (nativos, Europa)"],
  ["catalao", "Catalão", "Andorra", "La paciència és la mare de la ciència.", "A paciência é a mãe da ciência", "Provérbio tradicional catalão · Wikiquote (Catalan proverbs), citando Strauss, “Dictionary of European Proverbs” (1994)", "cerca de 10 milhões (nativos, Europa)"],
  ["holandes", "Holandês", "Holanda, Bélgica, Suriname", "Wie a zegt, moet ook b zeggen.", "Quem diz a tem de dizer também b (quem começa deve ir até o fim)", "Provérbio tradicional holandês · Wikiquote (Dutch proverbs), citando Van Dale, “Groot woordenboek der Nederlandse taal”", "cerca de 22 milhões nativos e 24 milhões no total (Europa)"],
  ["bulgaro", "Búlgaro", "Bulgária", "На лъжата краката са къси.", "A mentira tem pernas curtas (logo é alcançada)", "Provérbio tradicional búlgaro · Wikiquote (Bulgarian proverbs), citando Kanchev (2009)", "cerca de 7,8 milhões (nativos, Europa)"],
  ["croata", "Croata", "Croácia", "Bez muke nema nauke.", "Sem esforço não há ciência (sem sofrer não se aprende)", "Provérbio tradicional croata · Wikiquote (Croatian proverbs), citando Manser, “The Facts on File Dictionary of Proverbs” (2007)", "cerca de 5,6 milhões (nativos, Europa)"],
  ["servio", "Sérvio", "Sérvia, Montenegro, Bósnia e Herzegovina", "Трипут мери, једном сеци.", "Meça três vezes, corte uma", `Provérbio tradicional sérvio · Wikiquote (Serbian proverbs), citando ${P}`, "cerca de 9 milhões (nativos, Europa)"],
  ["tcheco", "Tcheco", "Tchéquia", "Bez práce nejsou koláče.", "Sem trabalho não há kolaches (sem esforço, nada de recompensa)", "Provérbio tradicional tcheco · Wikiquote (Czech proverbs), citando Šedivý (1982)", "cerca de 10,6 milhões (nativos, Europa)"],
  ["eslovaco", "Eslovaco", "Eslováquia", "Tichá voda brehy myje.", "A água quieta lava as margens (as águas calmas podem ser fundas)", W("eslovaco", "Slovak proverbs"), "cerca de 5,2 milhões (nativos, Europa)"],
  ["esloveno", "Esloveno", "Eslovênia", "Kdor ne dela, je brez jela.", "Quem não trabalha fica sem comida", `Provérbio tradicional esloveno · Wikiquote (Slovenian proverbs), citando ${P}`, "cerca de 2,1 milhões (nativos, Europa)"],
  ["dinamarques", "Dinamarquês", "Dinamarca", "Bedre sent end aldrig.", "Melhor tarde do que nunca", "Provérbio tradicional dinamarquês · Wikiquote (Danish proverbs), citando Mawr, “Analogous Proverbs in Ten Languages” (1885)", "cerca de 5,5 milhões (nativos, Europa)"],
  ["sueco", "Sueco", "Suécia", "Först till kvarn får först mala.", "Quem chega primeiro ao moinho mói primeiro (quem chega antes é atendido antes)", "Provérbio tradicional sueco · Wikiquote (Swedish proverbs), citando Rooth (1968)", "cerca de 10 milhões nativos e 11 milhões no total (Europa)"],
  ["noruegues", "Norueguês", "Noruega", "Bedre med en fugl i hånden enn ti på taket.", "Melhor um pássaro na mão do que dez no telhado", "Provérbio tradicional norueguês · Wikiquote (Norwegian proverbs), citando Nordmanns-forbundet, “The Norseman” (1999)", "cerca de 5,2 milhões (nativos, Europa)"],
  ["finlandes", "Finlandês", "Finlândia", "Ahkeruus kovan onnen voittaa.", "A diligência vence a má sorte", "Provérbio tradicional finlandês, coletado em Tammela (Häme) · Wikiquote (Finnish proverbs), citando o arquivo da Sociedade de Literatura Finlandesa (KRA)", "cerca de 5,4 milhões (nativos, Europa)"],
  ["islandes", "Islandês", "Islândia", "Árinni kennir illur ræðari.", "O mau remador culpa o remo", "Provérbio tradicional islandês · Wikiquote (Icelandic proverbs), citando Magnúsdóttir (1993)", "cerca de 330 mil (nativos)"],
  ["estoniano", "Estoniano", "Estônia", "Kes ei tööta, see ei söö.", "Quem não trabalha, não come", "Provérbio tradicional estoniano · Wikiquote (Estonian proverbs), citando a coletânea Eesti vanasõnad (EVS)", "cerca de 1,17 milhão (nativos, Europa)"],
  ["letao", "Letão", "Letônia", "Sargi sevi pats, tad Dievs tevi sargās.", "Proteja-se você mesmo, e então Deus o protegerá", `Provérbio tradicional letão · Wikiquote (Latvian proverbs), citando ${P}`, "cerca de 1,75 milhão (nativos, Europa)"],
  ["lituano", "Lituano", "Lituânia", "Lašas po lašo ir akmenį pratašo.", "Gota após gota, até a pedra se fura", "Provérbio tradicional lituano · Wikiquote (Lithuanian proverbs), citando Strauss, “Concise Dictionary of European Proverbs” (1998)", "cerca de 3 milhões (nativos, Europa)"],
  ["hungaro", "Húngaro", "Hungria", "A türelem rózsát terem.", "A paciência dá rosas", "Provérbio tradicional húngaro · Wikiquote (Hungarian proverbs), citando Almásy, “Magyar közmondások gyűjteménye” (1890)", "cerca de 11 milhões (nativos, Europa)"],
  ["polones", "Polonês", "Polônia", "Z deszczu pod rynnę.", "Da chuva para baixo da calha (fugir de um problema e cair em outro)", "Provérbio tradicional polonês · Wikiquote (Polish proverbs), citando Kakietek, “Phraseological dictionary Polish-English” (1999)", "cerca de 38 milhões (nativos, Europa)"],
  ["romeno", "Romeno", "Romênia, Moldávia", "Cum îți așterni, așa dormi.", "Como você faz a cama, assim dorme (cada um colhe o que planta)", "Provérbio tradicional romeno · Wikiquote (Romanian proverbs), citando Manser, “The Facts on File Dictionary of Proverbs” (2007)", "cerca de 24 milhões nativos e 28 milhões no total (Europa)"],
  ["ucraniano", "Ucraniano", "Ucrânia", "В каламутній воді легко рибу ловити.", "Em água turva é fácil pescar", `Provérbio tradicional ucraniano · Wikiquote (Ukrainian proverbs), citando ${P}`, "cerca de 32,6 milhões (nativos, Europa)"],
  ["macedonio", "Macedônio", "Macedônia do Norte", "Каде има сила, нема правдина.", "Onde há força, não há justiça", "Provérbio tradicional macedônio · Wikiquote (Macedonian proverbs), citando Donev, “Manastirski dzvona” (1992)", "cerca de 1,6 milhão (nativos, Europa)"],
  ["italiano", "Italiano", "Itália, San Marino, Vaticano", "Chi fa da sé, fa per tre.", "Quem faz por si faz por três", "Provérbio tradicional italiano · Wikiquote (Italian proverbs), citando Boerio, “Dizionario del dialetto veneziano” (1829)", "cerca de 66 milhões no total (Ethnologue 2026, via Wikipédia)"],
  ["irlandes", "Irlandês", "Irlanda", "Ní thagann ciall roimh aois.", "O juízo não vem antes da idade", "Provérbio tradicional irlandês · Wikiquote (Irish proverbs), citando MacFarlane, “The Little Giant Encyclopedia of Proverbs” (2001)", "cerca de 1,87 milhão declaram saber falar irlandês (censo de 2022)"],
  ["maltes", "Maltês", "Malta", "Bidu tajjeb, nofs ix-xogħol.", "Bom começo, metade do trabalho", `Provérbio tradicional maltês · Wikiquote (Maltese proverbs), citando ${P}`, "cerca de 520 mil (nativos)"],
  ["luxemburgues", "Luxemburguês", "Luxemburgo", "Mir wëlle bleiwe wat mir sinn", "Queremos continuar sendo o que somos (lema nacional de Luxemburgo, não oficial)", "Lema nacional de Luxemburgo · Wikipédia (National symbols of Luxembourg)", "cerca de 336 mil nativos e 386 mil no total"],
  ["azerbaijano", "Azerbaijano", "Azerbaijão", "Tələsən təndirə düşər.", "Quem se apressa cai no forno de barro (a pressa é inimiga da perfeição)", "Provérbio tradicional azerbaijano · Wikiquote (Azerbaijani proverbs), citando Gurbanoghlu, “Aphorisms in English, Russian & Azerbaijani Languages” (2019)", null],
  ["malaio", "Malaio", "Malásia, Brunei", "Hidup dikandung adat, mati dikandung tanah.", "Em vida somos regidos pelo costume, na morte pela terra", "Peribahasa (provérbio) malaio tradicional · Wikiquote (Malay proverbs), citando Maxwell, Journal of the Straits Branch of the Royal Asiatic Society (1879)", null],
  ["filipino", "Filipino (tagalo)", "Filipinas", "Habang may buhay, may pag-asa.", "Enquanto há vida, há esperança", "Salawikain (provérbio) filipino tradicional · Wikiquote (Filipino proverbs)", "cerca de 87 milhões no total (Ethnologue 2026, via Wikipédia)"],
];

const out = rows.map(([id, idioma, paises, script, significado, fonte, falantes]) => {
  const nomes = paises.split(", ");
  for (const nome of nomes) if (!byPt.has(nome)) throw new Error(`país não achado no catálogo: ${nome}`);
  const primeiro = byPt.get(nomes[0]);
  return { id: `lang-${id}`, idioma, script, significado, reg: primeiro.reg, sub: primeiro.sub, fonte, ...(falantes ? { falantes } : {}), paises };
});

writeFileSync("scripts/data/languages-europa-asia.json", JSON.stringify(out, null, 1));
console.log(`${out.length} entradas escritas`);
