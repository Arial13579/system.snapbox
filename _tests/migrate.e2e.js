// Old in-doc PDFs move to <doc>/pdf/file when the lists load; lists stay light; viewing still works.
// Run like full.e2e.js.
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots-migrate/'; fs.mkdirSync(SHOTS, { recursive: true });
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
async function getDocRest(path){ const r = await fetch(REST + path, { headers: H }); return r.ok ? r.json() : null; }
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
  const DESK = { width: 1280, height: 900 }, MOB = { width: 390, height: 844 };
  console.log('1. Old-format data: PDF inside the offer and inside a client quote');
  const O = await newPage(b, DESK, 'owner'); await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 }); await O.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 20000 });
  await put('platformQuotes/old1', { status: { stringValue: 'signed' }, vendorName: { stringValue: 'ספק ישן' }, plan: { stringValue: 'regular' }, total: { integerValue: 1999 }, createdAt: { timestampValue: new Date().toISOString() }, signedAt: { timestampValue: new Date().toISOString() }, pdfData: { stringValue: big } });
  await put('tenants/ilana/quotes/oldq', { status: { stringValue: 'signed' }, clientName: { stringValue: 'לקוח ישן' }, price: { integerValue: 1000 }, deposit: { integerValue: 300 }, createdAt: { timestampValue: new Date().toISOString() }, pdfData: { stringValue: big } });
  check(true, 'seeded 2 old documents with a 300KB PDF inside');

  console.log('2. Owner opens admin → offer PDF moves out');
  await O.p.reload(); await O.p.waitForSelector('#tbody tr td:not(.loading)', { timeout: 20000 });
  await O.p.click('button[data-tab="offers"]');
  for (let i = 0; i < 30; i++) { const d = await getDocRest('platformQuotes/old1'); if (d && !d.fields.pdfData) break; await O.p.waitForTimeout(300); }
  const o1 = await getDocRest('platformQuotes/old1'), f1 = await getDocRest('platformQuotes/old1/pdf/file');
  check(!o1.fields.pdfData && o1.fields.hasPdf && o1.fields.hasPdf.booleanValue === true, 'offer: PDF removed from the list document, hasPdf=true');
  check(f1 && f1.fields.pdfData.stringValue.length === big.length, 'offer: PDF kept intact in pdf/file');
  await O.p.waitForTimeout(800); console.log('   otbody:', (await O.p.textContent('#otbody')).slice(0, 300).replace(/\s+/g, ' '), '| visible:', await O.p.isVisible('#otbody'));
  await O.p.waitForSelector('#otbody .view', { timeout: 10000 });
  const pop = O.p.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
  await O.p.click('#otbody .view'); check(!!(await pop), 'offer: "צפייה" still opens the PDF');

  console.log('3. Vendor opens dashboard → quote PDF moves out');
  const I = await newPage(b, MOB, 'ilana'); await login(I.p, ILANA);
  await I.p.waitForURL(/app\.html\?t=ilana/, { timeout: 15000 });
  await I.p.waitForSelector('#consent:not(.hidden), #main-app:not(.hidden)', { timeout: 15000 });
  if (await I.p.isVisible('#consent')) { await I.p.check('#consent-check'); await I.p.click('#consent-btn'); }
  await I.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  await I.p.click('.tabs button[data-tab="dash"]');
  for (let i = 0; i < 30; i++) { const d = await getDocRest('tenants/ilana/quotes/oldq'); if (d && !d.fields.pdfData) break; await I.p.waitForTimeout(300); }
  const q1 = await getDocRest('tenants/ilana/quotes/oldq'), qf = await getDocRest('tenants/ilana/quotes/oldq/pdf/file');
  check(!q1.fields.pdfData && q1.fields.hasPdf.booleanValue === true && qf && qf.fields.pdfData.stringValue.length === big.length, 'quote: PDF moved to pdf/file intact');
  await I.p.waitForSelector('#tbody .view-file', { timeout: 10000 });
  const pop2 = I.p.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
  await I.p.click('#tbody .view-file'); check(!!(await pop2), 'quote: "צפייה" still opens the PDF');
  await I.p.click('#tbody .delete-row[data-id="oldq"]');
  for (let i = 0; i < 20; i++) { if (!(await getDocRest('tenants/ilana/quotes/oldq/pdf/file'))) break; await I.p.waitForTimeout(300); }
  check(!(await getDocRest('tenants/ilana/quotes/oldq/pdf/file')) && !(await getDocRest('tenants/ilana/quotes/oldq')), 'deleting a quote also deletes its PDF');

  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
