// Rig + sprite-sheet builder for the fat-cat stickers.
// Reads the hand-drawn single-pose SVGs (svg/<variant>/NN-name.svg) and
// re-poses the limb paths frame by frame so the sheet is a real animation
// (walk cycle, press, squat, ...) instead of a shiver.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..", "assets", "stickers");
const SRC = path.join(ROOT, "svg");
const OUT = path.join(ROOT, "motion");
const TMP = path.join(OUT, ".tmp");
const VARIANTS = ["color", "line", "line-white"];
const NFRAMES = 5;
const CELL = 232; // art units per frame (matches the old sheets)
const PX = 512; // pixels per frame

/* ------------------------------------------------------------------ */
/* tiny 2x3 matrix helpers                                             */
/* ------------------------------------------------------------------ */
const idM = () => [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const rotM = (deg) => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const num = (v) => (Math.abs(v) < 1e-6 ? 0 : +v.toFixed(3));
const matAttr = (m) =>
  m.every((v, i) => num(v) === [1, 0, 0, 1, 0, 0][i]) ? "" : `matrix(${m.map(num).join(" ")})`;
const about = (p, deg) => mul(mul([1, 0, 0, 1, p[0], p[1]], rotM(deg)), [1, 0, 0, 1, -p[0], -p[1]]);

function parseTransform(str) {
  let m = idM();
  if (!str) return m;
  const re = /(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g;
  let r;
  while ((r = re.exec(str))) {
    const v = r[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t;
    if (r[1] === "translate") t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (r[1] === "scale") t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (r[1] === "rotate") {
      const a = rotM(v[0] || 0);
      t = v.length >= 3 ? about([v[1], v[2]], v[0] || 0) : a;
    } else t = [v[0], v[1], v[2], v[3], v[4], v[5]];
    m = mul(m, t);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* path endpoint (handles relative commands)                           */
/* ------------------------------------------------------------------ */
function pathEnds(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;
  let prev = "";
  const nums = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) out.push(Number(toks[i++]));
    return out;
  };
  const move = (x, y) => {
    cx = x;
    cy = y;
  };
  while (i < toks.length) {
    let cmd = toks[i];
    if (/[a-zA-Z]/.test(cmd)) i++;
    else cmd = prev === "M" ? "L" : prev === "m" ? "l" : prev; // implicit repeat
    prev = cmd;
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        const [x, y] = nums(2);
        move(rel ? cx + x : x, rel ? cy + y : y);
        sx = cx;
        sy = cy;
        break;
      }
      case "L":
      case "T": {
        const [x, y] = nums(2);
        move(rel ? cx + x : x, rel ? cy + y : y);
        break;
      }
      case "H": {
        const [x] = nums(1);
        move(rel ? cx + x : x, cy);
        break;
      }
      case "V": {
        const [y] = nums(1);
        move(cx, rel ? cy + y : y);
        break;
      }
      case "C": {
        const v = nums(6);
        move(rel ? cx + v[4] : v[4], rel ? cy + v[5] : v[5]);
        break;
      }
      case "S":
      case "Q": {
        const v = nums(4);
        move(rel ? cx + v[2] : v[2], rel ? cy + v[3] : v[3]);
        break;
      }
      case "A": {
        const v = nums(7);
        move(rel ? cx + v[5] : v[5], rel ? cy + v[6] : v[6]);
        break;
      }
      case "Z": {
        move(sx, sy);
        break;
      }
      default:
        i++;
    }
  }
  return { start: [sx, sy], end: [cx, cy] };
}

/* ------------------------------------------------------------------ */
/* minimal SVG reader                                                  */
/* ------------------------------------------------------------------ */
function parseSVG(src) {
  const defs = (src.match(/<defs>[\s\S]*?<\/defs>/) || [""])[0];
  const body = src.slice(src.indexOf("</defs>") + 7);
  const items = [];
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(body))) {
    const closing = m[1] === "/";
    const tag = m[2];
    const raw = m[3];
    const selfClose = m[4] === "/";
    const attrs = {};
    raw.replace(/([\w:-]+)\s*=\s*"([^"]*)"/g, (_, k, v) => {
      attrs[k] = v;
      return "";
    });
    if (closing) {
      stack.pop();
      continue;
    }
    if (tag === "g" || tag === "svg") {
      if (!selfClose) stack.push({ transform: attrs.transform || "", filter: attrs.filter || "" });
      continue;
    }
    if (tag === "defs" || tag === "clipPath" || tag === "linearGradient" || tag === "radialGradient") continue;
    const tfs = stack.map((s) => s.transform).filter(Boolean);
    const filt = [...stack].reverse().map((s) => s.filter).find(Boolean) || "";
    const anc = tfs.reduce((acc, t) => mul(acc, parseTransform(t)), idM());
    const own = parseTransform(attrs.transform || "");
    items.push({
      tag,
      attrs,
      d: attrs.d || "",
      filter: filt.replace(/url\(#|\)/g, ""),
      anc, // ancestor transforms only
      base: mul(anc, own), // ancestor + own
      ownM: own,
      sw: parseFloat(attrs["stroke-width"] || "0"),
    });
  }
  return { defs, items };
}

/* ------------------------------------------------------------------ */
/* rig                                                                */
/* ------------------------------------------------------------------ */
const cfg = await import(pathToFileURL(path.join(here, "rigs.mjs")).href);
const RIGS = cfg.RIGS;

function pick(arr, i, dflt = 0) {
  if (arr === undefined || arr === null) return dflt;
  if (typeof arr === "number") return arr;
  const v = arr[i];
  return v === undefined ? dflt : v;
}

function bodyMatrix(rig, i) {
  const b = rig.body || {};
  const p = b.pivot || [100, 192];
  let m = mul([1, 0, 0, 1, pick(b.dx, i, 0), pick(b.dy, i, 0)], about(p, pick(b.rot, i, 0)));
  m = mul(m, mul([1, 0, 0, 1, p[0], p[1]], mul([pick(b.sx, i, 1), 0, 0, pick(b.sy, i, 1), 0, 0], [1, 0, 0, 1, -p[0], -p[1]])));
  return m;
}

/* ------------------------------------------------------------------ */
/* frame renderer                                                      */
/* ------------------------------------------------------------------ */
function renderFrame(doc, rig, i, prefix) {
  const items = doc.items;
  const T = bodyMatrix(rig, i);
  const limbAt = new Map(); // element index -> {limb, first}
  const partAt = new Map();
  const statics = new Set(rig.statics || []);
  const skip = new Set();
  const handDelta = [];

  (rig.limbs || []).forEach((limb) => {
    limb.el.forEach((e, k) => limbAt.set(e, { limb, first: k === 0 }));
  });
  (rig.parts || []).forEach((part) => part.el.forEach((e) => partAt.set(e, part)));

  const out = [];
  let run = null;
  const push = (key, filter, matrix, str) => {
    if (run && run.key === key) {
      run.str += str;
      return;
    }
    if (run) out.push(run);
    run = { key, filter, matrix, str };
  };
  const flush = () => {
    if (run) out.push(run);
    run = null;
  };
  const pathTag = (el, d, dropTransform) => {
    const a = { ...el.attrs };
    delete a.transform;
    if (d !== null) a.d = d;
    if (!dropTransform && el.attrs.transform) a.transform = el.attrs.transform;
    return `<${el.tag} ${Object.entries(a)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ")}/>`;
  };

  items.forEach((el, idx) => {
    if (skip.has(idx)) return;

    /* ---------- limb ---------- */
    if (limbAt.has(idx) && limbAt.get(idx).first) {
      const limb = limbAt.get(idx).limb;
      const idxs = limb.el;
      limb.el.forEach((e) => skip.add(e));
      flush();
      const f = el.filter ? ` filter="url(#${prefix}-${el.filter})"` : "";
      const g = pathEnds(el.d);
      const kind = limb.type || "ik";
      let groupM;
      let d = null;
      if (kind === "rot") {
        const ang = pick(limb.angles, i, 0);
        const R = about(g.start, ang); // rotate in the element's parent space
        groupM = mul(mul(T, el.anc), R);
        const before = apply(T, apply(el.base, g.end));
        const after = apply(T, apply(mul(el.anc, R), g.end));
        handDelta[rig.limbs.indexOf(limb)] = sub(after, before);
      } else {
        // IK: rewrite the geometry in absolute art space, keep the far end planted
        const S = apply(T, apply(el.base, g.start));
        const E = apply(el.base, g.end);
        const off = limb.targets ? limb.targets[i] || [0, 0] : [0, 0];
        const tgt = [E[0] + off[0], E[1] + off[1]];
        const L = Math.hypot(E[0] - apply(el.base, g.start)[0], E[1] - apply(el.base, g.start)[1]);
        const dx = tgt[0] - S[0];
        const dy = tgt[1] - S[1];
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist > L * 0.985 || !limb.bend) {
          d = `M ${num(S[0])} ${num(S[1])} L ${num(tgt[0])} ${num(tgt[1])}`;
        } else {
          const h = Math.sqrt(Math.max(0, (L / 2) ** 2 - (dist / 2) ** 2));
          let nx = -dy / dist;
          let ny = dx / dist;
          const c = rig.center || [100, 130];
          const mid = [(S[0] + tgt[0]) / 2, (S[1] + tgt[1]) / 2];
          let sign = (c[0] - mid[0]) * nx + (c[1] - mid[1]) * ny > 0 ? -1 : 1;
          if (limb.bendSign) sign = limb.bendSign;
          const k = limb.bend === true ? 1 : limb.bend;
          d = `M ${num(S[0])} ${num(S[1])} Q ${num(mid[0] + nx * h * k * sign)} ${num(mid[1] + ny * h * k * sign)} ${num(tgt[0])} ${num(tgt[1])}`;
        }
        groupM = null;
        handDelta[rig.limbs.indexOf(limb)] = sub(tgt, apply(T, E));
      }
      const gm = groupM ? matAttr(groupM) : "";
      const gt = gm ? ` transform="${gm}"` : "";
      const str = idxs.map((e) => pathTag(items[e], d, kind === "ik")).join("");
      push("limb" + idx, el.filter, "", `<g${f}${gt}>${str}</g>`);
      return;
    }

    /* ---------- frozen scenery ---------- */
    if (statics.has(idx)) {
      const g = matAttr(el.base);
      push(`st|${el.filter}|${g}`, el.filter, g, pathTag(el, null, true));
      return;
    }

    /* ---------- prop / particle ---------- */
    const part = partAt.get(idx);
    if (part) {
      part.el.forEach((e) => skip.add(e));
      flush();
      const pv = part.pivot || [100, 130];
      let pm = idM();
      const tr = part.translate ? part.translate[i] : null;
      if (tr) pm = mul([1, 0, 0, 1, tr[0], tr[1]], pm);
      const ang = pick(part.rotate, i, 0);
      if (ang) pm = mul(pm, about(pv, ang));
      const sx = part.sx ? pick(part.sx, i, 1) : pick(part.scale, i, 1);
      const sy = part.sy ? pick(part.sy, i, 1) : pick(part.scale, i, 1);
      if (sx !== 1 || sy !== 1)
        pm = mul(pm, mul([1, 0, 0, 1, pv[0], pv[1]], mul([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -pv[0], -pv[1]])));
      if (part.follow !== undefined) {
        const ids = [].concat(part.follow);
        const dd = ids.reduce(
          (acc, id) => {
            const h = handDelta[id] || [0, 0];
            return [acc[0] + h[0], acc[1] + h[1]];
          },
          [0, 0]
        );
        const k = (part.followScale ?? 1) / ids.length;
        pm = mul([1, 0, 0, 1, dd[0] * k, dd[1] * k], pm);
      }
      const groupM = matAttr(mul(pm, T));
      const opacity = part.opacity ? pick(part.opacity, i, 1) : null;
      const byFilter = new Map();
      for (const e of part.el) {
        const el2 = items[e];
        const own = matAttr(el2.base);
        const a = { ...el2.attrs };
        delete a.transform;
        if (own) a.transform = own;
        const str = `<${el2.tag} ${Object.entries(a)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}/>`;
        if (!byFilter.has(el2.filter)) byFilter.set(el2.filter, "");
        byFilter.set(el2.filter, byFilter.get(el2.filter) + str);
      }
      for (const [filter, str] of byFilter) {
        const o = opacity !== null ? ` opacity="${opacity}"` : "";
        const f = filter ? ` filter="url(#${prefix}-${filter})"` : "";
        push(`pt|${idx}|${filter}`, "", "", `<g${f}${o}${groupM ? ` transform="${groupM}"` : ""}>${str}</g>`);
      }
      return;
    }

    const groupM = T;
    const gm = matAttr(groupM);
    const own = matAttr(el.base);
    const a = { ...el.attrs };
    delete a.transform;
    if (own) a.transform = own;
    const key = `ch|${el.filter}|${gm}`;
    push(key, el.filter, gm, `<${el.tag} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`);
  });
  flush();

  return out
    .map((r) => {
      const f = r.filter ? ` filter="url(#${prefix}-${r.filter})"` : "";
      const g = r.matrix ? ` transform="${r.matrix}"` : "";
      return `<g${f}${g}>${r.str}</g>`;
    })
    .join("\n");
}

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
