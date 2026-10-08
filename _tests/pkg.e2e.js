// Packages with "what's included" (phone) + support-ending reminder email (once per end date, from admin or vendor page).
// Run like full.e2e.js.
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = NM + 'firebase/', FBV = require(NM + 'firebase/package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots-pkg/'; fs.mkdirSync(SHOTS, { recursive: true });
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
  const MOB = { width: 390, height: 844 };

  console.log('1. Owner opens admin (sync), then Ilana enters her last support week');
  const O = await newPage(b, MOB, 'owner');
  await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector('#tbody tr[data-id], #tbody tr td:not(.loading)', { timeout: 20000 });
  check(reminders().length === 0, 'no reminder while support is not set / not in the last week');
  const d1 = iso(5); await setUntil('ilana', d1);
  await O.p.reload(); await O.p.waitForFunction(() => /נשלחה תזכורת/.test(document.getElementById('tbody').textContent), null, { timeout: 20000 });
  check(reminders().length === 1, 'last week → one reminder email sent from the admin page');
  const body = JSON.parse(reminders()[0].body);
  check(reminders()[0].url.endsWith('/ajax/arielkahalani1@gmail.com'), 'sent to the owner…');
  check(body._cc.includes(ILANA), '…with a copy to the vendor (' + body._cc + ')');
  check(body['הודעה'].includes('וואטסאפ') && body['לחידוש בוואטסאפ'].startsWith('https://wa.me/972512440252'), 'email says how to renew on WhatsApp');
  check(await hasNotice('ilana', d1), 'reminder recorded for this end date');
  await O.p.reload(); await O.p.waitForSelector('#tbody tr[data-id], #tbody tr td:not(.loading)', { timeout: 20000 }); await O.p.waitForTimeout(1500);
  check(reminders().length === 1, 'reload: not sent again for the same date');
  await O.p.screenshot({ path: SHOTS + 'admin-reminded.png', fullPage: true });

  console.log('2. Owner changes the support date → vendor page sends the new reminder once');
  const d2 = iso(6); await setUntil('ilana', d2);
  const I = await newPage(b, MOB, 'ilana');
  await login(I.p, ILANA);
  await I.p.waitForURL(/app\.html\?t=ilana/, { timeout: 15000 });
  await I.p.waitForSelector('#consent:not(.hidden), #main-app:not(.hidden)', { timeout: 15000 });
  if (await I.p.isVisible('#consent')) { await I.p.check('#consent-check'); await I.p.click('#consent-btn'); }
  await I.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  await I.p.waitForFunction(() => true); for (let i = 0; i < 30 && reminders().length < 2; i++) await I.p.waitForTimeout(300);
  check(reminders().length === 2, 'new end date → new reminder (sent from the vendor\'s own page)');
  check(await hasNotice('ilana', d2), 'vendor recorded the reminder (allowed only for the current date)');
  await I.p.reload(); await I.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 }); await I.p.waitForTimeout(4000);
  check(reminders().length === 2, 'vendor reload: no duplicate');

  console.log('3. Package with "what\'s included" on a phone');
  await I.p.fill('#in_clientName', 'דנה ורון'); await I.p.fill('#in_eventType', 'חתונה');
  await I.p.locator('#in_date').pressSequentially('10112027'); await I.p.fill('#in_location', 'גני התערוכה');
  await I.p.click('#add-item');
  const row = I.p.locator('.it-row').last();
  await I.p.waitForTimeout(500);
  const lb = await row.locator('.it-label').boundingBox();
  check(lb && lb.width > 200, 'new package card: name field is wide on a phone (' + Math.round(lb ? lb.width : 0) + 'px)');
  check(await I.p.evaluate(() => document.activeElement && document.activeElement.classList.contains('it-label')), 'new package card is focused, ready to type');
  await row.locator('.it-label').fill('חבילת פרימיום');
  await row.locator('.it-desc').fill('עיצוב חופה, 20 מרכזי שולחן ותאורה');
  await row.locator('.it-price').fill('7900');
  check(await I.p.inputValue('#in_price') === '7900', 'package price feeds the total');
  await I.p.screenshot({ path: SHOTS + 'package-card.png', fullPage: true });
  await axe(I.p, 'generator with package card');
  await I.p.click('#gen-btn'); await I.p.waitForSelector('#link-result:not(.hidden)');
  const link = await I.p.inputValue('#shareable-url');
  const C = await newPage(b, MOB, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io/hatzaa', SITE + '/hatzaa'));
  await C.p.waitForSelector('.items-tbl', { timeout: 15000 });
  const t = await C.p.textContent('.items-tbl');
  check(t.includes('חבילת פרימיום') && t.includes('עיצוב חופה, 20 מרכזי שולחן ותאורה'), 'client sees the package and what it includes');
  await C.p.screenshot({ path: SHOTS + 'customer-package.png', fullPage: true });

  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
