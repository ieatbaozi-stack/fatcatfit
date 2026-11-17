// ส่วนคำนวณเฟรมของแมวขยับจริง (rig → เนื้อ SVG ต่อเฟรม) — Node ล้วน ไม่มีผลข้างเคียง ไม่ต้องใช้ Chrome
// ใช้ร่วมกันโดย:
//   scripts/sprites/build.mjs   → แผ่น sprite PNG/SVG (assets/stickers/motion/) จาก SVG สีจริง
//   scripts/cat-source.mjs      → ข้อมูลเฟรมของ component <Cat> (currentColor + CSS variable)
//
// ภาพต้นทางต้องมีโครงเดียวกับ assets/stickers/svg/<ชุดสี>/NN-name.svg:
//   <svg ...><defs>ตัวกรองเส้นสั่น</defs> เนื้อภาพ </svg>
// rig (scripts/sprites/rigs.mjs) อ้าง element ตามลำดับวาด (path / circle / ellipse) ในเนื้อภาพ
//
// options ของ frameLayout / renderFrame
//   fixFilters: false (ค่าเริ่มต้น) = ผลเหมือน build.mjs เดิมทุกไบต์
//   fixFilters: true  = แก้ปัญหาตัวกรองเส้นสั่นของชิ้นที่ถูกแยกออกมา (แขน ขา หาง ของประกอบ):
//     - ไม่ใส่ตัวกรองซ้อนสองชั้นที่แขน/ขา
//     - ใส่ <rect fill="none"> ขนาดเท่ากรอบของกลุ่มเดิมในภาพนิ่ง ให้พื้นที่ตัวกรองไม่หดตามชิ้นที่เล็กลง
//       (ไม่งั้นเส้นขอบแขนขาถูกตัดเหลือแท่งบาง) → เฟรมที่ไม่ขยับจึงเหมือนภาพนิ่งเดิม
//     - แยกกลุ่มตามกลุ่มตัวกรองเดิม และวางของที่ตรึงไว้ (พื้น บาร์) ในพิกัดเดียวกับภาพนิ่ง

export const NFRAMES = 5;

/* ------------------------------------------------------------------ */
/* tiny 2x3 matrix helpers                                             */
/* ------------------------------------------------------------------ */
export const idM = () => [1, 0, 0, 1, 0, 0];
export const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
export const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const rotM = (deg) => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const num = (v) => (Math.abs(v) < 1e-6 ? 0 : +v.toFixed(3));
export const matAttr = (m) =>
  m.every((v, i) => num(v) === [1, 0, 0, 1, 0, 0][i]) ? "" : `matrix(${m.map(num).join(" ")})`;
const about = (p, deg) => mul(mul([1, 0, 0, 1, p[0], p[1]], rotM(deg)), [1, 0, 0, 1, -p[0], -p[1]]);
const inv = (m) => {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};

export function parseTransform(str) {
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
/* path walker (handles relative commands)                             */
/* ------------------------------------------------------------------ */
// เดินตาม path แล้วเรียก seg(kind, points) ทุกช่วง (พิกัดจริง) — ใช้หาปลายเส้นและกรอบ
function walkPath(d, seg) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;
  let prev = "";
  let lastCtl = null; // control point ก่อนหน้า สำหรับ S/T
  const nums = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) out.push(Number(toks[i++]));
    return out;
  };
  while (i < toks.length) {
    let cmd = toks[i];
    if (/[a-zA-Z]/.test(cmd)) i++;
    else cmd = prev === "M" ? "L" : prev === "m" ? "l" : prev; // implicit repeat
    prev = cmd;
    const rel = cmd === cmd.toLowerCase();
    const P = (x, y) => [rel ? cx + x : x, rel ? cy + y : y];
    const from = [cx, cy];
    const up = cmd.toUpperCase();
    let ctl = null;
    switch (up) {
      case "M": {
        const [x, y] = nums(2);
        [cx, cy] = P(x, y);
        sx = cx;
        sy = cy;
        seg("M", [[cx, cy]]);
        break;
      }
      case "L": {
        const [x, y] = nums(2);
        [cx, cy] = P(x, y);
        seg("L", [from, [cx, cy]]);
        break;
      }
      case "H": {
        const [x] = nums(1);
        cx = rel ? cx + x : x;
        seg("L", [from, [cx, cy]]);
        break;
      }
      case "V": {
        const [y] = nums(1);
        cy = rel ? cy + y : y;
        seg("L", [from, [cx, cy]]);
        break;
      }
      case "C": {
        const v = nums(6);
        const c1 = P(v[0], v[1]);
        const c2 = P(v[2], v[3]);
        [cx, cy] = P(v[4], v[5]);
        seg("C", [from, c1, c2, [cx, cy]]);
        ctl = { k: "C", p: c2 };
        break;
      }
      case "S": {
        const v = nums(4);
        const c1 = lastCtl && lastCtl.k === "C" ? [2 * from[0] - lastCtl.p[0], 2 * from[1] - lastCtl.p[1]] : from;
        const c2 = P(v[0], v[1]);
        [cx, cy] = P(v[2], v[3]);
        seg("C", [from, c1, c2, [cx, cy]]);
        ctl = { k: "C", p: c2 };
        break;
      }
      case "Q": {
        const v = nums(4);
        const c = P(v[0], v[1]);
        [cx, cy] = P(v[2], v[3]);
        seg("Q", [from, c, [cx, cy]]);
        ctl = { k: "Q", p: c };
        break;
      }
      case "T": {
        const [x, y] = nums(2);
        const c = lastCtl && lastCtl.k === "Q" ? [2 * from[0] - lastCtl.p[0], 2 * from[1] - lastCtl.p[1]] : from;
        [cx, cy] = P(x, y);
        seg("Q", [from, c, [cx, cy]]);
        ctl = { k: "Q", p: c };
        break;
      }
      case "A": {
        const v = nums(7);
        [cx, cy] = P(v[5], v[6]);
        seg("A", [from, [cx, cy]]);
        break;
      }
      case "Z": {
        cx = sx;
        cy = sy;
        seg("L", [from, [cx, cy]]);
        break;
      }
      default:
        i++;
    }
    lastCtl = ctl;
  }
  return { start: [sx, sy], end: [cx, cy] };
}

export function pathEnds(d) {
  return walkPath(d, () => {});
}

/* ------------------------------------------------------------------ */
/* bounding boxes — แบบเดียวกับที่เบราว์เซอร์ใช้คิดพื้นที่ตัวกรอง (objectBoundingBox) */
/* ------------------------------------------------------------------ */
const EMPTY = () => [Infinity, Infinity, -Infinity, -Infinity];
const addPt = (b, p) => {
  b[0] = Math.min(b[0], p[0]);
  b[1] = Math.min(b[1], p[1]);
  b[2] = Math.max(b[2], p[0]);
  b[3] = Math.max(b[3], p[1]);
};
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const isEmpty = (b) => !(b[0] <= b[2] && b[1] <= b[3]);
export const mapRect = (m, b) => {
  if (isEmpty(b)) return b;
  const out = EMPTY();
  for (const p of [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[0], b[3]],
    [b[2], b[3]],
  ])
    addPt(out, apply(m, p));
  return out;
};
// ค่า t ใน (0,1) ที่อนุพันธ์ของเส้นโค้งเป็นศูนย์ (ต่อแกน)
const quadRoots = (p0, p1, p2) => {
  const den = p0 - 2 * p1 + p2;
  return Math.abs(den) < 1e-12 ? [] : [(p0 - p1) / den];
};
const cubicRoots = (p0, p1, p2, p3) => {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-b + s) / (2 * a), (-b - s) / (2 * a)];
};
const bez = (pts, t) => {
  let p = pts.map((q) => q.slice());
  while (p.length > 1) p = p.slice(1).map((q, k) => [p[k][0] + (q[0] - p[k][0]) * t, p[k][1] + (q[1] - p[k][1]) * t]);
  return p[0];
};

export function pathBBox(d) {
  const b = EMPTY();
  walkPath(d, (kind, pts) => {
    for (const p of [pts[0], pts[pts.length - 1]]) addPt(b, p);
    if (kind === "Q" || kind === "C") {
      for (const ax of [0, 1]) {
        const c = pts.map((p) => p[ax]);
        const ts = kind === "Q" ? quadRoots(...c) : cubicRoots(...c);
        for (const t of ts) if (t > 0 && t < 1) addPt(b, bez(pts, t));
      }
    }
    if (kind === "A") throw new Error("pathBBox: ยังไม่รองรับคำสั่ง A (arc)");
  });
  return b;
}

function elementBBox(tag, a) {
  const n = (k) => parseFloat(a[k] || "0");
  if (tag === "path") return pathBBox(a.d || "");
  if (tag === "circle") return [n("cx") - n("r"), n("cy") - n("r"), n("cx") + n("r"), n("cy") + n("r")];
  if (tag === "ellipse") return [n("cx") - n("rx"), n("cy") - n("ry"), n("cx") + n("rx"), n("cy") + n("ry")];
  if (tag === "rect") return [n("x"), n("y"), n("x") + n("width"), n("y") + n("height")];
  if (tag === "line") return [Math.min(n("x1"), n("x2")), Math.min(n("y1"), n("y2")), Math.max(n("x1"), n("x2")), Math.max(n("y1"), n("y2"))];
  throw new Error(`elementBBox: ไม่รู้จัก <${tag}>`);
}

/* ------------------------------------------------------------------ */
/* minimal SVG reader                                                  */
/* ------------------------------------------------------------------ */
// items[k]  = element ลำดับที่ k ตามลำดับวาด (index ที่ rigs.mjs อ้าง)
// fgs[g]    = กลุ่มตัวกรองที่ g ในภาพนิ่ง: box = กรอบในพิกัดของกลุ่ม · above = เมทริกซ์จากพิกัดกลุ่มไปพิกัดภาพ
//             (ใช้กับ fixFilters — item.fg บอกว่า element อยู่กลุ่มไหน, -1 = ไม่มีตัวกรอง)
export function parseSVG(src) {
  const defs = (src.match(/<defs>[\s\S]*?<\/defs>/) || [""])[0];
  const body = src.slice(src.indexOf("</defs>") + 7);
  const items = [];
  const stack = [];
  const groups = []; // กลุ่มที่มี filter: { box (พิกัดของกลุ่ม), above (เมทริกซ์จากกลุ่มไปพิกัดภาพ) }
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
      if (!selfClose) {
        const entry = { transform: attrs.transform || "", filter: attrs.filter || "", fg: -1 };
        if (entry.filter) {
          entry.fg = groups.length;
          const above = [...stack, entry].reduce((acc, s) => mul(acc, parseTransform(s.transform)), idM());
          groups.push({ box: EMPTY(), above });
        }
        stack.push(entry);
      }
      continue;
    }
    if (tag === "defs" || tag === "clipPath" || tag === "linearGradient" || tag === "radialGradient") continue;
    const tfs = stack.map((s) => s.transform).filter(Boolean);
    const filt = [...stack].reverse().map((s) => s.filter).find(Boolean) || "";
    const anc = tfs.reduce((acc, t) => mul(acc, parseTransform(t)), idM());
    const own = parseTransform(attrs.transform || "");
    // กรอบของ element ในพิกัดของกลุ่มตัวกรองที่ครอบอยู่ (map ทีละชั้นแบบเบราว์เซอร์)
    let fg = -1;
    for (let k = stack.length - 1; k >= 0; k--)
      if (stack[k].fg >= 0) {
        fg = stack[k].fg;
        let box = mapRect(own, elementBBox(tag, attrs));
        for (let j = stack.length - 1; j > k; j--) box = mapRect(parseTransform(stack[j].transform), box);
        groups[fg].box = union(groups[fg].box, box);
        break;
      }
    items.push({
      tag,
      attrs,
      d: attrs.d || "",
      filter: filt.replace(/url\(#|\)/g, ""),
      fg,
      anc, // ancestor transforms only
      base: mul(anc, own), // ancestor + own
      ownM: own,
      sw: parseFloat(attrs["stroke-width"] || "0"),
    });
  }
  return { defs, items, fgs: groups };
}

/* ------------------------------------------------------------------ */
/* rig                                                                */
/* ------------------------------------------------------------------ */
function pick(arr, i, dflt = 0) {
  if (arr === undefined || arr === null) return dflt;
  if (typeof arr === "number") return arr;
  const v = arr[i];
  return v === undefined ? dflt : v;
}

export function bodyMatrix(rig, i) {
  const b = rig.body || {};
  const p = b.pivot || [100, 192];
  let m = mul([1, 0, 0, 1, pick(b.dx, i, 0), pick(b.dy, i, 0)], about(p, pick(b.rot, i, 0)));
  m = mul(m, mul([1, 0, 0, 1, p[0], p[1]], mul([pick(b.sx, i, 1), 0, 0, pick(b.sy, i, 1), 0, 0], [1, 0, 0, 1, -p[0], -p[1]])));
  return m;
}

/* ------------------------------------------------------------------ */
/* frame layout                                                        */
/* ------------------------------------------------------------------ */
// ผลของเฟรมเป็นโครงสร้าง (ไม่ใช่ string) เพื่อให้ component เก็บ "ตัวร่วม + ส่วนต่างต่อเฟรม" ได้
//   run   = { filter, matrix, kids }               → <g filter transform>kids</g>
//   kid   = { el, d, tf }                          → element ที่ el ของ items (d / transform ใหม่ถ้ามี)
//         | { group: { filter, opacity, transform, kids } }
//         | { rect: [x0, y0, x1, y1] }             → กรอบล่องหน (เฉพาะ fixFilters)
export function frameLayout(doc, rig, i, opts = {}) {
  const fix = !!opts.fixFilters;
  const items = doc.items;
  const T = bodyMatrix(rig, i);
  const limbAt = new Map(); // element index -> {limb, first}
  const partAt = new Map();
  const statics = new Set(rig.statics || []);
  const skip = new Set();
  const handDelta = [];
  // fixFilters: กรอบของกลุ่มตัวกรองเดิม (m = เมทริกซ์จากพิกัดกลุ่มไปพิกัดของกลุ่มที่ใส่ <rect>)
  const fgOf = (el) => (el.filter && el.fg >= 0 ? doc.fgs[el.fg] : null);
  const above = (el) => (fgOf(el) ? fgOf(el).above : idM());
  const region = (el, m = idM()) => {
    const g = fgOf(el);
    return g && !isEmpty(g.box) ? [{ rect: mapRect(m, g.box) }] : [];
  };

  (rig.limbs || []).forEach((limb) => {
    limb.el.forEach((e, k) => limbAt.set(e, { limb, first: k === 0 }));
  });
  (rig.parts || []).forEach((part) => part.el.forEach((e) => partAt.set(e, part)));

  const out = [];
  let run = null;
  const push = (key, filter, matrix, kids) => {
    if (run && run.key === key) {
      run.kids.push(...kids);
      return;
    }
    if (run) out.push(run);
    run = { key, filter, matrix, kids: [...kids] };
  };
  const flush = () => {
    if (run) out.push(run);
    run = null;
  };

  items.forEach((el, idx) => {
    if (skip.has(idx)) return;

    /* ---------- limb ---------- */
    if (limbAt.has(idx) && limbAt.get(idx).first) {
      const limb = limbAt.get(idx).limb;
      const idxs = limb.el;
      limb.el.forEach((e) => skip.add(e));
      flush();
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
      const kids = idxs.map((e) => ({ el: e, d, tf: kind !== "ik" && items[e].attrs.transform ? items[e].attrs.transform : null }));
      const box = fix ? region(el, kind === "ik" ? mul(T, above(el)) : mul(inv(el.anc), above(el))) : [];
      push("limb" + idx, fix ? "" : el.filter, "", [
        { group: { filter: el.filter, opacity: null, transform: gm, kids: [...box, ...kids] } },
      ]);
      return;
    }

    /* ---------- frozen scenery ---------- */
    if (statics.has(idx)) {
      const g = matAttr(el.base);
      if (fix) {
        // ตรึงไว้ในพิกัดของกลุ่มเดิม → เส้นสั่นเหมือนภาพนิ่ง
        const key = `st|${el.filter}|${el.fg}`;
        const box = run && run.key === key ? [] : region(el);
        push(key, el.filter, matAttr(above(el)), [...box, { el: idx, d: null, tf: matAttr(mul(inv(above(el)), el.base)) || null }]);
      } else push(`st|${el.filter}|${g}`, el.filter, g, [{ el: idx, d: null, tf: null }]);
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
        const key = fix ? `${el2.filter}|${el2.fg}` : el2.filter;
        if (!byFilter.has(key)) byFilter.set(key, { filter: el2.filter, kids: fix ? region(el2, above(el2)) : [] });
        byFilter.get(key).kids.push({ el: e, d: null, tf: matAttr(el2.base) || null });
      }
      for (const [key, { filter, kids }] of byFilter) {
        push(`pt|${idx}|${key}`, "", "", [{ group: { filter, opacity, transform: groupM, kids } }]);
      }
      return;
    }

    if (fix) {
      // กลุ่มตัวกรองอยู่ในพิกัดเดิมของกลุ่ม (T·above) → เฟรมที่ตัวไม่ขยับได้เส้นสั่นเหมือนภาพนิ่งทุกจุด
      const A = above(el);
      const gm = matAttr(mul(T, A));
      const key = `ch|${el.filter}|${gm}|${el.fg}`;
      const box = run && run.key === key ? [] : region(el);
      push(key, el.filter, gm, [...box, { el: idx, d: null, tf: matAttr(mul(inv(A), el.base)) || null }]);
      return;
    }
    const gm = matAttr(T);
    const own = matAttr(el.base);
    push(`ch|${el.filter}|${gm}`, el.filter, gm, [{ el: idx, d: null, tf: own || null }]);
  });
  flush();
  return out.map(({ filter, matrix, kids }) => ({ filter, matrix, kids }));
}

/* ------------------------------------------------------------------ */
/* serialize (ผลเหมือน build.mjs เดิมทุกไบต์เมื่อ fixFilters = false)       */
/* ------------------------------------------------------------------ */
export function elementTag(el, d, tf) {
  const a = { ...el.attrs };
  delete a.transform;
  if (d !== null && d !== undefined) a.d = d;
  if (tf) a.transform = tf;
  return `<${el.tag} ${Object.entries(a)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ")}/>`;
}

export const rectTag = (r) =>
  `<rect x="${num(r[0])}" y="${num(r[1])}" width="${num(r[2] - r[0])}" height="${num(r[3] - r[1])}" fill="none"/>`;

export function serializeLayout(doc, runs, prefix) {
  const f = (filter) => (filter ? ` filter="url(#${prefix}-${filter})"` : "");
  const kid = (k) => {
    if (k.rect) return rectTag(k.rect);
    if (k.group) {
      const g = k.group;
      const o = g.opacity !== null ? ` opacity="${g.opacity}"` : "";
      return `<g${f(g.filter)}${o}${g.transform ? ` transform="${g.transform}"` : ""}>${g.kids.map(kid).join("")}</g>`;
    }
    return elementTag(doc.items[k.el], k.d, k.tf);
  };
  return runs.map((r) => `<g${f(r.filter)}${r.matrix ? ` transform="${r.matrix}"` : ""}>${r.kids.map(kid).join("")}</g>`).join("\n");
}

export function renderFrame(doc, rig, i, prefix, opts) {
  return serializeLayout(doc, frameLayout(doc, rig, i, opts), prefix);
}
