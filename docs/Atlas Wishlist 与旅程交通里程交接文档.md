# Atlas Wishlist 与旅程交通里程交接文档

> 项目仓库：`shenhaike-atlas`
>
> 页面：`/wishlist/`、`/journeys/[slug]/`、`/journeys/`、`/`（首页地球）、`/guillaume/`（后台）
>
> 功能：Wishlist 愿望清单 + 旅程交通方式与里程估算
>
> 文档状态：设计定稿，待实施
>
> 修订日期：2026-09-18

---

# 0. 本次修订说明

本文档为首次撰写，基于 2026-09-18 仓库真实代码与数据库结构。

已确认的产品决策：

1. Wishlist **公开**：新增 `/wishlist/` 页面，首页地球加一个可切换的独立图层。
2. 交通方式用**固定枚举**，不做自由文本。
3. 到访后支持**一键 Promote**：Wishlist 条目升级为正式 Place，条目自动移除。

实施前必须知道的真实代码事实：

- 首页地球的数据路径唯一：`getPreHomeData()`（`src/lib/db/public.ts`）→ `PreHomeGlobe`（`src/components/PreHomeGlobe.astro`）。不存在第二条路径。
- "已到访"过滤发生在 SQL 层：`listVisitedPlaces` / `getMapArchiveData` 都 `INNER JOIN atlas_visits`（`public.ts:101-110`、`125-178`）。Wishlist **必须**走独立查询与独立数组，不能混入 `MapPoint[]`——Footprint 的 `countByCode`（`src/lib/map/administrative/footprint.ts`）遍历的就是这个数组。
- 独立布尔开关的既有先例是 Cluster 按钮：`clusteringEnabled` 状态 + 自身 URL 参数 + 在 `applyMapState` 单漏斗内应用（`PreHomeGlobe.astro:196、420-421、705-712`），**不在** `GlobeVisibilityPlan` 内（该计划是 `(scope, view)` 的纯函数，`src/lib/map/globe-state.ts:54-64`）。Wishlist 开关照抄此模式。
- 全仓库唯一的原子原语是 `db.batch([])`（`src/lib/db/visits.ts` 的重排即用此法）。没有 D1 transaction API 可用。
- `scripts/verify-database.mjs` 硬编码 seed 计数 `5 places / 4 journeys / 9 visits`——seed 改动必须与计数断言同一次提交。
- `createPlace` 与 `updatePlace` 中"行政归属解析 + 国家一致性检查"两块代码完全重复（`src/lib/db/places.ts:75-82` 与 `124-131`），是 Promote 抽取重构的天然目标。

---

# 1. 功能目标

当前状态：

- `places` 由"是否到访"定义：无访问记录的 Place 不会进入首页地图与统计。
- `visit` 不记录交通方式；旅程详情页只按 `sequence` 罗列站点，不表达"怎么走的、走了多远"。
- README 明确声明旅程连线"不代表道路、GPS 轨迹或距离"——本功能引入里程后，这句话必须修订（见 §12）。

本功能交付：

1. **Wishlist**：独立的"想去"实体，公开可见；后台完整 CRUD + 一键 Promote；首页地球独立图层（空心紫圈，区别于已到访实心点）。
2. **交通方式与里程**：`atlas_visits.transport_mode` 固定枚举字段；旅程详情页展示按顺序相邻站点的大圆距离估算总里程与按方式分组；旅程列表卡片显示一行总里程；均附"大圆直线估算、非实际交通距离"式免责声明。

---

# 2. 数据模型与语义

## 2.1 `atlas_wishlist_items`（独立表）

Wishlist 条目是"未到访"的地点，因此：

- **不设** FK 到 `atlas_places`（语义上互斥，不是从属关系）；
- **不设** slug、**不做**详情页（v1 最小化）；
- **不存** `sovereign_country_code` / `admin1_code`（Wishlist 不参与 Footprint 填色）；
- 字段镜像 `atlas_places` 的内容字段，保证 Promote 时可直接复用。

但创建/更新时**必须**仍运行 `resolveAdministrativeLocation` + 国家一致性检查（`src/lib/map/administrative/location.ts` + `src/lib/countries.ts` 的 `countryCodeForName`）：目的是捕获坐标粘贴错误（例如国家选了 China、坐标落在巴黎），解析结果只用于校验、不落库。

名称与 Place 重名**不**做跨表唯一约束（SQLite 无法跨表）；Promote 时由 `uniquePlaceSlug` 自动加后缀解决 slug 冲突。

## 2.2 `visits.transport_mode`（leg 语义）

`transport_mode` 表示"**从上一站到达本站**的交通方式"，属于到达该站的那条腿，不属于站点本身。

- 枚举：`plane` / `train` / `ship` / `car` / `bus` / `walk` / `other`，可空。
- 旅程第 1 站没有到达腿：后台 UI 隐藏该字段；db 层在 `sequence === 1` 时**强制写 NULL**（见 §9）；里程计算与展示忽略首站值。
- **重排语义**：`transport_mode` 随 visit 走、不随位置走。移动后腿的方式跟着它的到达站移动——这是数据模型的自然结果，**不要**在重排时改写（见 §15）。
- 重排后升至首站的 visit 可能残留旧 mode：DB 保留原值（无害），展示与里程一律忽略。不写清理逻辑。

---

# 3. Migration

两个独立迁移文件，都是**纯加法**，不需要 0003 式重建表（0003 重建是因为*修改*了既有 CHECK；本功能只新增）。不要合并为一个文件——两个无关的回滚单元。

## `migrations/0004_wishlist.sql`

```sql
PRAGMA foreign_keys = ON;

-- Wishlist items are unvisited by definition: no FK to atlas_places, no slug,
-- no detail page. Coordinates are stored for the globe overlay; administrative
-- codes are NOT stored (wishlist never feeds Footprint), but create/update
-- still resolve the location to catch coordinate typos.
CREATE TABLE atlas_wishlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 160),
  name_zh TEXT
    CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  country TEXT NOT NULL
    CHECK (length(country) BETWEEN 1 AND 100),
  region TEXT
    CHECK (region IS NULL OR length(region) <= 120),
  city TEXT
    CHECK (city IS NULL OR length(city) <= 120),
  latitude REAL NOT NULL
    CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL
    CHECK (longitude BETWEEN -180.0 AND 180.0),
  description TEXT
    CHECK (description IS NULL OR length(description) <= 5000),
  cover TEXT
    CHECK (cover IS NULL OR length(cover) <= 2048),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX atlas_wishlist_items_created_idx
  ON atlas_wishlist_items (created_at DESC, id DESC);
```

## `migrations/0005_visit_transport.sql`

```sql
PRAGMA foreign_keys = ON;

-- Mode of the leg *arriving at* this stop from the previous stop.
-- NULL for a journey's first stop (no arriving leg); display and mileage
-- ignore a first stop's value.
ALTER TABLE atlas_visits
ADD COLUMN transport_mode TEXT
  CHECK (transport_mode IS NULL OR transport_mode IN
    ('plane','train','ship','car','bus','walk','other'));
```

现有行自动为 NULL，无需回填。

---

# 4. Promote 原子性设计

**采用 `db.batch([INSERT place, DELETE wishlist item])` 单批方案。**

先做一次行为保持的重构（`src/lib/db/places.ts`）：

1. 抽取 `export function resolvePlaceLocation(value: PlaceInput)`：即 create/update 中重复的 `resolveAdministrativeLocation` + `countryCodeForName` 一致性检查（现位于 `places.ts:75-82` 与 `124-131`），不一致时抛出同样的 `DataError("validation", "国家与坐标不一致", {...})`。`createPlace` / `updatePlace` 改用之，行为完全不变。
2. 抽取 `export async function preparePlaceInsert(db, input)`：`validated()` + `uniquePlaceSlug` + `resolvePlaceLocation`，返回 `{ value, slug, location }`。`createPlace` 变为 `preparePlaceInsert` + INSERT。

然后新增 `src/lib/db/wishlist.ts` 的 promote：

```ts
export async function promoteWishlistItem(db: D1Database, id: number): Promise<Place> {
  const item = await getWishlistItemById(db, id);            // DataError not_found if missing
  const { value, slug, location } = await preparePlaceInsert(db, {
    name: item.name, nameZh: item.nameZh, country: item.country, region: item.region,
    city: item.city, latitude: item.latitude, longitude: item.longitude,
    description: item.description, cover: item.cover,
  });
  await db.batch([
    db.prepare(`INSERT INTO atlas_places (slug, name, name_zh, country, region, city,
      latitude, longitude, sovereign_country_code, admin1_code, description, cover)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
      .bind(slug, value.name, value.nameZh, value.country, value.region, value.city,
        value.latitude, value.longitude, location.sovereignCountryCode,
        location.admin1Code, value.description, value.cover),
    db.prepare("DELETE FROM atlas_wishlist_items WHERE id = ?1").bind(item.id),
  ]);
  const place = await getPlaceBySlug(db, slug);
  if (!place) throw new Error("Promoted place not found.");
  return place;
}
```

**为什么不用"先 `createPlace` 再 `deleteWishlistItem`"**：删除失败（或中途中断）会留下"Place 已建 + 条目还在"，用户重试则重复建 Place。batch 方案没有失败窗口、没有补偿逻辑。代价仅是 `places.ts` 的小抽取（行为保持）。batch 不返回 `RETURNING` 行，事后按 slug 重查即可（两次廉价读）。slug 冲突在单人后台下实际不可能（自动后缀扫描）。

Promote 后创建的 Place 需要正常的行政归属（由 `preparePlaceInsert` 内解析）、slug 与 updated_at；Promote 不自动创建 visit、不挂旅程——用户随后按正常流程添加访问。

---

# 5. 里程计算

## 5.1 新模块 `src/lib/geo.ts`

放在 `src/lib/` 根层（与 `dates.ts`、`countries.ts` 并列），**不要**放进 `lib/map/`——`lib/map/` 文档定位是地图供应商无关的适配层，而里程被非地图页面（旅程列表/详情）消费。

```ts
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number;
// 标准 haversine，atan2 中心角式。对跨 ±180° 的腿天然安全，
// 不要复用 splitAntimeridian（那是为渲染连线截短用的，需求相反）。

export function journeyMileage(
  stops: Array<{ latitude: number; longitude: number; transportMode: TransportMode | null }>,
): JourneyMileage | null;
// stops.length < 2 返回 null。
// legs[i] = 到达第 i+1 站的腿（i >= 0）；首站 transportMode 整体忽略。
// byMode 按 km 降序；null 模式桶排最后（展示时标 "unrecorded" / "未记录"）。
```

类型 `JourneyMileage = { totalKm: number; byMode: Array<{ mode: TransportMode | null; km: number }>; legs: Array<{ mode: TransportMode | null; km: number }> }` 进 `src/types/domain.ts`。

## 5.2 读取时计算、不落库

- 旅程数据量极小（单用户档案），每次读取现算即可，无需存储列。
- `getJourneyDetail`（`public.ts:274-301`）的 SELECT 加 `v.transport_mode`，返回 `{ journey, visits, mileage: journeyMileage(visits) }`。
- `listJourneySummaries`（`public.ts:112-123`）：**保持现有 GROUP BY 查询不动**，另加一条查询取全部 visit 的 `(journey_id, sequence, transport_mode, latitude, longitude)`，JS 内按 `journey_id` 分组逐旅程计算，`toJourneySummary` 增加 `totalKm` 参数。
- **查询必须带 `ORDER BY v.journey_id, v.sequence, v.id`**：SQL 无 ORDER BY 时行序不受保证（与仓库其它查询全部显式排序的惯例一致）。同时组装函数在每组内**再按 `(sequence, id)` 排序**后才送入 `journeyMileage`——防御性双保险，且让 fake-D1 测试能喂乱序行验证（见 §11.1）。行序错误会把不相邻的站点连成腿，导致总里程、每腿方式与分组全部错乱。
- 拒绝 N+1 逐旅程查询；拒绝把坐标塞进聚合查询（与现有 GROUP BY 打架）。

## 5.3 展示

- 旅程详情页 `.detail-coordinate` meta 行追加 `· ≈ ${totalKm.toLocaleString("en-US")} km`（mileage 非 null 时；与日期精度无关——里程只依赖站点坐标）。
- Route 标题下方一行分组："Straight-line great-circle estimate · plane 11,000 km · car 1,345 km"（null 桶 → "unrecorded"）。
- 每个 `li`（index ≥ 1）在坐标 `small` 后加一行 "plane · 3,102 km"（`mileage.legs[index - 1]`，null → "unrecorded"）。
- `JourneyCard.astro` 的 `.journey-counts` 追加 `· ≈ N km`（`totalKm !== null` 时）。
- 免责措辞对齐现有 "Visit order · not a tracked route" 风格；README 行 126 必须修订（见 §12）。
- 首页地球的 Journey 连线**不加**里程（保持地图纯净）。

---

# 6. 公开页面

## 6.1 `/wishlist/`（新增 `src/pages/wishlist/index.astro`）

- BaseLayout（title "Wishlist — Atlas"，OG/规范 URL 走 BaseLayout 默认 props）；frontmatter 调 `getDatabase()` + `public.ts` 新增的薄封装 `listWishlist(db)`；异常渲染 `DataFailure`（503）。
- 无链接卡片列表（无详情页）：名称、中文名、位置面包屑（`[city, region, country].filter(Boolean).join(" · ")`）、描述、坐标 `small` 行。
- 页头免责声明："愿望清单不计入已到访统计。 · Wishlist items do not count toward visited statistics."
- 首页 stats 增加第 4 块 Wishlist tile（`HomeData["stats"]` 加 `wishlist`），链接到 `/wishlist/`。
- 主导航（`src/layouts/BaseLayout.astro`）在 Timeline 后加 Wishlist 链接。
- `src/middleware.ts` 的 `dynamicArchiveRoute` 必须加入 `/wishlist/`（no-store，与其它档案页一致）。

## 6.2 旅程详情与列表

见 §5.3。`JourneyVisit` 已携带经纬度（`domain.ts:159-165`），距离计算无需改查询，仅补 `transport_mode` 列。

---

# 7. 首页地球图层

## 7.1 状态与位置

- **不**修改 `GlobeVisibilityPlan` / `globe-state.ts`（该计划是 `(scope, view)` 纯函数，测试枚举四种组合；独立布尔不属于它）。照抄 Cluster 按钮先例：
  - 工具栏新增 "Overlays" 组（"Place display" 组之后）：`<button type="button" aria-pressed="false" data-globe-wishlist>Wishlist</button>`，**仅 `wishlist.length > 0` 时渲染**。
  - 状态 `wishlistEnabled`，默认关，URL 参数 `wishlist=1` 恢复（与 `cluster` 同法）。
  - `applyMapState`（单漏斗）内处理：按钮 `is-active`/`aria-pressed`、source `setData`、层可见性、URL 参数维护（`"wishlist"` 必须加入删除键列表）。
- 与 Scope × View 相互独立：开关打开时两个 View 都显示（与 Cluster 一致）。

## 7.2 Source 与 Layer

- 新增 source `globe-wishlist`（`type: "geojson"`）+ circle 层 `wishlist-points`：
  `{ "circle-radius": 2.75, "circle-opacity": 0, "circle-stroke-color": WISHLIST_POINT_COLOR, "circle-stroke-width": 2 }` —— **空心圈**，"计划、未到达"作为字形而非仅色相。
- **不做聚类**（v1）：聚类机制与已到访结果列表深度耦合（`clusterResultIds`/`getClusterLeaves` 驱动带 href 的结果列表），Wishlist 点无 href、无筛选、数量少；独立 source 也从结构上杜绝混入 `globe-places`。
- 点击弹小 popup（名称 + 国家/位置），**无链接**；加入 pointer-cursor 的 enter/leave 层列表。

## 7.3 颜色

`export const WISHLIST_POINT_COLOR = "#b9aef0"`（淡紫，进 `src/lib/map/config.ts`）。

排除理由：琥珀撞夜灯辉光（`#ffd8a3`/`#ffe4b8` 同画布）；绿撞 Blue Marble 植被与 `#d5ddd8` 线族；蓝撞海洋栅格。紫在昼夜影像与现有调色板中均缺席，与已到访实心白点（`#f1f4f1` + `#050607` 描边）、旅程实心黑点（`#050607` + `#f1f4f1` 描边）构成最大区分。

## 7.4 Scope 过滤

尊重 Scope：China 范围复用 `pointsForMode`（`src/lib/map/globe.ts`，参数放宽为 `readonly { country: string }[]`，零调用点改动）过滤 Wishlist 点，非中国条目在 China 范围不渲染——与已到访点、旅程站点的行为一致。新增 `wishlistPointsGeoJson(items, mode)`。

## 7.5 数据隔离（硬规则）

Wishlist 数组加在 `PreHomeData.wishlist`（`getPreHomeData` 的第三个查询组装），**不得**进入 `MapArchiveData` / `MapPoint[]` / `globe-places` source。Footprint 的 `countByCode` 遍历的就是 `points` 数组，任何合并都会静默膨胀足迹填色。payload 序列化保持现有 `replaceAll("<", "\\u003c")` 转义。

## 7.6 地球入口条件（0 已到访 + 非空 Wishlist）

现有地球体验入口由 `points.length` 单独控制（`PreHomeGlobe.astro:26` 的 `{points.length ? (...)}` 分支）——若已到访为 0 而 Wishlist 非空，只会渲染 "No visited places yet." 空状态，Wishlist 图层无从打开。**必须**改为：

- **入口条件**：`points.length > 0 || wishlist.length > 0`，仅两者皆空时才渲染 `map-empty` 空状态。
- **0 已到访时**：结果列表显示空状态（复用 `data-globe-results-empty`，文案适配为 "No visited places yet. Wishlist points are shown on the globe." 一类），结果标题计数为 0，年份下拉仅 "All time"，Wishlist 开关照常可用；Footprint 填色、Cluster、noscript 回退均不得报错。
- **验收场景**：在 0 visit 的本地库（把 visits 全部移除后，places 仍在但已不出现在 `points`）验证上述行为，纳入 §14 清单。

---

# 8. 后台

## 8.1 API（`src/pages/guillaume/api/wishlist/`）

- `index.ts`（POST create）、`[id].ts`（PATCH update + DELETE）、`[id]/promote.ts`（POST → `promoteWishlistItem`，返回创建的 place，UI 用之跳转 `/guillaume/places/{id}/`）。
- 全部沿用惯例：手写字段提取（`stringValue`/`optionalStringValue`/`numberValue`/`idFromParams`，`src/lib/api/admin.ts`）+ `adminApiError` 映射（404/409/422/500）+ `json()`（`src/lib/api/responses.ts`）。
- `/guillaume/*` 的中间件鉴权与 Origin 检查自动覆盖新路由，无需改中间件。
- `api/visits/{index,[id]}.ts` 的 VisitInput 构造**必须**补 `transportMode: optionalStringValue(body.transportMode)`，否则 API 边界静默丢字段。

## 8.2 页面与表单

- `components/admin/WishlistForm.astro`（新）：抄 `PlaceForm.astro` 结构（`novalidate`、`data-action`/`data-method`、`[data-error]` span、内联 fetch 拦截脚本、失败保留输入）；编辑页加 "Promote to place" 按钮（`window.confirm` → POST promote → 跳转新 place）。
- `pages/guillaume/wishlist/{index,new,[id]}.astro`（新）：列表页仿 `guillaume/places/index.astro` 表格 + 每行 Promote 按钮；new/[id] 是 WishlistForm 的薄包装。
- `components/admin/VisitManager.astro`：加/编辑表单加 `transportMode` 下拉（空选项 `—` + 7 项 `TRANSPORT_MODE_OPTIONS`）；**首站隐藏**：新增表单 `hidden={visits.length === 0}`，第 1 张编辑卡 `hidden={index === 0}`（服务端每次增删移动后重渲染，隐藏状态自然正确）；payload 加 `transportMode: data.get("transportMode") || null`。
- `pages/guillaume/index.astro`：标量子查询加 `(SELECT COUNT(*) FROM atlas_wishlist_items) AS wishlist`，第 4 块 `.metric` tile + "+ New Wishlist Item" 快捷入口；不新增 `?view=` 标签页（专属列表页承担）。
- `layouts/AdminLayout.astro`：导航加 Wishlist 链接。

## 8.3 数据链路说明

后台旅程编辑页（`guillaume/journeys/[id].astro`）用 `listJourneyVisits`（`db/visits.ts`）取 visits——`VISIT_COLUMNS` 加 `transport_mode`、`toVisit` 映射后，VisitManager 自动获得 `transportMode`，该页面无需改动。

---

# 9. 校验与错误

- **Wishlist 不写新校验器**：`WishlistItemInput` 与 `PlaceInput` 字段完全一致，`db/wishlist.ts` 的 `validated()` 直接复用 `validatePlaceInput`，仅把 `DataError` 消息改为"愿望清单项无效"。避免重复校验器与重复测试矩阵。
- `validateVisitInput`（`src/lib/validation/domain.ts`）加 transportMode 分支：可选；存在且不在枚举内 → `errors.transportMode = "请选择有效的交通方式"`；`""`/`undefined` 归一为 `null` 后返回。
- `src/lib/transport.ts`（新）：仿 `countries.ts` 的 `COUNTRY_OPTIONS` 模式——`TRANSPORT_MODES` 常量、`TRANSPORT_MODE_OPTIONS`（Plane/飞机、Train/火车、Ship/轮船、Car/汽车、Bus/大巴、Walk/步行、Other/其他）、`transportModeLabel(mode)`、`isTransportMode(value)` 守卫。表单下拉与公开展示共用同一映射。
- `db/visits.ts` create/update：`sequence === 1` 时 `transportMode` 强制写 NULL（数据层守住不变量，而非只靠 UI）。
- `src/lib/db/rows.ts`：`VisitRow.transport_mode: string | null`；`toVisit` 映射 `transportMode: row.transport_mode ?? null`——查询漏列时降级为"未记录"而不是把 `undefined` 带进展示。新增 `WishlistItemRow` + `toWishlistItem`。
- `src/lib/db/public.ts` 三处显式 Visit 列 SELECT（`getPlaceDetail`、`getJourneyDetail`、`listTimeline`）都补 `v.transport_mode`，保持行完整性。

---

# 10. Seed 与数据库验证

## 10.1 `seed.sql`

- Wishlist 块：无 slug、无自然冲突键，**不适用** `ON CONFLICT(slug) DO UPDATE` 的 upsert 惯例；采用 visits 的 scoped 先例——`DELETE FROM atlas_wishlist_items WHERE name IN (...)` 后 INSERT。3 条：法罗群岛（Faroe Islands, 62.0079, -6.7901；description 注明丹麦属地）、桂林（Guilin / China / Guangxi, 25.2736, 110.2900）、里斯本（Lisbon / Portugal, 38.7223, -9.1393）。
- **法罗群岛的 country 必须写 "Faroe Islands"，不能写 "Denmark"**：实测 `resolveAdministrativeLocation(-6.7901, 62.0079)` 返回 `FRO`，而 `countryCodeForName("Denmark")` 为 `DNK`（world-admin0 数据含独立的 FRO 要素；`countries.ts` 的选项来自 i18n-iso-countries，FO 与 DK 是两条独立条目）。seed 直写 SQL 绕过应用层校验可以入库，但 Promote 复用的国家一致性检查（现 `places.ts:75-82`，抽取后即 `resolvePlaceLocation`）会抛错，条目将**永远无法升级**。所有 seed 条目都必须能通过该检查（§11.1 有对应 Gate）。
- 既有 visits 的 INSERT 补 `transport_mode` 列：xinjiang-2026 的 seq1 NULL、seq2 'plane'、seq3 'bus'、seq4 'car'、seq5 'plane'；year-crossing-2025 的 seq1 NULL、seq2/seq3 'train'；hangzhou-return-2026 的 seq1 NULL。覆盖 NULL + 4 个枚举。

## 10.2 `scripts/verify-database.mjs`

- 计数断言加 `atlas_wishlist_items === 3`（与 seed 改动同提交）。
- 新增 `expectFailure`：非法 `transport_mode`（'rocket'）、wishlist 纬度 91、wishlist 经度越界。
- 正向插入：**对七个合法枚举逐一做真实 INSERT 并断言接受**（`plane`/`train`/`ship`/`car`/`bus`/`walk`/`other` 各一次；可分摊在 partial-date 检查、cascade 检查的既有 visit 与新增断言行上）。Vitest 只能验证 TypeScript 校验器接受 `other`，**不能**证明迁移里的 SQLite CHECK 也接受它——若迁移拼错或漏写 `other`，现有测试仍可能全绿，所以数据库层必须全覆盖。保留 `rocket` 的 expectFailure。

---

# 11. 测试计划（双层惯例）

## 11.1 Vitest（fake-D1 模式，断言捕获的 SQL 文本与绑定值）

- `src/lib/geo.test.ts`（新）：已知城市对距离容差；**±179° 跨日期变更线腿**（锁定 haversine 绕行安全，防止未来误用 `splitAntimeridian`）；`<2` 站返回 null；null 模式桶；首站 mode 忽略。
- `src/lib/validation/domain.test.ts`（扩展）：transportMode 非法值、`""`→null 归一。
- `src/lib/db/wishlist.test.ts`（新）：CRUD 的 SQL/绑定值；promote 断言**恰好一个 batch、恰好两条语句**（INSERT place + DELETE wishlist）。另含 **seed Promote 一致性 Gate**：对三条 seed Wishlist 项的 `(country, 坐标)` 硬编码断言 `countryCodeForName(country) === resolveAdministrativeLocation(lng, lat).sovereignCountryCode`（注释注明与 seed.sql 同步），保证每个 seed 条目都能通过国家一致性检查、可直接 Promote。
- `src/lib/db/visits.test.ts`（扩展）：sequence 1 时绑定值为 null 而非传入值。
- `src/lib/db/public.test.ts`（新）：`journeyMileage` 组装、`PreHomeData.wishlist` 与 `MapPoint[]` 隔离；**乱序测试**：向汇总组装函数喂 `(sequence, id)` 乱序的行，断言每条腿与总里程同排序后结果一致（锁定 §5.2 的组内排序）。
- `src/lib/map/globe.test.ts`（扩展）：`wishlistPointsGeoJson` 的 China 过滤与 properties。
- `src/lib/db/journeys.test.ts`（新）：`journeys.ts` 目前无测试，本次不强制补齐全部，但 transport 相关改动应纳入覆盖。

## 11.2 数据库验证

见 §10.2。真实 SQLite 语义（约束、触发器、级联）只由 `verify-database.mjs` 验证，不进 Vitest。

---

# 12. 文档更新清单（README）

- 行 ~30 公开档案列表：加 `/wishlist/` 愿望清单。
- 行 ~32 地球说明：加可切换 Wishlist 图层（空心紫圈、无聚类、China 范围过滤非中国条目）。
- 行 ~92-98 后台功能：加两条——"Wishlist 列表、新建、编辑、删除与一键 Promote 为正式 Place（生成 slug、重算行政归属、原子删除愿望项）"；"Visit 增加到达交通方式（plane/train/ship/car/bus/walk/other），首站不显示"。
- 行 ~107-112 公开查询规则：加——"Wishlist 是独立的愿望数据，不计入首页 Places/Journeys/Regions/Footprint 统计；`/wishlist/` 仅展示清单"。
- **行 ~126 必须修订**：现文"旅程详情的连线仅表达访问顺序，不代表道路、GPS 轨迹或距离"改为"旅程详情的连线仅表达访问顺序，不代表道路或 GPS 轨迹；页面展示的里程为相邻访问点之间的大圆直线估算（great-circle），不代表实际交通距离。"
- 行 ~170-179 数据模型与规则：加 wishlist 表（无 slug、无外键、不存行政编码、创建/编辑仍按坐标解析校验国家一致性）；`transport_mode` leg 语义与首站规则；里程读取时计算不落库；Promote 单 batch。
- 行 ~146-166 目录树：补 `lib/geo.ts`、`lib/transport.ts`、`db/wishlist.ts`、`pages/wishlist/`、`guillaume/api/wishlist/`、`guillaume/wishlist/`。

---

# 13. 实施顺序（每步保持仓库绿色）

1. 迁移 `0004`/`0005` → `pnpm test:database`（新表/列惰性，现有 seed 计数不变，通过）。
2. 类型 + 纯库（`geo.ts`/`transport.ts`/校验分支）+ `geo.test.ts`、扩展 `domain.test.ts` → `pnpm test && pnpm check`。
3. DB 层（rows / places 抽取 / visits / wishlist / public）+ `wishlist.test.ts`、扩展 `visits.test.ts`、新 `public.test.ts`、`journeys.test.ts` → `pnpm test && pnpm check`。
4. 后台 API（wishlist 三端点 + visits 两端点补 transportMode）。
5. 后台 UI（WishlistForm、三个页面、VisitManager 下拉、Dashboard tile、AdminLayout 导航）。
6. 公开页面（`/wishlist/`、旅程详情/卡片、首页 stats tile、BaseLayout 导航、middleware、global.css）。
7. 地球（config 颜色、globe.ts builder + 参数放宽、PreHomeGlobe 接线）+ 扩展 `globe.test.ts`。
8. seed + verify-database 同步更新 → `pnpm db:seed:local && pnpm test:database`。
9. 文档（README + 本文档）。
10. `pnpm verify` 全绿 + 手动流程验收（§14）。

---

# 14. 完成定义（验收清单）

- [ ] `pnpm verify` 全绿（test + test:database + check + build）。
- [ ] 后台：Dashboard Wishlist tile 计数正确；新建条目时国家与坐标不一致 → 字段错误；修正后保存成功。
- [ ] 后台：Promote 一条 → 条目消失、places +1、新 place 的行政码已解析、编辑页可正常打开。
- [ ] 后台：旅程编辑首站无交通下拉、其余站有；选 'rocket' 类非法值被服务端拒绝。
- [ ] 公开：`/journeys/xinjiang-2026/` 显示总里程 + 分组 + 每腿；单 visit 旅程无任何里程显示；`/journeys/` 卡片显示一行总里程。
- [ ] 公开：`/wishlist/` 显示 3 张无链接卡片 + 免责声明；首页 stats 的 Wishlist tile = 3 且链接正确；首页 Places 统计**不包含** wishlist。
- [ ] 地球：Wishlist 按钮出现；世界范围显示紫色空心圈；China 范围仅剩桂林；点击弹 popup 无链接；`?wishlist=1` 刷新恢复状态；Footprint 填色不受影响；Cluster 独立工作。
- [ ] 刷新 `/journeys/[slug]/` 与 `/wishlist/` 响应头为 `Cache-Control: no-store`。
- [ ] **0 已到访 + 非空 Wishlist**：首页渲染地球体验（而非 "No visited places yet."），Wishlist 开关可用、空心紫圈正常显示，结果列表显示空状态，Footprint/Cluster/noscript 均不报错。

---

# 15. 风险清单

1. **seed 计数硬编码**（5/4/9）：`verify-database.mjs` 必须与 seed 改动同提交更新，否则门禁断裂。
2. **Footprint 污染**：Wishlist 严禁混入 `MapPoint[]` / `globe-places`。任何合并都会让 `countByCode` 静默膨胀填色。
3. **显式列 SELECT**：`public.ts` 三处 Visit 形状查询都要补 `transport_mode`；漏列由 `toVisit` 的 `?? null` 兜底，但必须以显式补列为准。
4. **重排语义**：mode 随 visit 走；重排后升至首站的残留值保留在 DB、展示忽略——不写清理逻辑，也不在重排时改写（写入文档而非代码）。
5. **URL 参数卫生**：`"wishlist"` 必须加入 `applyMapState` 的删除键列表，否则陈旧参数累积。
6. **middleware**：漏加 `/wishlist/` 会让公开页可缓存，与其它档案页不一致。
7. **迁移拆分**：0004/0005 分开，不合并。
8. **Promote 的错误映射**：`preparePlaceInsert` 可能抛国家一致性 `DataError`（422 + fields），列表页的 promote 用 alert 呈现（无 per-field span）。
9. **空状态**：`wishlist.length === 0` 时不渲染按钮；payload 序列化保持 `<` 转义。
10. **`pointsForMode` 放宽**：参数改为 `readonly { country: string }[]` 必须保持 `MapPoint[]` 可直接传入（结构化类型，零调用点改动，但需 `globe.test.ts` 回归确认）。
11. **seed 国家编码一致性**：seed 绕过应用层校验直接写库，若某条目的 country 与坐标解析码不一致（如法罗群岛写 Denmark→DNK 而解析为 FRO），条目将**永远无法 Promote**（每次点击都吃 422）。§11.1 的 seed 一致性 Gate 锁死此项。
12. **生产部署顺序（对抗式审查追加）**：`transport_mode` 列被首页、旅程、地点、时间轴与 visits API 硬引用。部署 Worker 前**必须**先对生产 D1 应用 0005 迁移（`pnpm db:migrate:production`），否则上述页面全部 503（`?? null` 兜底只覆盖"SELECT 漏列"，不覆盖"表缺列"）；`verify-database.mjs` 在全新临时库上验证，无法替生产库把关顺序。

---

# 16. 未来方向（不在本次范围）

- Wishlist 聚类与结果列表联动（需要 href 或详情页支撑）。
- Wishlist 详情页 / 外部地图链接（Google Maps、高德）。
- 里程按跨旅程累计（连续旅程间的"总旅行距离"统计页）。
- 交通方式参与统计（年度各方式里程占比）。
- 照片与 R2/Images 管线（`cover` 目前仅字符串）。
