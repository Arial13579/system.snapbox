// One active session per vendor: opening the account elsewhere disconnects the previous place (owner exempt).
// Run like full.e2e.js.
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = NM + 'firebase/', FBV = require(NM + 'firebase/package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots-session/'; fs.mkdirSync(SHOTS, { recursive: true });
const ILANA = 'snapboxevent.official@gmail.com';
const fs_size_offer = () => fs.statSync(SHOTS + 'offer-signed.pdf').size;
const REG = `window.REGISTRY = [{ slug: 'demo', name: 'עסק לדוגמה', admins: ['noa@gmail.com'] }, { slug: 'ilana', name: 'אילנה עיצוב אירועים', admins: ['${ILANA}'] }];`;
const errors = [], sent = [], a11y = [];
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
    if (u.includes('formsubmit')) { sent.push({ url: u, body: route.request().postData() || '' }); return route.fulfill({ body: 'ok', contentType: 'text/html' }); }
    if (u.includes('nominatim')) return route.fulfill({ body: '[{"lat":"31.252","lon":"34.791","display_name":"באר שבע, מחוז הדרום"}]', contentType: 'application/json' });
    if (u.includes('osrm')) return route.fulfill({ body: '{"routes":[{"distance":112400}]}', contentType: 'application/json' });
    if (u.startsWith(SITE) || u.includes('127.0.0.1')) return route.continue();
    if (u.includes('fonts.g')) return route.fulfill({ body: '', contentType: 'text/css' });
    return route.abort();
  });
}
async function newPage(b, vp, name){
  const ctx = await b.newContext({ viewport: vp, locale: 'he-IL', acceptDownloads: true });
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
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' (' + v.nodes.length + '): ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')));
  if (r.length) a11y.push(label + ':\n      ' + r.join('\n      '));
  check(!r.length, `axe WCAG AA (serious/critical) clean: ${label}` + (r.length ? ` — ${r.length} issues` : ''));
}
async function hasA11yWidget(p, label){
  await p.waitForSelector('#a11y-fab', { timeout: 5000 }).catch(() => {});
  check(await p.locator('#a11y-fab').count() === 1, `accessibility menu present: ${label}`);
}
async function authParams(p){ await p.waitForFunction(() => window.__lastAuthParams, null, { timeout: 10000 }); return p.evaluate(() => window.__lastAuthParams); }
async function draw(p){
  await p.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const bb = await p.locator('#sig-canvas').boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + 110); await p.mouse.down();
  for (let i = 0; i < 28; i++) await p.mouse.move(bb.x + 40 + i * 9, bb.y + 110 - Math.sin(i / 3) * 40);
  await p.mouse.up();
}
const REST = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const iso = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
async function setUntil(slug, v){ const r = await fetch(REST + `tenants/${slug}?updateMask.fieldPaths=supportUntil`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { supportUntil: { stringValue: v } } }) }); if (!r.ok) throw new Error(await r.text()); }
async function hasNotice(slug, v){ return (await fetch(REST + `tenants/${slug}/notices/support-${v}`, { headers: H })).ok; }
const reminders = () => sent.filter(s => s.url.includes('formsubmit.co/ajax/') && s.body.includes('תזכורת'));

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
  const MOB = { width: 390, height: 844 }, DESK = { width: 1280, height: 900 };
  const open = async (P) => { await P.waitForURL(/app\.html\?t=ilana/, { timeout: 15000 });
    await P.waitForSelector('#consent:not(.hidden), #main-app:not(.hidden)', { timeout: 15000 });
    if (await P.isVisible('#consent')) { await P.check('#consent-check'); await P.click('#consent-btn'); }
    await P.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 }); await P.waitForTimeout(800); };
  const signedIn = P => P.evaluate(() => Core.fb().then(f => !!f.auth.currentUser));

  console.log('1. Owner syncs, vendor opens the account on the phone');
  const O = await newPage(b, DESK, 'owner'); await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 }); await O.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 20000 });
  const A = await newPage(b, MOB, 'phone'); await login(A.p, ILANA); await open(A.p);
  check(await A.p.isVisible('#main-app'), 'phone: account open');

  console.log('2. Same vendor opens the account on the computer → the phone is disconnected');
  const B = await newPage(b, DESK, 'computer'); await login(B.p, ILANA); await open(B.p);
  await A.p.waitForSelector('#kicked:not(.hidden)', { timeout: 10000 });
  check(true, 'phone: "החשבון נפתח במקום אחר" screen');
  check((await A.p.textContent('#kicked-msg')).includes('מכשיר או בדפדפן אחר') && await A.p.isHidden('#main-app'), 'phone: account hidden, explains it was opened on another device');
  await A.p.waitForTimeout(500);
  check(!(await signedIn(A.p)), 'phone: fully signed out');
  check(await B.p.isVisible('#main-app') && await signedIn(B.p), 'computer: stays connected');
  await A.p.screenshot({ path: SHOTS + 'kicked-device.png' });

  console.log('3. A second tab in the same browser → the first tab closes, the new one stays');
  const B2 = await B.ctx.newPage(); B2.on('pageerror', e => errors.push('tab2: ' + e.message)); B2.on('dialog', d => d.accept());
  await B2.goto(SYS + '/vendors/app.html?t=ilana'); await open(B2);
  await B.p.waitForSelector('#kicked:not(.hidden)', { timeout: 10000 });
  check((await B.p.textContent('#kicked-msg')).includes('בלשונית אחרת'), 'first tab: "opened in another tab"');
  await B.p.waitForTimeout(500);
  check(await B2.isVisible('#main-app') && await signedIn(B2), 'new tab: stays open and signed in (not logged out with the old tab)');
  await B.p.screenshot({ path: SHOTS + 'kicked-tab.png' });

  console.log('4. Owner opens the vendor account → nobody is disconnected (owner exempt)');
  const O2 = await O.ctx.newPage(); await O2.goto(SYS + '/vendors/app.html?t=ilana'); await O2.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  await O2.waitForTimeout(1500);
  check(await B2.isVisible('#main-app') && await B2.isHidden('#kicked'), 'vendor not disconnected when the owner views the account');
  const O3 = await O.ctx.newPage(); await O3.goto(SYS + '/vendors/admin.html'); await O3.waitForSelector('#tbody tr td:not(.loading)', { timeout: 20000 });
  check(await O.p.isVisible('#tbody'), 'owner can be open in several tabs at once');

  console.log('5. The phone logs in again → takes over, the computer is disconnected');
  await A.p.click('#kicked-btn'); await A.p.waitForURL(/vendors\/(\?|$|index)/, { timeout: 10000 });
  await login(A.p, ILANA); await open(A.p);
  await B2.waitForSelector('#kicked:not(.hidden)', { timeout: 10000 });
  check(true, 'last opened wins: the computer tab is now disconnected');

  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
