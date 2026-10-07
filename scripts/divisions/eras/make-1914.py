"""Gera scripts/divisions/countries/1914.json, a lista curada do mundo em 1º de julho de 1914 (véspera da Primeira Guerra) para "Mapas históricos".

Uso: python scripts/divisions/eras/make-1914.py
Fronteiras: as relações de país do OpenHistoricalMap (CC0) válidas na data (fetch-ohm.py), pelo id da relação (`ohm`); onde o OHM falha, a terra de
hoje do mapa HD pelo carta_id: `override` (o país de hoje inteiro vai para a unidade, por cima do que o OHM diz: o Egito, ausente no OHM e invadido
pela Cirenaica dele), `carve` (só a parte que cai dentro da unidade-mãe: a Argélia dentro da República Francesa, a Islândia e a Groenlândia
dentro da Dinamarca, o Suriname dentro dos Países Baixos) e `fill` (a terra do país de hoje que nenhuma relação cobre vai para a unidade mais perto
da lista: a Argentina e o Chile, quebrados no OHM, o sul do Marrocos, o interior de Omã, da Somália e da Líbia). Nomes e capitais de 1914:
Wikidata (rótulos e P36 com datas) e Wikipédia pt/en/es, com a capital da época (Buea no Kamerun, Punakha no Butão, Suva em Fiji, Banaba nas
Gilbert e Ellice, Livingstone na Rodésia do Norte, Kristiania na Noruega…) e o nome de hoje aceito na escrita.
"""
import json
import os
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "countries", "1914.json")


def cap(pt, en=None, es=None):
    return {"pt": pt, "en": en or pt, "es": es or pt}


# (código, região, [relações do OHM], nome {pt, en, es}, capital {pt,en,es} | None, grafias aceitas da capital, extras)
# A ordem importa: quem vem antes fica com a terra que duas relações disputam (as colônias antes das metrópoles que as englobam no OHM).
E, A, F, M, O = "europe", "asia", "africa", "americas", "oceania"
UNITS = [
    # ---- recortes e prioridades (colônias e protetorados antes dos "pais")
    ("EGY", F, [], ("Egito", "Egypt", "Egipto"), cap("Cairo", "Cairo", "El Cairo"), [], {"override": ["818"], "alias": ["Quedivato do Egito"]}),
    ("ALG", F, [], ("Argélia", "Algeria", "Argelia"), cap("Argel", "Algiers", "Argel"), [], {"carve": [{"carta": "12", "from": "FRA"}]}),
    ("ISL", E, [], ("Islândia", "Iceland", "Islandia"), cap("Reykjavík"), ["Reykjavik"], {"carve": [{"carta": "352", "from": "DNK"}]}),
    ("GRL", M, [], ("Groenlândia", "Greenland", "Groenlandia"), None, [], {"carve": [{"carta": "304", "from": "DNK"}]}),
    ("SUR", M, [], ("Guiana Holandesa", "Dutch Guiana", "Guayana Neerlandesa"), cap("Paramaribo"), [], {"carve": [{"carta": "740", "from": "NLD"}], "alias": ["Suriname", "Surinam"]}),
    ("ADN", A, [2921507, 2921515], ("Protetorado de Áden", "Aden Protectorate", "Protectorado de Adén"), cap("Áden", "Aden", "Adén"), ["Aden"], {}),
    ("PHL", A, [2889835, 2860768], ("Filipinas", "Philippines", "Filipinas"), cap("Manila"), [], {"alias": ["Ilhas Filipinas", "Philippine Islands", "Islas Filipinas"]}),
    ("KWT", A, [2848364], ("Kuwait", "Kuwait", "Kuwait"), cap("Kuwait", "Kuwait City", "Kuwait"), ["Cidade do Kuwait", "Ciudad de Kuwait"], {"alias": ["Kuweit"]}),
    ("CYP", E, [2848135], ("Chipre", "Cyprus", "Chipre"), cap("Nicósia", "Nicosia", "Nicosia"), [], {}),
    ("TRU", A, [2848320], ("Estados da Trégua", "Trucial States", "Estados de la Tregua"), None, [], {}),
    ("RDO", F, [2860429], ("Rio do Ouro", "Río de Oro", "Río de Oro"), cap("Villa Cisneros"), ["Dakhla"], {"alias": ["Rio de Oro"]}),
    ("SGH", F, [2860428], ("Saguia el-Hamra", "Saguia el-Hamra", "Saguía el Hamra"), None, [], {"alias": ["Saguia el Hamra"]}),
    ("SMO", F, [2860424], ("Marrocos Espanhol", "Spanish Morocco", "Marruecos Español"), cap("Tetuão", "Tétouan", "Tetuán"), ["Tetouan", "Tetuan"],
     {"carveBox": [{"box": [-6.2, 34.8, -1.8, 36.0], "from": "ESP"}], "alias": ["Protetorado Espanhol de Marrocos"]}),
    ("SPG", F, [2860389], ("Guiné Espanhola", "Spanish Guinea", "Guinea Española"), cap("Santa Isabel"), ["Malabo"], {}),
    # ---- Europa
    ("RUS", E, [2851294], ("Império Russo", "Russian Empire", "Imperio ruso"), cap("São Petersburgo", "Saint Petersburg", "San Petersburgo"), ["Petrogrado", "Petrograd", "Sankt-Peterburg", "St. Petersburg"],
     {"alias": ["Rússia", "Russia", "Rusia"], "fill": [{"carta": "643", "box": [50, 69, 70, 77.5]}, {"carta": "643", "box": [130, 72.5, 160, 77.5]}]}),
    ("GER", E, [2692425], ("Império Alemão", "German Empire", "Imperio alemán"), cap("Berlim", "Berlin", "Berlín"), [], {"alias": ["Alemanha", "Germany", "Alemania"]}),
    ("AUH", E, [2692361], ("Áustria-Hungria", "Austria-Hungary", "Austria-Hungría"), cap("Viena", "Vienna", "Viena"), ["Wien"], {"alias": ["Império Austro-Húngaro", "Austro-Hungarian Empire", "Imperio austrohúngaro"]}),
    ("GBR", E, [2828388], ("Reino Unido", "United Kingdom", "Reino Unido"), cap("Londres", "London", "Londres"), [], {"alias": ["Reino Unido da Grã-Bretanha e Irlanda", "Grã-Bretanha", "Great Britain", "Gran Bretaña"]}),
    ("FRA", E, [2866012], ("França", "France", "Francia"), cap("Paris", "Paris", "París"), [], {"alias": ["República Francesa", "French Republic", "República Francesa"]}),
    ("ITA", E, [2696424], ("Itália", "Italy", "Italia"), cap("Roma", "Rome", "Roma"), [], {"alias": ["Reino da Itália", "Kingdom of Italy", "Reino de Italia"]}),
    ("ESP", E, [2860486], ("Espanha", "Spain", "España"), cap("Madri", "Madrid", "Madrid"), ["Madrid"], {}),
    ("POR", E, [2807009], ("Portugal", "Portugal", "Portugal"), cap("Lisboa", "Lisbon", "Lisboa"), [], {}),
    ("NLD", E, [2883430], ("Países Baixos", "Netherlands", "Países Bajos"), cap("Amsterdã", "Amsterdam", "Ámsterdam"), ["Amsterdam", "Amesterdão"], {"alias": ["Holanda", "Holland", "Holanda"]}),
    ("BEL", E, [2797729], ("Bélgica", "Belgium", "Bélgica"), cap("Bruxelas", "Brussels", "Bruselas"), [], {}),
    ("LUX", E, [2748545], ("Luxemburgo", "Luxembourg", "Luxemburgo"), cap("Luxemburgo", "Luxembourg", "Luxemburgo"), [], {}),
    ("CHE", E, [2798802], ("Suíça", "Switzerland", "Suiza"), cap("Berna", "Bern", "Berna"), [], {}),
    ("DNK", E, [2869935], ("Dinamarca", "Denmark", "Dinamarca"), cap("Copenhague", "Copenhagen", "Copenhague"), ["Copenhaga"], {}),
    ("NOR", E, [2692537], ("Noruega", "Norway", "Noruega"), cap("Kristiania", "Kristiania", "Cristianía"), ["Christiania", "Oslo"], {}),
    ("SWE", E, [2692524], ("Suécia", "Sweden", "Suecia"), cap("Estocolmo", "Stockholm", "Estocolmo"), [], {}),
    ("ROU", E, [2693260], ("Romênia", "Romania", "Rumania"), cap("Bucareste", "Bucharest", "Bucarest"), [], {"alias": ["Roménia", "Reino da Romênia"]}),
    ("BGR", E, [2746680], ("Bulgária", "Bulgaria", "Bulgaria"), cap("Sófia", "Sofia", "Sofía"), [], {"alias": ["Reino da Bulgária", "Czarado da Bulgária"]}),
    ("SRB", E, [2746681], ("Sérvia", "Serbia", "Serbia"), cap("Belgrado", "Belgrade", "Belgrado"), [], {"alias": ["Reino da Sérvia"]}),
    ("MNE", E, [2739656], ("Montenegro", "Montenegro", "Montenegro"), cap("Cetinje", "Cetinje", "Cetiña"), [], {"alias": ["Reino de Montenegro"]}),
    ("ALB", E, [2855613], ("Albânia", "Albania", "Albania"), cap("Durrës", "Durrës", "Durrës"), ["Durazzo", "Durres"], {"alias": ["Principado da Albânia"]}),
    ("GRC", E, [2692585], ("Grécia", "Greece", "Grecia"), cap("Atenas", "Athens", "Atenas"), [], {"alias": ["Reino da Grécia"]}),
    ("MLT", E, [2801185], ("Malta", "Malta", "Malta"), cap("Valeta", "Valletta", "La Valeta"), ["Valletta"], {}),
    ("DOD", E, [2830316], ("Ilhas Italianas do Egeu", "Italian Aegean Islands", "Islas italianas del Egeo"), cap("Rodes", "Rhodes", "Rodas"), ["Rodos"], {"alias": ["Dodecaneso", "Dodecanese", "Dodecaneso"]}),
    # ---- Ásia
    ("OTT", A, [2849728], ("Império Otomano", "Ottoman Empire", "Imperio otomano"), cap("Constantinopla", "Constantinople", "Constantinopla"), ["Istambul", "Istanbul", "Estambul"], {"alias": ["Turquia", "Turkey", "Turquía"]}),
    ("PER", A, [2694889], ("Pérsia", "Persia", "Persia"), cap("Teerã", "Tehran", "Teherán"), ["Teerão", "Teheran"], {"alias": ["Irã", "Iran", "Irán", "Pérsia Qajar"]}),
    ("AFG", A, [2961096], ("Afeganistão", "Afghanistan", "Afganistán"), cap("Cabul", "Kabul", "Kabul"), [], {"alias": ["Emirado do Afeganistão"]}),
    ("IND", A, [2961101], ("Índia Britânica", "British India", "India británica"), cap("Délhi", "Delhi", "Delhi"), ["Deli", "Nova Délhi", "New Delhi"], {"alias": ["Raj Britânico", "British Raj", "Raj británico", "Índia", "India"]}),
    ("CEY", A, [2848313], ("Ceilão", "Ceylon", "Ceilán"), cap("Colombo"), [], {"alias": ["Sri Lanka"]}),
    ("NPL", A, [2893390], ("Nepal", "Nepal", "Nepal"), cap("Catmandu", "Kathmandu", "Katmandú"), [], {}),
    ("BTN", A, [2906073], ("Butão", "Bhutan", "Bután"), cap("Punakha"), [], {}),
    ("TIB", A, [2828810], ("Tibete", "Tibet", "Tíbet"), cap("Lhasa"), ["Lassa"], {}),
    ("CHN", A, [2694664], ("China", "China", "China"), cap("Pequim", "Peking", "Pekín"), ["Beijing", "Peking", "Pekim"], {"alias": ["República da China", "Republic of China", "República de China"]}),
    ("JPN", A, [2694484], ("Império do Japão", "Empire of Japan", "Imperio del Japón"), cap("Tóquio", "Tokyo", "Tokio"), [], {"alias": ["Japão", "Japan", "Japón"]}),
    ("SIA", A, [2874871], ("Sião", "Siam", "Siam"), cap("Bangcoc", "Bangkok", "Bangkok"), ["Banguecoque"], {"alias": ["Tailândia", "Thailand", "Tailandia"]}),
    ("IDC", A, [2745674], ("Indochina Francesa", "French Indochina", "Indochina francesa"), cap("Hanói", "Hanoi", "Hanói"), [], {"alias": ["União Indochinesa"]}),
    ("FMS", A, [2848459], ("Estados Malaios Federados", "Federated Malay States", "Estados Malayos Federados"), cap("Kuala Lumpur"), [], {"alias": ["Estados Federados Malaios"]}),
    ("UMS", A, [2848476, 2848479, 2848477, 2848480, 2848478], ("Estados Malaios Não Federados", "Unfederated Malay States", "Estados Malayos No Federados"), None, [], {}),
    ("STS", A, [2848278], ("Estabelecimentos dos Estreitos", "Straits Settlements", "Establecimientos de los Estrechos"), cap("Singapura", "Singapore", "Singapur"), [], {}),
    ("SAR", A, [2961074], ("Sarawak", "Sarawak", "Sarawak"), cap("Kuching"), [], {}),
    ("NBO", A, [2848286], ("Bornéu do Norte", "North Borneo", "Borneo del Norte"), cap("Sandakan"), [], {}),
    ("BRN", A, [2961066], ("Brunei", "Brunei", "Brunéi"), cap("Cidade de Brunei", "Brunei Town", "Ciudad de Brunéi"), ["Bandar Seri Begawan", "Brunei"], {}),
    ("DEI", A, [2864434], ("Índias Orientais Holandesas", "Dutch East Indies", "Indias Orientales Neerlandesas"), cap("Batávia", "Batavia", "Batavia"), ["Jacarta", "Jakarta", "Yakarta"], {"alias": ["Índias Orientais Neerlandesas"]}),
    ("TLS", A, [2864414], ("Timor Português", "Portuguese Timor", "Timor Portugués"), cap("Díli", "Dili", "Dili"), [], {}),
    ("HKG", A, [2694575], ("Hong Kong", "Hong Kong", "Hong Kong"), cap("Victoria"), ["Cidade de Victoria"], {}),
    ("GOA", A, [2922053, 2922074], ("Índia Portuguesa", "Portuguese India", "India portuguesa"), cap("Nova Goa", "Nova Goa", "Nova Goa"), ["Pangim", "Panaji", "Goa"], {"alias": ["Goa"]}),
    ("MSC", A, [2905974], ("Mascate e Omã", "Muscat and Oman", "Mascate y Omán"), cap("Mascate", "Muscat", "Mascate"), [], {"fill": ["512"], "alias": ["Omã", "Oman", "Omán"]}),
    ("BHR", A, [2848318], ("Bahrein", "Bahrain", "Baréin"), cap("Manama"), [], {"override": ["48"], "alias": ["Barein", "Bahrain"]}),
    ("MDV", A, [2848182], ("Maldivas", "Maldives", "Maldivas"), cap("Malé"), [], {}),
    # ---- África
    ("SDN", F, [2961762], ("Sudão Anglo-Egípcio", "Anglo-Egyptian Sudan", "Sudán anglo-egipcio"), cap("Cartum", "Khartoum", "Jartum"), [], {"alias": ["Sudão", "Sudan", "Sudán"]}),
    ("ETH", F, [2690843], ("Etiópia", "Ethiopia", "Etiopía"), cap("Adis Abeba", "Addis Ababa", "Adís Abeba"), [], {"alias": ["Abissínia", "Abyssinia", "Abisinia", "Império Etíope"]}),
    ("ERI", F, [2690839], ("Eritreia Italiana", "Italian Eritrea", "Eritrea italiana"), cap("Asmara"), [], {"alias": ["Eritreia", "Eritrea"]}),
    ("FSO", F, [2803437], ("Somalilândia Francesa", "French Somaliland", "Somalilandia francesa"), cap("Djibuti", "Djibouti", "Yibuti"), [], {}),
    ("BSO", F, [2926848], ("Somalilândia Britânica", "British Somaliland", "Somalilandia británica"), cap("Berbera"), [], {}),
    ("ISO", F, [2923095, 2923111, 2923109], ("Somália Italiana", "Italian Somaliland", "Somalia italiana"), cap("Mogadíscio", "Mogadishu", "Mogadiscio"), ["Mogadixo"], {"fill": ["706"]}),
    ("BEA", F, [2831417, 2831408], ("África Oriental Britânica", "British East Africa", "África Oriental británica"), cap("Nairóbi", "Nairobi", "Nairobi"), [], {"alias": ["Quênia", "Kenya", "Kenia"]}),
    ("UGA", F, [2961761], ("Protetorado de Uganda", "Uganda Protectorate", "Protectorado de Uganda"), cap("Entebbe"), [], {"alias": ["Uganda"]}),
    ("GEA", F, [2863617], ("África Oriental Alemã", "German East Africa", "África Oriental Alemana"), cap("Dar es Salaam"), ["Dar-es-Salaam"], {"alias": ["Tanganica", "Tanganyika"]}),
    ("ZAN", F, [2690950], ("Zanzibar", "Zanzibar", "Zanzíbar"), cap("Zanzibar", "Zanzibar Town", "Zanzíbar"), [], {}),
    ("MOZ", F, [2690864], ("Moçambique", "Mozambique", "Mozambique"), cap("Lourenço Marques"), ["Maputo"], {"alias": ["África Oriental Portuguesa", "Portuguese East Africa", "África Oriental Portuguesa"]}),
    ("NYA", F, [2803134], ("Niassalândia", "Nyasaland", "Nyasalandia"), cap("Zomba"), [], {"alias": ["Malawi", "Malaui"]}),
    ("NRH", F, [2691743], ("Rodésia do Norte", "Northern Rhodesia", "Rodesia del Norte"), cap("Livingstone"), [], {"alias": ["Zâmbia", "Zambia"]}),
    ("SRH", F, [2831468], ("Rodésia do Sul", "Southern Rhodesia", "Rodesia del Sur"), cap("Salisbury"), ["Harare"], {"alias": ["Rodésia", "Rhodesia", "Rodesia"]}),
    ("BEC", F, [2691745], ("Bechuanalândia", "Bechuanaland", "Bechuanalandia"), cap("Mafeking"), ["Mafikeng", "Mahikeng"], {"alias": ["Botsuana", "Botswana"]}),
    ("ZAF", F, [2691747], ("União Sul-Africana", "Union of South Africa", "Unión Sudafricana"), cap("Pretória", "Pretoria", "Pretoria"), ["Cidade do Cabo", "Cape Town", "Ciudad del Cabo"], {"alias": ["África do Sul", "South Africa", "Sudáfrica"]}),
    ("BAS", F, [2691741], ("Basutolândia", "Basutoland", "Basutolandia"), cap("Maseru"), [], {"alias": ["Lesoto", "Lesotho"]}),
    ("SWZ", F, [2691746], ("Suazilândia", "Swaziland", "Suazilandia"), cap("Mbabane"), [], {"alias": ["Essuatíni", "Eswatini"]}),
    ("GSW", F, [2840010], ("Sudoeste Africano Alemão", "German South West Africa", "África del Sudoeste Alemana"), cap("Windhoek"), ["Windhuk"], {"alias": ["Namíbia", "Namibia"]}),
    ("ANG", F, [2962064, 2839750], ("Angola", "Angola", "Angola"), cap("Luanda"), ["Loanda"], {"alias": ["África Ocidental Portuguesa", "Portuguese West Africa", "África Occidental Portuguesa"]}),
    ("BCG", F, [2961758], ("Congo Belga", "Belgian Congo", "Congo Belga"), cap("Boma"), [], {}),
    ("AEF", F, [2840000, 2839974, 2840002, 2918030], ("África Equatorial Francesa", "French Equatorial Africa", "África Ecuatorial Francesa"), cap("Brazzaville"), ["Brazavile"], {}),
    ("KAM", F, [2828752], ("Kamerun", "Kamerun", "Kamerun"), cap("Buea"), [], {"alias": ["Camarões Alemães", "German Cameroon", "Camerún alemán"]}),
    ("NIG", F, [2690856], ("Nigéria", "Nigeria", "Nigeria"), cap("Lagos"), [], {}),
    ("GLD", F, [2828425, 2923088, 2828423], ("Costa do Ouro", "Gold Coast", "Costa de Oro"), cap("Acra", "Accra", "Acra"), ["Accra"], {}),
    ("TOG", F, [2691472], ("Togolândia", "Togoland", "Togolandia"), cap("Lomé"), [], {"alias": ["Togo"]}),
    ("AOF", F, [2917206, 2917202, 2917211, 2879275], ("África Ocidental Francesa", "French West Africa", "África Occidental Francesa"), cap("Dacar", "Dakar", "Dakar"), ["Dakar"], {}),
    ("LBR", F, [2828769], ("Libéria", "Liberia", "Liberia"), cap("Monróvia", "Monrovia", "Monrovia"), [], {}),
    ("SLE", F, [2828774], ("Serra Leoa", "Sierra Leone", "Sierra Leona"), cap("Freetown"), [], {}),
    ("GMB", F, [2803502], ("Gâmbia", "Gambia", "Gambia"), cap("Bathurst"), ["Banjul"], {}),
    ("PGU", F, [2803504], ("Guiné Portuguesa", "Portuguese Guinea", "Guinea Portuguesa"), cap("Bolama"), [], {}),
    ("CPV", F, [2962009], ("Cabo Verde", "Cape Verde", "Cabo Verde"), cap("Praia"), [], {}),
    ("MAR", F, [2866016], ("Marrocos", "Morocco", "Marruecos"), cap("Rabat"), [], {"fill": ["504"], "alias": ["Protetorado Francês de Marrocos", "French Morocco", "Marruecos francés"]}),
    ("TUN", F, [2690947], ("Tunísia", "Tunisia", "Túnez"), cap("Túnis", "Tunis", "Túnez"), [], {}),
    ("TRP", F, [2690837], ("Tripolitânia Italiana", "Italian Tripolitania", "Tripolitania italiana"), cap("Trípoli", "Tripoli", "Trípoli"), [], {"fill": ["434"], "alias": ["Tripolitânia", "Tripolitania"]}),
    ("CYR", F, [2803190], ("Cirenaica Italiana", "Italian Cyrenaica", "Cirenaica italiana"), cap("Bengasi", "Benghazi", "Bengasi"), [], {"fill": ["434"], "alias": ["Cirenaica", "Cyrenaica"]}),
    ("MDG", F, [2865795], ("Madagascar", "Madagascar", "Madagascar"), cap("Tananarive"), ["Antananarivo"], {}),
    ("MUS", F, [2831873], ("Maurício", "Mauritius", "Mauricio"), cap("Port Louis"), [], {"alias": ["Ilha Maurício", "Maurícia"]}),
    ("REU", F, [2865901], ("Reunião", "Réunion", "Reunión"), cap("Saint-Denis"), [], {}),
    ("SYC", F, [2831866], ("Seicheles", "Seychelles", "Seychelles"), cap("Victoria"), [], {}),
    ("STP", F, [2962074], ("São Tomé e Príncipe", "São Tomé and Príncipe", "Santo Tomé y Príncipe"), cap("São Tomé", "São Tomé", "Santo Tomé"), [], {}),
    # ---- Américas
    ("USA", M, [2873299], ("Estados Unidos", "United States", "Estados Unidos"), cap("Washington"), ["Washington DC", "Washington D.C."], {"alias": ["EUA", "USA"]}),
    ("NFL", M, [2828507], ("Terra Nova", "Newfoundland", "Terranova"), cap("St. John's"), ["Saint John's", "São João da Terra Nova"], {"alias": ["Domínio de Terra Nova"]}),
    ("CAN", M, [2831069], ("Canadá", "Canada", "Canadá"), cap("Ottawa"), [], {"alias": ["Domínio do Canadá"]}),
    ("MEX", M, [2841937], ("México", "Mexico", "México"), cap("Cidade do México", "Mexico City", "Ciudad de México"), ["México"], {}),
    ("GTM", M, [2859573], ("Guatemala", "Guatemala", "Guatemala"), cap("Cidade da Guatemala", "Guatemala City", "Ciudad de Guatemala"), ["Guatemala"], {}),
    ("BHO", M, [2807603], ("Honduras Britânicas", "British Honduras", "Honduras Británica"), cap("Belize"), ["Belize City", "Cidade de Belize"], {"alias": ["Belize", "Belice"]}),
    ("HND", M, [2808172], ("Honduras", "Honduras", "Honduras"), cap("Tegucigalpa"), [], {}),
    ("SLV", M, [2808164], ("El Salvador", "El Salvador", "El Salvador"), cap("San Salvador"), [], {}),
    ("NIC", M, [2871201], ("Nicarágua", "Nicaragua", "Nicaragua"), cap("Manágua", "Managua", "Managua"), [], {}),
    ("CRI", M, [2808163], ("Costa Rica", "Costa Rica", "Costa Rica"), cap("San José"), [], {}),
    ("PAN", M, [2873307], ("Panamá", "Panama", "Panamá"), cap("Cidade do Panamá", "Panama City", "Ciudad de Panamá"), ["Panamá"], {}),
    ("CUB", M, [2861550], ("Cuba", "Cuba", "Cuba"), cap("Havana", "Havana", "La Habana"), [], {}),
    ("HTI", M, [2841719], ("Haiti", "Haiti", "Haití"), cap("Porto Príncipe", "Port-au-Prince", "Puerto Príncipe"), [], {}),
    ("DOM", M, [2841713], ("República Dominicana", "Dominican Republic", "República Dominicana"), cap("Santo Domingo"), ["São Domingos"], {}),
    ("JAM", M, [2834850], ("Jamaica", "Jamaica", "Jamaica"), cap("Kingston"), [], {}),
    ("BHS", M, [2834851], ("Bahamas", "Bahamas", "Bahamas"), cap("Nassau"), [], {}),
    ("TTO", M, [2834829], ("Trinidad e Tobago", "Trinidad and Tobago", "Trinidad y Tobago"), cap("Port of Spain"), [], {}),
    ("BRB", M, [2832944], ("Barbados", "Barbados", "Barbados"), cap("Bridgetown"), [], {}),
    ("WIN", M, [2834750], ("Ilhas de Barlavento Britânicas", "British Windward Islands", "Islas de Barlovento Británicas"), cap("St. George's"), ["Saint George's"], {}),
    ("GLP", M, [2861172], ("Guadalupe", "Guadeloupe", "Guadalupe"), cap("Basse-Terre"), [], {}),
    ("GUY", M, [2806844], ("Guiana Britânica", "British Guiana", "Guayana Británica"), cap("Georgetown"), [], {}),
    ("GUF", M, [2861194], ("Guiana Francesa", "French Guiana", "Guayana Francesa"), cap("Caiena", "Cayenne", "Cayena"), [], {}),
    ("VEN", M, [2842571], ("Venezuela", "Venezuela", "Venezuela"), cap("Caracas"), [], {}),
    ("COL", M, [2848976], ("Colômbia", "Colombia", "Colombia"), cap("Bogotá"), [], {}),
    ("ECU", M, [2848860], ("Equador", "Ecuador", "Ecuador"), cap("Quito"), [], {}),
    ("PRU", M, [2905000], ("Peru", "Peru", "Perú"), cap("Lima"), [], {}),
    ("BOL", M, [2848686], ("Bolívia", "Bolivia", "Bolivia"), cap("Sucre"), ["La Paz"], {}),
    ("BRA", M, [2905001], ("Brasil", "Brazil", "Brasil"), cap("Rio de Janeiro", "Rio de Janeiro", "Río de Janeiro"), [], {}),
    ("PRY", M, [2863122], ("Paraguai", "Paraguay", "Paraguay"), cap("Assunção", "Asunción", "Asunción"), [], {}),
    ("URY", M, [2802055], ("Uruguai", "Uruguay", "Uruguay"), cap("Montevidéu", "Montevideo", "Montevideo"), [], {}),
    ("ARG", M, [2860947], ("Argentina", "Argentina", "Argentina"), cap("Buenos Aires"), [], {"fill": ["32"]}),
    ("CHL", M, [2848843], ("Chile", "Chile", "Chile"), cap("Santiago"), ["Santiago de Chile"], {"fill": ["152"]}),
    # ---- Oceania
    ("AUS", O, [2846174], ("Austrália", "Australia", "Australia"), cap("Melbourne"), [], {}),
    ("NZL", O, [2801019], ("Nova Zelândia", "New Zealand", "Nueva Zelanda"), cap("Wellington"), [], {"alias": ["Domínio da Nova Zelândia"]}),
    ("GNG", O, [2889769], ("Nova Guiné Alemã", "German New Guinea", "Nueva Guinea Alemana"), cap("Rabaul"), [], {}),
    ("SAM", O, [2961788], ("Samoa Alemã", "German Samoa", "Samoa Alemana"), cap("Apia"), [], {}),
    ("FJI", O, [2846213], ("Fiji", "Fiji", "Fiyi"), cap("Suva"), [], {}),
    ("SLB", O, [2831242], ("Ilhas Salomão Britânicas", "British Solomon Islands", "Islas Salomón Británicas"), cap("Tulagi"), [], {"alias": ["Ilhas Salomão", "Solomon Islands"]}),
    ("NHB", O, [2846175], ("Novas Hébridas", "New Hebrides", "Nuevas Hébridas"), cap("Porto Vila", "Port Vila", "Port Vila"), ["Port Vila", "Vila"], {"alias": ["Vanuatu"]}),
    ("NCL", O, [2876367], ("Nova Caledônia", "New Caledonia", "Nueva Caledonia"), cap("Nouméa"), ["Noumea", "Numea"], {"alias": ["Nova Caledónia"]}),
    ("PYF", O, [2876346], ("Oceania Francesa", "French Oceania", "Oceanía Francesa"), cap("Papeete"), [], {"alias": ["Estabelecimentos Franceses da Oceania", "Polinésia Francesa", "French Polynesia"]}),
    ("TON", O, [2846200], ("Tonga", "Tonga", "Tonga"), cap("Nucualofa", "Nukuʻalofa", "Nukualofa"), ["Nukualofa", "Nuku'alofa"], {}),
    ("GIL", O, [2831184], ("Ilhas Gilbert e Ellice", "Gilbert and Ellice Islands", "Islas Gilbert y Ellice"), cap("Banaba"), ["Ilha Oceano", "Ocean Island"], {}),
]

# Terra que fica neutra (desenhada, nunca alvo): miudezas (microestados, concessões estrangeiras na China, ilhas do Canal, fortes) e territórios
# minúsculos; e as disputas da época (o Chaco entre a Bolívia e o Paraguai; o interior do Labrador entre o Canadá e a Terra Nova)
NEUTRAL = {
    "relations": [2739874, 2746467, 2853735, 2693418, 2692855, 2828299, 2828270, 2693293, 2901231, 2901240, 2901238, 2961754, 2962839,
                  2889899, 2848211, 2889933, 2694462, 2805384, 2848195, 2846172, 2831185, 2846264, 2831312, 2831964, 2831970, 2696415, 2832972, 2961649],
    "overlaps": [["BOL", "PRY"], ["NFL", "CAN"]],
    # o "Territórios Britânicos do Pacífico Ocidental" do OHM é só a soma das colônias dele (Salomão, Fiji, Gilbert, Tonga, Novas Hébridas)
    "drop": [2846233],
}
PROBES = [
    ["Viena", 16.37, 48.21, "1914-auh"], ["Sarajevo", 18.41, 43.86, "1914-auh"], ["Trieste", 13.77, 45.65, "1914-auh"], ["Cracóvia", 19.94, 50.06, "1914-auh"],
    ["Varsóvia", 21.01, 52.23, "1914-rus"], ["Helsinque", 24.94, 60.17, "1914-rus"], ["Estrasburgo", 7.75, 48.58, "1914-ger"], ["Breslau", 17.04, 51.11, "1914-ger"],
    ["Dublin", -6.26, 53.35, "1914-gbr"], ["Paris", 2.35, 48.86, "1914-fra"], ["Argel", 3.06, 36.75, "1914-alg"], ["Túnis", 10.18, 36.81, "1914-tun"],
    ["Cairo", 31.24, 30.04, "1914-egy"], ["Alexandria", 29.92, 31.2, "1914-egy"], ["Bagdá", 44.36, 33.31, "1914-ott"], ["Jerusalém", 35.23, 31.78, "1914-ott"],
    ["Dacar", -17.44, 14.69, "1914-aof"], ["Tombuctu", -3.0, 16.77, "1914-aof"], ["Brazzaville", 15.27, -4.27, "1914-aef"], ["Lomé", 1.22, 6.13, "1914-tog"],
    ["Dar es Salaam", 39.28, -6.79, "1914-gea"], ["Windhoek", 17.08, -22.56, "1914-gsw"], ["Joanesburgo", 28.05, -26.2, "1914-zaf"], ["Nairóbi", 36.82, -1.29, "1914-bea"],
    ["Délhi", 77.21, 28.66, "1914-ind"], ["Rangum (Birmânia, parte da Índia Britânica)", 96.16, 16.8, "1914-ind"], ["Seul (Coreia, parte do Japão)", 126.98, 37.57, "1914-jpn"],
    ["Taipé (Formosa, parte do Japão)", 121.56, 25.03, "1914-jpn"], ["Pequim", 116.4, 39.9, "1914-chn"], ["Hanói", 105.85, 21.03, "1914-idc"], ["Batávia", 106.85, -6.2, "1914-dei"],
    ["Manila", 120.98, 14.6, "1914-phl"], ["Singapura", 103.85, 1.29, "1914-sts"], ["Reykjavík", -21.94, 64.15, "1914-isl"], ["Nuuk", -51.72, 64.18, "1914-grl"],
    ["Paramaribo", -55.2, 5.85, "1914-sur"], ["Buenos Aires", -58.38, -34.6, "1914-arg"], ["Santiago", -70.65, -33.45, "1914-chl"], ["Ushuaia", -68.3, -54.8, "1914-arg"],
    ["Rio de Janeiro", -43.2, -22.9, "1914-bra"], ["Washington", -77.04, 38.9, "1914-usa"], ["Anchorage (Alasca)", -149.9, 61.22, "1914-usa"], ["Ottawa", -75.7, 45.42, "1914-can"],
    ["St. John's", -52.71, 47.56, "1914-nfl"], ["Melbourne", 144.96, -37.81, "1914-aus"], ["Rabaul", 152.2, -4.2, "1914-gng"], ["Tetuão", -5.37, 35.57, "1914-smo"],
    ["Rabat", -6.84, 34.02, "1914-mar"], ["Mônaco, terra neutra", 7.42, 43.74, ""], ["Atlântico", -30.0, 30.0, None], ["Pacífico", -140.0, 0.0, None],
]


def main():
    units = []
    for code, region, ohm, (pt, en, es), capital, cap_al, extra in UNITS:
        unit = OrderedDict(code=code, name=en)
        names = {key: value for key, value in (("pt", pt), ("es", es)) if value != en}
        if names:
            unit["names"] = names
        if extra.get("alias"):
            unit["alias"] = extra["alias"]
        if capital:
            unit["capital"] = capital
        if cap_al:
            unit["capAl"] = cap_al
        unit["region"] = region
        unit["ohm"] = ohm
        for key in ("override", "carve", "carveBox", "fill"):
            if extra.get(key):
                unit[key] = extra[key]
        units.append(unit)
    codes = [unit["code"] for unit in units]
    assert len(codes) == len(set(codes)), "código repetido"
    used = [rel for unit in units for rel in unit["ohm"]]
    assert len(used) == len(set(used)), "relação usada duas vezes"
    assert not set(used) & set(NEUTRAL["relations"] + NEUTRAL["drop"]), "relação neutra e usada"
    config = OrderedDict()
    config["comment"] = ("O mundo em 1º de julho de 1914, véspera da Primeira Guerra: Estados, colônias e protetorados como alvos próprios. Fronteiras do "
                         "OpenHistoricalMap (CC0; relações de país válidas na data, fetch-ohm.py), com a costa do mapa HD; onde o OHM falha, a terra de hoje "
                         "pelo carta_id do mapa HD (Egito, Argentina, Chile, sul do Marrocos, interior de Omã, da Somália e da Líbia; a Argélia, a Islândia, a "
                         "Groenlândia e o Suriname recortados das metrópoles). Nomes e capitais de 1914 do Wikidata e das Wikipédias pt/en/es (07/10/2026); "
                         "Kamerun: Buea, sede do governo de 1901 a 1915 (de.wikipedia). Miudezas e as disputas do Chaco e do Labrador ficam neutras. "
                         "Gerado por scripts/divisions/eras/make-1914.py: edite lá.")
    config["id"] = "1914"
    config["kind"] = "era"
    config["date"] = "1914-07-01"
    config["carta"] = "*"
    config["source"] = "ohm"
    config["name"] = {"pt": "1914", "en": "1914", "es": "1914"}
    config["subtitle"] = {"pt": "Véspera da Primeira Guerra", "en": "Eve of the First World War", "es": "Víspera de la Primera Guerra Mundial"}
    config["nameLocale"] = "en"
    config["unit"] = {"pt": {"one": "território", "many": "territórios", "g": "m"}, "en": {"one": "territory", "many": "territories"}, "es": {"one": "territorio", "many": "territorios", "g": "m"}}
    config["regions"] = {
        "europe": {"pt": "Europa", "en": "Europe", "es": "Europa"}, "asia": {"pt": "Ásia", "en": "Asia", "es": "Asia"},
        "africa": {"pt": "África", "en": "Africa", "es": "África"}, "americas": {"pt": "Américas", "en": "Americas", "es": "Américas"},
        "oceania": {"pt": "Oceania", "en": "Oceania", "es": "Oceanía"},
    }
    config["frame"] = [-170.0, -56.0, 190.0, 78.0]
    config["leftoverKm"] = 60
    config["landTolerance"] = 300
    config["zmax"] = 7
    config["neutral"] = NEUTRAL
    config["attribution"] = "© OpenHistoricalMap · © OpenStreetMap contributors · Overture Maps Foundation"
    config["sources"] = [
        {"name": "OpenHistoricalMap, relações boundary=administrative admin_level=2 válidas em 1914-07-01", "url": "https://www.openhistoricalmap.org/copyright",
         "license": "CC0 1.0", "attribution": "© OpenHistoricalMap", "use": "as fronteiras de 1914"},
        {"name": "Mapa HD do Meridiano (build/map-hd/pieces, todo o mundo)", "use": "a terra e a costa (OSM) e, onde o OHM falha, as fronteiras de hoje (Overture)",
         "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors, Overture Maps Foundation"},
    ]
    config["units"] = units
    config["probes"] = PROBES
    text = "{\n" + ",\n".join(
        f'  "{key}": ' + ("[\n" + ",\n".join("    " + json.dumps(item, ensure_ascii=False) for item in value) + "\n  ]" if key in ("units", "probes", "sources") else json.dumps(value, ensure_ascii=False))
        for key, value in config.items()
    ) + "\n}\n"
    json.loads(text)
    open(OUT, "w", encoding="utf8", newline="\n").write(text)
    print(f"ok: {len(units)} territórios ({sum(1 for unit in units if unit.get('capital'))} com capital) em {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
