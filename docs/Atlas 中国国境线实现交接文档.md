# Atlas 中国国境线实现交接文档

## 1. 任务背景

Atlas 当前需要在 `pre-home` 地图中加入中国国境线显示。

目标不是简单使用现有世界地图数据中的 `China` polygon，而是建立一套独立的 **China Political Boundary Layer / China Authority Layer**，用于确保中国相关边界的显示方式可控。

重点区域包括：

- 新疆国境线
- 西藏国境线
- 台湾及附属岛屿
- 钓鱼岛及其附属岛屿
- 南海断续线
- 东海有关线段
- 海南及南海诸岛

要求地图表现尽可能依据中国公开地图相关规范，包括：

- `GB/T 35764-2017《公开地图内容表示要求》`
- 自然资源部 2023 年《公开地图内容表示规范》
- 自然资源部标准地图服务系统提供的标准地图

> 重要：不要自己凭印象绘制敏感边界，也不要简单依赖 OSM / Natural Earth / Mapbox 默认政治边界。

---

# 2. 核心设计原则

采用：

```text
World Base Map
      +
China Authority Boundary Overlay
```

而不是：

```text
直接使用世界底图中的 China polygon
```

Atlas 中，中国相关政治边界应拥有独立的数据源、渲染层和逻辑。

推荐整体结构：

```text
Map
├── ocean
├── land
├── world-country-boundaries
│
├── china-political-boundary
│   ├── china-national-border
│   ├── china-taiwan
│   ├── china-important-islands
│   ├── china-maritime-boundary
│   └── china-east-china-sea-related-lines
│
├── china-provincial-boundaries
│
├── Atlas POI
├── Atlas routes
├── Atlas clusters
└── labels
```

China Authority Layer 的优先级必须高于普通 world boundary。

---

# 3. 不要直接依赖世界底图中的中国边界

OSM、Natural Earth、Mapbox 等数据源可以继续用于普通世界地图。

例如：

```text
France
Germany
Japan
United States
Brazil
...
```

可以继续使用当前 world boundary 数据。

但是中国相关边界应单独处理。

建议引入统一策略：

```ts
const POLITICAL_BOUNDARY_SOURCE = {
  CHN: "china-authoritative",
  DEFAULT: "world-base",
};
```

后续不要在多个组件中到处写：

```ts
if (country === "China") {
  ...
}
```

应统一通过 Political Boundary Policy 层管理。

---

# 4. 推荐数据来源

## 4.1 首选参考来源

优先使用：

### 自然资源部标准地图服务系统

用于核对：

- 中国完整国界
- 新疆
- 西藏
- 台湾
- 钓鱼岛
- 南海诸岛
- 南海断续线
- 东海有关线段

官方标准地图可以作为最终视觉核验依据。

不要依据 Google Maps、OSM 或其他国外地图产品判断中国边界。

---

## 4.2 天地图

可以作为中国境界及地理数据的重要参考来源。

如果存在可合法使用的权威矢量境界数据，应优先采用，而不是自行根据图片描线。

---

## 4.3 正式生产环境

如果 Atlas 后续成为正式公开互联网地图产品，优先考虑从具备测绘资质的数据供应方取得：

```text
公开版境界数据
```

避免长期维护自行从 EPS / JPG 提取的边界。

---

# 5. 建议的数据目录

开发初期使用 GeoJSON 即可。

推荐：

```text
src/
public/
  maps/
    china/
      china-national-border.geojson
      china-maritime-boundary.geojson
      china-islands.geojson
      china-provincial-boundaries.geojson
```

或者：

```text
src/data/maps/china/
```

根据当前 Atlas 数据加载架构自行选择。

推荐逻辑划分：

```text
china-national-border.geojson
```

负责：

- 中国大陆国界
- 海南等必要岛屿外轮廓

---

```text
china-islands.geojson
```

负责：

- 台湾岛
- 澎湖列岛
- 钓鱼岛及附属岛屿
- 南海重要岛屿

---

```text
china-maritime-boundary.geojson
```

负责：

- 南海断续线
- 东海有关线段

---

```text
china-provincial-boundaries.geojson
```

负责：

- 省级行政区边界

省界不是本任务第一阶段必须项，可以后续实现。

---

# 6. GeoJSON 数据模型

建议给所有 Feature 添加统一属性。

例如：

```json
{
  "type": "Feature",
  "properties": {
    "countryCode": "CHN",
    "boundaryType": "national",
    "sovereignty": "CHN",
    "renderClass": "china-national",
    "source": "authoritative-cn",
    "preserveGeometry": true
  },
  "geometry": {
    "type": "LineString",
    "coordinates": []
  }
}
```

---

# 7. 台湾数据模型

台湾可以作为独立 geometry 存储。

但是语义层面必须属于中国政治边界体系。

例如：

```json
{
  "type": "Feature",
  "properties": {
    "countryCode": "CHN",
    "region": "Taiwan",
    "sovereignty": "CHN",
    "boundaryType": "island",
    "renderClass": "china"
  }
}
```

不要在 Atlas 内部数据模型中将其设置为：

```text
countryCode = TWN
```

或者：

```text
country = Taiwan
```

如果未来 Atlas 有：

```text
visitedCountries
country statistics
country footprint
country hover
country color
```

需要保证台湾不会因为底图数据模型而被自动当成另一个国家。

建议将“国家层级”和“区域层级”拆开：

```ts
interface PoliticalRegion {
  sovereignCountry: string;
  region?: string;
}
```

例如：

```ts
{
  sovereignCountry: "CHN",
  region: "Taiwan"
}
```

---

# 8. 南海断续线实现方式

这是本任务的重要部分。

不要通过：

```css
border-style: dashed;
```

或 MapLibre：

```js
"line-dasharray": [4, 3]
```

在一条完整 LineString 上模拟南海断续线。

原因是：

```text
南海断续线 ≠ 普通 dashed line
```

每一段具有独立：

- 位置
- 长度
- 方向
- 间隔

正确做法是将实际线段作为 geometry。

例如：

```json
{
  "type": "Feature",
  "properties": {
    "countryCode": "CHN",
    "boundaryType": "maritime",
    "renderClass": "china-maritime"
  },
  "geometry": {
    "type": "MultiLineString",
    "coordinates": [
      [
        [lng1, lat1],
        [lng2, lat2]
      ],
      [
        [lng3, lat3],
        [lng4, lat4]
      ]
    ]
  }
}
```

每一段直接渲染为实线。

不要实现：

```text
generateElevenDashLine()
```

也不要按照“9 段 / 10 段 / 11 段”数量生成。

内部统一称为：

```text
South China Sea discontinuous line
```

或者：

```text
china-maritime-boundary
```

实现应依据权威标准地图中的实际 geometry。

---

# 9. MapLibre Source

假设 Atlas 当前使用 MapLibre。

加载数据：

```ts
map.addSource("china-boundary", {
  type: "geojson",
  data: "/maps/china/china-national-border.geojson",
});
```

海上边界：

```ts
map.addSource("china-maritime", {
  type: "geojson",
  data: "/maps/china/china-maritime-boundary.geojson",
});
```

岛屿：

```ts
map.addSource("china-islands", {
  type: "geojson",
  data: "/maps/china/china-islands.geojson",
});
```

---

# 10. 世界国界冲突处理

这是实施时非常重要的问题。

如果 world map 已经包含：

```text
China border
India border
Taiwan polygon
```

直接叠加 China Authority Layer 可能出现：

```text
双线
重影
冲突边界
底部旧线漏出
```

因此需要根据当前地图架构选择：

## 方案 A：过滤中国世界边界

优先方案。

如果当前 world vector source 可以根据 ISO code 过滤：

```ts
filter: [
  "!=",
  ["get", "iso_a3"],
  "CHN"
]
```

则直接取消默认中国边界。

之后由 China Authority Layer 完全负责中国边界。

这是最干净的方案。

---

## 方案 B：遮罩

如果无法过滤底图数据，则实现：

```text
World boundary
↓
China boundary mask
↓
China authoritative boundary
```

mask 宽度应略大于最终国境线。

例如：

```ts
map.addLayer({
  id: "china-border-mask",
  type: "line",
  source: "china-boundary",
  paint: {
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      1, 2.5,
      4, 3,
      7, 4
    ]
  }
});
```

mask 使用地图背景颜色。

然后再画正式国界。

---

# 11. 推荐渲染顺序

最终 layer 顺序建议：

```text
ocean
↓
land
↓
world-country-fill
↓
world-country-border
↓
china-border-mask
↓
china-national-border
↓
china-maritime-boundary
↓
china-important-islands
↓
china-provincial-boundary
↓
Atlas route
↓
Atlas POI
↓
Atlas marker clusters
↓
labels
```

不要让 POI / routes 被国境线盖住。

---

# 12. 中国国境线样式

Atlas 当前整体风格偏：

```text
简约
克制
低视觉噪音
```

因此中国边界不要做成传统政治地图里的粗红线。

推荐视觉逻辑：

```text
普通世界国界
0.6–0.9 px

中国国家边界
0.9–1.3 px

中国省界
0.4–0.7 px
```

真正数值由当前 Atlas Style 调整。

重点是：

```text
中国国界视觉权重
>
普通省界
```

但不要明显破坏 Atlas 当前视觉设计。

---

# 13. Zoom / LOD

国界数据不能所有 zoom 使用同一个超高精度 geometry。

否则：

```text
世界视角下载数据过大
GPU 顶点过多
MapLibre 渲染浪费
```

建议最终使用多个 LOD。

---

## Zoom 0–2

用途：

```text
世界地图
pre-home
全球旅行视图
```

只需要：

- 中国大轮廓
- 台湾轮廓
- 南海断续线
- 重要岛屿

不需要：

- 大量小岛
- 高精度曲折边界
- 省界

---

## Zoom 2–5

显示：

- 较完整中国国界
- 台湾
- 海南
- 南海断续线
- 重要岛屿
- 钓鱼岛等重要区域

---

## Zoom 5+

可以使用更高精度：

- 国境线
- 省界
- 更多岛屿

---

# 14. Geometry Simplification

后续生成矢量瓦片或 PMTiles 时，很可能需要：

```text
Douglas-Peucker
Visvalingam
```

等简化算法。

必须谨慎。

以下区域设置为高优先级：

```text
新疆
西藏
台湾
钓鱼岛
南海断续线
```

不要进行过度 simplification。

推荐 metadata：

```json
{
  "preserveGeometry": true
}
```

或者在 preprocessing 阶段维护：

```ts
const PRESERVE_REGIONS = [
  "xinjiang-border",
  "tibet-border",
  "taiwan",
  "diaoyu",
  "south-china-sea",
];
```

这些 Feature 使用更低 simplification tolerance。

---

# 15. 第一阶段不要过度工程化

目前 Atlas 仍处于开发阶段。

第一阶段：

```text
GeoJSON
+
MapLibre GeoJSON source
```

即可。

不要现在就：

```text
Cloudflare R2
PMTiles
tippecanoe pipeline
custom tile server
```

全部一起实现。

第一阶段目标：

```text
正确
稳定
容易校核
```

性能优化之后再做。

---

# 16. 后续 PMTiles 架构

当 Atlas 地图数据越来越大后，可以转换成：

```text
china-boundaries.pmtiles
```

推荐部署：

```text
Cloudflare R2
       ↓
Cloudflare CDN
       ↓
PMTiles
       ↓
MapLibre
```

最终可以整理成：

```text
world.pmtiles

china-boundaries.pmtiles

atlas-points.pmtiles
```

其中：

```text
china-boundaries.pmtiles
```

独立维护。

即使以后更换：

```text
world.pmtiles
```

中国边界也不受影响。

---

# 17. 推荐架构模块

不要把所有代码放进 `PreHome.tsx`。

建议建立：

```text
src/
  map/
    political-boundaries/
      index.ts
      boundary-policy.ts
      china-boundary.ts
      china-style.ts
```

例如：

```ts
export const BOUNDARY_POLICY = {
  CHN: "authoritative-cn",
  DEFAULT: "base",
} as const;
```

然后：

```ts
export function registerPoliticalBoundaryLayers(map) {
  registerChinaBoundaryLayers(map);
}
```

pre-home 只需要：

```ts
registerPoliticalBoundaryLayers(map);
```

---

# 18. China Layer 建议 ID

统一命名。

例如：

```text
china-border-mask

china-national-border

china-maritime-boundary

china-islands

china-provincial-boundary
```

Source：

```text
china-boundary-source

china-maritime-source

china-islands-source
```

避免：

```text
chinaLine1
specialChina
cnFix
chinaHack
```

等临时命名。

---

# 19. 数据与 Style 解耦

GeoJSON 中不要存颜色。

不要：

```json
{
  "lineColor": "#aaaaaa"
}
```

数据层只负责：

```text
是什么
在哪里
属于什么类别
```

样式完全交给 MapLibre style。

例如：

```ts
const CHINA_BOUNDARY_STYLE = {
  minWidth: 0.8,
  maxWidth: 1.4
};
```

方便以后：

```text
light mode
dark mode
pre-home mode
full-map mode
```

共用同一份 geometry。

---

# 20. Dark Mode 兼容

如果 Atlas 后续支持深色主题，不要准备两份 GeoJSON。

只切换 style。

例如：

```ts
const boundaryColor =
  theme === "dark"
    ? "rgba(...)"
    : "rgba(...)";
```

Geometry 永远只有一份。

---

# 21. Pre-home 与主地图共享

不要把 China boundary 写成：

```text
pre-home 专用
```

它应该属于地图基础设施。

例如：

```text
Political Boundary System
```

以后：

```text
pre-home
main atlas
trip map
country detail
route view
```

都应该使用同一个模块。

---

# 22. 数据校验流程

引入数据之后，必须人工检查。

至少检查：

## 新疆

重点看：

```text
中国西北边境
中印相关区域
中巴边境
中塔边境
```

与自然资源部标准地图对比。

---

## 西藏

重点检查：

```text
西藏南部
中印边境
中不边境
```

不要只依赖 OSM polygon。

---

## 台湾

确认：

```text
台湾属于中国 sovereignty data
```

同时检查：

- 台湾岛
- 澎湖
- 必要附属岛屿

---

## 东海

检查：

- 钓鱼岛及附属岛屿
- 东海有关线段

---

## 南海

检查：

- 南海断续线
- 线段位置
- 线段数量
- 每段方向
- 不要使用程序自动虚线生成

---

# 23. 不允许的实现方式

Codex 不应采用以下方案。

## 不允许 1

直接：

```text
npm install 某个中国地图 GeoJSON
```

然后不确认来源。

---

## 不允许 2

默认相信：

```text
Natural Earth
OSM
Mapbox
```

中的中国 border。

---

## 不允许 3

通过 CSS / MapLibre dashed line 自动生成南海断续线。

---

## 不允许 4

手工凭视觉随便画：

```text
十一条线
```

---

## 不允许 5

为了视觉效果修改国界 geometry。

例如：

```text
让新疆边境更圆
让西藏边界更平滑
```

禁止。

边界坐标属于数据。

Style 与 Geometry 必须分离。

---

# 24. Performance

第一阶段 GeoJSON 数据量应该不大。

不需要为了几 MB 数据提前优化。

后续如果达到：

```text
几十 MB
大量行政区
大量小岛
高精度世界边界
```

再迁移 PMTiles。

---

# 25. 缓存

如果数据放：

```text
/public/maps/
```

Cloudflare Pages 会直接作为静态文件处理。

可以使用长期缓存。

建议文件名后续带版本：

```text
china-national-border-v1.geojson
```

更新后：

```text
china-national-border-v2.geojson
```

避免 CDN cache invalidation 问题。

或者构建阶段 fingerprint。

---

# 26. 中国地图数据版本

建议建立：

```ts
export const CHINA_BOUNDARY_DATA_VERSION = "2026-01";
```

每次更新数据时记录：

```text
version
source
date
review notes
```

例如：

```text
data/maps/china/README.md
```

内容：

```md
# China Boundary Dataset

Version: 2026-01

Reference:
- Ministry of Natural Resources standard maps
- Tianditu

Manual verification:
- Xinjiang: checked
- Tibet: checked
- Taiwan: checked
- Diaoyu Islands: checked
- South China Sea discontinuous line: checked
```

方便以后维护。

---

# 27. Atlas 内部数据语义

建议区分：

```text
sovereign country
administrative region
travel region
map geometry
```

不要把这些混在一个字段里。

例如：

```ts
interface AtlasRegion {
  id: string;

  sovereignCountryCode: string;

  administrativeRegion?: string;

  atlasRegion?: string;
}
```

这样台湾可以：

```ts
{
  sovereignCountryCode: "CHN",
  administrativeRegion: "Taiwan"
}
```

但 Atlas UI 仍然可以正常显示：

```text
台湾
```

而不会影响国家统计。

---

# 28. 实施阶段

建议分四阶段完成。

---

## Phase 1：架构准备

完成：

```text
Political Boundary Policy
China Authority Layer
MapLibre Layer 注册
```

暂时使用测试 GeoJSON。

验收：

- world map 正常
- China source 能独立加载
- layer 顺序正确
- 不影响 Atlas POI

---

## Phase 2：权威数据接入

完成：

```text
china-national-border.geojson
china-islands.geojson
china-maritime-boundary.geojson
```

重点人工检查：

```text
Xinjiang
Tibet
Taiwan
Diaoyu
South China Sea
```

---

## Phase 3：视觉与缩放优化

完成：

```text
zoom-dependent line width
visibility
LOD
small island visibility
```

目标：

```text
世界视角干净

亚洲视角清晰

中国视角完整
```

---

## Phase 4：PMTiles

当 GeoJSON 开始影响性能时再执行：

```text
GeoJSON
↓
Tippecanoe / equivalent
↓
PMTiles
↓
Cloudflare R2
↓
MapLibre
```

不是当前强制需求。

---

# 29. 验收标准

本功能完成时应满足以下要求。

## 数据

- [ ] 中国国界不直接依赖默认 world boundary
- [ ] 新疆边界与权威标准地图核对
- [ ] 西藏边界与权威标准地图核对
- [ ] 台湾属于 `CHN` sovereignty
- [ ] 台湾轮廓正常显示
- [ ] 钓鱼岛相关数据存在
- [ ] 南海断续线为真实 MultiLineString geometry
- [ ] 东海有关线段按标准地图处理

---

## 渲染

- [ ] 不出现 China border 双线
- [ ] 不出现 world border 从下面漏出来
- [ ] 中国国界视觉明显高于省界
- [ ] 南海断续线在世界/亚洲视角可辨认
- [ ] 台湾在低 zoom 下不会完全消失
- [ ] POI 在边界上方正常显示
- [ ] cluster 不受影响

---

## 架构

- [ ] China boundary 不写死在 `PreHome`
- [ ] Political Boundary 模块独立
- [ ] Geometry 与 Style 分离
- [ ] Source 与 Layer 命名统一
- [ ] 将来可迁移 PMTiles
- [ ] world map provider 更换后 China layer 仍可使用

---

# 30. 测试建议

建议增加最少以下测试。

## Unit

测试：

```ts
BOUNDARY_POLICY.CHN === "authoritative-cn"
```

---

## Integration

地图初始化后检查：

```text
china-national-border
china-maritime-boundary
china-islands
```

layer 是否存在。

---

## Screenshot / Visual regression

建议截取：

```text
World
East Asia
China
Xinjiang
Tibet
Taiwan
South China Sea
```

作为 visual regression baseline。

后续修改地图时能快速发现边界被破坏。

---

# 31. 开发时的安全策略

如果当前还没拿到确定来源的权威 GeoJSON：

不要让 Codex 自己“寻找一份看起来差不多”的数据直接提交为 production。

允许：

```text
temporary placeholder
```

但是必须明确标记：

```ts
// TEMP DATA — NOT FOR PRODUCTION
```

然后在 README 中记录：

```text
Authoritative CN boundary dataset pending.
```

正确性优先于速度。

---

# 32. 公开发布注意事项

Atlas 如果只是本地开发或者内部测试，工程实现可以正常进行。

但是当：

```text
shenhaike.com/atlas
```

作为公开互联网地图对外发布时，需要额外关注中国关于公开地图、地图审核及审图号等要求。

特别是：

```text
重新编制
裁切
缩放
叠加信息
改变地图内容
制作交互地图
```

与直接原样使用自然资源部标准地图不是同一个场景。

因此：

```text
技术正确
≠
自动完成公开发布合规
```

如果 Atlas 最终作为正式公开地图产品长期运营，需要单独进行合规确认。

本任务主要负责：

```text
地图工程架构
+
正确的数据处理能力
```

不要在代码注释或 README 中声称：

```text
100% legally certified
```

除非后续确实完成相应审核流程。

---

# 33. Codex 实施任务

Codex 请按现有 Atlas 项目架构自行判断具体文件位置和实现细节。

不要为了完全照本文档而破坏当前良好架构。

实施目标：

1. 检查当前 `pre-home` 地图实现。
2. 找出 world boundary 当前数据源及 layer。
3. 判断是否可以过滤默认中国边界。
4. 建立独立 Political Boundary 模块。
5. 建立 China Authority Layer。
6. 支持：
   - national border
   - islands
   - maritime discontinuous line
7. 保证 China layer 覆盖 world boundary。
8. 为台湾建立正确 sovereignty semantics。
9. 加入 zoom-dependent 样式。
10. 保证现有 Atlas：
    - POI
    - marker
    - clustering
    - interactions
    不受影响。
11. 添加必要测试。
12. 更新相关 README。

---

# 34. 实施原则

Codex 有权根据当前项目结构调整具体实现。

本文档规定的是：

```text
需求
架构边界
数据原则
验收目标
```

而不是强制逐行照搬代码示例。

优先遵循：

```text
正确性
>
可维护性
>
视觉效果
>
提前性能优化
```

不要为了“快速看到一条国境线”而牺牲长期数据模型。

---

# 35. 最终目标

Atlas 中应该形成真正独立的：

```text
Political Boundary System
```

而不是一次性的：

```text
China border patch
```

最终：

```text
              Atlas Map Engine
                     │
          Political Boundary Policy
                     │
          ┌──────────┴──────────┐
          │                     │
     World Base             China Authority
          │                     │
   ordinary countries     official CN geometry
                                │
                  ┌─────────────┼────────────┐
                  │             │            │
              national        islands      maritime
               border                      boundary
```

这样以后：

- 更换底图
- 更换 MapLibre style
- 更换 world dataset
- 使用 PMTiles
- 加入更多行政区
- 添加新的政治边界规则

都不会破坏中国边界实现。

---

## 一句话实施原则

> **世界底图负责世界，中国相关政治边界由 Atlas 自己维护的权威 China Authority Layer 负责；Geometry 依据权威数据，Style 由 Atlas 控制，两者严格分离。**