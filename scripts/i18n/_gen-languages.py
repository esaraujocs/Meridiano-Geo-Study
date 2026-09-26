"""Gera scripts/i18n/{en,es}/languages.json (fichas do modo Idiomas) a partir das traduções abaixo.
Nome do idioma, significado da frase e falantes são traduzidos à mão; a posição no ranking segue um padrão fixo e sai por regra.
Uso: python scripts/i18n/_gen-languages.py && node scripts/i18n/build-i18n.mjs
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
entries = {e["id"]: e for e in json.loads((ROOT / "public/data/legacy/languages.json").read_text(encoding="utf8"))["entries"]}

# id: (en_nome, en_significado, en_falantes, es_nome, es_significado, es_falantes)
T = {
 "lang-sanscrito": ("Sanskrit", "The whole Earth is one family", "about 20 thousand (almost only liturgical and academic use today)",
                    "Sánscrito", "La Tierra entera es una familia", "unos 20 mil (hoy casi solo de uso litúrgico y académico)"),
 "lang-mandarim": ("Chinese (Mandarin)", "A journey of a thousand li begins beneath one's feet", "1.18 billion",
                   "Chino (mandarín)", "Un viaje de mil li comienza bajo los pies", "1180 millones"),
 "lang-japones": ("Japanese", "Fall seven times, get up eight", "126 million", "Japonés", "Cae siete veces, levántate ocho", "126 millones"),
 "lang-arabe": ("Arabic", "Time is gold", "335 million", "Árabe", "El tiempo es oro", "335 millones"),
 "lang-grego": ("Greek", "Everything flows", "13.2 million", "Griego", "Todo fluye", "13,2 millones"),
 "lang-coreano": ("Korean", "Even a sheet of paper is lighter when two people lift it", "82.2 million",
                  "Coreano", "Hasta una hoja de papel pesa menos si la levantan dos", "82,2 millones"),
 "lang-tailandes": ("Thai", "When the tide rises, it's time to collect water (seize opportunities while they last)", "71.4 million",
                    "Tailandés", "Cuando sube la marea, es hora de recoger agua (aprovecha las oportunidades mientras duran)", "71,4 millones"),
 "lang-bengali": ("Bengali", "Patience bears fruit", "274 million", "Bengalí", "La paciencia da frutos", "274 millones"),
 "lang-tamil": ("Tamil", "What is truthfulness? Nothing but words wholly free of harm.", "86.4 million",
                "Tamil", "¿Qué es la veracidad? Nada más que palabras del todo libres de mal.", "86,4 millones"),
 "lang-telugu": ("Telugu", "In the wrong place, don't claim superiority (there's a time and place for everything)", "96 million",
                 "Telugu", "En un lugar impropio no se impone la superioridad (hay un momento y un lugar para todo)", "96 millones"),
 "lang-canares": ("Kannada", "Even if the Vedas err, the proverb never lies (the weight of folk wisdom)", "58.7 million",
                  "Canarés", "Aunque los Vedas se equivoquen, el proverbio nunca miente (el peso de la sabiduría popular)", "58,7 millones"),
 "lang-malaiala": ("Malayalam", "Whoever practices constantly can lift an elephant (practice makes perfect)", "38.7 million",
                   "Malayalam", "Quien practica sin parar logra levantar un elefante (la práctica hace al maestro)", "38,7 millones"),
 "lang-guzerate": ("Gujarati", "The fruits of patience are sweet", "62.5 million", "Guyaratí", "Los frutos de la paciencia son dulces", "62,5 millones"),
 "lang-panjabi": ("Punjabi", "Where there's a will, there's a way", "36.6 million (Eastern Punjabi, Gurmukhi script)",
                  "Panyabí", "Donde hay voluntad, hay un camino", "36,6 millones (panyabí oriental, escritura gurmukhi)"),
 "lang-oria": ("Odia", "Gentle water cuts stone (slow and steady wins)", "39.5 million",
               "Oriya", "El agua mansa corta la piedra (despacio y constante se gana)", "39,5 millones"),
 "lang-cingales": ("Sinhala", "What use is a lamp to a blind man? (something useless to whoever can't benefit from it)", "20.4 million",
                   "Cingalés", "¿De qué le sirve una lámpara a un ciego? (algo inútil para quien no puede aprovecharlo)", "20,4 millones"),
 "lang-birmanes": ("Burmese", "Let the snake not die, nor the stick break (settle the conflict without harm to either side)", "44.5 million",
                   "Birmano", "Que no muera la serpiente ni se rompa el palo (resolver el conflicto sin daño para ninguna parte)", "44,5 millones"),
 "lang-khmer": ("Khmer", "Drop by drop, the bucket fills (small, steady efforts lead to big results)", "20.3 million",
                "Jemer", "Gota a gota se llena el cubo (los pequeños esfuerzos constantes llevan a grandes resultados)", "20,3 millones"),
 "lang-lao": ("Lao", "Whoever endures the sour eats the sweet; whoever holds on wins gold (the reward of patience)", "about 4 million",
              "Lao", "Quien aguanta lo agrio come lo dulce; quien resiste gana oro (la recompensa de la paciencia)", "unos 4 millones"),
 "lang-georgiano": ("Georgian", "A new broom sweeps well, the old one brings sand (\"a new broom sweeps clean\")", "3.9 million",
                    "Georgiano", "La escoba nueva barre bien, la vieja trae arena (\"escoba nueva barre bien\")", "3,9 millones"),
 "lang-armenio": ("Armenian", "The sun doesn't stay behind the cloud (the truth always comes out)", "about 6 million",
                  "Armenio", "El sol no se queda detrás de la nube (la verdad siempre sale a la luz)", "unos 6 millones"),
 "lang-hebraico": ("Hebrew", "Don't look at the jug, but at what's inside it (don't judge by appearances)", "10.5 million",
                   "Hebreo", "No mires la jarra, sino lo que hay dentro (no juzgues por las apariencias)", "10,5 millones"),
 "lang-amarico": ("Amharic", "Slowly, slowly, the egg walks on its own legs (gradual processes achieve the impossible)", "78 million",
                  "Amárico", "Poco a poco, el huevo camina con sus propias patas (los procesos graduales logran lo imposible)", "78 millones"),
 "lang-mongol": ("Mongolian", "If you're alive, you'll drink water from a golden cup (while there's life, there's hope)", "about 5.5 million",
                 "Mongol", "Si sigues vivo, beberás agua en una copa de oro (mientras hay vida, hay esperanza)", "unos 5,5 millones"),
 "lang-tibetano": ("Tibetan", "Traditional Buddhist mantra invoking Avalokiteshvara/Chenrezig, the bodhisattva of compassion", "about 6 million (Tibetic languages together)",
                   "Tibetano", "Mantra budista tradicional que invoca a Avalokiteshvara/Chenrezig, el bodhisattva de la compasión", "unos 6 millones (lenguas tibéticas en conjunto)"),
 "lang-persa": ("Persian", "Listen to this reed (the ney flute), how it complains — opening verse of the Masnavi", "82.5 million (Iranian Persian — Dari and Tajik are counted separately)",
                "Persa", "Escucha esta caña (la flauta ney), cómo se queja — verso inicial del Masnavi", "82,5 millones (persa iraní — el darí y el tayiko se cuentan aparte)"),
 "lang-russo": ("Russian", "The slower you go, the further you'll get (haste gets in the way)", "210 million",
                "Ruso", "Cuanto más despacio vayas, más lejos llegarás (la prisa estorba)", "210 millones"),
 "lang-ingles": ("English", "A friend in need is a friend indeed (friendship shows in hard times)", "1.49 billion",
                 "Inglés", "Un amigo en la necesidad es un amigo de verdad (la amistad se revela en las dificultades)", "1490 millones"),
 "lang-espanhol": ("Spanish", "Every cloud has a silver lining (every misfortune can bring something good)", "561 million",
                   "Español", "No hay mal que por bien no venga (toda desgracia puede traer algo bueno)", "561 millones"),
 "lang-frances": ("French", "Little by little, the bird builds its nest (with patience everything is achieved)", "334 million",
                  "Francés", "Poco a poco, el pájaro hace su nido (con paciencia todo se consigue)", "334 millones"),
 "lang-indonesio": ("Indonesian", "Little by little, over time it becomes a hill (constant drops wear away the stone)", "255 million",
                    "Indonesio", "Poco a poco, con el tiempo se vuelve una colina (la gota constante horada la piedra)", "255 millones"),
 "lang-vietnamita": ("Vietnamese", "Grind the iron long enough and one day it becomes a needle (perseverance leads to success)", "97 million",
                     "Vietnamita", "Si te esfuerzas en afilar el hierro, un día se vuelve aguja (la perseverancia lleva al éxito)", "97 millones"),
 "lang-turco": ("Turkish", "Drop by drop, a lake is formed (small efforts add up to something big)", "93.7 million",
                "Turco", "Gota a gota se forma un lago (los pequeños esfuerzos acumulados se vuelven algo grande)", "93,7 millones"),
 "lang-suaili": ("Swahili", "Hurry, hurry has no blessing (haste makes waste)", "95.2 million",
                 "Suajili", "La prisa, la prisa no tiene bendición (vísteme despacio, que tengo prisa)", "95,2 millones"),
 "lang-hausa": ("Hausa", "Leave the chicken in its feathers (don't stir up a matter better left alone)", "94.5 million",
                "Hausa", "Deja a la gallina con sus plumas (no remuevas un asunto que está mejor quieto)", "94,5 millones"),
 "lang-alemao": ("German", "The apple doesn't fall far from the trunk (like father, like son)", "133 million",
                 "Alemán", "La manzana no cae lejos del tronco (de tal palo, tal astilla)", "133 millones"),
 "lang-cherokee": ("Cherokee", "Working together (Cherokee community cooperation)", "about 2 thousand (1.5 to 2.1 thousand, 2018–2019)",
                   "Cheroqui", "Trabajar juntos (la cooperación comunitaria cheroqui)", "unos 2 mil (entre 1,5 y 2,1 mil, 2018-2019)"),
 "lang-inuktitut": ("Inuktitut", "Our land, our strength (Nunavut's motto)", "about 41.7 thousand (37.6 thousand as a first language; Census of Canada, 2021)",
                    "Inuktitut", "Nuestra tierra, nuestra fuerza (lema de Nunavut)", "unos 41,7 mil (37,6 mil como lengua materna; censo de Canadá, 2021)"),
 "lang-cree": ("Cree", "Kinship: the relationships and responsibilities between people, community and nature (the basis of nêhiyaw law)", "about 86 thousand (all varieties of Cree; Census of Canada, 2021)",
               "Cree", "Parentesco: las relaciones y responsabilidades entre las personas, la comunidad y la naturaleza (base de la ley nêhiyaw)", "unos 86 mil (todas las variedades del cree; censo de Canadá, 2021)"),
 "lang-navajo": ("Navajo", "I will walk in beauty (opening line of the Beauty Way prayer)", "about 170 thousand (2019)",
                 "Navajo", "Caminaré en la belleza (verso inicial de la oración del Camino de la Belleza)", "unos 170 mil (2019)"),
 "lang-groenlandes": ("Greenlandic", "Our land, so old (first line of Greenland's national anthem)", "about 57 thousand (2007 estimate)",
                      "Groenlandés", "Nuestra tierra, tan antigua (primer verso del himno nacional de Groenlandia)", "unos 57 mil (estimación de 2007)"),
 "lang-nauatle": ("Nahuatl", "The face, the heart (the whole person: identity and character)", "about 1.65 million (all varieties of Nahuatl; Mexican Census, 2020)",
                  "Náhuatl", "El rostro, el corazón (la persona entera: identidad y carácter)", "unos 1,65 millones (todas las variedades del náhuatl; censo de México, 2020)"),
 "lang-kiche": ("K'iche'", "This is the beginning of the ancient stories here in Quiché (first line of the Popol Vuh)", "about 1.05 million (Guatemalan Census, 2019)",
                "K'iche'", "Este es el principio de las antiguas historias aquí en el Quiché (primera línea del Popol Vuh)", "unos 1,05 millones (censo de Guatemala, 2019)"),
 "lang-portugues": ("Portuguese", "Perseverance beats the hardest obstacles (soft water ends up boring through stone)", "269.4 million",
                    "Portugués", "La perseverancia vence los obstáculos más duros (el agua blanda acaba horadando la piedra)", "269,4 millones"),
 "lang-quichua": ("Quechua", "Don't be lazy, don't be a liar, don't be a thief", "about 7.2 million (all varieties of Quechua; Cusco Quechua has about 1.5 million)",
                  "Quechua", "No seas ocioso, no seas mentiroso, no seas ladrón", "unos 7,2 millones (todas las variedades del quechua; el cusqueño tiene unos 1,5 millones)"),
 "lang-aimara": ("Aymara", "Living well (Aymara buen vivir: harmony with the community and with nature)", "about 1.7 million (Central Aymara, 2007–2014)",
                 "Aimara", "Vivir bien (el buen vivir aimara: armonía con la comunidad y con la naturaleza)", "unos 1,7 millones (aimara central, 2007-2014)"),
 "lang-guarani": ("Guarani", "Our way of being and living (the Guarani way of living in harmony)", "6.3 million (Paraguayan Guarani)",
                  "Guaraní", "Nuestro modo de ser y de vivir (la manera guaraní de vivir en armonía)", "6,3 millones (guaraní paraguayo)"),
 "lang-mapudungun": ("Mapudungun", "Living well (Mapuche buen vivir: balance between people, the land and the spiritual)", "about 406 thousand (2024)",
                     "Mapudungun", "Vivir bien (el buen vivir mapuche: equilibrio entre las personas, la tierra y lo espiritual)", "unos 406 mil (2024)"),
 "lang-wayuu": ("Wayuu", "The palabrero, “messenger of the word”: the mediator of the Wayuu normative system (UNESCO intangible heritage since 2010)", "about 416 thousand (2008–2012)",
                "Wayuu", "El palabrero, “mensajero de la palabra”: el mediador del sistema normativo wayuu (patrimonio inmaterial de la UNESCO desde 2010)", "unos 416 mil (2008-2012)"),
 "lang-ticuna": ("Ticuna", "The people (what the Ticuna call themselves)", "about 63 thousand (2021)",
                 "Ticuna", "El pueblo (como se llaman a sí mismos los ticunas)", "unos 63 mil (2021)"),
 "lang-shipibo": ("Shipibo-Conibo", "The good world: the spiritual world of traditional Shipibo medicine, source of the kené designs (cultural heritage of Peru since 2008)", "about 26 thousand (2003)",
                  "Shipibo-conibo", "El buen mundo: el mundo espiritual de la medicina tradicional shipiba, de donde vienen los diseños kené (patrimonio cultural del Perú desde 2008)", "unos 26 mil (2003)"),
 "lang-jamaicano": ("Jamaican Creole (Patois)", "One by one, the coconuts fill the basket (success comes little by little)", "about 3.2 million (2000–2001)",
                    "Criollo jamaiquino (patois)", "Uno a uno, los cocos llenan la canasta (el éxito llega de a poco)", "unos 3,2 millones (2000-2001)"),
 "lang-santa-lucia": ("Saint Lucian Creole", "The small axe fells the big tree (don't judge by size)", "about 700 thousand (Ethnologue estimate, 2016)",
                      "Criollo de Santa Lucía", "El hacha pequeña derriba el árbol grande (no juzgues por el tamaño)", "unos 700 mil (estimación de Ethnologue, 2016)"),
 "lang-papiamento": ("Papiamento", "Aruba, dear land (title of Aruba's national anthem)", "about 350 thousand (2025)",
                     "Papiamento", "Aruba, tierra querida (título del himno nacional de Aruba)", "unos 350 mil (2025)"),
 "lang-haitiano": ("Haitian Creole", "Beyond the mountains, more mountains (overcome one challenge and another appears; and there's always someone bigger than you)", "13.8 million",
                   "Criollo haitiano", "Detrás de las montañas hay más montañas (superado un desafío, surge otro; y siempre hay alguien más grande que tú)", "13,8 millones"),
 "lang-maori": ("Māori", "What is the most important thing in the world? It is the people, the people, the people", "about 50 thousand fluent (2015) and 186 thousand with some knowledge (2018)",
                "Maorí", "¿Qué es lo más importante del mundo? Es la gente, la gente, la gente", "unos 50 mil fluidos (2015) y 186 mil con algún conocimiento (2018)"),
 "lang-havaiano": ("Hawaiian", "In the word there is life, in the word there is death (speech can heal or wound)", "about 300 native speakers (2006) and 22 to 24 thousand as a second language",
                   "Hawaiano", "En la palabra hay vida, en la palabra hay muerte (hablar puede curar o herir)", "unos 300 nativos (2006) y entre 22 y 24 mil como segunda lengua"),
 "lang-samoano": ("Samoan", "Stones rot, words do not (what is said remains)", "about 430 thousand (2020–2022)",
                  "Samoano", "Las piedras se pudren, las palabras no (lo que se dice permanece)", "unos 430 mil (2020-2022)"),
 "lang-tonganes": ("Tongan", "God and Tonga are my inheritance (national motto of Tonga)", "about 187 thousand in Tonga (1998) and 73 thousand abroad",
                   "Tongano", "Dios y Tonga son mi herencia (lema nacional de Tonga)", "unos 187 mil en Tonga (1998) y 73 mil en el exterior"),
 "lang-taitiano": ("Tahitian", "Great Tahiti of the golden haze (motto of French Polynesia)", "about 68 thousand (2007 census)",
                   "Tahitiano", "Gran Tahití de la bruma dorada (lema de la Polinesia Francesa)", "unos 68 mil (censo de 2007)"),
 "lang-maori-cook": ("Cook Islands Māori", "To God Almighty (title of the national anthem; also translated as “God is truth”)", "about 13.6 thousand in the Cook Islands (2011 census)",
                     "Maorí de las Islas Cook", "A Dios Todopoderoso (título del himno nacional; también traducido como “Dios es la verdad”)", "unos 13,6 mil en las Islas Cook (censo de 2011)"),
 "lang-niueano": ("Niuean", "God, Niue forever (motto on the seal of Niue)", "about 1.3 thousand in Niue (2018) and 4.5 thousand in New Zealand (2013)",
                  "Niueano", "Dios, Niue para siempre (lema del sello de Niue)", "unos 1,3 mil en Niue (2018) y 4,5 mil en Nueva Zelanda (2013)"),
 "lang-fijiano": ("Fijian", "Fear God and honour the sovereign (national motto of Fiji)", "about 340 thousand as a first language (1996 census) and 320 thousand as a second language (1991)",
                  "Fiyiano", "Teme a Dios y honra al soberano (lema nacional de Fiyi)", "unos 340 mil como lengua materna (censo de 1996) y 320 mil como segunda lengua (1991)"),
 "lang-bislama": ("Bislama", "In God we stand (national motto of Vanuatu)", "about 10 thousand native speakers (2011) and 200 thousand as a second language",
                  "Bislama", "Con Dios resistimos (lema nacional de Vanuatu)", "unos 10 mil nativos (2011) y 200 mil como segunda lengua"),
 "lang-tok-pisin": ("Tok Pisin", "One language (“one talk”): whoever speaks the same language is like kin and helps out (the basis of Papua New Guinea's support networks)", "about 126 thousand as a first language and 4 million as a second language",
                    "Tok pisin", "Una sola lengua (“one talk”): quien habla la misma lengua es como un pariente y ayuda (base de las redes de apoyo de Papúa Nueva Guinea)", "unos 126 mil como lengua materna y 4 millones como segunda lengua"),
 "lang-pijin": ("Pijin", "Walking around Chinatown (a 1950s Pijin song the government calls the “national song” of the Solomon Islands and Melanesia)", "about 24 thousand native speakers (1999) and 300 thousand as a second language",
                "Pijin", "Paseando por Chinatown (canción en pijin de los años 1950 que el gobierno llama la “canción nacional” de las Islas Salomón y de Melanesia)", "unos 24 mil nativos (1999) y 300 mil como segunda lengua"),
 "lang-chamorro": ("Chamorro", "Doing good for one another: restoring harmony (a core value of Chamorro culture)", "about 58 thousand (2005–2015)",
                   "Chamorro", "Hacer el bien unos por otros: restaurar la armonía (valor central de la cultura chamorra)", "unos 58 mil (2005-2015)"),
 "lang-marshales": ("Marshallese", "Accomplishment through joint effort (national motto of the Marshall Islands)", "about 55 thousand (1979 figure)",
                    "Marshalés", "Logro mediante el esfuerzo conjunto (lema nacional de las Islas Marshall)", "unos 55 mil (dato de 1979)"),
 "lang-palauano": ("Palauan", "A good leader, like the rain, calms the ocean", "about 16.5 thousand (2008)",
                   "Palauano", "Un buen líder, como la lluvia, calma el océano", "unos 16,5 mil (2008)"),
 "lang-chuukes": ("Chuukese", "In the tongue there is life, in the tongue there is death", "about 51 thousand (2000 census)",
                  "Chuukés", "En la lengua hay vida, en la lengua hay muerte", "unos 51 mil (censo de 2000)"),
 "lang-albanes": ("Albanian", "A mountain never meets another mountain, but people meet (people always cross paths again)", "about 5.4 million (native speakers, Europe)",
                  "Albanés", "Una montaña nunca se encuentra con otra montaña, pero las personas sí (la gente siempre vuelve a cruzarse)", "unos 5,4 millones (nativos, Europa)"),
 "lang-catalao": ("Catalan", "Patience is the mother of science", "about 10 million (native speakers, Europe)",
                  "Catalán", "La paciencia es la madre de la ciencia", "unos 10 millones (nativos, Europa)"),
 "lang-holandes": ("Dutch", "Whoever says A must also say B (whoever starts must see it through)", "about 22 million native speakers and 24 million in total (Europe)",
                   "Neerlandés", "Quien dice A también tiene que decir B (quien empieza debe llegar hasta el final)", "unos 22 millones nativos y 24 millones en total (Europa)"),
 "lang-bulgaro": ("Bulgarian", "A lie has short legs (it's soon caught)", "about 7.8 million (native speakers, Europe)",
                  "Búlgaro", "La mentira tiene patas cortas (pronto la alcanzan)", "unos 7,8 millones (nativos, Europa)"),
 "lang-croata": ("Croatian", "Without effort there is no knowledge (no pain, no learning)", "about 5.6 million (native speakers, Europe)",
                 "Croata", "Sin esfuerzo no hay ciencia (sin sufrir no se aprende)", "unos 5,6 millones (nativos, Europa)"),
 "lang-servio": ("Serbian", "Measure three times, cut once", "about 9 million (native speakers, Europe)",
                 "Serbio", "Mide tres veces, corta una", "unos 9 millones (nativos, Europa)"),
 "lang-tcheco": ("Czech", "No work, no kolaches (no effort, no reward)", "about 10.6 million (native speakers, Europe)",
                 "Checo", "Sin trabajo no hay kolaches (sin esfuerzo no hay recompensa)", "unos 10,6 millones (nativos, Europa)"),
 "lang-eslovaco": ("Slovak", "Still water washes the banks (still waters run deep)", "about 5.2 million (native speakers, Europe)",
                   "Eslovaco", "El agua quieta lava las orillas (del agua mansa líbrete Dios)", "unos 5,2 millones (nativos, Europa)"),
 "lang-esloveno": ("Slovene", "Whoever doesn't work goes without food", "about 2.1 million (native speakers, Europe)",
                   "Esloveno", "Quien no trabaja se queda sin comida", "unos 2,1 millones (nativos, Europa)"),
 "lang-dinamarques": ("Danish", "Better late than never", "about 5.5 million (native speakers, Europe)",
                      "Danés", "Más vale tarde que nunca", "unos 5,5 millones (nativos, Europa)"),
 "lang-sueco": ("Swedish", "First to the mill grinds first (first come, first served)", "about 10 million native speakers and 11 million in total (Europe)",
                "Sueco", "Quien llega primero al molino muele primero (el que llega antes es atendido antes)", "unos 10 millones nativos y 11 millones en total (Europa)"),
 "lang-noruegues": ("Norwegian", "Better one bird in the hand than ten on the roof", "about 5.2 million (native speakers, Europe)",
                    "Noruego", "Más vale un pájaro en la mano que diez en el tejado", "unos 5,2 millones (nativos, Europa)"),
 "lang-finlandes": ("Finnish", "Diligence beats bad luck", "about 5.4 million (native speakers, Europe)",
                    "Finés", "La diligencia vence a la mala suerte", "unos 5,4 millones (nativos, Europa)"),
 "lang-islandes": ("Icelandic", "The bad rower blames the oar", "about 330 thousand (native speakers)",
                   "Islandés", "El mal remero le echa la culpa al remo", "unos 330 mil (nativos)"),
 "lang-estoniano": ("Estonian", "Whoever doesn't work doesn't eat", "about 1.17 million (native speakers, Europe)",
                    "Estonio", "Quien no trabaja no come", "unos 1,17 millones (nativos, Europa)"),
 "lang-letao": ("Latvian", "Protect yourself, and then God will protect you", "about 1.75 million (native speakers, Europe)",
                "Letón", "Protégete a ti mismo, y entonces Dios te protegerá", "unos 1,75 millones (nativos, Europa)"),
 "lang-lituano": ("Lithuanian", "Drop after drop, even the stone is pierced", "about 3 million (native speakers, Europe)",
                  "Lituano", "Gota a gota, hasta la piedra se perfora", "unos 3 millones (nativos, Europa)"),
 "lang-hungaro": ("Hungarian", "Patience brings roses", "about 11 million (native speakers, Europe)",
                  "Húngaro", "La paciencia da rosas", "unos 11 millones (nativos, Europa)"),
 "lang-polones": ("Polish", "From the rain under the gutter (out of the frying pan, into the fire)", "about 38 million (native speakers, Europe)",
                  "Polaco", "De la lluvia bajo el canalón (salir de Guatemala para entrar en Guatepeor)", "unos 38 millones (nativos, Europa)"),
 "lang-romeno": ("Romanian", "As you make your bed, so you sleep (you reap what you sow)", "about 24 million native speakers and 28 million in total (Europe)",
                 "Rumano", "Como haces la cama, así duermes (cada uno cosecha lo que siembra)", "unos 24 millones nativos y 28 millones en total (Europa)"),
 "lang-ucraniano": ("Ukrainian", "It's easy to fish in muddy water", "about 32.6 million (native speakers, Europe)",
                    "Ucraniano", "En agua turbia es fácil pescar", "unos 32,6 millones (nativos, Europa)"),
 "lang-macedonio": ("Macedonian", "Where there is force, there is no justice", "about 1.6 million (native speakers, Europe)",
                    "Macedonio", "Donde hay fuerza no hay justicia", "unos 1,6 millones (nativos, Europa)"),
 "lang-italiano": ("Italian", "Whoever acts for themselves acts for three", "about 66 million in total (Ethnologue 2026, via Wikipedia)",
                   "Italiano", "Quien hace por sí mismo hace por tres", "unos 66 millones en total (Ethnologue 2026, vía Wikipedia)"),
 "lang-irlandes": ("Irish", "Wisdom doesn't come before age", "about 1.87 million say they can speak Irish (2022 census)",
                   "Irlandés", "El juicio no llega antes que la edad", "unos 1,87 millones dicen saber hablar irlandés (censo de 2022)"),
 "lang-maltes": ("Maltese", "A good start is half the work", "about 520 thousand (native speakers)",
                 "Maltés", "Buen comienzo, mitad del trabajo", "unos 520 mil (nativos)"),
 "lang-luxemburgues": ("Luxembourgish", "We want to remain what we are (Luxembourg's unofficial national motto)", "about 336 thousand native speakers and 386 thousand in total",
                       "Luxemburgués", "Queremos seguir siendo lo que somos (lema nacional de Luxemburgo, no oficial)", "unos 336 mil nativos y 386 mil en total"),
 "lang-azerbaijano": ("Azerbaijani", "Whoever hurries falls into the clay oven (haste makes waste)", "",
                      "Azerí", "Quien se apresura cae en el horno de barro (vísteme despacio, que tengo prisa)", ""),
 "lang-malaio": ("Malay", "In life we are ruled by custom, in death by the earth", "",
                 "Malayo", "En vida nos rige la costumbre, en la muerte la tierra", ""),
 "lang-filipino": ("Filipino (Tagalog)", "While there's life, there's hope", "about 87 million in total (Ethnologue 2026, via Wikipedia)",
                   "Filipino (tagalo)", "Mientras hay vida, hay esperanza", "unos 87 millones en total (Ethnologue 2026, vía Wikipedia)"),
 "lang-zulu": ("Zulu", "A person is a person through other people (the basis of the ubuntu philosophy)", "",
               "Zulú", "Una persona es persona a través de las demás (base de la filosofía ubuntu)", ""),
 "lang-xona": ("Shona", "One finger alone can't crush a louse (you can't do everything alone)", "",
               "Shona", "Un dedo solo no aplasta el piojo (solo no se resuelve todo)", ""),
 "lang-wolof": ("Wolof", "A person is the remedy of a person (humanity is fulfilled through helping others)", "",
                "Wólof", "La persona es el remedio de la persona (la humanidad se realiza con la ayuda del otro)", ""),
 "lang-twi": ("Twi (Akan)", "It's not wrong to go back for what you forgot (the concept of sankofa)", "",
              "Twi (akan)", "No está mal volver a buscar lo que se olvidó (el concepto de sankofa)", ""),
 "lang-bambara": ("Bambara", "The distance between people makes the relationship pleasant", "",
                  "Bambara", "La distancia entre las personas hace agradable la relación", ""),
 "lang-malgaxe": ("Malagasy", "The egg doesn't fight the stone", "", "Malgache", "El huevo no pelea con la piedra", ""),
 "lang-quiniaruanda": ("Kinyarwanda", "Unity, work, love of country (national motto of Rwanda)", "",
                       "Kinyarwanda", "Unidad, trabajo, amor a la patria (lema nacional de Ruanda)", ""),
 "lang-sesoto": ("Sesotho", "Peace, rain, prosperity (national motto of Lesotho)", "",
                 "Sesoto", "Paz, lluvia, prosperidad (lema nacional de Lesoto)", ""),
 "lang-tswana": ("Tswana", "Rain (national motto of Botswana; “pula” is also the name of the currency)", "",
                 "Tswana", "Lluvia (lema nacional de Botsuana; “pula” es también el nombre de la moneda)", ""),
 "lang-suazi": ("Swazi", "We are the fortress (national motto of Eswatini)", "",
                "Suazi", "Somos la fortaleza (lema nacional de Esuatini)", ""),
 "lang-urdu": ("Urdu", "Faith, unity, discipline (national motto of Pakistan)", "about 246 million in total (Ethnologue 2026, via Wikipedia)",
               "Urdu", "Fe, unidad, disciplina (lema nacional de Pakistán)", "unos 246 millones en total (Ethnologue 2026, vía Wikipedia)"),
 "lang-tuvaluano": ("Tuvaluan", "Tuvalu for the Almighty (national motto of Tuvalu)", "",
                    "Tuvaluano", "Tuvalu para el Todopoderoso (lema nacional de Tuvalu)", ""),
 "lang-gilbertes": ("Gilbertese", "Health, peace and prosperity (national motto of Kiribati)", "",
                    "Gilbertés", "Salud, paz y prosperidad (lema nacional de Kiribati)", ""),
 "lang-uzbeque": ("Uzbek", "Forty trades are too few for a young man (you never know enough)", "",
                  "Uzbeko", "Cuarenta oficios son pocos para un joven (nunca se sabe lo suficiente)", ""),
 "lang-quirguiz": ("Kyrgyz", "Measure seven times, cut once", "", "Kirguís", "Mide siete veces, corta una", ""),
 "lang-turcomeno": ("Turkmen", "Measure seven times, cut once", "", "Turcomano", "Mide siete veces, corta una", ""),
 "lang-divehi": ("Dhivehi (Maldivian)", "Don't bite the hand that feeds you", "", "Divehi (maldivo)", "No muerdas la mano que te da de comer", ""),
}


def ranking(text: str, locale: str) -> str:
    if not text:
        return ""
    m = re.fullmatch(r"(\d+)º mais falado do mundo(?: \((.*)\))?", text)
    if m:
        n, note = int(m.group(1)), m.group(2)
        if locale == "en":
            suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
            out = f"{n}{suffix} most spoken in the world"
            notes = {"guarani paraguaio": "Paraguayan Guarani"}
        else:
            out = f"{n}.º más hablado del mundo"
            notes = {"guarani paraguaio": "guaraní paraguayo"}
        return f"{out} ({notes[note]})" if note else out
    base = "fora do top 200 mundial (confirmado direto na base da Ethnologue)"
    if text.startswith(base):
        rest = text[len(base):]
        if locale == "en":
            out = "outside the world top 200 (checked directly in the Ethnologue database)"
            extra = {" — não é falado nativamente hoje": " — not spoken natively today"}
        else:
            out = "fuera del top 200 mundial (confirmado directamente en la base de Ethnologue)"
            extra = {" — não é falado nativamente hoje": " — hoy no se habla como lengua materna"}
        return out + (extra[rest] if rest else "")
    raise SystemExit(f"ranking sem regra: {text}")


missing = [key for key in entries if key not in T]
if missing:
    raise SystemExit(f"sem tradução: {missing}")
for index, locale in enumerate(["en", "es"]):
    out = {}
    for key, entry in entries.items():
        name, meaning, speakers = T[key][index * 3: index * 3 + 3]
        item = {"idioma": name, "significado": meaning}
        if entry.get("falantes"):
            if not speakers:
                raise SystemExit(f"{key}: falta falantes em {locale}")
            item["falantes"] = speakers
        if entry.get("ranking"):
            item["ranking"] = ranking(entry["ranking"], locale)
        out[key] = item
    path = ROOT / f"scripts/i18n/{locale}/languages.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(f"{locale}: {len(out)} idiomas")
