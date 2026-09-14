# Atlas Administrative Footprint Dataset

Static administrative geometry for the pre-home Footprint view. **No visited
state is stored here** — that lives in D1 (`places.sovereign_country_code`,
`places.admin1_code`) and is applied at runtime with MapLibre `feature-state`.

Atlas CRS: EPSG:4326 (WGS84), `[longitude, latitude]`.

## Files

| File | Features | Vertices | Size | Purpose |
| --- | --- | --- | --- | --- |
| `world-admin0-v1.json` | 176 | 11,047 | 258.4 KB | World Footprint fill |
| `china-admin0-polygon-v1.json` | 1 | 642 | 13.1 KB | China fill + World CHN override |
| `china-admin1-v1.json` | 34 | 22,325 | 456.3 KB | China Footprint fill |
| `china-admin1-internal-border-v1.json` | 76 segments | 7,882 | 158.9 KB | Province outlines |
| **total** | | | **887 KB** | all lazily loaded |

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

110m was chosen for the global overview zooms (handoff §37/§38). 50m only if
small-country legibility proves unacceptable in practice.

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
already inside the China feature, so only Taiwan needs handling. Re-check this if
the data moves to 50m.

The generators fail loudly if Natural Earth stops containing `CHN` or `TWN`,
rather than silently leaving two competing China polygons in the layer.

## Simplification

| File | Setting | Result |
| --- | --- | --- |
| `world-admin0` | Natural Earth as shipped | 11,047 vertices |
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
- `world-admin0` contains no `TWN` feature and its `CHN` override has geometry
- total size under 1 MB

## Versioning

Ship changes as new files (`-v2.json`), not in-place overwrites. Record what
changed and why here.
