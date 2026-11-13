// Views tracking ("opened X times · last opened") for vendor→client quotes and owner→vendor offers, Bit payment box after signing, owner income/expenses tab (green/red).
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-views/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'views.dj@gmail.com', SLUG = 'vviewsaa';
const REG = fs.readFileSync('/home/user/system.snapbox/vendors/registry.js', 'utf8');   // the real registry
const errors = [], sent = [];
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099, noWelcome: true }; });
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
const ts = d => ({ timestampValue: d.toISOString() });
const pad = n => String(n).padStart(2, '0');
const dmy = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
const fields = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? int(v) : typeof v === 'boolean' ? { booleanValue: v } : v instanceof Date ? ts(v) : Array.isArray(v) ? { arrayValue: { values: v.map(str) } } : str(v)]));


const b64u = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
(async () => {
  const win = {}; new Function('window', fs.readFileSync('/home/user/hatzaa/snapiiii/config.js', 'utf8'))(win);
  const cfg = win.TENANT; cfg.business.name = 'סטודיו אור'; cfg.business.phone = '054-6056180'; cfg.business.logo = '';
  const now = new Date(), evDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  await emu('PATCH', 'vendorConfigs/' + SLUG, { fields: { config: str(JSON.stringify(cfg)), updatedAt: ts(now) } });
  await emu('PATCH', 'tenants/' + SLUG, { fields: fields({ slug: SLUG, name: 'סטודיו אור', admins: [VENDOR], active: true, managed: 'admin', createdAt: now }) });
  await emu('PATCH', 'vendorIndex/' + VENDOR, { fields: fields({ tenant: SLUG }) });
  const q1 = { clientName: 'נועה ואיתי', clientPhone: '0521112233', eventType: 'חתונה', location: 'גני התערוכה', date: dmy(evDay), startTime: '19:30', endTime: '00:30', guests: 350, price: 6400, deposit: 1500, service: 'booth', status: 'pending', createdAt: now };
  await emu('PATCH', `tenants/${SLUG}/quotes/qv1`, { fields: fields(q1) });
  await emu('PATCH', `tenants/${SLUG}/quotes/qv2`, { fields: fields({ ...q1, clientName: 'משפחת לוי', eventType: 'בר מצווה', price: 3900, deposit: 800, createdAt: new Date(now - 3600e3) }) });
  const Q = b64u(['נועה ואיתי', 'חתונה', 'גני התערוכה', dmy(evDay), '19:30', '00:30', '350', '6400', '1500', '', 'qv1', 'booth'].join('|'));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('1. Client opens the quote → counted once per tab, not on reload');
  const C = await newPage(b, 'client');
  await C.p.goto(`${SITE}/hatzaa/v/?t=${SLUG}&q=${Q}`);
  await C.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C.p.waitForTimeout(1500);
  let d = await emu('GET', `tenants/${SLUG}/quotes/qv1`);
  check(val(d.body.fields.views) === 1 && !!d.body.fields.lastViewedAt, 'first open → views 1 + lastViewedAt');
  await C.p.reload(); await C.p.waitForSelector('#sig-canvas'); await C.p.waitForTimeout(1200);
  d = await emu('GET', `tenants/${SLUG}/quotes/qv1`);
  check(val(d.body.fields.views) === 1, 'reload in the same tab is not counted again');
  console.log('   (waiting 21s — rules allow one view per 20s)'); await new Promise(r => setTimeout(r, 21000));
  const C2 = await newPage(b, 'client-2');
  await C2.p.goto(`${SITE}/hatzaa/v/?t=${SLUG}&q=${Q}`); await C2.p.waitForSelector('#sig-canvas'); await C2.p.waitForTimeout(1500);
  d = await emu('GET', `tenants/${SLUG}/quotes/qv1`);
  check(val(d.body.fields.views) === 2, 'second device → views 2');
  await C2.ctx.close();

  console.log('2. Vendor dashboard shows opens');
  const V = await newPage(b, 'vendor');
  await login(V.p, VENDOR);
  await V.p.waitForSelector('#consent:not(.hidden), #main-app:not(.hidden)', { timeout: 20000 });
  if (await V.p.isVisible('#consent')) { await V.p.check('#consent-check'); await V.p.click('#consent-btn'); }
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await V.p.click('.tabs button[data-tab=dash]');
  await V.p.waitForSelector('#tbody .views', { timeout: 15000 });
  const rowsTxt = await V.p.textContent('#tbody');
  check(/נפתחה פעמיים · לאחרונה עכשיו/.test(rowsTxt), 'row: "נפתחה פעמיים · לאחרונה עכשיו"');
  check(/עוד לא נפתחה/.test(rowsTxt), 'unopened quote: "עוד לא נפתחה"');
  await V.p.screenshot({ path: SHOTS + 'dash-views.png', fullPage: false });
  await V.p.click('#tbody .ev-open[data-id="qv1"]'); await V.p.waitForSelector('#ev-dlg[open]');
  check(/מעקב[\s\S]*נפתחה פעמיים/.test(await V.p.textContent('#ev-view')), 'event dialog has a "מעקב" group');
  await V.p.waitForTimeout(500); await V.p.screenshot({ path: SHOTS + 'ev-views.png' });
  await axe(V.p, 'event dialog with views');
  await V.p.click('#ev-close');

  console.log('3. Client signs → Bit box with the vendor phone + copy');
  await C.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  await C.p.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const bb = await C.p.locator('#sig-canvas').boundingBox();
  await C.p.mouse.move(bb.x + 40, bb.y + 60); await C.p.mouse.down();
  for (let i = 0; i < 28; i++) await C.p.mouse.move(bb.x + 40 + i * 9, bb.y + 60 - Math.sin(i / 3) * 30);
  await C.p.mouse.up(); await C.p.check('#agree-terms');
  const dl = C.p.waitForEvent('download', { timeout: 60000 }); await C.p.click('#submit-btn'); await dl;
  await C.p.waitForSelector('.bitbox', { timeout: 20000 });
  check((await C.p.textContent('#bit-num')).trim() === '0546056180', 'Bit box shows the vendor phone 0546056180');
  check(/המקדמה ₪1,500/.test(await C.p.textContent('.bitbox')), 'Bit box shows the deposit');
  await C.p.click('#bit-copy');
  check(await C.p.evaluate(() => navigator.clipboard.readText()) === '0546056180', 'copy → clipboard has the number');
  await C.p.locator('.bitbox').scrollIntoViewIfNeeded(); await C.p.waitForTimeout(6500);   // the PDF download link is removed after 6s
  await C.p.screenshot({ path: SHOTS + 'bit-client.png' });
  await axe(C.p, 'customer page after signing (Bit box)');

  console.log('4. Owner → vendor offer: views + Bit box');
  const O = { id: 'offv1', vendorName: 'סטודיו אור', contactName: 'אור כהן', businessType: 'צלם', plan: 'regular', price: 400, total: 400, deposit: 0 };
  await emu('PATCH', 'platformQuotes/' + O.id, { fields: fields({ ...O, phone: '0547778899', planLabel: 'מנוי שנתי', freeMonths: 0, extraMonths: 0, status: 'pending', createdAt: now }) });
  const OQ = b64u([O.id, O.vendorName, O.contactName, O.businessType, 'regular', '400', '0', '0', '89', '0', '400', '', '14', Core_toISO(now), '0547778899', '400', 'or@gmail.com', '0', ''].join('|'));
  const VO = await newPage(b, 'vendor-offer');
  await VO.p.goto(`${SYS}/offer/?q=${OQ}`); await VO.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await VO.p.waitForTimeout(1500);
  d = await emu('GET', 'platformQuotes/' + O.id);
  check(val(d.body.fields.views) === 1, 'offer opened by the vendor → views 1');
  await VO.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  await VO.p.fill('#signer', 'אור כהן');
  await VO.p.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const ob = await VO.p.locator('#sig-canvas').boundingBox();
  await VO.p.mouse.move(ob.x + 40, ob.y + 60); await VO.p.mouse.down();
  for (let i = 0; i < 28; i++) await VO.p.mouse.move(ob.x + 40 + i * 9, ob.y + 60 - Math.sin(i / 3) * 30);
  await VO.p.mouse.up(); await VO.p.check('#agree');
  const dl2 = VO.p.waitForEvent('download', { timeout: 60000 }); await VO.p.click('#sign-btn'); await dl2;
  await VO.p.waitForSelector('.bitbox', { timeout: 20000 });
  check((await VO.p.textContent('#bit-num')).trim() === '0512440252', 'offer Bit box shows the Snap Box number 0512440252');
  await VO.p.click('#bit-copy');
  check(await VO.p.evaluate(() => navigator.clipboard.readText()) === '0512440252', 'copy works on the offer page');
  await VO.p.locator('.bitbox').scrollIntoViewIfNeeded(); await VO.p.waitForTimeout(400);
  await VO.p.screenshot({ path: SHOTS + 'bit-offer.png' });

  console.log('5. Owner: offers tab shows views, books tab green/red');
  const A = await newPage(b, 'owner');
  await A.p.setViewportSize({ width: 1280, height: 860 });
  await login(A.p, OWNER);
  await A.p.waitForURL(/admin\.html/, { timeout: 20000 }); await A.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await A.p.click('.admin-tabs button[data-tab=offers]');
  await A.p.waitForSelector('#otbody .views', { timeout: 15000 });
  check(/נפתחה פעם אחת/.test(await A.p.textContent('#otbody')), 'offers tab: "נפתחה פעם אחת"');
  await A.p.screenshot({ path: SHOTS + 'admin-offers.png' });
  await A.p.click('.admin-tabs button[data-tab=books]');
  await A.p.waitForSelector('#ob-kpis .bk-kpi.inc', { timeout: 15000 });
  check(/₪400/.test(await A.p.textContent('#ob-kpis .bk-kpi.inc')), 'signed offer counted as income (₪400)');
  await A.p.fill('#ob-amount', '120'); await A.p.fill('#ob-label', 'קמפיין טיקטוק'); await A.p.click('#ob-add');
  await A.p.waitForTimeout(1500);
  await A.p.waitForFunction(() => /₪120/.test(document.querySelector('#ob-kpis .bk-kpi.exp').textContent), null, { timeout: 10000 });
  await A.p.click('#ob-kind button[data-k=in]'); await A.p.fill('#ob-amount', '890'); await A.p.fill('#ob-label', 'תמיכה טכנית · 10 חודשים'); await A.p.click('#ob-add');
  await A.p.waitForFunction(() => /₪1,290/.test(document.querySelector('#ob-kpis .bk-kpi.inc').textContent), null, { timeout: 10000 });
  check(/רווח[\s\S]*₪1,170/.test(await A.p.textContent('#ob-kpis')), 'profit = 1,290 − 120 = ₪1,170');
  const colors = await A.p.evaluate(() => [getComputedStyle(document.querySelector('#ob-kpis .bk-kpi.inc .n')).color, getComputedStyle(document.querySelector('#ob-kpis .bk-kpi.exp .n')).color, getComputedStyle(document.querySelector('#ob-list .tx.exp .tx-a')).color]);
  check(colors[0] === 'rgb(21, 128, 61)' && colors[1] === 'rgb(185, 28, 28)' && colors[2] === 'rgb(185, 28, 28)', 'income green, expenses red: ' + colors.join(' / '));
  check(await A.p.locator('#ob-list .tx-del').count() === 2 && await A.p.locator('#ob-list .tx').count() === 3, 'manual rows have a trash icon, the signed offer does not');
  await A.p.screenshot({ path: SHOTS + 'admin-books.png', fullPage: true });
  await axe(A.p, 'admin books tab');
  await A.p.locator('#ob-list .tx.exp .tx-del').click();
  await A.p.waitForFunction(() => /₪0/.test(document.querySelector('#ob-kpis .bk-kpi.exp').textContent), null, { timeout: 10000 });
  check(true, 'deleting the expense updates the totals');
  await A.p.setViewportSize({ width: 390, height: 844 });
  check(await A.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'books tab: no sideways scroll at 390px');

  await b.close();
  console.log(errors.length ? 'page errors:\n  ' + errors.join('\n  ') : 'no page errors');
  console.log(`\n${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
function Core_toISO(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
