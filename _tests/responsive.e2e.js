// Responsive audit: every page at phone / tablet / desktop sizes — no sideways scroll, nothing sticking out, tap targets big enough.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-resp/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'roy.dj@gmail.com';
const REG = fs.readFileSync('/home/user/system.snapbox/vendors/registry.js', 'utf8');   // the real registry
const errors = [], sent = [];
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099 }; });
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    const m = u.match(/gstatic\.com\/firebasejs\/([\d.]+)\/(firebase-(app|auth|firestore)\.js)$/);
    const H = { 'Access-Control-Allow-Origin': '*' };
    if (m && m[1] !== FBV) return route.fulfill({ body: `export * from 'https://www.gstatic.com/firebasejs/${FBV}/${m[2]}';`, contentType: 'application/javascript', headers: H });
    if (m) return route.fulfill({ body: fs.readFileSync(FB + m[2]), contentType: 'application/javascript', headers: H });
    if (u.endsWith('html2canvas.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'html2canvas/dist/html2canvas.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('jspdf.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'jspdf/dist/jspdf.umd.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('chart.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'chart.js/dist/chart.umd.js'), contentType: 'application/javascript' });
    if (u.includes('/vendors/registry.js')) return route.fulfill({ body: REG, contentType: 'application/javascript' });
    if (u.startsWith('https://arial13579.github.io/hatzaa/')) {
      const rel = decodeURIComponent(new URL(u).pathname.replace('/hatzaa/', '')) || 'index.html';
      let f = path.join('/home/user/hatzaa', rel); if (f.endsWith('/')) f += 'index.html';
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
    }
    if (u.includes('ipify')) return route.fulfill({ body: '{"ip":"1.2.3.4"}', contentType: 'application/json' });
    if (u.includes('tmpfiles')) return route.fulfill({ body: '{"data":{"url":"https://tmpfiles.org/1/x.pdf"}}', contentType: 'application/json' });
    if (u.includes('formsubmit')) { sent.push(u); return route.fulfill({ body: 'ok', contentType: 'text/html' }); }
    if (u.includes('nominatim')) return route.fulfill({ body: '[{"lat":"31.252","lon":"34.791","display_name":"באר שבע, מחוז הדרום"}]', contentType: 'application/json' });
    if (u.includes('osrm')) return route.fulfill({ body: '{"routes":[{"distance":112400}]}', contentType: 'application/json' });
    if (u.startsWith(SITE) || u.includes('127.0.0.1')) return route.continue();
    if (u.includes('fonts.g')) return route.fulfill({ body: '', contentType: 'text/css' });
    return route.abort();
  });
}
async function newPage(b, name){
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', acceptDownloads: true });
  await setup(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|ERR_FAILED|net::|favicon|Could not reach Cloud Firestore backend/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  p.on('dialog', d => d.accept());
  return { ctx, p };
}
async function login(p, email){
  await p.goto(SYS + '/vendors/');
  await p.waitForFunction(() => window.__fb);
  await p.evaluate(e => __fb.authMod.signInWithCredential(__fb.auth, __fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + e, email: e, email_verified: true }))), email);
}
async function axe(p, label){
  await p.waitForTimeout(800);
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')));
  check(!r.length, `axe WCAG AA clean: ${label}` + (r.length ? '\n      ' + r.join('\n      ') : ''));
}
const emu = async (method, p, body) => {
  const r = await fetch(EMU + p, { method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const str = v => ({ stringValue: v }), int = v => ({ integerValue: String(v) });
const val = f => f && (f.stringValue !== undefined ? f.stringValue : f.integerValue !== undefined ? Number(f.integerValue) : f.doubleValue !== undefined ? f.doubleValue : f.mapValue ? f.mapValue.fields : f);

async function draw(p){
  await p.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const bb = await p.locator('#sig-canvas').boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + 60); await p.mouse.down();
  for (let i = 0; i < 28; i++) await p.mouse.move(bb.x + 40 + i * 9, bb.y + 60 - Math.sin(i / 3) * 30);
  await p.mouse.up();
}

const VIEWS = [[320, 640], [360, 740], [390, 844], [430, 932], [844, 390], [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1440, 900]];
const SHOT_AT = new Set(['390x844', '768x1024', '1280x800']);
const issues = [];
// מה חורג מהמסך (לא בתוך אזור גלילה כמו טבלה), וכפתורים קטנים מדי ללחיצה
async function audit(p, name){
  const r = await p.evaluate(() => {
    const W = innerWidth, out = [], small = [];
    const inScroller = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
    const visible = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const sel = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    document.querySelectorAll('body *').forEach(el => {
      if (!visible(el) || el.closest('#a11y-panel, .a11y-panel, [aria-hidden="true"], dialog:not([open])')) return;
      const b = el.getBoundingClientRect();
      if ((b.right > W + 1 || b.left < -1) && !inScroller(el) && getComputedStyle(el).position !== 'fixed') out.push(sel(el) + ` [${Math.round(b.left)}..${Math.round(b.right)}]`);
      if (el.matches('button, a.btn, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select') && !el.closest('.hp') && (b.height < 30 || b.width < 30)) small.push(sel(el) + ` ${Math.round(b.width)}x${Math.round(b.height)}`);
    });
    return { sw: document.documentElement.scrollWidth, W, out: [...new Set(out)].slice(0, 6), small: [...new Set(small)].slice(0, 6) };
  });
  const ok = r.sw <= r.W + 1 && !r.out.length;
  if (!ok) issues.push(`${name}: scrollWidth ${r.sw} > ${r.W} · ${r.out.join(' | ')}`);
  if (r.small.length) issues.push(`${name}: small tap targets · ${r.small.join(' | ')}`);
  return ok && !r.small.length;
}
async function sweep(p, name, prep){
  let bad = 0;
  for (const [w, h] of VIEWS) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(250);
    if (prep) await prep();
    if (!(await audit(p, `${name} @${w}x${h}`))) bad++;
    if (SHOT_AT.has(w + 'x' + h)) await p.screenshot({ path: SHOTS + name.replace(/[^\w-]+/g, '_') + `_${w}.png`, fullPage: true });
  }
  check(!bad, `${name}: fits every screen size` + (bad ? ` (${bad} sizes with problems)` : ''));
}
const b64 = s => Buffer.from(s).toString('base64url');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
  const W = await newPage(b, 'public');
  const shut = async p => { if (await p.isVisible('#cookie-yes, #cookie-ok').catch(() => false)) await p.click('#cookie-yes, #cookie-ok').catch(() => {}); };

  console.log('1. Public pages');
  await W.p.goto(SITE + '/system/'); await W.p.waitForTimeout(600); await shut(W.p);
  await sweep(W.p, 'sales site');
  // כפתור הוואטסאפ בכותרת: בטלפון צר — עיגול עם אייקון בלבד
  for (const w of [320, 360, 390]) {
    await W.p.setViewportSize({ width: w, height: 800 }); await W.p.waitForTimeout(150);
    const bb = await W.p.locator('header .btn.wa').boundingBox();
    check(bb && Math.abs(bb.width - bb.height) <= 2, `@${w}px: header WhatsApp button is a circle (${bb && Math.round(bb.width)}x${bb && Math.round(bb.height)})`);
  }
  await W.p.setViewportSize({ width: 1280, height: 800 });
  check((await W.p.locator('header .btn.wa').boundingBox()).width > 80, '@1280px: header WhatsApp button with text');
  for (const d of ['terms', 'privacy', 'accessibility']) { await W.p.goto(SITE + '/system/legal/' + d + '.html'); await W.p.waitForTimeout(300); await shut(W.p); await sweep(W.p, 'legal ' + d); }
  await W.p.goto(SYS + '/vendors/'); await W.p.waitForSelector('#signin:not([disabled])'); await shut(W.p); await sweep(W.p, 'login');
  await W.p.goto(SYS + '/vendors/trial.html'); await W.p.waitForSelector('#signin:not([disabled])'); await sweep(W.p, 'signup intro');
  await W.p.goto(SYS + '/vendors/check.html'); await W.p.waitForTimeout(1500); await sweep(W.p, 'check page');
  const offerQ = b64(['respoffer1', 'עסק לדוגמה עם שם ארוך במיוחד', 'ישראל ישראלי', 'DJ לאירועים', 'launch', 1499, 2, 3, 89, 100, 1666, 'הערה ארוכה '.repeat(8), 14, new Date().toISOString().slice(0, 10), '050-1234567', 1499, 'test@gmail.com', 500, 'עונה ומרחק'].join('|'));
  await W.p.goto(SYS + '/offer/?q=' + offerQ); await W.p.waitForSelector('#sig-canvas, .card', { timeout: 15000 }); await W.p.waitForTimeout(600); await shut(W.p);
  await sweep(W.p, 'offer page');

  console.log('2. Customer side (hatzaa)');
  await W.p.goto(SITE + '/system/'); const demo = (await W.p.getAttribute('#demo-link', 'href')).replace('https://arial13579.github.io', SITE);
  await W.p.goto(demo); await W.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await W.p.waitForTimeout(500); await shut(W.p);
  await sweep(W.p, 'customer quote');
  await W.p.goto(SITE + '/hatzaa/legal/refunds.html?t=demo'); await W.p.waitForSelector('section.card'); await sweep(W.p, 'customer legal');

  console.log('3. Signup form (all 4 steps)');
  const T = await newPage(b, 'signup');
  await T.p.goto(SYS + '/vendors/trial.html'); await T.p.waitForFunction(() => window.__fb);
  await T.p.evaluate(e => __fb.authMod.signInWithCredential(__fb.auth, __fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + e, email: e, email_verified: true }))), 'resp.new@gmail.com');
  await T.p.waitForSelector('#s-form:not(.hidden)', { timeout: 15000 }); await shut(T.p);
  for (const st of [1, 2, 3, 4]) await sweep(T.p, 'signup step ' + st, () => T.p.evaluate(n => document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', +p.dataset.step !== n)), st));

  console.log('4. Owner: admin panel, vendor account, dialogs');
  const O = await newPage(b, 'owner');
  await login(O.p, OWNER); await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector('#tbody button.edit', { timeout: 30000 }); await shut(O.p);
  await sweep(O.p, 'admin vendors');
  await O.p.click('.admin-tabs button[data-tab=offer]'); await sweep(O.p, 'admin new offer');
  await O.p.click('.admin-tabs button[data-tab=offers]'); await sweep(O.p, 'admin sent offers');
  await O.p.click('.admin-tabs button[data-tab=vendors]');
  await O.p.click('#tbody button.edit[data-id=snapiiii]'); await O.p.waitForSelector('#edit-dlg[open]');
  await sweep(O.p, 'admin edit dialog'); await O.p.click('#edit-close');
  await O.p.goto(SYS + '/vendors/app.html?t=snapiiii'); await O.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await O.p.click('.tabs button[data-tab=new]').catch(() => {});
  await sweep(O.p, 'vendor app: new quote');
  await O.p.click('.tabs button[data-tab=dash]'); await O.p.waitForTimeout(800); await sweep(O.p, 'vendor app: dashboard');
  await O.p.goto(SYS + '/vendors/app.html?t=ilana'); await O.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await O.p.click('.tabs button[data-tab=new]').catch(() => {}); await O.p.click('#catalog button >> nth=0').catch(() => {});
  await sweep(O.p, 'vendor app: items mode');

  console.log('\nISSUES:\n  ' + (issues.join('\n  ') || 'none'));
  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.slice(0, 8).join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); console.error(e.stack); process.exit(2); });
