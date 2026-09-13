# Shenhaike Atlas

Personal Geographic Archive，使用 Astro、TypeScript、Cloudflare Workers 与 Cloudflare D1。

## 运行时

- Node.js 24.21.0（见 `.node-version`）
- pnpm 12.4.1（由 `packageManager` 固定）
- Astro 7.3.2
- `@astrojs/cloudflare` 14.3.1
- Wrangler 4.131.1

这些版本按 2026-09-13 的 npm 发布版本与兼容范围固定。Atlas 使用独立依赖和锁文件，不要求升级 Home、Ink 或 Lens。

## 初始启动

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

打开 `http://127.0.0.1:4321/`。数据库验证页位于 `http://127.0.0.1:4321/system/database/`；显示 `Database connected` 即表示页面已通过 `DB` binding 读取 local D1。

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
| `pnpm types` | 从 Wrangler 配置生成 Cloudflare binding 类型 |

所有开发、检查和构建流程默认连接本地模拟 binding。只有名称包含 `production` 且带 Wrangler `--remote` 的命令才会操作远程数据库。

## 生产 D1（尚未创建）

`wrangler.jsonc` 中全零的 `database_id` 是安全的本地占位值。创建生产 D1 后，必须将其替换为 Cloudflare 返回的真实 ID，完成 migration 验证后才可运行生产命令或部署。不要把测试数据导入生产。

## 渲染边界

- `/about/` 显式预渲染为静态页面，`public/` 资源由静态资源层提供。
- 首页及未来的地点、旅程、时间轴页面使用按请求渲染。
- `/system/database/` 在服务端直接调用共享数据库查询层，不通过 HTTP 请求自身 API，也不缓存响应。
- 公开 API 只会在地图交互等浏览器端确有需要时增加。

## 目录

```text
src/
├── components/          # 可复用界面组件
├── layouts/             # 页面布局
├── lib/
│   ├── api/             # HTTP 响应工具
│   ├── db/              # D1 binding 与查询层
│   ├── map/             # 与地图供应商无关的适配层
│   └── validation/      # 服务端输入校验
├── pages/               # 公开页面、后台与必要接口
├── styles/              # Atlas 独立视觉系统
└── types/               # 共享领域与输入类型
migrations/              # D1 migrations
scripts/                 # 一次性维护脚本
```

Atlas 从 Home 与 Lens 延续了宋体标题、克制留白、低饱和纸张色和细分隔线，但样式完全保存在本仓库，不依赖跨仓库共享包。

## 数据模型与规则

- `places` 保存 WGS84 经纬度；`journeys` 保存起止日历日期；`visits` 连接两者并保存访问日期和顺序。
- Place 与 Journey 的 slug 分别唯一。Visit 必须引用有效记录，且访问日期必须位于旅程日期范围内。
- 同一 Place 可以在同一或不同 Journey 中重复访问；不设置 Place/Journey 组合唯一约束。
- Journey 内的 `sequence` 唯一。排序通过 D1 `batch()` 整体提交，任何语句失败时整批回滚。
- 删除被 Visit 引用的 Place 会被拒绝；删除 Journey 会级联删除其 Visits，但保留 Places。
- 表单输入由服务端校验层检查必填值、长度、slug、真实日历日期、坐标、日期范围与外键，数据库约束和 trigger 提供最终保护。
- `seed.sql` 包含重复访问、同一旅程重复地点、跨年旅程及空旅程，只允许通过 `db:seed:local` 导入本地环境。
