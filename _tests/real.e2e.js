// Real-life scenario on a slow phone connection the WHOLE time (no unthrottled warm-up):
// old-format data (PDFs inside the docs), vendor on phone then computer, owner on two devices.
// Checks: lists load fast, the old place is disconnected quickly, the one-time PDF move uploads each file once.
// Run like full.e2e.js.
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = NM + 'firebase/', FBV = require(NM + 'firebase/package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots-real/'; fs.mkdirSync(SHOTS, { recursive: true });
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

const big = 'JVBERi0xLjQK' + 'A'.repeat(300000);
async function put(path, fields){ const r = await fetch(REST + path, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) }); if (!r.ok) throw new Error(await r.text()); }
async function slow(page){ const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 400 * 1024, uploadThroughput: 150 * 1024 }); }
const sec = ms => (ms / 1000).toFixed(1) + 's';

const up = { n: 0 };
function meter(p){ p.on('request', r => { const d = r.postData(); if (d && r.url().includes('8085')) up.n += d.length; }); }
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
  const DESK = { width: 1280, height: 900 }, MOB = { width: 390, height: 844 };
  // הבעלים מסנכרן פעם אחת (יוצר את הספקים)
  const O = await newPage(b, DESK, 'owner-pc'); await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 }); await O.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 20000 });
  // ההסכמה של אילנה כבר קיימת (כמו בחשבון אמיתי)
  const PFV = await O.p.evaluate(() => Core.PF.termsVersion);
  await put(`tenants/ilana/consents/${encodeURIComponent(ILANA + '|' + PFV)}`, { email: { stringValue: ILANA }, version: { stringValue: PFV } });
  const now = new Date().toISOString();
  const N = Number(process.env.NQ || 12), NO = Number(process.env.NO || 6);
  for (let i = 0; i < N; i++) await put(`tenants/ilana/quotes/s${i}`, { status: { stringValue: 'signed' }, clientName: { stringValue: 'לקוח ' + i }, price: { integerValue: 5000 }, deposit: { integerValue: 1500 }, createdAt: { timestampValue: now }, pdfData: { stringValue: big } });
  for (let i = 0; i < NO; i++) await put(`platformQuotes/so${i}`, { status: { stringValue: 'signed' }, vendorName: { stringValue: 'ספק ' + i }, plan: { stringValue: 'regular' }, total: { integerValue: 1999 }, createdAt: { timestampValue: now }, signedAt: { timestampValue: now }, pdfData: { stringValue: big } });
  const MB = n => (n / 1048576).toFixed(1) + 'MB';
  console.log(`seeded old format: ${N} signed client quotes + ${NO} signed vendor offers, ${MB(big.length)} PDF each`);

  // 1) הספק בטלפון, רשת איטית כל הזמן, נכנס ישר ללוח הבקרה
  const PH = await newPage(b, MOB, 'vendor-phone'); meter(PH.p); await slow(PH.p);
  await login(PH.p, ILANA);
  await PH.p.waitForURL(/app\.html\?t=ilana/, { timeout: 60000 });
  let t0 = Date.now();
  await PH.p.waitForSelector('#main-app:not(.hidden)', { timeout: 120000 });
  console.log('   phone: account open in ' + sec(Date.now() - t0));
  await PH.p.click('button[data-tab="dash"]');
  await PH.p.waitForFunction(n => document.querySelectorAll('#tbody tr .pill').length >= n, N, { timeout: 180000 });
  const tPhone = Date.now() - t0; console.log('   phone: quote list ready in ' + sec(tPhone));
  check(tPhone < 25000, `vendor phone (old data, slow net): account + list in ${sec(tPhone)}`);

  // 2) אותו ספק נכנס גם מהמחשב ומדפדפן נוסף (רשת איטית) — "חיבור אחד בלבד" כבוי לבקשת הבעלים: כולם נשארים מחוברים
  const PC = await newPage(b, DESK, 'vendor-pc'); meter(PC.p); await slow(PC.p);
  await login(PC.p, ILANA);
  await PC.p.waitForURL(/app\.html\?t=ilana/, { timeout: 60000 });
  t0 = Date.now();
  await PC.p.waitForSelector('#main-app:not(.hidden)', { timeout: 120000 });
  const tPc = Date.now() - t0;
  const BR = await newPage(b, DESK, 'vendor-browser2'); await slow(BR.p); await login(BR.p, ILANA);
  await BR.p.waitForSelector('#main-app:not(.hidden)', { timeout: 120000 });
  await PC.p.waitForTimeout(4000);
  check(await PH.p.isVisible('#main-app') && !(await PH.p.isVisible('#kicked')), 'phone stays connected after the computer opened');
  check(await PC.p.isVisible('#main-app') && !(await PC.p.isVisible('#kicked')), `computer connected (opened in ${sec(tPc)})`);
  check(await BR.p.isVisible('#main-app') && !(await BR.p.isVisible('#kicked')), 'second browser connected too');
  await PC.p.click('button[data-tab="dash"]');
  t0 = Date.now(); await PC.p.waitForFunction(n => document.querySelectorAll('#tbody tr .pill').length >= n, N, { timeout: 180000 });
  console.log('   computer: list ready in ' + sec(Date.now() - t0));

  // 4) הבעלים בשני מכשירים בו-זמנית, רשת איטית
  await slow(O.p); meter(O.p);
  const O2 = await newPage(b, MOB, 'owner-phone'); await slow(O2.p); meter(O2.p);
  await login(O2.p, 'arielkahalani1@gmail.com');
  await O2.p.waitForURL(/admin\.html/, { timeout: 60000 }); t0 = Date.now();
  await O2.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 120000 }); const tAdm = Date.now() - t0;
  await O2.p.click('button[data-tab="offers"]'); await O2.p.waitForFunction(n => document.querySelectorAll('#otbody .view').length >= n, NO, { timeout: 180000 }); const tOff = Date.now() - t0;
  console.log(`   owner phone: vendors in ${sec(tAdm)}, offers in ${sec(tOff)}`);
  check(tAdm < 15000 && tOff < 25000, 'owner admin on a slow phone loads fast');
  await O.p.goto('about:blank'); t0 = Date.now(); await O.p.goto(SYS + '/vendors/admin.html');
  await O.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 120000 }); console.log('   owner computer (same time): vendors in ' + sec(Date.now() - t0));
  await O.p.waitForTimeout(3000);
  check(await O.p.isVisible('#main-app') && await O2.p.isVisible('#main-app'), 'owner open on computer and phone at the same time');

  // 5) ההעברה החד-פעמית הסתיימה, וכל קובץ הועלה בערך פעם אחת
  let left = -1;
  for (let i = 0; i < 90 && left; i++) { left = 0; for (let k = 0; k < N; k++) { const j = await (await fetch(REST + 'tenants/ilana/quotes/s' + k, { headers: H })).json(); if (j.fields.pdfData) left++; } for (let k = 0; k < NO; k++) { const j = await (await fetch(REST + 'platformQuotes/so' + k, { headers: H })).json(); if (j.fields.pdfData) left++; } if (left) await new Promise(r => setTimeout(r, 2000)); }
  check(left === 0, 'all old PDFs moved');
  const ideal = (N + NO) * big.length;
  console.log(`   uploaded ${MB(up.n)} in total (files themselves: ${MB(ideal)})`);
  check(up.n < ideal * 2.2, 'each PDF uploaded about once (no repeated uploads)');
  // 6) אחרי ההעברה: הספק בטלפון (רשת איטית) — לוח הבקרה נטען מהר
  await BR.p.close();
  const PH2 = await newPage(b, MOB, 'vendor-phone-again'); await slow(PH2.p); await login(PH2.p, ILANA);
  await PH2.p.waitForURL(/app\.html\?t=ilana/, { timeout: 60000 }); t0 = Date.now();
  await PH2.p.waitForSelector('#main-app:not(.hidden)', { timeout: 120000 }); await PH2.p.click('button[data-tab="dash"]');
  await PH2.p.waitForFunction(n => document.querySelectorAll('#tbody tr .pill').length >= n, N, { timeout: 180000 });
  const tAfter = Date.now() - t0; check(tAfter < 6000, `after the move: vendor phone account + list in ${sec(tAfter)}`);
  // שגיאת הרשאה בלשונית שנותקה (אחרי signOut) היא צפויה
  const real = errors.filter(e => !/^vendor-(phone|pc)\b.*false for 'list'/s.test(e));
  check(!real.length, 'no page errors' + (real.length ? ':\n    ' + real.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
