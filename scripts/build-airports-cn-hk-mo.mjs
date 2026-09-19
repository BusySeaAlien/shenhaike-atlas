#!/usr/bin/env node
/**
 * 生成 data-source/atlas-airports-cn-hk-mo.json：
 * 中国大陆 + 香港 + 澳门所有带 IATA 代码的机场，字段符合 atlas_airports 表规则
 * （见 docs/Atlas Flight 四表字段与规则总结.md §1 与 migrations/0006_flight_archive.sql）。
 *
 * 数据来源：OurAirports airports.csv（https://davidmegginson.github.io/ourairports-data/airports.csv）
 *   - id, ident, type, name, latitude_deg, longitude_deg, elevation_ft, iso_country,
 *     iso_region, municipality, scheduled_service, iata_code, ...
 * 中文名（name_zh / city_zh）为人工核对映射（见下方 MANUAL 表），个别条目经网络检索核实。
 *
 * 用法：node scripts/build-airports-cn-hk-mo.mjs [path/to/airports.csv]
 */
import fs from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("用法：node scripts/build-airports-cn-hk-mo.mjs <airports.csv>");
  process.exit(1);
}

// ---------- CSV 解析（字段不含内嵌逗号） ----------
function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(
      /^(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),([^,]*),([^,]*),([^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(".*?"|[^,]*),(.*)$/,
    );
    if (!m) continue;
    const row = {};
    header.forEach((h, idx) => {
      row[h] = (m[idx + 1] || "").replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return rows;
}

// ---------- 省份映射 ----------
const REGION = {
  "CN-11": "Beijing", "CN-12": "Tianjin", "CN-13": "Hebei", "CN-14": "Shanxi",
  "CN-15": "Inner Mongolia", "CN-21": "Liaoning", "CN-22": "Jilin", "CN-23": "Heilongjiang",
  "CN-31": "Shanghai", "CN-32": "Jiangsu", "CN-33": "Zhejiang", "CN-34": "Anhui",
  "CN-35": "Fujian", "CN-36": "Jiangxi", "CN-37": "Shandong", "CN-41": "Henan",
  "CN-42": "Hubei", "CN-43": "Hunan", "CN-44": "Guangdong", "CN-45": "Guangxi",
  "CN-46": "Hainan", "CN-50": "Chongqing", "CN-51": "Sichuan", "CN-52": "Guizhou",
  "CN-53": "Yunnan", "CN-54": "Tibet", "CN-61": "Shaanxi", "CN-62": "Gansu",
  "CN-63": "Qinghai", "CN-64": "Ningxia", "CN-65": "Xinjiang",
  "HK": "Hong Kong", "MO": "Macao",
};

const COUNTRY = { CN: "China", HK: "Hong Kong", MO: "Macao" };
const COUNTRY_CODE = { CN: "CHN", HK: "HKG", MO: "MAC" };
const TIMEZONE = { CN: "Asia/Shanghai", HK: "Asia/Hong_Kong", MO: "Asia/Macau" };

// ---------- 人工核对映射（每个机场必须有 nameZh 与 cityZh） ----------
// 可选字段：name（英文名覆盖）、city（英文城市覆盖）、region（省份修正）、notes
// 已核实/待确认条目见 docs/Atlas 中国机场数据评审.md。
const MANUAL = {
  // ===== 北京 =====
  PEK: { nameZh: "北京首都国际机场", cityZh: "北京" },
  PKX: { nameZh: "北京大兴国际机场", cityZh: "北京" },
  // ===== 上海 =====
  PVG: { nameZh: "上海浦东国际机场", cityZh: "上海" },
  SHA: { nameZh: "上海虹桥国际机场", cityZh: "上海" },
  // ===== 天津 =====
  TSN: { nameZh: "天津滨海国际机场", cityZh: "天津" },
  // ===== 重庆 =====
  CKG: { nameZh: "重庆江北国际机场", cityZh: "重庆" },
  JIQ: { nameZh: "黔江武陵山机场", cityZh: "黔江" },
  CQW: { nameZh: "重庆仙女山机场", cityZh: "武隆" },
  WXN: { nameZh: "万州五桥机场", cityZh: "万州" },
  WSK: { nameZh: "重庆巫山机场", cityZh: "巫山" },
  YGA: { nameZh: "永川大安通用机场", cityZh: "永川", notes: "通用航空机场，无定期航班。" },
  DZU: { nameZh: "大足登云机场", cityZh: "大足", notes: "军用机场。" },
  LIA: { nameZh: "梁平机场", cityZh: "梁平", notes: "老机场，现为通用航空。" },
  // ===== 河北 =====
  SJW: { nameZh: "石家庄正定国际机场", cityZh: "石家庄" },
  HDG: { nameZh: "邯郸机场", cityZh: "邯郸" },
  BPE: { nameZh: "秦皇岛北戴河机场", cityZh: "秦皇岛" },
  ZQZ: { nameZh: "张家口宁远机场", cityZh: "张家口" },
  TVS: { nameZh: "唐山三女河机场", cityZh: "唐山", notes: "军民合用。" },
  CDE: { nameZh: "承德普宁机场", cityZh: "承德" },
  XNT: { nameZh: "邢台褡裢机场", cityZh: "邢台", notes: "军民合用。" },
  LCT: { nameZh: "石家庄栾城机场", cityZh: "石家庄", notes: "通用航空机场，无定期航班。" },
  // ===== 山西 =====
  TYN: { nameZh: "太原武宿国际机场", cityZh: "太原" },
  DAT: { nameZh: "大同云冈国际机场", cityZh: "大同" },
  LFQ: { nameZh: "临汾尧都机场", cityZh: "临汾" },
  CIH: { nameZh: "长治王村机场", cityZh: "长治", notes: "军民合用。" },
  SZH: { nameZh: "朔州滋润机场", cityZh: "朔州" },
  WUT: { nameZh: "忻州五台山机场", cityZh: "忻州" },
  TYC: { nameZh: "太原尧城机场", cityZh: "太原", notes: "通用航空机场，无定期航班。" },
  LLV: { nameZh: "吕梁大武机场", cityZh: "吕梁", region: "Shanxi" },
  YCU: { nameZh: "运城盐湖国际机场", cityZh: "运城", region: "Shanxi" },
  // ===== 内蒙古 =====
  HET: { nameZh: "呼和浩特白塔国际机场", cityZh: "呼和浩特" },
  BAV: { nameZh: "包头东河国际机场", cityZh: "包头" },
  DSN: { nameZh: "鄂尔多斯伊金霍洛国际机场", cityZh: "鄂尔多斯" },
  HLD: { nameZh: "呼伦贝尔海拉尔机场", cityZh: "呼伦贝尔", city: "Hulunbuir" },
  CIF: { nameZh: "赤峰玉龙机场", cityZh: "赤峰" },
  TGO: { nameZh: "通辽机场", cityZh: "通辽" },
  WUA: { nameZh: "乌海机场", cityZh: "乌海" },
  XIL: { nameZh: "锡林浩特机场", cityZh: "锡林浩特" },
  ERL: { nameZh: "二连浩特赛乌苏国际机场", cityZh: "二连浩特" },
  NZH: { nameZh: "满洲里西郊机场", cityZh: "满洲里" },
  UCB: { nameZh: "乌兰察布集宁机场", cityZh: "乌兰察布" },
  RLK: { nameZh: "巴彦淖尔天吉泰机场", cityZh: "巴彦淖尔" },
  HLH: { nameZh: "乌兰浩特义勒力特机场", cityZh: "乌兰浩特" },
  YIE: { nameZh: "阿尔山伊尔施机场", cityZh: "阿尔山" },
  HUO: { nameZh: "霍林郭勒霍林河机场", cityZh: "霍林郭勒" },
  NZL: { nameZh: "扎兰屯成吉思汗机场", cityZh: "扎兰屯" },
  AXF: { nameZh: "阿拉善左旗巴彦浩特机场", cityZh: "阿拉善左旗", city: "Alxa Left Banner" },
  RHT: { nameZh: "阿拉善右旗巴丹吉林机场", cityZh: "阿拉善右旗", city: "Alxa Right Banner" },
  EJN: { nameZh: "额济纳旗桃来机场", cityZh: "额济纳旗", city: "Ejin Banner", notes: "通用航空机场，无定期航班。" },
  AEQ: { nameZh: "阿鲁科尔沁机场", cityZh: "阿鲁科尔沁旗", city: "Ar Horqin Banner", notes: "通用航空机场，无定期航班。" },
  OTO: { nameZh: "鄂托克旗乌兰机场", cityZh: "鄂托克旗", city: "Otog Banner", notes: "通用航空机场，无定期航班。" },
  OTQ: { nameZh: "鄂托克前旗敖勒召其机场", cityZh: "鄂托克前旗", city: "Otog Front Banner", notes: "通用航空机场，无定期航班。" },
  WZQ: { nameZh: "乌拉特中旗机场", cityZh: "乌拉特中旗", city: "Urad Middle Banner", notes: "通用航空机场，无定期航班。" },
  XRQ: { nameZh: "新巴尔虎右旗宝格德机场", cityZh: "新巴尔虎右旗", city: "New Barag Right Banner", notes: "通用航空机场，无定期航班。" },
  DWS: { nameZh: "莫力达瓦旗机场", cityZh: "莫力达瓦达斡尔族自治旗", city: "Morin Dawa Banner", notes: "通用航空机场，无定期航班。" },
  BKV: { nameZh: "百灵庙机场", cityZh: "百灵庙", notes: "通用航空机场，无定期航班。" },
  // ===== 辽宁 =====
  SHE: { nameZh: "沈阳桃仙国际机场", cityZh: "沈阳" },
  DLC: { nameZh: "大连周水子国际机场", cityZh: "大连" },
  DDG: { nameZh: "丹东浪头国际机场", cityZh: "丹东" },
  JNZ: { nameZh: "锦州湾机场", cityZh: "锦州" },
  AOG: { nameZh: "鞍山腾鳌机场", cityZh: "鞍山" },
  CHG: { nameZh: "朝阳机场", cityZh: "朝阳" },
  YKH: { nameZh: "营口兰旗机场", cityZh: "营口" },
  CNI: { nameZh: "长海大长山岛机场", cityZh: "大连", city: "Dalian" },
  XEN: { nameZh: "兴城机场", cityZh: "葫芦岛", city: "Huludao", notes: "军用机场。" },
  // ===== 吉林 =====
  CGQ: { nameZh: "长春龙嘉国际机场", cityZh: "长春" },
  NBS: { nameZh: "长白山机场", cityZh: "白山" },
  DBC: { nameZh: "白城长安机场", cityZh: "白城" },
  TNH: { nameZh: "通化三源浦机场", cityZh: "通化" },
  YNJ: { nameZh: "延吉朝阳川国际机场", cityZh: "延吉" },
  YSQ: { nameZh: "松原查干湖机场", cityZh: "松原", city: "Songyuan" },
  // ===== 黑龙江 =====
  HRB: { nameZh: "哈尔滨太平国际机场", cityZh: "哈尔滨" },
  DQA: { nameZh: "大庆萨尔图机场", cityZh: "大庆" },
  JMU: { nameZh: "佳木斯松江国际机场", cityZh: "佳木斯", notes: "2026 年 1 月由“佳木斯东郊机场”更名。" },
  MDG: { nameZh: "牡丹江海浪国际机场", cityZh: "牡丹江" },
  HEK: { nameZh: "黑河瑷珲机场", cityZh: "黑河" },
  JGD: { nameZh: "大兴安岭鄂伦春机场", cityZh: "加格达奇", city: "Jiagedaqi" },
  OHE: { nameZh: "漠河古莲机场", cityZh: "漠河" },
  FYJ: { nameZh: "抚远东极机场", cityZh: "抚远" },
  NDG: { nameZh: "齐齐哈尔三家子机场", cityZh: "齐齐哈尔" },
  JXA: { nameZh: "鸡西兴凯湖机场", cityZh: "鸡西" },
  LDS: { nameZh: "伊春林都机场", cityZh: "伊春" },
  DTU: { nameZh: "五大连池德都机场", cityZh: "五大连池", city: "Wudalianchi" },
  JSJ: { nameZh: "建三江湿地机场", cityZh: "建三江", city: "Jiansanjiang" },
  NJJ: { nameZh: "嫩江墨尔根机场", cityZh: "嫩江", city: "Nenjiang", notes: "通用航空机场，无定期航班。" },
  PFA: { nameZh: "哈尔滨平房机场", cityZh: "哈尔滨", notes: "通用航空/军用机场。" },
  HLJ: { nameZh: "肇东北大荒通用机场", cityZh: "肇东", city: "Zhaodong", notes: "通用航空机场，无定期航班。" },
  HSF: { nameZh: "绥芬河东宁机场", cityZh: "绥芬河", city: "Suifenhe", notes: "暂无定期航班。" },
  // ===== 河南 =====
  CGO: { nameZh: "郑州新郑国际机场", cityZh: "郑州" },
  LYA: { nameZh: "洛阳北郊机场", cityZh: "洛阳" },
  NNY: { nameZh: "南阳姜营机场", cityZh: "南阳" },
  XAI: { nameZh: "信阳明港机场", cityZh: "信阳" },
  HQQ: { nameZh: "安阳红旗渠机场", cityZh: "安阳" },
  AYN: { nameZh: "安阳殷都机场", cityZh: "安阳", notes: "航空运动/通用航空机场，无定期航班。" },
  HSJ: { nameZh: "郑州上街机场", cityZh: "郑州", notes: "通用航空机场，无定期航班。" },
  // ===== 湖北 =====
  WUH: { nameZh: "武汉天河国际机场", cityZh: "武汉" },
  EHU: { nameZh: "鄂州花湖国际机场", cityZh: "鄂州" },
  YIH: { nameZh: "宜昌三峡机场", cityZh: "宜昌" },
  XFN: { nameZh: "襄阳刘集机场", cityZh: "襄阳" },
  ENH: { nameZh: "恩施许家坪机场", cityZh: "恩施" },
  SHS: { nameZh: "荆州沙市机场", cityZh: "荆州" },
  WDS: { nameZh: "十堰武当山机场", cityZh: "十堰" },
  HPG: { nameZh: "神农架红坪机场", cityZh: "神农架" },
  WHN: { nameZh: "武汉汉南通用机场", cityZh: "武汉", notes: "通用航空机场，无定期航班。" },
  // ===== 湖南 =====
  CSX: { nameZh: "长沙黄花国际机场", cityZh: "长沙" },
  DYG: { nameZh: "张家界荷花国际机场", cityZh: "张家界" },
  CGD: { nameZh: "常德桃花源机场", cityZh: "常德" },
  HJJ: { nameZh: "怀化芷江机场", cityZh: "怀化" },
  HCZ: { nameZh: "郴州北湖机场", cityZh: "郴州" },
  HNY: { nameZh: "衡阳南岳机场", cityZh: "衡阳" },
  LLF: { nameZh: "永州零陵机场", cityZh: "永州" },
  WGN: { nameZh: "邵阳武冈机场", cityZh: "邵阳" },
  YYA: { nameZh: "岳阳三荷机场", cityZh: "岳阳" },
  DXJ: { nameZh: "湘西边城机场", cityZh: "湘西" },
  // ===== 广东 =====
  CAN: { nameZh: "广州白云国际机场", cityZh: "广州" },
  SZX: { nameZh: "深圳宝安国际机场", cityZh: "深圳" },
  ZUH: { nameZh: "珠海金湾机场", cityZh: "珠海" },
  SWA: { nameZh: "揭阳潮汕国际机场", cityZh: "揭阳" },
  HUZ: { nameZh: "惠州平潭机场", cityZh: "惠州" },
  ZHA: { nameZh: "湛江吴川国际机场", cityZh: "湛江" },
  FUO: { nameZh: "佛山沙堤机场", cityZh: "佛山", notes: "军民合用。" },
  MXZ: { nameZh: "梅州梅县机场", cityZh: "梅州" },
  HSC: { nameZh: "韶关丹霞机场", cityZh: "韶关" },
  XIN: { nameZh: "兴宁机场", cityZh: "梅州", notes: "军用机场。" },
  // ===== 广西 =====
  NNG: { nameZh: "南宁吴圩国际机场", cityZh: "南宁" },
  KWL: { nameZh: "桂林两江国际机场", cityZh: "桂林" },
  BHY: { nameZh: "北海福成机场", cityZh: "北海" },
  LZH: { nameZh: "柳州白莲机场", cityZh: "柳州", notes: "军民合用。" },
  AEB: { nameZh: "百色巴马机场", cityZh: "百色" },
  WUZ: { nameZh: "梧州西江机场", cityZh: "梧州", city: "Wuzhou" },
  YLX: { nameZh: "玉林福绵机场", cityZh: "玉林" },
  HCJ: { nameZh: "河池金城江机场", cityZh: "河池" },
  // ===== 海南 =====
  HAK: { nameZh: "海口美兰国际机场", cityZh: "海口" },
  SYX: { nameZh: "三亚凤凰国际机场", cityZh: "三亚" },
  BAR: { nameZh: "琼海博鳌机场", cityZh: "琼海" },
  // ===== 江苏 =====
  NKG: { nameZh: "南京禄口国际机场", cityZh: "南京" },
  WUX: { nameZh: "苏南硕放国际机场", cityZh: "无锡", notes: "军民合用。" },
  CZX: { nameZh: "常州奔牛国际机场", cityZh: "常州" },
  NTG: { nameZh: "南通兴东国际机场", cityZh: "南通" },
  YTY: { name: "Yangzhou Taizhou International Airport", nameZh: "扬州泰州国际机场", cityZh: "扬州" },
  XUZ: { nameZh: "徐州观音国际机场", cityZh: "徐州" },
  HIA: { name: "Huai'an Lianshui International Airport", nameZh: "淮安涟水国际机场", cityZh: "淮安" },
  YNZ: { nameZh: "盐城南洋国际机场", cityZh: "盐城" },
  LYG: { nameZh: "连云港花果山国际机场", cityZh: "连云港" },
  AZJ: { nameZh: "镇江大路通用机场", cityZh: "镇江", notes: "通用航空机场，无定期航班。" },
  SZV: { nameZh: "苏州光福机场", cityZh: "苏州", notes: "军用机场。" },
  RUG: { nameZh: "如皋机场", cityZh: "如皋", notes: "军用机场。" },
  // ===== 江西 =====
  KHN: { nameZh: "南昌昌北国际机场", cityZh: "南昌" },
  KOW: { nameZh: "赣州黄金机场", cityZh: "赣州" },
  JDZ: { nameZh: "景德镇罗家机场", cityZh: "景德镇" },
  JGS: { nameZh: "井冈山机场", cityZh: "吉安", city: "Ji'an" },
  YIC: { nameZh: "宜春明月山机场", cityZh: "宜春" },
  SQD: { nameZh: "上饶三清山机场", cityZh: "上饶" },
  JIU: { nameZh: "九江庐山机场", cityZh: "九江" },
  JRJ: { nameZh: "赣州瑞金机场", cityZh: "瑞金", city: "Ruijin", notes: "2025 年建成投运。" },
  YHJ: { nameZh: "南昌瑶湖机场", cityZh: "南昌", notes: "通用航空机场，无定期航班。" },
  // ===== 浙江 =====
  HGH: { nameZh: "杭州萧山国际机场", cityZh: "杭州" },
  NGB: { nameZh: "宁波栎社国际机场", cityZh: "宁波" },
  WNZ: { nameZh: "温州龙湾国际机场", cityZh: "温州" },
  YIW: { nameZh: "义乌机场", cityZh: "义乌", notes: "军民合用。" },
  HSN: { nameZh: "舟山普陀山国际机场", cityZh: "舟山" },
  HYN: { nameZh: "台州路桥机场", cityZh: "台州" },
  JUZ: { nameZh: "衢州机场", cityZh: "衢州" },
  JNH: { nameZh: "嘉兴南湖机场", cityZh: "嘉兴", city: "Jiaxing" },
  HEW: { nameZh: "东阳横店通用机场", cityZh: "东阳", city: "Dongyang", notes: "通用航空机场，无定期航班。" },
  JDE: { nameZh: "建德千岛湖通用机场", cityZh: "建德", city: "Jiande", notes: "通用航空机场，无定期航班。" },
  LIJ: { nameZh: "丽水机场", cityZh: "丽水", notes: "2025 年 7 月通航，军民合用。" },
  DEQ: { nameZh: "德清莫干山通用机场", cityZh: "德清", city: "Deqing", notes: "通用航空机场，无定期航班。" },
  // ===== 安徽 =====
  HFE: { nameZh: "合肥新桥国际机场", cityZh: "合肥" },
  TXN: { nameZh: "黄山屯溪国际机场", cityZh: "黄山" },
  WHA: { nameZh: "芜湖宣州机场", cityZh: "芜湖" },
  FUG: { nameZh: "阜阳西关机场", cityZh: "阜阳" },
  AQG: { nameZh: "安庆天柱山机场", cityZh: "安庆", notes: "军民合用。" },
  JUH: { nameZh: "池州九华山机场", cityZh: "池州" },
  BFY: { nameZh: "蚌埠滕湖机场", cityZh: "蚌埠", notes: "2026 年 4 月通航。" },
  BZJ: { name: "Bozhou Airport", nameZh: "亳州机场", cityZh: "亳州", notes: "2025 年 11 月通航。" },
  WHU: { nameZh: "芜湖湾里机场", cityZh: "芜湖", notes: "飞行学院/军用机场。" },
  // ===== 福建 =====
  XMN: { nameZh: "厦门高崎国际机场", cityZh: "厦门" },
  FOC: { nameZh: "福州长乐国际机场", cityZh: "福州" },
  JJN: { nameZh: "泉州晋江国际机场", cityZh: "泉州" },
  WUS: { nameZh: "武夷山机场", cityZh: "武夷山", city: "Wuyishan" },
  LCX: { nameZh: "连城冠豸山机场", cityZh: "龙岩", city: "Longyan" },
  SQJ: { nameZh: "三明沙县机场", cityZh: "三明" },
  // ===== 陕西 =====
  XIY: { nameZh: "西安咸阳国际机场", cityZh: "西安" },
  UYN: { nameZh: "榆林榆阳机场", cityZh: "榆林" },
  ENY: { nameZh: "延安南泥湾机场", cityZh: "延安" },
  HZG: { nameZh: "汉中城固机场", cityZh: "汉中" },
  AKA: { nameZh: "安康富强机场", cityZh: "安康" },
  DFA: { nameZh: "商洛机场", cityZh: "商洛", notes: "通用航空机场，暂无定期航班。" },
  // ===== 山东 =====
  TNA: { nameZh: "济南遥墙国际机场", cityZh: "济南" },
  TAO: { nameZh: "青岛胶东国际机场", cityZh: "青岛" },
  YNT: { nameZh: "烟台蓬莱国际机场", cityZh: "烟台" },
  WEH: { nameZh: "威海大水泊机场", cityZh: "威海" },
  LYI: { nameZh: "临沂启阳机场", cityZh: "临沂" },
  JNG: { nameZh: "济宁大安机场", cityZh: "济宁" },
  RIZ: { nameZh: "日照山字河机场", cityZh: "日照" },
  WEF: { nameZh: "潍坊南苑机场", cityZh: "潍坊" },
  HZA: { nameZh: "菏泽牡丹机场", cityZh: "菏泽" },
  DOY: { nameZh: "东营胜利机场", cityZh: "东营" },
  PNJ: { nameZh: "蓬莱沙河口机场", cityZh: "烟台", notes: "军用机场。" },
  CBZ: { nameZh: "滨州大高通用机场", cityZh: "滨州", notes: "通用航空机场，无定期航班。" },
  // ===== 甘肃 =====
  LHW: { nameZh: "兰州中川国际机场", cityZh: "兰州" },
  DNH: { nameZh: "敦煌莫高国际机场", cityZh: "敦煌" },
  JGN: { name: "Jiayuguan Jiuquan Airport", nameZh: "嘉峪关酒泉机场", cityZh: "嘉峪关", notes: "2023 年 3 月由「嘉峪关机场」更名。" },
  YZY: { nameZh: "张掖甘州机场", cityZh: "张掖" },
  JIC: { nameZh: "金昌金川机场", cityZh: "金昌" },
  THQ: { nameZh: "天水麦积山机场", cityZh: "天水" },
  LNL: { nameZh: "陇南成县机场", cityZh: "陇南" },
  IQN: { nameZh: "庆阳西峰机场", cityZh: "庆阳" },
  GXH: { nameZh: "甘南夏河机场", cityZh: "甘南" },
  // ===== 青海 =====
  XNN: { nameZh: "西宁曹家堡国际机场", cityZh: "西宁", city: "Xining" },
  GOQ: { nameZh: "格尔木机场", cityZh: "格尔木" },
  GMQ: { nameZh: "果洛玛沁机场", cityZh: "果洛" },
  YUS: { nameZh: "玉树巴塘机场", cityZh: "玉树" },
  HXD: { nameZh: "海西德令哈机场", cityZh: "德令哈", city: "Delingha" },
  HTT: { nameZh: "茫崖花土沟机场", cityZh: "茫崖", city: "Mangnai" },
  HBQ: { nameZh: "海北祁连机场", cityZh: "祁连", city: "Qilian" },
  HNG: { nameZh: "海南州共和机场", cityZh: "共和", city: "Gonghe", notes: "通用航空机场，无定期航班。" },
  // ===== 宁夏 =====
  INC: { nameZh: "银川河东国际机场", cityZh: "银川" },
  ZHY: { nameZh: "中卫沙坡头机场", cityZh: "中卫" },
  GYU: { nameZh: "固原六盘山机场", cityZh: "固原" },
  YEH: { nameZh: "银川月牙湖通用机场", cityZh: "银川", notes: "通用航空机场，无定期航班。" },
  // ===== 新疆 =====
  URC: { nameZh: "乌鲁木齐天山国际机场", cityZh: "乌鲁木齐" },
  KHG: { nameZh: "喀什徕宁国际机场", cityZh: "喀什" },
  HTN: { name: "Hotan Kungang Airport", nameZh: "和田昆冈机场", cityZh: "和田", notes: "2023 年 2 月由「和田机场」更名。" },
  KRL: { nameZh: "库尔勒梨城机场", cityZh: "库尔勒" },
  AKU: { nameZh: "阿克苏红旗坡机场", cityZh: "阿克苏" },
  HMI: { nameZh: "哈密机场", cityZh: "哈密" },
  AAT: { nameZh: "阿勒泰雪都机场", cityZh: "阿勒泰" },
  TLQ: { nameZh: "吐鲁番交河机场", cityZh: "吐鲁番" },
  BPL: { nameZh: "博乐阿拉山口机场", cityZh: "博乐" },
  IQM: { nameZh: "且末玉都机场", cityZh: "且末" },
  RQA: { nameZh: "若羌楼兰机场", cityZh: "若羌" },
  QSZ: { nameZh: "莎车机场", cityZh: "莎车" },
  KCA: { nameZh: "库车龟兹机场", cityZh: "库车" },
  SHF: { nameZh: "石河子花园机场", cityZh: "石河子" },
  KRY: { nameZh: "克拉玛依机场", cityZh: "克拉玛依" },
  FYN: { nameZh: "富蕴可可托海机场", cityZh: "富蕴" },
  KJI: { nameZh: "布尔津喀纳斯机场", cityZh: "布尔津" },
  NLT: { nameZh: "新源那拉提机场", cityZh: "新源" },
  TCG: { nameZh: "塔城千泉机场", cityZh: "塔城" },
  YIN: { nameZh: "伊犁伊宁国际机场", cityZh: "伊宁", city: "Yining", notes: "2024 年 6 月由「伊宁机场」更名。" },
  YTW: { nameZh: "于田万方机场", cityZh: "于田" },
  ACF: { nameZh: "阿拉尔塔里木机场", cityZh: "阿拉尔" },
  TWC: { nameZh: "图木舒克唐王城机场", cityZh: "图木舒克" },
  HQL: { nameZh: "塔什库尔干红其拉甫机场", cityZh: "塔什库尔干" },
  ZFL: { nameZh: "昭苏天马机场", cityZh: "昭苏" },
  HJB: { nameZh: "和静巴音布鲁克机场", cityZh: "和静" },
  JBK: { nameZh: "奇台江布拉克机场", cityZh: "奇台" },
  SXJ: { nameZh: "鄯善机场", cityZh: "鄯善", notes: "暂无定期航班。" },
  DHH: { nameZh: "巴里坤大河机场", cityZh: "巴里坤", notes: "2025 年建成投运。" },
  WRH: { nameZh: "乌尔禾机场", cityZh: "克拉玛依", city: "Karamay", notes: "通用航空机场，无定期航班。" },
  // ===== 云南 =====
  KMG: { nameZh: "昆明长水国际机场", cityZh: "昆明" },
  LJG: { nameZh: "丽江三义国际机场", cityZh: "丽江" },
  JHG: { nameZh: "西双版纳嘎洒国际机场", cityZh: "景洪", city: "Jinghong" },
  LUM: { nameZh: "德宏芒市国际机场", cityZh: "芒市", city: "Mangshi" },
  DLU: { nameZh: "大理凤仪机场", cityZh: "大理" },
  DIG: { nameZh: "迪庆香格里拉机场", cityZh: "香格里拉", city: "Shangri-La" },
  BSD: { nameZh: "保山云瑞机场", cityZh: "保山" },
  TCZ: { nameZh: "腾冲驼峰机场", cityZh: "腾冲", city: "Tengchong" },
  LNJ: { nameZh: "临沧博尚机场", cityZh: "临沧" },
  CWJ: { nameZh: "沧源佤山机场", cityZh: "沧源", city: "Cangyuan" },
  JMJ: { nameZh: "澜沧景迈机场", cityZh: "澜沧", city: "Lancang" },
  SYM: { nameZh: "普洱思茅机场", cityZh: "普洱" },
  WNH: { nameZh: "文山普者黑机场", cityZh: "文山" },
  ZAT: { nameZh: "昭通昭阳机场", cityZh: "昭通" },
  NLH: { nameZh: "宁蒗泸沽湖机场", cityZh: "宁蒗", city: "Ninglang" },
  LCS: { nameZh: "陇川广宋机场", cityZh: "陇川", city: "Longchuan", notes: "通用航空机场，无定期航班。" },
  LFH: { nameZh: "兰坪丰华通用机场", cityZh: "兰坪", city: "Lanping", notes: "通用航空机场，无定期航班。" },
  YUA: { nameZh: "元谋机场", cityZh: "元谋", city: "Yuanmou", notes: "军用机场。" },
  // ===== 四川 =====
  CTU: { nameZh: "成都双流国际机场", cityZh: "成都" },
  TFU: { nameZh: "成都天府国际机场", cityZh: "成都" },
  MIG: { nameZh: "绵阳南郊机场", cityZh: "绵阳" },
  LZO: { nameZh: "泸州云龙机场", cityZh: "泸州" },
  YBP: { nameZh: "宜宾五粮液机场", cityZh: "宜宾" },
  NAO: { nameZh: "南充高坪机场", cityZh: "南充" },
  XIC: { nameZh: "西昌青山机场", cityZh: "西昌", city: "Xichang" },
  PZI: { nameZh: "攀枝花保安营机场", cityZh: "攀枝花" },
  GYS: { nameZh: "广元盘龙机场", cityZh: "广元" },
  DZH: { nameZh: "达州金垭机场", cityZh: "达州" },
  BZX: { nameZh: "巴中恩阳机场", cityZh: "巴中" },
  JZH: { nameZh: "九寨黄龙机场", cityZh: "松潘", city: "Songpan" },
  DCY: { nameZh: "稻城亚丁机场", cityZh: "稻城", city: "Daocheng" },
  KGT: { nameZh: "康定机场", cityZh: "康定" },
  GZG: { nameZh: "甘孜格萨尔机场", cityZh: "甘孜", city: "Garzê" },
  AHJ: { nameZh: "红原机场", cityZh: "红原", city: "Hongyuan", notes: "通用航空机场，无定期航班。" },
  GHN: { nameZh: "广汉机场", cityZh: "广汉", city: "Guanghan", notes: "中国民航飞行学院训练机场。" },
  LZG: { nameZh: "阆中古城机场", cityZh: "阆中", city: "Langzhong" },
  BCJ: { nameZh: "北川永昌机场", cityZh: "北川", city: "Beichuan", notes: "通用航空机场，无定期航班。" },
  HZU: { nameZh: "成都淮州机场", cityZh: "成都", notes: "通用航空机场，无定期航班。" },
  ZKL: { nameZh: "自贡凤鸣通用机场", cityZh: "自贡", notes: "通用航空机场，无定期航班。" },
  LSG: { nameZh: "乐山机场", cityZh: "乐山", notes: "在建，2025 年底完成校飞，计划 2026 年通航。" },
  // ===== 贵州 =====
  KWE: { nameZh: "贵阳龙洞堡国际机场", cityZh: "贵阳" },
  ZYI: { nameZh: "遵义新舟机场", cityZh: "遵义" },
  WMT: { nameZh: "遵义茅台机场", cityZh: "遵义" },
  ACX: { nameZh: "兴义万峰林机场", cityZh: "兴义" },
  LPF: { nameZh: "六盘水月照机场", cityZh: "六盘水" },
  AVA: { nameZh: "安顺黄果树机场", cityZh: "安顺" },
  BFJ: { nameZh: "毕节飞雄机场", cityZh: "毕节" },
  TEN: { nameZh: "铜仁凤凰机场", cityZh: "铜仁" },
  KJH: { nameZh: "凯里黄平机场", cityZh: "凯里" },
  HZH: { nameZh: "黎平机场", cityZh: "黎平", city: "Liping" },
  LLB: { nameZh: "荔波机场", cityZh: "荔波", city: "Libo" },
  // ===== 西藏 =====
  LXA: { nameZh: "拉萨贡嘎国际机场", cityZh: "山南", city: "Shannan" },
  RKZ: { nameZh: "日喀则和平机场", cityZh: "日喀则", city: "Shigatse" },
  BPX: { nameZh: "昌都邦达机场", cityZh: "昌都", city: "Qamdo" },
  LZY: { nameZh: "林芝米林机场", cityZh: "林芝" },
  NGQ: { nameZh: "阿里昆莎机场", cityZh: "阿里", city: "Ngari" },
  LGZ: { nameZh: "山南隆子机场", cityZh: "山南" },
  DDR: { nameZh: "日喀则定日机场", cityZh: "日喀则", city: "Shigatse" },
  APJ: { nameZh: "阿里普兰机场", cityZh: "普兰", city: "Burang", notes: "暂无定期航班。" },
  // ===== 香港 =====
  HKG: { nameZh: "香港国际机场", cityZh: "香港", city: "Hong Kong" },
  HHP: { nameZh: "信德直升机场", cityZh: "香港", city: "Hong Kong", notes: "直升机停机坪（港澳直升机航线）。" },
  // ===== 澳门 =====
  MFM: { nameZh: "澳门国际机场", cityZh: "澳门", city: "Macao" },
};

// ---------- 主流程 ----------
const text = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(text);

// 评审确认排除（docs/Atlas 中国机场数据评审.md §6）：
// ① 9 条：码头/停用/停航/在建/纯军用（ZGN, XZM, NAY, DAX, BFU, LHK, JIL, DEJ, SIA）
// ② 41 条：通用航空 31 + 通用/军用混合 2（PFA, WHU）+ 老机场转通用 1（LIA）+ 纯军用 7
// MANUAL 中保留这些条目的映射作为检索记录，但不会进入输出。
const EXCLUDE = new Set([
  "ZGN", "XZM", "NAY", "DAX", "BFU", "LHK", "JIL", "DEJ", "SIA",
  // 通用航空（无定期航班）
  "AEQ", "ZKL", "HNG", "DWS", "LCT", "WHN", "CBZ", "HEW", "JDE", "HLJ",
  "TYC", "WRH", "YEH", "LCS", "LFH", "BKV", "OTQ", "YHJ", "OTO", "DEQ",
  "EJN", "HSJ", "HZU", "NJJ", "WZQ", "XRQ", "YGA", "AYN", "AZJ", "BCJ",
  "AHJ",
  // 通用/军用混合
  "PFA", "WHU",
  // 老机场转通用
  "LIA",
  // 纯军用
  "PNJ", "XIN", "YUA", "RUG", "SZV", "DZU", "XEN",
  // 飞行训练机场
  "GHN",
]);

const selected = rows.filter(
  (r) =>
    ["CN", "HK", "MO"].includes(r.iso_country)
    && r.iata_code
    && r.type !== "closed"
    && !EXCLUDE.has(r.iata_code.toUpperCase()),
);

function cleanCity(municipality) {
  return municipality.replace(/\([^)]*\)/g, "").trim();
}

const airports = [];
const problems = [];
const seenIata = new Set();

for (const r of selected) {
  const iata = r.iata_code.toUpperCase();
  const manual = MANUAL[iata];
  if (!manual) {
    problems.push(`${iata} 缺少人工中文映射（nameZh/cityZh）`);
    continue;
  }
  if (seenIata.has(iata)) {
    problems.push(`${iata} 重复出现`);
    continue;
  }
  seenIata.add(iata);

  const icaoRaw = r.icao_code || r.gps_code || r.local_code || "";
  const icao = /^[A-Z0-9]{4}$/.test(icaoRaw) ? icaoRaw.toUpperCase() : null;

  const elevationRaw = parseInt(r.elevation_ft, 10);
  const elevation = Number.isInteger(elevationRaw) ? elevationRaw : null;

  airports.push({
    iata_code: iata,
    icao_code: icao,
    name: (manual.name ?? r.name).trim(),
    name_zh: manual.nameZh ?? null,
    city: (manual.city ?? cleanCity(r.municipality)).trim(),
    city_zh: manual.cityZh ?? null,
    country: COUNTRY[r.iso_country],
    country_code: COUNTRY_CODE[r.iso_country],
    region: manual.region ?? (r.iso_country === "CN" ? REGION[r.iso_region] : REGION[r.iso_country]) ?? null,
    latitude: Number(r.latitude_deg),
    longitude: Number(r.longitude_deg),
    timezone: TIMEZONE[r.iso_country],
    elevation_ft: elevation,
    notes: manual.notes ?? null,
  });
}

// ---------- 规则校验（对应 migrations/0006_flight_archive.sql 的 CHECK 约束） ----------
const errors = [];
for (const a of airports) {
  if (!/^[A-Z0-9]{3}$/.test(a.iata_code)) errors.push(`${a.iata_code}: iata_code 非法`);
  if (a.icao_code !== null && !/^[A-Z0-9]{4}$/.test(a.icao_code)) errors.push(`${a.iata_code}: icao_code 非法`);
  if (!a.name || a.name.length > 160) errors.push(`${a.iata_code}: name 非法`);
  if (a.name_zh !== null && a.name_zh.length > 160) errors.push(`${a.iata_code}: name_zh 超长`);
  if (!a.city || a.city.length > 120) errors.push(`${a.iata_code}: city 非法`);
  if (a.city_zh !== null && a.city_zh.length > 120) errors.push(`${a.iata_code}: city_zh 超长`);
  if (!a.country || a.country.length > 100) errors.push(`${a.iata_code}: country 非法`);
  if (!/^[A-Z]{3}$/.test(a.country_code)) errors.push(`${a.iata_code}: country_code 非法`);
  if (a.region !== null && a.region.length > 120) errors.push(`${a.iata_code}: region 超长`);
  if (!(a.latitude >= -90 && a.latitude <= 90)) errors.push(`${a.iata_code}: latitude 越界`);
  if (!(a.longitude >= -180 && a.longitude <= 180)) errors.push(`${a.iata_code}: longitude 越界`);
  if (!a.timezone || a.timezone.length > 64) errors.push(`${a.iata_code}: timezone 非法`);
  if (a.elevation_ft !== null && !(Number.isInteger(a.elevation_ft) && a.elevation_ft >= -2000 && a.elevation_ft <= 30000))
    errors.push(`${a.iata_code}: elevation_ft 非法`);
  if (a.notes !== null && a.notes.length > 3000) errors.push(`${a.iata_code}: notes 超长`);
}
const icaoCodes = airports.filter((a) => a.icao_code).map((a) => a.icao_code);
if (new Set(icaoCodes).size !== icaoCodes.length) errors.push("icao_code 存在重复");

// ---------- 汇总 ----------
const byRegion = {};
const byCountry = {};
for (const a of airports) {
  byRegion[a.region] = (byRegion[a.region] ?? 0) + 1;
  byCountry[a.country] = (byCountry[a.country] ?? 0) + 1;
}

console.log(`机场总数：${airports.length}（${Object.entries(byCountry).map(([k, v]) => `${k} ${v}`).join("，")}）`);
console.log(`缺 ICAO：${airports.filter((a) => a.icao_code === null).map((a) => a.iata_code).join(", ") || "无"}`);
console.log(`缺海拔：${airports.filter((a) => a.elevation_ft === null).length} 个`);
console.log(`缺中文映射：${problems.length} 个`);
if (problems.length) console.log(problems.join("\n"));
console.log(`规则校验错误：${errors.length} 个`);
if (errors.length) console.log(errors.join("\n"));

// 不允许用部分结果覆盖已有数据。上游新增机场、重复代码或规则错误都必须先处理。
if (problems.length || errors.length) {
  console.error("生成失败：未覆盖 atlas-airports-cn-hk-mo.json。");
  process.exit(1);
}

const outPath = new URL("../data-source/atlas-airports-cn-hk-mo.json", import.meta.url).pathname;
fs.writeFileSync(outPath, JSON.stringify(airports, null, 2) + "\n");
console.log(`写入 ${outPath}`);
