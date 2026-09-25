// Gera scripts/data/languages-resto.json: idiomas novos da África, Ásia e Oceania com fonte verificada, mais o campo `tambem`
// (países onde uma língua compartilhada é oficial) nos idiomas antigos. Reg/sub vêm do catálogo (primeiro país listado).
// Rode depois de _gen-europa-asia.mjs: node scripts/data/_gen-resto.mjs && node scripts/merge-languages.mjs
import { readFileSync, writeFileSync } from "node:fs";

const cat = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8")).meta;
const byPt = new Map(Object.values(cat).map((m) => [m.pt, m]));
const checar = (lista) => { for (const nome of lista.split(", ")) if (!byPt.has(nome)) throw new Error(`país não achado no catálogo: ${nome}`); };
const WQ = "Lema nacional · Wikipédia (List of national mottos)";

// [id, idioma, países, texto, transliteração|null, significado, fonte, falantes|null]
const novos = [
  ["zulu", "Zulu", "África do Sul", "Umuntu ngumuntu ngabantu", null, "Uma pessoa é pessoa por meio das outras pessoas (base da filosofia ubuntu)", "Provérbio nguni/zulu · Wikipédia (Ubuntu philosophy) e Internet Encyclopedia of Philosophy (Hunhu/Ubuntu in Traditional Southern African Thought)", null],
  ["xona", "Xona", "Zimbábue", "Chara chimwe hachitswanyi inda.", null, "Um dedo sozinho não esmaga o piolho (sozinho não se resolve tudo)", "Tsumo (provérbio) xona tradicional · Duramazwi (dicionário xona) e ZimbOriginal", null],
  ["wolof", "Wolof", "Senegal, Gâmbia", "Nit nitay garabam.", null, "A pessoa é o remédio da pessoa (a humanidade se realiza com a ajuda do outro)", "Provérbio wolof · Palais de Tokyo (“Ubuntu, nite et humanisme”) e TrustAfrica (“Nio ko Bokk”)", null],
  ["twi", "Twi (acã)", "Gana", "Se wo were fi na wosankofa a yenkyi.", null, "Não é errado voltar para buscar o que se esqueceu (o conceito de sankofa)", "Provérbio acã (twi), origem do símbolo adinkra Sankofa · Wikipédia (Sankofa); grafia sem ɛ/ɔ, como nas fontes", null],
  ["bambara", "Bambara", "Mali", "Mɔgɔ mabɔ bɛ mɔgɔ ko diya.", null, "A distância entre as pessoas torna a relação agradável", "Nsana (provérbio) bambara · An ka taa (curso de bambara/diúla)", null],
  ["malgaxe", "Malgaxe", "Madagascar", "Ny atody tsy miady amim-bato.", null, "O ovo não briga com a pedra", "Ohabolana (provérbio) malgaxe · Global Literature in Libraries Initiative, “Ohabolana: Malagasy Proverbs” (org. Abhay K., 2021)", null],
  ["quiniaruanda", "Quiniaruanda", "Ruanda", "Ubumwe, Umurimo, Gukunda Igihugu", null, "Unidade, trabalho, amor à pátria (lema nacional de Ruanda)", WQ, null],
  ["sesoto", "Sesoto", "Lesoto", "Khotso, Pula, Nala", null, "Paz, chuva, prosperidade (lema nacional do Lesoto)", WQ, null],
  ["tswana", "Tswana", "Botsuana", "Pula", null, "Chuva (lema nacional de Botsuana; “pula” é também o nome da moeda)", WQ, null],
  ["suazi", "Suázi", "Essuatíni", "Siyinqaba", null, "Somos a fortaleza (lema nacional de Essuatíni)", WQ, null],
  ["urdu", "Urdu", "Paquistão", "ایمان، اتحاد، تنظیم", "Iman, Ittihad, Nazm", "Fé, unidade, disciplina (lema nacional do Paquistão)", WQ, "cerca de 246 milhões no total (Ethnologue 2026, via Wikipédia)"],
  ["tuvaluano", "Tuvaluano", "Tuvalu", "Tuvalu mo te Atua", null, "Tuvalu para o Todo-Poderoso (lema nacional de Tuvalu)", WQ, null],
  ["gilbertes", "Gilbertês", "Kiribati", "Te mauri, te raoi ao te tabomoa", null, "Saúde, paz e prosperidade (lema nacional de Kiribati)", WQ, null],
  ["uzbeque", "Uzbeque", "Uzbequistão", "Bir yigitga qirq hunar oz.", null, "Quarenta ofícios são poucos para um jovem (nunca se sabe o bastante)", "Maqol (provérbio) uzbeque tradicional · portal Ziyouz (uzbek-xalq-maqollari) e Patrimônio Cultural Imaterial do Uzbequistão (ich.uz)", null],
  ["quirguiz", "Quirguiz", "Quirguistão", "Жети өлчөп бир кес.", "Jeti ölçöp bir kes", "Meça sete vezes, corte uma", "Makal-lakap (provérbio) quirguiz tradicional · coletânea “Кыргыз макал лакаптары” (tynchtykbek.narod.ru)", null],
  ["turcomeno", "Turcomeno", "Turcomenistão", "Ýedi ölçäp bir kes.", null, "Meça sete vezes, corte uma", "Nakyl (provérbio) turcomeno tradicional · citado em textos turcomenos; coletânea “Türkmen nakyllary we atalar sözi” (G. Geldiýew, 2002)", null],
  ["divehi", "Divehi (maldivo)", "Maldivas", "Kaandhey athugai dhai nugannaasheve", null, "Não morda a mão que te alimenta", "Haruba (provérbio) maldivo · The Edition (edition.mv, “Explaining harubas”); grafia latina como publicada, sem o original em thaana", null],
];
const out = novos.map(([id, idioma, paises, script, translit, significado, fonte, falantes]) => {
  checar(paises);
  const primeiro = byPt.get(paises.split(", ")[0]);
  return { id: `lang-${id}`, idioma, script, ...(translit ? { translit } : {}), significado, reg: primeiro.reg, sub: primeiro.sub, fonte, ...(falantes ? { falantes } : {}), paises };
});

// idiomas antigos: ganham países (Liechtenstein, Mônaco) e o campo `tambem`
const antigos = JSON.parse(readFileSync("public/data/legacy/languages.json", "utf8")).entries;
const atualiza = {
  "lang-alemao": { paises: "Alemanha, Áustria, Suíça, Liechtenstein" },
  "lang-frances": { paises: "França, RD Congo, Canadá, Mônaco", tambem: "Benin, Burkina Faso, Burundi, Camarões, República Centro-Africana, Congo, Costa do Marfim, Gabão, Guiné, Togo, Seychelles, Maurício" },
  "lang-arabe": { tambem: "Marrocos, Tunísia, Líbia, Mauritânia, Sudão, Somália, Djibuti, Eritreia, Comores, Chade, Bahrein, Catar, Kuwait, Omã, Emirados Árabes Unidos, Iraque, Síria, Jordânia, Líbano, Iêmen" },
  "lang-ingles": { tambem: "Austrália, Bahamas, Barbados, Antígua e Barbuda, Dominica, Granada, São Cristóvão e Nevis, São Vicente e Granadinas, Trinidad e Tobago, Guiana, Gâmbia, Libéria, Serra Leoa, Uganda, Zâmbia, Malawi, Namíbia, Sudão do Sul, Nauru, Papua Nova Guiné, Belize" },
  "lang-espanhol": { tambem: "Cuba, Costa Rica, El Salvador, Panamá, República Dominicana, Uruguai, Guiné Equatorial, Honduras, Nicarágua" },
  "lang-portugues": { tambem: "Cabo Verde, Guiné-Bissau, São Tomé e Príncipe, Timor-Leste" },
};
for (const [id, mudanca] of Object.entries(atualiza)) {
  const entrada = antigos.find((e) => e.id === id);
  if (!entrada) throw new Error(`idioma antigo não achado: ${id}`);
  for (const campo of ["paises", "tambem"]) if (mudanca[campo]) checar(mudanca[campo].replace(/RD Congo/, "República Democrática do Congo"));
  out.push({ ...entrada, ...mudanca });
}

writeFileSync("scripts/data/languages-resto.json", JSON.stringify(out, null, 1));
console.log(`${out.length} entradas escritas`);
