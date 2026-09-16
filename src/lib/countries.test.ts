import { describe, expect, it } from "vitest";
import { COUNTRY_OPTIONS, countryCodeForName, isCountryName } from "./countries";
import worldAdmin0 from "./map/administrative/data/world-admin0-v2.json";

/**
 * Ids the world layer carries that the place form does not offer.
 *
 * Natural Earth keys the layer on `ADM0_A3`, which is not ISO 3166-1. Kosovo
 * (KOS), N. Cyprus (CYN) and Somaliland (SOL) have no ISO code at all; three
 * more disagree with ISO on the code itself — Palestine (PSX/PSE), Western
 * Sahara (SAH/ESH) and South Sudan (SDS/SSD). For these, `places.ts` compares
 * the form's ISO code against the resolver's and rejects the save.
 *
 * The generator admits only ISO-matching ids from the supplement, so this list
 * should not grow. If it does, a Natural Earth refresh changed something and
 * needs a decision rather than a silent pass.
 */
const KNOWN_NON_ISO_IDS = ["CYN", "KOS", "PSX", "SAH", "SDS", "SOL"];

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

  it("agrees with every id the world layer can resolve to", () => {
    const offered = new Set(COUNTRY_OPTIONS.map((country) => country.code));
    const unoffered = worldAdmin0.features
      .map((feature) => feature.id)
      .filter((id) => !offered.has(id))
      .sort();
    expect(unoffered).toEqual([...KNOWN_NON_ISO_IDS].sort());

    // The China override owns these; separate features would render twice.
    const ids = worldAdmin0.features.map((feature) => feature.id);
    expect(ids).toContain("CHN");
    for (const code of ["TWN", "HKG", "MAC"]) {
      expect(ids).not.toContain(code);
    }
  });
});
