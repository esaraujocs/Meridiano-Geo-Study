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
        "capitals": 7
      },
      {
        "key": "nordeste",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Nordeste"
        },
        "count": 9,
        "capitals": 9
      },
      {
        "key": "centro-oeste",
        "name": {
          "pt": "Centro-Oeste",
          "en": "Central-West",
          "es": "Centro-Oeste"
        },
        "count": 4,
        "capitals": 4
      },
      {
        "key": "sudeste",
        "name": {
          "pt": "Sudeste",
          "en": "Southeast",
          "es": "Sudeste"
        },
        "count": 4,
        "capitals": 4
      },
      {
        "key": "sul",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 3,
        "capitals": 3
      }
    ],
    "count": 27,
    "flags": true,
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
        "capitals": 9
      },
      {
        "key": "midwest",
        "name": {
          "pt": "Meio-Oeste",
          "en": "Midwest",
          "es": "Medio Oeste"
        },
        "count": 12,
        "capitals": 12
      },
      {
        "key": "south",
        "name": {
          "pt": "Sul",
          "en": "South",
          "es": "Sur"
        },
        "count": 16,
        "capitals": 16
      },
      {
        "key": "west",
        "name": {
          "pt": "Oeste",
          "en": "West",
          "es": "Oeste"
        },
        "count": 13,
        "capitals": 13
      }
    ],
    "count": 50,
    "flags": false,
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
        "capitals": 3
      },
      {
        "key": "northeast",
        "name": {
          "pt": "Nordeste",
          "en": "Northeast",
          "es": "Noreste"
        },
        "count": 3,
        "capitals": 3
      },
      {
        "key": "east",
        "name": {
          "pt": "Leste",
          "en": "East",
          "es": "Este"
        },
        "count": 7,
        "capitals": 6
      },
      {
        "key": "south-central",
        "name": {
          "pt": "Centro-Sul",
          "en": "South Central",
          "es": "Centro-Sur"
        },
        "count": 6,
        "capitals": 6
      },
      {
        "key": "southwest",
        "name": {
          "pt": "Sudoeste",
          "en": "Southwest",
          "es": "Suroeste"
        },
        "count": 5,
        "capitals": 4
      },
      {
        "key": "northwest",
        "name": {
          "pt": "Noroeste",
          "en": "Northwest",
          "es": "Noroeste"
        },
        "count": 5,
        "capitals": 5
      }
    ],
    "count": 31,
    "flags": false,
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
        "capitals": 25
      },
      {
        "key": "asia",
        "name": {
          "pt": "Ásia",
          "en": "Asia",
          "es": "Asia"
        },
        "count": 29,
        "capitals": 27
      },
      {
        "key": "africa",
        "name": {
          "pt": "África",
          "en": "Africa",
          "es": "África"
        },
        "count": 47,
        "capitals": 46
      },
      {
        "key": "americas",
        "name": {
          "pt": "Américas",
          "en": "Americas",
          "es": "Américas"
        },
        "count": 34,
        "capitals": 33
      },
      {
        "key": "oceania",
        "name": {
          "pt": "Oceania",
          "en": "Oceania",
          "es": "Oceanía"
        },
        "count": 11,
        "capitals": 11
      }
    ],
    "count": 146,
    "flags": false,
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
