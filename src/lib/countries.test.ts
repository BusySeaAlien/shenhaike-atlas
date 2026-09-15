import { describe, expect, it } from "vitest";
import { COUNTRY_OPTIONS, countryCodeForName, isCountryName } from "./countries";

describe("country options", () => {
  it("puts China first and exposes Chinese labels", () => {
    expect(COUNTRY_OPTIONS[0]).toMatchObject({ code: "CHN", name: "China", nameZh: "中国" });
  });

  it("sorts the remaining Chinese names by pinyin", () => {
    const collator = new Intl.Collator("zh-CN-u-co-pinyin");
    const names = COUNTRY_OPTIONS.slice(1).map((country) => country.nameZh);
    expect(names).toEqual([...names].sort(collator.compare));
  });

  it("recognizes only values offered by the selector", () => {
    expect(isCountryName("France")).toBe(true);
    expect(isCountryName("Not a country")).toBe(false);
    expect(countryCodeForName("France")).toBe("FRA");
  });
});
