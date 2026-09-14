# Atlas 中国国境线实现交接文档（修订版）

> **本文档替代 `Atlas 中国国境线实现交接文档.md`。** 原文档的架构原则层有效，但实施分析层基于对 Atlas 地图架构的错误假设，照其字面实施会浪费大量工量。本修订版以实际代码为依据重写。
>
> **修订日期：2026-09-14**

---

## 0. 本次修订说明

原文档的核心假设是「Atlas 使用带国家多边形的矢量世界底图，需要过滤掉底图里的中国边界再叠加权威边界」。**这个假设不成立。**

经核对实际代码：

| 原文档假设 | 实际情况 |
| --- | --- |
| 存在 `world-country-fill` / `world-country-border` 图层 | 不存在 |
| 存在带 `iso_a3` 属性的 vector source | 不存在 |
| 存在中国 polygon、印度边界、台湾 polygon | 不存在 |
| 存在 `PreHome.tsx` | 项目是 Astro + 原生 TS，**无 React** |
| 底图边界可以按 ISO code 过滤 | 底图是**栅格瓦片**，边界是烧进像素的，无法过滤 |

因此原文档 §2、§10、§11、§12、§13、§17 的推演需要重写；§3、§7、§19、§20、§21、§27、§31、§32 的原则予以保留。

同时本次修订**收缩了实施范围**（见 §2）：只改 pre-home，且只在中国模式显示。

---

## 1. Atlas 地图架构现状（事实基础）

Atlas 有**两个互相独立的地图面**，两者都是**纯栅格底图**，仓库内**没有任何矢量边界数据**。

| 页面 | 组件 | Style 常量 | 底图 | 图层 |
| --- | --- | --- | --- | --- |
| `/`、`/map/` | `src/components/InteractiveMap.astro` | `MAP_STYLE`<br>`src/lib/map/config.ts:4-29` | OpenStreetMap 标准栅格 | 仅 `open-street-map` |
| `/pre-home/` | `src/components/PreHomeGlobe.astro` | `GLOBE_STYLE`<br>`src/lib/map/config.ts:31-62` | NASA Blue Marble 卫星影像 | `space` + `nasa-blue-marble` |

已验证的仓库事实：

- 全仓库无 `.geojson` / `.topojson` / `.pmtiles` / `.mbtiles` 文件。
- 两个 style 中均无 vector source，无 `iso_a3`，无任何国家 polygon 或国界 line。
- `PreHomeGlobe.astro:250-362` 的 `load` 回调中，图层添加顺序为：
  `night-hemisphere` → `night-lights-glow` → `journey-route` → `clusters` → `cluster-count` → `unclustered-point` → `journey-stops`

**结论：**

1. 在 pre-home（卫星影像）上叠加中国国界**不会产生双线、重影或底部漏线**——影像上本来就没有政治边界。原文档 §10 的方案 A 与方案 B 在本项目中**均不适用**。
2. `/` 与 `/map/` 使用 OSM 标准栅格，其 Carto 样式会把 `admin_level=2` 国界画入瓦片像素。这是**栅格像素，不是 feature，无法按 `iso_a3` 过滤**。这两页本次不改，但其边界与 pre-home 将不一致（见 §9）。
3. 在 pre-home 的**世界模式**下单画中国国界，会使中国成为地球上唯一一个有国界的国家。**这是本次范围收缩的直接原因。**

---

## 2. 任务范围（已收缩）

### 本次实施

```text
只改 pre-home 一个页面
只在「China」模式显示中国国界
World 模式不显示任何国界
```

### 本次不做

```text
/ 与 /map/（OSM 底图）的边界处理
世界其他国家边界
省级行政区边界
PMTiles / 瓦片管线
```

### 范围收缩带来的好处（重要）

- 世界模式无边界 → **不存在「中国是地球上唯一有国界的国家」这个视觉与语义问题**。
- 中国模式下 `canRotate()` 返回 `false`（`PreHomeGlobe.astro:132` 要求 `mode === "world"`）→ **地球不自转，国界线静止可读**，无需处理旋转跟随。
- 数据可**懒加载**：World 模式一次请求都不发（见 §4）。

---

## 3. 保留的核心设计原则

以下原则来自原文档，经核对与 Atlas 现状一致，予以保留：

1. **世界底图负责世界，中国政治边界由 Atlas 自己维护的 China Authority Layer 负责。** 不依赖任何第三方底图数据判断中国边界。
2. **Geometry 与 Style 严格分离。** GeoJSON 中不存颜色，不存任何视觉属性。数据只回答「是什么、在哪里、属于什么类别」。
3. **统一 Political Boundary Policy 层。** 禁止在多个组件中散写 `if (country === "China")`。
4. **图层与 source 命名统一**，禁止 `cnFix` / `chinaHack` 之类临时命名。
5. **不在代码注释或 README 中声称已通过合规审核。**
6. **不为视觉效果修改国界 geometry。**
7. **不直接 `npm install` 来路不明的中国地图 GeoJSON 包。**

---

## 4. 数据获取与交付方式

原文档遗漏了「如何避免重复网络请求」这一工程问题。本节给出完整答案，分两层。

### 4.1 第一层：数据进仓库，运行时不再触达第三方

**Atlas 已有现成先例，照搬即可：`scripts/generate-night-lights.mjs`。**

其形态为：

```text
第三方数据源（一次性，仅开发时）
        ↓  node scripts/generate-night-lights.mjs
public/data/night-lights.json   ← 提交进仓库
        ↓  运行时
浏览器  ← 只读本地静态文件，永不请求第三方
```

中国边界数据采用同一形态：建立 `scripts/generate-china-boundary.mjs`，将授权数据源转换为 GeoJSON 落盘并提交。**运行时永不请求任何外部地图服务。**

### 4.2 第二层：浏览器不要每次重新请求

**已发现的现存问题：**

```
dist/client/_headers
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

`_headers` 只为 `/_astro/*`（即 `src/` 下经 Vite 打包并带哈希指纹的资源）配置了**一年 immutable 缓存**。`public/` 下的文件**没有任何缓存规则**。

后果：`public/data/night-lights.json`（207KB）目前**每次加载 pre-home 都会重新校验**，且它在 `PreHomeGlobe.astro:279` 是**无条件 fetch**，即使用户从不查看夜景。这正是「每一次都发请求」的来源。

### 4.3 两种交付方案

| 方案 | 做法 | 首次请求 | 后续请求 | 缓存 |
| --- | --- | --- | --- | --- |
| **A. 动态 import** | 数据放 `src/lib/map/boundaries/data/`，用 `await import()` 引入 | 点 China 时一次 | **0** | 自动获得 `_astro/*` 规则 → immutable 一年 |
| **B. `public/` + fetch** | 数据放 `public/maps/china/`，`fetch()` 加载 | 点 China 时一次 | 0（需补规则） | **必须新增 `public/_headers` 规则** |

### 4.4 选择依据

- 数据 **< 约 500KB** → **方案 A**。零配置，白拿 immutable 缓存；配合懒加载，不点 China 则**零请求**。
- 数据 **> 约 1MB** → **方案 B**。大 JSON 走 `fetch` + `JSON.parse` 优于塞进 JS chunk，且这是通往 PMTiles 的路径。**（原文档 §16 的 PMTiles 方向正确，但属后续阶段。）**

> **走方案 B 时必须同时新增 `public/_headers`，参照现有格式：**
> ```
> /maps/china/*
>   Cache-Control: public, max-age=31536000, immutable
> ```
> 并配合手动版本号文件名（`-v1`、`-v2`），因为 `public/` 下的文件不会被自动 fingerprint。原文档 §25 关于手动版本号的说法正确。

### 4.5 不采用的方式

**不要把 GeoJSON 内联进页面 HTML。** 虽然 `PreHomeGlobe.astro:12,67` 已有 `data-globe-payload` 这种内联模式的先例，但 pre-home 页面按 README 设定为 `Cache-Control: no-store`，内联意味着**每次页面浏览都完整重传一次**，对数百 KB 的边界数据严格劣于方案 A 与 B。

（现有 points/routes payload 体积小，维持现状即可，无需改动。）

---

## 5. 数据目录与模型

### 5.1 目录

```text
public/maps/china/                      # 方案 B；方案 A 则为 src/lib/map/boundaries/data/
  china-national-border-v1.geojson      # 中国大陆国界 + 必要岛屿外轮廓
  china-islands-v1.geojson              # 台湾岛、澎湖、钓鱼岛及附属岛屿、南海重要岛屿
  china-maritime-boundary-v1.geojson    # 南海断续线、东海有关线段
  README.md                             # 版本、来源、人工核验记录
```

### 5.2 Feature 属性

```json
{
  "type": "Feature",
  "properties": {
    "countryCode": "CHN",
    "boundaryType": "national | island | maritime",
    "sovereignty": "CHN",
    "renderClass": "china-national | china-islands | china-maritime",
    "source": "authoritative-cn",
    "preserveGeometry": true
  },
  "geometry": { "type": "LineString", "coordinates": [] }
}
```

不含任何颜色、线宽或其他视觉属性。

### 5.3 南海断续线（重点）

**必须存储为真实 geometry，不得用虚线模拟。**

不允许：

```css
border-style: dashed;
```
```js
"line-dasharray": [4, 3]
```

南海断续线的每一段具有独立的位置、长度、方向和间隔，**不是等间距虚线**。

正确做法：

```json
{
  "type": "Feature",
  "properties": { "countryCode": "CHN", "boundaryType": "maritime", "renderClass": "china-maritime" },
  "geometry": {
    "type": "MultiLineString",
    "coordinates": [
      [[lng1, lat1], [lng2, lat2]],
      [[lng3, lat3], [lng4, lat4]]
    ]
  }
}
```

每段直接渲染为**实线**。

**明确禁止：**

- 实现 `generateElevenDashLine()` 之类的程序化生成函数
- 按「9 段 / 10 段 / 11 段」的数量假设生成线段
- 凭视觉手工绘制

内部统一称 `South China Sea discontinuous line` 或 `china-maritime-boundary`。geometry **必须依据权威标准地图的实际位置**。

### 5.4 数据版本记录

建立 `data/maps/china/README.md`：

```md
# China Boundary Dataset

Version: <版本号>
Source: <授权来源>
Date: <日期>

Manual verification:
- Xinjiang:    checked / pending
- Tibet:       checked / pending
- Taiwan:      checked / pending
- Diaoyu:      checked / pending
- South China Sea discontinuous line: checked / pending
```

---

## 6. 代码结构

### 6.1 模块位置

遵循 Atlas 现有约定 `src/lib/map/`（**不是**原文档 §17 建议的 `src/map/`）：

```text
src/lib/map/
├── config.ts              # 现有
├── globe.ts               # 现有
├── points.ts              # 现有
└── boundaries/            # 新增
    ├── index.ts           # registerPoliticalBoundaryLayers(map)
    ├── policy.ts          # BOUNDARY_POLICY
    ├── china.ts           # China layer 注册
    ├── style.ts           # 样式常量（zoom 表达式集中于此）
    └── data/              # 仅方案 A 需要
```

### 6.2 Policy 层

```ts
// src/lib/map/boundaries/policy.ts
export const BOUNDARY_POLICY = {
  CHN: "authoritative-cn",
  DEFAULT: "base",
} as const;
```

### 6.3 注册入口

```ts
// src/lib/map/boundaries/index.ts
export function registerPoliticalBoundaryLayers(map: maplibregl.Map): void {
  registerChinaBoundaryLayers(map);
}
```

`PreHomeGlobe.astro` 只调用这一个函数，**不得**把边界逻辑写进组件。

### 6.4 图层与 source 命名

```text
source:  china-boundary-source
         china-maritime-source
         china-islands-source

layer:   china-national-border
         china-islands
         china-maritime-boundary
```

（本次不需要 `china-border-mask`——不存在需要遮盖的底图边界。原文档 §18 列出的 mask 层在本项目无用途。本次也不需要 `china-provincial-boundary`。）

---

## 7. 渲染与模式切换

### 7.1 图层插入位置

在 `PreHomeGlobe.astro` 的 `load` 回调中，插入于 `night-lights-glow` **之后**、`journey-route` **之前**：

```text
space
nasa-blue-marble
night-hemisphere
night-lights-glow
china-national-border        ← 新增
china-islands                ← 新增
china-maritime-boundary      ← 新增
journey-route
clusters
cluster-count
unclustered-point
journey-stops
```

保证 POI、cluster 与路线**始终在国界之上**，不受影响。

### 7.2 初始状态与模式切换

注册时设 `layout: { visibility: "none" }`（World 模式默认不显示）。

在现有的 `applyMode()`（`PreHomeGlobe.astro:212-227`）中切换：

```ts
const boundaryVisibility = mode === "china" ? "visible" : "none";
for (const layer of ["china-national-border", "china-islands", "china-maritime-boundary"]) {
  if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", boundaryVisibility);
}
```

同时按 §4.4 与 §9.1 决定是否在此时懒加载数据。

### 7.3 样式

沿用 pre-home 已有的线条语言颜色 `#d5ddd8`（现由 `journey-route` 使用），保证视觉一致。

宽度按 zoom 插值，参考区间（实测后定稿）：

```text
中国国家边界   0.9 – 1.3 px
南海断续线     0.8 – 1.2 px
重要岛屿       0.7 – 1.0 px
```

样式常量集中在 `boundaries/style.ts`，不写在组件里。

**关于夜面：** `night-hemisphere` 是不透明度 0.64 的黑色填充，随时间移动，压在底图之上。国界线添加在其后会绘制于夜面之上——这是正确顺序。但同一条线需同时压在明亮地形与暗部上，`#d5ddd8` 已验证可用。

### 7.4 与地图主题（深色/浅色）解耦

若日后支持主题切换，**只切换 style，不准备两份 GeoJSON**。geometry 永远只有一份。

---

## 8. 数据来源与阻塞点（务必先读）

### 8.1 现实情况

原文档对数据来源的谨慎态度（§4、§23、§31）是正确的。但需要明确：

**本阶段的主要阻塞点不是代码，是数据。**

- **自然资源部标准地图服务系统**提供的是 **JPG / EPS**，不是机器可读矢量数据；其使用条款还绑定审图号。转成 GeoJSON 只能人工描线，而人工描线被明确禁止。
- **天地图**需要 API key，有使用条款，不提供边界数据的批量 GeoJSON 下载。
- **有测绘资质的商业数据源**（原文档 §4.3 的推荐）需要合同与费用。

**结论：**

```text
§10 Phase 1（架构）       → 可以由实施者独立完成
§10 Phase 2（权威数据接入）→ 无法从公开资源完成，必须由项目方提供授权数据
```

**Phase 2 是外部依赖，不是可排期的编码任务。** 原文档把它写成了普通实施步骤，这是排期上最大的误导。

### 8.2 在拿到数据之前

允许使用 placeholder，但**必须显式标记**：

```ts
// TEMP DATA — NOT FOR PRODUCTION
```

并在 `data/maps/china/README.md` 中记录：

```text
Authoritative CN boundary dataset pending.
```

**正确性优先于速度。** 不得让实施者「寻找一份看起来差不多的数据」直接提交为 production。

---

## 9. 台湾与主权语义（重要纠正）

原文档 §7 担心「台湾被底图数据模型当成另一个国家」。**该问题已经存在，但不在边界几何里。** 位置有三处：

### 9.1 国家名称匹配

```ts
// src/lib/map/globe.ts:111-127
const CHINA_COUNTRY_NAMES = new Set(["china", "cn", "chn", "中国", "中华人民共和国", ...]);
```

只做精确匹配。若某地点记为 `"Taiwan"` 或 `"中国台湾"`，**China 模式会把它过滤掉**。

### 9.2 Regions 统计

```ts
// src/lib/db/public.ts:227-230
const regions = new Set(
  places.filter(...).map((place) => `${place.country}${place.region}`)
);
```

按 `country` + `region` 组合去重。台湾若 `country = "Taiwan"`，会**单独计为一个 region**，直接影响首页统计数字。

### 9.3 数据模型缺少国家代码

```ts
// src/types/domain.ts:17, 30
country: string;   // 自由文本，无国家代码
```

**这是数据录入与 schema 问题，修改 GeoJSON 无法解决。**

若决定引入国家代码分层（原文档 §27 的方向正确）：

```ts
interface AtlasRegion {
  id: string;
  sovereignCountryCode: string;     // "CHN"
  administrativeRegion?: string;    // "Taiwan"
  atlasRegion?: string;
}
```

这需要 **`places` 表的 D1 migration**，属于独立工作项，应在边界工作**之前或并行**决策，不混在一起做。

**在边界任务中，实施者只需要保证：GeoJSON 中台湾归属 `countryCode: "CHN"`、`sovereignty: "CHN"`，不写 `TWN`。**

---

## 10. 相机与视野（原文档遗漏）

### 10.1 问题

```ts
// src/lib/map/globe.ts:9
china: { center: [104, 35], zoom: 3.45 }
```

画布高度为 `clamp(560px, 78svh, 820px)`（`src/styles/global.css:78`）。

按 Web Mercator 推算：z3.45 时世界宽约 5595px，700px 高度对应可见纬度约 **14.8°N – 51.5°N**；取最高 820px 也只到约 **10.9°N**。

即：

| 区域 | 纬度 | 是否在默认中国模式画面内 |
| --- | --- | --- |
| 西沙群岛 | ~16°N | 勉强在框内 |
| 南沙群岛 | ~10°N | **不在** |
| 曾母暗沙 | ~3.9°N | **不在** |

**默认中国相机没有框住南海。**

### 10.2 处理

若南海断续线需要在中国模式可见，需调整 `GLOBE_CAMERAS.china`：`center` 南移、`zoom` 降低（约 `[112, 22]` 附近的起始值，**必须实机确认**）。

**注意：`src/lib/map/globe.test.ts:35-38` 有断言锁定了当前相机值**，修改需同步更新测试。

以上为公式推算，需实机目视确认后定稿。

---

## 11. 分阶段实施

### Phase 1：架构准备（可独立完成）

```text
- BOUNDARY_POLICY 层
- boundaries/ 模块
- MapLibre 图层注册 + 中国模式显隐联动
- 懒加载接线
- placeholder 数据（明确标记 TEMP）
```

**验收：**

- [ ] World 模式完全不可见国界，视觉与现状一致
- [ ] 点击 China 后国界线出现，且位置正确
- [ ] 切回 World 后国界消失
- [ ] layer 顺序正确，POI / cluster / route 未被遮挡
- [ ] 不点 China 时不产生边界数据请求
- [ ] 现有交互（点位选择、cluster 展开、旅程切换）不受影响
- [ ] 不修改 `PreHomeGlobe.astro` 以外的现有文件（`config.ts` 除外，如需）

### Phase 2：权威数据接入（**外部依赖，阻塞中**）

```text
- china-national-border
- china-islands
- china-maritime-boundary
```

重点人工核验：新疆、西藏、台湾、钓鱼岛、南海断续线。

### Phase 3：视觉与 LOD

```text
- zoom 相关线宽
- 小岛在不同 zoom 的可见性
- simplify，但新疆/西藏/台湾/钓鱼岛/南海使用更低 tolerance
```

> **注意：** 原文档 §23「不允许 5」禁止修改 geometry，§14 又要求对上述区域做低 tolerance 简化——两者字面冲突。**正确解释是：禁止为了美观而修改 geometry；依据 LOD 的合理简化是允许且必要的。** 本节以该解释为准。

**实际有效 zoom 区间约为 0.7 – 5**（`minZoom: 0.7`，中国相机 3.45，Blue Marble 瓦片 `maxzoom: 8`，且 pre-home 是首页视觉区）。原文档 §13 提到的「Zoom 5+ 高精度省界」在本阶段属于过度设计。

### Phase 4：PMTiles（不做）

仅当 GeoJSON 开始影响性能时再考虑。本次不实施。

---

## 12. 测试

Atlas 使用 vitest，测试文件与被测模块同目录。现有测试基建为**纯 Node 环境（无 jsdom / 浏览器）**。

### 建议添加（可行）

```ts
// src/lib/map/boundaries/policy.test.ts
expect(BOUNDARY_POLICY.CHN).toBe("authoritative-cn");

// 样式常量结构
// zoom 表达式形状
// 台湾在 policy 中归属 CHN
```

### 不添加

- **「检查地图初始化后 layer 是否存在」的集成测试**：需要 jsdom / 浏览器环境，当前无此基建，属于新建工程。
- **截图 / visual regression**：Atlas 完全没有这套基建，是独立项目，成本与收益不匹配。

若日后确实需要图层存在性验证，应作为独立任务引入测试基建，不夹带在边界功能里。

---

## 13. 明确不做的事

```text
✗ 修改 / 与 /map/ 的 OSM 底图边界
✗ 添加世界其他国家边界
✗ 省级行政区边界
✗ china-border-mask
✗ 把边界逻辑写进 PreHomeGlobe.astro
✗ 用 dashed line / line-dasharray 模拟南海断续线
✗ 程序化生成断续线段
✗ 凭视觉手工描线
✗ 为视觉效果平滑新疆/西藏边界
✗ GeoJSON 内存颜色
✗ 内联 GeoJSON 进无缓存的页面 HTML
✗ 在 public/ 放数据但不加 _headers 缓存规则
✗ 引入 PMTiles / tippecanoe / 瓦片服务器
✗ 安装来路不明的中国地图 npm 包
✗ 在 README 或注释中声称已合规
```

---

## 14. 验收标准

### 渲染

- [ ] World 模式无任何国界，与修改前视觉一致
- [ ] China 模式显示国界，切回 World 后消失
- [ ] 南海断续线为真实多段 geometry，非等间距虚线
- [ ] 断续线在中国模式可辨认
- [ ] POI、cluster、路线在国界之上
- [ ] 台湾在低 zoom 下不会完全消失
- [ ] 夜面移动时国界线仍可辨认

### 数据

- [ ] 中国国界不依赖任何第三方底图数据
- [ ] 台湾归属 `CHN` sovereignty，无 `TWN`
- [ ] 南海断续线为 MultiLineString
- [ ] 数据带版本号文件名与 README 记录
- [ ] placeholder 数据已明确标记 TEMP

### 架构

- [ ] 边界逻辑不在 `PreHomeGlobe.astro` 内
- [ ] Political Boundary 模块独立于 `src/lib/map/boundaries/`
- [ ] Geometry 与 Style 分离
- [ ] Source 与 Layer 命名统一
- [ ] 不点 China 时不产生边界数据请求
- [ ] 底图供应商更换后 China layer 仍可用

### 性能

- [ ] 边界数据在浏览器侧**最多下载一次**（方案 A 自动满足；方案 B 需 `_headers` 规则生效）
- [ ] 现有 `night-lights.json` 的重复校验问题未被复制到边界数据上

---

## 15. 公开发布注意事项（非工程问题）

原文档 §32 的判断正确，予以保留。

Atlas 若以 `shenhaike.com/atlas` 对外公开，涉及中国关于公开地图、地图审核及**审图号**的要求。特别是：

```text
重新编制 / 裁切 / 缩放 / 叠加信息 / 改变地图内容 / 制作交互地图
```

与直接原样使用自然资源部标准地图**不是同一个场景**。

```text
技术正确 ≠ 自动完成公开发布合规
```

**若 Atlas 作为正式公开地图产品长期运营，需单独进行合规确认。** 本任务只负责：

```text
地图工程架构 + 正确的数据处理能力
```

---

## 16. 待项目方决策的事项

在 Phase 1 动手前需要确认：

1. **是否确认范围收缩为「仅 pre-home + 仅 China 模式」？**
   若是，世界其他国家边界暂不引入，中国不会在世界视图被单独突出。

2. **授权边界数据从何而来？**
   Phase 2 完全阻塞于此。没有数据源，Phase 1 完成后只能停在 placeholder 状态。

3. **`places` 表的 `country` 值如何处理台湾？**
   这是数据决策，影响 `isChinaCountry()`、Regions 统计，以及是否需要 D1 migration 引入国家代码。

4. **数据体积预计多大？**（决定 §4.4 采用方案 A 还是方案 B）

5. **中国相机是否需要南移以框住南海？**（§10）

---

## 一句话实施原则

> **世界底图负责世界，中国相关政治边界由 Atlas 自己维护的 China Authority Layer 负责；本次只在中国模式呈现，Geometry 依据授权数据，Style 由 Atlas 控制，两者严格分离，数据只下载一次。**
