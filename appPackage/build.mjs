#!/usr/bin/env node
// Builds the Pollyn Teams app package (appPackage/build/pollyn.zip). No dependencies.
//
//   node appPackage/build.mjs            (or: npm run package:teams)
//
// Reads .env / .env.local in the project root (process.env wins):
//   APP_BASE_URL     public https URL of the app -> {{HOST}} (domain[:port], no scheme)
//   AZURE_CLIENT_ID  Entra ID app (client) ID     -> {{CLIENT_ID}}
//   TEAMS_APP_ID     optional Teams app GUID      -> {{APP_ID}} (else derived from AZURE_CLIENT_ID, stable)
//   TEAMS_APP_VERSION optional semver             -> {{VERSION}} (default: package.json version)
//
// Output: build/manifest.json, build/color.png (192x192), build/outline.png (32x32), build/pollyn.zip
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "build");

// ---------- env ----------
function loadEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    env[m[1]] = v;
  }
  return env;
}
const hasEnvFile = existsSync(join(root, ".env")) || existsSync(join(root, ".env.local"));
const env = { ...loadEnvFile(join(root, ".env")), ...loadEnvFile(join(root, ".env.local")) };
for (const k of Object.keys(process.env)) if (process.env[k] !== undefined && process.env[k] !== "") env[k] = process.env[k];

const warnings = [];
if (!hasEnvFile && !process.env.APP_BASE_URL) warnings.push("No .env found - using placeholder values (package is NOT installable as-is).");

const GUID = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
let host;
try {
  const u = new URL(env.APP_BASE_URL || "https://pollyn.example.com");
  host = u.host.toLowerCase();
  if (u.protocol !== "https:") warnings.push(`APP_BASE_URL is ${u.protocol}// - Teams only loads https tabs. Use a tunnel or deployed URL.`);
} catch {
  throw new Error(`APP_BASE_URL is not a valid URL: ${env.APP_BASE_URL}`);
}
let clientId = (env.AZURE_CLIENT_ID || "").trim();
if (!GUID.test(clientId)) {
  warnings.push("AZURE_CLIENT_ID missing/invalid - using 00000000-0000-0000-0000-000000000000 (Teams SSO will not work).");
  clientId = "00000000-0000-0000-0000-000000000000";
}
/** Name-based (v5-style) UUID so the Teams app id stays stable across builds. */
function stableUuid(seed) {
  const h = createHash("sha1").update("pollyn-teams-app:" + seed).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
let appId = (env.TEAMS_APP_ID || "").trim();
const derived = !appId;
if (derived) appId = stableUuid(clientId);
if (!GUID.test(appId)) throw new Error(`TEAMS_APP_ID must be a GUID, got: ${appId}`);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = (env.TEAMS_APP_VERSION || pkg.version || "1.0.0").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version must be x.y.z, got: ${version}`);

// ---------- manifest ----------
const vars = { APP_ID: appId, CLIENT_ID: clientId, HOST: host, VERSION: version };
const template = readFileSync(join(here, "manifest.template.json"), "utf8");
const filled = template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in vars)) throw new Error(`Unknown placeholder ${m} in manifest.template.json`);
  return vars[k];
});
const manifest = JSON.stringify(JSON.parse(filled), null, 2) + "\n";

// ---------- PNG ----------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Shapes in unit space (0..1). Signed distance to a rounded rectangle.
function sdRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
// Brand mark: three rising bars, bottom-aligned (like a bar chart / podium).
const BARS = [
  [0.245, 0.555, 0.355, 0.755],
  [0.445, 0.425, 0.555, 0.755],
  [0.645, 0.275, 0.755, 0.755],
];
const inBars = (x, y) => BARS.some(([x0, y0, x1, y1]) => sdRoundRect(x, y, x0, y0, x1, y1, 0.04) <= 0);
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const STOPS = [hex("#0B7A6E"), hex("#4C9A96"), hex("#4F5FD6")];
function gradient(t) {
  t = Math.min(1, Math.max(0, t));
  const [a, b, u] = t < 0.5 ? [STOPS[0], STOPS[1], t * 2] : [STOPS[1], STOPS[2], (t - 0.5) * 2];
  return a.map((c, i) => c + (b[i] - c) * u);
}

/** Render with SS x SS supersampling; sample(x,y) returns [r,g,b,a] in 0..255 / 0..1 alpha. */
function render(size, sample, SS = 4) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const [cr, cg, cb, ca] = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
      r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
    }
    const i = (y * size + x) * 4;
    if (a > 0) { buf[i] = Math.round(r / a); buf[i + 1] = Math.round(g / a); buf[i + 2] = Math.round(b / a); }
    buf[i + 3] = Math.round((a / (SS * SS)) * 255);
  }
  return buf;
}

// Color icon: full-bleed rounded square with the FLNT diagonal gradient + white bars.
const colorPng = encodePng(192, 192, render(192, (x, y) => {
  if (sdRoundRect(x, y, 0, 0, 1, 1, 0.22) > 0) return [0, 0, 0, 0];
  if (inBars(x, y)) return [255, 255, 255, 1];
  return [...gradient((x + y) / 2), 1];
}));
// Outline icon: white only, transparent background (rounded-square stroke + bars).
const outlinePng = encodePng(32, 32, render(32, (x, y) => {
  const d = sdRoundRect(x, y, 0.06, 0.06, 0.94, 0.94, 0.2);
  if ((d <= 0 && d >= -0.075) || inBars(x, y)) return [255, 255, 255, 1];
  return [0, 0, 0, 0];
}, 8));

// ---------- ZIP (stored with deflate) ----------
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
function zip(files) {
  const { time, date } = dosDateTime();
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    // extra len, comment len, disk start, internal attrs, external attrs = 0
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------- write ----------
mkdirSync(out, { recursive: true });
const files = [
  { name: "manifest.json", data: Buffer.from(manifest, "utf8") },
  { name: "color.png", data: colorPng },
  { name: "outline.png", data: outlinePng },
];
for (const f of files) writeFileSync(join(out, f.name), f.data);
const zipPath = join(out, "pollyn.zip");
writeFileSync(zipPath, zip(files));

console.log("Pollyn Teams app package built");
console.log(`  host       ${host}`);
console.log(`  client id  ${clientId}`);
console.log(`  app id     ${appId}${derived ? "  (derived from AZURE_CLIENT_ID - pin it: add TEAMS_APP_ID=" + appId + " to .env)" : ""}`);
console.log(`  version    ${version}`);
console.log(`  output     ${zipPath}`);
for (const f of files) console.log(`    - ${f.name} (${f.data.length} bytes)`);
for (const w of warnings) console.warn(`  ! ${w}`);
