import en from "i18n-iso-countries/langs/en.json";
import zh from "i18n-iso-countries/langs/zh.json";

export interface CountryOption {
  code: string;
  name: string;
  nameZh: string;
}

const collator = new Intl.Collator("zh-CN-u-co-pinyin");

function localizedName(locale: typeof en | typeof zh, code: string): string {
  const value = locale.countries[code as keyof typeof locale.countries];
  if (Array.isArray(value)) return value[1] || value[0] || code;
  return value || code;
}

export const COUNTRY_OPTIONS: CountryOption[] = Object.keys(en.countries)
  .map((alpha2) => ({
    code: alpha2,
    name: localizedName(en, alpha2),
    nameZh: localizedName(zh, alpha2),
  }))
  .sort((left, right) => {
    if (left.code === "CN") return -1;
    if (right.code === "CN") return 1;
    return collator.compare(left.nameZh, right.nameZh);
  });

const COUNTRY_NAMES = new Set(COUNTRY_OPTIONS.map((country) => country.name));

export function isCountryName(value: string): boolean {
  return COUNTRY_NAMES.has(value);
}
