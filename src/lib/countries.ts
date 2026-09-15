import en from "i18n-iso-countries/langs/en.json";
import zh from "i18n-iso-countries/langs/zh.json";
import isoCodes from "i18n-iso-countries/codes.json";

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

const alpha3ByAlpha2 = new Map(isoCodes.map(([alpha2, alpha3]) => [alpha2, alpha3]));

export const COUNTRY_OPTIONS: CountryOption[] = Object.keys(en.countries)
  .filter((alpha2) => alpha3ByAlpha2.has(alpha2))
  .map((alpha2) => ({
    code: alpha3ByAlpha2.get(alpha2)!,
    name: localizedName(en, alpha2),
    nameZh: localizedName(zh, alpha2),
  }))
  .sort((left, right) => {
    if (left.code === "CHN") return -1;
    if (right.code === "CHN") return 1;
    return collator.compare(left.nameZh, right.nameZh);
  });

const COUNTRY_NAMES = new Set(COUNTRY_OPTIONS.map((country) => country.name));
const COUNTRY_CODES_BY_NAME = new Map(COUNTRY_OPTIONS.map((country) => [country.name, country.code]));

export function isCountryName(value: string): boolean {
  return COUNTRY_NAMES.has(value);
}

export function countryCodeForName(value: string): string | null {
  return COUNTRY_CODES_BY_NAME.get(value) || null;
}
