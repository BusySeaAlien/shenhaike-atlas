# Atlas Flight 四表字段与规则总结

Flight 档案共四张表（D1/SQLite，由 `migrations/0006_flight_archive.sql` 创建）：三张参考资料表 + 一张航班表。完整设计见《Atlas Flight 航班档案实施交接文档》。

---

## 1. `atlas_airports`（机场）

### 字段

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK 自增 | |
| iata_code | TEXT | NOT NULL, UNIQUE, **=3 位** | 大写字母，如 `PVG`（校验时自动大写） |
| icao_code | TEXT | UNIQUE, 可空, =4 位 | 字母或数字，如 `ZSPD` |
| name | TEXT | NOT NULL, 1–160 | 英文名 |
| name_zh | TEXT | 可空, ≤160 | 中文名 |
| city | TEXT | NOT NULL, 1–120 | 城市英文名 |
| city_zh | TEXT | 可空, ≤120 | |
| country | TEXT | NOT NULL, 1–100 | 国家名，必须是内置国家列表中的名字 |
| country_code | TEXT | NOT NULL, =3 位 | ISO 3166-1 alpha-3，**服务端根据 country 解析，客户端不传** |
| region | TEXT | 可空, ≤120 | |
| latitude | REAL | NOT NULL, [-90, 90] | |
| longitude | REAL | NOT NULL, [-180, 180] | |
| timezone | TEXT | NOT NULL, 1–64 | IANA 格式，如 `Asia/Shanghai` |
| elevation_ft | INTEGER | 可空, 整数 ∈[-2000, 30000] | 英尺，必须整数 |
| notes | TEXT | 可空, ≤3000 | |
| created_at / updated_at | TEXT | NOT NULL, 默认 `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` | UTC ISO 时间 |

### 其他规则

- IATA/ICAO 写入前 trim + 转大写；可选字段空白串统一转 `NULL`。
- 索引：`(country_code, city)`、`name`。

---

## 2. `atlas_airlines`（航空公司）

### 字段

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK 自增 | |
| iata_code | TEXT | NOT NULL, UNIQUE, **=2 位** | 字母或数字，允许 `3U` 这类数字代码 |
| icao_code | TEXT | UNIQUE, 可空, =3 位 | 如 `CES` |
| name | TEXT | NOT NULL, 1–160 | |
| name_zh | TEXT | 可空, ≤160 | |
| country | TEXT | NOT NULL, 1–100 | 必须在国家列表中 |
| country_code | TEXT | NOT NULL, =3 位 | 服务端解析（`countryCodeForName`） |
| callsign | TEXT | 可空, ≤80 | 呼号 |
| notes | TEXT | 可空, ≤3000 | |
| created_at / updated_at | TEXT | NOT NULL, 默认 UTC | |

### 其他规则

- 代码自动大写。
- IATA 或 ICAO 重复时写入冲突 → `DataError("conflict")`，中文提示"该 IATA 代码已被使用"。

---

## 3. `atlas_aircraft_types`（机型）

### 字段

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK 自增 | |
| icao_code | TEXT | NOT NULL, UNIQUE, **2–4 位** | 机型代码（ICAO 型号设计符），如 `A320` |
| manufacturer | TEXT | NOT NULL, 1–100 | 制造商 |
| model | TEXT | NOT NULL, 1–160 | 型号 |
| model_zh | TEXT | 可空, ≤160 | |
| notes | TEXT | 可空, ≤3000 | |
| created_at / updated_at | TEXT | NOT NULL, 默认 UTC | |

### 其他规则

- 代码自动大写；重复冲突同样转中文报错（"该 ICAO 代码已被使用"）。
- **删除保护**：删除前先查引用数，被航班引用时拒绝（"该机型仍关联 N 条航班记录，不能删除"），数据库层另有 RESTRICT 兜底。

---

## 4. `atlas_flights`（航班记录）

### 字段

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK 自增 | |
| airline_id | INTEGER | NOT NULL, FK→airlines **RESTRICT** | 被引用航司不可删 |
| flight_number | TEXT | NOT NULL, **1–6 位纯数字** | 保留前导零（`05123`）；带字母（`MU5123`）被拒 |
| flight_date | TEXT | NOT NULL, `YYYY-MM-DD` | 必须真实日历日期（`2026-02-30` 被拒） |
| departure_airport_id | INTEGER | NOT NULL, FK→airports **RESTRICT** | 与到达机场**不能相同** |
| arrival_airport_id | INTEGER | NOT NULL, FK→airports **RESTRICT** | |
| journey_id | INTEGER | 可空, FK→journeys **SET NULL** | 旅程删除后航班保留 |
| aircraft_type_id | INTEGER | 可空, FK→aircraft_types **RESTRICT** | |
| aircraft_registration | TEXT | 可空, ≤20, 自动大写 | 如 `b-1234` → `B-1234` |
| scheduled_departure_local | TEXT | 可空, =16 位 `YYYY-MM-DDTHH:mm` | **本地时间，不做时区转换** |
| scheduled_arrival_local | TEXT | 同上 | |
| cabin_class | TEXT | 可空, 枚举：economy / premium_economy / business / first / other | |
| seat_number | TEXT | 可空, ≤10 | |
| notes | TEXT | 可空, ≤3000 | |
| great_circle_km | REAL | NOT NULL, >0 | **派生**：Haversine 大圆距离（地球半径 6371.0088 km） |
| route_factor | REAL | NOT NULL, >1 | **派生**：d≤500→1.12；≤1500→1.08；≤5000→1.05；否则 1.03 |
| route_distance_km | REAL | NOT NULL, >0 | **派生**：D = d × k |
| estimated_hours | REAL | NOT NULL, >0 | **派生**：分段线性公式（`src/lib/flight-math.ts`） |
| formula_version | INTEGER | NOT NULL, 默认 1, ≥1 | 公式版本号，便于日后改公式 |
| is_domestic | INTEGER | NOT NULL, ∈{0,1} | **派生**：两机场 country_code 均为 `CHN` 才算国内（港澳台均算国际） |
| created_at / updated_at | TEXT | NOT NULL, 默认 UTC | update 时刷新 updated_at |

### 其他规则

- **唯一键**：`(airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id)` —— 同一天、同航司、同航线只能一条；冲突时报"该航班记录已存在"。
- **派生字段不可信客户端**：创建/更新时 `resolveFlightRelations` 先查证 5 个外键真实存在，再读两机场的经纬度和 country_code，服务端现算 d/k/D/T/国内外，客户端传来的这些值一律忽略。
- **检验层次**：
  1. 应用层（`src/lib/validation/domain.ts`）：字段校验 + 规范化；
  2. 数据访问层（`src/lib/db/flights.ts`）：外键查证、唯一冲突转中文错误、删除引用检查；
  3. 数据库层：`PRAGMA foreign_keys=ON` + 全部 CHECK/UNIQUE/FK 兜底。
- **索引**：`flight_date DESC`、`(is_domestic, flight_date)`、`airline_id`、`aircraft_type_id`、两个机场 id、`journey_id`。
- **测试**：`src/lib/validation/flight.test.ts`、`src/lib/db/flights.test.ts`、`src/lib/flight-math.test.ts`（vitest）。

---

## 一句话总结

三张资料表管"字典"（代码唯一、国家白名单、服务端派生 country_code）；`atlas_flights` 管"记录"（外键查证 + 服务端算派生指标 + 五字段联合唯一 + 三层校验）。

---

## 5. 国家内置列表（附录）

国家列表不是手写的：`src/lib/countries.ts` 在模块加载时由 **`i18n-iso-countries` npm 包（当前 v7.14.0）**生成。

### 规则

- 取 `langs/en.json` 的全部**英文名**，与 `codes.json` 的 ISO 3166-1 alpha-2→alpha-3 映射求交集 → **250 个条目**（该库收录的完整 ISO 3166-1 列表，含港澳台、南极洲及海外领地）。
- **校验匹配的是英文名**（`isCountryName`）：表单必须填 `China`、`Hong Kong` 这类英文名，`中国` 会被拒；中文名（`nameZh`）只用于显示。
- `country_code` 存 **alpha-3**（如 `CHN`），由英文名经 `countryCodeForName` 解析。
- 排序：`CHN` 永远排第一，其余按中文名拼音排序。

### 已知坑

1. **"Congo" 重名**：COG（刚果（布））与 COD（刚果（金））在库中的英文名都是 `Congo`，Map 查找时后写的赢 → 实际解析到 **COD**，COG 通过英文名永远选不到。
2. **XKK Kosovo**：该库自带一个非官方代码 `XKK`，也在列表中。

### 完整列表（250 条，alpha-3 代码 + 英文名）

```
AFG Afghanistan                                   ALA Aland Islands                                 ALB Albania
DZA Algeria                                       ASM American Samoa                                AND Andorra
AGO Angola                                        AIA Anguilla                                      ATA Antarctica
ATG Antigua and Barbuda                           ARG Argentina                                     ARM Armenia
ABW Aruba                                         AUS Australia                                     AUT Austria
AZE Azerbaijan                                    BHS Bahamas                                       BHR Bahrain
BGD Bangladesh                                    BRB Barbados                                      BLR Belarus
BEL Belgium                                       BLZ Belize                                        BEN Benin
BMU Bermuda                                       BTN Bhutan                                        BOL Bolivia
BES Bonaire, Sint Eustatius and Saba              BIH Bosnia and Herzegovina                        BWA Botswana
BVT Bouvet Island                                 BRA Brazil                                        IOT British Indian Ocean Territory
BRN Brunei Darussalam                             BGR Bulgaria                                      BFA Burkina Faso
BDI Burundi                                       KHM Cambodia                                      CMR Cameroon
CAN Canada                                        CPV Cape Verde                                    CYM Cayman Islands
CAF Central African Republic                      TCD Chad                                          CHL Chile
CHN China                                         CXR Christmas Island                              CCK Cocos (Keeling) Islands
COL Colombia                                      COM Comoros                                       COG Congo
COD Congo                                         COK Cook Islands                                  CRI Costa Rica
CIV Côte d'Ivoire                                 HRV Croatia                                       CUB Cuba
CUW Curaçao                                       CYP Cyprus                                        CZE Czechia
DNK Denmark                                       DJI Djibouti                                      DMA Dominica
DOM Dominican Republic                            ECU Ecuador                                       EGY Egypt
SLV El Salvador                                   GNQ Equatorial Guinea                             ERI Eritrea
EST Estonia                                       SWZ Eswatini                                      ETH Ethiopia
FLK Falkland Islands (Malvinas)                   FRO Faroe Islands                                 FJI Fiji
FIN Finland                                       FRA France                                        GUF French Guiana
PYF French Polynesia                              ATF French Southern Territories                   GAB Gabon
GEO Georgia                                       DEU Germany                                       GHA Ghana
GIB Gibraltar                                     GRC Greece                                        GRL Greenland
GRD Grenada                                       GLP Guadeloupe                                    GUM Guam
GTM Guatemala                                     GGY Guernsey                                      GIN Guinea
GNB Guinea-Bissau                                 GUY Guyana                                        HTI Haiti
HMD Heard Island and McDonald Islands             VAT Holy See (Vatican City State)                 HND Honduras
HKG Hong Kong                                     HUN Hungary                                       ISL Iceland
IND India                                         IDN Indonesia                                     IRN Iran
IRQ Iraq                                          IRL Ireland                                       IMN Isle of Man
ISR Israel                                        ITA Italy                                         JAM Jamaica
JPN Japan                                         JEY Jersey                                        JOR Jordan
KAZ Kazakhstan                                    KEN Kenya                                         KIR Kiribati
KOR Korea, Republic of                            XKK Kosovo                                        KWT Kuwait
KGZ Kyrgyzstan                                    LAO Lao People's Democratic Republic              LVA Latvia
LBN Lebanon                                       LSO Lesotho                                       LBR Liberia
LBY Libya                                         LIE Liechtenstein                                 LTU Lithuania
LUX Luxembourg                                    MAC Macao                                         MDG Madagascar
MWI Malawi                                        MYS Malaysia                                      MDV Maldives
MLI Mali                                          MLT Malta                                         MHL Marshall Islands
MTQ Martinique                                    MRT Mauritania                                    MUS Mauritius
MYT Mayotte                                       MEX Mexico                                        FSM Micronesia, Federated States of
MDA Moldova, Republic of                          MCO Monaco                                        MNG Mongolia
MNE Montenegro                                    MSR Montserrat                                    MAR Morocco
MOZ Mozambique                                    MMR Myanmar                                       NAM Namibia
NRU Nauru                                         NPL Nepal                                         NCL New Caledonia
NZL New Zealand                                   NIC Nicaragua                                     NER Niger
NGA Nigeria                                       NIU Niue                                          NFK Norfolk Island
PRK North Korea                                   MKD North Macedonia                               MNP Northern Mariana Islands
NOR Norway                                        OMN Oman                                          PAK Pakistan
PLW Palau                                         PSE Palestine                                     PAN Panama
PNG Papua New Guinea                              PRY Paraguay                                      PER Peru
PHL Philippines                                   PCN Pitcairn Islands                              POL Poland
PRT Portugal                                      PRI Puerto Rico                                   QAT Qatar
REU Reunion                                       ROU Romania                                       RUS Russia
RWA Rwanda                                        SHN Saint Helena                                  KNA Saint Kitts and Nevis
LCA Saint Lucia                                   SPM Saint Pierre and Miquelon                     VCT Saint Vincent and the Grenadines
BLM Saint Barthélemy                              MAF Saint Martin (French part)                    WSM Samoa
SMR San Marino                                    STP Sao Tome and Principe                         SAU Saudi Arabia
SEN Senegal                                       SRB Serbia                                        SYC Seychelles
SLE Sierra Leone                                  SGP Singapore                                     SXM Sint Maarten (Dutch part)
SVK Slovakia                                      SVN Slovenia                                      SLB Solomon Islands
SOM Somalia                                       ZAF South Africa                                  SGS South Georgia and the South Sandwich Islands
SSD South Sudan                                   ESP Spain                                         LKA Sri Lanka
SDN Sudan                                         SUR Suriname                                      SJM Svalbard and Jan Mayen
SWE Sweden                                        CHE Switzerland                                   SYR Syrian Arab Republic
TWN Taiwan                                        TJK Tajikistan                                    TZA Tanzania
THA Thailand                                      GMB The Gambia                                    NLD The Netherlands
TLS Timor-Leste                                   TGO Togo                                          TKL Tokelau
TON Tonga                                         TTO Trinidad and Tobago                           TUN Tunisia
TUR Turkey                                        TKM Turkmenistan                                  TCA Turks and Caicos Islands
TUV Tuvalu                                        ARE UAE                                           UGA Uganda
GBR UK                                            UKR Ukraine                                       USA United States
UMI United States Minor Outlying Islands          URY Uruguay                                       UZB Uzbekistan
VUT Vanuatu                                       VEN Venezuela                                     VNM Vietnam
VGB Virgin Islands, British                       VIR Virgin Islands, U.S.                          WLF Wallis and Futuna
ESH Western Sahara                                YEM Yemen                                         ZMB Zambia
ZWE Zimbabwe
```

> 注：列表内容随 `i18n-iso-countries` 版本更新而变化，以当前安装版本（v7.14.0）为准。
