/** Shape of the Functions industry catalog (INDUSTRY_CONTRACT.md §1). */
export type IndustryLang = 'en' | 'es';
export type Localized = { en: string; es: string };

export type IndustrySector = {
  id: string;
  order: number;
  naics2022: string[];
  label: Localized;
  iconKey: string;
};

export type IndustryItem = {
  id: string;
  sector: string;
  order: number;
  status: 'active' | 'retired';
  replacedBy?: string;
  naics2022: string[];
  label: Localized;
  shortLabel: Localized;
  synonyms: { en: string[]; es: string[] };
  iconKey: string;
};

export type IndustryIconKey = { key: string; material: string; ionicons: string };

export type IndustryCatalogData = {
  catalog: string;
  version: number;
  status: string;
  source: string;
  idPattern: string;
  limits: { label: number; shortLabel: number };
  fallbackIconKey: string;
  sectors: IndustrySector[];
  industries: IndustryItem[];
  iconKeys: IndustryIconKey[];
};
