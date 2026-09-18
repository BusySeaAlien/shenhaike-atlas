# Atlas Flight 航班档案实施交接文档

> 状态：实施前设计定稿  
> 目标仓库：`shenhaike-atlas`  
> 公开入口：`/flight/`  
> 后台入口：`/guillaume/`  
> 本文档约束：首版不调用任何航班、机场或航路第三方 API；所有数据只能在 `/guillaume/` 后台维护。

---

## 1. 项目目标

在现有 Atlas 中增加独立的航班档案模块。现有首页 `/`、Places、Journeys、Timeline 和 Wishlist 保持不变。

公开页面 `/flight/` 完全只读，负责：

- 展示与 Atlas 首页视觉一致的旋转地球；
- 将飞过的机场显示为小白点；
- 将每条 Flight 的起降机场以高于球面的 3D 大圆弧连接；
- 按年度筛选；
- 按国内/国际筛选；
- 展示筛选后的航班统计与航班列表。

所有 Flight、Airport、Airline 和 Aircraft Type 的新建、编辑、删除只能发生在受保护的 `/guillaume/` 后台：

```text
/guillaume/flights/
/guillaume/airports/
/guillaume/airlines/
/guillaume/aircraft-types/
```

公开页面不得出现写入入口，也不得提供公开写 API。

---

## 2. 已确认的业务规则

### 2.1 Flight 独立存在

Flight 是独立档案，Journey 只是可选关联：

```text
Flight 0..1 ── Journey
```

- Flight 可以不属于任何 Journey；
- 无 Journey 的 Flight 仍进入 `/flight/` 的地球、列表与全站统计；
- Flight 可以在后台随时挂到 Journey 或解除关联；
- Journey 删除时，关联 Flight 保留，`journey_id` 自动置空；
- Journey 页面首版不展示 Flight，只保留未来接入所需的外键。

### 2.2 一条 Flight 表示一个实际航段

例如 `PVG → SIN → CDG` 应保存为两条 Flight：

```text
PVG → SIN
SIN → CDG
```

往返航班同样分别保存。起飞机场和到达机场不能相同。

### 2.3 国内/国际定义

本项目采用中国大陆口径：

```text
国内：起降机场的 ISO3 均为 CHN
国际：其他全部情况
```

因此以下均为国际：

- 中国大陆 ↔ 香港；
- 中国大陆 ↔ 澳门；
- 中国大陆 ↔ 台湾；
- 香港 ↔ 澳门；
- 美国境内、法国境内等非中国大陆航班；
- 任意一端不属于中国大陆的航班。

分类由后端根据 Airport 的 `country_code` 自动产生，后台不允许人工选择或覆盖。

### 2.4 航班号

Flight 表单先选择 Airline，再输入纯数字航班号。展示时组合航司 IATA 代码和数字：

```text
Airline.iataCode = "MU"
Flight.flightNumber = "5123"
Display = "MU5123"
```

航班号以 `TEXT` 保存，避免丢失前导零。允许 1–6 位数字，不允许在数字输入框中重复输入航司代码。

---

## 3. 数据库设计

新增迁移：

```text
migrations/0006_flight_archive.sql
```

使用 `0006`，不要重新占用 `0005`。生产库曾应用过现已撤销文件中的 `0005_visit_transport.sql`；本功能不恢复、不删除，也不依赖该列。

### 3.1 `atlas_airports`

```sql
CREATE TABLE atlas_airports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  iata_code TEXT NOT NULL UNIQUE,
  icao_code TEXT UNIQUE,

  name TEXT NOT NULL,
  name_zh TEXT,

  city TEXT NOT NULL,
  city_zh TEXT,

  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT,

  latitude REAL NOT NULL,
  longitude REAL NOT NULL,

  timezone TEXT NOT NULL,
  elevation_ft INTEGER,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(iata_code) = 3),
  CHECK (icao_code IS NULL OR length(icao_code) = 4),
  CHECK (length(name) BETWEEN 1 AND 160),
  CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  CHECK (length(city) BETWEEN 1 AND 120),
  CHECK (city_zh IS NULL OR length(city_zh) <= 120),
  CHECK (length(country) BETWEEN 1 AND 100),
  CHECK (length(country_code) = 3),
  CHECK (region IS NULL OR length(region) <= 120),
  CHECK (latitude BETWEEN -90.0 AND 90.0),
  CHECK (longitude BETWEEN -180.0 AND 180.0),
  CHECK (length(timezone) BETWEEN 1 AND 64),
  CHECK (elevation_ft IS NULL OR elevation_ft BETWEEN -2000 AND 30000),
  CHECK (notes IS NULL OR length(notes) <= 3000)
);

CREATE INDEX atlas_airports_country_idx
ON atlas_airports(country_code, city);

CREATE INDEX atlas_airports_name_idx
ON atlas_airports(name);
```

标准化规则：

- `iata_code`：转大写，只允许三个英文字母；
- `icao_code`：转大写，允许为空；存在时为四位字母或数字；
- `country_code`：ISO 3166-1 alpha-3，大写；
- `timezone`：IANA 时区，例如 `Asia/Shanghai`；
- 经纬度：WGS84；
- 海拔：英尺。

### 3.2 `atlas_airlines`

```sql
CREATE TABLE atlas_airlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  iata_code TEXT NOT NULL UNIQUE,
  icao_code TEXT UNIQUE,

  name TEXT NOT NULL,
  name_zh TEXT,

  country TEXT NOT NULL,
  country_code TEXT NOT NULL,

  callsign TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(iata_code) = 2),
  CHECK (icao_code IS NULL OR length(icao_code) = 3),
  CHECK (length(name) BETWEEN 1 AND 160),
  CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  CHECK (length(country) BETWEEN 1 AND 100),
  CHECK (length(country_code) = 3),
  CHECK (callsign IS NULL OR length(callsign) <= 80),
  CHECK (notes IS NULL OR length(notes) <= 3000)
);
```

规则：

- IATA 代码必填，两个大写字母或数字；
- ICAO 代码可选，三个大写字母或数字；
- Flight 必须关联 Airline；
- 被 Flight 引用的 Airline 不允许删除。

### 3.3 `atlas_aircraft_types`

```sql
CREATE TABLE atlas_aircraft_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  icao_code TEXT NOT NULL UNIQUE,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  model_zh TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(icao_code) BETWEEN 2 AND 4),
  CHECK (length(manufacturer) BETWEEN 1 AND 100),
  CHECK (length(model) BETWEEN 1 AND 160),
  CHECK (model_zh IS NULL OR length(model_zh) <= 160),
  CHECK (notes IS NULL OR length(notes) <= 3000)
);
```

示例：

```text
icao_code: A320
manufacturer: Airbus
model: A320-200
model_zh: 空客 A320-200
```

Flight 可以暂时不选择机型；一旦选择，必须引用机型库中的记录。被 Flight 引用的 Aircraft Type 不允许删除。

### 3.4 `atlas_flights`

```sql
CREATE TABLE atlas_flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  airline_id INTEGER NOT NULL,
  flight_number TEXT NOT NULL,
  flight_date TEXT NOT NULL,

  departure_airport_id INTEGER NOT NULL,
  arrival_airport_id INTEGER NOT NULL,

  journey_id INTEGER,
  aircraft_type_id INTEGER,

  aircraft_registration TEXT,
  scheduled_departure_local TEXT,
  scheduled_arrival_local TEXT,

  cabin_class TEXT,
  seat_number TEXT,
  notes TEXT,

  great_circle_km REAL NOT NULL,
  route_factor REAL NOT NULL,
  route_distance_km REAL NOT NULL,
  estimated_hours REAL NOT NULL,
  formula_version INTEGER NOT NULL DEFAULT 1,

  is_domestic INTEGER NOT NULL,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (airline_id)
    REFERENCES atlas_airlines(id) ON DELETE RESTRICT,
  FOREIGN KEY (departure_airport_id)
    REFERENCES atlas_airports(id) ON DELETE RESTRICT,
  FOREIGN KEY (arrival_airport_id)
    REFERENCES atlas_airports(id) ON DELETE RESTRICT,
  FOREIGN KEY (journey_id)
    REFERENCES atlas_journeys(id) ON DELETE SET NULL,
  FOREIGN KEY (aircraft_type_id)
    REFERENCES atlas_aircraft_types(id) ON DELETE RESTRICT,

  CHECK (
    length(flight_number) BETWEEN 1 AND 6
    AND flight_number NOT GLOB '*[^0-9]*'
  ),
  CHECK (
    length(flight_date) = 10
    AND flight_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  CHECK (departure_airport_id <> arrival_airport_id),
  CHECK (aircraft_registration IS NULL OR length(aircraft_registration) <= 20),
  CHECK (scheduled_departure_local IS NULL OR length(scheduled_departure_local) = 16),
  CHECK (scheduled_arrival_local IS NULL OR length(scheduled_arrival_local) = 16),
  CHECK (
    cabin_class IS NULL OR
    cabin_class IN ('economy', 'premium_economy', 'business', 'first', 'other')
  ),
  CHECK (seat_number IS NULL OR length(seat_number) <= 10),
  CHECK (notes IS NULL OR length(notes) <= 3000),
  CHECK (great_circle_km > 0),
  CHECK (route_factor > 1),
  CHECK (route_distance_km > 0),
  CHECK (estimated_hours > 0),
  CHECK (formula_version >= 1),
  CHECK (is_domestic IN (0, 1)),

  UNIQUE (
    airline_id,
    flight_number,
    flight_date,
    departure_airport_id,
    arrival_airport_id
  )
);

CREATE INDEX atlas_flights_date_idx
ON atlas_flights(flight_date DESC, id DESC);

CREATE INDEX atlas_flights_type_date_idx
ON atlas_flights(is_domestic, flight_date DESC);

CREATE INDEX atlas_flights_airline_idx
ON atlas_flights(airline_id, flight_date DESC);

CREATE INDEX atlas_flights_aircraft_idx
ON atlas_flights(aircraft_type_id, flight_date DESC);

CREATE INDEX atlas_flights_departure_idx
ON atlas_flights(departure_airport_id);

CREATE INDEX atlas_flights_arrival_idx
ON atlas_flights(arrival_airport_id);

CREATE INDEX atlas_flights_journey_idx
ON atlas_flights(journey_id);
```

时间字段含义：

```text
flight_date
  出发机场当地日历日期，YYYY-MM-DD

scheduled_departure_local
  出发机场当地日期时间，YYYY-MM-DDTHH:mm

scheduled_arrival_local
  到达机场当地日期时间，YYYY-MM-DDTHH:mm
```

这两个当地时间不应按照 Worker 或浏览器时区转换。机场 IANA 时区独立保存在 Airport 中，未来需要 UTC 时再进行明确转换。

---

## 4. 距离与时间计算

新增纯函数模块：

```text
src/lib/flight-math.ts
```

### 4.1 大圆距离 `d`

使用标准 Haversine：

```ts
haversineKm(
  departure: { latitude: number; longitude: number },
  arrival: { latitude: number; longitude: number },
): number
```

地球平均半径：

```ts
const EARTH_RADIUS_KM = 6371.0088;
```

要求：

- 支持跨 ±180° 日期变更线；
- 对接近对跖点的浮点误差进行 `[0, 1]` clamp；
- 相同坐标返回 0，但 Flight 校验必须拒绝结果为 0 的航段。

### 4.2 航路系数 `k`

`k` 根据大圆距离 `d`，不是根据 `D`：

```ts
export function routeFactorForDistance(d: number): number {
  if (d <= 500) return 1.12;
  if (d <= 1500) return 1.08;
  if (d <= 5000) return 1.05;
  return 1.03;
}
```

边界：

```text
d = 500      → 1.12
d = 1500     → 1.08
d = 5000     → 1.05
d > 5000     → 1.03
```

### 4.3 航路距离 `D`

```text
D = d × k
```

数据库保存完整浮点值，不在写入时四舍五入。页面展示时四舍五入到整数公里。

### 4.4 估算航程时间 `T`

原图片第一、第二段在 500 km 处不连续。已确认采用“保留中长程函数，修正短程函数”的连续版本：

```ts
export function estimatedHoursForRouteDistance(D: number): number {
  if (D <= 500) {
    return 0.25 + 0.0006 * D;
  }

  if (D <= 1500) {
    return 0.55 + (D - 500) / 700;
  }

  const at1500 = 0.55 + 1000 / 700;
  return at1500 + (D - 1500) / 850;
}
```

连续性：

```text
T(500)  = 0.55 小时
T(1500) = 1.9785714286 小时
```

显示时：

```ts
const totalMinutes = Math.round(hours * 60);
```

统一格式为：

```text
48m
2h 17m
12h 06m
```

### 4.5 服务端快照

新增统一计算函数：

```ts
calculateFlightMetrics(departure, arrival): {
  greatCircleKm: number;
  routeFactor: number;
  routeDistanceKm: number;
  estimatedHours: number;
  formulaVersion: 1;
  isDomestic: boolean;
}
```

Flight 创建和更新时必须由服务端调用。浏览器提交的 d、k、D、T、分类和版本全部忽略。

### 4.6 Airport 修改后的重算

Airport 更新以下字段时必须重算所有关联 Flight：

```text
latitude
longitude
country_code
```

实现方式：

1. 查询该 Airport 作为出发或到达机场的所有 Flight；
2. 同时取得每条 Flight 另一端机场的坐标和国家代码；
3. 使用 Airport 的新值在内存中重算；
4. 将 Airport UPDATE 与所有 Flight 派生字段 UPDATE 放入同一个 D1 `batch()`；
5. 任一语句失败则整批回滚。

只修改名称、城市、时区、海拔或备注时不需要重算。

---

## 5. TypeScript 类型

在 `src/types/domain.ts` 增加：

```ts
export interface Airport {
  id: number;
  iataCode: string;
  icaoCode: string | null;
  name: string;
  nameZh: string | null;
  city: string;
  cityZh: string | null;
  country: string;
  countryCode: string;
  region: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevationFt: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Airline {
  id: number;
  iataCode: string;
  icaoCode: string | null;
  name: string;
  nameZh: string | null;
  country: string;
  countryCode: string;
  callsign: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AircraftType {
  id: number;
  icaoCode: string;
  manufacturer: string;
  model: string;
  modelZh: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CabinClass =
  | "economy"
  | "premium_economy"
  | "business"
  | "first"
  | "other";

export interface Flight {
  id: number;
  airlineId: number;
  flightNumber: string;
  flightDate: string;
  departureAirportId: number;
  arrivalAirportId: number;
  journeyId: number | null;
  aircraftTypeId: number | null;
  aircraftRegistration: string | null;
  scheduledDepartureLocal: string | null;
  scheduledArrivalLocal: string | null;
  cabinClass: CabinClass | null;
  seatNumber: string | null;
  notes: string | null;
  greatCircleKm: number;
  routeFactor: number;
  routeDistanceKm: number;
  estimatedHours: number;
  formulaVersion: number;
  isDomestic: boolean;
  createdAt: string;
  updatedAt: string;
}
```

分别增加对应 Input 类型。Input 不得包含服务端派生字段。

公开页面增加：

```ts
export interface FlightArchiveAirport {
  id: string;
  iataCode: string;
  name: string;
  nameZh: string | null;
  city: string;
  cityZh: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface FlightArchiveRoute {
  id: string;
  displayNumber: string;
  flightDate: string;
  year: string;
  isDomestic: boolean;
  airlineName: string;
  airlineNameZh: string | null;
  aircraftLabel: string | null;
  departure: FlightArchiveAirport;
  arrival: FlightArchiveAirport;
  greatCircleKm: number;
  routeDistanceKm: number;
  estimatedHours: number;
}

export interface FlightArchiveData {
  airports: FlightArchiveAirport[];
  flights: FlightArchiveRoute[];
  years: string[];
}
```

---

## 6. 数据访问层

新增：

```text
src/lib/db/airports.ts
src/lib/db/airlines.ts
src/lib/db/aircraft-types.ts
src/lib/db/flights.ts
```

扩展：

```text
src/lib/db/rows.ts
src/lib/db/public.ts
```

每个资料库模块提供：

```ts
list...
get...ById
create...
update...
delete...
```

删除规则：

- Airport 删除前查询出发与到达引用数；
- Airline 删除前查询 Flight 引用数；
- Aircraft Type 删除前查询 Flight 引用数；
- 存在引用时返回 `DataError("conflict", ...)`；
- Flight 可以直接删除；
- Flight 删除不会删除 Airport、Airline 或 Aircraft Type。

公开查询：

```ts
getFlightArchiveData(db): Promise<FlightArchiveData>
```

使用一次 JOIN 查询读取 Flight、Airline、Airport、Aircraft Type 和可选 Journey，不允许对每条 Flight 分别查询。

```sql
ORDER BY f.flight_date DESC, f.id DESC
```

Airport payload 从 Flight 查询结果中按 ID 去重。年份取 `flight_date.slice(0, 4)` 后倒序排列。

---

## 7. 服务端验证

在 `src/lib/validation/domain.ts` 增加四类验证器。

### 7.1 Airport

- IATA：三个英文字母；
- ICAO：可空，否则四位字母或数字；
- ISO3：三个大写英文字母，并能被现有国家数据识别；
- 英文名、城市、国家、时区必填；
- 中文名、中文城市、地区、备注可空；
- 经纬度合法；
- 海拔为合理范围内整数；
- 所有文本符合数据库长度约束。

### 7.2 Airline

- IATA：两位字母或数字；
- ICAO：可空，否则三位字母或数字；
- 英文名和国家必填；
- ISO3 合法；
- 所有代码统一转大写。

### 7.3 Aircraft Type

- ICAO type designator：2–4 位大写字母或数字；
- 制造商和英文型号必填；
- 中文型号和备注可空。

### 7.4 Flight

- Airline、Departure Airport、Arrival Airport 必须存在；
- Aircraft Type、Journey 存在或为空；
- Flight number 为 1–6 位纯数字；
- 前导零不得丢失；
- `flight_date` 必须是真实日历日期；
- 起降机场不能相同；
- 当地日期时间必须是有效的 `YYYY-MM-DDTHH:mm`；
- 注册号统一转大写；
- cabin class 属于固定枚举；
- 唯一约束冲突转为“该航班记录已存在”。

---

## 8. 后台路由与 API

### 8.1 页面

```text
/guillaume/flights/
/guillaume/flights/new/
/guillaume/flights/[id]/

/guillaume/airports/
/guillaume/airports/new/
/guillaume/airports/[id]/

/guillaume/airlines/
/guillaume/airlines/new/
/guillaume/airlines/[id]/

/guillaume/aircraft-types/
/guillaume/aircraft-types/new/
/guillaume/aircraft-types/[id]/
```

### 8.2 API

```text
POST   /guillaume/api/flights/
PATCH  /guillaume/api/flights/[id]/
DELETE /guillaume/api/flights/[id]/

POST   /guillaume/api/airports/
PATCH  /guillaume/api/airports/[id]/
DELETE /guillaume/api/airports/[id]/

POST   /guillaume/api/airlines/
PATCH  /guillaume/api/airlines/[id]/
DELETE /guillaume/api/airlines/[id]/

POST   /guillaume/api/aircraft-types/
PATCH  /guillaume/api/aircraft-types/[id]/
DELETE /guillaume/api/aircraft-types/[id]/
```

全部继承现有后台安全边界：

- Cloudflare Access；
- 本地开发身份；
- 可信 Origin 校验；
- `Cache-Control: no-store`；
- `X-Robots-Tag: noindex, nofollow`；
- 统一 JSON 错误格式。

不得新增公开 POST、PATCH 或 DELETE API。

### 8.3 Dashboard

`/guillaume/` 增加四个指标：

```text
Flights
Airports
Airlines
Aircraft Types
```

增加快捷入口并扩展 AdminLayout 导航。

---

## 9. Flight 后台表单

新增：

```text
src/components/admin/FlightForm.astro
```

字段顺序：

1. Airline（必填）；
2. Flight number，仅数字（必填）；
3. Flight date（必填）；
4. Departure airport（必填）；
5. Arrival airport（必填）；
6. Journey（可选）；
7. Aircraft type（可选）；
8. Aircraft registration（可选）；
9. Scheduled departure local（可选）；
10. Scheduled arrival local（可选）；
11. Cabin class（可选）；
12. Seat number（可选）；
13. Notes（可选）。

选项显示：

```text
PVG · 上海浦东国际机场 · Shanghai
MU · 中国东方航空 · China Eastern Airlines
A320 · Airbus A320-200
```

### 9.1 表单内新建资料

Airport、Airline、Aircraft Type 下拉最后一项分别为：

```text
＋ 新建机场
＋ 新建航司
＋ 新建机型
```

要求：

- 只存在于 `/guillaume/` 页面；
- 使用原生 `<dialog>` 或等价的无障碍模态框；
- 不离开 Flight 页面；
- 不清空已经填写的 Flight 内容；
- 取消时恢复此前选项；
- 保存调用相应 `/guillaume/api/...` POST；
- 成功后追加到下拉并自动选中；
- 失败时保留输入并逐字段显示错误；
- 提交期间禁止重复提交；
- Escape 和取消按钮可关闭；
- 关闭后焦点回到原下拉框。

独立资料库管理页仍然必须存在，弹窗不是管理页的替代品。

---

## 10. 公开 `/flight/` 页面

新增：

```text
src/pages/flight/index.astro
src/components/FlightGlobe.astro
```

页面使用：

```text
title: Flights — Atlas
bodyClass: flight-space
colorScheme: dark
```

主导航增加 `Flight`。中间件将 `/flight` 和 `/flight/` 加入动态档案范围并设置 `Cache-Control: no-store`。

### 10.1 页面结构

```text
Flight Globe
↓
Flight statistics
↓
Filtered flight list
```

公开页面不得提供新建、编辑、删除、后台跳转或写请求。

### 10.2 筛选器

年度：

```text
All time
2026
2025
...
```

类型：

```text
All
Domestic
International
```

URL 状态：

```text
/flight/?year=2026&type=international
```

非法参数回退到 All。筛选在客户端完成，并同步更新：

- 地球弧线；
- 机场白点；
- 统计数字；
- 航班列表；
- URL 查询参数；
- 无结果提示。

### 10.3 统计

显示当前筛选范围内：

```text
Flights
Airports
Distance
Estimated Time
```

计算：

```text
Flights = Flight 数量
Airports = 起降 Airport ID 去重数量
Distance = sum(routeDistanceKm)
Estimated Time = sum(estimatedHours)
```

### 10.4 航班列表

按 `flight_date DESC, id DESC` 排序，每条至少显示：

- 日期；
- 完整航班号；
- 航司中英文名；
- 起降机场 IATA、中文名、城市；
- 国内/国际；
- 机型；
- 航路距离 D；
- 估算时间 T；
- 可选 Journey 名称。

首版不新增公开单航班详情页。

---

## 11. Flight 地球实现

### 11.1 复用 Atlas 地球

保留并复用：

- MapLibre GL；
- NASA GIBS 底图；
- Globe projection；
- 世界初始相机；
- 自动旋转和交互暂停；
- `prefers-reduced-motion`；
- 晨昏线；
- 夜间灯光；
- attribution；
- 加载失败状态；
- 键盘可访问地图区域；
- 页面排版、工具栏和 orbit label 风格。

不要修改现有 `PreHomeGlobe` 的 Journey、Footprint 或 Wishlist 行为。Flight 使用独立组件，避免状态互相污染。

### 11.2 deck.gl 叠加

新增依赖：

```text
@deck.gl/core
@deck.gl/layers
@deck.gl/maplibre
```

使用 `MapLibreOverlay` 和 `ArcLayer`：

```ts
new ArcLayer({
  id: "flight-arcs",
  data: filteredFlights,

  getSourcePosition: (flight) => [
    flight.departure.longitude,
    flight.departure.latitude,
  ],
  getTargetPosition: (flight) => [
    flight.arrival.longitude,
    flight.arrival.latitude,
  ],

  greatCircle: true,
  numSegments: 100,
  antialiasing: true,
  pickable: true,

  getWidth: 1.4,
  widthMinPixels: 1,
  widthMaxPixels: 2.5,

  getSourceColor: [236, 241, 239, 180],
  getTargetColor: [236, 241, 239, 180],

  getHeight: (flight) =>
    Math.min(1.8, Math.max(0.25, flight.greatCircleKm / 4000)),

  parameters: { cullMode: "none" },
});
```

要求：

- 航线走最短大圆方向；
- 弧线明显高于球面；
- 地球背面的弧线不能穿透显示；
- 每条 Flight 独立绘制；
- 同一路线多次乘坐时保留多条重叠弧线，不聚合；
- 过滤时替换 ArcLayer `data`；
- 组件销毁时 `finalize()` overlay。

### 11.3 Airport 白点

当前筛选范围内按 Airport ID 去重，更新独立 GeoJSON source，并使用 MapLibre circle layer 绘制：

```text
circle-radius: 3–5 px，随 zoom 插值
circle-color: #f5f7f6
circle-opacity: 0.95
circle-stroke-color: rgba(15, 18, 19, 0.85)
circle-stroke-width: 1
```

点击机场显示 IATA、中英文名、城市和国家。

### 11.4 Arc 交互

- hover 时显示轻量 tooltip 并使用 pointer；
- click 时显示日期、航班号、起降机场、航司、机型、D 和 T；
- 重复弧线完全重叠时返回最上层命中的 Flight，不做聚合选择器。

### 11.5 自动旋转

- 默认缓慢旋转；
- 用户拖动、缩放或交互时暂停；
- 页面不可见时暂停；
- reduced motion 时禁用；
- 筛选不自动改变相机；
- 点击机场或弧线可以平滑居中，但不得缩放到球体内部。

Flight 页面不需要 Atlas 的 World/China、Footprint/Journey、Cluster、Wishlist 或 Journey selector。

---

## 12. 错误、空状态与降级

### 12.1 D1 查询失败

- `/flight/` 返回 HTTP 503；
- 使用现有 `DataFailure`；
- 不泄露 SQL、表名或异常堆栈。

### 12.2 没有 Flight

```text
No flights yet.
Flights added in the private archive will appear here.
```

公开页面不显示后台入口。

### 12.3 JavaScript 禁用

仍展示服务端初始统计和完整航班列表。通过 `<noscript>` 说明交互式地球和筛选需要 JavaScript。

### 12.4 deck.gl 加载失败

- Atlas 基础地球继续显示；
- MapLibre Airport 白点继续显示；
- 状态区域提示航线图层不可用；
- 统计和 Flight 列表保持可用；
- deck.gl 异常不得终止整个页面脚本。

---

## 13. 测试计划

### 13.1 数学测试

新增：

```text
src/lib/flight-math.test.ts
```

覆盖：

- 已知机场对距离；
- ±179.5° 日期变更线；
- 相同坐标；
- 接近对跖点；
- 500、1500、5000 km 的系数边界；
- `D = d × k`；
- T 在 500 和 1500 km 处连续；
- T 对合法 D 为正且单调递增。

### 13.2 验证测试

- Airport、Airline、Aircraft Type 代码归一；
- 非法 IATA、ICAO、ISO3；
- 经纬度和海拔越界；
- Flight number 包含字母；
- 前导零保留；
- 非法真实日期；
- 相同起降机场；
- 不存在的外键；
- 空字符串归一为 `null`。

### 13.3 DB fake-D1 测试

- Flight INSERT 不接受客户端派生值；
- 服务端绑定正确的 d/k/D/T；
- 国内/国际正确；
- Airport 更新重算关联 Flight；
- 有引用的资料项删除返回 conflict；
- Journey 删除后 Flight 保留且关联置空；
- 公开查询无 N+1；
- Airport payload 去重；
- 相同路线的多条 Flight 全部保留。

### 13.4 真实数据库验证

扩展 `scripts/verify-database.mjs`，验证：

- 四张新表及索引；
- IATA/ICAO 唯一约束；
- Flight number、机场不同、cabin class CHECK；
- Flight 唯一组合；
- 资料库删除限制；
- Journey 删除置空；
- Flight 删除不级联资料库；
- 国内与国际测试记录；
- 派生数值均为正。

不在 `seed.sql` 中加入真实 Flight 或机场数据，首版全部通过 `/guillaume/` 手工维护。

### 13.5 地球与筛选测试

- 年度过滤；
- 国内/国际过滤；
- 非法 URL 参数回退；
- Airport 点去重；
- 同路线多 Flight 不聚合；
- 当前筛选统计；
- 总距离与总时间；
- payload 的 `<` 转义。

### 13.6 手动验收数据

至少建立：

- 两个中国大陆机场；
- 一个香港、澳门或台湾机场；
- 一个其他国家机场；
- 两家航司；
- 两种机型；
- 四条跨年份 Flight；
- 两条重复路线；
- 一条无 Journey Flight；
- 一条有关联 Journey Flight。

检查桌面、移动端、筛选、URL 恢复、弧线遮挡、无 JS、reduced motion、后台内联新建和未认证写入拒绝。

---

## 14. 实施顺序

1. 新增 `0006_flight_archive.sql`，扩展真实数据库验证；
2. 增加四类 domain/Input/row 类型；
3. 实现 `flight-math.ts` 和数学测试；
4. 增加四类验证器与测试；
5. 实现四个 DB 模块及 Airport 关联重算；
6. 实现四组 `/guillaume/api/` CRUD；
7. 实现 Airport、Airline、Aircraft Type 后台页面；
8. 实现 Flight 后台页面和可选 Journey；
9. 实现三个表单内联新建 dialog；
10. 扩展 Dashboard 与后台导航；
11. 实现 `getFlightArchiveData`；
12. 安装 deck.gl 并实现 `FlightGlobe`；
13. 实现 `/flight/` 统计与航班列表；
14. 增加公开导航、middleware 和样式；
15. 更新 README；
16. 执行 `pnpm verify`；
17. 完成浏览器手动验收；
18. 验收后再单独执行生产迁移、部署、提交和推送。

---

## 15. 生产部署顺序

本文档本身不授权部署。未来部署必须按以下顺序：

1. 确认工作区只有 Flight 功能相关改动；
2. 执行 `pnpm verify`；
3. 先对生产 D1 应用 `0006_flight_archive.sql`；
4. 确认迁移状态成功；
5. 部署 Worker；
6. 冒烟检查 `/`、`/flight/`、`/guillaume/` 和 `/guillaume/flights/`；
7. 创建一组真实资料并验证公开地球；
8. 最后提交和推送。

迁移必须先于 Worker 部署，否则新代码查询不存在的表会导致 `/flight/` 和新增后台页面返回 503。

所有迁移均为增量建表。若 Worker 需要回滚，可部署旧 Worker；新表留在 D1 中不会影响旧代码。紧急回滚时不得删除生产表。

---

## 16. 完成定义

- [ ] `/flight/` 存在且完全只读；
- [ ] Atlas `/` 没有行为回归；
- [ ] Airport、Airline、Aircraft Type、Flight 均有完整后台 CRUD；
- [ ] 所有新建操作只能在 `/guillaume/` 内完成；
- [ ] Flight 表单可内联新建三类资料；
- [ ] Flight 可独立存在，也可选关联 Journey；
- [ ] d、k、D 和 T 均由后端计算；
- [ ] 派生值与公式版本写入数据库；
- [ ] 大陆—大陆为国内，其他全部国际；
- [ ] 港澳台相关 Flight 全部进入国际筛选；
- [ ] 机场显示为去重白点；
- [ ] 每条 Flight 独立显示抬高的 3D 大圆弧；
- [ ] 年度和类型筛选同步更新地球、统计、列表和 URL；
- [ ] 航司和机型使用规范化资料库外键；
- [ ] 数据库支持未来按航司、机型、机场和年份统计；
- [ ] 不依赖外部 Flight API；
- [ ] 无 JavaScript 或地图失败时仍可浏览航班列表；
- [ ] `pnpm verify` 全绿；
- [ ] 桌面和移动端手动验收通过；
- [ ] 未经额外明确要求，不执行生产部署、提交或推送。
