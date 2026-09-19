#!/usr/bin/env node
/**
 * 生成 data-source/atlas-airlines-cn-hk-mo.json：
 * 中国大陆 + 香港 + 澳门主流客运航空公司，字段符合 atlas_airlines 表规则
 * （见 docs/Atlas Flight 四表字段与规则总结.md §2 与 migrations/0006_flight_archive.sql）。
 *
 * 数据为人工整理（IATA/ICAO 代码、中英文名称），现状经网络检索核实：
 *   - 苏南瑞丽航空：2021-10 工商更名（原瑞丽航空），运营中 → 收录
 *   - 大新华航空 CN：海航系，存续但机队极小（约 3 架 B737）→ 收录并备注
 *   - 幸福航空 JR：2025-04-28 全面停航，2026-05 进入破产预重整 → 排除
 *   - 货运航司（顺丰、中货航、邮政、圆通、龙浩、金鹏、中州）→ 不收录，见评审文档
 * 呼号（callsign）已按评审结果全部填写，核实记录见评审文档 §5。
 *
 * 用法：node scripts/build-airlines-cn-hk-mo.mjs
 */
import fs from "node:fs";

// ---------- 人工整理数据（country_code 由 country 派生，与服务端 countryCodeForName 一致） ----------
const COUNTRY_CODE = { China: "CHN", "Hong Kong": "HKG", Macao: "MAC" };

const AIRLINES = [
  // ===== 中国大陆（39 家）=====
  { iata_code: "CA", icao_code: "CCA", name: "Air China", name_zh: "中国国际航空", country: "China", callsign: "Air China", notes: null },
  { iata_code: "MU", icao_code: "CES", name: "China Eastern Airlines", name_zh: "中国东方航空", country: "China", callsign: "China Eastern", notes: null },
  { iata_code: "CZ", icao_code: "CSN", name: "China Southern Airlines", name_zh: "中国南方航空", country: "China", callsign: "China Southern", notes: null },
  { iata_code: "HU", icao_code: "CHH", name: "Hainan Airlines", name_zh: "海南航空", country: "China", callsign: "Hainan", notes: null },
  { iata_code: "ZH", icao_code: "CSZ", name: "Shenzhen Airlines", name_zh: "深圳航空", country: "China", callsign: "Shenzhen Air", notes: null },
  { iata_code: "3U", icao_code: "CSC", name: "Sichuan Airlines", name_zh: "四川航空", country: "China", callsign: "Sichuan", notes: null },
  { iata_code: "MF", icao_code: "CXA", name: "Xiamen Airlines", name_zh: "厦门航空", country: "China", callsign: "Xiamen Air", notes: null },
  { iata_code: "SC", icao_code: "CDG", name: "Shandong Airlines", name_zh: "山东航空", country: "China", callsign: "Shandong", notes: null },
  { iata_code: "HO", icao_code: "DKH", name: "Juneyao Airlines", name_zh: "吉祥航空", country: "China", callsign: "Air Juneyao", notes: null },
  { iata_code: "9C", icao_code: "CQH", name: "Spring Airlines", name_zh: "春秋航空", country: "China", callsign: "Air Spring", notes: null },
  { iata_code: "FM", icao_code: "CSH", name: "Shanghai Airlines", name_zh: "上海航空", country: "China", callsign: "Shanghai Air", notes: null },
  { iata_code: "GS", icao_code: "GCR", name: "Tianjin Airlines", name_zh: "天津航空", country: "China", callsign: "Bohai", notes: null },
  { iata_code: "JD", icao_code: "CBJ", name: "Beijing Capital Airlines", name_zh: "首都航空", country: "China", callsign: "Capital Jet", notes: null },
  { iata_code: "KN", icao_code: "CUA", name: "China United Airlines", name_zh: "中国联合航空", country: "China", callsign: "Lianhang", notes: null },
  { iata_code: "8L", icao_code: "LKE", name: "Lucky Air", name_zh: "祥鹏航空", country: "China", callsign: "Lucky Air", notes: null },
  { iata_code: "UQ", icao_code: "CUH", name: "Urumqi Air", name_zh: "乌鲁木齐航空", country: "China", callsign: "Lou Lan", notes: null },
  { iata_code: "PN", icao_code: "CHB", name: "West Air", name_zh: "西部航空", country: "China", callsign: "West China", notes: null },
  { iata_code: "QW", icao_code: "QDA", name: "Qingdao Airlines", name_zh: "青岛航空", country: "China", callsign: "Sky Legend", notes: null },
  { iata_code: "GT", icao_code: "CGH", name: "Air Guilin", name_zh: "桂林航空", country: "China", callsign: "Welkin", notes: null },
  { iata_code: "FU", icao_code: "FZA", name: "Fuzhou Airlines", name_zh: "福州航空", country: "China", callsign: "Strait Air", notes: null },
  { iata_code: "9H", icao_code: "CGN", name: "Air Chang'an", name_zh: "长安航空", country: "China", callsign: "Chang An", notes: null },
  { iata_code: "EU", icao_code: "UEA", name: "Chengdu Airlines", name_zh: "成都航空", country: "China", callsign: "Hibiscus City", notes: "原「鹰联航空」，2010 年更名。" },
  { iata_code: "G5", icao_code: "HXA", name: "China Express Airlines", name_zh: "华夏航空", country: "China", callsign: "China Express", notes: null },
  { iata_code: "DZ", icao_code: "EPA", name: "Donghai Airlines", name_zh: "东海航空", country: "China", callsign: "Donghai Air", notes: null },
  { iata_code: "NS", icao_code: "HBH", name: "Hebei Airlines", name_zh: "河北航空", country: "China", callsign: "Hebei Air", notes: null },
  { iata_code: "RY", icao_code: "CJX", name: "Jiangxi Air", name_zh: "江西航空", country: "China", callsign: "Air Crane", notes: null },
  { iata_code: "AQ", icao_code: "JYH", name: "9 Air", name_zh: "九元航空", country: "China", callsign: "Trans Jade", notes: null },
  { iata_code: "GJ", icao_code: "CDC", name: "Loong Air", name_zh: "长龙航空", country: "China", callsign: "Loong Air", notes: null },
  { iata_code: "KY", icao_code: "KNA", name: "Kunming Airlines", name_zh: "昆明航空", country: "China", callsign: "Kunming Air", notes: null },
  { iata_code: "BK", icao_code: "OKA", name: "Okay Airways", name_zh: "奥凯航空", country: "China", callsign: "Okay Jet", notes: null },
  { iata_code: "OQ", icao_code: "CQN", name: "Chongqing Airlines", name_zh: "重庆航空", country: "China", callsign: "Chongqing", notes: null },
  { iata_code: "CN", icao_code: "GDC", name: "Grand China Air", name_zh: "大新华航空", country: "China", callsign: "Grand China", notes: "海航系，机队规模极小（约 3 架 B737）。" },
  { iata_code: "GY", icao_code: "CGZ", name: "Colorful Guizhou Airlines", name_zh: "多彩贵州航空", country: "China", callsign: "Colorful", notes: null },
  { iata_code: "TV", icao_code: "TBA", name: "Tibet Airlines", name_zh: "西藏航空", country: "China", callsign: "Tibet", notes: null },
  { iata_code: "A6", icao_code: "OTC", name: "Air Travel", name_zh: "湖南航空", country: "China", callsign: "Air Travel", notes: "原「红土航空」，2020 年更名。" },
  { iata_code: "DR", icao_code: "RLH", name: "Sunan Ruili Airlines", name_zh: "苏南瑞丽航空", country: "China", callsign: "Sendi", notes: "2021 年 10 月由「瑞丽航空」更名（无锡国资入主）。" },
  { iata_code: "GX", icao_code: "CBG", name: "GX Airlines", name_zh: "北部湾航空", country: "China", callsign: "Green City", notes: null },
  { iata_code: "LT", icao_code: "SNG", name: "Longjiang Airlines", name_zh: "龙江航空", country: "China", callsign: "Snow Eagle", notes: null },
  { iata_code: "9D", icao_code: "NMG", name: "Genghis Khan Airlines", name_zh: "天骄航空", country: "China", callsign: "Tianjiao Air", notes: "国产 ARJ21 支线机队。" },
  // ===== 香港（4 家）=====
  { iata_code: "CX", icao_code: "CPA", name: "Cathay Pacific", name_zh: "国泰航空", country: "Hong Kong", callsign: "Cathay", notes: null },
  { iata_code: "HX", icao_code: "CRK", name: "Hong Kong Airlines", name_zh: "香港航空", country: "Hong Kong", callsign: "Bauhinia", notes: null },
  { iata_code: "UO", icao_code: "HKE", name: "HK Express", name_zh: "香港快运航空", country: "Hong Kong", callsign: "Hongkong Shuttle", notes: null },
  { iata_code: "HB", icao_code: "HGB", name: "Greater Bay Airlines", name_zh: "大湾区航空", country: "Hong Kong", callsign: "Greater Bay", notes: null },
  // ===== 澳门（1 家）=====
  { iata_code: "NX", icao_code: "AMU", name: "Air Macau", name_zh: "澳门航空", country: "Macao", callsign: "Air Macau", notes: null },
];

// ---------- 规则校验（对应 migrations/0006_flight_archive.sql 的 CHECK 约束） ----------
const errors = [];
const seenIata = new Set();
const seenIcao = new Set();
const VALID_COUNTRIES = ["China", "Hong Kong", "Macao"];

for (const a of AIRLINES) {
  if (!/^[A-Z0-9]{2}$/.test(a.iata_code)) errors.push(`${a.iata_code}: iata_code 非法（须 2 位）`);
  if (seenIata.has(a.iata_code)) errors.push(`${a.iata_code}: iata_code 重复`);
  seenIata.add(a.iata_code);
  if (a.icao_code !== null) {
    if (!/^[A-Z0-9]{3}$/.test(a.icao_code)) errors.push(`${a.iata_code}: icao_code 非法（须 3 位）`);
    if (seenIcao.has(a.icao_code)) errors.push(`${a.iata_code}: icao_code 重复`);
    seenIcao.add(a.icao_code);
  }
  if (!a.name || a.name.length > 160) errors.push(`${a.iata_code}: name 非法`);
  if (a.name_zh !== null && a.name_zh.length > 160) errors.push(`${a.iata_code}: name_zh 超长`);
  if (!a.country || a.country.length > 100 || !VALID_COUNTRIES.includes(a.country))
    errors.push(`${a.iata_code}: country 非法`);
  if (a.callsign !== null && a.callsign.length > 80) errors.push(`${a.iata_code}: callsign 超长`);
  if (a.notes !== null && a.notes.length > 3000) errors.push(`${a.iata_code}: notes 超长`);
}

const rows = AIRLINES.map((a) => ({
  iata_code: a.iata_code,
  icao_code: a.icao_code,
  name: a.name,
  name_zh: a.name_zh,
  country: a.country,
  country_code: COUNTRY_CODE[a.country],
  callsign: a.callsign,
  notes: a.notes,
})).sort((x, y) => {
  const order = { China: 0, "Hong Kong": 1, Macao: 2 };
  if (order[x.country] !== order[y.country]) return order[x.country] - order[y.country];
  return x.iata_code.localeCompare(y.iata_code);
});

const outPath = new URL("../data-source/atlas-airlines-cn-hk-mo.json", import.meta.url).pathname;
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");

console.log(`写入 ${outPath}`);
console.log(`航司总数：${rows.length}（${rows.filter((r) => r.country === "China").length} 中国大陆，${rows.filter((r) => r.country === "Hong Kong").length} 香港，${rows.filter((r) => r.country === "Macao").length} 澳门）`);
console.log(`未填呼号：${rows.filter((r) => r.callsign === null).map((r) => r.iata_code).join(", ") || "无"}`);
console.log(`规则校验错误：${errors.length} 个`);
if (errors.length) console.log(errors.join("\n"));
