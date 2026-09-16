import { describe, expect, it } from "vitest";
import { resolveAdministrativeLocation } from "./location";
import { getVisitedChinaRegions, getVisitedCountries, countByCode } from "./footprint";

describe("resolveAdministrativeLocation", () => {
  it("resolves Chinese cities to their province", () => {
    expect(resolveAdministrativeLocation(121.4737, 31.2304)).toEqual({
      sovereignCountryCode: "CHN",
      admin1Code: "310000", // 上海市
    });
    expect(resolveAdministrativeLocation(87.6168, 43.8256)).toEqual({
      sovereignCountryCode: "CHN",
      admin1Code: "650000", // 新疆维吾尔自治区
    });
    expect(resolveAdministrativeLocation(116.4074, 39.9042)).toEqual({
      sovereignCountryCode: "CHN",
      admin1Code: "110000", // 北京市
    });
  });

  it("keeps Hong Kong, Macau and Taiwan as CHN provinces (§28)", () => {
    expect(resolveAdministrativeLocation(114.1694, 22.3193)).toEqual({
      sovereignCountryCode: "CHN",
      admin1Code: "810000",
    });
    expect(resolveAdministrativeLocation(113.5439, 22.1987)).toEqual({
      sovereignCountryCode: "CHN",
      admin1Code: "820000",
    });
    expect(resolveAdministrativeLocation(121.5654, 25.033)).toEqual({
      sovereignCountryCode: "CHN",
      admin1Code: "710000",
    });
  });

  it("resolves non-Chinese places to a country and no province", () => {
    expect(resolveAdministrativeLocation(2.3522, 48.8566)).toEqual({
      sovereignCountryCode: "FRA",
      admin1Code: null,
    });
    expect(resolveAdministrativeLocation(139.6917, 35.6895)).toEqual({
      sovereignCountryCode: "JPN",
      admin1Code: null,
    });
  });

  it("resolves small states the 110m layer omits", () => {
    // Natural Earth 110m has no Singapore polygon at all, so Malaysia's outline
    // used to claim its coordinates. The state now arrives from the 50m
    // supplement, and `index()` ranks the smaller box first so it wins.
    expect(resolveAdministrativeLocation(103.8198, 1.3521)).toEqual({
      sovereignCountryCode: "SGP",
      admin1Code: null,
    });
    expect(resolveAdministrativeLocation(103.9915, 1.3644)).toEqual({
      sovereignCountryCode: "SGP",
      admin1Code: null,
    });
    expect(resolveAdministrativeLocation(14.5146, 35.8989)).toEqual({
      sovereignCountryCode: "MLT",
      admin1Code: null,
    });
    // These three sit geometrically inside a larger 110m neighbour, so they are
    // the cases the bbox-area ordering in `index()` exists for — with file
    // order they would resolve to ITA, AUT and FRA respectively.
    expect(resolveAdministrativeLocation(12.4578, 43.9424)).toEqual({
      sovereignCountryCode: "SMR", // San Marino, inside Italy
      admin1Code: null,
    });
    expect(resolveAdministrativeLocation(9.5215, 47.141)).toEqual({
      sovereignCountryCode: "LIE", // Vaduz, inside Austria's outline
      admin1Code: null,
    });
    expect(resolveAdministrativeLocation(1.5218, 42.5075)).toEqual({
      sovereignCountryCode: "AND", // Andorra la Vella
      admin1Code: null,
    });
    // Johor Bahru sits just across the strait: ranking by specificity must not
    // let Singapore's polygon capture the mainland beside it.
    expect(resolveAdministrativeLocation(103.74, 1.49)).toEqual({
      sovereignCountryCode: "MYS",
      admin1Code: null,
    });
  });

  it("returns nulls rather than guessing at sea (§56)", () => {
    expect(resolveAdministrativeLocation(150, 30)).toEqual({
      sovereignCountryCode: null,
      admin1Code: null,
    });
    expect(resolveAdministrativeLocation(Number.NaN, 30)).toEqual({
      sovereignCountryCode: null,
      admin1Code: null,
    });
  });
});

describe("Footprint visited sets", () => {
  it("counts distinct sovereign countries (§97)", () => {
    const visited = getVisitedCountries([
      { sovereignCountryCode: "CHN", admin1Code: "650000" },
      { sovereignCountryCode: "FRA", admin1Code: null },
      { sovereignCountryCode: "CHN", admin1Code: "310000" },
      { sovereignCountryCode: "USA", admin1Code: null },
      { sovereignCountryCode: null, admin1Code: null },
    ]);
    expect([...visited].sort()).toEqual(["CHN", "FRA", "USA"]);
  });

  it("counts distinct Chinese provinces and ignores everything else (§98)", () => {
    const visited = getVisitedChinaRegions([
      { sovereignCountryCode: "CHN", admin1Code: "650000" },
      { sovereignCountryCode: "CHN", admin1Code: "310000" },
      { sovereignCountryCode: "FRA", admin1Code: null },
      { sovereignCountryCode: "CHN", admin1Code: "650000" },
      { sovereignCountryCode: "CHN", admin1Code: null },
    ]);
    expect([...visited].sort()).toEqual(["310000", "650000"]);
  });

  it("counts places per code for hover (§80)", () => {
    const counts = countByCode(
      [
        { sovereignCountryCode: "CHN", admin1Code: "650000" },
        { sovereignCountryCode: "CHN", admin1Code: "650000" },
        { sovereignCountryCode: "CHN", admin1Code: "310000" },
      ],
      (point) => point.admin1Code,
    );
    expect(counts.get("650000")).toBe(2);
    expect(counts.get("310000")).toBe(1);
  });
});
