# MonSite Atlas — 实施交接文档

## 0. 项目位置与实施原则

当前 MonSite 项目位于：

```text
/Users/guillaume/Guillaume/Developer/shenhaike
```

在开始实施之前，**必须先完整检查现有仓库结构、package.json、Astro 配置、Cloudflare 配置、现有 Home / Ink / Lens 的组织方式以及 Git 状态**。

不要直接假设当前项目一定是 monorepo、单仓库或多仓库。

先理解现有结构，再决定 Atlas 最合理的落点。

本任务允许 Codex 根据实际项目结构调整具体实现方式，但必须遵守本文定义的产品目标、架构边界和验收标准。

核心原则：

> 保持 MonSite 简约、克制、静态优先的设计哲学，只在 Atlas 真正需要动态能力的地方引入后端和数据库。

Atlas 是 MonSite 第一个真正具有后端和数据库的子站。

---

# 1. 项目目标

新增：

```text
atlas.shenhaike.com
```

Atlas 定位为：

> Personal Geographic Archive  
> 个人地理档案

它不是传统旅游博客，也不是旅行攻略网站。

Atlas 用来记录：

- 去过的地点
- 地点之间的关系
- 一次次 Journey / Trip
- 某个地点的访问时间
- 地理坐标
- 时间轴
- 未来与 Lens 摄影集的关联
- 未来与 Ink 文章的关联

Atlas 的基本语义：

```text
Ink   → Words
Lens  → Images
Atlas → Places
```

可以理解为：

> Ink 记录文字。  
> Lens 记录影像。  
> Atlas 记录这些事情发生在哪里。

---

# 2. 非目标

第一版不要做：

- 社交功能
- 评论系统
- 用户注册
- 多管理员权限体系
- 点赞收藏
- 公开投稿
- 推荐算法
- AI 功能
- 复杂 CMS
- Kubernetes
- 独立 Java 服务
- Redis
- Elasticsearch
- 消息队列
- 微服务
- GraphQL
- 为未来假想规模提前做复杂基础设施
- 为了“工程完整”而引入没有实际需求的依赖

Atlas 当前只有一个维护者。

不要杀鸡用牛刀。

---

# 3. 技术路线

确定使用：

```text
Astro
TypeScript
Cloudflare Workers
Cloudflare D1
```

媒体能力预留：

```text
Cloudflare R2
```

第一阶段如果没有实际媒体上传需求，可以先不正式启用 R2，但架构不得阻碍以后接入。

整体：

```text
Browser
   │
   ▼
atlas.shenhaike.com
   │
   ▼
Astro + TypeScript
   │
   ▼
Cloudflare Workers
   │
   ├── D1
   │   Structured Data
   │
   └── R2
       Media / Assets
```

---

# 4. 各技术职责

## Astro

负责：

- 页面结构
- Layout
- 组件
- 地图 UI
- Timeline UI
- Journey 页面
- Place 页面
- 后台界面
- SEO
- 静态资源
- 必要的 SSR / 动态页面

不要因为 Atlas 有数据库，就把所有页面强制改成动态 SSR。

能静态的部分可以保持静态。

---

## TypeScript

作为 Atlas 主要开发语言。

前端：

```text
TypeScript
```

后端 Worker：

```text
TypeScript
```

数据类型尽量共享。

例如：

```text
Place
Journey
Visit
```

不要前后端各写一套完全不同的数据结构。

---

## Cloudflare Workers

负责后端逻辑：

```text
API
数据库查询
数据库写入
参数验证
后台操作
权限校验
未来 R2 操作
```

不要让浏览器直接访问 D1。

必须：

```text
Browser
↓
Worker/API
↓
D1
```

---

## Cloudflare D1

负责结构化数据。

主要保存：

```text
Places
Journeys
Visits
Relationships
```

不要将照片二进制直接存进 D1。

---

## Cloudflare R2

未来负责：

```text
Atlas cover
Journey cover
Place images
其他媒体文件
```

如果 Lens 以后也迁移到 R2，需要考虑是否复用媒体基础设施，但不要在本阶段强行统一。

---

# 5. 仓库与目录

首先检查：

```text
/Users/guillaume/Guillaume/Developer/shenhaike
```

当前真实结构。

如果 Home / Ink / Lens 已经是独立仓库，则推荐 Atlas 同样独立：

```text
shenhaike-atlas
```

例如本地可能最终成为：

```text
/Users/guillaume/Guillaume/Developer/
├── shenhaike
├── shenhaike-ink
├── shenhaike-lens
└── shenhaike-atlas
```

如果现有项目实际采用其他结构，则保持一致。

**不要为了 Atlas 主动把整个 MonSite 重构成 monorepo。**

Atlas 应尽量遵循现有部署与 Git 组织习惯。

---

# 6. 推荐 Atlas 内部目录

具体目录可以根据 Astro 最新推荐和现有项目调整，但逻辑层次建议保持类似：

```text
shenhaike-atlas/
│
├── src/
│   ├── components/
│   │
│   ├── layouts/
│   │
│   ├── pages/
│   │
│   ├── lib/
│   │
│   │   ├── db/
│   │   ├── api/
│   │   ├── map/
│   │   └── validation/
│   │
│   ├── types/
│   │
│   └── styles/
│
├── migrations/
│
├── scripts/
│
├── seed.sql
│
├── public/
│
├── wrangler.jsonc
│
├── astro.config.*
├── package.json
└── README.md
```

不要为了符合本示例而破坏 Astro 原生推荐结构。

---

# 7. 数据模型

第一版核心只需要三类：

```text
Place
Journey
Visit
```

关系：

```text
Journey
   │
   ├── Visit ── Place
   │
   ├── Visit ── Place
   │
   └── Visit ── Place
```

---

# 8. places 表

表示现实世界中的一个地点。

推荐字段：

```text
id
slug
name
name_zh
country
region
city
latitude
longitude
description
cover
created_at
updated_at
```

示意：

```text
id: 1

slug:
sayram-lake

name:
Sayram Lake

name_zh:
赛里木湖

country:
China

region:
Xinjiang

latitude:
44.x

longitude:
81.x
```

要求：

- slug 唯一
- latitude / longitude 应有合理范围验证
- location 与 visit 分离
- 不要因为再次访问同一地点就新建 Place

---

# 9. journeys 表

表示一次完整旅程。

例如：

```text
Xinjiang 2026
```

推荐字段：

```text
id
slug
name
name_zh
start_date
end_date
description
cover
created_at
updated_at
```

例：

```text
slug:
xinjiang-2026

name:
Xinjiang

name_zh:
新疆

start_date:
2026-08-xx

end_date:
2026-08-xx
```

---

# 10. visits 表

Visit 表示：

> 某次 Journey 中，在某个时间访问了某个 Place。

推荐：

```text
id
place_id
journey_id
visited_at
sequence
notes
created_at
updated_at
```

这样：

```text
Place:
Sayram Lake
```

可以：

```text
2026 Visit
2030 Visit
2035 Visit
```

而不用建立三个赛里木湖。

---

# 11. Ink / Lens 关联

第一版允许暂缓。

但数据库设计必须预留未来：

```text
Place ↔ Lens Album
Place ↔ Ink Article

Journey ↔ Lens Album
Journey ↔ Ink Article
```

不要把 Lens 和 Ink 的完整数据复制进入 Atlas 数据库。

Atlas 保存：

```text
关联
URL
slug
必要元数据
```

即可。

未来可以考虑：

```text
content_links
```

通用关联表，而不一定分别建立：

```text
lens_links
ink_links
```

具体实现由 Codex 根据实际需求选择。

---

# 12. Migration

数据库 schema 必须使用 migrations 管理。

推荐：

```text
migrations/

0001_initial.sql
0002_xxx.sql
...
```

不要长期依赖：

```text
手工进入 Cloudflare Console 修改表结构
```

数据库结构变化必须可版本控制。

---

# 13. 本地 D1

本地开发必须使用 D1 local environment。

原则：

```text
开发 → local D1
生产 → remote D1
```

两者不得混用。

本地 migration：

```bash
pnpm wrangler d1 migrations apply atlas-db --local
```

生产 migration：

```bash
pnpm wrangler d1 migrations apply atlas-db --remote
```

开发过程中默认：

```text
--local
```

只有明确进行生产部署时才：

```text
--remote
```

---

# 14. Seed 数据

建立：

```text
seed.sql
```

第一版可以加入少量虚拟或真实测试地点：

```text
Sayram Lake
Xiata
Kalajun
Shanghai Pudong Airport
```

主要用于：

- 地图测试
- Timeline
- Journey
- Place 页面
- 后台 CRUD

本地导入：

```bash
pnpm wrangler d1 execute atlas-db --local --file=./seed.sql
```

seed 不应该自动写入生产数据库。

---

# 15. 数据库查看与开发

开发期间应支持通过 Wrangler 查看：

```bash
pnpm wrangler d1 execute atlas-db --local \
  --command="SELECT * FROM places;"
```

但长期的主要管理方式应该是：

```text
/guillaume
```

而不是人工执行 SQL。

---

# 16. 后台路径

不要使用：

```text
/admin
```

使用：

```text
/guillaume
```

推荐 URL 全部使用小写。

即使显示名称：

```text
Guillaume
```

URL 仍：

```text
/guillaume
```

原因：

- URL 风格一致
- 避免大小写差异
- 更符合 Web 路径习惯

不要把：

```text
/guillaume
```

当作安全措施。

隐藏路径只能降低低级扫描概率。

真正安全依赖认证与授权。

---

# 17. 后台认证

第一版：

**不要自己实现密码系统。**

不要实现：

```text
SHA256(password)
```

不要在 D1 保存管理员密码。

优先使用：

```text
Cloudflare Access
```

保护：

```text
atlas.shenhaike.com/guillaume
atlas.shenhaike.com/guillaume/*
```

只有 Guillaume 自己可以进入。

Cloudflare Access 做身份层。

Atlas 自己负责后台 UI。

架构：

```text
Browser
   │
   ▼
/guillaume
   │
   ▼
Cloudflare Access
   │
   ├─ denied
   │
   └─ authenticated
          │
          ▼
      Atlas backend
```

---

# 18. 后台首页

访问：

```text
/guillaume
```

显示私人工作台。

示意：

```text
GUILLAUME

Atlas

Places        12
Journeys       3
Visits        18


+ New Place
+ New Journey


Recent

Sayram Lake
Xiata
Kalajun
```

后台无需追求和公开网站同等程度的艺术化。

优先：

```text
清晰
快速
稳定
容易维护
```

---

# 19. 后台 Places

页面：

```text
/guillaume/places
```

功能：

```text
List
Create
Edit
Delete
```

表格或列表：

```text
Place               Region       Updated

Sayram Lake         Xinjiang     ...
Xiata               Xinjiang     ...
Kalajun             Xinjiang     ...
```

操作：

```text
Edit
Delete
```

---

# 20. 新建 Place

页面：

```text
/guillaume/places/new
```

建议字段：

```text
Name
Chinese Name
Slug

Country
Region
City

Latitude
Longitude

Description

Cover
```

第一版 Cover 可以允许为空。

保存后：

```text
INSERT INTO places ...
```

---

# 21. Edit Place

例如：

```text
/guillaume/places/sayram-lake
```

修改：

```text
Name
Location
Coordinate
Description
Cover
```

保存之后立即反映在公开页面。

不需要重新：

```text
git commit
build
deploy
```

---

# 22. Journeys 后台

页面：

```text
/guillaume/journeys
```

支持：

```text
Create
Edit
Delete
```

Journey 编辑页面应可以管理它包含的 Visits。

例如：

```text
Xinjiang 2026

01 Sayram Lake
02 Xiata
03 Kalajun
04 Nalati

[Add Place]
```

需要支持调整：

```text
sequence
```

---

# 23. 删除策略

删除 Place 前必须检查关联 Visit。

不要直接造成：

```text
orphan data
```

可以：

- foreign key constraint
- prevent delete
- cascade

具体策略由 Codex判断。

原则：

> 不允许悄悄破坏数据完整性。

---

# 24. API

不强制使用完全 REST 风格，但建议保持清晰。

例如：

```text
GET    /api/places
GET    /api/places/:slug

POST   /api/places
PATCH  /api/places/:id
DELETE /api/places/:id
```

Journey：

```text
GET    /api/journeys
GET    /api/journeys/:slug

POST
PATCH
DELETE
```

Visits：

```text
POST   /api/visits
PATCH  /api/visits/:id
DELETE /api/visits/:id
```

如果 Astro server actions 或其他当前官方方案明显更适合，可使用更合适的方法。

不要为了遵守本段示意而人为制造 API 层。

重要的是：

```text
UI
↓
server validation
↓
database
```

边界明确。

---

# 25. 参数验证

所有写入 D1 的数据必须服务端验证。

至少验证：

```text
slug
required fields
latitude
longitude
date
foreign key
string length
```

不能只依赖：

```text
HTML required
```

或浏览器端验证。

---

# 26. 首页

URL：

```text
/
```

首页不是传统博客首页。

核心体验：

> 打开一张属于自己的地图。

首页建议结构：

```text
Hero / Map
↓
Journeys
↓
Recent Places
↓
Stats
```

---

# 27. Atlas 首页 Hero

顶部：

```text
ATLAS
```

副标题建议：

```text
Places I have been,
and traces I left behind.
```

或者在实施时根据整体文案风格微调。

主要视觉：

```text
大面积极简地图
```

特点：

- 地图是页面主角
- 去过的位置突出
- 无需展示复杂道路
- 不要像 Google Maps
- 不要堆满 POI
- 不要出现旅游 App 风格

Hover：

```text
Sayram Lake
Xinjiang · 2026

1 visit
18 photographs
```

第一版没有 Lens 数据时，可以只显示：

```text
Sayram Lake
Xinjiang · 2026
```

---

# 28. 地图实现

第一版不要锁死某个地图供应商。

建立地图抽象层，例如：

```text
src/lib/map/
```

目标：

```text
数据库 Place
     ↓
统一 MapPoint 数据结构
     ↓
地图组件
```

例如统一：

```text
id
name
latitude
longitude
url
```

地图实现未来应能够替换。

不要让整个页面直接依赖某个第三方地图 SDK 的专用数据格式。

---

# 29. 地图视觉

Atlas 地图应该符合现有 MonSite：

```text
minimal
quiet
restrained
editorial
```

不要：

- 大量鲜艳 Marker
- Google Maps 风格
- 默认蓝色定位点
- 复杂道路图层
- 旅游网站 icon
- 花哨地图动画

可以：

- 低对比底图
- 简单圆点
- 极淡边界线
- 柔和 hover
- 300–500ms 左右微动效

---

# 30. Journeys 首页区域

示例：

```text
JOURNEYS

2026 / XINJIANG

[ wide visual ]

Sayram Lake · Xiata · Kalajun
Nalati · Duku Highway

Explore →
```

Journey 是：

> 一次完整行程

而不是：

> 一篇旅游文章

---

# 31. Recent Places

建议使用克制列表，而不是一堆卡片。

例如：

```text
RECENT PLACES

01    Sayram Lake
      Xinjiang · 2026

02    Xiata
      Xinjiang · 2026

03    Kalajun
      Xinjiang · 2026
```

可以考虑 Desktop hover 时右侧出现预览图。

手机端则保持简单列表。

---

# 32. Stats

首页底部可以有：

```text
12
Places

3
Journeys

4
Regions
```

第一版不要放：

```text
里程
国家数量
航班数量
摄影数量
```

除非数据库真实拥有可靠数据。

Stats 必须由 D1 查询得到。

不能手工写死。

---

# 33. `/map`

完整地图浏览页面：

```text
/map
```

核心：

```text
整页地图
```

可逐步加入：

```text
All
Year
Region
Journey
Has Photography
Has Writing
```

第一版只需要：

```text
All
Year
Journey
```

即可。

---

# 34. Place 页面

路径：

```text
/places/[slug]
```

例如：

```text
/places/sayram-lake
```

建议：

```text
SAYRAM LAKE
赛里木湖

44.xx° N
81.xx° E

Xinjiang, China
```

然后：

```text
Visited
August 2026

Journey
Xinjiang 2026
```

未来：

```text
Photography
→ Lens

Writing
→ Ink
```

下面可显示：

```text
Nearby
```

但第一版可以不做附近算法。

---

# 35. `/journeys`

展示所有 Journey：

```text
JOURNEYS

2026

Xinjiang
12 days · 8 places

Shanghai
1 day · 1 place
```

不要做博客式卡片流。

---

# 36. Journey Detail

路径：

```text
/journeys/[slug]
```

例如：

```text
/journeys/xinjiang-2026
```

核心是路线叙事：

```text
01
Sayram Lake

│

02
Xiata

│

03
Kalajun

│

04
Nalati
```

可以配简化路线地图。

这应该是 Atlas 最有叙事性的页面之一。

---

# 37. Timeline

路径：

```text
/timeline
```

按时间从新到旧：

```text
2026

AUG
Nalati
Kalajun
Xiata
Sayram Lake

MAY
Shanghai Pudong Airport
```

Timeline 数据必须直接来自：

```text
visits
```

不要单独维护 Timeline 内容。

---

# 38. About

路径：

```text
/about
```

保持很短。

核心概念：

```text
Atlas is a record of places.

Some I passed through.
Some I stayed in.
Some I photographed.
Some I wrote about.

Words live in Ink.
Images live in Lens.
Places live here.
```

可以根据 MonSite 实际文案进一步润色。

---

# 39. Public Navigation

推荐：

```text
ATLAS

Map
Journeys
Timeline
About

Home ↗
```

不要公开显示：

```text
Guillaume
Admin
Dashboard
```

后台入口不加入普通导航。

---

# 40. SEO

公开页面正常 SEO。

后台：

```text
/guillaume/*
```

必须：

```text
noindex
nofollow
```

同时：

- 不加入 sitemap
- 不公开链接
- robots 只能作为辅助
- 不依赖 robots.txt 做安全保护

安全由 Cloudflare Access 提供。

---

# 41. Cloudflare Access

生产部署时：

保护：

```text
atlas.shenhaike.com/guillaume
atlas.shenhaike.com/guillaume/*
```

只允许指定身份。

不要：

```text
protect entire atlas.shenhaike.com
```

公开 Atlas 必须可以正常访问。

---

# 42. R2

第一阶段不是必须完成。

但如果需要上传：

```text
cover
```

使用：

```text
R2 binding
```

不要：

```text
图片 base64 → D1
```

也不要：

```text
图片直接 commit 到 Git
```

如果第一版暂时使用普通静态 placeholder，则保持未来迁移到 R2 的接口清晰。

---

# 43. 环境配置

禁止把 secrets：

```text
commit 到 Git
```

本地开发：

```text
.dev.vars
```

或 Cloudflare 官方当前推荐机制。

生产：

```text
Cloudflare Secrets
```

配置文件可以包含：

```text
D1 binding
R2 binding
non-sensitive config
```

但不能包含敏感凭据。

---

# 44. 安全

即使使用 Cloudflare Access，也必须保证：

后台写操作必须经过服务端权限边界。

不要：

```text
仅仅隐藏按钮
```

也不要：

```text
前端判断 isAdmin
```

就认为安全。

---

# 45. CSRF / 写请求

Codex 应根据最终认证和 Astro/Worker 实现方式评估：

```text
CSRF
Origin checking
SameSite cookies
```

等需求。

因为第一阶段优先使用 Cloudflare Access，认证复杂度较低，但仍然需要避免任意第三方站点触发后台写操作。

---

# 46. 数据库操作安全

禁止使用：

```text
字符串拼接 SQL
```

所有动态数据必须：

```text
prepared statements
bindings
```

防止 SQL injection。

---

# 47. 错误处理

公开页面：

数据库暂时不可用时不要白屏。

至少提供：

```text
404
500
empty state
```

后台：

CRUD 失败需要清晰错误提示。

不要把：

```text
stack trace
database error
secret
```

直接输出给访客。

---

# 48. Loading / Empty 状态

Place 为空：

```text
No places yet.
```

Journey 为空：

```text
No journeys yet.
```

Atlas 首页不能因为：

```text
数据库 0 条数据
```

就崩溃。

---

# 49. Responsive

Atlas 必须同时适配：

```text
Desktop
Mobile
```

Desktop 地图可以作为大主视觉。

Mobile 不应该简单压缩 Desktop 地图。

手机端需要考虑：

```text
touch
sheet
list + map
tap target
```

但第一版无需做复杂原生地图 App 手势。

---

# 50. 与 Ink / Lens 的视觉关系

必须保持：

```text
same family
different identity
```

即：

Atlas 一眼能看出属于 shenhaike.com，

但又不能只是：

```text
Ink 换个标题
```

Atlas 自己的视觉语言：

```text
map
coordinates
place
route
time
```

---

# 51. 不要做传统旅游网站

避免：

```text
Top Destinations
Travel Tips
Recommended Hotels
Things To Do
Travel Guide
评分
攻略
```

Atlas 是：

```text
personal archive
```

不是：

```text
travel portal
```

---

# 52. 首页信息优先级

第一优先：

```text
Map
```

第二：

```text
Journeys
```

第三：

```text
Places
```

第四：

```text
Statistics
```

不要把：

```text
Recent Posts
```

加入首页。

---

# 53. 本地开发工作流

目标：

```bash
cd <atlas-project>

pnpm install

pnpm wrangler d1 migrations apply atlas-db --local

pnpm wrangler d1 execute atlas-db --local --file=./seed.sql

pnpm dev
```

然后：

```text
localhost
```

访问公开站。

以及：

```text
localhost/.../guillaume
```

开发后台。

本地环境不得依赖正式 D1 才能运行。

---

# 54. Production 数据库流程

部署前：

```text
先测试 local migration
```

确认没有问题后：

```bash
pnpm wrangler d1 migrations apply atlas-db --remote
```

禁止把：

```text
seed.sql
```

自动导入 production。

生产数据通过：

```text
/guillaume
```

维护。

---

# 55. 数据库备份

如果正式 Atlas 开始存真实数据，应建立简单备份流程。

可以使用：

```text
D1 export
```

定期导出。

第一版不需要自动化复杂备份系统。

但 README 应记录：

```text
如何 export production DB
如何 restore
```

---

# 56. 第一阶段 Milestone

Milestone 1：

```text
项目初始化
Astro
Workers
D1
```

完成：

```text
本地可运行
D1 binding 可用
migration 可运行
```

---

# 57. 第二阶段

数据库：

```text
places
journeys
visits
```

完成：

```text
migration
seed
basic query layer
```

---

# 58. 第三阶段

后台：

```text
/guillaume
```

完成：

```text
Place CRUD
Journey CRUD
Visit management
```

---

# 59. 第四阶段

公开页面：

```text
/
 /map
 /places/[slug]
 /journeys
 /journeys/[slug]
 /timeline
 /about
```

---

# 60. 第五阶段

Cloudflare：

```text
Worker deploy
D1 production
atlas.shenhaike.com
Cloudflare Access
```

---

# 61. 第六阶段

Polish：

```text
responsive
animations
empty states
errors
SEO
performance
accessibility
```

---

# 62. MVP 必须完成

第一版上线必须拥有：

```text
✓ Atlas 首页
✓ 地图
✓ Place
✓ Journey
✓ Timeline

✓ D1
✓ migrations
✓ local DB
✓ production DB

✓ /guillaume
✓ Cloudflare Access
✓ Places CRUD
✓ Journeys CRUD
✓ Visits

✓ responsive
✓ build
✓ deploy
```

---

# 63. 第一版可以没有

```text
Lens integration
Ink integration
R2 upload
路线距离
复杂地图筛选
高级统计
Nearby places
照片瀑布流
国际化
搜索
全文搜索
```

以后逐步增加。

---

# 64. 测试要求

至少验证：

## Database

```text
migration from empty DB works
seed works locally
foreign key behaviour correct
CRUD works
```

## Public

```text
homepage
map
place detail
journey list
journey detail
timeline
about
```

## Admin

```text
create place
edit place
delete place
create journey
edit journey
add visit
reorder visits
```

## Error

```text
unknown slug → 404
invalid coordinate rejected
missing required field rejected
DB error handled
```

---

# 65. Build 验证

完成前至少运行项目已有的质量检查。

先检查 package.json 中已有 scripts。

可能包括：

```text
lint
format
typecheck
astro check
test
build
```

不要自行假设项目使用：

```text
Biome
ESLint
Prettier
Vitest
```

先检查当前仓库。

能复用现有规范就复用。

---

# 66. Codex Skill 使用原则

本项目明确要求：

> 不要为了一个简单修改同时调用大量重量级 workflow。

Codex 应根据任务复杂程度选择最少必要工具。

例如：

一个普通页面样式调整：

不需要同时启动：

```text
executing-plans
test-driven-development
frontend-design
webapp-testing
requesting-code-review
verification-before-completion
```

只有在真正有必要时调用对应能力。

优先：

```text
理解问题
实施
针对性验证
```

---

# 67. 不要过度测试

数据库 CRUD 与核心业务逻辑值得测试。

但不要为：

```text
纯静态文案
一个 margin
一个简单 heading
```

建立复杂测试。

测试应该保护：

```text
重要行为
```

而不是追求数字覆盖率。

---

# 68. 不要擅自大规模重构

实施 Atlas 时：

不得未经必要性证明就：

```text
重构 Ink
重构 Lens
重构 Home
更换 MonSite CSS framework
改变整个 Git 组织
升级所有依赖
改 CI
```

除非这些修改是 Atlas 正常工作必须的。

---

# 69. Git 原则

Atlas 项目初始化后：

保持 commit 小而清晰。

推荐语义：

```text
feat(atlas): initialize Astro worker app

feat(db): add place journey visit schema

feat(admin): add place management

feat(journeys): add journey and visit editor

feat(map): add atlas map

feat(timeline): add visit timeline

chore(cloudflare): configure D1 bindings
```

不要：

```text
update
fix stuff
changes
final
```

---

# 70. README

Atlas README 最终至少写：

```text
项目介绍

技术栈

本地启动

D1 初始化

Migration

Seed

Production migration

Cloudflare deployment

Cloudflare Access

Database backup

Environment variables
```

新设备 clone 后应该可以通过 README 恢复完整开发环境。

---

# 71. 最终架构

目标：

```text
                    shenhaike.com
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼

       INK             LENS           ATLAS
      Words           Images          Places

     Astro            Astro           Astro
       │                │               │
    Static           Static         TypeScript
                                        │
                                     Worker
                                        │
                              ┌─────────┴─────────┐
                              │                   │
                              ▼                   ▼
                             D1                  R2
                           Database             Media
```

Ink / Lens：

```text
继续 Static-first
```

Atlas：

```text
Dynamic where useful
```

---

# 72. 产品哲学

实现过程中始终遵守：

> Atlas 不是为了展示技术栈而存在。

它首先是一个：

```text
安静
克制
个人
长期
```

的地理档案。

技术应该隐藏在后面。

访问者看到的是：

```text
地图
地点
时间
旅程
```

而不是：

```text
数据库
API
Dashboard
Cloudflare
```

---

# 73. 最终体验

打开：

```text
atlas.shenhaike.com
```

首先看到：

```text
ATLAS

Places I have been,
and traces I left behind.

[ MAP ]
```

点击：

```text
Sayram Lake
```

进入：

```text
赛里木湖
Sayram Lake

Xinjiang, China
August 2026
```

查看它属于：

```text
Xinjiang 2026
```

再打开 Journey：

```text
Sayram Lake
↓
Xiata
↓
Kalajun
↓
Nalati
```

或者进入：

```text
/timeline
```

按照年月浏览。

而维护者访问：

```text
atlas.shenhaike.com/guillaume
```

经过 Cloudflare Access 后：

```text
GUILLAUME

Places
Journeys
Visits

+ New Place
+ New Journey
```

新增一个 Place 保存以后，公开 Atlas 应立即读取数据库中的新数据。

无需：

```text
改 Markdown
git commit
git push
等待重新构建
```

这就是 Atlas 相比 Ink / Lens 最大的架构区别。

---

# 74. Codex 开始执行前的第一步

不要立即写代码。

首先完成：

1. 检查：

```text
/Users/guillaume/Guillaume/Developer/shenhaike
```

2. 确认：

```text
Git 仓库结构
Astro 版本
Node / pnpm
Cloudflare 部署方式
Home / Ink / Lens 当前关系
现有 UI 风格
现有 lint / test / build
```

3. 判断：

```text
Atlas 应该作为现有仓库中的子项目
```

还是：

```text
新建独立 shenhaike-atlas repository
```

4. 在不破坏现有 MonSite 的前提下选择实现方案。

---

# 75. Codex 的自主权

本文定义的是：

```text
产品需求
架构方向
安全边界
数据模型
用户体验
验收标准
```

具体实现细节，例如：

```text
Astro routing structure
server actions vs API routes
SQL query abstraction
地图库
组件拆分
CSS implementation
schema 细节
```

允许 Codex 根据：

```text
当前 Astro 官方最佳实践
当前 Cloudflare 官方能力
现有代码结构
实际复杂程度
```

自主选择。

如果发现本文某项具体技术细节已经因版本变化不再合理，应优先采用当前官方推荐方案，但不得改变核心产品目标。

---

# 76. 完成后的汇报格式

实施结束后，不要只回复：

```text
Done
```

必须报告：

### Implemented

列出真正完成的功能。

### Architecture

说明最终采用：

```text
Astro
Workers
D1
R2（如启用）
```

以及关键实现选择。

### Database

列出：

```text
tables
migrations
seed
local / remote workflow
```

### Routes

列出公开和后台主要路由。

### Cloudflare

说明：

```text
D1
Worker
Access
Domain
```

哪些已完成、哪些需要 Guillaume 在 Cloudflare Dashboard 手动操作。

### Verification

列出实际执行过的：

```text
tests
typecheck
lint
build
```

及结果。

### Manual steps

如果仍有必须由用户完成的 Cloudflare / DNS / Access 配置，给出明确步骤。

### Git

列出修改文件以及推荐 commit message。

---

# 最终原则

实施时始终使用这个判断标准：

> 如果一个技术、抽象、依赖或基础设施，在 Atlas 当前版本中没有明确解决实际问题，就暂时不要加入。

第一版的目标不是建立一个“大型旅游平台”。

目标是建立一个漂亮、长期可维护、真正属于 MonSite 的：

# Atlas

**Words live in Ink.  
Images live in Lens.  
Places live here.**