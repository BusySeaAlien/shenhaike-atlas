#!/usr/bin/env node
/**
 * 生成 data-source/atlas-aircraft-types.json：
 * 波音 + 空客 + 中国商飞机型字典，字段符合 atlas_aircraft_types 表规则
 * （见 docs/Atlas Flight 四表字段与规则总结.md §3 与 migrations/0006_flight_archive.sql）。
 *
 * 口径（评审确认，见 docs/Atlas 机型数据评审.md）：
 *   - icao_code = ICAO DOC 8643 型号设计符（2–4 位，唯一），即 A359/B77W 这类缩写；
 *   - model = 官方完整型号（A350-900、737 MAX 8），不细分发动机/航司子型号（不写 A350-941）；
 *   - A300/A310 按评审结论排除；其余已确认的波音/空客可选机型均已收录；
 *   - 中国商飞仅收录已投入商业运营的 C909 与 C919。
 *
 * 用法：node scripts/build-aircraft-types.mjs
 */
import fs from "node:fs";

// ---------- 人工整理数据 ----------
const TYPES = [
  // ===== 空客 Airbus =====
  { icao_code: "A318", manufacturer: "Airbus", model: "A318-100", model_zh: "空客 A318-100", notes: "中国大陆无航司运营过，供完整性收录。" },
  { icao_code: "A319", manufacturer: "Airbus", model: "A319-100", model_zh: "空客 A319-100", notes: null },
  { icao_code: "A320", manufacturer: "Airbus", model: "A320-200", model_zh: "空客 A320-200", notes: null },
  { icao_code: "A321", manufacturer: "Airbus", model: "A321-200", model_zh: "空客 A321-200", notes: null },
  { icao_code: "A19N", manufacturer: "Airbus", model: "A319neo", model_zh: "空客 A319neo", notes: null },
  { icao_code: "A20N", manufacturer: "Airbus", model: "A320neo", model_zh: "空客 A320neo", notes: null },
  { icao_code: "A21N", manufacturer: "Airbus", model: "A321neo", model_zh: "空客 A321neo", notes: null },
  { icao_code: "A332", manufacturer: "Airbus", model: "A330-200", model_zh: "空客 A330-200", notes: null },
  { icao_code: "A333", manufacturer: "Airbus", model: "A330-300", model_zh: "空客 A330-300", notes: null },
  { icao_code: "A338", manufacturer: "Airbus", model: "A330-800", model_zh: "空客 A330-800", notes: "A330neo 系列。" },
  { icao_code: "A339", manufacturer: "Airbus", model: "A330-900", model_zh: "空客 A330-900", notes: "A330neo 系列。" },
  { icao_code: "A342", manufacturer: "Airbus", model: "A340-200", model_zh: "空客 A340-200", notes: null },
  { icao_code: "A343", manufacturer: "Airbus", model: "A340-300", model_zh: "空客 A340-300", notes: null },
  { icao_code: "A345", manufacturer: "Airbus", model: "A340-500", model_zh: "空客 A340-500", notes: null },
  { icao_code: "A346", manufacturer: "Airbus", model: "A340-600", model_zh: "空客 A340-600", notes: null },
  { icao_code: "A359", manufacturer: "Airbus", model: "A350-900", model_zh: "空客 A350-900", notes: null },
  { icao_code: "A35K", manufacturer: "Airbus", model: "A350-1000", model_zh: "空客 A350-1000", notes: null },
  { icao_code: "A388", manufacturer: "Airbus", model: "A380-800", model_zh: "空客 A380-800", notes: null },
  // ===== 波音 Boeing =====
  { icao_code: "B731", manufacturer: "Boeing", model: "737-100", model_zh: "波音 737-100", notes: null },
  { icao_code: "B732", manufacturer: "Boeing", model: "737-200", model_zh: "波音 737-200", notes: null },
  { icao_code: "B733", manufacturer: "Boeing", model: "737-300", model_zh: "波音 737-300", notes: null },
  { icao_code: "B734", manufacturer: "Boeing", model: "737-400", model_zh: "波音 737-400", notes: null },
  { icao_code: "B735", manufacturer: "Boeing", model: "737-500", model_zh: "波音 737-500", notes: null },
  { icao_code: "B737", manufacturer: "Boeing", model: "737-700", model_zh: "波音 737-700", notes: null },
  { icao_code: "B738", manufacturer: "Boeing", model: "737-800", model_zh: "波音 737-800", notes: null },
  { icao_code: "B739", manufacturer: "Boeing", model: "737-900", model_zh: "波音 737-900", notes: "含 -900 与 -900ER。" },
  { icao_code: "B38M", manufacturer: "Boeing", model: "737 MAX 8", model_zh: "波音 737 MAX 8", notes: "737 MAX 系列。" },
  { icao_code: "B37M", manufacturer: "Boeing", model: "737 MAX 7", model_zh: "波音 737 MAX 7", notes: null },
  { icao_code: "B39M", manufacturer: "Boeing", model: "737 MAX 9", model_zh: "波音 737 MAX 9", notes: null },
  { icao_code: "B3XM", manufacturer: "Boeing", model: "737 MAX 10", model_zh: "波音 737 MAX 10", notes: null },
  { icao_code: "B741", manufacturer: "Boeing", model: "747-100", model_zh: "波音 747-100", notes: null },
  { icao_code: "B74S", manufacturer: "Boeing", model: "747SP", model_zh: "波音 747SP", notes: null },
  { icao_code: "B742", manufacturer: "Boeing", model: "747-200", model_zh: "波音 747-200", notes: null },
  { icao_code: "B743", manufacturer: "Boeing", model: "747-300", model_zh: "波音 747-300", notes: null },
  { icao_code: "B744", manufacturer: "Boeing", model: "747-400", model_zh: "波音 747-400", notes: null },
  { icao_code: "B748", manufacturer: "Boeing", model: "747-8", model_zh: "波音 747-8", notes: "含 747-8I 与 747-8F。" },
  { icao_code: "B752", manufacturer: "Boeing", model: "757-200", model_zh: "波音 757-200", notes: null },
  { icao_code: "B753", manufacturer: "Boeing", model: "757-300", model_zh: "波音 757-300", notes: null },
  { icao_code: "B762", manufacturer: "Boeing", model: "767-200", model_zh: "波音 767-200", notes: null },
  { icao_code: "B763", manufacturer: "Boeing", model: "767-300", model_zh: "波音 767-300", notes: "含 -300 与 -300ER（ICAO 代码相同）。" },
  { icao_code: "B764", manufacturer: "Boeing", model: "767-400ER", model_zh: "波音 767-400ER", notes: null },
  { icao_code: "B772", manufacturer: "Boeing", model: "777-200", model_zh: "波音 777-200", notes: "含 -200 与 -200ER。" },
  { icao_code: "B77L", manufacturer: "Boeing", model: "777-200LR", model_zh: "波音 777-200LR", notes: null },
  { icao_code: "B773", manufacturer: "Boeing", model: "777-300", model_zh: "波音 777-300", notes: null },
  { icao_code: "B77W", manufacturer: "Boeing", model: "777-300ER", model_zh: "波音 777-300ER", notes: null },
  { icao_code: "B788", manufacturer: "Boeing", model: "787-8", model_zh: "波音 787-8", notes: null },
  { icao_code: "B789", manufacturer: "Boeing", model: "787-9", model_zh: "波音 787-9", notes: null },
  { icao_code: "B78X", manufacturer: "Boeing", model: "787-10", model_zh: "波音 787-10", notes: null },
  // ===== 中国商飞 COMAC =====
  { icao_code: "AJ27", manufacturer: "COMAC", model: "C909", model_zh: "商飞 C909", notes: "ICAO 型号设计符仍为 AJ27。" },
  { icao_code: "C919", manufacturer: "COMAC", model: "C919", model_zh: "商飞 C919", notes: null },
];

// ---------- 规则校验（对应 migrations/0006_flight_archive.sql 的 CHECK 约束） ----------
const errors = [];
const seen = new Set();
for (const t of TYPES) {
  if (!/^[A-Z0-9]{2,4}$/.test(t.icao_code)) errors.push(`${t.icao_code}: icao_code 非法（须 2–4 位）`);
  if (seen.has(t.icao_code)) errors.push(`${t.icao_code}: icao_code 重复`);
  seen.add(t.icao_code);
  if (!t.manufacturer || t.manufacturer.length > 100) errors.push(`${t.icao_code}: manufacturer 非法`);
  if (!t.model || t.model.length > 160) errors.push(`${t.icao_code}: model 非法`);
  if (t.model_zh !== null && t.model_zh.length > 160) errors.push(`${t.icao_code}: model_zh 超长`);
  if (t.notes !== null && t.notes.length > 3000) errors.push(`${t.icao_code}: notes 超长`);
}

const rows = TYPES.map((t) => ({ ...t })).sort((x, y) => {
  const manufacturerOrder = { Airbus: 0, Boeing: 1, COMAC: 2 };
  if (x.manufacturer !== y.manufacturer) return manufacturerOrder[x.manufacturer] - manufacturerOrder[y.manufacturer];
  return x.model.localeCompare(y.model);
});

const outPath = new URL("../data-source/atlas-aircraft-types.json", import.meta.url).pathname;
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");

console.log(`写入 ${outPath}`);
console.log(`机型总数：${rows.length}（空客 ${rows.filter((r) => r.manufacturer === "Airbus").length}，波音 ${rows.filter((r) => r.manufacturer === "Boeing").length}，中国商飞 ${rows.filter((r) => r.manufacturer === "COMAC").length}）`);
console.log(`规则校验错误：${errors.length} 个`);
if (errors.length) console.log(errors.join("\n"));
