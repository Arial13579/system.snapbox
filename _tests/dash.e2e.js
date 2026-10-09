// Vendor dashboard on a big account: only the latest 50 quotes are loaded, totals come from the server (count/sum).
// Run like full.e2e.js.
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots-dash/'; fs.mkdirSync(SHOTS, { recursive: true });
const ILANA = 'snapboxevent.official@gmail.com';
const fs_size_offer = () => fs.statSync(SHOTS + 'offer-signed.pdf').size;
const REG = `window.REGISTRY = [{ slug: 'demo', name: 'עסק לדוגמה', admins: ['noa@gmail.com'] }, { slug: 'ilana', name: 'אילנה עיצוב אירועים', admins: ['${ILANA}'] }];`;
const errors = [], sent = [], a11y = [];
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099 }; try { localStorage.removeItem('sb.pdfMigrated.v1'); } catch(e) {} });   // הבדיקה מוסיפה קבצים ישנים אחרי הכניסה הראשונה
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


(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
  const O = await newPage(b, { width: 1280, height: 900 }, 'owner'); await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 }); await O.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 20000 });
  const PFV = await O.p.evaluate(() => Core.PF.termsVersion);
  await put(`tenants/ilana/consents/${encodeURIComponent(ILANA + '|' + PFV)}`, { email: { stringValue: ILANA }, version: { stringValue: PFV } });
  const N = 120, base = Date.now() - N * 60000;
  for (let i = 0; i < N; i++) await put(`tenants/ilana/quotes/q${String(i).padStart(3, '0')}`, { status: { stringValue: i % 2 ? 'signed' : 'pending' }, clientName: { stringValue: 'לקוח ' + i }, price: { integerValue: 1000 }, deposit: { integerValue: 300 }, date: { stringValue: '15/11/2026' }, createdAt: { timestampValue: new Date(base + i * 60000).toISOString() } });
  console.log('seeded 120 quotes (60 signed × ₪1,000)');
  const V = await newPage(b, { width: 390, height: 844 }, 'vendor'); await login(V.p, ILANA);
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 30000 });
  await V.p.click('button[data-tab="dash"]');
  await V.p.waitForFunction(() => document.querySelectorAll('#tbody tr .pill').length >= 50, null, { timeout: 30000 });
  await V.p.waitForFunction(() => /120/.test(document.querySelector('#kpis').textContent), null, { timeout: 15000 }).catch(() => {});
  const rows = () => V.p.evaluate(() => document.querySelectorAll('#tbody tr .pill').length);
  const kpis = (await V.p.textContent('#kpis')).replace(/\s+/g, ' ');
  console.log('   KPIs:', kpis);
  check(await rows() === 50, 'only the latest 50 quotes are loaded');
  check(/120\s*הצעות שנשלחו|הצעות שנשלחו\s*120/.test(kpis), 'total quotes from the server: 120');
  check(/60\s*נחתמו|נחתמו\s*60/.test(kpis), 'signed from the server: 60');
  check(kpis.includes('₪60,000'), 'revenue from the server: ₪60,000');
  check(kpis.includes('50%'), 'close rate 50%');
  check((await V.p.textContent('#tbody')).includes('לקוח 119'), 'newest quote is first');
  check(await V.p.isVisible('#more-quotes') && (await V.p.textContent('#more-note')).includes('50') && (await V.p.textContent('#more-note')).includes('120'), 'note + "load earlier quotes" button shown');
  await axe(V.p, 'vendor dashboard with load-more');
  await V.p.click('#more-quotes'); await V.p.waitForFunction(() => document.querySelectorAll('#tbody tr .pill').length >= 100, null, { timeout: 15000 });
  check(await rows() === 100, 'load more → 100 quotes');
  await V.p.click('#more-quotes'); await V.p.waitForFunction(() => document.querySelectorAll('#tbody tr .pill').length >= 120, null, { timeout: 15000 });
  await V.p.waitForTimeout(800);
  check(await rows() === 120 && !(await V.p.isVisible('#more-quotes')), 'all 120 loaded → button hidden');
  // הצעה חדשה מופיעה למעלה, והמדדים מתעדכנים
  await put('tenants/ilana/quotes/qnew', { status: { stringValue: 'pending' }, clientName: { stringValue: 'לקוח חדש' }, price: { integerValue: 500 }, createdAt: { timestampValue: new Date().toISOString() } });
  await V.p.waitForFunction(() => document.querySelector('#tbody tr .name') && document.querySelector('#tbody tr .name').textContent.includes('לקוח חדש'), null, { timeout: 15000 });
  await V.p.waitForFunction(() => /121/.test(document.querySelector('#kpis').textContent), null, { timeout: 15000 }).catch(() => {});
  check((await V.p.textContent('#kpis')).includes('121'), 'new quote appears first and the total updates to 121');
  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close(); console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED'); process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
