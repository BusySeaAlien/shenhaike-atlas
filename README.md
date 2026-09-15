# Shenhaike Atlas

Personal Geographic Archive，使用 Astro、TypeScript、Cloudflare Workers 与 Cloudflare D1。

当前已完成实施细则前五步：应用与 local D1 骨架、核心数据模型、受保护的私人维护后台、与 D1 实时联动的公开档案页面，以及响应式交互地图。生产部署与维护交接将在第六步完成。

## 运行时

- Node.js 24.21.0（见 `.node-version`）
- pnpm 12.4.1（由 `packageManager` 固定）
- Astro 7.3.2
- `@astrojs/cloudflare` 14.3.1
- Wrangler 4.131.1
- MapLibre GL JS 5.6.0（首页地球与 `/map/` 地图共用）
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

公开档案包含首页地球（Scope × View）与摘要、`/map/` 筛选地图、`/places/[slug]/` 地点详情、`/journeys/` 旅程归档、`/journeys/[slug]/` 路线详情、`/timeline/` 到访时间轴和静态 `/about/`。

`/map/` 提供 All 重置、访问年份和旅程筛选；年份与旅程同时选择时取地点集合交集，结果始终按 Place 去重。点位、筛选和同步地点列表均可用键盘操作；手机不依赖 hover，选择后通过明确链接进入详情。零点显示空状态，单点使用适当缩放，多点自动适配视野，同坐标或密集点位仍可从列表选择。

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
- 保存期间禁用重复提交；失败保留表单输入并显示字段或操作错误。

## 渲染边界

- `/about/` 显式预渲染为静态页面，`public/` 资源由静态资源层提供。
- 首页、地图、地点、旅程和时间轴页面使用按请求渲染，并设置 `Cache-Control: no-store`，后台保存后下一次读取即反映最新 D1 数据。
- `/system/database/` 在服务端直接调用共享数据库查询层，不通过 HTTP 请求自身 API，也不缓存响应。
- 公开 API 只会在地图交互等浏览器端确有需要时增加。

公开查询规则如下：

- 首页 Places 只统计至少到访一次的不同地点，Journeys 只统计至少包含一次访问的旅程，Regions 按非空国家与地区组合去重。
- 最近地点按最后到访日期倒序排列并按地点去重；旅程分别展示不同地点数和 Visit 总数，天数包含首尾日期。
- `/journeys/` 保留空旅程；无 Visit 的地点和旅程详情显示空状态，但不会进入首页地图或已到访统计。
- 未知 slug 返回真实 404；D1 查询失败返回不泄露内部异常的 503 页面。公开页面均提供描述、规范 URL 和 Open Graph 元数据。

## 地图依赖、底图与坐标

两个地图面互相独立，共用 MapLibre GL JS，业务页面只传递仓库内定义的 `MapPoint`，不暴露 MapLibre 专用类型。

| 页面 | 组件 | 底图 |
| --- | --- | --- |
| `/`（首页） | `components/PreHomeGlobe.astro` | NASA EOSDIS GIBS Blue Marble（卫星影像） |
| `/map/` | `components/InteractiveMap.astro` | OpenStreetMap Standard raster tiles |

`/pre-home/` 301 跳转到 `/` —— 地球作为候选首页时用的是那个地址，保留跳转以免旧链接失效。

- OSM 瓦片为 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`，数据遵循 [ODbL](https://www.openstreetmap.org/copyright)，瓦片使用遵循 [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。首页地球使用 NASA GIBS 影像并署名，另叠加随时间移动的晨昏线与夜面灯光（`public/data/night-lights.json`，由 `pnpm data:night-lights` 一次性生成）。
- 浏览器只请求当前视野所需瓦片，保留浏览器默认 Referer 和缓存行为；不代理、预取、批量下载或提供离线地图。OSM 标准瓦片为 best-effort 服务，未来流量增长或生产政策需要时可通过集中配置切换供应商。
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
- World 足迹使用 Natural Earth Admin 0（110m），其中中国部分由中国权威面覆盖，港澳台在世界层级统一归入 `CHN`。
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

- `places` 保存 WGS84 经纬度；`journeys` 保存起止日历日期；`visits` 连接两者并保存访问日期和顺序。
- `places.sovereign_country_code` 与 `places.admin1_code` 是机器可读的行政归属，由服务端按坐标解析后写入，创建与修改时都会重算，从不接受客户端提交的值。`country` / `region` 保留为人工可读标签，不参与地图与统计判断。
- Place 与 Journey 的 slug 分别唯一。Visit 必须引用有效记录，且访问日期必须位于旅程日期范围内。
- 同一 Place 可以在同一或不同 Journey 中重复访问；不设置 Place/Journey 组合唯一约束。
- Journey 内的 `sequence` 唯一。排序通过 D1 `batch()` 整体提交，任何语句失败时整批回滚。
- 删除被 Visit 引用的 Place 会被拒绝；删除 Journey 会级联删除其 Visits，但保留 Places。
- 表单输入由服务端校验层检查必填值、长度、slug、真实日历日期、坐标、日期范围与外键，数据库约束和 trigger 提供最终保护。
- `seed.sql` 包含重复访问、同一旅程重复地点、跨年旅程及空旅程，只允许通过 `db:seed:local` 导入本地环境。
