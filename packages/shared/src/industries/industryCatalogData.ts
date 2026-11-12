/**
 * Industry catalog, version 1 (status "approved"), bundled at build time.
 * GENERATED: do not edit by hand. Source: Functions repo
 * docs/industries/industry-catalog.v1.json at b574639e3fac68f87fafb816b2455b1dddf9ba85
 * (sha256 of the JSON: ee5bf4215604077aecea72f1404716a496aa233f7702b6ede9ae22174c9b6147).
 * Pinned by the integer version; there is no runtime download.
 */
import type { IndustryCatalogData } from './industryCatalogTypes.ts';

export const INDUSTRY_CATALOG_SOURCE_SHA256 = 'ee5bf4215604077aecea72f1404716a496aa233f7702b6ede9ae22174c9b6147';

export const INDUSTRY_CATALOG_DATA: IndustryCatalogData = {
  "catalog": "nearsy-industries",
  "version": 1,
  "status": "approved",
  "source": "NAICS 2022 (US Census Bureau); Spanish adapted from SCIAN 2023 (INEGI)",
  "idPattern": "^[a-z][a-z0-9_]{1,40}$",
  "limits": {
    "label": 40,
    "shortLabel": 32
  },
  "fallbackIconKey": "generic",
  "sectors": [
    {
      "id": "agriculture",
      "order": 10,
      "naics2022": [
        "11"
      ],
      "label": {
        "en": "Agriculture, Forestry and Fishing",
        "es": "Agricultura, silvicultura y pesca"
      },
      "iconKey": "sprout"
    },
    {
      "id": "mining_oil_gas",
      "order": 20,
      "naics2022": [
        "21"
      ],
      "label": {
        "en": "Mining, Oil and Gas",
        "es": "Minería, petróleo y gas"
      },
      "iconKey": "pickaxe"
    },
    {
      "id": "utilities",
      "order": 30,
      "naics2022": [
        "22"
      ],
      "label": {
        "en": "Utilities",
        "es": "Servicios públicos"
      },
      "iconKey": "bolt"
    },
    {
      "id": "construction",
      "order": 40,
      "naics2022": [
        "23"
      ],
      "label": {
        "en": "Construction",
        "es": "Construcción"
      },
      "iconKey": "crane"
    },
    {
      "id": "manufacturing",
      "order": 50,
      "naics2022": [
        "31",
        "32",
        "33"
      ],
      "label": {
        "en": "Manufacturing",
        "es": "Manufactura"
      },
      "iconKey": "factory"
    },
    {
      "id": "wholesale",
      "order": 60,
      "naics2022": [
        "42"
      ],
      "label": {
        "en": "Wholesale Trade",
        "es": "Comercio al por mayor"
      },
      "iconKey": "boxes"
    },
    {
      "id": "retail",
      "order": 70,
      "naics2022": [
        "44",
        "45"
      ],
      "label": {
        "en": "Retail",
        "es": "Comercio al por menor"
      },
      "iconKey": "storefront"
    },
    {
      "id": "transportation",
      "order": 80,
      "naics2022": [
        "48",
        "49"
      ],
      "label": {
        "en": "Transportation and Logistics",
        "es": "Transporte y logística"
      },
      "iconKey": "truck"
    },
    {
      "id": "technology_media",
      "order": 90,
      "naics2022": [
        "51"
      ],
      "label": {
        "en": "Technology, Media and Telecom",
        "es": "Tecnología, medios y telecomunicaciones"
      },
      "iconKey": "code"
    },
    {
      "id": "finance_insurance",
      "order": 100,
      "naics2022": [
        "52"
      ],
      "label": {
        "en": "Finance and Insurance",
        "es": "Finanzas y seguros"
      },
      "iconKey": "bank"
    },
    {
      "id": "real_estate_rental",
      "order": 110,
      "naics2022": [
        "53"
      ],
      "label": {
        "en": "Real Estate and Rental",
        "es": "Bienes raíces y alquiler"
      },
      "iconKey": "house"
    },
    {
      "id": "professional_services",
      "order": 120,
      "naics2022": [
        "54",
        "55"
      ],
      "label": {
        "en": "Professional and Technical Services",
        "es": "Servicios profesionales y técnicos"
      },
      "iconKey": "briefcase"
    },
    {
      "id": "business_facilities",
      "order": 130,
      "naics2022": [
        "56"
      ],
      "label": {
        "en": "Business Support and Facilities",
        "es": "Apoyo empresarial e instalaciones"
      },
      "iconKey": "headset"
    },
    {
      "id": "education",
      "order": 140,
      "naics2022": [
        "61"
      ],
      "label": {
        "en": "Education",
        "es": "Educación"
      },
      "iconKey": "school"
    },
    {
      "id": "health_social",
      "order": 150,
      "naics2022": [
        "62"
      ],
      "label": {
        "en": "Health Care and Social Assistance",
        "es": "Salud y asistencia social"
      },
      "iconKey": "stethoscope"
    },
    {
      "id": "arts_recreation",
      "order": 160,
      "naics2022": [
        "71"
      ],
      "label": {
        "en": "Arts, Entertainment and Recreation",
        "es": "Artes, entretenimiento y recreación"
      },
      "iconKey": "masks"
    },
    {
      "id": "hospitality_food",
      "order": 170,
      "naics2022": [
        "72"
      ],
      "label": {
        "en": "Hospitality and Food Services",
        "es": "Hotelería y gastronomía"
      },
      "iconKey": "restaurant"
    },
    {
      "id": "personal_services",
      "order": 180,
      "naics2022": [
        "811",
        "812",
        "814"
      ],
      "label": {
        "en": "Personal and Repair Services",
        "es": "Servicios personales y de reparación"
      },
      "iconKey": "scissors"
    },
    {
      "id": "community_nonprofit",
      "order": 190,
      "naics2022": [
        "813"
      ],
      "label": {
        "en": "Nonprofits, Religion and Associations",
        "es": "ONG, religión y asociaciones"
      },
      "iconKey": "handshake"
    },
    {
      "id": "public_administration",
      "order": 200,
      "naics2022": [
        "92"
      ],
      "label": {
        "en": "Government and Public Administration",
        "es": "Gobierno y administración pública"
      },
      "iconKey": "government"
    }
  ],
  "industries": [
    {
      "id": "crop_farming",
      "sector": "agriculture",
      "order": 10,
      "status": "active",
      "naics2022": [
        "111"
      ],
      "label": {
        "en": "Crop Farming",
        "es": "Cultivos agrícolas"
      },
      "shortLabel": {
        "en": "Crop Farming",
        "es": "Cultivos agrícolas"
      },
      "synonyms": {
        "en": [
          "farming",
          "agriculture",
          "agribusiness",
          "horticulture"
        ],
        "es": [
          "agricultura",
          "cultivos",
          "agroindustria",
          "horticultura",
          "campo"
        ]
      },
      "iconKey": "sprout"
    },
    {
      "id": "animal_production",
      "sector": "agriculture",
      "order": 20,
      "status": "active",
      "naics2022": [
        "112"
      ],
      "label": {
        "en": "Livestock and Animal Production",
        "es": "Ganadería y producción animal"
      },
      "shortLabel": {
        "en": "Livestock",
        "es": "Ganadería"
      },
      "synonyms": {
        "en": [
          "livestock",
          "ranching",
          "dairy farming",
          "poultry",
          "aquaculture"
        ],
        "es": [
          "cría de animales",
          "lechería",
          "avicultura",
          "acuicultura"
        ]
      },
      "iconKey": "cow"
    },
    {
      "id": "forestry_logging",
      "sector": "agriculture",
      "order": 30,
      "status": "active",
      "naics2022": [
        "113"
      ],
      "label": {
        "en": "Forestry and Logging",
        "es": "Silvicultura y explotación forestal"
      },
      "shortLabel": {
        "en": "Forestry",
        "es": "Silvicultura"
      },
      "synonyms": {
        "en": [
          "forestry",
          "timber harvesting",
          "logging"
        ],
        "es": [
          "explotación forestal",
          "forestal",
          "aprovechamiento forestal"
        ]
      },
      "iconKey": "tree"
    },
    {
      "id": "fishing_hunting",
      "sector": "agriculture",
      "order": 40,
      "status": "active",
      "naics2022": [
        "114"
      ],
      "label": {
        "en": "Fishing and Hunting",
        "es": "Pesca y caza"
      },
      "shortLabel": {
        "en": "Fishing and Hunting",
        "es": "Pesca y caza"
      },
      "synonyms": {
        "en": [
          "fisheries",
          "commercial fishing",
          "hunting"
        ],
        "es": [
          "pesquería",
          "pesca comercial",
          "caza"
        ]
      },
      "iconKey": "fish"
    },
    {
      "id": "agriculture_support",
      "sector": "agriculture",
      "order": 50,
      "status": "active",
      "naics2022": [
        "115"
      ],
      "label": {
        "en": "Agricultural Support Services",
        "es": "Servicios de apoyo agrícola"
      },
      "shortLabel": {
        "en": "Agricultural Services",
        "es": "Servicios agrícolas"
      },
      "synonyms": {
        "en": [
          "farm services",
          "agronomy services",
          "crop services"
        ],
        "es": [
          "agronomía",
          "asistencia técnica agrícola",
          "servicios al agro"
        ]
      },
      "iconKey": "tractor"
    },
    {
      "id": "oil_gas",
      "sector": "mining_oil_gas",
      "order": 10,
      "status": "active",
      "naics2022": [
        "211",
        "324",
        "486"
      ],
      "label": {
        "en": "Oil and Gas",
        "es": "Petróleo y gas"
      },
      "shortLabel": {
        "en": "Oil and Gas",
        "es": "Petróleo y gas"
      },
      "synonyms": {
        "en": [
          "oil and gas",
          "petroleum",
          "upstream",
          "refining",
          "refinery",
          "pipelines",
          "midstream"
        ],
        "es": [
          "hidrocarburos",
          "refinería",
          "refinación",
          "oleoductos",
          "gasoductos"
        ]
      },
      "iconKey": "barrel"
    },
    {
      "id": "mining_quarrying",
      "sector": "mining_oil_gas",
      "order": 20,
      "status": "active",
      "naics2022": [
        "212"
      ],
      "label": {
        "en": "Mining and Quarrying",
        "es": "Minería y canteras"
      },
      "shortLabel": {
        "en": "Mining and Quarrying",
        "es": "Minería y canteras"
      },
      "synonyms": {
        "en": [
          "mining",
          "coal",
          "metal mining",
          "quarry"
        ],
        "es": [
          "minería",
          "carbón",
          "minería metálica",
          "canteras"
        ]
      },
      "iconKey": "pickaxe"
    },
    {
      "id": "mining_support",
      "sector": "mining_oil_gas",
      "order": 30,
      "status": "active",
      "naics2022": [
        "213"
      ],
      "label": {
        "en": "Mining and Oilfield Services",
        "es": "Servicios mineros y petroleros"
      },
      "shortLabel": {
        "en": "Mining and Oilfield Services",
        "es": "Servicios mineros y petroleros"
      },
      "synonyms": {
        "en": [
          "oilfield services",
          "drilling services",
          "mining services"
        ],
        "es": [
          "servicios petroleros",
          "perforación",
          "servicios mineros"
        ]
      },
      "iconKey": "tools"
    },
    {
      "id": "energy_utilities",
      "sector": "utilities",
      "order": 10,
      "status": "active",
      "naics2022": [
        "2211",
        "2212"
      ],
      "label": {
        "en": "Electric, Gas and Renewable Energy",
        "es": "Energía eléctrica, gas y renovables"
      },
      "shortLabel": {
        "en": "Energy and Utilities",
        "es": "Energía"
      },
      "synonyms": {
        "en": [
          "energy",
          "electricity",
          "power utility",
          "solar",
          "wind",
          "renewables",
          "cleantech",
          "natural gas utility"
        ],
        "es": [
          "energía",
          "electricidad",
          "solar",
          "eólica",
          "renovables",
          "energía renovable",
          "energías limpias",
          "gas natural"
        ]
      },
      "iconKey": "bolt"
    },
    {
      "id": "water_utilities",
      "sector": "utilities",
      "order": 20,
      "status": "active",
      "naics2022": [
        "2213"
      ],
      "label": {
        "en": "Water, Sewage and Irrigation",
        "es": "Agua, alcantarillado y riego"
      },
      "shortLabel": {
        "en": "Water Utilities",
        "es": "Agua y saneamiento"
      },
      "synonyms": {
        "en": [
          "water utility",
          "wastewater",
          "sanitation"
        ],
        "es": [
          "acueducto",
          "agua potable",
          "alcantarillado",
          "saneamiento"
        ]
      },
      "iconKey": "water"
    },
    {
      "id": "building_construction",
      "sector": "construction",
      "order": 10,
      "status": "active",
      "naics2022": [
        "236"
      ],
      "label": {
        "en": "Building Construction",
        "es": "Construcción de edificaciones"
      },
      "shortLabel": {
        "en": "Building Construction",
        "es": "Construcción de edificaciones"
      },
      "synonyms": {
        "en": [
          "construction",
          "homebuilding",
          "general contractor",
          "homebuilder"
        ],
        "es": [
          "construcción",
          "edificación",
          "constructora",
          "contratista general"
        ]
      },
      "iconKey": "crane"
    },
    {
      "id": "civil_engineering_construction",
      "sector": "construction",
      "order": 20,
      "status": "active",
      "naics2022": [
        "237"
      ],
      "label": {
        "en": "Infrastructure and Civil Works",
        "es": "Infraestructura y obras civiles"
      },
      "shortLabel": {
        "en": "Infrastructure and Civil Works",
        "es": "Infraestructura y obras civiles"
      },
      "synonyms": {
        "en": [
          "infrastructure",
          "roads",
          "bridges",
          "heavy construction"
        ],
        "es": [
          "infraestructura",
          "obras civiles",
          "carreteras",
          "puentes"
        ]
      },
      "iconKey": "road"
    },
    {
      "id": "specialty_contractors",
      "sector": "construction",
      "order": 30,
      "status": "active",
      "naics2022": [
        "238"
      ],
      "label": {
        "en": "Specialty Trade Contractors",
        "es": "Contratistas especializados"
      },
      "shortLabel": {
        "en": "Specialty Trade Contractors",
        "es": "Contratistas especializados"
      },
      "synonyms": {
        "en": [
          "electrician",
          "plumbing",
          "hvac",
          "roofing",
          "renovation"
        ],
        "es": [
          "electricistas",
          "plomería",
          "climatización",
          "remodelación",
          "acabados"
        ]
      },
      "iconKey": "tools"
    },
    {
      "id": "food_manufacturing",
      "sector": "manufacturing",
      "order": 10,
      "status": "active",
      "naics2022": [
        "311"
      ],
      "label": {
        "en": "Food Manufacturing",
        "es": "Fabricación de alimentos"
      },
      "shortLabel": {
        "en": "Food Production",
        "es": "Alimentos"
      },
      "synonyms": {
        "en": [
          "food processing",
          "food production",
          "packaged food"
        ],
        "es": [
          "industria alimentaria",
          "procesamiento de alimentos",
          "alimentos procesados"
        ]
      },
      "iconKey": "food"
    },
    {
      "id": "beverage_tobacco",
      "sector": "manufacturing",
      "order": 20,
      "status": "active",
      "naics2022": [
        "312"
      ],
      "label": {
        "en": "Beverages and Tobacco",
        "es": "Bebidas y tabaco"
      },
      "shortLabel": {
        "en": "Beverages and Tobacco",
        "es": "Bebidas y tabaco"
      },
      "synonyms": {
        "en": [
          "beverages",
          "brewery",
          "winery",
          "distillery",
          "soft drinks"
        ],
        "es": [
          "bebidas",
          "cervecería",
          "vinos",
          "licores",
          "tabaco"
        ]
      },
      "iconKey": "drink"
    },
    {
      "id": "textiles_apparel",
      "sector": "manufacturing",
      "order": 30,
      "status": "active",
      "naics2022": [
        "313",
        "314",
        "315",
        "316"
      ],
      "label": {
        "en": "Textiles, Apparel and Footwear",
        "es": "Textiles, confección y calzado"
      },
      "shortLabel": {
        "en": "Textiles and Apparel",
        "es": "Textiles y confección"
      },
      "synonyms": {
        "en": [
          "garment manufacturing",
          "apparel manufacturing",
          "leather goods",
          "footwear manufacturing"
        ],
        "es": [
          "textil",
          "confección",
          "marroquinería",
          "fabricación de calzado"
        ]
      },
      "iconKey": "shirt"
    },
    {
      "id": "wood_paper",
      "sector": "manufacturing",
      "order": 40,
      "status": "active",
      "naics2022": [
        "321",
        "322"
      ],
      "label": {
        "en": "Wood and Paper Products",
        "es": "Productos de madera y papel"
      },
      "shortLabel": {
        "en": "Wood and Paper Products",
        "es": "Productos de madera y papel"
      },
      "synonyms": {
        "en": [
          "lumber",
          "sawmill",
          "pulp and paper",
          "cardboard"
        ],
        "es": [
          "madera",
          "aserradero",
          "papel",
          "cartón"
        ]
      },
      "iconKey": "paper"
    },
    {
      "id": "printing",
      "sector": "manufacturing",
      "order": 50,
      "status": "active",
      "naics2022": [
        "323"
      ],
      "label": {
        "en": "Printing",
        "es": "Impresión"
      },
      "shortLabel": {
        "en": "Printing",
        "es": "Impresión"
      },
      "synonyms": {
        "en": [
          "commercial printing",
          "print shop"
        ],
        "es": [
          "imprenta",
          "artes gráficas",
          "impresión comercial"
        ]
      },
      "iconKey": "printer"
    },
    {
      "id": "chemicals",
      "sector": "manufacturing",
      "order": 60,
      "status": "active",
      "naics2022": [
        "3251",
        "3252",
        "3253",
        "3255",
        "3256",
        "3259"
      ],
      "label": {
        "en": "Chemicals",
        "es": "Química"
      },
      "shortLabel": {
        "en": "Chemicals",
        "es": "Química"
      },
      "synonyms": {
        "en": [
          "chemical manufacturing",
          "paints",
          "fertilizers",
          "cosmetics manufacturing"
        ],
        "es": [
          "industria química",
          "pinturas",
          "fertilizantes",
          "fabricación de cosméticos",
          "detergentes"
        ]
      },
      "iconKey": "flask"
    },
    {
      "id": "pharmaceuticals",
      "sector": "manufacturing",
      "order": 70,
      "status": "active",
      "naics2022": [
        "3254"
      ],
      "label": {
        "en": "Pharmaceuticals and Biotech",
        "es": "Farmacéutica y biotecnología"
      },
      "shortLabel": {
        "en": "Pharmaceuticals and Biotech",
        "es": "Farmacéutica y biotecnología"
      },
      "synonyms": {
        "en": [
          "pharma",
          "biotech",
          "drug manufacturing",
          "life sciences"
        ],
        "es": [
          "farmacéutica",
          "laboratorio farmacéutico",
          "biotecnología",
          "medicamentos"
        ]
      },
      "iconKey": "pill"
    },
    {
      "id": "plastics_rubber",
      "sector": "manufacturing",
      "order": 80,
      "status": "active",
      "naics2022": [
        "326"
      ],
      "label": {
        "en": "Plastics and Rubber",
        "es": "Plásticos y caucho"
      },
      "shortLabel": {
        "en": "Plastics and Rubber",
        "es": "Plásticos y caucho"
      },
      "synonyms": {
        "en": [
          "plastics",
          "rubber",
          "tires"
        ],
        "es": [
          "plásticos",
          "caucho",
          "hule",
          "llantas"
        ]
      },
      "iconKey": "cube"
    },
    {
      "id": "nonmetallic_minerals",
      "sector": "manufacturing",
      "order": 90,
      "status": "active",
      "naics2022": [
        "327"
      ],
      "label": {
        "en": "Glass, Cement and Ceramics",
        "es": "Vidrio, cemento y cerámica"
      },
      "shortLabel": {
        "en": "Glass, Cement and Ceramics",
        "es": "Vidrio, cemento y cerámica"
      },
      "synonyms": {
        "en": [
          "cement",
          "glass",
          "ceramics",
          "concrete"
        ],
        "es": [
          "cemento",
          "vidrio",
          "cerámica",
          "concreto"
        ]
      },
      "iconKey": "bricks"
    },
    {
      "id": "metals",
      "sector": "manufacturing",
      "order": 100,
      "status": "active",
      "naics2022": [
        "331",
        "332"
      ],
      "label": {
        "en": "Metals and Metal Products",
        "es": "Metales y productos metálicos"
      },
      "shortLabel": {
        "en": "Metals and Metal Products",
        "es": "Metales y productos metálicos"
      },
      "synonyms": {
        "en": [
          "steel",
          "aluminum",
          "metalworking",
          "metal fabrication"
        ],
        "es": [
          "acero",
          "siderurgia",
          "metalmecánica",
          "aluminio"
        ]
      },
      "iconKey": "anvil"
    },
    {
      "id": "machinery",
      "sector": "manufacturing",
      "order": 110,
      "status": "active",
      "naics2022": [
        "333"
      ],
      "label": {
        "en": "Machinery",
        "es": "Maquinaria"
      },
      "shortLabel": {
        "en": "Machinery",
        "es": "Maquinaria"
      },
      "synonyms": {
        "en": [
          "industrial machinery",
          "equipment manufacturing"
        ],
        "es": [
          "maquinaria industrial",
          "fabricación de equipos"
        ]
      },
      "iconKey": "gear"
    },
    {
      "id": "electronics_hardware",
      "sector": "manufacturing",
      "order": 120,
      "status": "active",
      "naics2022": [
        "334"
      ],
      "label": {
        "en": "Electronics and Semiconductors",
        "es": "Electrónica y semiconductores"
      },
      "shortLabel": {
        "en": "Electronics and Semiconductors",
        "es": "Electrónica y semiconductores"
      },
      "synonyms": {
        "en": [
          "semiconductors",
          "hardware",
          "electronics manufacturing",
          "chips",
          "devices"
        ],
        "es": [
          "semiconductores",
          "hardware",
          "electrónica",
          "dispositivos"
        ]
      },
      "iconKey": "chip"
    },
    {
      "id": "electrical_equipment",
      "sector": "manufacturing",
      "order": 130,
      "status": "active",
      "naics2022": [
        "335"
      ],
      "label": {
        "en": "Electrical Equipment and Appliances",
        "es": "Equipo eléctrico y electrodomésticos"
      },
      "shortLabel": {
        "en": "Electrical Equipment",
        "es": "Equipo eléctrico"
      },
      "synonyms": {
        "en": [
          "appliance manufacturing",
          "batteries",
          "lighting"
        ],
        "es": [
          "fabricación de electrodomésticos",
          "baterías",
          "iluminación"
        ]
      },
      "iconKey": "plug"
    },
    {
      "id": "automotive",
      "sector": "manufacturing",
      "order": 140,
      "status": "active",
      "naics2022": [
        "3361",
        "3362",
        "3363",
        "3365",
        "3366",
        "3369"
      ],
      "label": {
        "en": "Automotive and Vehicle Manufacturing",
        "es": "Automotriz y fabricación de vehículos"
      },
      "shortLabel": {
        "en": "Automotive",
        "es": "Automotriz"
      },
      "synonyms": {
        "en": [
          "automotive",
          "car manufacturing",
          "auto parts manufacturing",
          "electric vehicles",
          "shipbuilding",
          "rail equipment",
          "motorcycles"
        ],
        "es": [
          "industria automotriz",
          "fabricación de autopartes",
          "vehículos eléctricos",
          "astilleros",
          "motocicletas"
        ]
      },
      "iconKey": "car"
    },
    {
      "id": "aerospace_defense_manufacturing",
      "sector": "manufacturing",
      "order": 150,
      "status": "active",
      "naics2022": [
        "3364"
      ],
      "label": {
        "en": "Aerospace and Defense",
        "es": "Aeroespacial y defensa"
      },
      "shortLabel": {
        "en": "Aerospace and Defense",
        "es": "Aeroespacial y defensa"
      },
      "synonyms": {
        "en": [
          "aerospace",
          "aircraft manufacturing",
          "defense industry"
        ],
        "es": [
          "aeroespacial",
          "aeronáutica",
          "industria de defensa"
        ]
      },
      "iconKey": "airplane"
    },
    {
      "id": "furniture",
      "sector": "manufacturing",
      "order": 160,
      "status": "active",
      "naics2022": [
        "337"
      ],
      "label": {
        "en": "Furniture",
        "es": "Muebles"
      },
      "shortLabel": {
        "en": "Furniture",
        "es": "Muebles"
      },
      "synonyms": {
        "en": [
          "furniture manufacturing",
          "cabinets",
          "mattresses"
        ],
        "es": [
          "fabricación de muebles",
          "mobiliario",
          "colchones"
        ]
      },
      "iconKey": "sofa"
    },
    {
      "id": "medical_devices",
      "sector": "manufacturing",
      "order": 170,
      "status": "active",
      "naics2022": [
        "3391"
      ],
      "label": {
        "en": "Medical Devices",
        "es": "Dispositivos médicos"
      },
      "shortLabel": {
        "en": "Medical Devices",
        "es": "Dispositivos médicos"
      },
      "synonyms": {
        "en": [
          "medtech",
          "medical equipment",
          "dental labs"
        ],
        "es": [
          "equipo médico",
          "tecnología médica",
          "laboratorio dental"
        ]
      },
      "iconKey": "medical_bag"
    },
    {
      "id": "other_manufacturing",
      "sector": "manufacturing",
      "order": 180,
      "status": "active",
      "naics2022": [
        "3399"
      ],
      "label": {
        "en": "Consumer Goods Manufacturing",
        "es": "Fabricación de bienes de consumo"
      },
      "shortLabel": {
        "en": "Consumer Goods",
        "es": "Bienes de consumo"
      },
      "synonyms": {
        "en": [
          "jewelry manufacturing",
          "toys manufacturing",
          "sports equipment manufacturing",
          "signs"
        ],
        "es": [
          "fabricación de joyas",
          "fabricación de juguetes",
          "artículos deportivos (fabricación)"
        ]
      },
      "iconKey": "factory"
    },
    {
      "id": "wholesale_durable",
      "sector": "wholesale",
      "order": 10,
      "status": "active",
      "naics2022": [
        "423",
        "425"
      ],
      "label": {
        "en": "Wholesale: Durable Goods",
        "es": "Mayorista: bienes duraderos"
      },
      "shortLabel": {
        "en": "Wholesale: Durable Goods",
        "es": "Mayorista: bienes duraderos"
      },
      "synonyms": {
        "en": [
          "distributor",
          "import export",
          "b2b trade",
          "wholesale"
        ],
        "es": [
          "distribuidor",
          "importación",
          "exportación",
          "mayorista"
        ]
      },
      "iconKey": "boxes"
    },
    {
      "id": "wholesale_nondurable",
      "sector": "wholesale",
      "order": 20,
      "status": "active",
      "naics2022": [
        "424"
      ],
      "label": {
        "en": "Wholesale: Food and Consumables",
        "es": "Mayorista: alimentos y consumo"
      },
      "shortLabel": {
        "en": "Wholesale: Food and Consumables",
        "es": "Mayorista: alimentos y consumo"
      },
      "synonyms": {
        "en": [
          "food distribution",
          "pharmaceutical distribution",
          "consumer goods distribution"
        ],
        "es": [
          "distribución de alimentos",
          "distribución farmacéutica",
          "distribución de consumo masivo"
        ]
      },
      "iconKey": "boxes"
    },
    {
      "id": "motor_vehicle_retail",
      "sector": "retail",
      "order": 10,
      "status": "active",
      "naics2022": [
        "441"
      ],
      "label": {
        "en": "Car Dealers and Auto Parts",
        "es": "Concesionarios y autopartes"
      },
      "shortLabel": {
        "en": "Car Dealers and Auto Parts",
        "es": "Concesionarios y autopartes"
      },
      "synonyms": {
        "en": [
          "car dealership",
          "auto dealer",
          "auto parts store"
        ],
        "es": [
          "concesionario",
          "venta de autos",
          "autopartes",
          "venta de autopartes"
        ]
      },
      "iconKey": "car_key"
    },
    {
      "id": "home_electronics_retail",
      "sector": "retail",
      "order": 20,
      "status": "active",
      "naics2022": [
        "449"
      ],
      "label": {
        "en": "Home and Electronics Retail",
        "es": "Comercio de hogar y electrónica"
      },
      "shortLabel": {
        "en": "Home and Electronics Retail",
        "es": "Comercio de hogar y electrónica"
      },
      "synonyms": {
        "en": [
          "electronics store",
          "home goods",
          "furniture store"
        ],
        "es": [
          "tienda de electrónica",
          "artículos para el hogar",
          "mueblería"
        ]
      },
      "iconKey": "tv"
    },
    {
      "id": "building_garden_retail",
      "sector": "retail",
      "order": 30,
      "status": "active",
      "naics2022": [
        "444"
      ],
      "label": {
        "en": "Home Improvement and Garden",
        "es": "Ferreterías y jardinería"
      },
      "shortLabel": {
        "en": "Home Improvement and Garden",
        "es": "Ferreterías y jardinería"
      },
      "synonyms": {
        "en": [
          "hardware store",
          "home improvement store",
          "garden center"
        ],
        "es": [
          "ferretería",
          "materiales de construcción",
          "vivero"
        ]
      },
      "iconKey": "hammer"
    },
    {
      "id": "food_beverage_retail",
      "sector": "retail",
      "order": 40,
      "status": "active",
      "naics2022": [
        "445"
      ],
      "label": {
        "en": "Grocery and Food Retail",
        "es": "Supermercados y tiendas de alimentos"
      },
      "shortLabel": {
        "en": "Grocery Retail",
        "es": "Supermercados"
      },
      "synonyms": {
        "en": [
          "grocery",
          "supermarket",
          "convenience store"
        ],
        "es": [
          "supermercado",
          "abarrotes",
          "tienda de barrio",
          "minimercado"
        ]
      },
      "iconKey": "basket"
    },
    {
      "id": "health_personal_care_retail",
      "sector": "retail",
      "order": 50,
      "status": "active",
      "naics2022": [
        "456"
      ],
      "label": {
        "en": "Pharmacies and Personal Care",
        "es": "Farmacias y cuidado personal"
      },
      "shortLabel": {
        "en": "Pharmacies and Personal Care",
        "es": "Farmacias y cuidado personal"
      },
      "synonyms": {
        "en": [
          "pharmacy",
          "drugstore",
          "beauty store",
          "optical store"
        ],
        "es": [
          "farmacia",
          "droguería",
          "tienda de belleza",
          "óptica"
        ]
      },
      "iconKey": "pill"
    },
    {
      "id": "fuel_retail",
      "sector": "retail",
      "order": 60,
      "status": "active",
      "naics2022": [
        "457"
      ],
      "label": {
        "en": "Gas Stations",
        "es": "Estaciones de servicio"
      },
      "shortLabel": {
        "en": "Gas Stations",
        "es": "Estaciones de servicio"
      },
      "synonyms": {
        "en": [
          "gas station",
          "fuel dealer"
        ],
        "es": [
          "gasolinera",
          "combustibles"
        ]
      },
      "iconKey": "fuel"
    },
    {
      "id": "clothing_retail",
      "sector": "retail",
      "order": 70,
      "status": "active",
      "naics2022": [
        "458"
      ],
      "label": {
        "en": "Clothing, Shoes and Jewelry Retail",
        "es": "Ropa, calzado y joyería"
      },
      "shortLabel": {
        "en": "Fashion Retail",
        "es": "Comercio de moda"
      },
      "synonyms": {
        "en": [
          "fashion retail",
          "apparel store",
          "jewelry store",
          "fashion"
        ],
        "es": [
          "moda",
          "tienda de ropa",
          "zapatería",
          "joyería"
        ]
      },
      "iconKey": "bag"
    },
    {
      "id": "hobby_sports_retail",
      "sector": "retail",
      "order": 80,
      "status": "active",
      "naics2022": [
        "459"
      ],
      "label": {
        "en": "Hobby, Sports and Book Retail",
        "es": "Pasatiempos, deportes y libros"
      },
      "shortLabel": {
        "en": "Specialty Retail",
        "es": "Comercio especializado"
      },
      "synonyms": {
        "en": [
          "bookstore",
          "sporting goods",
          "toy store",
          "pet store",
          "florist"
        ],
        "es": [
          "librería",
          "tienda deportiva",
          "juguetería",
          "tienda de mascotas",
          "floristería"
        ]
      },
      "iconKey": "gift"
    },
    {
      "id": "general_merchandise_retail",
      "sector": "retail",
      "order": 90,
      "status": "active",
      "naics2022": [
        "455"
      ],
      "label": {
        "en": "Department Stores and E-commerce",
        "es": "Tiendas por departamentos y e-commerce"
      },
      "shortLabel": {
        "en": "General Retail",
        "es": "Comercio general"
      },
      "synonyms": {
        "en": [
          "department store",
          "warehouse club",
          "ecommerce",
          "e-commerce",
          "online store",
          "marketplace",
          "retail"
        ],
        "es": [
          "tienda por departamentos",
          "grandes superficies",
          "comercio electrónico",
          "tienda en línea",
          "e-commerce",
          "retail"
        ]
      },
      "iconKey": "storefront"
    },
    {
      "id": "air_transportation",
      "sector": "transportation",
      "order": 10,
      "status": "active",
      "naics2022": [
        "481"
      ],
      "label": {
        "en": "Airlines and Aviation",
        "es": "Aerolíneas y aviación"
      },
      "shortLabel": {
        "en": "Airlines and Aviation",
        "es": "Aerolíneas y aviación"
      },
      "synonyms": {
        "en": [
          "airline",
          "aviation",
          "air cargo",
          "charter flights"
        ],
        "es": [
          "aerolínea",
          "aviación",
          "carga aérea"
        ]
      },
      "iconKey": "airplane"
    },
    {
      "id": "rail_transportation",
      "sector": "transportation",
      "order": 20,
      "status": "active",
      "naics2022": [
        "482"
      ],
      "label": {
        "en": "Rail Transportation",
        "es": "Transporte ferroviario"
      },
      "shortLabel": {
        "en": "Rail Transportation",
        "es": "Transporte ferroviario"
      },
      "synonyms": {
        "en": [
          "railroad",
          "railway",
          "freight rail"
        ],
        "es": [
          "ferrocarril",
          "tren",
          "ferroviario"
        ]
      },
      "iconKey": "train"
    },
    {
      "id": "water_transportation",
      "sector": "transportation",
      "order": 30,
      "status": "active",
      "naics2022": [
        "483"
      ],
      "label": {
        "en": "Shipping and Maritime",
        "es": "Transporte marítimo y fluvial"
      },
      "shortLabel": {
        "en": "Shipping and Maritime",
        "es": "Transporte marítimo y fluvial"
      },
      "synonyms": {
        "en": [
          "shipping line",
          "maritime",
          "cruise line",
          "ferry"
        ],
        "es": [
          "naviera",
          "marítimo",
          "cruceros",
          "transporte fluvial"
        ]
      },
      "iconKey": "ship"
    },
    {
      "id": "trucking",
      "sector": "transportation",
      "order": 40,
      "status": "active",
      "naics2022": [
        "484"
      ],
      "label": {
        "en": "Trucking and Freight",
        "es": "Transporte de carga"
      },
      "shortLabel": {
        "en": "Trucking and Freight",
        "es": "Transporte de carga"
      },
      "synonyms": {
        "en": [
          "freight",
          "truckload",
          "haulage"
        ],
        "es": [
          "camiones",
          "fletes",
          "transporte de carga por carretera"
        ]
      },
      "iconKey": "truck"
    },
    {
      "id": "ground_passenger_transport",
      "sector": "transportation",
      "order": 50,
      "status": "active",
      "naics2022": [
        "485",
        "487"
      ],
      "label": {
        "en": "Transit, Taxi and Passenger Transport",
        "es": "Transporte público y de pasajeros"
      },
      "shortLabel": {
        "en": "Passenger Transport",
        "es": "Transporte de pasajeros"
      },
      "synonyms": {
        "en": [
          "public transit",
          "bus company",
          "taxi",
          "ride hailing",
          "sightseeing"
        ],
        "es": [
          "transporte público",
          "autobuses",
          "taxi",
          "buses turísticos"
        ]
      },
      "iconKey": "bus"
    },
    {
      "id": "logistics_support",
      "sector": "transportation",
      "order": 60,
      "status": "active",
      "naics2022": [
        "488"
      ],
      "label": {
        "en": "Logistics and Supply Chain",
        "es": "Logística y cadena de suministro"
      },
      "shortLabel": {
        "en": "Logistics",
        "es": "Logística"
      },
      "synonyms": {
        "en": [
          "logistics",
          "freight forwarding",
          "customs brokerage",
          "supply chain",
          "ports",
          "airports"
        ],
        "es": [
          "logística",
          "agente de carga",
          "agencia de aduanas",
          "cadena de suministro",
          "puertos"
        ]
      },
      "iconKey": "route"
    },
    {
      "id": "postal_courier",
      "sector": "transportation",
      "order": 70,
      "status": "active",
      "naics2022": [
        "491",
        "492"
      ],
      "label": {
        "en": "Courier and Delivery",
        "es": "Mensajería y paquetería"
      },
      "shortLabel": {
        "en": "Courier and Delivery",
        "es": "Mensajería y paquetería"
      },
      "synonyms": {
        "en": [
          "courier",
          "parcel delivery",
          "last mile",
          "postal service",
          "delivery"
        ],
        "es": [
          "mensajería",
          "paquetería",
          "entregas",
          "correo",
          "delivery",
          "domicilios"
        ]
      },
      "iconKey": "package"
    },
    {
      "id": "warehousing",
      "sector": "transportation",
      "order": 80,
      "status": "active",
      "naics2022": [
        "493"
      ],
      "label": {
        "en": "Warehousing and Storage",
        "es": "Almacenamiento y bodegas"
      },
      "shortLabel": {
        "en": "Warehousing and Storage",
        "es": "Almacenamiento y bodegas"
      },
      "synonyms": {
        "en": [
          "warehouse",
          "fulfillment",
          "cold storage"
        ],
        "es": [
          "bodegas",
          "almacenes",
          "centro de distribución"
        ]
      },
      "iconKey": "warehouse"
    },
    {
      "id": "software",
      "sector": "technology_media",
      "order": 10,
      "status": "active",
      "naics2022": [
        "5132",
        "518"
      ],
      "label": {
        "en": "Software and Cloud",
        "es": "Software y nube"
      },
      "shortLabel": {
        "en": "Software and Cloud",
        "es": "Software y nube"
      },
      "synonyms": {
        "en": [
          "software development",
          "saas",
          "apps",
          "tech",
          "technology",
          "cloud computing",
          "data centers",
          "hosting",
          "artificial intelligence",
          "ai",
          "machine learning",
          "data science",
          "video games",
          "gaming",
          "game development",
          "blockchain",
          "web3"
        ],
        "es": [
          "desarrollo de software",
          "aplicaciones",
          "tecnología",
          "nube",
          "centros de datos",
          "inteligencia artificial",
          "ia",
          "aprendizaje automático",
          "ciencia de datos",
          "videojuegos",
          "desarrollo de videojuegos"
        ]
      },
      "iconKey": "code"
    },
    {
      "id": "telecommunications",
      "sector": "technology_media",
      "order": 20,
      "status": "active",
      "naics2022": [
        "517"
      ],
      "label": {
        "en": "Telecommunications",
        "es": "Telecomunicaciones"
      },
      "shortLabel": {
        "en": "Telecommunications",
        "es": "Telecomunicaciones"
      },
      "synonyms": {
        "en": [
          "telecom",
          "wireless carrier",
          "internet provider",
          "isp",
          "satellite"
        ],
        "es": [
          "telefonía",
          "operador móvil",
          "proveedor de internet",
          "satelital"
        ]
      },
      "iconKey": "antenna"
    },
    {
      "id": "publishing",
      "sector": "technology_media",
      "order": 30,
      "status": "active",
      "naics2022": [
        "5131",
        "519"
      ],
      "label": {
        "en": "Publishing and Information Services",
        "es": "Editorial y servicios de información"
      },
      "shortLabel": {
        "en": "Publishing",
        "es": "Editorial"
      },
      "synonyms": {
        "en": [
          "newspapers",
          "books",
          "magazines",
          "journalism",
          "libraries",
          "news agency",
          "web portals"
        ],
        "es": [
          "periódicos",
          "libros",
          "revistas",
          "periodismo",
          "bibliotecas",
          "agencia de noticias"
        ]
      },
      "iconKey": "newspaper"
    },
    {
      "id": "film_music",
      "sector": "technology_media",
      "order": 40,
      "status": "active",
      "naics2022": [
        "512"
      ],
      "label": {
        "en": "Film, Video and Music",
        "es": "Cine, video y música"
      },
      "shortLabel": {
        "en": "Film, Video and Music",
        "es": "Cine, video y música"
      },
      "synonyms": {
        "en": [
          "film",
          "movies",
          "video production",
          "music industry",
          "record label",
          "post-production"
        ],
        "es": [
          "cine",
          "producción audiovisual",
          "industria musical",
          "disquera",
          "posproducción"
        ]
      },
      "iconKey": "film"
    },
    {
      "id": "broadcasting_streaming",
      "sector": "technology_media",
      "order": 50,
      "status": "active",
      "naics2022": [
        "516"
      ],
      "label": {
        "en": "TV, Radio, Streaming and Creators",
        "es": "TV, radio, streaming y creadores"
      },
      "shortLabel": {
        "en": "Broadcasting and Streaming",
        "es": "TV, radio y streaming"
      },
      "synonyms": {
        "en": [
          "television",
          "radio",
          "streaming",
          "social media",
          "content creators",
          "influencer",
          "podcasts"
        ],
        "es": [
          "televisión",
          "radio",
          "streaming",
          "redes sociales",
          "creador de contenido",
          "influencer",
          "pódcast",
          "medios",
          "medios de comunicación"
        ]
      },
      "iconKey": "broadcast"
    },
    {
      "id": "banking_credit",
      "sector": "finance_insurance",
      "order": 10,
      "status": "active",
      "naics2022": [
        "521",
        "522"
      ],
      "label": {
        "en": "Banking, Lending and Payments",
        "es": "Banca, crédito y pagos"
      },
      "shortLabel": {
        "en": "Banking, Lending and Payments",
        "es": "Banca, crédito y pagos"
      },
      "synonyms": {
        "en": [
          "bank",
          "banking",
          "credit union",
          "lending",
          "fintech",
          "payments",
          "mortgage"
        ],
        "es": [
          "banca",
          "banco",
          "cooperativa financiera",
          "crédito",
          "fintech",
          "pagos",
          "hipotecas"
        ]
      },
      "iconKey": "bank"
    },
    {
      "id": "investments_capital_markets",
      "sector": "finance_insurance",
      "order": 20,
      "status": "active",
      "naics2022": [
        "523",
        "525"
      ],
      "label": {
        "en": "Investments and Capital Markets",
        "es": "Inversiones y mercado de capitales"
      },
      "shortLabel": {
        "en": "Investments",
        "es": "Inversiones"
      },
      "synonyms": {
        "en": [
          "investment banking",
          "asset management",
          "private equity",
          "venture capital",
          "brokerage",
          "crypto exchange",
          "wealth management"
        ],
        "es": [
          "banca de inversión",
          "gestión de activos",
          "capital privado",
          "capital de riesgo",
          "bolsa",
          "comisionista",
          "corretaje",
          "cripto",
          "criptomonedas"
        ]
      },
      "iconKey": "chart"
    },
    {
      "id": "insurance",
      "sector": "finance_insurance",
      "order": 30,
      "status": "active",
      "naics2022": [
        "524"
      ],
      "label": {
        "en": "Insurance",
        "es": "Seguros"
      },
      "shortLabel": {
        "en": "Insurance",
        "es": "Seguros"
      },
      "synonyms": {
        "en": [
          "insurance carrier",
          "insurance broker",
          "insurtech",
          "reinsurance"
        ],
        "es": [
          "aseguradora",
          "corredor de seguros",
          "insurtech",
          "reaseguros"
        ]
      },
      "iconKey": "shield"
    },
    {
      "id": "real_estate",
      "sector": "real_estate_rental",
      "order": 10,
      "status": "active",
      "naics2022": [
        "531"
      ],
      "label": {
        "en": "Real Estate",
        "es": "Bienes raíces"
      },
      "shortLabel": {
        "en": "Real Estate",
        "es": "Bienes raíces"
      },
      "synonyms": {
        "en": [
          "realtor",
          "property management",
          "real estate brokerage",
          "proptech",
          "real estate development",
          "real estate developer"
        ],
        "es": [
          "inmobiliaria",
          "finca raíz",
          "administración de propiedades",
          "proptech",
          "desarrollo inmobiliario"
        ]
      },
      "iconKey": "house"
    },
    {
      "id": "rental_leasing",
      "sector": "real_estate_rental",
      "order": 20,
      "status": "active",
      "naics2022": [
        "532",
        "533"
      ],
      "label": {
        "en": "Rental, Leasing and Licensing",
        "es": "Alquiler, arrendamiento y licencias"
      },
      "shortLabel": {
        "en": "Rental and Leasing",
        "es": "Alquiler y arrendamiento"
      },
      "synonyms": {
        "en": [
          "car rental",
          "equipment rental",
          "leasing",
          "franchisor",
          "brand licensing"
        ],
        "es": [
          "alquiler de autos",
          "alquiler de equipos",
          "leasing",
          "franquicias",
          "licencias de marca"
        ]
      },
      "iconKey": "key"
    },
    {
      "id": "legal_services",
      "sector": "professional_services",
      "order": 10,
      "status": "active",
      "naics2022": [
        "5411"
      ],
      "label": {
        "en": "Legal Services",
        "es": "Servicios legales"
      },
      "shortLabel": {
        "en": "Legal Services",
        "es": "Servicios legales"
      },
      "synonyms": {
        "en": [
          "law firm",
          "lawyers",
          "attorney",
          "notary"
        ],
        "es": [
          "abogados",
          "abogado",
          "bufete",
          "firma de abogados",
          "notaría"
        ]
      },
      "iconKey": "gavel"
    },
    {
      "id": "accounting_tax",
      "sector": "professional_services",
      "order": 20,
      "status": "active",
      "naics2022": [
        "5412"
      ],
      "label": {
        "en": "Accounting, Tax and Payroll",
        "es": "Contabilidad, impuestos y nómina"
      },
      "shortLabel": {
        "en": "Accounting, Tax and Payroll",
        "es": "Contabilidad, impuestos y nómina"
      },
      "synonyms": {
        "en": [
          "accounting firm",
          "cpa",
          "audit",
          "bookkeeping",
          "payroll"
        ],
        "es": [
          "contaduría",
          "contador",
          "auditoría",
          "revisoría fiscal",
          "nómina"
        ]
      },
      "iconKey": "calculator"
    },
    {
      "id": "architecture_engineering",
      "sector": "professional_services",
      "order": 30,
      "status": "active",
      "naics2022": [
        "5413"
      ],
      "label": {
        "en": "Architecture and Engineering",
        "es": "Arquitectura e ingeniería"
      },
      "shortLabel": {
        "en": "Architecture and Engineering",
        "es": "Arquitectura e ingeniería"
      },
      "synonyms": {
        "en": [
          "architects",
          "engineering firm",
          "surveying",
          "testing labs"
        ],
        "es": [
          "arquitectura",
          "firma de ingeniería",
          "topografía",
          "laboratorio de ensayos"
        ]
      },
      "iconKey": "ruler"
    },
    {
      "id": "design_services",
      "sector": "professional_services",
      "order": 40,
      "status": "active",
      "naics2022": [
        "5414"
      ],
      "label": {
        "en": "Design Services",
        "es": "Servicios de diseño"
      },
      "shortLabel": {
        "en": "Design Services",
        "es": "Servicios de diseño"
      },
      "synonyms": {
        "en": [
          "graphic design",
          "interior design",
          "industrial design",
          "ux design",
          "ui design",
          "product design"
        ],
        "es": [
          "diseño gráfico",
          "diseño de interiores",
          "diseño industrial",
          "diseño ux",
          "diseño ui",
          "diseño de producto"
        ]
      },
      "iconKey": "palette"
    },
    {
      "id": "it_services",
      "sector": "professional_services",
      "order": 50,
      "status": "active",
      "naics2022": [
        "5415"
      ],
      "label": {
        "en": "IT Services and Consulting",
        "es": "Servicios y consultoría de TI"
      },
      "shortLabel": {
        "en": "IT Services and Consulting",
        "es": "Servicios y consultoría de TI"
      },
      "synonyms": {
        "en": [
          "it consulting",
          "systems integration",
          "custom software",
          "managed services",
          "cybersecurity"
        ],
        "es": [
          "consultoría de ti",
          "integración de sistemas",
          "software a la medida",
          "servicios gestionados",
          "ciberseguridad"
        ]
      },
      "iconKey": "laptop"
    },
    {
      "id": "management_consulting",
      "sector": "professional_services",
      "order": 60,
      "status": "active",
      "naics2022": [
        "5416"
      ],
      "label": {
        "en": "Management Consulting",
        "es": "Consultoría empresarial"
      },
      "shortLabel": {
        "en": "Management Consulting",
        "es": "Consultoría empresarial"
      },
      "synonyms": {
        "en": [
          "consulting",
          "strategy consulting",
          "hr consulting",
          "environmental consulting",
          "sustainability",
          "esg"
        ],
        "es": [
          "consultoría",
          "consultoría estratégica",
          "consultoría de recursos humanos",
          "consultoría ambiental",
          "sostenibilidad",
          "asg"
        ]
      },
      "iconKey": "briefcase"
    },
    {
      "id": "research_development",
      "sector": "professional_services",
      "order": 70,
      "status": "active",
      "naics2022": [
        "5417"
      ],
      "label": {
        "en": "Scientific Research and Development",
        "es": "Investigación científica y desarrollo"
      },
      "shortLabel": {
        "en": "Research and Development",
        "es": "Investigación y desarrollo"
      },
      "synonyms": {
        "en": [
          "r&d",
          "research lab",
          "research institute",
          "think tank"
        ],
        "es": [
          "i+d",
          "investigación",
          "laboratorio de investigación",
          "centro de investigación"
        ]
      },
      "iconKey": "microscope"
    },
    {
      "id": "advertising_marketing",
      "sector": "professional_services",
      "order": 80,
      "status": "active",
      "naics2022": [
        "5418",
        "54191"
      ],
      "label": {
        "en": "Advertising, Marketing and PR",
        "es": "Publicidad, marketing y comunicación"
      },
      "shortLabel": {
        "en": "Advertising and Marketing",
        "es": "Publicidad y marketing"
      },
      "synonyms": {
        "en": [
          "advertising agency",
          "digital marketing",
          "public relations",
          "media buying",
          "market research",
          "branding",
          "seo",
          "communications",
          "pr"
        ],
        "es": [
          "agencia de publicidad",
          "marketing digital",
          "marketing",
          "mercadeo",
          "mercadotecnia",
          "relaciones públicas",
          "investigación de mercados",
          "branding",
          "seo",
          "comunicaciones"
        ]
      },
      "iconKey": "megaphone"
    },
    {
      "id": "photography",
      "sector": "professional_services",
      "order": 90,
      "status": "active",
      "naics2022": [
        "54192"
      ],
      "label": {
        "en": "Photography",
        "es": "Fotografía"
      },
      "shortLabel": {
        "en": "Photography",
        "es": "Fotografía"
      },
      "synonyms": {
        "en": [
          "photo studio",
          "photographer"
        ],
        "es": [
          "estudio fotográfico",
          "fotógrafo"
        ]
      },
      "iconKey": "camera"
    },
    {
      "id": "translation_interpretation",
      "sector": "professional_services",
      "order": 100,
      "status": "active",
      "naics2022": [
        "54193"
      ],
      "label": {
        "en": "Translation and Interpretation",
        "es": "Traducción e interpretación"
      },
      "shortLabel": {
        "en": "Translation and Interpretation",
        "es": "Traducción e interpretación"
      },
      "synonyms": {
        "en": [
          "translation",
          "localization",
          "interpreting"
        ],
        "es": [
          "traducción",
          "localización",
          "interpretación"
        ]
      },
      "iconKey": "language"
    },
    {
      "id": "veterinary",
      "sector": "professional_services",
      "order": 110,
      "status": "active",
      "naics2022": [
        "54194"
      ],
      "label": {
        "en": "Veterinary Services",
        "es": "Veterinaria"
      },
      "shortLabel": {
        "en": "Veterinary Services",
        "es": "Veterinaria"
      },
      "synonyms": {
        "en": [
          "vet",
          "animal hospital"
        ],
        "es": [
          "clínica veterinaria",
          "médico veterinario"
        ]
      },
      "iconKey": "paw"
    },
    {
      "id": "other_professional_services",
      "sector": "professional_services",
      "order": 120,
      "status": "active",
      "naics2022": [
        "54199",
        "551"
      ],
      "label": {
        "en": "Corporate Offices and Other Services",
        "es": "Corporativos y otros servicios"
      },
      "shortLabel": {
        "en": "Corporate Services",
        "es": "Servicios corporativos"
      },
      "synonyms": {
        "en": [
          "holding company",
          "headquarters",
          "corporate office",
          "appraisal"
        ],
        "es": [
          "holding",
          "grupo empresarial",
          "casa matriz",
          "oficina corporativa",
          "avalúos"
        ]
      },
      "iconKey": "clipboard"
    },
    {
      "id": "business_support",
      "sector": "business_facilities",
      "order": 10,
      "status": "active",
      "naics2022": [
        "5611",
        "5612",
        "5614",
        "5619"
      ],
      "label": {
        "en": "Business Support and Outsourcing",
        "es": "Apoyo empresarial y tercerización"
      },
      "shortLabel": {
        "en": "Business Outsourcing",
        "es": "Tercerización"
      },
      "synonyms": {
        "en": [
          "bpo",
          "call center",
          "outsourcing",
          "facilities support",
          "collections"
        ],
        "es": [
          "centro de contacto",
          "call center",
          "tercerización",
          "outsourcing",
          "cobranza"
        ]
      },
      "iconKey": "headset"
    },
    {
      "id": "staffing_recruiting",
      "sector": "business_facilities",
      "order": 20,
      "status": "active",
      "naics2022": [
        "5613"
      ],
      "label": {
        "en": "Staffing and Recruiting",
        "es": "Reclutamiento y servicios de personal"
      },
      "shortLabel": {
        "en": "Staffing and Recruiting",
        "es": "Reclutamiento y personal"
      },
      "synonyms": {
        "en": [
          "recruiting",
          "staffing agency",
          "headhunting",
          "headhunter",
          "temp agency",
          "human resources",
          "hr"
        ],
        "es": [
          "reclutamiento",
          "agencia de empleo",
          "cazatalentos",
          "headhunter",
          "servicios temporales",
          "recursos humanos"
        ]
      },
      "iconKey": "people"
    },
    {
      "id": "travel_agencies",
      "sector": "business_facilities",
      "order": 30,
      "status": "active",
      "naics2022": [
        "5615"
      ],
      "label": {
        "en": "Travel Agencies and Tour Operators",
        "es": "Agencias de viajes y turismo"
      },
      "shortLabel": {
        "en": "Travel Agencies",
        "es": "Agencias de viajes"
      },
      "synonyms": {
        "en": [
          "travel agency",
          "tour operator",
          "tourism",
          "reservations"
        ],
        "es": [
          "agencia de viajes",
          "operador turístico",
          "turismo",
          "reservas"
        ]
      },
      "iconKey": "suitcase"
    },
    {
      "id": "security_services",
      "sector": "business_facilities",
      "order": 40,
      "status": "active",
      "naics2022": [
        "5616"
      ],
      "label": {
        "en": "Security and Investigations",
        "es": "Seguridad privada e investigación"
      },
      "shortLabel": {
        "en": "Security Services",
        "es": "Seguridad privada"
      },
      "synonyms": {
        "en": [
          "private security",
          "guards",
          "alarm monitoring",
          "private investigations"
        ],
        "es": [
          "seguridad privada",
          "vigilancia",
          "monitoreo de alarmas",
          "investigación privada"
        ]
      },
      "iconKey": "lock"
    },
    {
      "id": "facility_services",
      "sector": "business_facilities",
      "order": 50,
      "status": "active",
      "naics2022": [
        "5617"
      ],
      "label": {
        "en": "Cleaning and Building Maintenance",
        "es": "Limpieza y mantenimiento de edificios"
      },
      "shortLabel": {
        "en": "Cleaning and Maintenance",
        "es": "Limpieza y mantenimiento"
      },
      "synonyms": {
        "en": [
          "janitorial",
          "cleaning services",
          "pest control",
          "landscaping"
        ],
        "es": [
          "limpieza",
          "aseo",
          "fumigación",
          "jardinería"
        ]
      },
      "iconKey": "broom"
    },
    {
      "id": "waste_environmental",
      "sector": "business_facilities",
      "order": 60,
      "status": "active",
      "naics2022": [
        "562"
      ],
      "label": {
        "en": "Waste Management and Recycling",
        "es": "Gestión de residuos y reciclaje"
      },
      "shortLabel": {
        "en": "Waste and Recycling",
        "es": "Residuos y reciclaje"
      },
      "synonyms": {
        "en": [
          "waste collection",
          "recycling",
          "environmental remediation"
        ],
        "es": [
          "recolección de basuras",
          "reciclaje",
          "gestión de residuos",
          "remediación ambiental"
        ]
      },
      "iconKey": "recycle"
    },
    {
      "id": "k12_education",
      "sector": "education",
      "order": 10,
      "status": "active",
      "naics2022": [
        "6111"
      ],
      "label": {
        "en": "Primary and Secondary Education",
        "es": "Educación primaria y secundaria"
      },
      "shortLabel": {
        "en": "K-12 Education",
        "es": "Educación escolar"
      },
      "synonyms": {
        "en": [
          "school",
          "k-12",
          "teaching"
        ],
        "es": [
          "colegio",
          "escuela",
          "educación básica",
          "bachillerato",
          "docencia"
        ]
      },
      "iconKey": "school"
    },
    {
      "id": "higher_education",
      "sector": "education",
      "order": 20,
      "status": "active",
      "naics2022": [
        "6112",
        "6113"
      ],
      "label": {
        "en": "Higher Education",
        "es": "Educación superior"
      },
      "shortLabel": {
        "en": "Higher Education",
        "es": "Educación superior"
      },
      "synonyms": {
        "en": [
          "university",
          "college",
          "academia",
          "community college"
        ],
        "es": [
          "universidad",
          "institución universitaria",
          "academia"
        ]
      },
      "iconKey": "school"
    },
    {
      "id": "professional_training",
      "sector": "education",
      "order": 30,
      "status": "active",
      "naics2022": [
        "6114",
        "6115",
        "6116"
      ],
      "label": {
        "en": "Professional Training and Schools",
        "es": "Formación profesional y academias"
      },
      "shortLabel": {
        "en": "Professional Training",
        "es": "Formación profesional"
      },
      "synonyms": {
        "en": [
          "corporate training",
          "technical school",
          "language school",
          "bootcamp",
          "coaching"
        ],
        "es": [
          "capacitación",
          "formación técnica",
          "instituto de idiomas",
          "bootcamp",
          "coaching"
        ]
      },
      "iconKey": "book"
    },
    {
      "id": "education_support",
      "sector": "education",
      "order": 40,
      "status": "active",
      "naics2022": [
        "6117"
      ],
      "label": {
        "en": "Education Services and EdTech",
        "es": "Servicios educativos y edtech"
      },
      "shortLabel": {
        "en": "Education Services and EdTech",
        "es": "Servicios educativos y edtech"
      },
      "synonyms": {
        "en": [
          "edtech",
          "tutoring services",
          "educational consulting",
          "testing services"
        ],
        "es": [
          "edtech",
          "tecnología educativa",
          "asesoría educativa",
          "pruebas educativas"
        ]
      },
      "iconKey": "lightbulb"
    },
    {
      "id": "hospitals",
      "sector": "health_social",
      "order": 10,
      "status": "active",
      "naics2022": [
        "622"
      ],
      "label": {
        "en": "Hospitals and Clinics",
        "es": "Hospitales y clínicas"
      },
      "shortLabel": {
        "en": "Hospitals and Clinics",
        "es": "Hospitales y clínicas"
      },
      "synonyms": {
        "en": [
          "hospital",
          "health system",
          "medical center",
          "healthcare",
          "health care"
        ],
        "es": [
          "hospital",
          "clínica",
          "centro médico",
          "ips",
          "salud"
        ]
      },
      "iconKey": "hospital"
    },
    {
      "id": "physicians_outpatient",
      "sector": "health_social",
      "order": 20,
      "status": "active",
      "naics2022": [
        "6211",
        "6214",
        "6215",
        "6219"
      ],
      "label": {
        "en": "Medical Practices and Diagnostics",
        "es": "Consultorios médicos y diagnóstico"
      },
      "shortLabel": {
        "en": "Medical Practices",
        "es": "Consultorios médicos"
      },
      "synonyms": {
        "en": [
          "doctors office",
          "medical practice",
          "diagnostic lab",
          "imaging",
          "urgent care",
          "telemedicine",
          "healthtech"
        ],
        "es": [
          "consultorio médico",
          "atención ambulatoria",
          "laboratorio clínico",
          "imágenes diagnósticas",
          "telemedicina",
          "salud digital"
        ]
      },
      "iconKey": "stethoscope"
    },
    {
      "id": "dental",
      "sector": "health_social",
      "order": 30,
      "status": "active",
      "naics2022": [
        "6212"
      ],
      "label": {
        "en": "Dental Care",
        "es": "Odontología"
      },
      "shortLabel": {
        "en": "Dental Care",
        "es": "Odontología"
      },
      "synonyms": {
        "en": [
          "dentist",
          "orthodontics",
          "dental clinic"
        ],
        "es": [
          "dentista",
          "ortodoncia",
          "clínica dental"
        ]
      },
      "iconKey": "tooth"
    },
    {
      "id": "allied_health_mental_health",
      "sector": "health_social",
      "order": 40,
      "status": "active",
      "naics2022": [
        "6213"
      ],
      "label": {
        "en": "Mental Health and Therapy",
        "es": "Terapias y salud mental"
      },
      "shortLabel": {
        "en": "Mental Health and Therapy",
        "es": "Terapias y salud mental"
      },
      "synonyms": {
        "en": [
          "psychology",
          "therapy",
          "physical therapy",
          "optometry",
          "chiropractic",
          "nutrition"
        ],
        "es": [
          "psicología",
          "terapia",
          "fisioterapia",
          "optometría",
          "nutrición"
        ]
      },
      "iconKey": "mind"
    },
    {
      "id": "home_health",
      "sector": "health_social",
      "order": 50,
      "status": "active",
      "naics2022": [
        "6216"
      ],
      "label": {
        "en": "Home Health Care",
        "es": "Atención médica domiciliaria"
      },
      "shortLabel": {
        "en": "Home Health Care",
        "es": "Salud en casa"
      },
      "synonyms": {
        "en": [
          "home care",
          "home nursing"
        ],
        "es": [
          "atención domiciliaria",
          "enfermería a domicilio"
        ]
      },
      "iconKey": "home_care"
    },
    {
      "id": "nursing_residential_care",
      "sector": "health_social",
      "order": 60,
      "status": "active",
      "naics2022": [
        "623"
      ],
      "label": {
        "en": "Senior Living and Residential Care",
        "es": "Hogares de cuidado y geriátricos"
      },
      "shortLabel": {
        "en": "Residential Care",
        "es": "Hogares de cuidado"
      },
      "synonyms": {
        "en": [
          "senior living",
          "assisted living",
          "nursing home"
        ],
        "es": [
          "hogar geriátrico",
          "residencia de adultos mayores",
          "cuidado residencial"
        ]
      },
      "iconKey": "bed"
    },
    {
      "id": "social_assistance",
      "sector": "health_social",
      "order": 70,
      "status": "active",
      "naics2022": [
        "6241",
        "6242",
        "6243"
      ],
      "label": {
        "en": "Social and Community Services",
        "es": "Servicios sociales y comunitarios"
      },
      "shortLabel": {
        "en": "Social Services",
        "es": "Servicios sociales"
      },
      "synonyms": {
        "en": [
          "social services",
          "family services",
          "food bank",
          "vocational rehabilitation"
        ],
        "es": [
          "bienestar familiar",
          "banco de alimentos",
          "rehabilitación",
          "servicios comunitarios"
        ]
      },
      "iconKey": "hands_heart"
    },
    {
      "id": "child_care",
      "sector": "health_social",
      "order": 80,
      "status": "active",
      "naics2022": [
        "6244"
      ],
      "label": {
        "en": "Child Care",
        "es": "Cuidado infantil"
      },
      "shortLabel": {
        "en": "Child Care",
        "es": "Cuidado infantil"
      },
      "synonyms": {
        "en": [
          "daycare",
          "preschool care",
          "nursery"
        ],
        "es": [
          "jardín infantil",
          "guardería",
          "cuidado de niños"
        ]
      },
      "iconKey": "baby"
    },
    {
      "id": "performing_arts",
      "sector": "arts_recreation",
      "order": 10,
      "status": "active",
      "naics2022": [
        "7111",
        "7113",
        "7114",
        "7115"
      ],
      "label": {
        "en": "Performing Arts, Events and Artists",
        "es": "Artes escénicas, eventos y artistas"
      },
      "shortLabel": {
        "en": "Performing Arts and Events",
        "es": "Artes escénicas y eventos"
      },
      "synonyms": {
        "en": [
          "theater",
          "live events",
          "concerts",
          "event promoters",
          "artists",
          "talent agency"
        ],
        "es": [
          "teatro",
          "eventos en vivo",
          "conciertos",
          "productora de eventos",
          "artistas",
          "agencia de talentos"
        ]
      },
      "iconKey": "masks"
    },
    {
      "id": "spectator_sports",
      "sector": "arts_recreation",
      "order": 20,
      "status": "active",
      "naics2022": [
        "7112"
      ],
      "label": {
        "en": "Professional Sports",
        "es": "Deporte profesional"
      },
      "shortLabel": {
        "en": "Professional Sports",
        "es": "Deporte profesional"
      },
      "synonyms": {
        "en": [
          "sports teams",
          "athletes",
          "sports clubs",
          "racing",
          "sports"
        ],
        "es": [
          "equipos deportivos",
          "deportistas",
          "clubes deportivos",
          "deportes"
        ]
      },
      "iconKey": "trophy"
    },
    {
      "id": "museums_heritage",
      "sector": "arts_recreation",
      "order": 30,
      "status": "active",
      "naics2022": [
        "712"
      ],
      "label": {
        "en": "Museums, Heritage, Zoos and Parks",
        "es": "Museos, patrimonio, zoológicos y parques"
      },
      "shortLabel": {
        "en": "Museums and Heritage",
        "es": "Museos y patrimonio"
      },
      "synonyms": {
        "en": [
          "museum",
          "art gallery",
          "zoo",
          "botanical garden",
          "national park"
        ],
        "es": [
          "museo",
          "galería de arte",
          "zoológico",
          "jardín botánico",
          "parque nacional"
        ]
      },
      "iconKey": "museum"
    },
    {
      "id": "gambling",
      "sector": "arts_recreation",
      "order": 40,
      "status": "active",
      "naics2022": [
        "7132"
      ],
      "label": {
        "en": "Casinos and Gambling",
        "es": "Casinos y juegos de azar"
      },
      "shortLabel": {
        "en": "Casinos and Gambling",
        "es": "Casinos y juegos de azar"
      },
      "synonyms": {
        "en": [
          "casino",
          "betting",
          "lottery",
          "gambling"
        ],
        "es": [
          "casino",
          "apuestas",
          "lotería"
        ]
      },
      "iconKey": "dice"
    },
    {
      "id": "fitness_recreation",
      "sector": "arts_recreation",
      "order": 50,
      "status": "active",
      "naics2022": [
        "7131",
        "7139"
      ],
      "label": {
        "en": "Fitness and Recreation",
        "es": "Gimnasios y recreación"
      },
      "shortLabel": {
        "en": "Fitness and Recreation",
        "es": "Gimnasios y recreación"
      },
      "synonyms": {
        "en": [
          "gym",
          "fitness center",
          "golf",
          "amusement park",
          "recreation"
        ],
        "es": [
          "gimnasio",
          "centro deportivo",
          "golf",
          "parque de diversiones",
          "recreación"
        ]
      },
      "iconKey": "dumbbell"
    },
    {
      "id": "accommodation",
      "sector": "hospitality_food",
      "order": 10,
      "status": "active",
      "naics2022": [
        "721"
      ],
      "label": {
        "en": "Hotels and Lodging",
        "es": "Hoteles y alojamiento"
      },
      "shortLabel": {
        "en": "Hotels and Lodging",
        "es": "Hoteles y alojamiento"
      },
      "synonyms": {
        "en": [
          "hotel",
          "hospitality",
          "resort",
          "hostel",
          "vacation rental"
        ],
        "es": [
          "hotel",
          "hotelería",
          "hospedaje",
          "resort",
          "hostal"
        ]
      },
      "iconKey": "hotel"
    },
    {
      "id": "restaurants_food_service",
      "sector": "hospitality_food",
      "order": 20,
      "status": "active",
      "naics2022": [
        "722"
      ],
      "label": {
        "en": "Restaurants, Bars and Catering",
        "es": "Restaurantes, bares y catering"
      },
      "shortLabel": {
        "en": "Restaurants, Bars and Catering",
        "es": "Restaurantes, bares y catering"
      },
      "synonyms": {
        "en": [
          "restaurant",
          "cafe",
          "coffee",
          "coffee shop",
          "bar",
          "catering",
          "food truck"
        ],
        "es": [
          "restaurante",
          "café",
          "bar",
          "catering",
          "gastronomía"
        ]
      },
      "iconKey": "restaurant"
    },
    {
      "id": "auto_repair",
      "sector": "personal_services",
      "order": 10,
      "status": "active",
      "naics2022": [
        "8111"
      ],
      "label": {
        "en": "Auto Repair and Maintenance",
        "es": "Talleres y mantenimiento automotriz"
      },
      "shortLabel": {
        "en": "Auto Repair",
        "es": "Talleres automotrices"
      },
      "synonyms": {
        "en": [
          "auto repair",
          "car wash",
          "mechanic"
        ],
        "es": [
          "taller mecánico",
          "lavadero de autos",
          "mecánica automotriz"
        ]
      },
      "iconKey": "wrench"
    },
    {
      "id": "equipment_repair",
      "sector": "personal_services",
      "order": 20,
      "status": "active",
      "naics2022": [
        "8112",
        "8113",
        "8114"
      ],
      "label": {
        "en": "Equipment and Electronics Repair",
        "es": "Reparación de equipos y electrónica"
      },
      "shortLabel": {
        "en": "Repair Services",
        "es": "Servicios de reparación"
      },
      "synonyms": {
        "en": [
          "electronics repair",
          "appliance repair",
          "machinery repair"
        ],
        "es": [
          "reparación de electrónica",
          "reparación de electrodomésticos",
          "mantenimiento de equipos"
        ]
      },
      "iconKey": "screwdriver"
    },
    {
      "id": "personal_care_services",
      "sector": "personal_services",
      "order": 30,
      "status": "active",
      "naics2022": [
        "8121"
      ],
      "label": {
        "en": "Beauty and Personal Care",
        "es": "Belleza y cuidado personal"
      },
      "shortLabel": {
        "en": "Beauty and Personal Care",
        "es": "Belleza y cuidado personal"
      },
      "synonyms": {
        "en": [
          "salon",
          "barber",
          "spa",
          "nail salon"
        ],
        "es": [
          "salón de belleza",
          "peluquería",
          "barbería",
          "spa",
          "estética"
        ]
      },
      "iconKey": "scissors"
    },
    {
      "id": "death_care",
      "sector": "personal_services",
      "order": 40,
      "status": "active",
      "naics2022": [
        "8122"
      ],
      "label": {
        "en": "Funeral Services",
        "es": "Servicios funerarios"
      },
      "shortLabel": {
        "en": "Funeral Services",
        "es": "Servicios funerarios"
      },
      "synonyms": {
        "en": [
          "funeral home",
          "cemetery"
        ],
        "es": [
          "funeraria",
          "cementerio",
          "servicios exequiales"
        ]
      },
      "iconKey": "candle"
    },
    {
      "id": "other_personal_services",
      "sector": "personal_services",
      "order": 50,
      "status": "active",
      "naics2022": [
        "8123",
        "8129",
        "814"
      ],
      "label": {
        "en": "Laundry, Pet Care and Personal Services",
        "es": "Lavandería, mascotas y otros servicios"
      },
      "shortLabel": {
        "en": "Personal Services",
        "es": "Servicios personales"
      },
      "synonyms": {
        "en": [
          "laundromat",
          "dry cleaner",
          "pet grooming",
          "pet sitting",
          "parking",
          "household services",
          "wedding planning"
        ],
        "es": [
          "lavandería",
          "tintorería",
          "peluquería canina",
          "cuidado de mascotas",
          "estacionamientos",
          "parqueadero",
          "servicio doméstico",
          "bodas",
          "organización de bodas"
        ]
      },
      "iconKey": "laundry"
    },
    {
      "id": "nonprofit_civic",
      "sector": "community_nonprofit",
      "order": 10,
      "status": "active",
      "naics2022": [
        "8132",
        "8133"
      ],
      "label": {
        "en": "Nonprofits, Foundations and Advocacy",
        "es": "ONG, fundaciones y causas sociales"
      },
      "shortLabel": {
        "en": "Nonprofits",
        "es": "ONG y fundaciones"
      },
      "synonyms": {
        "en": [
          "ngo",
          "charity",
          "foundation",
          "philanthropy",
          "advocacy",
          "nonprofit"
        ],
        "es": [
          "ong",
          "fundación",
          "filantropía",
          "sin fines de lucro",
          "sin ánimo de lucro"
        ]
      },
      "iconKey": "handshake"
    },
    {
      "id": "religious_organizations",
      "sector": "community_nonprofit",
      "order": 20,
      "status": "active",
      "naics2022": [
        "8131"
      ],
      "label": {
        "en": "Religious Organizations",
        "es": "Organizaciones religiosas"
      },
      "shortLabel": {
        "en": "Religious Organizations",
        "es": "Organizaciones religiosas"
      },
      "synonyms": {
        "en": [
          "church",
          "faith-based organization",
          "religious ministry"
        ],
        "es": [
          "iglesia",
          "organización religiosa",
          "comunidad de fe"
        ]
      },
      "iconKey": "place_of_worship"
    },
    {
      "id": "associations_unions",
      "sector": "community_nonprofit",
      "order": 30,
      "status": "active",
      "naics2022": [
        "8134",
        "8139"
      ],
      "label": {
        "en": "Associations, Chambers and Unions",
        "es": "Asociaciones, gremios y sindicatos"
      },
      "shortLabel": {
        "en": "Associations and Unions",
        "es": "Gremios y sindicatos"
      },
      "synonyms": {
        "en": [
          "professional association",
          "trade association",
          "chamber of commerce",
          "labor union",
          "political organization"
        ],
        "es": [
          "asociación profesional",
          "gremio",
          "cámara de comercio",
          "sindicato",
          "organización política"
        ]
      },
      "iconKey": "people_group"
    },
    {
      "id": "government_administration",
      "sector": "public_administration",
      "order": 10,
      "status": "active",
      "naics2022": [
        "921",
        "923",
        "924",
        "925",
        "926",
        "927"
      ],
      "label": {
        "en": "Government and Public Programs",
        "es": "Gobierno y programas públicos"
      },
      "shortLabel": {
        "en": "Government",
        "es": "Gobierno"
      },
      "synonyms": {
        "en": [
          "government",
          "public sector",
          "municipality",
          "legislature",
          "public policy",
          "space agency"
        ],
        "es": [
          "gobierno",
          "sector público",
          "alcaldía",
          "ministerio",
          "política pública",
          "agencia espacial"
        ]
      },
      "iconKey": "government"
    },
    {
      "id": "justice_public_safety",
      "sector": "public_administration",
      "order": 20,
      "status": "active",
      "naics2022": [
        "922"
      ],
      "label": {
        "en": "Justice, Police and Public Safety",
        "es": "Justicia, policía y seguridad pública"
      },
      "shortLabel": {
        "en": "Justice and Public Safety",
        "es": "Justicia y seguridad"
      },
      "synonyms": {
        "en": [
          "courts",
          "police",
          "fire department",
          "corrections"
        ],
        "es": [
          "justicia",
          "juzgados",
          "policía",
          "bomberos",
          "fiscalía"
        ]
      },
      "iconKey": "badge"
    },
    {
      "id": "defense_international_affairs",
      "sector": "public_administration",
      "order": 30,
      "status": "active",
      "naics2022": [
        "928"
      ],
      "label": {
        "en": "Defense and International Affairs",
        "es": "Defensa y relaciones internacionales"
      },
      "shortLabel": {
        "en": "Defense and Diplomacy",
        "es": "Defensa y diplomacia"
      },
      "synonyms": {
        "en": [
          "military",
          "armed forces",
          "defense",
          "diplomacy",
          "foreign service"
        ],
        "es": [
          "fuerzas militares",
          "ejército",
          "defensa nacional",
          "diplomacia",
          "cancillería"
        ]
      },
      "iconKey": "flag"
    }
  ],
  "iconKeys": [
    {
      "key": "generic",
      "material": "domain",
      "ionicons": "business-outline"
    },
    {
      "key": "sprout",
      "material": "sprout",
      "ionicons": "leaf-outline"
    },
    {
      "key": "cow",
      "material": "cow",
      "ionicons": "leaf-outline"
    },
    {
      "key": "tree",
      "material": "pine-tree",
      "ionicons": "leaf-outline"
    },
    {
      "key": "fish",
      "material": "fish",
      "ionicons": "fish-outline"
    },
    {
      "key": "tractor",
      "material": "tractor",
      "ionicons": "leaf-outline"
    },
    {
      "key": "barrel",
      "material": "barrel",
      "ionicons": "hammer-outline"
    },
    {
      "key": "pickaxe",
      "material": "pickaxe",
      "ionicons": "hammer-outline"
    },
    {
      "key": "bolt",
      "material": "lightning-bolt",
      "ionicons": "flash-outline"
    },
    {
      "key": "water",
      "material": "water",
      "ionicons": "water-outline"
    },
    {
      "key": "crane",
      "material": "crane",
      "ionicons": "construct-outline"
    },
    {
      "key": "road",
      "material": "road-variant",
      "ionicons": "trail-sign-outline"
    },
    {
      "key": "tools",
      "material": "hammer-wrench",
      "ionicons": "build-outline"
    },
    {
      "key": "food",
      "material": "food-apple",
      "ionicons": "nutrition-outline"
    },
    {
      "key": "drink",
      "material": "glass-cocktail",
      "ionicons": "wine-outline"
    },
    {
      "key": "shirt",
      "material": "tshirt-crew",
      "ionicons": "shirt-outline"
    },
    {
      "key": "paper",
      "material": "paper-roll",
      "ionicons": "document-outline"
    },
    {
      "key": "printer",
      "material": "printer",
      "ionicons": "print-outline"
    },
    {
      "key": "flask",
      "material": "flask",
      "ionicons": "flask-outline"
    },
    {
      "key": "pill",
      "material": "pill",
      "ionicons": "medkit-outline"
    },
    {
      "key": "cube",
      "material": "cube-outline",
      "ionicons": "cube-outline"
    },
    {
      "key": "bricks",
      "material": "wall",
      "ionicons": "grid-outline"
    },
    {
      "key": "anvil",
      "material": "anvil",
      "ionicons": "hammer-outline"
    },
    {
      "key": "gear",
      "material": "cog",
      "ionicons": "cog-outline"
    },
    {
      "key": "chip",
      "material": "chip",
      "ionicons": "hardware-chip-outline"
    },
    {
      "key": "plug",
      "material": "power-plug",
      "ionicons": "flash-outline"
    },
    {
      "key": "car",
      "material": "car",
      "ionicons": "car-outline"
    },
    {
      "key": "airplane",
      "material": "airplane",
      "ionicons": "airplane-outline"
    },
    {
      "key": "sofa",
      "material": "sofa",
      "ionicons": "bed-outline"
    },
    {
      "key": "medical_bag",
      "material": "medical-bag",
      "ionicons": "medkit-outline"
    },
    {
      "key": "factory",
      "material": "factory",
      "ionicons": "business-outline"
    },
    {
      "key": "boxes",
      "material": "package-variant-closed",
      "ionicons": "cube-outline"
    },
    {
      "key": "car_key",
      "material": "car-key",
      "ionicons": "key-outline"
    },
    {
      "key": "tv",
      "material": "television",
      "ionicons": "tv-outline"
    },
    {
      "key": "hammer",
      "material": "hammer",
      "ionicons": "hammer-outline"
    },
    {
      "key": "basket",
      "material": "basket",
      "ionicons": "basket-outline"
    },
    {
      "key": "fuel",
      "material": "gas-station",
      "ionicons": "speedometer-outline"
    },
    {
      "key": "bag",
      "material": "shopping",
      "ionicons": "bag-handle-outline"
    },
    {
      "key": "gift",
      "material": "gift",
      "ionicons": "gift-outline"
    },
    {
      "key": "storefront",
      "material": "storefront",
      "ionicons": "storefront-outline"
    },
    {
      "key": "train",
      "material": "train",
      "ionicons": "train-outline"
    },
    {
      "key": "ship",
      "material": "ferry",
      "ionicons": "boat-outline"
    },
    {
      "key": "truck",
      "material": "truck",
      "ionicons": "bus-outline"
    },
    {
      "key": "bus",
      "material": "bus",
      "ionicons": "bus-outline"
    },
    {
      "key": "route",
      "material": "transit-connection-variant",
      "ionicons": "git-network-outline"
    },
    {
      "key": "package",
      "material": "package-variant",
      "ionicons": "cube-outline"
    },
    {
      "key": "warehouse",
      "material": "warehouse",
      "ionicons": "file-tray-stacked-outline"
    },
    {
      "key": "film",
      "material": "filmstrip",
      "ionicons": "film-outline"
    },
    {
      "key": "newspaper",
      "material": "newspaper-variant",
      "ionicons": "newspaper-outline"
    },
    {
      "key": "code",
      "material": "code-braces",
      "ionicons": "code-slash-outline"
    },
    {
      "key": "broadcast",
      "material": "broadcast",
      "ionicons": "radio-outline"
    },
    {
      "key": "antenna",
      "material": "antenna",
      "ionicons": "cellular-outline"
    },
    {
      "key": "bank",
      "material": "bank",
      "ionicons": "cash-outline"
    },
    {
      "key": "chart",
      "material": "chart-line",
      "ionicons": "trending-up-outline"
    },
    {
      "key": "shield",
      "material": "shield-check",
      "ionicons": "shield-checkmark-outline"
    },
    {
      "key": "house",
      "material": "home-city",
      "ionicons": "home-outline"
    },
    {
      "key": "key",
      "material": "key",
      "ionicons": "key-outline"
    },
    {
      "key": "gavel",
      "material": "gavel",
      "ionicons": "hammer-outline"
    },
    {
      "key": "calculator",
      "material": "calculator",
      "ionicons": "calculator-outline"
    },
    {
      "key": "ruler",
      "material": "ruler-square",
      "ionicons": "resize-outline"
    },
    {
      "key": "palette",
      "material": "palette",
      "ionicons": "color-palette-outline"
    },
    {
      "key": "laptop",
      "material": "laptop",
      "ionicons": "laptop-outline"
    },
    {
      "key": "briefcase",
      "material": "briefcase",
      "ionicons": "briefcase-outline"
    },
    {
      "key": "microscope",
      "material": "microscope",
      "ionicons": "flask-outline"
    },
    {
      "key": "megaphone",
      "material": "bullhorn",
      "ionicons": "megaphone-outline"
    },
    {
      "key": "camera",
      "material": "camera",
      "ionicons": "camera-outline"
    },
    {
      "key": "language",
      "material": "translate",
      "ionicons": "language-outline"
    },
    {
      "key": "paw",
      "material": "paw",
      "ionicons": "paw-outline"
    },
    {
      "key": "clipboard",
      "material": "clipboard-text",
      "ionicons": "clipboard-outline"
    },
    {
      "key": "headset",
      "material": "headset",
      "ionicons": "headset-outline"
    },
    {
      "key": "people",
      "material": "account-search",
      "ionicons": "person-add-outline"
    },
    {
      "key": "suitcase",
      "material": "bag-suitcase",
      "ionicons": "airplane-outline"
    },
    {
      "key": "lock",
      "material": "shield-lock",
      "ionicons": "lock-closed-outline"
    },
    {
      "key": "broom",
      "material": "broom",
      "ionicons": "sparkles-outline"
    },
    {
      "key": "recycle",
      "material": "recycle",
      "ionicons": "reload-outline"
    },
    {
      "key": "school",
      "material": "school",
      "ionicons": "school-outline"
    },
    {
      "key": "book",
      "material": "book-open-variant",
      "ionicons": "book-outline"
    },
    {
      "key": "lightbulb",
      "material": "lightbulb-on",
      "ionicons": "bulb-outline"
    },
    {
      "key": "hospital",
      "material": "hospital-building",
      "ionicons": "medical-outline"
    },
    {
      "key": "stethoscope",
      "material": "stethoscope",
      "ionicons": "pulse-outline"
    },
    {
      "key": "tooth",
      "material": "tooth",
      "ionicons": "medical-outline"
    },
    {
      "key": "mind",
      "material": "head-heart",
      "ionicons": "heart-circle-outline"
    },
    {
      "key": "home_care",
      "material": "home-heart",
      "ionicons": "home-outline"
    },
    {
      "key": "bed",
      "material": "bed",
      "ionicons": "bed-outline"
    },
    {
      "key": "hands_heart",
      "material": "hand-heart",
      "ionicons": "hand-left-outline"
    },
    {
      "key": "baby",
      "material": "baby-carriage",
      "ionicons": "pulse-outline"
    },
    {
      "key": "masks",
      "material": "drama-masks",
      "ionicons": "color-wand-outline"
    },
    {
      "key": "trophy",
      "material": "trophy",
      "ionicons": "trophy-outline"
    },
    {
      "key": "museum",
      "material": "pillar",
      "ionicons": "library-outline"
    },
    {
      "key": "dice",
      "material": "dice-5",
      "ionicons": "dice-outline"
    },
    {
      "key": "dumbbell",
      "material": "dumbbell",
      "ionicons": "barbell-outline"
    },
    {
      "key": "hotel",
      "material": "bed-king",
      "ionicons": "bed-outline"
    },
    {
      "key": "restaurant",
      "material": "silverware-fork-knife",
      "ionicons": "restaurant-outline"
    },
    {
      "key": "wrench",
      "material": "wrench",
      "ionicons": "build-outline"
    },
    {
      "key": "screwdriver",
      "material": "screwdriver",
      "ionicons": "construct-outline"
    },
    {
      "key": "scissors",
      "material": "content-cut",
      "ionicons": "cut-outline"
    },
    {
      "key": "candle",
      "material": "candle",
      "ionicons": "flame-outline"
    },
    {
      "key": "laundry",
      "material": "washing-machine",
      "ionicons": "shirt-outline"
    },
    {
      "key": "place_of_worship",
      "material": "church",
      "ionicons": "people-circle-outline"
    },
    {
      "key": "handshake",
      "material": "handshake",
      "ionicons": "people-circle-outline"
    },
    {
      "key": "people_group",
      "material": "account-group",
      "ionicons": "people-outline"
    },
    {
      "key": "government",
      "material": "town-hall",
      "ionicons": "business-outline"
    },
    {
      "key": "badge",
      "material": "police-badge",
      "ionicons": "shield-outline"
    },
    {
      "key": "flag",
      "material": "flag",
      "ionicons": "flag-outline"
    }
  ]
};
