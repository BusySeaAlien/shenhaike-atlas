# Shenhaike Atlas

Personal Geographic Archive，使用 Astro、TypeScript、Cloudflare Workers 与 Cloudflare D1。

当前已完成实施细则前五步：应用与 local D1 骨架、核心数据模型、受保护的私人维护后台、与 D1 实时联动的公开档案页面，以及响应式交互地图。生产部署与维护交接将在第六步完成。

## 运行时

- Node.js 24.21.0（见 `.node-version`）
- pnpm 12.4.1（由 `packageManager` 固定）
- Astro 7.3.2
- `@astrojs/cloudflare` 14.3.1
- Wrangler 4.131.1
- MapLibre GL JS 5.6.0（首页交互地球）
- `@turf/boolean-point-in-polygon` 7.4.0（服务端行政归属解析）

这些版本按 2026-09-13 的 npm 发布版本与兼容范围固定。Atlas 使用独立依赖和锁文件，不要求升级 Home、Ink 或 Lens。

## 初始启动

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

打开 `http://127.0.0.1:4321/`。数据库验证页位于 `http://127.0.0.1:4321/system/database/`；显示 `Database connected` 即表示页面已通过 `DB` binding 读取 local D1。

公开档案包含首页地球（Scope × View × Filter）与摘要、`/places/[slug]/` 地点详情、`/journeys/` 旅程归档、`/journeys/[slug]/` 路线详情、`/flight/` 航班档案、`/timeline/` 到访时间轴、`/wishlist/` 愿望清单和静态 `/about/`。

首页 Footprint 按访问年份筛选，Journey 按行程筛选，两种筛选互斥并始终按 Place 去重。地图下方同步显示精简结果列表，cluster 可进一步收窄列表；`/map/` 保留为兼容旧链接的首页地球跳转。

Wishlist 以空心紫圈作为独立开关图层叠加在地球上，与 Scope × View 两个维度正交、不做聚类，China 范围只显示中国条目；已到访为 0 但清单非空时地球照常渲染，清单为空时不渲染开关。

## 航班档案 `/flight/`

`/flight/` 是只读的航班档案，展示与首页视觉一致的旋转地球，将飞过的机场显示为去重白点，并以高于球面的 3D 大圆弧连接每条航段的起降机场。页面支持按年度与国内/国际在客户端筛选，同步更新地球弧线、机场白点、统计（Flights / Airports / Distance / Estimated Time）与航班列表；禁用 JavaScript 时仍展示服务端渲染的完整列表。

- Flight 是独立档案，Journey 只是可选关联（`Flight 0..1 ── Journey`）。无 Journey 的 Flight 仍进入地球、列表与统计；删除 Journey 时关联 Flight 保留，`journey_id` 自动置空。
- 一条 Flight 表示一个实际航段（`PVG → SIN → CDG` 存为两条 Flight），起降机场不能相同。
- 国内/国际采用中国大陆口径：起降机场的 `country_code` 均为 `CHN` 为国内，其余全部国际（含大陆↔港澳台、港澳台互飞、任何境外航段）。分类由后端根据机场 ISO3 自动产生。
- 大圆距离 `d`、航路系数 `k`、航路距离 `D = d × k`、估算时间 `T` 与公式版本全部由服务端 `lib/flight-math.ts` 计算并写入数据库，浏览器提交的值一律忽略；修改机场经纬度或国家会原子重算所有关联航班。
- 所有 Flight、Airport、Airline、Aircraft Type 的新建、编辑、删除只能发生在受保护的 `/guillaume/` 后台，公开页面与公开 API 均无写入入口。首版不依赖任何第三方航班/机场/航路 API。

本地后台位于 `http://127.0.0.1:4321/guillaume/`。认证旁路只会在 `astro dev` 的编译期开发模式启用，默认身份为 `local@atlas.invalid`；可复制 `.dev.vars.example` 为 `.dev.vars` 修改本地显示身份。请求参数、Cookie 或 Host 头均不能开启此旁路。

本地 D1 数据保存在 `.wrangler/state/`，已从 Git 忽略。开发与检查不需要 Cloudflare 登录、生产数据库 ID 或任何生产凭据。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 生成 binding 类型并启动本地开发服务 |
| `pnpm check` | 生成 binding 类型并运行 Astro/TypeScript 检查 |
| `pnpm build` | 生成 binding 类型并构建 Cloudflare Worker |
| `pnpm test` | 运行领域校验和原子排序单元测试 |
| `pnpm test:database` | 在隔离 local D1 中验证 migration、seed 与数据库约束 |
| `pnpm verify` | 依次运行全部测试、检查和构建 |
| `pnpm preview` | 在本地 Workers 运行时预览生产构建 |
| `pnpm db:migrate:local` | 仅将 migrations 应用到 local D1 |
| `pnpm db:seed:local` | 仅将开发 seed 导入 local D1 |
| `pnpm db:migrate:production` | 明确将 migrations 应用到远程生产 D1 |
| `pnpm data:night-lights` | 重新生成首页地球的夜面灯光数据 |
| `pnpm data:china-boundary` | 从授权源数据重新生成中国国境线、岛屿、南海断续线 |
| `pnpm data:china-administrative` | 重新生成中国国家与省级行政面 |
| `pnpm data:world-administrative` | 从 Natural Earth 重新生成世界国家面 |
| `pnpm types` | 从 Wrangler 配置生成 Cloudflare binding 类型 |

`data:*` 脚本都只读 `data-source/`（已 gitignore），不联网；只有拿到授权数据或更换版本时才需要手动重跑，产物提交进仓库。

行政归属回填是一次性操作，默认 dry-run：

```sh
node scripts/backfill-administrative-codes.ts            # 预览
node scripts/backfill-administrative-codes.ts --apply    # 写入 local D1
node scripts/backfill-administrative-codes.ts --apply --remote   # 写入生产
```

所有开发、检查和构建流程默认连接本地模拟 binding。只有名称包含 `production` 且带 Wrangler `--remote` 的命令才会操作远程数据库。

## 生产 D1（尚未创建）

生产 D1 统一命名为 `shenhaike`，Atlas 在共享数据库中使用 `atlas_` 前缀隔离表、索引和触发器。`wrangler.jsonc` 中全零的 `database_id` 是安全的本地占位值。创建生产 D1 后，必须将其替换为 Cloudflare 返回的真实 ID，完成 migration 验证后才可运行生产命令或部署。不要把测试数据导入生产。

## 私人后台与 Cloudflare Access

后台页面和写接口均位于 `/guillaume/*`，不会出现在公共导航中。所有后台响应设置 `Cache-Control: no-store` 和 `X-Robots-Tag: noindex, nofollow`。

生产环境必须同时配置：

| 变量 | 内容 |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | 完整团队域名，例如 `https://example.cloudflareaccess.com` |
| `ACCESS_AUD` | Atlas Access Application 的 Audience Tag |
| `ADMIN_EMAIL` | 唯一允许维护 Atlas 的邮箱地址 |

推荐用 Wrangler secret 或 Cloudflare 控制台配置这些值，不写入仓库。生产缺少任意配置时，后台以 503 关闭；JWT 缺失、伪造、过期、issuer/audience 不符或邮箱不匹配时返回 403。

Worker 优先验证 Cloudflare 注入的 `Cf-Access-Jwt-Assertion`，浏览器请求可回退到 `CF_Authorization` Cookie。验证包含 Cloudflare 轮换公钥签名、RS256、issuer、audience、有效期和管理员邮箱。Cloudflare Access 策略仍应只允许本人，Worker 校验作为独立的源站权限边界。

非读取型 `/guillaume/api/*` 请求必须带有与请求 URL 完全一致的 `Origin`，否则拒绝写入。接口仅接受 JSON，并统一返回字段错误、冲突、未找到或不含内部细节的服务器错误。

后台功能包括：

- Dashboard 总数、最近更新与新建入口。
- Place 列表、新建、编辑和具有关联提示的删除。
- Journey 列表、新建、编辑，以及删除前的级联影响确认。
- Journey 内添加、修改、移除 Visit，并用上下按钮原子调整完整顺序。
- Wishlist 列表、新建、编辑、删除，以及一键 Promote 为正式 Place（生成 slug、重算行政归属、在单个 batch 内原子删除愿望项）。
- 保存期间禁用重复提交；失败保留表单输入并显示字段或操作错误。

## 渲染边界

- `/about/` 显式预渲染为静态页面，`public/` 资源由静态资源层提供。
- 首页、地图、地点、旅程、航班和时间轴页面使用按请求渲染，并设置 `Cache-Control: no-store`，后台保存后下一次读取即反映最新 D1 数据。
- `/system/database/` 在服务端直接调用共享数据库查询层，不通过 HTTP 请求自身 API，也不缓存响应。
- 公开 API 只会在地图交互等浏览器端确有需要时增加。

公开查询规则如下：

- 首页 Places 只统计至少到访一次的不同地点，Journeys 只统计至少包含一次访问的旅程，Regions 按非空国家与地区组合去重。
- Wishlist 是独立的愿望数据，不计入首页 Places/Journeys/Regions 统计与 Footprint 填色；`/wishlist/` 仅展示清单。
- 最近地点按最后到访日期倒序排列并按地点去重；旅程分别展示不同地点数和 Visit 总数，仅在起止日期都精确到日时显示包含首尾日期的天数。
- `/journeys/` 保留空旅程；无 Visit 的地点和旅程详情显示空状态，但不会进入首页地图或已到访统计。
- 未知 slug 返回真实 404；D1 查询失败返回不泄露内部异常的 503 页面。公开页面均提供描述、规范 URL 和 Open Graph 元数据。

## 地图依赖、底图与坐标

首页地球是唯一的地图浏览入口，业务页面只传递仓库内定义的 `MapPoint`，不暴露 MapLibre 专用类型。

| 页面 | 组件 | 底图 |
| --- | --- | --- |
| `/`（首页） | `components/PreHomeGlobe.astro` | NASA EOSDIS GIBS Blue Marble（卫星影像） |
| `/flight/` | `components/FlightGlobe.astro` | NASA EOSDIS GIBS Blue Marble + deck.gl 大圆弧 |
| `/map/` | 301 跳转至 `/#globe` | — |

`/pre-home/` 301 跳转到 `/` —— 地球作为候选首页时用的是那个地址，保留跳转以免旧链接失效。

- 首页地球使用 NASA GIBS 影像并署名，另叠加随时间移动的晨昏线与夜面灯光（`public/data/night-lights.json`，由 `pnpm data:night-lights` 一次性生成）。
- D1 保存并向地图传递 WGS84 纬度、经度；不进行 GCJ-02 或其他坐标转换。旅程详情的连线仅表达访问顺序，不代表道路、GPS 轨迹或距离。
- 瓦片或脚本加载失败时，导航、筛选前的服务端地点列表和详情入口仍保留；禁用 JavaScript 时也可浏览全部地点。

## 首页地球的 Scope 与 View

首页地球的地图状态是两个**互相独立**的维度，不是一组平铺的模式：

- **Scope**：`World` / `China`，决定观察范围与相机。
- **View**：`Journey` / `Footprint`，决定用什么方式表达旅行数据。

切换其中一个不会重置另一个。Journey 显示访问顺序连线与行程选择器；Footprint 用行政区填色显示覆盖范围，并隐藏 Journey 图层与选择器。规则集中在 `lib/map/globe-state.ts`，由单元测试覆盖四种组合。

### 中国边界与中国足迹

- 中国相关政治边界与行政几何由 Atlas 自己维护，不依赖底图数据：`lib/map/boundaries/`（国境线、岛屿、南海断续线）与 `lib/map/administrative/`（国家与省级面）。
- 数据在开发阶段一次性生成后提交进仓库，运行时只读取本项目静态资源，不请求任何第三方地图服务；`pnpm build` 完全离线。
- 来源、CRS 判断依据、转换方法与已知待核验项记录在各自目录的 `README.md`。**尚未完成与自然资源部标准地图的人工比对，也未完成公开地图审核流程。**
- World 足迹使用 Natural Earth Admin 0（110m）为基底，并以 50m 增量补充 110m 未收录的小国（新加坡、马耳他、马尔代夫等 59 个）；中国部分由中国权威面覆盖，港澳台在世界层级统一归入 `CHN`。
- Place 的行政归属由 `lib/map/administrative/location.ts` 按经纬度做 Point-in-Polygon 解析后写入 D1，不依赖 `country` / `region` 文本匹配。

## 目录

```text
src/
├── components/          # 可复用界面组件
├── layouts/             # 页面布局
├── lib/
│   ├── api/             # HTTP 响应工具
│   ├── db/              # D1 binding 与查询层
│   ├── map/             # 与地图供应商无关的适配层
│   │   ├── boundaries/      # 中国国境线、岛屿、南海断续线
│   │   ├── administrative/  # 国家/省级面、行政归属解析
│   │   └── globe-state.ts   # Scope × View 状态
│   └── validation/      # 服务端输入校验
├── pages/               # 公开页面、后台与必要接口
├── styles/              # Atlas 独立视觉系统
└── types/               # 共享领域与输入类型
docs/                    # 实施交接文档
migrations/              # D1 migrations
scripts/                 # 一次性维护脚本
```

Atlas 从 Home 与 Lens 延续了宋体标题、克制留白、低饱和纸张色和细分隔线，但样式完全保存在本仓库，不依赖跨仓库共享包。

## 数据模型与规则

- `places` 保存 WGS84 经纬度；`journeys` 保存起止日期；`visits` 连接两者并保存访问日期和顺序。Journey 与 Visit 日期均可使用 `YYYY`、`YYYY-MM` 或 `YYYY-MM-DD`，页面保留实际精度，不以虚构日期补齐。
- `places.sovereign_country_code` 与 `places.admin1_code` 是机器可读的行政归属，由服务端按坐标解析后写入，创建与修改时都会重算，从不接受客户端提交的值。`country` / `region` 保留为人工可读标签，不参与地图与统计判断。
- Place 与 Journey 的 slug 分别唯一。Visit 必须引用有效记录；部分日期按可能的起止边界解释，并且必须与 Journey 日期范围相交。
- 同一 Place 可以在同一或不同 Journey 中重复访问；不设置 Place/Journey 组合唯一约束。
- Journey 内的 `sequence` 唯一。排序通过 D1 `batch()` 整体提交，任何语句失败时整批回滚。
- 删除被 Visit 引用的 Place 会被拒绝；删除 Journey 会级联删除其 Visits，但保留 Places。
- `atlas_wishlist_items` 是独立的愿望数据表：无 slug、无外键、不存行政编码（不参与 Footprint），创建与编辑仍按坐标解析以校验国家一致性。Promote 在单个 `batch()` 内完成 Place INSERT 与条目 DELETE。
- 表单输入由服务端校验层检查必填值、长度、slug、真实日历日期、坐标、日期范围与外键，数据库约束和 trigger 提供最终保护。
- `seed.sql` 包含重复访问、同一旅程重复地点、跨年旅程及空旅程，只允许通过 `db:seed:local` 导入本地环境。
- 航班档案由 `atlas_airports`、`atlas_airlines`、`atlas_aircraft_types`、`atlas_flights` 四张表构成，全部以 `atlas_` 前缀隔离。机场 `country_code` 由所选国家名派生（与 `places` 的行政归属同源），航司与机场代码统一大写入库。
- Flight 的派生字段（大圆距离、航路系数、航路距离、估算时间、国内/国际、公式版本）由服务端在创建与更新时重算；唯一键为「航司 + 航班号 + 日期 + 起降机场」，重复航段被拒绝。被 Flight 引用的机场、航司、机型不能删除，删除 Flight 不级联任何资料库，删除 Journey 将关联 Flight 的 `journey_id` 置空。
- `seed.sql` 不写入任何 Flight 或机场数据；首版全部通过 `/guillaume/` 后台手工维护。
