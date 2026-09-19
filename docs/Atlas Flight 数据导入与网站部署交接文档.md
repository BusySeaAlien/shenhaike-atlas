# Atlas Flight 数据导入与网站部署交接文档

> 更新日期：2026-09-19  
> 项目：`shenhaike-atlas`  
> 生产站点：`https://atlas.shenhaike.com`  
> Cloudflare Worker：`shenhaike-atlas`  
> Cloudflare D1：`shenhaike`（binding：`DB`）

## 1. 部署模型

Atlas 的发布分为两个独立步骤：

1. **数据库发布**：将 migration、机场/航司/机型参考数据及历史航班写入远程 D1；
2. **网站发布**：构建 Astro Worker 并通过 Wrangler 部署。

只更新 D1 数据时不需重新部署 Worker。Flight 公开页面按请求读取 D1 且返回 `Cache-Control: no-store`，数据写入后下一次请求即可看到。只有代码、样式、路由或 Worker 配置变更时才需要网站发布。

## 2. 环境与权限

所需环境：

- Node.js `24.21.0`；
- pnpm `12.4.1`；
- Wrangler `4.131.1`（已锁定在项目 devDependencies）；
- 可访问 Cloudflare 账户中 Worker 和 D1 的身份。

首次操作先执行：

```bash
cd /Users/guillaume/Guillaume/Developer/shenhaike/shenhaike-atlas
pnpm install --frozen-lockfile
pnpm exec wrangler whoami
```

生产 Worker 还依赖以下 secrets：

- `ACCESS_AUD`
- `ACCESS_TEAM_DOMAIN`
- `ADMIN_EMAIL`

只查询 secret 名称：

```bash
pnpm exec wrangler secret list
```

不要把 secret 值写入仓库、SQL、CSV 或交接文档。

## 3. 发布前检查

### 3.1 同步代码

```bash
git fetch origin
git status --short --branch
git pull --ff-only origin main
```

工作区如果不干净，先确认每个文件的所有者和用途。不要为了部署使用 `git reset --hard`、`git clean -fd` 或覆盖未提交文件。

### 3.2 运行完整验证

```bash
pnpm verify
```

`pnpm verify` 依次执行：

- Vitest 单元测试；
- 隔离 local D1 的 migration/seed/约束验证；
- Astro/TypeScript 检查；
- 生产构建。

任何一项失败都不应继续部署。

## 4. D1 migration

先查看远程 migration 状态：

```bash
pnpm exec wrangler d1 migrations list DB --remote
```

有待执行 migration 时：

```bash
pnpm db:migrate:production
```

再次确认：

```bash
pnpm exec wrangler d1 migrations list DB --remote
```

预期结果是 `No migrations to apply`。不要手工跳过 migration 直接导入依赖新表或新字段的数据。

## 5. Flight 参考数据

### 5.1 重新生成

```bash
node scripts/build-aircraft-types.mjs
node scripts/build-airlines-cn-hk-mo.mjs
node scripts/build-airports-cn-hk-mo.mjs /path/to/airports.csv
node scripts/generate-flight-reference-sql.mjs
```

机场生成器在上游出现未配置中文映射、重复 IATA 或校验错误时会非零退出，且不会覆盖已有 JSON。

### 5.2 导入生产

```bash
pnpm exec wrangler d1 execute DB --remote --file=./flight-reference-data.sql
```

`flight-reference-data.sql` 使用自然键幂等 upsert：

- `atlas_airports.iata_code`；
- `atlas_airlines.iata_code`；
- `atlas_aircraft_types.icao_code`。

重复执行会更新已有记录，不会重复插入，并保留已有主键 ID，因此不会破坏 Flight 外键。

## 6. 历史航班导入

### 6.1 输入文件

生成器默认读取：

- `docs/航班-已结束-国内.csv`；
- `docs/航班-已结束-国际港澳台.csv`。

这两个 CSV 共 119 行。其中 4 行与前一条具有完全相同的数据库唯一键：

- 序号 79，保留 78；
- 序号 77，保留 76；
- 序号 82，保留 81；
- 序号 84，保留 83。

因此生产库的预期唯一航班数是 **115**，而不是 119。

### 6.2 生成导入 SQL

```bash
node scripts/generate-flight-history-sql.mjs
```

生成器会：

1. 解析两个 CSV；
2. 按数据库唯一键去重；
3. 使用 `src/lib/flight-math.ts` 重新计算里程、航线系数、估算时长和国内/国际标记；
4. 将结果与 CSV 中的预计算值交叉校验；
5. 补齐 10 家历史/境外航司和 19 个机场；
6. 生成 `flight-history-import.sql`。

阿联酋与韩国的 `country` 字段使用项目 `i18n-iso-countries` 的标准值 `UAE` 和 `Korea, Republic of`，不要改回会导致后台表单校验失败的其他拼法。

### 6.3 导入生产

在参考数据导入完成后执行：

```bash
pnpm exec wrangler d1 execute DB --remote --file=./flight-history-import.sql
```

该 SQL 会先 upsert 缺失航司和机场，再通过 IATA 代码实时查询外键 ID。航班使用五列唯一键幂等 upsert：

```text
airline_id + flight_number + flight_date + departure_airport_id + arrival_airport_id
```

重复执行会更新时间和派生值，航班总数仍应为 115。

## 7. 生产数据回查

导入后执行：

```bash
pnpm exec wrangler d1 execute DB --remote --command "
SELECT
  (SELECT COUNT(*) FROM atlas_airlines) AS airlines,
  (SELECT COUNT(*) FROM atlas_airports) AS airports,
  (SELECT COUNT(*) FROM atlas_aircraft_types) AS aircraft_types,
  (SELECT COUNT(*) FROM atlas_flights) AS flights,
  (SELECT COUNT(*) FROM atlas_flights WHERE is_domestic = 1) AS domestic,
  (SELECT COUNT(*) FROM atlas_flights WHERE is_domestic = 0) AS international;
"
```

2026-09-19 导入后的基线：

| 项目 | 数量 |
|---|---:|
| 航司 | 54 |
| 机场 | 291 |
| 机型 | 50 |
| 航班 | 115 |
| 国内航班 | 64 |
| 国际及港澳台 | 51 |

外键和重复检查：

```bash
pnpm exec wrangler d1 execute DB --remote --command "
SELECT COUNT(*) AS broken_refs
FROM atlas_flights f
LEFT JOIN atlas_airlines l ON l.id = f.airline_id
LEFT JOIN atlas_airports d ON d.id = f.departure_airport_id
LEFT JOIN atlas_airports a ON a.id = f.arrival_airport_id
WHERE l.id IS NULL OR d.id IS NULL OR a.id IS NULL;

SELECT COUNT(*) AS duplicate_groups FROM (
  SELECT airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id
  FROM atlas_flights
  GROUP BY airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id
  HAVING COUNT(*) > 1
);
"
```

两个结果都必须是 `0`。

## 8. 网站部署

### 8.1 构建

```bash
pnpm build
```

### 8.2 部署 Worker

```bash
pnpm exec wrangler deploy
```

Wrangler 会使用 `wrangler.jsonc` 中的 Worker 名、D1 binding 和自定义域名配置。部署成功后记录 Wrangler 输出的 Version ID。

### 8.3 查看部署

```bash
pnpm exec wrangler deployments list
```

### 8.4 上线验证

```bash
curl -I https://atlas.shenhaike.com/
curl -I https://atlas.shenhaike.com/flight/
curl -sS https://atlas.shenhaike.com/flight/ | grep -E "115 flights|GJ8888|CZ5438"
```

预期：

- 首页和 `/flight/` 返回 HTTP 200；
- Flight 页面显示 115 条航班；
- 最新航班包含 `GJ8888` 和 `CZ5438`；
- `/guillaume/` 及管理 API 仍受 Cloudflare Access 和 Worker JWT 校验保护。

## 9. 提交与推送

部署前建议先将已验证代码提交：

```bash
git status --short
git diff --check
git add -- <本次文件>
git diff --cached --check
git commit -m "feat: import flight history"
git push origin main
```

只暂存本次变更。不要把无关的未提交文件一起加入。建议提交：

- `scripts/generate-flight-history-sql.mjs`；
- `flight-history-import.sql`；
- 两个 CSV（如确认允许将其中的客票号提交到仓库）；
- 本交接文档。

CSV 含客票号等个人行程信息。推送前必须先确认仓库的可见性和个人信息处理方案。

## 10. 回滚与故障处理

### 10.1 Worker 回滚

先查看部署历史：

```bash
pnpm exec wrangler deployments list
```

代码回滚优先重新部署上一个已验证 Git 提交。也可使用 Wrangler 的 rollback 命令，但执行前必须核对目标 Version ID：

```bash
pnpm exec wrangler rollback <version-id>
```

Worker 回滚不会自动回滚 D1。

### 10.2 D1 数据恢复

- 不要在紧急情况下删表或执行无限定条件的 `DELETE`；
- 幂等 SQL 执行失败时，D1 import 会将该次导入恢复到原状态，核对错误后可重试；
- 如果已成功写入但数据内容错误，先记录当前 D1 bookmark、错误范围和目标唯一键；
- 优先生成精确的反向 `UPDATE`/`DELETE` 脚本并在隔离 local D1 演练；
- 需整库恢复时，使用 Cloudflare D1 Time Travel/备份能力，按 Cloudflare 控制台当前流程操作。

### 10.3 常见问题

| 现象 | 处理 |
|---|---|
| `No migrations to apply` | 正常，表示远程 migration 已同步 |
| `UNIQUE constraint failed` | 检查是否使用了本文的幂等 SQL，并查看冲突自然键 |
| 航班外键为空 | 先导入参考数据，再核对 CSV 的 IATA 代码 |
| 后台编辑机场时国家校验失败 | 使用 `src/lib/countries.ts` 生成的英文国家名，不要自由填写别名 |
| 数据已更新但页面没变 | 确认查询的是 `--remote` D1，检查 Worker 的 `DB` binding 和页面 HTTP 状态 |
| 部署成功但后台 503 | 检查 `ACCESS_AUD`、`ACCESS_TEAM_DOMAIN`、`ADMIN_EMAIL` secrets |

## 11. 当前生产状态

截至 2026-09-19：

- Flight 功能提交 `517c739 feat: add flight archive` 已推送并部署；
- Flight 参考数据提交 `48b3bee feat: add flight reference data` 已推送；
- 远程 D1 migration 无待执行项；
- 生产 D1 已写入 54 家航司、291 个机场、50 个机型和 115 条航班；
- `/flight/` 已能从生产 D1 显示 115 条航班。

