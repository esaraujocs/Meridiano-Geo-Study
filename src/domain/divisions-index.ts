// Gerado por scripts/divisions/build.py a partir de scripts/divisions/countries/*.json e dos arquivos que ele grava: não editar à mão.
import type { DivisionCountry } from "./divisions.js";

export const DIVISION_INDEX: readonly DivisionCountry[] = [
  {
    "id": "br",
    "carta": "76",
    "name": {
      "pt": "Brasil",
      "en": "Brazil",
      "es": "Brasil"
    },
    "unit": {
      "pt": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      },
      "en": {
        "one": "state",
        "many": "states"
      },
      "es": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "norte",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 7,
        "capitals": 7,
        "flags": 7
      },
      {
        "key": "nordeste",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Nordeste"
        },
        "count": 9,
        "capitals": 9,
        "flags": 9
      },
      {
        "key": "centro-oeste",
        "name": {
          "pt": "Centro-Oeste",
          "en": "Central-West",
          "es": "Centro-Oeste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 4
      },
      {
        "key": "sudeste",
        "name": {
          "pt": "Sudeste",
          "en": "Southeast",
          "es": "Sudeste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 4
      },
      {
        "key": "sul",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 3,
        "capitals": 3,
        "flags": 3
      }
    ],
    "count": 27,
    "flags": true,
    "flagCount": 27,
    "capitals": 27,
    "frame": [
      -73.983,
      -33.751,
      -34.793,
      5.27
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation · IBGE",
    "map": {
      "url": "/maps/divisions-br.pmtiles",
      "bytes": 2334441,
      "sha256": "02f271f5edb459bf1bf41ea105a8de5bd757fb4a53c882e74cb6aa926608da7e"
    }
  },
  {
    "id": "us",
    "carta": "840",
    "name": {
      "pt": "EUA",
      "en": "USA",
      "es": "EE. UU."
    },
    "unit": {
      "pt": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      },
      "en": {
        "one": "state",
        "many": "states"
      },
      "es": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "northeast",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Noreste"
        },
        "count": 9,
        "capitals": 9,
        "flags": 0
      },
      {
        "key": "midwest",
        "name": {
          "pt": "Meio-Oeste",
          "en": "Midwest",
          "es": "Medio Oeste"
        },
        "count": 12,
        "capitals": 12,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 16,
        "capitals": 16,
        "flags": 0
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 13,
        "capitals": 13,
        "flags": 0
      }
    ],
    "count": 50,
    "flags": false,
    "flagCount": 0,
    "capitals": 50,
    "frame": [
      -125.0,
      24.3,
      -66.9,
      49.5
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-us.pmtiles",
      "bytes": 7666016,
      "sha256": "1622609139dd7f08248bbcde13b358fc37d2c22d729d76bcf3b080cf5bad9439"
    }
  },
  {
    "id": "cn",
    "carta": "156",
    "name": {
      "pt": "China",
      "en": "China",
      "es": "China"
    },
    "unit": {
      "pt": {
        "one": "província",
        "many": "províncias",
        "g": "f"
      },
      "en": {
        "one": "province",
        "many": "provinces"
      },
      "es": {
        "one": "provincia",
        "many": "provincias",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 5,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "northeast",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Noreste"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 7,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "south-central",
        "name": {
          "pt": "Centro-Sul",
          "en": "South Central",
          "es": "Centro-Sur"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "southwest",
        "name": {
          "pt": "Sudoeste",
          "en": "Southwest",
          "es": "Suroeste"
        },
        "count": 5,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "northwest",
        "name": {
          "pt": "Noroeste",
          "en": "Northwest",
          "es": "Noroeste"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      }
    ],
    "count": 31,
    "flags": false,
    "flagCount": 0,
    "capitals": 27,
    "frame": [
      73.5,
      18.159,
      134.775,
      53.561
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-cn.pmtiles",
      "bytes": 3075857,
      "sha256": "be61fceee7abc5c36b62fa695f664f13dbe4382d37c49f5cb72991eaed43c69f"
    }
  },
  {
    "id": "es",
    "carta": "724",
    "name": {
      "pt": "Espanha",
      "en": "Spain",
      "es": "España"
    },
    "unit": {
      "pt": {
        "one": "comunidade",
        "many": "comunidades",
        "g": "f"
      },
      "en": {
        "one": "community",
        "many": "communities"
      },
      "es": {
        "one": "comunidad",
        "many": "comunidades",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "center",
        "name": {
          "pt": "Centro",
          "en": "Centre",
          "es": "Centro"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul e Canárias",
          "en": "South and Canaries",
          "es": "Sur y Canarias"
        },
        "count": 5,
        "capitals": 2,
        "flags": 0
      }
    ],
    "count": 19,
    "flags": false,
    "flagCount": 0,
    "capitals": 16,
    "frame": [
      -9.6,
      35.1,
      4.6,
      43.9
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-es.pmtiles",
      "bytes": 626669,
      "sha256": "a55baa8de9c7899081b5c6539086ae718f2e7999090fe6a1515f613b3c835cc1"
    }
  },
  {
    "id": "fr",
    "carta": "250",
    "alsoCarta": [
      "254",
      "175"
    ],
    "name": {
      "pt": "França",
      "en": "France",
      "es": "Francia"
    },
    "unit": {
      "pt": {
        "one": "região",
        "many": "regiões",
        "g": "f"
      },
      "en": {
        "one": "region",
        "many": "regions"
      },
      "es": {
        "one": "región",
        "many": "regiones",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul e Leste",
          "en": "South and East",
          "es": "Sur y Este"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "overseas",
        "name": {
          "pt": "Ultramar",
          "en": "Overseas",
          "es": "Ultramar"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      }
    ],
    "count": 18,
    "flags": false,
    "flagCount": 0,
    "capitals": 18,
    "frame": [
      -5.3,
      41.3,
      9.7,
      51.2
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-fr.pmtiles",
      "bytes": 889509,
      "sha256": "f2c61c670567b29981d5a163b67472c97b3080a2c4f03c998d2422a7f5ce1b7b"
    }
  },
  {
    "id": "de",
    "carta": "276",
    "name": {
      "pt": "Alemanha",
      "en": "Germany",
      "es": "Alemania"
    },
    "unit": {
      "pt": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      },
      "en": {
        "one": "state",
        "many": "states"
      },
      "es": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 5,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 5,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 2,
        "capitals": 2,
        "flags": 0
      }
    ],
    "count": 16,
    "flags": false,
    "flagCount": 0,
    "capitals": 13,
    "frame": [
      5.867,
      47.27,
      15.042,
      55.058
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-de.pmtiles",
      "bytes": 585609,
      "sha256": "9460e2299e002b541c4084efba6a5d87882e170a211aa293fe86bcaafbde0197"
    }
  },
  {
    "id": "ru",
    "carta": "643",
    "name": {
      "pt": "Rússia",
      "en": "Russia",
      "es": "Rusia"
    },
    "unit": {
      "pt": {
        "one": "região",
        "many": "regiões",
        "g": "f"
      },
      "en": {
        "one": "region",
        "many": "regions"
      },
      "es": {
        "one": "región",
        "many": "regiones",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "central",
        "name": {
          "pt": "Central",
          "en": "Central",
          "es": "Central"
        },
        "count": 18,
        "capitals": 17,
        "flags": 0
      },
      {
        "key": "northwest",
        "name": {
          "pt": "Noroeste",
          "en": "Northwest",
          "es": "Noroeste"
        },
        "count": 11,
        "capitals": 10,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "caucasus",
        "name": {
          "pt": "Cáucaso Norte",
          "en": "North Caucasus",
          "es": "Cáucaso Norte"
        },
        "count": 7,
        "capitals": 7,
        "flags": 0
      },
      {
        "key": "volga",
        "name": {
          "pt": "Volga",
          "en": "Volga",
          "es": "Volga"
        },
        "count": 14,
        "capitals": 14,
        "flags": 0
      },
      {
        "key": "ural",
        "name": {
          "pt": "Urais",
          "en": "Urals",
          "es": "Urales"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "siberia",
        "name": {
          "pt": "Sibéria",
          "en": "Siberia",
          "es": "Siberia"
        },
        "count": 10,
        "capitals": 10,
        "flags": 0
      },
      {
        "key": "fareast",
        "name": {
          "pt": "Extremo Oriente",
          "en": "Far East",
          "es": "Lejano Oriente"
        },
        "count": 11,
        "capitals": 11,
        "flags": 0
      }
    ],
    "count": 83,
    "flags": false,
    "flagCount": 0,
    "capitals": 81,
    "frame": [
      19.639,
      41.185,
      180.0,
      81.262
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-ru.pmtiles",
      "bytes": 10446924,
      "sha256": "2ac08d698d95a7ec332f643867cc08d921737ee697a7d835c2d0b3981f5b4f0f"
    }
  },
  {
    "id": "ar",
    "carta": "32",
    "name": {
      "pt": "Argentina",
      "en": "Argentina",
      "es": "Argentina"
    },
    "unit": {
      "pt": {
        "one": "província",
        "many": "províncias",
        "g": "f"
      },
      "en": {
        "one": "province",
        "many": "provinces"
      },
      "es": {
        "one": "provincia",
        "many": "provincias",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "nw",
        "name": {
          "pt": "Noroeste",
          "en": "Northwest",
          "es": "Noroeste"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "ne",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Noreste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "cuyo",
        "name": {
          "pt": "Cuyo",
          "en": "Cuyo",
          "es": "Cuyo"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "pampas",
        "name": {
          "pt": "Pampeana",
          "en": "Pampas",
          "es": "Pampeana"
        },
        "count": 6,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "patagonia",
        "name": {
          "pt": "Patagônia",
          "en": "Patagonia",
          "es": "Patagonia"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      }
    ],
    "count": 24,
    "flags": false,
    "flagCount": 0,
    "capitals": 23,
    "frame": [
      -73.56,
      -55.058,
      -53.638,
      -21.781
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-ar.pmtiles",
      "bytes": 853625,
      "sha256": "e770a3095f3d3b9ff692b6b2ae1ae9833ff9c2036dbba53c96f3deb4a133b61a"
    }
  },
  {
    "id": "pe",
    "carta": "604",
    "name": {
      "pt": "Peru",
      "en": "Peru",
      "es": "Perú"
    },
    "unit": {
      "pt": {
        "one": "região",
        "many": "regiões",
        "g": "f"
      },
      "en": {
        "one": "region",
        "many": "regions"
      },
      "es": {
        "one": "región",
        "many": "regiones",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 8,
        "capitals": 8,
        "flags": 0
      },
      {
        "key": "center",
        "name": {
          "pt": "Centro",
          "en": "Centre",
          "es": "Centro"
        },
        "count": 9,
        "capitals": 9,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 8,
        "capitals": 8,
        "flags": 0
      }
    ],
    "count": 25,
    "flags": false,
    "flagCount": 0,
    "capitals": 25,
    "frame": [
      -81.328,
      -18.35,
      -68.652,
      -0.04
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-pe.pmtiles",
      "bytes": 587169,
      "sha256": "f1276545559d0de691a26f05eb088c666a9b4b8c9e30e7ea4c9ed102752e4a8c"
    }
  },
  {
    "id": "au",
    "carta": "36",
    "name": {
      "pt": "Austrália",
      "en": "Australia",
      "es": "Australia"
    },
    "unit": {
      "pt": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      },
      "en": {
        "one": "state",
        "many": "states"
      },
      "es": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste e centro",
          "en": "West and centre",
          "es": "Oeste y centro"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      }
    ],
    "count": 8,
    "flags": false,
    "flagCount": 0,
    "capitals": 8,
    "frame": [
      113.158,
      -43.643,
      153.639,
      -10.687
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-au.pmtiles",
      "bytes": 1940985,
      "sha256": "22010df510f1fbe744f3d9b9e322cbf676c0e49fede4fc7cc699974b0e456c42"
    }
  },
  {
    "id": "id",
    "carta": "360",
    "name": {
      "pt": "Indonésia",
      "en": "Indonesia",
      "es": "Indonesia"
    },
    "unit": {
      "pt": {
        "one": "província",
        "many": "províncias",
        "g": "f"
      },
      "en": {
        "one": "province",
        "many": "provinces"
      },
      "es": {
        "one": "provincia",
        "many": "provincias",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "sumatra",
        "name": {
          "pt": "Sumatra",
          "en": "Sumatra",
          "es": "Sumatra"
        },
        "count": 10,
        "capitals": 10,
        "flags": 0
      },
      {
        "key": "java",
        "name": {
          "pt": "Java e Sonda",
          "en": "Java and Lesser Sundas",
          "es": "Java y Sonda"
        },
        "count": 9,
        "capitals": 8,
        "flags": 0
      },
      {
        "key": "kalimantan",
        "name": {
          "pt": "Kalimantan",
          "en": "Kalimantan",
          "es": "Kalimantan"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "sulawesi",
        "name": {
          "pt": "Celebes",
          "en": "Sulawesi",
          "es": "Célebes"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Molucas e Papua",
          "en": "Maluku and Papua",
          "es": "Molucas y Papúa"
        },
        "count": 8,
        "capitals": 8,
        "flags": 0
      }
    ],
    "count": 38,
    "flags": false,
    "flagCount": 0,
    "capitals": 37,
    "frame": [
      95.194,
      -10.943,
      141.019,
      5.907
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-id.pmtiles",
      "bytes": 2477035,
      "sha256": "5ac6672afae465d08eacf56d1513adfb2ef9f23c7954cd48531fc1992775b94c"
    }
  },
  {
    "id": "eg",
    "carta": "818",
    "name": {
      "pt": "Egito",
      "en": "Egypt",
      "es": "Egipto"
    },
    "unit": {
      "pt": {
        "one": "província",
        "many": "províncias",
        "g": "f"
      },
      "en": {
        "one": "governorate",
        "many": "governorates"
      },
      "es": {
        "one": "gobernación",
        "many": "gobernaciones",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "delta",
        "name": {
          "pt": "Delta e Cairo",
          "en": "Delta and Cairo",
          "es": "Delta y El Cairo"
        },
        "count": 11,
        "capitals": 11,
        "flags": 0
      },
      {
        "key": "canal",
        "name": {
          "pt": "Canal e Sinai",
          "en": "Canal and Sinai",
          "es": "Canal y Sinaí"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "upper",
        "name": {
          "pt": "Alto Egito",
          "en": "Upper Egypt",
          "es": "Alto Egipto"
        },
        "count": 8,
        "capitals": 8,
        "flags": 0
      },
      {
        "key": "desert",
        "name": {
          "pt": "Desertos",
          "en": "Deserts",
          "es": "Desiertos"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      }
    ],
    "count": 27,
    "flags": false,
    "flagCount": 0,
    "capitals": 27,
    "frame": [
      24.65,
      21.994,
      36.893,
      31.671
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-eg.pmtiles",
      "bytes": 592686,
      "sha256": "f105fda1f59a1fe0f4d6e5c3cb3f28901d4117989fada4692d6d64d4ad9be3fe"
    }
  },
  {
    "id": "ng",
    "carta": "566",
    "name": {
      "pt": "Nigéria",
      "en": "Nigeria",
      "es": "Nigeria"
    },
    "unit": {
      "pt": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      },
      "en": {
        "one": "state",
        "many": "states"
      },
      "es": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "nc",
        "name": {
          "pt": "Centro-Norte",
          "en": "North Central",
          "es": "Centro-Norte"
        },
        "count": 7,
        "capitals": 7,
        "flags": 0
      },
      {
        "key": "ne",
        "name": {
          "pt": "Nordeste",
          "en": "North East",
          "es": "Noreste"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "nw",
        "name": {
          "pt": "Noroeste",
          "en": "North West",
          "es": "Noroeste"
        },
        "count": 7,
        "capitals": 7,
        "flags": 0
      },
      {
        "key": "se",
        "name": {
          "pt": "Sudeste",
          "en": "South East",
          "es": "Sureste"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "ss",
        "name": {
          "pt": "Sul-Sul",
          "en": "South South",
          "es": "Sur-Sur"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "sw",
        "name": {
          "pt": "Sudoeste",
          "en": "South West",
          "es": "Suroeste"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      }
    ],
    "count": 37,
    "flags": false,
    "flagCount": 0,
    "capitals": 37,
    "frame": [
      2.678,
      4.27,
      14.676,
      13.886
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-ng.pmtiles",
      "bytes": 305403,
      "sha256": "84635b8196bb3779ce73660cfd2652873718b363f8278c6f15713e6f81af3c3d"
    }
  },
  {
    "id": "et",
    "carta": "231",
    "name": {
      "pt": "Etiópia",
      "en": "Ethiopia",
      "es": "Etiopía"
    },
    "unit": {
      "pt": {
        "one": "região",
        "many": "regiões",
        "g": "f"
      },
      "en": {
        "one": "region",
        "many": "regions"
      },
      "es": {
        "one": "región",
        "many": "regiones",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "center",
        "name": {
          "pt": "Centro",
          "en": "Centre",
          "es": "Centro"
        },
        "count": 3,
        "capitals": 1,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 3,
        "capitals": 2,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 2,
        "capitals": 2,
        "flags": 0
      }
    ],
    "count": 14,
    "flags": false,
    "flagCount": 0,
    "capitals": 11,
    "frame": [
      32.998,
      3.397,
      47.982,
      14.894
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-et.pmtiles",
      "bytes": 212286,
      "sha256": "63f8d2f7cd25dab10a0858528ea12c470575e9f643d9a177b7efb0027cfbed7b"
    }
  },
  {
    "id": "cd",
    "carta": "180",
    "name": {
      "pt": "RD Congo",
      "en": "DR Congo",
      "es": "RD Congo"
    },
    "unit": {
      "pt": {
        "one": "província",
        "many": "províncias",
        "g": "f"
      },
      "en": {
        "one": "province",
        "many": "provinces"
      },
      "es": {
        "one": "provincia",
        "many": "provincias",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 5,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "northwest",
        "name": {
          "pt": "Noroeste",
          "en": "Northwest",
          "es": "Noroeste"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "northeast",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Noreste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      },
      {
        "key": "center",
        "name": {
          "pt": "Centro",
          "en": "Centre",
          "es": "Centro"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      }
    ],
    "count": 26,
    "flags": false,
    "flagCount": 0,
    "capitals": 25,
    "frame": [
      12.2,
      -13.459,
      31.277,
      5.392
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-cd.pmtiles",
      "bytes": 755980,
      "sha256": "2c0c7b68260aa02599022dc0f4a69a0b1793bf17df48864c3361bcff7f8e85d2"
    }
  },
  {
    "id": "ca",
    "carta": "124",
    "name": {
      "pt": "Canadá",
      "en": "Canada",
      "es": "Canadá"
    },
    "unit": {
      "pt": {
        "one": "província",
        "many": "províncias",
        "g": "f"
      },
      "en": {
        "one": "province",
        "many": "provinces"
      },
      "es": {
        "one": "provincia",
        "many": "provincias",
        "g": "f"
      }
    },
    "regions": [
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "center",
        "name": {
          "pt": "Centro",
          "en": "Central",
          "es": "Centro"
        },
        "count": 2,
        "capitals": 2,
        "flags": 0
      },
      {
        "key": "atlantic",
        "name": {
          "pt": "Atlântico",
          "en": "Atlantic",
          "es": "Atlántico"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      }
    ],
    "count": 13,
    "flags": false,
    "flagCount": 0,
    "capitals": 13,
    "frame": [
      -141.002,
      41.902,
      -52.619,
      83.111
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-ca.pmtiles",
      "bytes": 12481003,
      "sha256": "5446b506b13c933f387f3a8275869b4a2bd8cb97368bbac98363d1a32104786e"
    }
  },
  {
    "id": "in",
    "carta": "356",
    "name": {
      "pt": "Índia",
      "en": "India",
      "es": "India"
    },
    "unit": {
      "pt": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      },
      "en": {
        "one": "state",
        "many": "states"
      },
      "es": {
        "one": "estado",
        "many": "estados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "north",
        "name": {
          "pt": "Norte",
          "en": "North",
          "es": "Norte"
        },
        "count": 8,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "central",
        "name": {
          "pt": "Centro",
          "en": "Central",
          "es": "Centro"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 4,
        "capitals": 4,
        "flags": 0
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 7,
        "capitals": 7,
        "flags": 0
      },
      {
        "key": "northeast",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Noreste"
        },
        "count": 8,
        "capitals": 8,
        "flags": 0
      }
    ],
    "count": 36,
    "flags": false,
    "flagCount": 0,
    "capitals": 33,
    "frame": [
      68.484,
      6.759,
      97.395,
      35.673
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-in.pmtiles",
      "bytes": 1507638,
      "sha256": "212446512a0d999c273d337d7a57c86afb74886b12300ca1ebcbd66710d7a864"
    }
  },
  {
    "id": "ie",
    "carta": "372",
    "name": {
      "pt": "Irlanda",
      "en": "Ireland",
      "es": "Irlanda"
    },
    "unit": {
      "pt": {
        "one": "condado",
        "many": "condados",
        "g": "m"
      },
      "en": {
        "one": "county",
        "many": "counties"
      },
      "es": {
        "one": "condado",
        "many": "condados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "leinster",
        "name": {
          "pt": "Leinster",
          "en": "Leinster",
          "es": "Leinster"
        },
        "count": 12,
        "capitals": 12,
        "flags": 0
      },
      {
        "key": "munster",
        "name": {
          "pt": "Munster",
          "en": "Munster",
          "es": "Munster"
        },
        "count": 6,
        "capitals": 6,
        "flags": 0
      },
      {
        "key": "connacht",
        "name": {
          "pt": "Connacht",
          "en": "Connacht",
          "es": "Connacht"
        },
        "count": 5,
        "capitals": 5,
        "flags": 0
      },
      {
        "key": "ulster",
        "name": {
          "pt": "Ulster",
          "en": "Ulster",
          "es": "Úlster"
        },
        "count": 3,
        "capitals": 3,
        "flags": 0
      }
    ],
    "count": 26,
    "flags": false,
    "flagCount": 0,
    "capitals": 26,
    "frame": [
      -10.48,
      51.448,
      -5.994,
      55.383
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-ie.pmtiles",
      "bytes": 577527,
      "sha256": "99ed5759eace3b762907c26ecd9732ed64c53e27e15df46fd17757c6a5da78e7"
    }
  },
  {
    "id": "gb",
    "carta": "826",
    "alsoCarta": [
      "gb-eng",
      "gb-sct",
      "gb-wls",
      "gb-nir"
    ],
    "name": {
      "pt": "Reino Unido",
      "en": "United Kingdom",
      "es": "Reino Unido"
    },
    "unit": {
      "pt": {
        "one": "condado",
        "many": "condados",
        "g": "m"
      },
      "en": {
        "one": "county",
        "many": "counties"
      },
      "es": {
        "one": "condado",
        "many": "condados",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "eng-north",
        "name": {
          "pt": "Inglaterra · Norte",
          "en": "England · North",
          "es": "Inglaterra · Norte"
        },
        "count": 12,
        "capitals": 7,
        "flags": 0
      },
      {
        "key": "eng-mid",
        "name": {
          "pt": "Inglaterra · Centro",
          "en": "England · Midlands",
          "es": "Inglaterra · Centro"
        },
        "count": 12,
        "capitals": 11,
        "flags": 0
      },
      {
        "key": "eng-south",
        "name": {
          "pt": "Inglaterra · Sul",
          "en": "England · South",
          "es": "Inglaterra · Sur"
        },
        "count": 24,
        "capitals": 22,
        "flags": 0
      },
      {
        "key": "sct",
        "name": {
          "pt": "Escócia",
          "en": "Scotland",
          "es": "Escocia"
        },
        "count": 32,
        "capitals": 31,
        "flags": 0
      },
      {
        "key": "wls",
        "name": {
          "pt": "País de Gales",
          "en": "Wales",
          "es": "Gales"
        },
        "count": 22,
        "capitals": 22,
        "flags": 0
      },
      {
        "key": "nir",
        "name": {
          "pt": "Irlanda do Norte",
          "en": "Northern Ireland",
          "es": "Irlanda del Norte"
        },
        "count": 11,
        "capitals": 0,
        "flags": 0
      }
    ],
    "count": 113,
    "flags": false,
    "flagCount": 0,
    "capitals": 93,
    "frame": [
      -8.617,
      49.903,
      1.763,
      60.846
    ],
    "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-gb.pmtiles",
      "bytes": 1577230,
      "sha256": "82eb41665e09c9b72e2bd05926883a11a10ec9dc61b12e681c4920386b993291"
    }
  },
  {
    "id": "1914",
    "kind": "era",
    "subtitle": {
      "pt": "Véspera da Primeira Guerra",
      "en": "Eve of the First World War",
      "es": "Víspera de la Primera Guerra Mundial"
    },
    "carta": "",
    "name": {
      "pt": "1914",
      "en": "1914",
      "es": "1914"
    },
    "unit": {
      "pt": {
        "one": "território",
        "many": "territórios",
        "g": "m"
      },
      "en": {
        "one": "territory",
        "many": "territories"
      },
      "es": {
        "one": "territorio",
        "many": "territorios",
        "g": "m"
      }
    },
    "regions": [
      {
        "key": "europe",
        "name": {
          "pt": "Europa",
          "en": "Europe",
          "es": "Europa"
        },
        "count": 25,
        "capitals": 25,
        "flags": 23
      },
      {
        "key": "asia",
        "name": {
          "pt": "Ásia",
          "en": "Asia",
          "es": "Asia"
        },
        "count": 29,
        "capitals": 27,
        "flags": 16
      },
      {
        "key": "africa",
        "name": {
          "pt": "África",
          "en": "Africa",
          "es": "África"
        },
        "count": 47,
        "capitals": 46,
        "flags": 15
      },
      {
        "key": "americas",
        "name": {
          "pt": "Américas",
          "en": "Americas",
          "es": "Américas"
        },
        "count": 34,
        "capitals": 33,
        "flags": 30
      },
      {
        "key": "oceania",
        "name": {
          "pt": "Oceania",
          "en": "Oceania",
          "es": "Oceanía"
        },
        "count": 11,
        "capitals": 11,
        "flags": 5
      }
    ],
    "count": 146,
    "flags": true,
    "flagCount": 89,
    "flagCredits": [
      {
        "file": "Flag of Barbados (1870–1966).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Barbados_(1870%E2%80%931966).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Sodacan"
      },
      {
        "file": "Flag of British Guiana (1906–1919).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_British_Guiana_(1906%E2%80%931919).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Sodacan"
      },
      {
        "file": "Flag of British Honduras (1870–1919).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_British_Honduras_(1870%E2%80%931919).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Auguel"
      },
      {
        "file": "Flag of British Somaliland (1903–1950).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_British_Somaliland_(1903%E2%80%931950).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Sodacan"
      },
      {
        "file": "Flag of Fiji (1908–1924).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Fiji_(1908%E2%80%931924).svg",
        "license": "CC BY-SA 3.0",
        "artist": "Suzuki Auto"
      },
      {
        "file": "Flag of Hong Kong (1876–1955).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Hong_Kong_(1876%E2%80%931955).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Sodacan"
      },
      {
        "file": "Flag of Nigeria (1914–1952).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Nigeria_(1914%E2%80%931952).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Benchill (original)"
      },
      {
        "file": "Flag of Spain (1785–1873, 1875–1931).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Spain_(1785%E2%80%931873,_1875%E2%80%931931).svg",
        "license": "CC BY-SA 3.0",
        "artist": "previous version User:Ignaciogavira ; current version HansenBCN , designs from SanchoPanzaXXI"
      },
      {
        "file": "Flag of Trinidad and Tobago (1889–1958).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Trinidad_and_Tobago_(1889%E2%80%931958).svg",
        "license": "CC BY-SA 4.0",
        "artist": "Sodacan"
      },
      {
        "file": "Flag of the Bahamas (1904–1923).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_the_Bahamas_(1904%E2%80%931923).svg",
        "license": "CC BY-SA 3.0",
        "artist": "malarz pl"
      },
      {
        "file": "Flag of the Uganda Protectorate.svg",
        "url": "https://commons.wikimedia.org/wiki/File:Flag_of_the_Uganda_Protectorate.svg",
        "license": "CC BY-SA 3.0",
        "artist": "Sodacan"
      },
      {
        "file": "Red Ensign of South Africa (1912–1951).svg",
        "url": "https://commons.wikimedia.org/wiki/File:Red_Ensign_of_South_Africa_(1912%E2%80%931951).svg",
        "license": "CC BY-SA 3.0",
        "artist": "Fornax"
      }
    ],
    "capitals": 142,
    "frame": [
      -170.0,
      -56.0,
      190.0,
      78.0
    ],
    "attribution": "© OpenHistoricalMap · © OpenStreetMap contributors · Overture Maps Foundation",
    "map": {
      "url": "/maps/divisions-1914.pmtiles",
      "bytes": 17345383,
      "sha256": "689f35ab17fe489c4e245bafade69551847650cd982648b4b682392e3978d168"
    }
  }
];
