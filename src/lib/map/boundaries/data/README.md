# Atlas China Boundary Dataset

Version: v1

Base dataset: 中国县级行政区域矢量数据（含 `name` / `gb` 属性）— **exact product name pending confirmation**

Provider: 自然资源部官方渠道（全国地理信息资源目录服务系统 / 天地图数据资源中心）

Source layer: single flat `FeatureCollection` — no `BOUL` / `BOUA` layer structure

Original CRS: `urn:ogc:def:crs:EPSG::4490` (CGCS2000), declared by the source file

Atlas CRS: EPSG:4326 (WGS84), `[longitude, latitude]`

Conversion: `scripts/generate-china-boundary.mjs` (mapshaper for all geometry work)

Downloaded: 2026-09-14 · Generated: 2026-09-14

## Output files

| File | Rings | Vertices | Size | Simplification |
| --- | --- | --- | --- | --- |
| `china-national-border-v1.json` | 145 | 11,419 | 228.5 KB | 70% retained (~1.8 km/vertex) |
| `china-islands-v1.json` | 27→27 | 3,957 | 80.0 KB | none |
| `china-maritime-boundary-v1.json` | 9 segments | 528 | 13.7 KB | none |
| **total** | | | **322 KB** | target < 500 KB |

Islands and the maritime line are deliberately **not** simplified. An 8% pass was
enough to erase 澎湖列岛 completely, and these are the regions §24 names as
needing the lowest tolerance.

## How the three files are derived

The source is a county-level layer, not the 1:100 万 `BOUL` dataset originally
specified. The national border and island outlines are therefore produced by
**dissolving** county polygons — a structural conversion (§15/§23), not a
hand-drawn line. Dissolving removes every internal administrative edge and
leaves the outer boundary.

| Output | Source features |
| --- | --- |
| national border | all 2,869 non-island county polygons, dissolved |
| islands | 22 features of 台湾省 (`15671*`) + 三沙市 (`1564603*`), dissolved |
| maritime | the one `境界线` line whose extent reaches south of 5°N |

Verified coverage: Taiwan 11 rings / 339 vertices, **Penghu 6 rings / 53
vertices**, Diaoyu 3 rings / 27 vertices, Sansha 325 rings / 3,576 vertices.

### The maritime line

`境界线` feature spanning 108.203–121.912°E, 3.408–21.698°N as **9 segments** —
the South China Sea discontinuous line, taken verbatim from the dataset. It is
never generated from a segment count and never drawn with `line-dasharray`.

The 6 other `境界线` features were examined and **excluded**, all judged by
geometry rather than by name:

| Extent | Identification | Included |
| --- | --- | --- |
| 113.817–114.502 E, 22.139–22.568 N | 深圳/香港 boundary | no — internal |
| 121.095–122.783 E, 30.678–31.872 N | 上海/长江口 boundary segments | no — internal |
| 113.528–113.630 E, 22.077–22.217 N | 澳门 boundary | no — internal |
| 122.660–122.817 E, 23.669–24.658 N | single 2-point line east of Taiwan | no — not identifiable as a 东海 segment |
| 73.881–74.869 E, 38.287–38.677 N | 中塔 border | no — see conflict below |
| 74.790–75.150 E, 37.231–38.287 N | 中塔 border | no — see conflict below |

**Gap:** no 东海有关线段 was positively identified. §10 asks for it, but nothing
in this dataset matches unambiguously. Recorded rather than guessed.

## Manual verification

- Xinjiang: **pending** — see the 中塔 conflict below
- Tibet: **pending** — southern extent reaches 26.858°N (错那市), consistent with official cartography
- Taiwan: **pending** — present, 20 county-level units, `countryCode`/`sovereignty` = CHN
- Diaoyu Islands: **pending** — present inside 宜兰县
- South China Sea discontinuous line: **pending** — 9 real segments, needs comparison against 标准地图

### ⚠️ Known conflict: 中塔边界 (Xinjiang)

In lat 37.2–38.7°N the dissolved county polygons reach **73.772°E**, while the
dataset's own 中塔 `境界线` features sit at **73.881°E** — a ~9 km discrepancy.
The two disagree about where the China–Tajikistan border runs.

The national border uses the dissolved county line for consistency with the rest
of the boundary. **This must be resolved visually against 自然资源部标准地图
before the data is treated as verified.** The two `境界线` features were not
merged in, because overlaying them would draw a second, conflicting line.

## CRS note

The source declares EPSG:4490 (CGCS2000). CGCS2000 and WGS84 differ by well
under a metre, which is negligible at these zooms. A GCJ-02 shift would be
roughly 500 m and is **not** present: the westernmost vertex is
`[73.498962, 39.383572]`, against the accepted WGS84 westernmost point of China
at ≈73.4996°E. The declared CRS was read from the file and checked, not assumed.

## Regenerating

```sh
node scripts/generate-china-boundary.mjs     # or: pnpm data:china-boundary
```

Requires `data-source/中国_县.geojson`, which is git-ignored. The script never
downloads anything, so a plain `pnpm build` stays offline.

The script re-validates before writing and exits non-zero on: missing
`FeatureCollection`, no features, empty geometry, a line with fewer than two
points, non-numeric or out-of-range coordinates, or anything other than
`countryCode`/`sovereignty` = `CHN`. It also fails if the total exceeds 1 MB.

## Versioning

Ship changes as new files (`-v2.json`), not in-place overwrites. Record what
changed and why here.
