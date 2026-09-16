# Atlas Administrative Footprint Dataset

Static administrative geometry for the pre-home Footprint view. **No visited
state is stored here** — that lives in D1 (`places.sovereign_country_code`,
`places.admin1_code`) and is applied at runtime with MapLibre `feature-state`.

Atlas CRS: EPSG:4326 (WGS84), `[longitude, latitude]`.

## Files

| File | Features | Vertices | Size | Purpose |
| --- | --- | --- | --- | --- |
| `world-admin0-v2.json` | 235 | 12,592 | 301.2 KB | World Footprint fill |
| `china-admin0-polygon-v1.json` | 1 | 642 | 13.1 KB | China fill + World CHN override |
| `china-admin1-v1.json` | 34 | 22,325 | 456.3 KB | China Footprint fill |
| `china-admin1-internal-border-v1.json` | 76 segments | 7,882 | 158.9 KB | Province outlines |
| **total** | | | **930 KB** | all lazily loaded |

## Sources

### World — Natural Earth

| | |
| --- | --- |
| Product | Admin 0 – Countries |
| Scale | 110m |
| URL | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson` |
| Downloaded | 2026-09-14 |
| License | Public domain (Natural Earth imposes no restrictions) |
| Original CRS | EPSG:4326 |
| Local copy | `data-source/ne_110m_admin_0_countries.geojson` (git-ignored, 820 KB) |

> **Version is not pinned.** The file was taken from the `master` branch, not a
> release tag. Re-downloading later can silently change geometry or fields.
> If this dataset is refreshed, re-run §41 checks — especially the `ISO_A3`
> sentinel behaviour described below — before committing.

110m was chosen for the global overview zooms (handoff §37/§38), and stays the
base layer for every country it covers. It does **not** cover small states at
all, so 50m is used as a supplement — see below.

### World supplement — Natural Earth 50m

| | |
| --- | --- |
| Product | Admin 0 – Countries |
| Scale | 50m |
| URL | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson` |
| Downloaded | 2026-09-16 |
| License | Public domain (Natural Earth imposes no restrictions) |
| Original CRS | EPSG:4326 |
| Local copy | `data-source/ne_50m_admin_0_countries.geojson` (git-ignored, 3.0 MB) |

Used additively, never as a replacement. Switching the base layer to 50m would
take the existing countries from 11,047 to ~97,839 vertices (>2 MB), which
trips the generator's own 1 MB guard and changes the coastline weight at global
zoom. The supplement contributes only the states 110m lacks: 59 features,
1,545 vertices.

### China — 自然资源部 authorised county dataset

| | |
| --- | --- |
| Product | 中国县级行政区域矢量数据（exact product name pending confirmation） |
| Provider | 自然资源部官方渠道（全国地理信息资源目录服务系统 / 天地图数据资源中心） |
| Downloaded | 2026-09-14 |
| Original CRS | `urn:ogc:def:crs:EPSG::4490` (CGCS2000), declared by the source file |
| Local copy | `data-source/中国_县.geojson` (git-ignored, 9.5 MB) |

Same source as `src/lib/map/boundaries/data/` — one trusted geometry line for
China, per handoff §30.

## Conversion

```sh
pnpm data:china-administrative     # 3 China files, from the county source
pnpm data:world-administrative     # 1 world file, from Natural Earth + China override
```

Both scripts read only from `data-source/` and never download anything, so a
plain `pnpm build` stays offline (§81).

Geometry work is delegated to mapshaper via the shared `scripts/lib/china-source.mjs`.

## Feature IDs

`Feature.id` drives MapLibre `feature-state`, so it must be stable and unique.

| Layer | `Feature.id` |
| --- | --- |
| World | Natural Earth `ADM0_A3` |
| China Admin0 | `CHN` |
| China Admin1 | six-digit GB/T 2260 code, e.g. `650000` |

### Why `ADM0_A3` and not `ISO_A3`

Verified against the downloaded file:

```text
feature 数量        177
每 feature 属性数   168

ISO_A3 == "-99" 的 feature:
    Norway      ADM0_A3="NOR"
    France      ADM0_A3="FRA"
    N. Cyprus   ADM0_A3="CYN"
    Somaliland  ADM0_A3="SOL"
    Kosovo      ADM0_A3="KOS"

ISO_A3   → 173 unique / 177   ✗
ADM0_A3  → 177 unique / 177   ✓
```

Five features sharing `Feature.id = "-99"` would make `setFeatureState` highlight
all of them together — visiting France would light up Norway. Both generators
assert id uniqueness and refuse to write otherwise.

`ADM0_A3` matches ISO 3166-1 alpha-3 for most countries but not all: Kosovo
(`KOS`), N. Cyprus (`CYN`) and Somaliland (`SOL`) have no ISO code. Stability is
what feature-state needs, so this is the right key even though it is not
strictly ISO.

## China override in the world layer

Natural Earth contains exactly two China-related features:

```text
ADM0_A3=CHN  SOV_A3=CH1   China
ADM0_A3=TWN  SOV_A3=TWN   Taiwan
```

Both are removed and replaced by `china-admin0-polygon-v1.json`, so `CHN` is the
only China-related footprint in the world layer (§42/§43). Because the override
is generated from the county source, it carries Taiwan inside it — the island
does not disappear along with Natural Earth's `TWN` feature.

**Hong Kong and Macau are not separate Natural Earth features at 110m** (verified
by searching `NAME`, `ADMIN`, `SOVEREIGNT` and `ADM0_A3` — zero hits). They are
already inside the China feature, so only Taiwan needs handling.

**Re-checked for the 50m supplement (2026-09-16): both are present at 50m**
(`ADM0_A3` = `HKG`, `MAC`; at 110m neither exists). They are therefore excluded
from the supplement by `SUPPLEMENT_EXCLUDED`, alongside `CHN` and `TWN`. Without
that exclusion Hong Kong and Macau would render twice — once from the supplement
and once from the CHN override, which is built from the county source and
already contains them.

The generators fail loudly if Natural Earth stops containing `CHN` or `TWN`,
rather than silently leaving two competing China polygons in the layer.

## Simplification

| File | Setting | Result |
| --- | --- | --- |
| `world-admin0` | 110m as shipped + 50m supplement, neither simplified | 12,592 vertices |
| `china-admin0-polygon` | `-simplify 0.5% keep-shapes` | 642 vertices |
| `china-admin1` | `-simplify 25%`, except small provinces at full detail | 22,325 vertices |
| `china-admin1-internal-border` | `-innerlines` on the full-detail dissolve, then `-simplify 25%` | 7,882 vertices |

The China Admin0 override is simplified hard **because it replaces a Natural
Earth feature**: Natural Earth draws China with 240 vertices, so an
unsimplified county-derived polygon would look sharper than every neighbouring
country at global zoom. 642 vertices keeps the island specks while staying in
the same visual weight class.

### Small provinces are exempt from the percentage

A flat percentage is the wrong tool when features differ 50× in size. 澳门 has
only **13 source vertices**, and `-simplify 20%` collapsed it to 5 — which moved
its northern edge south and left the city coordinate `113.5439, 22.1987`
*outside its own polygon*. The fill would have looked wrong and, worse, the
resolver would have failed to place a Macau address.

Provinces under **400 vertices** are therefore kept at full detail:

```text
kept at full detail: 澳门 (13), 上海 (198), 香港 (199), 台湾 (381)
simplified at 25%:   the other 30 provinces
```

Those four total 791 vertices, so protecting them costs nothing.

### Internal borders come from the full-detail topology

`-innerlines` only emits an edge when **both** neighbours still have it. Taking
the borders from the mixed-detail layer silently dropped the 香港–广东 and
澳门–广东 borders entirely — pairing a full-detail 香港 with a simplified 广东
leaves them no shared edge. Borders are therefore derived from the full-detail
dissolve and simplified afterwards as a line layer.

The script asserts this cannot regress: 香港–广东, 澳门–广东 and 上海–江苏/浙江
must each produce segments, and 台湾 must produce none.

## Internal borders are not the national outline

`china-admin1-internal-border-v1.json` is produced with mapshaper `-innerlines`,
which emits **only shared edges between provinces**. Taiwan shares no edge with
any province, so it contributes zero segments here:

```text
segments inside Taiwan bounds: 0    ← verified
```

This is deliberate (handoff §34–§36). Drawing an outline around every admin1
polygon would double-render Taiwan's outline and the coastline, which already
belong to the China Authority Boundary module:

```text
China Admin1          → Fill + internal borders only
China Authority       → national border, Taiwan/island outlines, maritime line
```

## Data quality checks

Both scripts assert before writing, and exit non-zero on failure:

- Feature.id present, unique, and never `-99`
- `countryCode` equals `Feature.id`
- all coordinates numeric and within `[-180,180]` / `[-90,90]`
- all 34 province codes present in `china-admin1` (GB/T 2260)
- `china-admin0-polygon` covers Taiwan and Hainan
- `china-admin1` covers Taiwan, Hainan, Hong Kong and Macau
- `world-admin0` contains no `TWN`, `HKG` or `MAC` feature, and its `CHN`
  override has geometry
- every id the 50m supplement contributes is a valid ISO alpha-3, so the place
  form can always submit the code the resolver returns
- the supplement contributes at least one feature, so a Natural Earth refresh
  that renames a code cannot silently shrink it
- total size under 1 MB

## Versioning

Ship changes as new files (`-v2.json`), not in-place overwrites. Record what
changed and why here.

### world-admin0 v1 → v2 (2026-09-16)

**Why.** 110m omits small states entirely, so `resolveAdministrativeLocation()`
returned a *neighbouring* country for land inside one. Singapore was the case
that surfaced it: its coordinates resolved to `MYS`, because Malaysia's 110m
outline spans the island. 80 ISO 3166-1 alpha-3 codes had no polygon at all,
including Malta, the Maldives, Mauritius, Bahrain, Monaco and the Vatican —
all plausible destinations for a travel atlas.

**What changed.** 59 features / 1,545 vertices appended from the 50m supplement.
v1 is deleted; `location.ts` and `world.ts` now import v2.

**Specificity ordering.** Adding Singapore was not sufficient on its own.
`index()` now sorts units by bounding-box area so the smallest polygon is
tested first — otherwise Malaysia's larger, coarser outline still won, because
`match()` returns the first hit. The sort is what makes an over-covering
neighbour yield to the more specific state.

Regenerate with `pnpm data:world-administrative`.

## Known limitations

These are understood and deliberately not fixed here. Read before running
`backfill-administrative-codes.ts`.

1. **Monaco's polygon is degenerate.** The 50m `MCO` feature has 7 vertices and
   a 4.5 × 4.3 km bounding box, and it contains *no* real Monaco coordinate —
   tested against the palace, Monte Carlo, and the `43.7384, 7.4246` already
   stored for `monaco`. Adding it does not make Monaco resolvable. The `MCO`
   stored on that place is correct; leave it.

2. **`menton` disagrees with the resolver, and the resolver is wrong.** The
   place stores `FRA`, which is correct, but the 110m France/Italy border is too
   coarse and `43.7745, 7.4975` resolves to `ITA`. **Never run a blanket
   `backfill --apply` over every place**: it would rewrite this correct value to
   a wrong one, and would also rewrite `monaco` from `MCO` to `FRA`. Backfill
   one slug at a time, with the dry run read first.

3. **Four entities are excluded on purpose.** `ALD` (Åland), `IOA` (Indian Ocean
   Territory), `ATC` (Ashmore and Cartier) and `KAS` (Siachen Glacier) are in
   50m but their `ADM0_A3` is not a valid ISO code, so they would not match the
   value `PlaceForm` submits and would fail the "国家与坐标不一致" check. They
   stay unresolvable, as they were before.

4. **Reclaimed land is still not covered.** The boundary source predates recent
   reclamation, so places on it — AsiaWorld-Expo on Chek Lap Kok, the HZMB Hong
   Kong port — fall outside every polygon. Unrelated to this version; needs a
   newer coastline source or a nearest-neighbour fallback in the resolver.

5. **Singapore is only partly covered, and its coasts still read as Malaysia.**
   The 50m `SGP` polygon has 9 vertices and covers roughly 485 km² of Singapore's
   735 km². Measured against the current layer:

   ```text
   city centre 103.8198,1.3521  → SGP     Tuas        103.637,1.325   → MYS   ✗
   Changi      103.9915,1.3644  → SGP     Sembawang   103.82,1.449    → MYS   ✗
   Marina Bay  103.8607,1.2834  → SGP     Harbourfront 103.82,1.265   → MYS   ✗
   Jurong      103.70,1.35      → SGP     Sentosa     103.823,1.249   → null
   Orchard     103.832,1.304    → SGP
   ```

   The west and north coasts fall outside the polygon, so an enclosing neighbour
   still claims them. Fixing this properly means 10m geometry for the supplement
   (13.3 MB source, vertex budget unmeasured), which would also likely repair
   Monaco and the Vatican — see limitations 1 and 6.

6. **Monaco and the Vatican cannot be saved with their own country.** Their 50m
   polygons sit ~1.7 km and ~1.9 km off the real territories, so the resolver
   returns `FRA` and `ITA`. The form offers `MCO` and `VAT`; selecting either at
   those coordinates fails the "国家与坐标不一致" check. The existing `monaco`
   row keeps its correct `MCO` because it was written before this check existed.

7. **Geneva's stored coordinate is a deliberate offset.** The 110m Swiss
   polygon cuts the Geneva lobe off entirely: the city centre `46.2044, 6.1432`
   resolves to `FRA`, and nothing within ~11 km of it resolves to `CHE`. The
   `geneva` row stores the nearest robust Swiss point `46.2945, 6.08`
   (11.1 km north-west of the centre) so the Footprint counts it as `CHE`.
   The pin therefore does not sit on the city. Backfill leaves it alone (row
   and resolver agree), but "correcting" the coordinate back to the true centre
   would make the resolver return `FRA` again. Same class as limitation 5's
   south-coast gaps; a 10m supplement would fix it.
