# Atlas Pre-Home Administrative Footprint 完整实施交接文档

> 项目仓库：`shenhaike-pre-home`
>
> 页面：`/`（本文写于该地球页面位于 `/pre-home/` 时；`/pre-home/` 现 301 跳转到 `/`）
>
> 功能：Administrative Footprint / 行政足迹模式
>
> 文档状态：替代旧版 `Atlas-PreHome-Footprint-Mode-Handoff.md`
>
> 修订日期：2026-09-14

---

# 0. 本次修订说明

旧版文档存在若干基于假设而非真实仓库结构的设计问题。

本版本必须以当前项目真实代码与数据库为基础实施。

已知事实包括：

```text
数据库 seed 数据：

country = "China"

region =
"Xinjiang"
"Shanghai"
"Zhejiang"
...
```

不是：

```text
country = "中国"

region =
"新疆"
"上海"
"浙江"
```

此外，`pre-home` 实际消费的不是完整 `Place[]`，而是：

```text
MapPoint[]
```

由：

```text
D1
↓
src/lib/db/public.ts
↓
getPreHomeData()
↓
MapPoint[]
↓
PreHomeGlobe
```

产生。

因此本功能必须修改完整数据链，而不是只修改 `Place` 类型。

---

# 1. 功能目标

当前 `pre-home` 已经具有：

```text
World
China
```

两个观察范围，以及：

```text
Journey
POI
Cluster
Journey Route
Journey Stops
Journey Selector
```

本次新增：

```text
Footprint
```

用于表达：

```text
World：
去过哪些国家

China：
去过哪些中国省级行政区
```

---

# 2. 最终状态模型

地图状态必须拆成两个独立维度。

## Scope

```ts
type ScopeMode =
  | "world"
  | "china";
```

表示：

> 当前观察世界还是中国。

---

## View

```ts
type ViewMode =
  | "journey"
  | "footprint";
```

表示：

> 当前展示旅行路线还是行政覆盖范围。

---

最终组合：

```text
World + Journey
China + Journey
World + Footprint
China + Footprint
```

禁止：

```ts
type Mode =
  | "world"
  | "china"
  | "world-footprint"
  | "china-footprint";
```

---

# 3. 默认状态

保持当前页面体验：

```ts
scopeMode = "world";
viewMode = "journey";
```

因此新增 Footprint 后：

```text
用户第一次打开页面
→ 与当前视觉基本一致
```

---

# 4. UI

现有：

```text
[ World ] [ China ]
```

在右侧增加：

```text
[ Journey ] [ Footprint ]
```

最终：

```text
[ World ] [ China ]      [ Journey ] [ Footprint ]
```

两组按钮语义必须独立。

---

# 5. Journey 模式

当：

```ts
viewMode === "journey"
```

显示：

```text
Journey Selector
Journey Route
Journey Stops
POI
Clusters
```

行政 Polygon：

```text
隐藏
```

---

# 6. Footprint 模式

当：

```ts
viewMode === "footprint"
```

显示：

```text
Administrative Polygon
Administrative Internal Borders
Visited Fill
POI
Clusters
```

隐藏：

```text
Journey Selector
Journey Route
Journey Stops
```

第一版继续保留 POI / Cluster。

---

# 7. Journey Selector

Journey Selector 只由：

```text
ViewMode
```

决定。

规则：

| Scope | View | Journey Selector |
|---|---|---|
| World | Journey | visible |
| China | Journey | visible |
| World | Footprint | hidden |
| China | Footprint | hidden |

---

# 8. Scope 与 View 必须独立

例如：

```text
World + Footprint
```

点击 China 后：

```text
China + Footprint
```

不能自动切回 Journey。

同样：

```text
China + Journey
```

点击 Footprint 后：

```text
China + Footprint
```

不能改变 Scope。

---

# 9. 核心数据原则

Footprint 的机器逻辑不得长期依赖：

```text
country
region
```

自由文本。

例如当前：

```text
China
Xinjiang
Shanghai
Zhejiang
```

未来即使 UI 名称变化：

```text
Xinjiang
新疆
Xinjiang Uygur Autonomous Region
```

都不应该影响地图判断。

因此新增：

```text
sovereignCountryCode
admin1Code
```

---

# 10. 标准国家代码

世界国家使用：

```text
ISO 3166-1 alpha-3
```

例如：

```text
China       CHN
France      FRA
Japan       JPN
United States USA
Germany     DEU
```

数据库：

```text
sovereign_country_code
```

---

# 11. 中国省级代码

中国 Admin1 使用六位行政区划代码。

例如：

```text
北京    110000
天津    120000
河北    130000
山西    140000
内蒙古  150000

辽宁    210000
吉林    220000
黑龙江  230000

上海    310000
江苏    320000
浙江    330000
安徽    340000
福建    350000
江西    360000
山东    370000

河南    410000
湖北    420000
湖南    430000
广东    440000
广西    450000
海南    460000

重庆    500000
四川    510000
贵州    520000
云南    530000
西藏    540000

陕西    610000
甘肃    620000
青海    630000
宁夏    640000
新疆    650000

台湾    710000
香港    810000
澳门    820000
```

数据库：

```text
admin1_code
```

---

# 12. 不要根据中文示例做 Migration

旧文档中的：

```ts
const REGION_CODE_MAP = {
  新疆: "650000",
  上海: "310000",
};
```

不适用于当前数据库。

当前 seed 中实际可能是：

```text
Xinjiang
Shanghai
Zhejiang
```

因此实施前必须先查询真实数据。

---

# 13. Migration 强制前置检查

在编写任何映射之前，先执行：

```sql
SELECT DISTINCT country
FROM places
ORDER BY country;
```

然后：

```sql
SELECT DISTINCT country, region
FROM places
ORDER BY country, region;
```

只有得到真实结果后，才能建立一次性 migration mapping。

例如如果实际数据确认存在：

```text
China / Xinjiang
China / Shanghai
China / Zhejiang
```

才允许建立：

```ts
const REGION_CODE_MAP = {
  Xinjiang: "650000",
  Shanghai: "310000",
  Zhejiang: "330000",
};
```

禁止根据文档示例猜测数据库内容。

---

# 14. Location Code 不再主要依赖字符串 Mapping

长期方案不是：

```text
region name
↓
lookup table
↓
admin1Code
```

而是：

```text
Place 经纬度
↓
Point-in-Polygon
↓
country polygon
↓
province polygon
↓
标准 code
```

字符串 mapping 只允许用于：

```text
历史数据 migration
异常修复
人工 fallback
```

不作为长期核心定位逻辑。

---

# 15. 行政位置自动解析

Atlas 应建立：

```ts
resolveAdministrativeLocation()
```

概念接口：

```ts
interface AdministrativeLocation {
  sovereignCountryCode: string | null;
  admin1Code: string | null;
}
```

输入：

```ts
longitude
latitude
```

输出例如：

```json
{
  "sovereignCountryCode": "CHN",
  "admin1Code": "650000"
}
```

---

# 16. 世界国家定位

使用：

```text
World Admin0 Polygon
```

执行：

```text
Point-in-Polygon
```

例如：

```text
经纬度
↓
落入 China polygon
↓
CHN
```

无需在运行时调用：

```text
Google
Mapbox
高德
天地图
Nominatim
```

等外部 Reverse Geocoding API。

---

# 17. 中国省份定位

当：

```text
sovereignCountryCode === CHN
```

继续使用：

```text
China Admin1 Polygon
```

判断：

```text
Point-in-Polygon
```

例如：

```text
121.47, 31.23
↓
上海 Polygon
↓
310000
```

或者：

```text
新疆某 Place
↓
Xinjiang Polygon
↓
650000
```

---

# 18. 为什么使用本地 Polygon 定位

这样保证：

```text
地图展示 geometry
=
行政归属判断 geometry
```

避免：

```text
外部 API 认为某点属于 A
Atlas Polygon 认为属于 B
```

同时：

```text
无 API key
无网络依赖
无调用费用
无第三方命名变化
```

---

# 19. 什么时候计算行政归属

不要每次打开 `pre-home` 时重新做空间运算。

正确流程：

```text
创建 Place
或
修改 Place 经纬度
        ↓
resolveAdministrativeLocation()
        ↓
写入 D1
```

例如：

```text
sovereign_country_code = CHN
admin1_code = 650000
```

之后 pre-home 只读取结果。

---

# 20. 坐标系统一

Atlas 内部行政判断统一：

```text
WGS84
EPSG:4326
```

所有以下数据必须使用同一体系：

```text
Place longitude / latitude
World Admin0
China Admin1
China Admin0
China Boundary
```

禁止将：

```text
GCJ-02
BD-09
```

坐标直接用于 WGS84 Polygon 判断。

---

# 21. 数据库字段

新增：

```text
places.sovereign_country_code
places.admin1_code
```

保留：

```text
country
region
```

因此：

```text
country / region
→ UI 显示

code fields
→ 机器逻辑
```

---

# 22. MapPoint 必须同步升级

这是旧版文档遗漏的关键部分。

`pre-home` 实际使用：

```text
MapPoint[]
```

因此：

```ts
MapPoint
```

必须新增：

```ts
sovereignCountryCode: string | null;
admin1Code: string | null;
```

例如：

```ts
interface MapPoint {
  // existing fields...

  country: string;

  sovereignCountryCode: string | null;
  admin1Code: string | null;
}
```

具体 nullable 规则按照现有类型风格处理。

---

# 23. 完整数据链必须更新

不能只修改数据库。

必须检查并修改：

```text
D1 places
↓
src/lib/db/public.ts
↓
getPreHomeData()
↓
MapPoint
↓
PreHome payload
↓
PreHomeGlobe
```

确保：

```text
sovereignCountryCode
admin1Code
```

最终真的到达 Globe。

---

# 24. public.ts

相关 SQL/query 必须 select：

```text
sovereign_country_code
admin1_code
```

然后映射到：

```text
sovereignCountryCode
admin1Code
```

禁止数据库已经有字段但 `MapPoint` payload 丢失。

---

# 25. Footprint 计算实际输入

不要写：

```ts
getVisitedCountries(places: Place[])
```

因为 pre-home 实际消费 MapPoint。

建议：

```ts
function getVisitedCountries(
  points: MapPoint[]
): Set<string>
```

以及：

```ts
function getVisitedChinaRegions(
  points: MapPoint[]
): Set<string>
```

也可以抽最小类型：

```ts
type FootprintPoint = Pick<
  MapPoint,
  "sovereignCountryCode" | "admin1Code"
>;
```

---

# 26. World Visited Calculation

```ts
function getVisitedCountries(
  points: FootprintPoint[]
): Set<string> {
  return new Set(
    points
      .map((point) => point.sovereignCountryCode)
      .filter(
        (code): code is string =>
          Boolean(code)
      )
  );
}
```

---

# 27. China Visited Calculation

```ts
function getVisitedChinaRegions(
  points: FootprintPoint[]
): Set<string> {
  return new Set(
    points
      .filter(
        (point) =>
          point.sovereignCountryCode === "CHN"
      )
      .map((point) => point.admin1Code)
      .filter(
        (code): code is string =>
          Boolean(code)
      )
  );
}
```

---

# 28. 港澳台语义

Atlas 中世界国家层级：

```text
大陆
香港
澳门
台湾
```

统一：

```text
sovereignCountryCode = CHN
```

中国 Admin1：

```text
台湾 = 710000
香港 = 810000
澳门 = 820000
```

因此：

World Footprint：

```text
只高亮 CHN
```

China Footprint：

```text
台湾
香港
澳门

分别作为 admin1 区域参与 visited fill
```

---

# 29. Administrative 模块

新增：

```text
src/lib/map/administrative/
```

推荐：

```text
administrative/
├── world.ts
├── china.ts
├── location.ts
├── style.ts
└── data/
    ├── world-admin0-v2.json
    ├── china-admin0-polygon-v1.json
    ├── china-admin1-v1.json
    ├── china-admin1-internal-border-v1.json
    └── README.md
```

---

# 30. Boundaries 与 Administrative 分离

现有：

```text
boundaries/
```

负责：

```text
China national border
islands
maritime line
```

Geometry 主要是：

```text
LineString
MultiLineString
```

新增：

```text
administrative/
```

负责：

```text
国家 Fill
省级 Fill
Point-in-Polygon
内部行政边界
```

Geometry：

```text
Polygon
MultiPolygon
```

---

# 31. 必须新增 China Admin0 Polygon

当前已有：

```text
china-national-border-v1
```

如果 geometry 是：

```text
MultiLineString
```

它不能用于：

```text
MapLibre fill
```

因此必须新增：

```text
china-admin0-polygon-v1.json
```

Geometry：

```text
Polygon / MultiPolygon
```

---

# 32. China Admin0 Polygon 来源

不要从最终 boundary line 猜 polygon。

如果当前：

```text
scripts/generate-china-boundary.mjs
```

原始输入就是 polygon，再通过：

```text
mapshaper -lines
```

生成国境线，则应：

```text
同一个官方 Polygon source
      │
      ├── 保留 Polygon
      │      ↓
      │ china-admin0-polygon
      │
      └── -lines
             ↓
        national boundary
```

这样 China Fill 与 China Boundary 同源。

如果官方数据中已有：

```text
BOUA
```

等 Polygon 数据，应优先直接使用官方面数据。

---

# 33. China Admin1

需要：

```text
china-admin1-v1.json
```

包含：

```text
中国省级行政区 Polygon
```

并带稳定：

```text
Feature.id = admin1Code
```

例如：

```json
{
  "id": "650000",
  "properties": {
    "countryCode": "CHN",
    "admin1Code": "650000",
    "name": "Xinjiang"
  }
}
```

显示名称具体使用中文/英文由 UI 决定。

机器 ID 不变。

---

# 34. China Internal Borders

必须新增：

```text
china-admin1-internal-border-v1.json
```

只负责：

```text
省与省之间
自治区与省之间
直辖市与周边之间
港澳与广东之间
```

等内部行政界线。

---

# 35. 为什么需要 Internal Borders

如果直接给每个 admin1 Polygon 做：

```text
line outline
```

那么：

```text
台湾外轮廓
中国海岸轮廓
国家外边界
```

会与：

```text
china-islands
china-national-border
```

重复绘制。

最终出现：

```text
双线
更亮的接缝
不一致线宽
```

Layer 顺序无法解决完全重合 geometry 的双重渲染。

---

# 36. China Footprint 边界职责

最终规则：

```text
China Admin1
├── Fill
└── Internal Borders only

China Authority Boundary
├── National external border
├── Taiwan / island external outline
└── Maritime boundary
```

因此：

```text
省级数据不绘制国家外轮廓
```

---

# 37. World Admin0 数据源

第一版明确采用：

> Natural Earth Admin 0 Countries — 110m

用途：

```text
World Footprint
```

理由：

```text
pre-home 是全球尺度
110m 数据量较小
适合 Globe 首屏
公开许可清晰
拥有稳定行政属性
```

当前不要默认使用 50m。

---

# 38. 为什么第一版选择 110m

World Footprint 主要是：

```text
全球观察
```

不是：

```text
国家边境局部 GIS
```

因此：

```text
110m
→ 优先

50m
→ 只有实机发现小国表现不可接受时再评估
```

---

# 39. Natural Earth 不能原样进入 Atlas

Natural Earth 只是：

```text
World base administrative source
```

必须经过：

```text
Atlas normalization
```

不能：

```text
download
↓
直接 dynamic import
```

---

# 40. World Normalization Pipeline

建立：

```text
scripts/generate-world-administrative.mjs
```

流程：

```text
Natural Earth 110m
        ↓
检查实际字段
        ↓
统一 Atlas sovereign code
        ↓
处理中国相关 Feature
        ↓
删除将由 China override 替代的 geometry
        ↓
插入 china-admin0-polygon
        ↓        （需先简化到 110m 密度，见下）
删除无关属性
        ↓
设置 Feature.id
        ↓
断言 Feature.id 唯一
        ↓
world-admin0-v2.json
```

## 40.1 China override 必须简化到 110m 密度

Atlas 的 `china-admin0-polygon` 由县级多边形 dissolve 得来，细节远高于 110m。

若原样插入，全球视角下会出现：

```text
中国轮廓比周围所有国家锐利
        ↓
视觉上"跳"出来
```

因此插入前必须对 China override 单独做一次简化，使其顶点密度与 110m 邻国相当。

这是本 pipeline 中独立于 China boundary 生成的一步。

## 40.2 实测体积

```text
NE 110m 原始                          819 KB   (177 feature × 168 属性)
剥到 id + 2 属性                      251 KB   减少 69%
```

属性剥离是关键一步：NE 的 168 个属性占据了大部分体积。

## 40.3 Feature.id 唯一性断言

生成脚本必须验证：

```text
new Set(features.map(f => f.id)).size === features.length
```

不通过则 `process.exit(1)`。这条断言正是 §44 撞号问题的守门人。

---

# 41. 不要假设 Natural Earth 字段

生成脚本必须先检查实际数据中的：

```text
ADMIN
SOVEREIGNT
ADM0_A3
SOV_A3
TYPE
NAME
```

等字段。

具体版本字段可能变化。

不得提前硬编码：

```text
TWN 一定怎么表示
HK 一定怎么表示
MO 一定怎么表示
```

而不检查真实数据。

## 41.1 已实测结论（ne_110m_admin_0_countries）

```text
feature 数量        177
每 feature 属性数   168
```

**港澳不是独立 feature**：按 `NAME` / `ADMIN` / `SOVEREIGNT` / `ADM0_A3` 四个字段检索，
`Hong Kong` 与 `Macau` 均为 **0 命中**，已包含在中国 feature 内。

因此 110m 下不存在"港澳变成额外主权实体"的风险，§43 实际只需处理 **Taiwan**。

**`ISO_A3` 存在 `-99` 哨兵值**，共 5 个 feature：

```text
Norway      ISO_A3="-99"   ADM0_A3="NOR"
France      ISO_A3="-99"   ADM0_A3="FRA"
N. Cyprus   ISO_A3="-99"   ADM0_A3="CYN"
Somaliland  ISO_A3="-99"   ADM0_A3="SOL"
Kosovo      ISO_A3="-99"   ADM0_A3="KOS"
```

唯一性对比：

```text
ISO_A3   → 173 唯一 / 177      ✗ 五个 feature 撞号
ADM0_A3  → 177 唯一 / 177      ✓
```

这是 §44 必须使用 `ADM0_A3` 而非 `ISO_A3` 的原因。

---

# 42. China Override

World Admin0 中：

```text
普通国家
→ Natural Earth geometry
```

China：

```text
CHN
→ Atlas china-admin0-polygon
```

最终：

```text
World Footprint
```

和：

```text
China Footprint
```

共享同一套中国权威 polygon 来源。

---

# 43. 中国相关 Feature Normalization

World 数据生成时必须检查 Natural Earth 中与以下地区有关的 Feature：

```text
China
Taiwan
Hong Kong
Macau
```

以及实际版本可能存在的其他相关表达。

转换后 Atlas 的世界 sovereign layer 必须保证：

```text
CHN
```

只作为一个 Atlas sovereign country。

不能让相关原始 Feature 继续独立参与 Footprint country fill。

## 43.1 实测结论

按 §41.1 的四字段检索（ne_110m_admin_0_countries）：

```text
Taiwan       → 1 feature，ADM0_A3 = TWN     必须处理
Hong Kong    → 0 feature                     无需处理
Macau        → 0 feature                     无需处理
```

港澳已包含在中国 feature 内，**110m 下不会成为额外主权实体**。

因此本节实际只需处理：

```text
Taiwan → 从世界 sovereign layer 中移除
       → 由中国 Admin0 Polygon 覆盖
```

若未来改用 50m 或其他版本，必须重新按 §41 检查港澳是否变为独立 feature。

---

# 44. Feature ID

World：

```text
Feature.id = ADM0_A3
```

**不是 `ISO_A3`。**

原因见 §41.1：`ISO_A3` 对 Norway / France / N. Cyprus / Somaliland / Kosovo
五个 feature 取值 `"-99"`，会产生 5 个 feature 共用同一个 `Feature.id`。

MapLibre `feature-state` 以 `(source, id)` 为键，撞号的后果是可见且必然的：

```text
setFeatureState({ id: "-99" }, { visited: true })
        ↓
Norway / France / N. Cyprus / Somaliland / Kosovo
全部同时被高亮
```

即用户去过法国，挪威会一起亮起。

例如：

```text
CHN
FRA
JPN
USA
```

China：

```text
Feature.id = admin1Code
```

例如：

```text
310000
650000
810000
```

这是 `feature-state` 的基础。

生成脚本必须断言 `Feature.id` 唯一，见 §40。

---

# 45. Feature State

Visited 状态必须使用：

```text
MapLibre feature-state
```

而不是修改 GeoJSON。

例如：

```ts
map.setFeatureState(
  {
    source: "china-admin-source",
    id: "650000",
  },
  {
    visited: true,
  }
);
```

---

# 46. Geometry 与用户状态分离

行政数据：

```text
哪里是新疆
哪里是法国
```

属于静态 Geometry。

用户数据：

```text
是否去过
去过多少地方
```

属于动态 state。

禁止生成：

```json
{
  "name": "Xinjiang",
  "visited": true
}
```

这种用户专属地图资产。

---

# 47. Layer 顺序：本版本正式确定

旧文档把 Admin Fill 放在：

```text
night-hemisphere
```

上方。

本版本修改。

最终建议：

```text
space

nasa-blue-marble

administrative fill
administrative internal borders

night-hemisphere
night-lights-glow

china-national-border
china-islands
china-maritime-boundary

journey-route

clusters
cluster-count
unclustered-point

journey-stops
```

---

# 48. 为什么 Footprint Fill 在 Night 下面

行政 Footprint 属于：

```text
地表 thematic overlay
```

应该随夜面一起变暗。

例如：

```text
白天新疆
→ visited fill 清晰

进入夜面
→ fill 与地表一起变暗
```

这样不会出现：

```text
整个地球暗下去
但 visited area 仍像 UI 色块悬浮在上面
```

---

# 49. 为什么 Authority Boundary 在 Night 上面

中国国境线属于：

```text
cartographic information overlay
```

其可读性优先。

所以：

```text
night
↓
China Authority lines
```

允许国境线在夜面仍清晰。

---

# 50. Footprint Fill Style

继续维持 Atlas：

```text
克制
低饱和
半透明
```

例如概念上：

```text
visited:
opacity 0.3 – 0.5

unvisited:
opacity 0 – 0.08
```

具体值实测决定。

---

# 51. China Admin Border Style

内部省界应弱于：

```text
China Authority Boundary
```

视觉关系：

```text
National Boundary
>
Admin1 Internal Border
```

---

# 52. 小区域

香港、澳门很小。

必须保留真实 geometry。

可以通过：

```text
hover
label
轻微 outline
```

增强识别。

禁止：

```text
扩大真实 Polygon
```

---

# 53. Local Administrative Resolver

建议新增：

```text
src/lib/map/administrative/location.ts
```

负责：

```ts
resolveAdministrativeLocation(
  longitude,
  latitude
)
```

## 53.1 Resolver 运行在服务端

**明确决定：resolver 在服务端 Worker 内运行**，不在浏览器。

理由：

```text
Place 创建 / 坐标修改
        ↓
src/pages/guillaume/api/places/*.ts      服务端 APIRoute
        ↓
resolveAdministrativeLocation()
        ↓
写入 D1
```

若改为客户端计算并提交 code，则服务端无法信任 `sovereign_country_code` /
`admin1_code` 的取值 —— 行政归属会变成客户端可伪造的数据。

**代价已实测，可接受：**

```text
当前 dist/server 总体积                 916 KB
world-admin0 剥属性后                   251 KB
                  ↓
预期 dist/server                        约 1.2 MB
```

Cloudflare Workers 体积上限远高于此，因此服务端运行是可行选择。

注意：这与 §65/§66 的**客户端懒加载并不冲突**。两者是不同用途：

```text
服务端 bundle   → resolver 用，始终存在，不随页面请求传输
客户端 chunk    → Footprint 渲染用，懒加载，首次进入才下载
```

禁止因为"客户端懒加载"就误以为服务端不需要这份数据。

---

# 54. Point-in-Polygon

应使用成熟几何实现。

不要自己写射线算法，除非项目已有可靠实现。

可以使用当前依赖中已有的 GIS capability；若无，选择轻量、成熟的 Point-in-Polygon 库。

不要为了这一功能引入完整大型 GIS runtime。

---

# 55. Resolver 流程

```text
Point
↓
World Admin0
↓
得到 sovereignCountryCode

如果不是 CHN
↓
结束

如果是 CHN
↓
China Admin1
↓
得到 admin1Code
```

最终：

```json
{
  "sovereignCountryCode": "CHN",
  "admin1Code": "330000"
}
```

---

# 56. 海上或无法匹配的点

并不是所有 Place 都一定落在陆地 Polygon 中。

例如：

```text
海上景点
机场跑道附近
边界 GPS 误差
岛屿 simplify 后的小面积缺失
```

允许：

```text
sovereignCountryCode = null
admin1Code = null
```

然后：

```text
人工 fallback
```

或使用现有 textual location 辅助修正。

禁止自动乱猜。

---

# 57. 边界点

若点正好位于边界附近：

第一步：

```text
normal point-in-polygon
```

失败后可允许极小的容差策略。

如果仍无法确定：

```text
人工确认
```

Atlas 不是测绘级边界判定系统，不需要为了极少数点引入复杂高精度算法。

---

# 58. Place 创建流程

以后创建 Place：

```text
输入坐标
↓
resolveAdministrativeLocation()
↓
得到 country/admin1 code
↓
写入 D1
```

用户无需手输：

```text
650000
```

---

# 59. Place 坐标修改

如果：

```text
longitude
latitude
```

改变，则必须重新运行：

```text
resolveAdministrativeLocation()
```

并更新：

```text
sovereign_country_code
admin1_code
```

---

# 60. Display Name 与 Code

例如当前数据库：

```text
country = China
region = Xinjiang
```

可以继续保留。

最终：

```text
country = China
region = Xinjiang

sovereign_country_code = CHN
admin1_code = 650000
```

这是推荐模型。

---

# 61. 数据 Migration

现有历史数据需要一次性回填。

优先顺序：

```text
1. 根据 Place 经纬度做空间匹配

2. 失败时再使用真实 country / region mapping

3. 仍失败时人工检查
```

不要反过来完全依赖字符串。

---

# 62. Migration 前审计

先查询：

```sql
SELECT DISTINCT country
FROM places
ORDER BY country;
```

以及：

```sql
SELECT DISTINCT country, region
FROM places
ORDER BY country, region;
```

同时统计：

```text
缺坐标 Place
非法坐标 Place
```

---

# 63. Migration 验证

完成后：

```sql
SELECT *
FROM places
WHERE sovereign_country_code IS NULL;
```

检查剩余异常。

对于中国：

```sql
SELECT *
FROM places
WHERE sovereign_country_code = 'CHN'
  AND admin1_code IS NULL;
```

需要逐个检查。

---

# 64. New Place Validation

上线后，新建 Place 原则上不应该出现：

```text
有合法陆地坐标
但 sovereign_country_code 为空
```

这种情况应记录错误或提示。

---

# 65. World Administrative Lazy Load

首次打开：

```text
World + Journey
```

不要加载：

```text
world-admin0
```

第一次进入：

```text
World + Footprint
```

才加载。

---

# 66. China Administrative Lazy Load

第一次：

```text
China + Footprint
```

才加载：

```text
china-admin1
china-admin1-internal-border
```

如果 resolver 在管理端另有服务器侧/构建时数据需求，则使用独立的数据访问路径，不要求 pre-home 提前加载。

---

# 67. 加载后不删除 Source

第一次加载后：

```text
保留 source
保留 layers
```

后续只：

```text
visibility
feature-state
```

切换。

禁止：

```text
反复 removeSource / addSource
```

---

# 68. World Administrative API

建议：

```ts
ensureWorldAdministrativeLoaded(map)

showWorldAdministrative(map)

hideWorldAdministrative(map)

applyWorldVisitedState(
  map,
  visitedCountryCodes
)
```

---

# 69. China Administrative API

建议：

```ts
ensureChinaAdministrativeLoaded(map)

showChinaAdministrative(map)

hideChinaAdministrative(map)

applyChinaVisitedState(
  map,
  visitedAdmin1Codes
)
```

---

# 70. Journey API

继续抽象：

```ts
showJourneyLayers(map)

hideJourneyLayers(map)
```

PreHome 不要散写大量 layer ID。

---

# 71. 统一 applyMapState

建立一个统一状态应用入口：

```ts
async function applyMapState()
```

输入：

```text
scopeMode
viewMode
```

处理：

```text
camera
journey
journey selector
world admin
china admin
China authority
lazy load
```

---

# 72. 状态矩阵

## World + Journey

```text
world admin         hidden
china admin         hidden
journey             visible
journey selector    visible
China Authority     hidden
```

---

## China + Journey

```text
world admin         hidden
china admin         hidden
journey             visible
journey selector    visible
China Authority     visible
```

---

## World + Footprint

```text
world admin         visible
china admin         hidden
journey             hidden
journey selector    hidden
POI                  visible
```

---

## China + Footprint

```text
world admin         hidden
china admin         visible
journey             hidden
journey selector    hidden
China Authority     visible
POI                  visible
```

---

# 73. Camera

Camera 仍主要由：

```text
scopeMode
```

决定。

```text
World
→ World camera

China
→ China camera
```

不要为：

```text
Journey
Footprint
```

分别创建完全独立 Camera。

---

# 74. China Camera

China 模式必须同时覆盖：

```text
中国主体
台湾
南海主体
```

继续沿用中国 Boundary 项目确定后的 bounds/camera。

---

# 75. World 数据文件

最终：

```text
world-admin0-v2.json
```

由：

```text
Natural Earth 110m
+
Atlas China Admin0 override
```

生成。

---

# 76. China 数据文件

最终至少：

```text
china-admin0-polygon-v1.json

china-admin1-v1.json

china-admin1-internal-border-v1.json
```

以及已有：

```text
china-national-border-v1.json

china-islands-v1.json

china-maritime-boundary-v1.json
```

---

# 77. 最终 Geometry 职责

```text
china-admin0-polygon
→ 中国国家 Fill / World CHN override

china-admin1
→ 中国省级 Fill

china-admin1-internal-border
→ 中国内部省界

china-national-border
→ 国家外部国境

china-islands
→ 台湾及重要岛屿外轮廓

china-maritime-boundary
→ 南海/东海相关线
```

---

# 78. 数据 README

新增或扩展：

```text
src/lib/map/administrative/data/README.md
```

至少记录：

```text
World Admin0 source
Natural Earth version
Scale = 110m
License

China Admin0 source
China Admin1 source

CRS

conversion script

China override rules

Natural Earth China-related feature normalization

Feature ID rules

simplification
```

---

# 79. World 数据转换脚本

```text
scripts/generate-world-administrative.mjs
```

职责：

```text
读取 Natural Earth

检查实际字段

normalize country codes

处理 China-related features

插入 Atlas China Admin0 polygon

删除无关属性

输出 world-admin0-v2
```

---

# 80. China 数据转换

现有：

```text
generate-china-boundary.mjs
```

可以扩展，也可建立：

```text
generate-china-administrative.mjs
```

具体根据当前仓库代码避免重复。

目标生成：

```text
Admin0 Polygon
Admin1 Polygon
Internal Borders
```

---

# 81. Build 不联网

禁止：

```text
pnpm build
↓
下载 Natural Earth
↓
下载官方中国数据
```

数据下载与转换只在：

```text
开发阶段
```

完成。

最终 JSON 进入项目。

---

# 82. Footprint 行政数据与 Resolver 数据

尽量复用同一套 geometry。

但如果浏览器版本为了性能做了 aggressive simplification：

```text
UI geometry
```

可能不适合作为精确 resolver geometry。

原则：

```text
Source dataset 同源
```

可以根据需要生成：

```text
display variant
resolver variant
```

但不要来自两个不一致的数据来源。

---

# 83. Simplification

允许合理 Web simplification。

但是：

```text
中国边界
台湾
香港
澳门
小岛国
```

要特别检查。

不要因为 110m / simplify 导致：

```text
合法 Place 落在 Polygon 外
```

如果 resolver 需要更高精度，可保留更高精度 resolver 数据。

---

# 84. Footprint 与行政定位的精度区别

需要明确：

```text
Footprint Display
```

优先：

```text
轻量
视觉正确
```

而：

```text
Place Administrative Resolver
```

优先：

```text
稳定空间判断
```

两者可以：

```text
同源
不同 LOD
```

而不是强制使用完全相同压缩后的 JSON。

---

# 85. Phase 0 — Repository Audit

实施前首先确认真实代码。

检查：

```text
places schema
seed.sql
MapPoint
getPreHomeData
public.ts
PreHomeGlobe
现有 China boundary scripts
现有 China boundary geometry types
```

并运行：

```sql
SELECT DISTINCT country;
SELECT DISTINCT country, region;
```

或等价查询。

禁止直接依据本文示例修改数据库。

---

# 86. Phase 1 — State / UI Architecture

实现：

```text
ScopeMode
ViewMode
```

加入：

```text
Journey / Footprint
```

实现：

```text
Journey Selector visibility
Journey layer visibility
```

行政 Polygon 可暂时使用明显 TEMP geometry。

---

# 87. Phase 2 — Geography Schema

新增：

```text
places.sovereign_country_code
places.admin1_code
```

更新：

```text
DB schema
migration
domain types
MapPoint
public query
getPreHomeData
admin create/edit pipeline
```

这是 Footprint 正式实现的前置依赖。

---

# 88. Phase 3 — Administrative Resolver

实现：

```text
World Admin0 Point-in-Polygon

China Admin1 Point-in-Polygon

resolveAdministrativeLocation()
```

建立：

```text
创建 Place
修改坐标
```

时的自动 code 写入逻辑。

---

# 89. Phase 4 — Historical Data Migration

使用：

```text
坐标空间匹配
```

优先回填现有 Places。

再根据：

```text
真实 DISTINCT country / region
```

进行 fallback。

最后人工处理异常。

---

# 90. Phase 5 — China Administrative Geometry

生成：

```text
china-admin0-polygon

china-admin1

china-admin1-internal-border
```

同时解决：

```text
台湾双线
国家外轮廓双绘
```

问题。

---

# 91. Phase 6 — China Footprint

实现：

```text
MapPoint.admin1Code
↓
visited China regions
↓
feature-state
↓
China Admin1 Fill
```

验证：

```text
大陆省级行政区
台湾
香港
澳门
```

---

# 92. Phase 7 — World Administrative Geometry

下载并处理：

```text
Natural Earth Admin0 Countries 110m
```

进行：

```text
Atlas normalization
China override
Feature ID normalization
```

生成：

```text
world-admin0-v2.json
```

---

# 93. Phase 8 — World Footprint

实现：

```text
MapPoint.sovereignCountryCode
↓
visited countries
↓
feature-state
↓
World Admin0 Fill
```

---

# 94. Phase 9 — Visual Polish

最后处理：

```text
opacity
hover
labels
legend
transition
place counts
```

注意：

```text
night layer ordering
```

已经在核心架构阶段确定，不属于 Phase 9 才决定的问题。

---

# 95. 测试：Database Mapping

确认真实数据：

```text
China / Xinjiang
```

最终得到：

```text
CHN / 650000
```

但测试不能假定所有数据都使用固定英文 spelling。

Migration 应建立在真实 audit 上。

---

# 96. 测试：MapPoint

检查：

```text
D1 中 code
↓
public.ts
↓
MapPoint
```

不会丢失。

---

# 97. 测试：World Visited

输入：

```text
CHN
FRA
CHN
USA
```

结果：

```text
CHN
FRA
USA
```

---

# 98. 测试：China Visited

输入：

```text
CHN / 650000
CHN / 310000
FRA / null
CHN / 650000
```

结果：

```text
650000
310000
```

---

# 99. 测试：行政解析

典型城市坐标应解析到预期：

```text
上海
→ CHN / 310000
```

```text
新疆已知测试点
→ CHN / 650000
```

```text
法国测试点
→ FRA / null
```

不要只测试名称 mapping。

---

# 100. 测试：港澳台

必须测试：

```text
台湾点
→ CHN / 710000

香港点
→ CHN / 810000

澳门点
→ CHN / 820000
```

---

# 101. 测试：Footprint Night Layer

目视确认：

```text
visited fill
```

进入夜面后自然变暗。

同时：

```text
China Authority Boundary
```

仍保持可读。

---

# 102. 测试：台湾双线

China Footprint 中：

```text
台湾外轮廓
```

只能由：

```text
China Authority island layer
```

承担。

Admin1 不应再额外绘制同一外轮廓。

---

# 103. Network 验收

初始：

```text
World + Journey
```

不加载：

```text
world-admin
china-admin
```

第一次 World Footprint：

```text
world-admin
→ 下载一次
```

第一次 China Footprint：

```text
china-admin
→ 下载一次
```

后续切换：

```text
新增请求 = 0
```

---

# 104. 状态切换压力测试

依次：

```text
World Journey
→ World Footprint
→ China Footprint
→ China Journey
→ World Journey
→ China Journey
→ China Footprint
→ World Footprint
```

检查：

```text
无残留 Fill
无 Journey Route 残留
无双重行政图层
无 Journey Selector 状态错误
无重复下载
```

---

# 105. 不允许事项

禁止：

```text
✗ 用中文 REGION_CODE_MAP 假设当前数据库是中文值

✗ 只给 Place 加 code，不更新 MapPoint

✗ 只更新 D1，不更新 public.ts

✗ 用 China MultiLineString 当 Fill Polygon

✗ World Footprint 直接原样使用 Natural Earth China Feature

✗ 让 Natural Earth Taiwan/HK/MO 直接成为额外 sovereign footprint

✗ Admin1 polygon outline 与 Authority island outline 重复绘制

✗ Footprint Fill 放 Night Hemisphere 上方

✗ Footprint 正式功能先于 schema/code pipeline 实施

✗ 每次打开首页重新 Point-in-Polygon 所有 Places

✗ 创建 Place 时靠 region 字符串长期判断行政区

✗ 使用 GCJ-02 点直接匹配 WGS84 Polygon

✗ 用 region 名称作为永久 Feature ID

✗ Build 时联网下载行政数据

✗ 每次 View 切换重新下载 Polygon

✗ 为港澳显示而扩大真实 Polygon

✗ 把 visited 写进静态 GeoJSON
```

---

# 106. Codex 实施前必须输出的 Audit

在正式修改前，Codex 应先报告：

```text
1. 当前 places schema

2. DISTINCT country

3. DISTINCT country / region

4. MapPoint 当前完整字段

5. getPreHomeData 数据链

6. China boundary generator 输入 geometry

7. 当前 China boundary 三个文件 geometry type

8. 是否已经存在可复用 China polygon source

9. 当前 PreHome layer 顺序

10. 当前 Journey visibility 实现位置
```

确认后再编码。

---

# 107. 完成定义 — Database

必须：

```text
places 有 sovereign_country_code

places 有 admin1_code

历史 Places 已完成回填或明确列出异常

新 Place 可以自动计算 code

坐标修改会重新计算 code
```

---

# 108. 完成定义 — MapPoint

必须：

```text
MapPoint 带 sovereignCountryCode

MapPoint 带 admin1Code

getPreHomeData 正确传递
```

---

# 109. 完成定义 — China Data

必须：

```text
China Admin0 Polygon 存在

China Admin1 Polygon 存在

China Internal Border 存在

港澳台存在

Authority Boundary 与 Admin Border 不双绘
```

---

# 110. 完成定义 — World Data

必须：

```text
Natural Earth 110m 有明确版本记录

经过 Atlas normalization

China 被 Atlas Admin0 Polygon override

相关 China feature 不重复参与 World sovereign footprint
```

---

# 111. 完成定义 — Footprint

World：

```text
visited country 正确高亮
```

China：

```text
visited admin1 正确高亮
```

Footprint：

```text
不显示 Journey Selector
不显示 Journey Route
```

---

# 112. 完成定义 — Journey

Journey 模式：

```text
现有 Journey 功能无回归
```

---

# 113. 完成定义 — Performance

必须：

```text
首次页面不下载行政 Polygon

按需 lazy load

加载后不重复请求

打开 pre-home 不重新计算所有 Point-in-Polygon
```

---

# 114. 最终系统架构

```text
                          PLACE
                            │
                     longitude/latitude
                            │
                            ▼
             resolveAdministrativeLocation
                            │
              ┌─────────────┴─────────────┐
              │                           │
        World Admin0                 China Admin1
              │                           │
              ▼                           ▼
             CHN                        650000
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼
                            D1
                            │
              sovereign_country_code
                    admin1_code
                            │
                            ▼
                      public.ts
                            │
                            ▼
                         MapPoint
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
      World Footprint              China Footprint
         ISO3 state                 Admin1 state
```

---

# 115. 地图数据架构

```text
Natural Earth Admin0 110m
            │
            ▼
  World normalization
            │
            ├──────── normal countries
            │
            └──────── CHN override
                         │
                         ▼
             china-admin0-polygon


Official China Polygon Data
            │
      ┌─────┼─────────┐
      │     │         │
      ▼     ▼         ▼
   Admin0  Admin1   Boundary
   Polygon Polygon     Lines
      │     │            │
      │     ├── internal │
      │     │   borders  │
      │     │            │
      ▼     ▼            ▼
    World   China      Authority
   CHN Fill Footprint   Boundary
```

---

# 116. 最终 Layer Stack

```text
space

NASA Blue Marble

Administrative Fill
Administrative Internal Borders

Night Hemisphere
Night Lights

China Authority Boundary

Journey Route
  only in Journey

POI / Cluster

Journey Stops
  only in Journey
```

---

# 117. 产品语义

Scope 回答：

> 我现在观察世界还是中国？

Journey 回答：

> 我去了哪里，以及我是怎样旅行的？

Footprint 回答：

> 我的旅行覆盖了哪些国家与行政区域？

Administrative Resolver 回答：

> 这个 Place 在标准行政结构中属于哪里？

四者职责不要混淆。

---

# 118. 一句话实施原则

> **Atlas 不再通过 `country / region` 自由文本长期猜测地点行政归属，而是在 Place 创建或坐标修改时，使用与 Footprint 同源的 World Admin0 / China Admin1 Polygon 对 WGS84 经纬度执行 Point-in-Polygon，得到 `sovereignCountryCode` 与 `admin1Code` 并持久化到 D1；这些字段必须完整传递到 `MapPoint`，再驱动 World / China Footprint。World 使用 Natural Earth Admin0 110m 并由 Atlas 中国 Admin0 Polygon 覆盖中国相关 geometry；China Footprint 使用 Admin1 Fill + Internal Borders，国家与台湾等外轮廓继续由 China Authority Boundary 独立负责。**