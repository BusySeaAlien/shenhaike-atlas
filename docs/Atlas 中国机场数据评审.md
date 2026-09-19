# Atlas 中国机场数据评审（中国大陆 + 香港 + 澳门）

> 本文档是 `atlas_airports` 表批量入库的评审与落库记录。
> 数据文件：`data-source/atlas-airports-cn-hk-mo.json`（272 条，含 `atlas_airports` 全部业务字段）。
> 生成脚本：`scripts/build-airports-cn-hk-mo.mjs`（可复现）。
> 评审状态：✅ 已应用并于 2026-09-19 写入远端生产库——排除 9 条码头/停用/停航/在建条目；6 处命名按最新官方名称核实；删除 42 条通用航空/军用/训练机场。

---

## 1. 概览

| 项目 | 数值 |
|---|---|
| 机场总数 | **272**（中国大陆 269、香港 2、澳门 1） |
| 按当前筛选口径的常规条目 | **266** |
| 特殊条目 | 6（商洛 DFA、乐山 LSG、阿里普兰 APJ、鄯善 SXJ、绥芬河东宁 HSF 暂无定期航班；信德直升机坪 HHP 在运营） |
| 缺少 ICAO 代码 | 2 条（DFA 商洛、LSG 乐山——表规则允许为空） |
| 缺少海拔 | 52 条（表规则允许为空） |
| 表规则校验错误 | **0**（脚本逐条对照 `migrations/0006_flight_archive.sql` 的 CHECK 约束） |

## 2. 数据来源与方法

- **基础数据**：OurAirports 公开数据集 `airports.csv`（2026-09 版），筛选 `iso_country ∈ {CN, HK, MO}` 且带 IATA 代码、类型非 `closed` 的行。
- **中文名**（`name_zh`、`city_zh`）：逐条人工核对映射（写入脚本 `MANUAL` 表），其中 2023–2026 年更名/新通航的条目经网络检索核实（见 §7 来源）。
- **派生字段**：`country` / `country_code` / `timezone` 按地区直接推导：
  - 中国大陆 → `China` / `CHN` / `Asia/Shanghai`（全国统一北京时间）
  - 香港 → `Hong Kong` / `HKG` / `Asia/Hong_Kong`
  - 澳门 → `Macao` / `MAC` / `Asia/Macau`
  - 以上国家名均在 `i18n-iso-countries` 内置列表中，与服务端 `countryCodeForName` 解析结果一致。

### 已核实的更名/新通航条目

| 条目 | 核实结果 | 处理 |
|---|---|---|
| JMU 佳木斯 | 2026-01 由「佳木斯东郊机场」更名「佳木斯松江国际机场」（民航函〔2025〕1013 号） | 已更新 |
| HTN 和田 | 2023-02 由「和田机场」更名「和田昆冈机场」（民航局复函） | 已更新：`Hotan Kungang Airport` |
| YIN 伊宁 | 2024-06 由「伊宁机场」更名「伊犁伊宁国际机场」（民政部公告） | 已确认（名称本就正确，补 notes） |
| JGN 嘉峪关 | 2023-03 更名「嘉峪关酒泉机场」，官方英译 `JIAYUGUAN JIUQUAN AIRPORT` | 已确认（已覆盖 OurAirports 旧名） |
| YTY 扬州泰州 | 2016-02 更名「扬州泰州国际机场」，官方英译 `YANGZHOU TAIZHOU INTERNATIONAL AIRPORT` | 已确认（已补 International） |
| HIA 淮安涟水 | 2020-05 更名「淮安涟水国际机场」，官方英译 `HUAIAN LIANSHUI INTERNATIONAL AIRPORT` | 已确认（已补 International） |
| HQQ / AYN 安阳 | 两个不同机场：HQQ 红旗渠（2023-11 通航，定期）；AYN 殷都（航空运动/通用） | 保留 HQQ；AYN 按通用航空机场排除 |
| BZJ 亳州 | 2025-11-12 正式通航 | 已收录为定期机场 |
| BFY 蚌埠滕湖 | 2026-04-29 首航 | 已收录为定期机场 |
| LIJ 丽水 | 2025-07-18 通航（军民合用） | 已收录为定期机场 |
| JRJ 赣州瑞金 | 2025 年建成投运 | 已收录为定期机场 |
| DHH 巴里坤大河 | 2025 年建成投运（民航局年度总结） | 已收录为定期机场 |
| LSG 乐山 | IATA 已批，2025 年底校飞、计划 2026 通航，尚无 ICAO | 收录，notes 标注在建 |

## 3. 字段口径（对应规则总结 §1）

| 字段 | 口径 |
|---|---|
| `iata_code` | OurAirports `iata_code`，统一大写，3 位，全局唯一 ✓ |
| `icao_code` | OurAirports `icao_code`（空则回退 `gps_code`/`local_code` 中的 4 位码）；无则为 `NULL` |
| `name` | 英文名，以 OurAirports 为准；个别修正（JGN 嘉峪关酒泉、BZJ 去掉“(under construction)”后缀、YTY/HIA 补 `International`、HTN 和田昆冈） |
| `name_zh` | 官方中文名（含 2023–2026 更名：和田昆冈、伊犁伊宁、佳木斯松江、乌鲁木齐天山、喀什徕宁、大同云冈、运城盐湖等） |
| `city` | 机场所在地级市英文名；去掉 OurAirports municipality 的括号注记，个别纠正（如 XNN→Xining、HLD→Hulunbuir、YSQ→Songyuan、WUZ→Wuzhou、HHP/MFM→Hong Kong/Macao） |
| `city_zh` | 对应中文城市名 |
| `country` | `China` / `Hong Kong` / `Macao`（英文名，表单校验要求） |
| `country_code` | `CHN` / `HKG` / `MAC`（服务端解析一致） |
| `region` | 省级行政区英文名（如 `Xinjiang`、`Inner Mongolia`、`Hong Kong`）；修正了 OurAirports 把吕梁 LLV、运城 YCU 误标为陕西的问题 |
| `latitude` / `longitude` | OurAirports 坐标，全部在合法区间 ✓ |
| `timezone` | 见 §2 派生规则 |
| `elevation_ft` | 整数英尺；缺失为 `NULL` |
| `notes` | 仅用于特殊条目（通用航空、军用、暂无定期、在建、更名说明等），常规机场为 `NULL` |

## 4. 分省统计

| 省份 | 数量 | 省份 | 数量 |
|---|---|---|---|
| Xinjiang | 29 | Heilongjiang | 14 |
| Inner Mongolia | 18 | Jiangsu | 9 |
| Sichuan | 17 | Shandong | 10 |
| Yunnan | 15 | Zhejiang | 9 |
| Guangdong | 9 | Guizhou | 11 |
| Anhui | 8 | Fujian | 6 |
| Hubei | 8 | Liaoning | 8 |
| Hunan | 10 | Gansu | 9 |
| Shanxi | 8 | Jiangxi | 8 |
| Beijing | 2 | Hainan | 3 |
| Chongqing | 5 | Shanghai | 2 |
| Guangxi | 8 | Hong Kong | 2 |
| Hebei | 7 | Macao | 1 |
| Qinghai | 7 | Tianjin | 1 |
| Tibet | 8 | Jilin | 6 |
| Shaanxi | 6 | Henan | 5 |
| Ningxia | 3 | | |

## 5. 规则合规检查（对照 `0006_flight_archive.sql`）

| CHECK 约束 | 结果 |
|---|---|
| `length(iata_code) = 3`，UNIQUE | ✓ 全部 3 位大写，唯一 |
| `icao_code IS NULL OR length = 4`，UNIQUE | ✓ 2 条 NULL（DFA、LSG），其余 4 位且唯一 |
| `length(name) BETWEEN 1 AND 160` | ✓ |
| `name_zh <= 160` | ✓ |
| `length(city) BETWEEN 1 AND 120` | ✓ |
| `city_zh <= 120` | ✓ |
| `length(country) BETWEEN 1 AND 100`，且在 `i18n-iso-countries` 列表内 | ✓（China / Hong Kong / Macao） |
| `length(country_code) = 3` | ✓（CHN / HKG / MAC） |
| `region <= 120` | ✓ |
| `latitude ∈ [-90, 90]`、`longitude ∈ [-180, 180]` | ✓ |
| `length(timezone) BETWEEN 1 AND 64`（IANA） | ✓（Asia/Shanghai、Asia/Hong_Kong、Asia/Macau） |
| `elevation_ft ∈ [-2000, 30000]` 整数或 NULL | ✓ |
| `notes <= 3000` | ✓ |

> 说明：`atlas_airports` 要求 `iata_code NOT NULL`，因此**没有 IATA 代码的机场（绝大多数通用航空机场）无法收录**——本表实际可覆盖"全部带 IATA 代码的机场"。

## 6. 排除清单（已应用）

**共排除 51 条：**

- **9 条**（码头/停用/停航/在建/纯军用）：ZGN 中山港码头、XZM 澳门直升机坪、NAY 北京南苑、DAX 达州河市、BFU 蚌埠仁和集、LHK 老河口、JIL 吉林二台子、DEJ 铜仁德江、SIA 西安西关。
- **31 条通用航空**（无定期航班）：AEQ 阿鲁科尔沁、ZKL 自贡凤鸣、HNG 海南州共和、DWS 莫力达瓦旗、LCT 石家庄栾城、WHN 武汉汉南、CBZ 滨州大高、HEW 东阳横店、JDE 建德千岛湖、HLJ 肇东北大荒、TYC 太原尧城、WRH 乌尔禾、YEH 银川月牙湖、LCS 陇川广宋、LFH 兰坪丰华、BKV 百灵庙、OTQ 鄂托克前旗敖勒召其、YHJ 南昌瑶湖、OTO 鄂托克旗乌兰、DEQ 德清莫干山、EJN 额济纳旗桃来、HSJ 郑州上街、HZU 成都淮州、NJJ 嫩江墨尔根、WZQ 乌拉特中旗、XRQ 新巴尔虎右旗、YGA 永川大安、AYN 安阳殷都、AZJ 镇江大路、BCJ 北川永昌、AHJ 红原。
- **2 条通用/军用混合**：PFA 哈尔滨平房、WHU 芜湖湾里。
- **1 条老机场转通用**：LIA 梁平。
- **7 条纯军用**：PNJ 蓬莱沙河口、XIN 兴宁、YUA 元谋、RUG 如皋、SZV 苏州光福、DZU 大足登云、XEN 兴城。
- **1 条飞行训练机场**：GHN 广汉（中国民航飞行学院）。

**保留的 6 条特殊条目**（notes 已标注）：DFA 商洛、APJ 阿里普兰、SXJ 鄯善、HSF 绥芬河东宁（暂无定期航班，日后可能复航）、LSG 乐山（2026 计划通航）、HHP 信德直升机场（港澳直升机航线在运营）。

> 如需再调整（例如也删去上述 6 条），只需改 `scripts/build-airports-cn-hk-mo.mjs` 的 `EXCLUDE` 集合并重跑。

### 生成安全性

- 上游 CSV 出现未配置中文映射的新机场或重复 IATA 代码时，生成脚本会报错并以非零状态退出；
- 任何字段规则校验错误也会中止生成；
- 只有上述检查全部通过后才会覆盖 `data-source/atlas-airports-cn-hk-mo.json`，避免将静默跳过后的部分数据写入仓库。

## 7. 来源

- OurAirports 数据集：https://davidmegginson.github.io/ourairports-data/airports.csv
- [和田机场正式更名为和田昆冈机场 - 新疆政府网](https://www.xinjiang.gov.cn/xinjiang/dzdt/202302/6613a225aa524f3d92c4b14e2917a929.shtml)
- [民政部关于伊宁机场更名为伊犁伊宁国际机场的公告](https://www.mca.gov.cn/n1288/n1290/n1315/c1662004999980000629/content.html)、[伊犁伊宁国际机场 - 中国民航网](http://www.caacnews.com.cn/1/5/202603/t20260325_1394078_wap.html)
- [嘉峪关机场名称变更为"嘉峪关酒泉机场" - 海外网](http://mk.haiwainet.cn/special_html/hk_page/article/hknews-article/20233/21/E_1214794275479525798.html?contentType=CT001&id=E_1214794275479525798#/)
- [扬州泰州机场正式更名为扬州泰州国际机场 - 民航局](http://www.caac.gov.cn/XWZX/HYDT/201603/t20160307_29378.html)
- [淮安涟水机场正式更名淮安涟水国际机场 - 江苏省交通运输厅](http://jtyst.jiangsu.gov.cn/art/2020/5/27/art_41726_9185989.html)
- [佳木斯东郊机场已更名为佳木斯松江国际机场 - 央广网](http://www.cnr.cn/erwen/erwen3.html?id=30493991&type=3&title=%E4%BD%B3%E6%9C%A8%E6%96%AF%E4%B8%9C%E9%83%8A%E6%9C%BA%E5%9C%BA%E5%B7%B2%E6%9B%B4%E5%90%8D%E4%B8%BA%E4%BD%B3%E6%9C%A8%E6%96%AF%E6%9D%BE%E6%B1%9F%E5%9B%BD%E9%99%85%E6%9C%BA%E5%9C%BA)
- [安阳红旗渠机场 - 维基百科](https://zh.wikipedia.org/zh-hans/%E5%AE%89%E9%98%B3%E7%BA%A2%E6%97%97%E6%B8%A0%E6%9C%BA%E5%9C%BA)
- [四川乐山机场三字代码获批确定为"LSG" - 成都商报](https://static.cdsb.com/micropub/Articles/202504/b28674f946e769e7c6dafabcd3f1c764.html)、[乐山机场迎来首次飞行校验 - 人民网四川](http://sc.people.com.cn/n2/2026/0101/c345167-41461625.html)
- [亳州机场 - 百度百科](https://baike.baidu.com/item/%e4%ba%b3%e5%b7%9e%e6%a9%9f%e5%a0%b4/9580798)、[蚌埠滕湖机场即将迎来首航 - 安徽省交通运输厅](https://jtt.ah.gov.cn/xwdt/xwbd/123344421.html)
- [丽水机场正式通航投运 - 浙江省交通运输厅](https://jtyst.zj.gov.cn/art/2025/7/22/art_1229304975_59042295.html)

## 8. 入库方式

1. 按第 6 节决策调整 `MANUAL` 表 / 排除清单，重跑 `node scripts/build-airports-cn-hk-mo.mjs <airports.csv>`；
2. 由 JSON 生成幂等 `INSERT ... ON CONFLICT(iata_code) DO UPDATE`（`country_code` 已内置，与服务端解析一致）；
3. 2026-09-19 已通过 `flight-reference-data.sql` 写入远端生产库 `shenhaike`，回查为 272 条。
