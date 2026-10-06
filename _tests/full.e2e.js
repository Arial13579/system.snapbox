// Full end-to-end test of the Snap Box vendor platform against Firebase emulators + axe accessibility scan.
const { chromium } = require('/tmp/claude-0/-home-user-Aura-event/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad/node_modules/playwright');
const fs = require('fs'), path = require('path');
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/chk/node_modules/', FB = S + '/rules/node_modules/firebase/';
const AXE = fs.readFileSync(S + '/e2e/node_modules/axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/e2e/shots2/'; fs.mkdirSync(SHOTS, { recursive: true });
const REG = "window.REGISTRY = [{ slug: 'demo', name: 'עסק לדוגמה', admins: ['noa@gmail.com'] }];";
const errors = [], sent = [], a11y = [];
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099 }; });
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    const m = u.match(/gstatic\.com\/firebasejs\/([\d.]+)\/(firebase-(app|auth|firestore)\.js)$/);
    const H = { 'Access-Control-Allow-Origin': '*' };
    if (m && m[1] !== '10.14.1') return route.fulfill({ body: `export * from 'https://www.gstatic.com/firebasejs/10.14.1/${m[2]}';`, contentType: 'application/javascript', headers: H });
    if (m) return route.fulfill({ body: fs.readFileSync(FB + m[2]), contentType: 'application/javascript', headers: H });
    if (u.endsWith('html2canvas.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'html2canvas/dist/html2canvas.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('jspdf.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'jspdf/dist/jspdf.umd.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('chart.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'chart.js/dist/chart.umd.js'), contentType: 'application/javascript' });
    if (u.includes('/vendors/registry.js')) return route.fulfill({ body: REG, contentType: 'application/javascript' });
    if (u.startsWith('https://arial13579.github.io/hatzaa/')) {
      const rel = decodeURIComponent(new URL(u).pathname.replace('/hatzaa/', '')) || 'index.html';
      let f = path.join('/home/user/hatzaa', rel); if (f.endsWith('/')) f += 'index.html';
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
    }
    if (u.includes('ipify')) return route.fulfill({ body: '{"ip":"1.2.3.4"}', contentType: 'application/json' });
    if (u.includes('tmpfiles')) return route.fulfill({ body: '{"data":{"url":"https://tmpfiles.org/1/x.pdf"}}', contentType: 'application/json' });
    if (u.includes('formsubmit')) { sent.push(u); return route.fulfill({ body: 'ok', contentType: 'text/html' }); }
    if (u.includes('nominatim')) return route.fulfill({ body: '[{"lat":"31.252","lon":"34.791","display_name":"באר שבע, מחוז הדרום"}]', contentType: 'application/json' });
    if (u.includes('osrm')) return route.fulfill({ body: '{"routes":[{"distance":112400}]}', contentType: 'application/json' });
    if (u.startsWith(SITE) || u.includes('127.0.0.1') || u.includes('fonts.g')) return route.continue();
    return route.abort();
  });
}
async function newPage(b, vp, name){
  const ctx = await b.newContext({ viewport: vp, locale: 'he-IL', acceptDownloads: true });
  await setup(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|ERR_FAILED|net::|favicon/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
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
async function draw(p){
  await p.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const bb = await p.locator('#sig-canvas').boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + 110); await p.mouse.down();
  for (let i = 0; i < 28; i++) await p.mouse.move(bb.x + 40 + i * 9, bb.y + 110 - Math.sin(i / 3) * 40);
  await p.mouse.up();
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }, args: ['--ignore-certificate-errors'] });
  const DESK = { width: 1280, height: 900 }, MOB = { width: 390, height: 844 };

  console.log('A. Public site: sales page + legal pages');
  const G = await newPage(b, MOB, 'guest');
  await G.p.goto(SYS + '/');
  check(await G.p.locator('a.vendor-login[href="vendors/"]').count() === 1, 'sales page: vendor login button in header');
  for (const l of ['legal/terms.html', 'legal/privacy.html', 'legal/accessibility.html']) check(await G.p.locator(`footer a[href="${l}"]`).count() === 1, 'sales page footer links ' + l);
  await hasA11yWidget(G.p, 'sales page');
  await axe(G.p, 'sales page (light)');
  const GD = await newPage(b, DESK, 'guest-dark');
  await GD.p.emulateMedia({ colorScheme: 'dark' });
  await GD.p.goto(SYS + '/'); await axe(GD.p, 'sales page (dark)');
  await GD.p.screenshot({ path: SHOTS + 'sales-dark.png' });
  check(await G.p.locator('#cookie-bar').count() === 1, 'cookie notice shown on first visit');
  await G.p.click('#cookie-ok'); await G.p.reload();
  check(await G.p.locator('#cookie-bar').count() === 0, 'cookie notice remembered');
  await G.p.click('#a11y-fab'); await G.p.click('[data-act="contrast"]');
  check(await G.p.evaluate(() => document.documentElement.classList.contains('a11y-contrast')), 'high-contrast toggles on');
  await G.p.screenshot({ path: SHOTS + 'sales-contrast.png' });
  await G.p.click('.a11y-reset'); await G.p.keyboard.press('Escape');
  for (const l of ['terms', 'privacy', 'accessibility']) {
    await G.p.goto(SYS + '/legal/' + l + '.html');
    check((await G.p.locator('main section').count()) >= 4, `legal page ${l} has sections`);
    await hasA11yWidget(G.p, l);
    await axe(G.p, 'legal/' + l);
  }
  await G.p.screenshot({ path: SHOTS + 'legal-terms-mobile.png', fullPage: false });
  await G.p.goto(SYS + '/vendors/');
  await G.p.waitForSelector('#signin:not([disabled])');
  await axe(G.p, 'vendor login');
  await G.p.screenshot({ path: SHOTS + 'login-mobile.png' });

  console.log('B. Owner admin: sync, edit vendor support');
  const O = await newPage(b, DESK, 'owner');
  await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector('text=מסונכרן ✓', { timeout: 15000 });
  await O.p.waitForSelector('#tbody button.edit');
  check((await O.p.textContent('#tbody')).includes('לא הוגדרה'), 'support initially not set');
  await O.p.click('#tbody button.edit');
  await O.p.waitForSelector('#edit-dlg[open]');
  await O.p.fill('#e_contact', 'נועה לוי'); await O.p.fill('#e_phone', '050-1234567');
  await O.p.selectOption('#e_plan', 'launch'); await O.p.fill('#e_paid', '1499');
  await O.p.click('#e_quick button[data-m="2"]');
  await O.p.fill('#e_notes', 'הערה פנימית לבדיקה');
  await O.p.screenshot({ path: SHOTS + 'admin-edit.png' });
  await O.p.click('#e_save');
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('נותרו'), null, { timeout: 15000 });
  const vt = await O.p.textContent('#tbody');
  check(vt.includes('נותרו חודשיים') && vt.includes('מחיר השקה') && vt.includes('נועה לוי'), 'vendor row shows support, plan and contact');
  check((await O.p.textContent('#kpis')).includes('₪1,499'), 'sales total KPI');
  await axe(O.p, 'admin vendors');
  await O.p.screenshot({ path: SHOTS + 'admin-vendors.png', fullPage: true });

  console.log('C. Owner creates a quote for a prospective vendor');
  await O.p.click('.admin-tabs button[data-tab=offer]');
  await O.p.fill('#o_vendor', 'צלם הדגמה'); await O.p.fill('#o_contact', 'דני כהן'); await O.p.fill('#o_phone', '052-7654321');
  await O.p.fill('#o_type', 'צלם/ת');
  await O.p.selectOption('#o_plan', 'launch');
  await O.p.check('#o_support_on'); await O.p.click('#o_quick button[data-m="6"]');
  await O.p.fill('#o_discount', '100'); await O.p.locator('#o_discount').dispatchEvent('input');
  await O.p.fill('#o_notes', 'כולל פגישת הדרכה בזום');
  const sumTxt = await O.p.textContent('#o_summary');
  check(sumTxt.includes('₪1,813'), 'offer total = 1499 + 6×69 − 100 = ₪1,813');
  check(sumTxt.includes('8 חודשי תמיכה'), 'support months = 2 included + 6');
  await axe(O.p, 'admin offer form');
  await O.p.screenshot({ path: SHOTS + 'admin-offer.png', fullPage: true });
  await O.p.click('#o_gen');
  await O.p.waitForSelector('#o_result:not(.hidden)');
  const offerUrl = await O.p.inputValue('#o_url');
  check(/\/offer\/\?q=/.test(offerUrl), 'offer link created');
  check((await O.p.getAttribute('#o_wa', 'href')).startsWith('https://wa.me/972527654321'), 'WhatsApp link goes to vendor phone');

  console.log('D. Prospective vendor signs the offer');
  const P = await newPage(b, MOB, 'prospect');
  await P.p.goto(offerUrl);
  await P.p.waitForSelector('#sig-canvas');
  const ot = await P.p.textContent('main');
  check(ot.includes('צלם הדגמה') && ot.includes('₪1,813') && ot.includes('8 חודשים'), 'offer page shows vendor, total and support');
  await hasA11yWidget(P.p, 'offer page');
  await axe(P.p, 'offer page');
  await P.p.screenshot({ path: SHOTS + 'offer-mobile.png', fullPage: true });
  await draw(P.p); await P.p.check('#agree');
  const dl = P.p.waitForEvent('download', { timeout: 60000 });
  await P.p.click('#sign-btn');
  await (await dl).saveAs(SHOTS + 'offer-signed.pdf');
  await P.p.waitForSelector('.done', { timeout: 20000 });
  check(true, 'prospect sees success + PDF downloaded');
  check(sent.some(u => u.includes('formsubmit.co/arielkahalani1@gmail.com')), 'signed offer emailed to owner');

  console.log('E. Owner sees the signed offer');
  await O.p.click('.admin-tabs button[data-tab=offers]');
  await O.p.waitForSelector('#otbody .badge.ok', { timeout: 15000 });
  check(await O.p.locator('#otbody .view').count() === 1, 'signed offer PDF stored');
  check((await O.p.textContent('#okpis')).includes('₪1,813'), 'signed offers total KPI');
  await O.p.screenshot({ path: SHOTS + 'admin-offers.png', fullPage: true });

  console.log('F. Vendor first login: terms consent, support card, quote flow');
  const V = await newPage(b, MOB, 'vendor');
  await login(V.p, 'noa@gmail.com');
  await V.p.waitForURL(/app\.html\?t=demo/, { timeout: 15000 });
  await V.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  check(await V.p.isDisabled('#consent-btn'), 'consent button disabled until checkbox');
  await axe(V.p, 'vendor consent');
  await V.p.screenshot({ path: SHOTS + 'vendor-consent.png', fullPage: true });
  await V.p.check('#consent-check'); await V.p.click('#consent-btn');
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  const sc = await V.p.textContent('#support-card');
  check(sc.includes('נותרו חודשיים'), 'vendor sees support months left: ' + sc.trim().replace(/\s+/g, ' ').slice(0, 60));
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  check(await V.p.isHidden('#consent'), 'consent not asked again');
  await V.p.fill('#in_clientName', 'לקוח בדיקה'); await V.p.fill('#in_eventType', 'חתונה');
  await V.p.fill('#in_location', 'באר שבע'); await V.p.locator('#in_location').blur();
  await V.p.locator('#in_date').pressSequentially('20082027'); await V.p.locator('#in_startTime').pressSequentially('2000'); await V.p.locator('#in_endTime').pressSequentially('0100');
  await V.p.fill('#in_guests', '200'); await V.p.locator('#in_guests').dispatchEvent('input');
  await V.p.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 });
  await axe(V.p, 'vendor generator');
  await V.p.screenshot({ path: SHOTS + 'vendor-app-mobile.png', fullPage: true });
  await V.p.click('#gen-btn'); await V.p.waitForSelector('#link-result:not(.hidden)');
  const link = await V.p.inputValue('#shareable-url');
  const C = await newPage(b, MOB, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE));
  await C.p.waitForSelector('#sig-canvas'); await C.p.waitForTimeout(500);
  check(!/snap ?box/i.test(await C.p.textContent('body')), 'customer page has no Snap Box');
  await axe(C.p, 'customer quote page');
  await draw(C.p); await C.p.check('#agree-terms');
  const dl2 = C.p.waitForEvent('download', { timeout: 60000 }); await C.p.click('#submit-btn'); await dl2;
  await C.p.waitForSelector('.done', { timeout: 20000 });
  await V.p.click('.tabs button[data-tab=dash]');
  await V.p.waitForSelector('#tbody .pill.signed', { timeout: 15000 });
  check(true, 'vendor dashboard shows the signed quote');
  await axe(V.p, 'vendor dashboard');
  await V.p.screenshot({ path: SHOTS + 'vendor-dash-mobile.png', fullPage: true });

  console.log('G. Owner sees consent + activity; only owner has control');
  await O.p.click('.admin-tabs button[data-tab=vendors]'); await O.p.reload();
  await O.p.waitForSelector('#tbody button.edit');
  const vt2 = await O.p.textContent('#tbody');
  check(vt2.includes('אושרו'), 'admin shows terms accepted');
  check(/1\s*נחתמו/.test(vt2), 'admin shows vendor signed count');
  const tamper = await V.p.evaluate(async () => {
    const f = await window.Core.fb();
    const r = {};
    try { await f.fs.updateDoc(f.fs.doc(f.db, 'tenants', 'demo'), { supportUntil: '2099-01-01' }); r.extend = 'ALLOWED'; } catch(e) { r.extend = 'denied'; }
    try { await f.fs.getDocs(f.fs.collection(f.db, 'platformQuotes')); r.offers = 'ALLOWED'; } catch(e) { r.offers = 'denied'; }
    try { await f.fs.getDocs(f.fs.collection(f.db, 'tenants')); r.listTenants = 'ALLOWED'; } catch(e) { r.listTenants = 'denied'; }
    return r;
  });
  check(tamper.extend === 'denied', 'vendor cannot extend own support from the browser');
  check(tamper.offers === 'denied', 'vendor cannot read owner offers');
  check(tamper.listTenants === 'denied', 'vendor cannot list other vendors');
  await V.p.goto(SYS + '/vendors/admin.html');
  await V.p.waitForSelector('#blocked:not(.hidden)', { timeout: 15000 });
  check(true, 'vendor blocked from admin page');

  console.log('H. Suspension');
  await O.p.click('#tbody button.toggle');
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('מושהה'), null, { timeout: 15000 });
  await V.p.goto(SYS + '/vendors/app.html?t=demo');
  await V.p.waitForSelector('#blocked:not(.hidden)', { timeout: 15000 });
  check((await V.p.textContent('#blocked-msg')).includes('מושהה'), 'suspended vendor blocked');

  console.log('\nA11Y DETAILS:\n  ' + (a11y.join('\n  ') || 'none'));
  console.log((errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors'));
  console.log(failures ? `${failures} checks FAILED` : 'ALL CHECKS PASSED');
  await b.close();
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 4).join('\n')); console.log(errors.join('\n')); console.log(a11y.join('\n')); process.exit(2); });
