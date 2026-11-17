// Rig + sprite-sheet builder for the fat-cat stickers.
// Reads the hand-drawn single-pose SVGs (svg/<variant>/NN-name.svg) and
// re-poses the limb paths frame by frame so the sheet is a real animation
// (walk cycle, press, squat, ...) instead of a shiver.
// The frame maths (SVG reader + rig) lives in ./frames.mjs (pure Node, no Chrome; also feeds the <Cat>
// component via scripts/cat-source.mjs). This script only writes the sheets and renders them.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NFRAMES, parseSVG, renderFrame } from "./frames.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..", "assets", "stickers");
const SRC = path.join(ROOT, "svg");
const OUT = path.join(ROOT, "motion");
const TMP = path.join(OUT, ".tmp");
const VARIANTS = ["color", "line", "line-white"];
const CELL = 232; // art units per frame (matches the old sheets)
const PX = 512; // pixels per frame

const cfg = await import(pathToFileURL(path.join(here, "rigs.mjs")).href);
const RIGS = cfg.RIGS;

function frameSVG(srcDoc, rig, i) {
  const prefix = "f" + i;
  const defs = srcDoc.defs
    .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
  return `<svg x="${CELL * i - 16}" y="-16" width="${CELL}" height="${CELL}" viewBox="-16 -16 ${CELL} ${CELL}" overflow="hidden">\n${defs}\n${renderFrame(srcDoc, rig, i, prefix)}\n</svg>`;
}

function sheetSVG(src, rig) {
  const doc = parseSVG(src);
  const frames = [];
  for (let i = 0; i < NFRAMES; i++) frames.push(frameSVG(doc, rig, i));
  const w = CELL * NFRAMES;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * PX) / CELL}" height="${PX}" viewBox="-16 -16 ${w} ${CELL}">\n${frames.join("\n")}\n</svg>`;
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */
const only = process.argv[2];
const onlyList = only ? only.split(",") : null;
const wanted = (name) => !onlyList || onlyList.some((o) => name.includes(o));
const chrome =
  process.env.CHROME ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((p) => fs.existsSync(p));

fs.mkdirSync(TMP, { recursive: true });
for (const v of VARIANTS) fs.mkdirSync(path.join(OUT, "svg", v), { recursive: true });
for (const v of VARIANTS) fs.mkdirSync(path.join(OUT, "png", v), { recursive: true });

const files = fs.readdirSync(path.join(SRC, "color")).filter((f) => f.endsWith(".svg")).sort();
const jobs = [];
for (const f of files) {
  const name = f.replace(/\.svg$/, "");
  if (!wanted(name)) continue;
  const rig = RIGS[name];
  if (!rig) {
    console.log("· no rig, skip", name);
    continue;
  }
  const rows = [];
  for (const v of VARIANTS) {
    const src = fs.readFileSync(path.join(SRC, v, f), "utf8");
    const svg = sheetSVG(src, rig);
    fs.writeFileSync(path.join(OUT, "svg", v, f), svg);
    rows.push(svg);
  }
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${rows.join("\n")}`;
  const file = path.join(TMP, name + ".html");
  fs.writeFileSync(file, html);
  jobs.push({ name, file, out: path.join(TMP, name + ".png") });
}

if (jobs.length && chrome) {
  for (const job of jobs) {
    execFileSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-color-profile=srgb",
        "--force-device-scale-factor=1",
        "--default-background-color=00000000",
        "--window-size=2560,1536",
        "--virtual-time-budget=4000",
        `--screenshot=${job.out}`,
        pathToFileURL(job.file).href,
      ],
      { stdio: "ignore" }
    );
    console.log("✓ png", job.name);
  }
}

/* crop the 3 stacked variants into separate sheets with System.Drawing */
if (jobs.length) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$jobs = @(${jobs.map((j) => `@{p='${j.out.replace(/'/g, "''")}';n='${j.name}'}`).join(",")})
$variants = @('color','line','line-white')
foreach($j in $jobs){
  $img = [System.Drawing.Bitmap]::FromFile($j.p)
  for($k=0;$k -lt 3;$k++){
    $rect = New-Object System.Drawing.Rectangle 0,($k*512),2560,512
    $crop = $img.Clone($rect, $img.PixelFormat)
    $out = Join-Path '${path.join(OUT, "png").replace(/'/g, "''")}' $variants[$k]
    $crop.Save((Join-Path $out ($j.n + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
  }
  $img.Dispose()
}
`;
  const psFile = path.join(TMP, "crop.ps1");
  fs.writeFileSync(psFile, ps);
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile], { stdio: "inherit" });
  console.log("✓ cropped", jobs.length, "sheets");
}
