// Builds assets/stickers/motion/demo.html from whatever sheets are present in png/<variant>.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "stickers", "motion");
const files = fs
  .readdirSync(path.join(here, "png", "color"))
  .filter((f) => f.endsWith(".png"))
  .sort();
const names = files.map((f) => f.replace(/\.png$/, ""));
const labels = names.map((n) => n.replace(/^\d+-/, "").replace(/-/g, " "));

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Fat Cat · 5-frame sprite sheets</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --ink:#171717; --paper:#fbf6ec; --cat:#f9a03a; --line:#e6dccb; --muted:#8d8375;
    --size:176px;
  }
  *{box-sizing:border-box}
  body{
    margin:0; padding:48px clamp(20px,5vw,64px) 80px;
    background:var(--paper); color:var(--ink);
    font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  }
  header{max-width:1080px;margin:0 auto 40px}
  .kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
  .kicker b{width:26px;height:26px;border-radius:50%;background:var(--cat);display:inline-block}
  h1{font-size:clamp(30px,4.4vw,52px);line-height:1.05;letter-spacing:-.03em;margin:0 0 14px;font-weight:800}
  h1 em{font-style:normal;color:var(--cat)}
  .lede{font-size:17px;color:#4a4238;max-width:62ch;margin:0}
  .lede code{background:#fff;border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:.9em}

  .bar{max-width:1080px;margin:32px auto 0;display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center;
       padding:14px 18px;background:#fff;border:1px solid var(--line);border-radius:14px}
  .seg{display:inline-flex;background:#f4eee2;border-radius:10px;padding:3px}
  .seg button{appearance:none;border:0;background:transparent;font:inherit;font-size:13px;font-weight:600;
              padding:7px 13px;border-radius:8px;color:#6b6154;cursor:pointer}
  .seg button[aria-pressed="true"]{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .ctrl{display:flex;align-items:center;gap:9px;font-size:13px;color:#6b6154}
  input[type=range]{width:120px;accent-color:var(--cat)}
  label.chk{display:flex;align-items:center;gap:7px;font-size:13px;color:#6b6154;cursor:pointer}
  .count{margin-left:auto;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}

  .grid{max-width:1080px;margin:26px auto 0;display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px 10px 12px;transition:transform .18s ease,box-shadow .18s ease}
  .card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(60,40,10,.1)}
  .stage{border-radius:12px;display:grid;place-items:center;padding:6px;background:
    radial-gradient(circle at 50% 42%, #fffdf8, #f6efe2)}
  body[data-variant="line-white"] .stage{background:radial-gradient(circle at 50% 42%,#2a2a2a,#161616)}
  .cat{width:var(--size);height:var(--size);background-repeat:no-repeat;background-position:0 0;
       background-size:calc(var(--size) * 5) var(--size);
       animation:play var(--dur,.7s) steps(5) infinite}
  body.paused .cat{animation-play-state:paused}
  @keyframes play{from{background-position:0 0}to{background-position:calc(var(--size) * -5) 0}}
  .meta{display:flex;align-items:baseline;gap:8px;padding:9px 4px 0}
  .meta .n{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
  .meta .t{font-size:13px;font-weight:650;letter-spacing:-.01em}
  .frames{display:none;gap:3px;padding:8px 2px 0}
  body.frames .frames{display:flex}
  .frames i{--thumb:32px;flex:0 0 var(--thumb);width:var(--thumb);height:var(--thumb);background-repeat:no-repeat;
            border-radius:4px;background-color:#f7f2e8;background-size:calc(var(--thumb) * 5) var(--thumb)}
  body[data-variant="line-white"] .frames i{background-color:#1d1d1d}
  .frames i[data-f="0"]{background-position:0 0}
  .frames i[data-f="1"]{background-position:calc(var(--thumb) * -1) 0}
  .frames i[data-f="2"]{background-position:calc(var(--thumb) * -2) 0}
  .frames i[data-f="3"]{background-position:calc(var(--thumb) * -3) 0}
  .frames i[data-f="4"]{background-position:calc(var(--thumb) * -4) 0}

  footer{max-width:1080px;margin:56px auto 0;border-top:1px solid var(--line);padding-top:26px}
  footer h2{font-size:14px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:0 0 12px}
  pre{margin:0;background:#1c1a17;color:#f4ead9;border-radius:12px;padding:18px 20px;overflow:auto;font-size:13px;line-height:1.6}
  pre .c{color:#8f887c}
  pre .k{color:#f9a03a}
  pre .s{color:#a8c98a}
  p.note{font-size:13px;color:#6b6154;margin:14px 0 0}
</style>

<header>
  <div class="kicker"><b></b>stickers / motion</div>
  <h1>Five real poses, <em>not a shiver</em>.</h1>
  <p class="lede">
    Every sheet is re-posed from the hand-drawn master SVG: limbs swing, bodies squash,
    props follow the paw. Five frames per sticker at <code>512×512</code>, laid out on a
    <code>2560×512</code> strip exactly like the old <code>1536×512</code> sheets.
  </p>
</header>

<div class="bar">
  <div class="seg" role="group" aria-label="variant">
    <button data-v="color" aria-pressed="true">color</button>
    <button data-v="line" aria-pressed="false">line</button>
    <button data-v="line-white" aria-pressed="false">line-white</button>
  </div>
  <div class="ctrl">speed <input id="speed" type="range" min="40" max="160" step="10" value="100"><output id="speedv">1.0×</output></div>
  <label class="chk"><input id="showFrames" type="checkbox"> show 5 frames</label>
  <label class="chk"><input id="pause" type="checkbox"> pause</label>
  <span class="count">${names.length} stickers · 5 frames · 3 variants</span>
</div>

<main class="grid" id="grid"></main>

<footer>
  <h2>Drop-in usage</h2>
  <pre><span class="c">/* the sheet is 5 frames wide: 2560 × 512 */</span>
<span class="k">.sticker</span>{
  width: 96px; height: 96px;
  background-image: url(<span class="s">"png/color/02-side.png"</span>);
  background-size: 480px 96px;          <span class="c">/* 5 × the box */</span>
  animation: <span class="k">play</span> .7s steps(5) infinite;
}
<span class="k">@keyframes play</span>{
  from{ background-position: 0 0 }
  to  { background-position: -480px 0 }
}</pre>
  <p class="note">Swap <code>color</code> for <code>line</code> or <code>line-white</code> — the geometry and timing are identical, so all three variants animate in sync.</p>
</footer>

<script>
  const STICKERS = ${JSON.stringify(
    names.map((n, i) => ({ file: n, label: labels[i] }))
  )};

  const grid = document.getElementById('grid');
  const sizeVar = () => getComputedStyle(document.documentElement).getPropertyValue('--size').trim();

  for (const s of STICKERS) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = \`
      <div class="stage"><div class="cat" data-file="\${s.file}"></div></div>
      <div class="meta"><span class="n">\${s.file.slice(0,2)}</span><span class="t">\${s.label}</span></div>
      <div class="frames">\${[0,1,2,3,4].map(f => \`<i data-f="\${f}"></i>\`).join('')}</div>\`;
    grid.appendChild(card);
  }

  const body = document.body;
  function paint(variant) {
    body.dataset.variant = variant;
    document.querySelectorAll('.cat').forEach((el) => {
      el.style.backgroundImage = \`url("png/\${variant}/\${el.dataset.file}.png")\`;
    });
    document.querySelectorAll('.frames i').forEach((el, i) => {
      const file = el.closest('.card').querySelector('.cat').dataset.file;
      el.style.backgroundImage = \`url("png/\${variant}/\${file}.png")\`;
    });
  }

  document.querySelectorAll('.seg button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      paint(b.dataset.v);
    });
  });

  const speed = document.getElementById('speed');
  const speedv = document.getElementById('speedv');
  speed.addEventListener('input', () => {
    const mult = speed.value / 100;
    speedv.textContent = mult.toFixed(1) + '×';
    document.documentElement.style.setProperty('--dur', (0.7 / mult).toFixed(3) + 's');
  });

  document.getElementById('showFrames').addEventListener('change', (e) => body.classList.toggle('frames', e.target.checked));
  document.getElementById('pause').addEventListener('change', (e) => body.classList.toggle('paused', e.target.checked));

  paint('color');
</script>
</html>
`;

fs.writeFileSync(path.join(here, "demo.html"), html);
console.log("✓ demo.html", names.length, "stickers");
