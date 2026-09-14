# Atlas 中国国境线数据落地与实施文档

## 0. 文档目的

本文档用于指导 Atlas `pre-home` 中中国国境线功能的正式实施。

本次采用的核心方案为：

```text
权威中国边界矢量数据
        ↓
开发阶段一次性获取
        ↓
转换 / 清洗 / 校验
        ↓
作为项目静态数据提交进仓库
        ↓
Atlas China 模式懒加载
        ↓
MapLibre 本地渲染
```

运行时：

```text
浏览器
  ↓
shenhaike.com 自己的静态资源
```

不会：

```text
浏览器
  ↓
天地图 / 第三方地图服务
```

也就是说：

> **第三方数据源只参与开发阶段的数据准备，不参与 Atlas 正常运行。**

---

# 1. 本次实施范围

本次只处理：

```text
/pre-home/
```

并且只在：

```text
China mode
```

显示中国政治边界。

World 模式：

```text
不显示任何国家边界
```

本次不修改：

```text
/
/map/
```

现有 OSM 栅格底图。

本次也不实施：

- 世界其他国家边界
- 中国省界
- PMTiles
- 自建瓦片服务器
- 实时调用天地图
- 在线请求第三方边界 API

---

# 2. 最终效果

Atlas `pre-home` 当前以 NASA Blue Marble 为基础影像。

最终图层结构：

```text
NASA Blue Marble
      ↓
night hemisphere
      ↓
night lights
      ↓
China national border
China islands
China maritime boundary
      ↓
journey route
      ↓
clusters
      ↓
POI
```

World 模式：

```text
卫星地球
+
Atlas POI
+
旅程路线
```

China 模式：

```text
卫星中国视图
+
中国国境线
+
台湾及重要岛屿
+
南海断续线
+
Atlas POI
+
旅程路线
```

---

# 3. 数据获取原则

## 3.1 数据只下载一次

中国边界数据不应该在网站运行期间实时下载。

正确流程：

```text
权威数据源
      ↓
开发电脑下载
      ↓
生成 Atlas GeoJSON
      ↓
人工核验
      ↓
git commit
      ↓
Cloudflare Pages 部署
```

之后普通访问者只读取 Atlas 自己的资源。

---

# 4. 数据来源要求

生产环境使用的数据必须满足：

```text
来源明确
+
授权明确
+
可追溯
+
可人工核验
```

不得直接使用：

```text
随机 GitHub 仓库
随机 npm package
博客附件
论坛 GeoJSON
来源不明的中国地图文件
```

也不要因为：

```text
“看起来差不多”
```

就作为 production 数据。

---

# 5. 数据内容

最终应至少得到三套数据。

---

## 5.1 中国国家边界

文件：

```text
china-national-border-v1.geojson
```

包括：

- 中国大陆国境线
- 新疆相关国境线
- 西藏相关国境线
- 海南等必要岛屿外轮廓

重点校验：

```text
新疆
西藏
```

---

## 5.2 台湾及重要岛屿

文件：

```text
china-islands-v1.geojson
```

包括：

- 台湾岛
- 澎湖列岛
- 钓鱼岛及其附属岛屿
- 必要的南海岛屿
- 其他规范要求的重要岛屿

台湾数据内部属性必须使用：

```json
{
  "countryCode": "CHN",
  "sovereignty": "CHN"
}
```

禁止：

```text
TWN
```

作为 sovereign country code。

---

# 5.3 南海及相关海上边界

文件：

```text
china-maritime-boundary-v1.geojson
```

包括：

- 南海断续线
- 东海有关线段

---

# 6. 南海断续线必须是真实 Geometry

禁止使用：

```js
"line-dasharray": [4, 3]
```

模拟南海断续线。

因为：

```text
南海断续线
≠
普通等间距虚线
```

正确数据应类似：

```json
{
  "type": "Feature",
  "properties": {
    "countryCode": "CHN",
    "boundaryType": "maritime",
    "sovereignty": "CHN",
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

也就是说：

```text
每一段线
=
实际坐标数据
```

MapLibre 只负责把这些真实线段画出来。

---

# 7. 禁止程序自动生成断续线

禁止：

```ts
generateNineDashLine()
generateTenDashLine()
generateElevenDashLine()
```

也不要根据：

```text
9 段
10 段
11 段
```

自行推测数量。

Atlas 内部统一使用：

```text
South China Sea discontinuous line
```

或：

```text
china-maritime-boundary
```

最终 geometry 必须来自经过确认的数据。

---

# 8. 项目目录

推荐使用：

```text
src/lib/map/
├── config.ts
├── globe.ts
├── points.ts
│
└── boundaries/
    ├── china.ts
    ├── style.ts
    │
    └── data/
        ├── china-national-border-v1.json
        ├── china-islands-v1.json
        └── china-maritime-boundary-v1.json
```

现阶段不需要：

```text
policy.ts
```

因为目前实际上只有：

```text
World
→ 不显示边界

China
→ 显示中国边界
```

暂时没有多国 political boundary policy 的实际需求。

未来真的出现多个特殊政治边界来源时，再引入统一 policy。

---

# 9. 为什么数据放 src 而不是 public

现阶段优先采用：

```text
src/lib/map/boundaries/data/
```

而不是：

```text
public/maps/china/
```

原因：

Vite 会将动态 import 数据：

```text
打包
↓
生成 hash
↓
输出到 /_astro/*
```

而 Atlas 现有 Cloudflare 配置已经对：

```text
/_astro/*
```

启用了长期 immutable 缓存。

因此可以直接获得：

```text
版本指纹
+
长期缓存
+
自动 cache busting
```

而不需要自己维护：

```text
_headers
```

规则。

---

# 10. 懒加载

中国边界数据禁止在页面初始化时加载。

World 模式：

```text
0 次边界数据请求
```

只有用户进入：

```text
China mode
```

以后才加载。

推荐：

```ts
let chinaBoundaryLoaded = false;

async function ensureChinaBoundaryLoaded(map) {
  if (chinaBoundaryLoaded) {
    return;
  }

  const [national, islands, maritime] = await Promise.all([
    import("./data/china-national-border-v1.json"),
    import("./data/china-islands-v1.json"),
    import("./data/china-maritime-boundary-v1.json"),
  ]);

  registerChinaBoundarySources(
    map,
    national.default,
    islands.default,
    maritime.default
  );

  chinaBoundaryLoaded = true;
}
```

最终行为：

```text
第一次点击 China
↓
下载一次

之后 China ↔ World 切换
↓
不重新下载
只改变 visibility
```

---

# 11. China Boundary 模块接口

建议：

```ts
// china.ts

export async function ensureChinaBoundaryLoaded(
  map: maplibregl.Map
): Promise<void>;

export function showChinaBoundary(
  map: maplibregl.Map
): void;

export function hideChinaBoundary(
  map: maplibregl.Map
): void;
```

调用侧不应该知道：

```text
有几个 GeoJSON
source叫什么
layer叫什么
```

这些细节全部封装在：

```text
boundaries/china.ts
```

内部。

---

# 12. Source 命名

统一：

```text
china-boundary-source

china-islands-source

china-maritime-source
```

---

# 13. Layer 命名

统一：

```text
china-national-border

china-islands

china-maritime-boundary
```

禁止：

```text
chinaFix
cnLine
chinaHack
specialBorder
border2
```

---

# 14. 数据属性

所有 Feature 建议采用统一属性结构。

例如：

```json
{
  "countryCode": "CHN",
  "boundaryType": "national",
  "sovereignty": "CHN",
  "renderClass": "china-national",
  "source": "authoritative-cn"
}
```

`boundaryType` 可取：

```text
national
island
maritime
```

---

# 15. Geometry 与 Style 分离

GeoJSON 中禁止存：

```json
{
  "color": "#ffffff",
  "width": 1.2,
  "opacity": 0.8
}
```

GeoJSON 只存：

```text
位置
类型
归属
来源
```

样式全部位于：

```text
src/lib/map/boundaries/style.ts
```

---

# 16. 样式

Atlas 当前 `pre-home` 为克制、低干扰风格。

建议边界颜色继续沿用已有路线体系附近的浅色视觉语言。

例如：

```ts
export const CHINA_BOUNDARY_COLOR = "#d5ddd8";
```

初始参考宽度：

```text
国家边界
0.9 – 1.3 px

南海断续线
0.8 – 1.2 px

岛屿边界
0.7 – 1.0 px
```

实际值必须通过真实页面观察确定。

---

# 17. Zoom 相关样式

建议：

```ts
"line-width": [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  0.9,
  3.5,
  1.1,
  5,
  1.3
]
```

不要求照搬这个数值。

Codex 根据当前地图效果调整。

原则：

```text
世界视觉
不要太重

China 模式
国界必须可辨认
```

---

# 18. 图层顺序

当前 pre-home 中边界应该位于：

```text
night-lights-glow
```

之后，

```text
journey-route
```

之前。

最终：

```text
space

nasa-blue-marble

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

这样：

```text
POI
路线
cluster
```

始终位于国境线上层。

---

# 19. World / China 模式

China 模式：

```ts
await ensureChinaBoundaryLoaded(map);

showChinaBoundary(map);
```

World 模式：

```ts
hideChinaBoundary(map);
```

World 模式切回以后：

```text
source 保留
layer 保留
数据保留
```

只设置：

```text
visibility: none
```

不要删除 source。

否则下一次进入 China 会产生无意义的重新创建。

---

# 20. 初始状态

所有 China layer 创建时：

```ts
layout: {
  visibility: "none"
}
```

确保页面初始 World 模式视觉与现在完全一致。

---

# 21. China 相机必须调整

当前 China camera：

```ts
center: [104, 35],
zoom: 3.45
```

无法完整看到南海。

因为本次需求明确包含：

```text
台湾
+
南海断续线
```

所以 China 模式默认视野必须覆盖：

```text
新疆
西藏
东北
台湾
南海断续线主体
南沙区域
```

---

# 22. 推荐使用 Bounds 而不是固定 Zoom

优先考虑：

```ts
const CHINA_OVERVIEW_BOUNDS = [
  [73, 3],
  [135, 54],
];
```

再使用：

```ts
map.fitBounds(CHINA_OVERVIEW_BOUNDS, {
  padding: ...,
});
```

具体 bounds 必须根据最终真实数据调整。

原因：

```text
15 英寸 Mac
Windows 屏幕
未来手机
不同浏览器高度
```

画布宽高比不同。

固定：

```text
center + zoom
```

不一定能保证全部设备都完整显示南海。

---

# 23. Camera 验收标准

China 模式进入后：

- 新疆不得出画面
- 西藏不得出画面
- 台湾清晰可辨
- 南海断续线主要部分可辨
- 南沙区域进入视野
- 中国主体不能因为容纳南海而缩得过小

这需要最终目视调节。

---

# 24. 数据获取脚本

建议建立：

```text
scripts/generate-china-boundary.mjs
```

目的不是：

```text
运行时下载数据
```

而是：

```text
开发阶段
下载 / 读取授权原始数据
↓
转换为 Atlas 使用格式
↓
输出 JSON
```

结构类似现有：

```text
generate-night-lights.mjs
```

---

# 25. 推荐数据生成流程

```text
授权原始数据
      ↓
generate-china-boundary.mjs
      ↓
统一坐标系统
      ↓
清洗无用字段
      ↓
拆分：
  national
  islands
  maritime
      ↓
添加 Atlas metadata
      ↓
输出：
src/lib/map/boundaries/data/
```

---

# 26. 坐标要求

MapLibre GeoJSON 使用：

```text
WGS84
longitude / latitude
EPSG:4326
```

即：

```json
[longitude, latitude]
```

必须确认原始数据坐标系。

禁止在不知道源 CRS 的情况下：

```text
直接当 WGS84 使用
```

---

# 27. 数据清理

原始数据可能携带大量无关字段。

例如：

```text
NAME
AREA
PERIMETER
OBJECTID
FID
Shape_Length
```

如果 Atlas 不需要：

```text
全部删除
```

最终 Feature 只留下最小属性：

```json
{
  "countryCode": "CHN",
  "boundaryType": "...",
  "sovereignty": "CHN",
  "renderClass": "...",
  "source": "..."
}
```

降低数据大小。

---

# 28. 数据精度

不要直接使用极高精度测绘 geometry。

`pre-home` 实际 zoom 较低。

应保留：

```text
视觉上正确
+
边界形状可靠
```

但不需要：

```text
厘米级
米级
```

顶点精度。

未来可根据数据大小合理 simplify。

---

# 29. Simplification 原则

允许：

```text
为了 Web LOD / 性能进行合理简化
```

禁止：

```text
为了好看手工改变国境线
```

尤其：

```text
新疆
西藏
台湾
钓鱼岛
南海断续线
```

应使用更低 simplification tolerance。

---

# 30. 数据 README

新增：

```text
src/lib/map/boundaries/data/README.md
```

示例：

```md
# Atlas China Boundary Dataset

Version: v1

Source:
<数据来源>

License:
<授权说明>

Generated:
<日期>

Coordinate system:
EPSG:4326

Manual verification:

- Xinjiang: checked / pending
- Tibet: checked / pending
- Taiwan: checked / pending
- Diaoyu Islands: checked / pending
- South China Sea discontinuous line: checked / pending
```

---

# 31. 数据版本

文件必须带版本：

```text
china-national-border-v1.json
china-islands-v1.json
china-maritime-boundary-v1.json
```

更新后：

```text
v2
```

而不是直接覆盖而无版本记录。

---

# 32. Git 处理

边界数据属于：

```text
项目正式静态资产
```

因此应该提交 Git。

例如：

```bash
git add src/lib/map/boundaries
git add scripts/generate-china-boundary.mjs
git commit -m "feat(atlas): add China boundary data layer"
```

只要最终文件体积合理，就不需要 Git LFS。

---

# 33. 数据大小目标

建议第一版整体：

```text
< 500 KB
```

最好。

如果：

```text
500 KB – 1 MB
```

仍可接受。

如果明显超过：

```text
1 MB+
```

再考虑：

```text
进一步 simplify
```

而不是立即上 PMTiles。

---

# 34. 什么时候才考虑 PMTiles

只有未来出现：

```text
世界行政区
省级行政区
市级行政区
大量高精度地理数据
```

导致 GeoJSON 明显影响：

```text
下载
解析
内存
渲染
```

时，再迁移：

```text
GeoJSON
↓
vector tiles
↓
PMTiles
↓
Cloudflare R2
```

当前禁止为了中国国境线一个功能提前引入这套复杂度。

---

# 35. Placeholder 阶段

如果授权数据尚未拿到，可以先完成代码架构。

但是 placeholder 应该：

```text
明显是测试数据
```

例如简单矩形或者简单测试线。

不要去网上找：

```text
“差不多正确”
```

的中国边界充当临时数据。

测试数据必须标：

```ts
// TEMP DATA — NOT FOR PRODUCTION
```

---

# 36. Phase 1

## 目标

完成代码架构，不依赖正式数据。

实施：

```text
src/lib/map/boundaries/china.ts

src/lib/map/boundaries/style.ts

动态 import

China / World visibility

layer order
```

使用明显假的 test geometry。

### 验收

- World 初始视觉与现在完全一致
- 不点击 China 时边界 chunk 不加载
- 点击 China 后 test geometry 出现
- 切 World 后消失
- 再次 China 不重新下载
- POI 正常
- clusters 正常
- route 正常
- 地球交互正常

---

# 37. Phase 2

## 目标

替换测试 geometry 为正式数据。

加入：

```text
china-national-border
china-islands
china-maritime-boundary
```

删除所有：

```text
TEMP DATA
```

---

# 38. Phase 2 人工核验

必须逐项核验：

## 新疆

重点：

```text
新疆西部
新疆西南部
```

---

## 西藏

重点：

```text
西藏西部
西藏南部
```

---

## 台湾

检查：

```text
台湾岛
澎湖
相关重要岛屿
```

同时确认 metadata：

```text
countryCode = CHN
sovereignty = CHN
```

---

## 东海

检查：

```text
钓鱼岛及附属岛屿
东海有关线段
```

---

## 南海

检查：

```text
每一段断续线的位置
长度
方向
间隔
整体空间关系
```

不得因为 MapLibre dashed style 改变。

---

# 39. Phase 3

完成视觉调整。

包括：

```text
线宽
opacity
China camera
fitBounds
岛屿可见度
不同窗口大小
```

重点测试：

```text
MacBook Air 15"
普通桌面浏览器
较窄窗口
```

如果未来 pre-home 适配手机，再追加移动端测试。

---

# 40. 测试

当前项目已有 vitest。

建议增加：

```text
china data loader
style constants
visibility helper
```

单元测试。

不为了本功能额外引入：

```text
Playwright
visual regression
jsdom
```

等新测试体系。

---

# 41. Runtime 网络要求

功能完成后进行验证。

打开浏览器 Network：

初次 World：

```text
china-national-border
❌ 不应该请求

china-islands
❌ 不应该请求

china-maritime
❌ 不应该请求
```

第一次点击 China：

```text
boundary chunk
✓ 请求
```

切 World：

```text
新增 boundary request
0
```

再次 China：

```text
新增 boundary request
0
```

这是硬性验收条件。

---

# 42. 不允许的实施方式

禁止：

```text
✗ 每次进入 China 都 fetch 天地图

✗ 页面初始化时下载国境线

✗ World 模式也加载国境线

✗ 使用 OSM 中国边界当权威数据

✗ 使用来源不明 GeoJSON

✗ npm install 随机中国地图包

✗ 用 line-dasharray 做南海断续线

✗ 程序生成 9/10/11 段线

✗ 手画新疆/西藏边界

✗ 为了视觉美观修改 geometry

✗ 把几百 KB GeoJSON 内联进 HTML

✗ 当前阶段引入 PMTiles

✗ 当前阶段引入 R2

✗ 当前阶段引入自建地图服务器
```

---

# 43. 台湾与 Atlas 数据库是另一工作项

中国国境 GeoJSON 中：

```text
Taiwan
→ CHN
```

但 Atlas 当前 `places` 数据模型里的：

```text
country: string
```

属于另一个问题。

边界任务不要顺便进行大规模 D1 migration。

如果后续决定正式增加：

```ts
sovereignCountryCode: "CHN"
```

应该单独立项。

本次只保证地图 geometry 的 metadata 正确。

---

# 44. 发布前数据检查

Production 前必须确认：

```text
[ ] 数据来源明确

[ ] 授权明确

[ ] 数据版本有记录

[ ] 新疆人工核验

[ ] 西藏人工核验

[ ] 台湾人工核验

[ ] 钓鱼岛人工核验

[ ] 南海断续线人工核验

[ ] 无 TEMP 数据

[ ] 无随机第三方地图包

[ ] 无运行时第三方地图边界请求
```

---

# 45. 公开地图合规

这属于独立于代码的合规问题。

即使：

```text
数据正确
+
代码正确
```

也不自动意味着：

```text
公开发布已满足所有地图审核要求
```

Atlas 后续如果长期作为：

```text
shenhaike.com/atlas
```

公开提供交互式地图，需要单独确认公开地图相关要求。

因此 README 和代码中不得声称：

```text
officially approved
legally certified
已通过地图审核
```

除非实际完成相应流程。

---

# 46. Codex 实施顺序

Codex 按以下顺序执行。

## Step 1

阅读：

```text
src/components/PreHomeGlobe.astro
src/lib/map/config.ts
src/lib/map/globe.ts
```

确认当前结构没有变化。

---

## Step 2

建立：

```text
src/lib/map/boundaries/
```

---

## Step 3

实现：

```text
china.ts
style.ts
```

---

## Step 4

加入 test geometry。

验证：

```text
World
China
World
China
```

模式切换。

---

## Step 5

实现 dynamic import lazy loading。

确认 Network 行为。

---

## Step 6

调整 China camera。

使默认视野能够容纳：

```text
中国主体
台湾
南海
```

---

## Step 7

等待项目方提供：

```text
正式授权中国边界矢量数据
```

---

## Step 8

建立：

```text
scripts/generate-china-boundary.mjs
```

将正式数据转换为 Atlas 格式。

---

## Step 9

人工检查：

```text
新疆
西藏
台湾
钓鱼岛
南海
```

---

## Step 10

替换 TEMP geometry。

---

## Step 11

运行：

```bash
pnpm test
pnpm build
```

确保没有回归。

---

# 47. 完成定义

任务只有在以下条件全部满足后才视为正式完成：

```text
正式授权数据已接入
+
China 模式正确显示
+
World 模式完全不显示
+
台湾与南海完整
+
China camera 可见南海
+
首次进入 China 才加载数据
+
之后不会重复下载
+
数据只从 Atlas 自身静态资源提供
+
无 TEMP geometry
+
pnpm test 成功
+
pnpm build 成功
```

---

# 48. 最终架构

```text
         Authorized Source Data
                  │
           开发阶段一次获取
                  │
                  ▼
scripts/generate-china-boundary.mjs
                  │
                  ▼
src/lib/map/boundaries/data/
                  │
          Vite build + hash
                  │
                  ▼
        Cloudflare Pages CDN
                  │
                  ▼
               Browser
                  │
        用户第一次进入 China
                  │
                  ▼
           dynamic import
                  │
                  ▼
              MapLibre
          ┌───────┼────────┐
          │       │        │
      national  islands  maritime
       border             boundary
```

运行时第三方依赖：

```text
0
```

---

# 一句话实施原则

> **中国边界数据在开发阶段一次性从明确授权的数据源获得并固定进入 Atlas 项目；运行时只从 Atlas 自己的静态资源懒加载，World 模式不加载、不显示，China 模式第一次进入时加载一次，之后只切换可见性。**