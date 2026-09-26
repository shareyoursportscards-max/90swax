/* Import card photos for a player guide.
 *
 *   node import-photos.js thomas
 *
 * Source of truth is YOUR picture library on the Desktop:
 *   Desktop\Griffey Social Posts\{player}\
 * Drop files there named the way you already name Griffey's, e.g.
 *   1999 Metal Universe Linchpins #6.png
 *
 * This script matches each filename against the sets and cards that actually
 * exist in that player's priced data, copies the image into the repo (which is
 * what GitHub Pages deploys), and writes img/cards/{player}/card-images.json.
 * Anything it can't match is reported, never guessed at.
 */
const fs = require('fs');
const path = require('path');

const PLAYER = (process.argv[2] || 'thomas').toLowerCase();
const LIB = 'C:/Users/Mclau/OneDrive/Desktop/Griffey Social Posts/' + PLAYER;
const REPO = __dirname + '/img/cards/' + PLAYER;
const DATA_DIR = 'C:/Users/Mclau/AppData/Local/Temp/claude/C--Users-Mclau/fe96cc6c-84a4-4d48-9ea2-1209573d3f04/scratchpad';
const NAMES = { thomas: 'Frank Thomas', bonds: 'Barry Bonds', jeter: 'Derek Jeter' };

const norm = s => s.toLowerCase().replace(/['’.,()]/g, '').replace(/[^a-z0-9#]+/g, ' ').trim();
const slug = s => s.toLowerCase().replace(/['’.,()#]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// PNG/JPEG intrinsic size, so you never have to type w/h by hand
function dims(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;                                              // JPEG
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: 0, h: 0 };
}

// every (year, set, card) this player actually has priced
const known = [];
for (const f of fs.readdirSync(DATA_DIR)) {
  const m = f.match(/^thomas(\d\d)\.out\.json$/);
  if (!m || PLAYER !== 'thomas') continue;
  const yr = (m[1] > '50' ? '19' : '20') + m[1];
  const D = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  for (const set of Object.keys(D))
    for (const card of Object.keys(D[set]))
      known.push({ yr, set, card, match: norm(set + ' ' + card) });
}
if (!known.length) { console.error('No priced data found for ' + PLAYER + '.'); process.exit(1); }

if (!fs.existsSync(LIB)) { console.error('No library folder: ' + LIB); process.exit(1); }
fs.mkdirSync(REPO, { recursive: true });

const manifest = {};
const unmatched = [];
let copied = 0;

for (const file of fs.readdirSync(LIB)) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const base = file.replace(/\.(png|jpe?g)$/i, '');
  const n = norm(base);
  // longest matching set+card wins, so "Base #25" never beats "Refractor #25"
  const hit = known.filter(k => n === k.match || n.startsWith(k.match) || n.includes(k.match))
                   .sort((a, b) => b.match.length - a.match.length)[0];
  if (!hit) { unmatched.push(file); continue; }

  const ext = path.extname(file).toLowerCase();
  const out = slug(hit.set + ' ' + hit.card) + '-' + PLAYER + ext;
  fs.copyFileSync(path.join(LIB, file), path.join(REPO, out));
  const d = dims(path.join(LIB, file));
  manifest[hit.yr + '|' + hit.set + '|' + hit.card] =
    { file: out, w: d.w, h: d.h, alt: hit.set + ' ' + NAMES[PLAYER] + ' card ' + hit.card };
  copied++;
}

fs.writeFileSync(path.join(REPO, 'card-images.json'), JSON.stringify(manifest, null, 1));
console.log('imported ' + copied + ' photo' + (copied === 1 ? '' : 's') + ' for ' + NAMES[PLAYER]);
if (unmatched.length) {
  console.log('\ncould not match ' + unmatched.length + ' file(s) to a priced card:');
  unmatched.forEach(f => console.log('  ' + f));
  console.log('(rename to "<year> <set> <card>" or the card may not be in the guide yet)');
}
