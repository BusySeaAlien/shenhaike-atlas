# Atlas 中国航司数据评审（中国大陆 + 香港 + 澳门）

> 本文档是 `atlas_airlines` 表批量入库的评审与落库记录。
> 数据文件：`data-source/atlas-airlines-cn-hk-mo.json`（44 条，含 `atlas_airlines` 全部业务字段）。
> 生成脚本：`scripts/build-airlines-cn-hk-mo.mjs`（可复现，含规则校验）。
> 评审状态：✅ 已应用并于 2026-09-19 写入远端生产库——12 家呼号全部核实填写；大新华航空 CN 保留收录；货运航司不收录。

---

## 1. 概览

| 项目 | 数值 |
|---|---|
| 航司总数 | **44**（中国大陆 39、香港 4、澳门 1） |
| 未填呼号（callsign） | **0**（12 家此前未填的已全部经检索核实） |
| 表规则校验错误 | **0**（脚本逐条对照 `migrations/0006_flight_archive.sql` 的 CHECK 约束） |

## 2. 收录范围

**收录**：中国大陆 + 香港 + 澳门**主流客运航空公司**（运营定期客运航班）。

**排除**：
- **幸福航空（JR）**：2025-04-28 全面停航，2026-05 进入破产预重整 → 不收录。
- **货运航司**（见 §6，如需收录可加）：顺丰航空 O3、中国货运航空 CK、中国邮政航空 8Y、圆通货运航空 YG、龙浩航空 GI、金鹏航空 Y8（已纯货运化）、中州航空 I9。
- **已并入/停运**：一二三航空（2023 年并入东航，使用 MU 代码）、港龙航空 KA（2020 年停运，并入国泰）。

**备注**：大新华航空（CN）仍在存续运营，但机队仅约 3 架 B737，已收录并加备注（评审确认保留）。

## 3. 字段口径（对应规则总结 §2）

| 字段 | 口径 |
|---|---|
| `iata_code` | 官方 2 位 IATA 代码（含数字代码 `3U`、`9C`、`9H`、`9D`、`8L`、`A6`），全局唯一 ✓ |
| `icao_code` | 官方 3 位 ICAO 代码，全局唯一 ✓ |
| `name` | 英文名（品牌名，如 `Cathay Pacific`、`Loong Air`、`9 Air`） |
| `name_zh` | 官方中文名（含更名：苏南瑞丽航空 2021、湖南航空 2020） |
| `country` | `China` / `Hong Kong` / `Macao`（在 `i18n-iso-countries` 列表内） |
| `country_code` | `CHN` / `HKG` / `MAC`（服务端解析一致） |
| `callsign` | 呼号（英文），44 家全部填写，经民航局公示/维基百科/FlightAware 等多源核实，见 §5 |
| `notes` | 更名、机队、状态备注 |

## 4. 规则合规检查（对照 `0006_flight_archive.sql`）

| CHECK 约束 | 结果 |
|---|---|
| `length(iata_code) = 2`，UNIQUE | ✓ |
| `icao_code IS NULL OR length = 3`，UNIQUE | ✓ |
| `length(name) BETWEEN 1 AND 160` | ✓ |
| `name_zh <= 160` | ✓ |
| `length(country) BETWEEN 1 AND 100`，且在 `i18n-iso-countries` 列表内 | ✓（China / Hong Kong / Macao） |
| `length(country_code) = 3` | ✓（CHN / HKG / MAC） |
| `callsign <= 80` | ✓ |
| `notes <= 3000` | ✓ |

> 说明：重复 IATA/ICAO 写入时会报"该 IATA 代码已被使用"——44 条之间无冲突，与库内已有数据需在入库时再查一次（目前本地 dev 库尚未应用 `0006` 迁移，远程库无法只读查询）。

## 5. 呼号核实结果（12 家，均已写入）

| IATA | 航司 | 呼号（英文） | 中文呼号 | 来源 |
|---|---|---|---|---|
| QW | 青岛航空 | SKY LEGEND | 胶澳 | [民航局公示](http://www.caac.gov.cn/XXGK/XXGK/TZTG/201511/t20151105_11146.html)、[民航资源网](http://news.carnoc.com/list/321/321317.html) |
| GT | 桂林航空 | WELKIN | 超越 | [民航局公示](http://www.caac.gov.cn/PHONE/XXGK_17/XXGK/TZTG/201604/t20160401_30147.html) |
| FU | 福州航空 | STRAIT AIR | 涌泉 | [福州新闻网](https://news.fznews.com.cn/jsxx/2014-9-27/2014927SNzXMBR4JJ104351_2.shtml) |
| 9H | 长安航空 | CHANG AN | 旭日 | FlightAware、维基百科 |
| EU | 成都航空 | HIBISCUS CITY | 锦绣 | [民航资源网](https://i.carnoc.com/detail/321317)、FlightAware |
| AQ | 九元航空 | TRANS JADE | 如意 | [民航局公示](http://www.caac.gov.cn/XXGK/XXGK/TZTG/201511/t20151105_11126.html) |
| RY | 江西航空 | AIR CRANE | 仙鹤 | [江西航空官网](http://www.airjiangxi.com/jiangxiair/aboutus/contactus.action)、airportal.go.kr |
| GY | 多彩贵州航空 | COLORFUL | 黔兴 | [民航局公示](http://www.caac.gov.cn/XXGK/XXGK/TZTG/201512/t20151216_26202.html) |
| GX | 北部湾航空 | GREEN CITY | — | 英文维基百科、Flightera、Aviation Flights |
| DR | 苏南瑞丽航空 | SENDI | 森地 | FlightAware、Flightera |
| LT | 龙江航空 | SNOW EAGLE | 雪雕 | [民航局公示](http://www.caac.gov.cn/PHONE/XXGK_17/XXGK/TZTG/201606/t20160629_38730.html) |
| 9D | 天骄航空 | TIANJIAO AIR | 牧歌 | [民航局公示](http://www.caac.gov.cn/PHONE/XXGK_17/XXGK/TZTG/201901/t20190104_193831.html) |

> 注：青岛航空有更名传闻（民航资源网提及），呼号是否随更名变更待后续观察；当前以 SKY LEGEND 为准。

## 6. 可选：货运航司（默认不收录）

如需在航班档案里记录货运航班，可加以下 7 家（字段同样合法）：

| IATA | ICAO | 名称 | 呼号 |
|---|---|---|---|
| O3 | CSS | 顺丰航空 SF Airlines | Shun Feng |
| CK | CKK | 中国货运航空 China Cargo Airlines | Cargo King |
| 8Y | CYZ | 中国邮政航空 China Postal Airlines | China Post |
| YG | HYT | 圆通货运航空 YTO Cargo Airlines | Quick Air |
| GI | LHA | 龙浩航空 Longhao Airlines | Air Canton |
| Y8 | YZR | 金鹏航空 Suparna Airlines | Yangtze River |
| I9 | HLF | 中州航空 Central Airlines | Homeland |

## 7. 来源

- 航司 IATA/ICAO 代码、中英文名称：公开行业资料整理（IATA 官网 / 民航局名录口径）
- [苏南瑞丽航空有限公司 - 百度百科](https://baike.baidu.com/item/%E8%8B%8F%E5%8D%97%E7%91%9E%E4%B8%BD%E8%88%AA%E7%A9%BA%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8/58544218)
- [停飞一年，幸福航空正式破产预重整 - 新浪财经](https://finance.sina.com.cn/wm/2026-05-20/doc-inhypxkn6384804.shtml?cre=tianyi&mod=pcpager_inter&loc=18&r=0&rfunc=3&tj=cxvertical_pc_pager_spt&tr=174#1)、[幸福航空停航疑云 - 新京报](https://www.bjnews.com.cn/detail/1745984301168568.html)
- [2024年：我国最小的十家航空公司 - 民航资源网](https://www.feeair.com/zixun/bk_2_6813.html)

## 8. 入库方式

由 JSON 生成幂等 `INSERT ... ON CONFLICT(iata_code) DO UPDATE`。2026-09-19 已通过 `flight-reference-data.sql` 写入远端生产库，回查为 44 条。
