import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import zh from "i18n-iso-countries/langs/zh.json";

countries.registerLocale(en);
countries.registerLocale(zh);

export interface CountryOption {
  code: string;
  name: string;
  nameZh: string;
}

const collator = new Intl.Collator("zh-CN-u-co-pinyin");

export const COUNTRY_OPTIONS: CountryOption[] = Object.keys(countries.getAlpha2Codes())
  .map((alpha2) => ({
    code: countries.alpha2ToAlpha3(alpha2) || alpha2,
    name: countries.getName(alpha2, "en", { select: "alias" }) || alpha2,
    nameZh: countries.getName(alpha2, "zh", { select: "alias" })
      || countries.getName(alpha2, "en", { select: "alias" })
      || alpha2,
  }))
  .sort((left, right) => {
    if (left.code === "CHN") return -1;
    if (right.code === "CHN") return 1;
    return collator.compare(left.nameZh, right.nameZh);
  });

const COUNTRY_NAMES = new Set(COUNTRY_OPTIONS.map((country) => country.name));

export function isCountryName(value: string): boolean {
  return COUNTRY_NAMES.has(value);
}
