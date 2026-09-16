# Atlas 直接写入 Journey 与 Visit 交接文档

> 适用仓库：`shenhaike-atlas`  
> 生产数据库：Cloudflare D1 binding `DB` / database `shenhaike`  
> 目标：不经过后台 UI，使用 Wrangler 直接创建 Journey、Place（如需要）和 Visit。

## 1. 原则

直接写生产 D1 会绕过 `src/lib/db/*` 的服务端校验。数据库仍会执行外键、唯一索引、日期范围 trigger 等约束，但 Agent 必须先只读检查，再写入，再回查。

- 不修改或导入 `seed.sql` 到生产。
- 不猜测已有 Place/Journey 的 ID；始终通过稳定的 `slug` 查询。
- 不复用已经存在的 slug。
- 优先复用已有 Place，避免同一地点重复建档。
- 多条写语句放在同一次 `wrangler d1 execute --command` 中执行。
- 写入失败后必须检查是否产生部分数据，再决定补写或清理。
- 数据写入不需要 Git commit；只有代码、migration 或文档变化才提交。

## 2. 日期规则

Journey 的 `start_date`、`end_date` 与 Visit 的 `visited_at` 支持三种精度：

```text
YYYY
YYYY-MM
YYYY-MM-DD
```

示例：

```text
2012        # 只确定年份
2012-08     # 确定到月份
2012-08-17  # 精确日期
```

不要为了满足字段格式而虚构 `01-01`。只知道 2012 年时就写 `2012`。

部分日期按可能范围解释：

- `2012` = `2012-01-01` 至 `2012-12-31`
- `2012-08` = `2012-08-01` 至 `2012-08-31`
- `2012-08-17` = 当天

Visit 的可能范围必须与 Journey 的起止范围相交，否则数据库 trigger 会拒绝写入。

## 3. 数据关系与必要字段

### `atlas_journeys`

必要字段：

| 字段 | 说明 |
| --- | --- |
| `slug` | 全局唯一，小写字母、数字与连字符 |
| `name` | 英文名 |
| `name_zh` | 中文名，可为 `NULL` |
| `start_date` | Journey 起始日期，支持部分日期 |
| `end_date` | Journey 结束日期，支持部分日期 |

### `atlas_places`

必要字段：

| 字段 | 说明 |
| --- | --- |
| `slug` | 全局唯一 |
| `name` / `name_zh` | 英文名与可选中文名 |
| `country` | 项目认可的英文国家名，例如 `South Korea` |
| `region` / `city` | 可选的人类可读位置 |
| `latitude` / `longitude` | WGS84 坐标 |
| `sovereign_country_code` | 由坐标解析器生成的 ADM0 代码 |
| `admin1_code` | 由坐标解析器生成的中国省级代码；非中国地点通常为 `NULL` |

新增 Place 时不要手写或猜测行政代码。直接 SQL 首次插入时省略这两个 nullable 字段，随后使用 `scripts/backfill-administrative-codes.ts` 调用 `src/lib/map/administrative/location.ts`，从 WGS84 坐标生成代码。解析不到的地点必须交给人工检查。

### `atlas_visits`

必要字段：

| 字段 | 说明 |
| --- | --- |
| `place_id` | 已存在的 Place ID |
| `journey_id` | 已存在的 Journey ID |
| `visited_at` | 支持部分日期 |
| `sequence` | Journey 内从 1 开始的访问顺序，必须唯一 |
| `notes` | 可选备注 |

## 4. 写入前检查

在仓库根目录执行。所有生产命令都必须带 `--remote`。

### 4.1 检查 Wrangler 登录与待执行 migration

```sh
pnpm exec wrangler d1 migrations list DB --remote
```

如果存在待执行 migration，先停止数据写入并确认是否应该迁移。不要在未知 schema 上直接插入。

### 4.2 查找重复 Place 与 Journey

以下示例准备创建“2012 韩国之旅”和“首尔”：

```sh
pnpm exec wrangler d1 execute DB --remote --command "
SELECT id, slug, name, name_zh, country, latitude, longitude,
       sovereign_country_code, admin1_code
FROM atlas_places
WHERE slug = 'seoul' OR lower(name) LIKE '%seoul%' OR name_zh LIKE '%首尔%';

SELECT id, slug, name, name_zh, start_date, end_date
FROM atlas_journeys
WHERE slug = 'south-korea-2012'
   OR lower(name) LIKE '%korea%'
   OR name_zh LIKE '%韩国%';
"
```

### 4.3 确定下一个 Visit 顺序

向已有 Journey 追加 Visit 时：

```sh
pnpm exec wrangler d1 execute DB --remote --command "
SELECT j.id, j.slug, COALESCE(MAX(v.sequence), 0) AS max_sequence
FROM atlas_journeys j
LEFT JOIN atlas_visits v ON v.journey_id = j.id
WHERE j.slug = 'south-korea-2012'
GROUP BY j.id, j.slug;
"
```

新 Visit 的 `sequence` 通常取 `max_sequence + 1`。若要插入中间位置，不要直接复用已有 sequence；优先通过后台排序功能调整。

## 5. 常见写入流程

### 情况 A：Place 已存在，只创建 Journey 与 Visit

将示例值替换为实际数据：

```sh
pnpm exec wrangler d1 execute DB --remote --command "
INSERT INTO atlas_journeys (
  slug, name, name_zh, start_date, end_date, description
) VALUES (
  'south-korea-2012',
  'South Korea Journey 2012',
  '韩国之旅',
  '2012',
  '2012',
  NULL
);

INSERT INTO atlas_visits (
  place_id, journey_id, visited_at, sequence, notes
) VALUES (
  (SELECT id FROM atlas_places WHERE slug = 'seoul'),
  (SELECT id FROM atlas_journeys WHERE slug = 'south-korea-2012'),
  '2012',
  1,
  NULL
);
"
```

子查询没有匹配到记录时会产生 `NULL`，外键/NOT NULL 约束会拒绝 Visit。不要改用硬编码 ID 绕过检查。

### 情况 B：Place 不存在，分阶段创建并解析行政代码

不要把 Place、Journey、Visit 放在同一批写入，也不要在 INSERT 中手写 `KOR`、`CHN` 或省级代码。

#### B1. 只创建 Place

```sh
pnpm exec wrangler d1 execute DB --remote --command "
INSERT INTO atlas_places (
  slug, name, name_zh, country, region, city,
  latitude, longitude
) VALUES (
  'seoul',
  'Seoul',
  '首尔',
  'South Korea',
  'Seoul',
  'Seoul',
  37.5665,
  126.9780
);
"
```

#### B2. 用坐标解析行政代码

先对单个 slug dry-run：

```sh
node scripts/backfill-administrative-codes.ts --remote --slug=seoul
```

输出必须只包含目标 Place，并显示合理的解析结果，例如 `—/— -> KOR/—`。确认后应用：

```sh
node scripts/backfill-administrative-codes.ts --remote --apply --slug=seoul
```

有两种解析失败，都必须停下，不要手写代码绕过：

- 输出 `did not resolve to any polygon`：坐标落在所有多边形之外（海面、境外或数据空洞）。检查坐标本身。
- 解析出的省份与你已知的行政归属不符：**数据源本身可能是错的**。坐标解析只看位置、不看来源权威性，官网、百科、地图服务都可能给出注册地址、同名地点或标注错误的坐标。此时换来源交叉验证，不要因为来源看起来权威就直接采用。

例：雪乡（黑龙江省海林市）的官网地址解析出 `220000`（吉林省），据此可判定那是运营公司的注册地址而非景区位置。

#### B3. 确认代码后创建 Journey 与 Visit

```sh
pnpm exec wrangler d1 execute DB --remote --command "
SELECT slug, sovereign_country_code, admin1_code
FROM atlas_places WHERE slug = 'seoul';
"
```

确认解析结果后再执行：

```sh
pnpm exec wrangler d1 execute DB --remote --command "

INSERT INTO atlas_journeys (
  slug, name, name_zh, start_date, end_date
) VALUES (
  'south-korea-2012',
  'South Korea Journey 2012',
  '韩国之旅',
  '2012',
  '2012'
);

INSERT INTO atlas_visits (
  place_id, journey_id, visited_at, sequence
) VALUES (
  (SELECT id FROM atlas_places WHERE slug = 'seoul'),
  (SELECT id FROM atlas_journeys WHERE slug = 'south-korea-2012'),
  '2012',
  1
);
"
```

Wrangler 应分别确认 Place 写入、行政代码更新，以及 Journey/Visit 两条写入。任何一步失败都不要立即重跑；先执行第 6 节的回查，避免唯一键冲突或重复数据。

### 情况 C：向已有 Journey 追加已有 Place

```sh
pnpm exec wrangler d1 execute DB --remote --command "
INSERT INTO atlas_visits (
  place_id, journey_id, visited_at, sequence, notes
) VALUES (
  (SELECT id FROM atlas_places WHERE slug = 'busan'),
  (SELECT id FROM atlas_journeys WHERE slug = 'south-korea-2012'),
  '2012',
  2,
  NULL
);
"
```

## 6. 写入后验证

### 6.1 关系完整性回查

```sh
pnpm exec wrangler d1 execute DB --remote --command "
SELECT
  j.id AS journey_id,
  j.slug,
  j.name,
  j.name_zh,
  j.start_date,
  j.end_date,
  v.id AS visit_id,
  v.visited_at,
  v.sequence,
  p.id AS place_id,
  p.slug AS place_slug,
  p.name,
  p.name_zh,
  p.country,
  p.sovereign_country_code,
  p.admin1_code
FROM atlas_journeys j
JOIN atlas_visits v ON v.journey_id = j.id
JOIN atlas_places p ON p.id = v.place_id
WHERE j.slug = 'south-korea-2012'
ORDER BY v.sequence;
"
```

必须确认：

- Journey 名称、slug 与日期正确。
- 每个 Visit 连接到正确 Place。
- `sequence` 从 1 连续递增。
- Place 坐标、国家和行政代码正确。
- Visit 日期与 Journey 范围相容。

### 6.2 孤立关系检查

```sh
pnpm exec wrangler d1 execute DB --remote --command "
SELECT COUNT(*) AS orphan_visits
FROM atlas_visits v
LEFT JOIN atlas_journeys j ON j.id = v.journey_id
LEFT JOIN atlas_places p ON p.id = v.place_id
WHERE j.id IS NULL OR p.id IS NULL;
"
```

结果必须为 `0`。

### 6.3 公网页面检查

```sh
curl -fsS -D - https://atlas.shenhaike.com/journeys/south-korea-2012/ -o /tmp/atlas-journey.html
rg -n "韩国之旅|South Korea Journey 2012|首尔|2012" /tmp/atlas-journey.html
```

同时检查：首页 Journey 筛选、Footprint 年份筛选、Journey 详情页和 Timeline。

## 7. 失败后的安全处理

先查询实际状态，不要盲目重复 INSERT：

```sh
pnpm exec wrangler d1 execute DB --remote --command "
SELECT id, slug FROM atlas_places WHERE slug = 'seoul';
SELECT id, slug FROM atlas_journeys WHERE slug = 'south-korea-2012';
SELECT v.id, v.sequence, p.slug AS place_slug
FROM atlas_visits v
JOIN atlas_places p ON p.id = v.place_id
JOIN atlas_journeys j ON j.id = v.journey_id
WHERE j.slug = 'south-korea-2012';
"
```

如果 Journey 是本次误建且确认没有任何需要保留的数据，删除 Journey 会由外键级联删除其 Visits，但不会删除 Places：

```sql
DELETE FROM atlas_journeys WHERE slug = 'south-korea-2012';
```

这是破坏性操作。Agent 必须明确确认目标 slug 和关联 Visit，且只有用户明确要求撤销/删除时才执行。

不要直接删除仍被其他 Journey 引用的 Place。数据库会拒绝，但仍应先检查：

```sql
SELECT j.slug, v.id
FROM atlas_visits v
JOIN atlas_journeys j ON j.id = v.journey_id
JOIN atlas_places p ON p.id = v.place_id
WHERE p.slug = 'seoul';
```

## 8. 常见错误

| 错误 | 原因 | 处理 |
| --- | --- | --- |
| `UNIQUE constraint failed: atlas_journeys.slug` | Journey slug 已存在 | 查询并复用/修改已有记录，不要重复插入 |
| `UNIQUE constraint failed: atlas_visits.journey_id, atlas_visits.sequence` | sequence 已被占用 | 查询 `MAX(sequence)` |
| `visit date outside journey range` | Visit 与 Journey 日期范围不相交 | 修正实际日期精度或 Journey 范围 |
| `FOREIGN KEY constraint failed` | Place/Journey 子查询无结果，或错误 ID | 用 slug 回查，不要猜 ID |
| 日期 CHECK constraint | 日期不是三种允许格式或不是真实日期 | 使用 `YYYY`、`YYYY-MM`、`YYYY-MM-DD` |
| Cloudflare `Authentication error [code: 10000]` | OAuth 瞬时失效或权限问题 | 不要假定写入失败；先通过公网详情页和稍后的只读查询回查 |

## 9. Agent 完成报告模板

```text
已加入生产数据库：

- Journey：<中文名> / <英文名>
- slug：<journey-slug>
- Journey 日期：<start> — <end>
- Places：<地点列表>
- Visit 日期与顺序：<列表>

已完成数据库关系回查和公网详情页检查。
本次仅修改生产数据，没有代码变更；Git 工作区保持干净。
```
