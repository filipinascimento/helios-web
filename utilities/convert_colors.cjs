#!/usr/bin/env node
// Encode all colormap JSON files in utilities/colormap_data into a single
// base64-packed lookup written to src/colors/ColormapData.json. Each colormap
// name is prefixed with the source filename (without extension) followed by
// an underscore, e.g. `cmasher_amber_`.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "colormap_data");
const OUTPUT_PATH = path.resolve(__dirname, "..", "src", "colors", "ColormapData.json");

function clampByte(value) {
  return Math.max(0, Math.min(255, Number(value) | 0));
}

function parseRgbText(text) {
  const colors = [];
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const r = clampByte(parts[0]);
    const g = clampByte(parts[1]);
    const b = clampByte(parts[2]);
    colors.push([r, g, b]);
  }
  return colors;
}

function parseHexColor(hex) {
  const cleaned = hex.trim().replace(/^#/, "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b].map(clampByte);
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b].map(clampByte);
  }
  throw new Error(`Unsupported hex color: ${hex}`);
}

function parseColorValue(value) {
  if (typeof value === "string") {
    return parseRgbText(value);
  }

  if (Array.isArray(value)) {
    const colors = [];
    for (const entry of value) {
      if (typeof entry === "string") {
        colors.push(parseHexColor(entry));
      } else if (Array.isArray(entry) && entry.length >= 3) {
        const [r, g, b] = entry;
        colors.push([clampByte(r), clampByte(g), clampByte(b)]);
      }
    }
    return colors;
  }

  throw new Error("Unsupported colormap value; expected string or array");
}

function encodeToBase64(colors) {
  const bytes = new Uint8Array(colors.length * 3);
  let idx = 0;
  for (const [r, g, b] of colors) {
    bytes[idx++] = r;
    bytes[idx++] = g;
    bytes[idx++] = b;
  }
  return Buffer.from(bytes).toString("base64");
}

function processFile(filePath, prefix, accumulator) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  for (const [name, value] of Object.entries(data)) {
    const colors = parseColorValue(value);
    if (!colors.length) continue;
    const key = `${prefix}_${name}`;
    if (accumulator[key]) {
      throw new Error(`Duplicate colormap key detected: ${key}`);
    }
    accumulator[key] = { n: colors.length, data: encodeToBase64(colors) };
  }
}

function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort();

  if (!files.length) {
    console.warn(`No JSON colormap files found in ${DATA_DIR}`);
    return;
  }

  const output = {};
  for (const file of files) {
    const prefix = path.basename(file, path.extname(file));
    processFile(path.join(DATA_DIR, file), prefix, output);
  }

  const sortedKeys = Object.keys(output).sort();
  const sortedOutput = {};
  for (const key of sortedKeys) {
    sortedOutput[key] = output[key];
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sortedOutput, null, 2), "utf8");
  console.log(`Wrote ${OUTPUT_PATH} with ${sortedKeys.length} colormaps from ${files.length} sources.`);
}

main();
