import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PNG } from "pngjs";

const SOURCE_YEAR = 2016;
const WIDTH = 2048;
const HEIGHT = 1024;
const BRIGHTNESS_THRESHOLD = 24;
const SOURCE_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_Night_Lights&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&TIME=2016-01-01";
const outputPath = resolve(process.cwd(), "public/data/night-lights.json");

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`NASA GIBS request failed: ${response.status}`);
const image = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
if (image.width !== WIDTH || image.height !== HEIGHT) {
  throw new Error(`Unexpected source dimensions: ${image.width}x${image.height}`);
}

const points = [];
for (let y = 0; y < image.height; y += 1) {
  for (let x = 0; x < image.width; x += 1) {
    const offset = (y * image.width + x) * 4;
    const alpha = image.data[offset + 3];
    const brightness = Math.max(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    if (!alpha || brightness < BRIGHTNESS_THRESHOLD) continue;
    const longitude = -180 + (x + 0.5) * 360 / image.width;
    const latitude = 90 - (y + 0.5) * 180 / image.height;
    points.push([
      Number(longitude.toFixed(3)),
      Number(latitude.toFixed(3)),
      Number((brightness / 255).toFixed(3)),
    ]);
  }
}

const output = {
  source: "NASA EOSDIS GIBS · VIIRS Night Lights",
  sourceYear: SOURCE_YEAR,
  threshold: BRIGHTNESS_THRESHOLD,
  points,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Wrote ${points.length} night-light samples to ${outputPath}`);
