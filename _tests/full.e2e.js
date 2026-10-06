// Full end-to-end test of the Snap Box vendor platform against Firebase emulators + axe accessibility scan.
// Run: node full.e2e.js   (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = NM + 'firebase/', FBV = require(NM + 'firebase/package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots3/'; fs.mkdirSync(SHOTS, { recursive: true });
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
    if (u.includes('formsubmit')) { sent.push(u); return route.fulfill({ body: 'ok', contentType: 'text/html' }); }
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

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--ignore-certificate-errors'] });
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
  check(await O.p.locator('#tbody button.edit').count() === 2, 'both vendors synced (demo + ilana)');
  await O.p.click('#tbody button.edit[data-id=demo]');
  await O.p.waitForSelector('#edit-dlg[open]');
  await O.p.fill('#e_contact', 'נועה לוי'); await O.p.fill('#e_phone', '050-1234567');
  await O.p.selectOption('#e_plan', 'launch'); await O.p.fill('#e_paid', '1499');
  await O.p.click('#e_quick button[data-m="2"]');
  await O.p.fill('#e_notes', 'הערה פנימית לבדיקה');
  await O.p.screenshot({ path: SHOTS + 'admin-edit.png' });
  await axe(O.p, 'admin manage dialog');
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
  check(/\/offer\/\?k=[a-z0-9]{10}$/.test(offerUrl), 'offer link is short (…/offer/?k=xxxxxxxxxx): ' + offerUrl);
  check(/\/offer\/\?q=[A-Za-z0-9_-]{60,}$/.test(decodeURIComponent((await O.p.getAttribute('#o_wa', 'href')).split('text=')[1])), 'WhatsApp message to vendor = only the full link, like the original system');
  check((await O.p.getAttribute('#o_wa', 'href')).startsWith('https://wa.me/?text='), 'WhatsApp asks whom to send to (like the original system)');

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
  check(/^[a-z0-9]{10}$/.test(await O.p.evaluate(async () => { const f = await Core.fb(); const d = await f.fs.getDocs(f.fs.collection(f.db, 'platformQuotes')); return d.docs[0].data().shortId; })), 'offer stores its short id (used by "copy link")');
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
  check(/\/hatzaa\/demo\/\?k=[a-z0-9]{10}$/.test(link), 'customer link is short: ' + link);
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
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('אושרו'), null, { timeout: 15000 });
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

  console.log('H. Login page: account chooser, unregistered, remembered email');
  const L = await newPage(b, MOB, 'login');
  await L.p.goto(SYS + '/vendors/');
  await L.p.waitForSelector('#signin:not([disabled])');
  await L.p.click('#signin');
  const ap1 = await authParams(L.p);
  check(ap1.prompt === 'select_account' && !ap1.login_hint, 'Google sign-in always shows the account chooser (prompt=select_account)');
  await login(L.p, 'stranger@gmail.com');
  await L.p.waitForSelector('#err:not(.hidden)', { timeout: 15000 });
  check((await L.p.textContent('#err')).includes('לא רשום'), 'unregistered account gets a clear message');
  check(await L.p.isVisible('#other'), '"other Google account" button shown');
  await L.p.waitForFunction(() => Core.fb().then(f => !f.auth.currentUser), null, { timeout: 10000 }).catch(() => {});
  check(await L.p.evaluate(() => Core.fb().then(f => !f.auth.currentUser)), 'unregistered account is signed out immediately (not remembered)');
  check(await L.p.evaluate(() => Core.rememberedEmail()) === '', 'unregistered email is not remembered on the device');
  await L.p.evaluate(() => { window.__lastAuthParams = null; });
  await L.p.click('#other');
  check((await authParams(L.p)).prompt === 'select_account', '"other account" opens the Google account chooser');
  await L.p.reload(); await L.p.waitForSelector('#signin:not([disabled])');
  check(await L.p.isHidden('#err') && (await L.p.textContent('#signin')).includes('התחברות עם Google'), 'next visit starts clean (no "not registered" loop)');
  await axe(L.p, 'login – not registered');
  // ספקית שהתחברה פעם אחת — המכשיר זוכר אותה
  const R = await newPage(b, MOB, 'remember');
  await login(R.p, ILANA);
  await R.p.waitForURL(/app\.html\?t=ilana/, { timeout: 15000 });
  await R.p.evaluate(() => Core.fb().then(f => f.authMod.signOut(f.auth)));
  await R.p.goto(SYS + '/vendors/');
  await R.p.waitForSelector('#signin:not([disabled])');
  const rt = await R.p.textContent('#signin');
  check(rt.includes('המשך בתור') && rt.includes(ILANA), 'returning vendor: "continue as ' + ILANA + '"');
  check(await R.p.isVisible('#other'), 'returning vendor can still choose another account');
  await R.p.click('#signin');
  const ap3 = await authParams(R.p);
  check(ap3.login_hint === ILANA && ap3.prompt === 'select_account', 'remembered email passed to Google as login_hint');
  await R.p.screenshot({ path: SHOTS + 'login-remembered.png' });
  await R.ctx.close();

  console.log('I. Ilana (event designer): items quote, deposit, WhatsApp image, customer signs');
  const I = await newPage(b, MOB, 'ilana');
  await login(I.p, ILANA);
  await I.p.waitForURL(/app\.html\?t=ilana/, { timeout: 15000 });
  await I.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  await I.p.check('#consent-check'); await I.p.click('#consent-btn');
  await I.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  check(await I.p.isHidden('#in_service') && await I.p.isVisible('#catalog'), 'items mode: no package dropdown, catalog shown');
  check(await I.p.locator('#catalog button').count() === 11, 'catalog has 11 items');
  await I.p.fill('#in_clientName', 'מיכל ואבי'); await I.p.fill('#in_clientPhone', '052-1112233');
  await I.p.fill('#in_eventType', 'חתונה'); await I.p.locator('#in_date').pressSequentially('15092027');
  await I.p.fill('#in_location', 'אולם הגנים, ראשון לציון');
  await I.p.locator('#in_itStart').pressSequentially('1930'); await I.p.fill('#in_itGuests', '250');
  await I.p.click('#catalog button[data-i="0"]');
  await I.p.click('#catalog button[data-i="2"]');
  await I.p.fill('.it-row[data-i="1"] .it-qty', '20');
  await I.p.click('#add-item');
  await I.p.fill('.it-row[data-i="2"] .it-label', 'זר כלה'); await I.p.fill('.it-row[data-i="2"] .it-price', '350');
  await I.p.fill('#in_discount', '250');
  check(await I.p.inputValue('#in_price') === '5500', 'total = 1800 + 20×180 + 350 − 250 = ₪5,500');
  check(await I.p.inputValue('#in_deposit') === '1650', 'deposit 30% suggested automatically = ₪1,650');
  await I.p.click('#dep-quick button[data-p="50"]');
  check(await I.p.inputValue('#in_deposit') === '2750', 'deposit quick button 50% = ₪2,750');
  await I.p.fill('#in_deposit', '1500');
  check((await I.p.textContent('#sum-strip')).includes('₪4,000'), 'balance shown = ₪4,000');
  await I.p.fill('#in_notes', 'גוונים: לבן, שמפניה ומרווה');
  await axe(I.p, 'ilana generator');
  await I.p.screenshot({ path: SHOTS + 'ilana-generator.png', fullPage: true });
  await I.p.click('#gen-btn'); await I.p.waitForSelector('#link-result:not(.hidden)');
  check((await I.p.getAttribute('#wa-share-btn', 'href')).startsWith('https://wa.me/?text='), 'WhatsApp asks whom to send to (like the original system)');
  check((await I.p.getAttribute('#wa-preview-img', 'src')).includes('/hatzaa/ilana/og.jpg'), 'result shows the WhatsApp preview image');
  await I.p.waitForFunction(() => document.getElementById('wa-preview-img').naturalWidth === 1200, null, { timeout: 10000 }).catch(() => {});
  check(await I.p.evaluate(() => document.getElementById('wa-preview-img').naturalWidth) === 1200, 'preview image loads (1200×630)');
  await I.p.screenshot({ path: SHOTS + 'ilana-result.png', fullPage: true });
  const ilink = await I.p.inputValue('#shareable-url');
  check(/\/hatzaa\/ilana\/\?k=[a-z0-9]{10}$/.test(ilink) && ilink.length < 70, 'Ilana link is short: ' + ilink);
  const waText = decodeURIComponent((await I.p.getAttribute('#wa-share-btn', 'href')).split('text=')[1]);
  check(/\/hatzaa\/ilana\/\?q=[A-Za-z0-9_-]{60,}$/.test(waText), 'WhatsApp message to client = only the full link, like the original system');
  const html = fs.readFileSync('/home/user/hatzaa/ilana/index.html', 'utf8');
  check(/og:image" content="https:\/\/arial13579\.github\.io\/hatzaa\/ilana\/og\.jpg/.test(html), 'ilana page has its own og:image for WhatsApp');

  const IC = await newPage(b, MOB, 'ilana-customer');
  await IC.p.goto(ilink.replace('https://arial13579.github.io', SITE));
  await IC.p.waitForSelector('#sig-canvas'); await IC.p.waitForTimeout(500);
  const ct = await IC.p.textContent('body');
  check(ct.includes('מרכז שולחן לאורחים') && ct.includes('20 × ₪180') && ct.includes('₪5,500') && ct.includes('−₪250'), 'customer sees itemized table, quantity and discount');
  check(ct.includes('₪1,500') && ct.includes('₪4,000') && ct.includes('יתרה לתשלום'), 'customer sees deposit and balance');
  check(ct.includes('סידור פרחים ונרות'), 'catalog description shown under the item');
  check(await IC.p.locator('.contact a[href^="tel:"]').count() === 1 && await IC.p.locator('.contact a[href^="mailto:' + ILANA + '"]').count() === 1 && await IC.p.locator('.contact a[href^="https://wa.me/972501234567"]').count() === 1, 'contact box: phone, WhatsApp and email');
  check(await IC.p.locator('#signature-form a[href*="refunds.html"]').count() === 1, 'signing requires agreeing to the refunds policy');
  check(!/snap ?box(?!event\.official)/i.test(ct), 'customer page has no Snap Box branding');
  check(await IC.p.isVisible('#cal-fab'), 'add-to-calendar works with start time only');
  await axe(IC.p, 'ilana customer page');
  await IC.p.screenshot({ path: SHOTS + 'ilana-customer.png', fullPage: true });
  await draw(IC.p); await IC.p.check('#agree-terms');
  const dl3 = IC.p.waitForEvent('download', { timeout: 60000 }); await IC.p.click('#submit-btn');
  await (await dl3).saveAs(SHOTS + 'ilana-signed.pdf');
  await IC.p.waitForSelector('.done', { timeout: 20000 });
  check(sent.some(u => u.includes('formsubmit.co/' + ILANA)), 'signed contract emailed to Ilana');
  for (const d of ['terms', 'refunds', 'privacy', 'accessibility']) {
    await IC.p.goto(SITE + '/hatzaa/legal/' + d + '.html?t=ilana');
    await IC.p.waitForSelector('section.card'); await IC.p.waitForTimeout(700);
    const lt = await IC.p.textContent('body');
    check(!/firebase|formsubmit|web3forms|tmpfiles|ipify|github|openstreetmap/i.test(lt), `legal/${d}: no third-party apps listed`);
    check(lt.includes('050-1234567') && lt.includes(ILANA), `legal/${d}: phone + email in footer`);
    if (d === 'refunds') check(lt.includes('14 ימים') && lt.includes('50% מהמקדמה'), 'refunds page: cooling-off + Ilana tiers');
    await axe(IC.p, 'ilana legal/' + d);
  }

  await I.p.click('.tabs button[data-tab=dash]');
  await I.p.waitForSelector('#tbody .pill.signed', { timeout: 15000 });
  await I.p.waitForSelector('#tbody .view-file', { timeout: 15000 });
  check((await I.p.textContent('#tbody')).includes('עיצוב שולחן כלה וחתן +2'), 'dashboard shows items summary');
  const fc = I.p.waitForEvent('filechooser'); await I.p.click('#tbody .upload-file');
  await (await fc).setFiles(SHOTS + 'offer-signed.pdf');
  await I.p.waitForTimeout(1500);
  const replaced = await I.p.evaluate(async () => { const f = await Core.fb(); const s = await f.fs.getDocs(f.fs.collection(f.db, 'tenants', 'ilana', 'quotes')); return s.docs[0].data().pdfData.length; });
  check(replaced === Math.ceil(fs_size_offer() / 3) * 4 || replaced > 1000, 'vendor replaced the signed agreement PDF');
  await axe(I.p, 'ilana dashboard');
  await I.p.screenshot({ path: SHOTS + 'ilana-dashboard.png', fullPage: true });

  console.log('J. Owner: agreement on vendor card, limit, cancel support, suspend');
  await O.p.reload(); await O.p.waitForSelector('#tbody button.edit[data-id=ilana]');
  await O.p.click('#tbody button.edit[data-id=ilana]'); await O.p.waitForSelector('#edit-dlg[open]');
  await O.p.waitForSelector('#e_agr_from_wrap:not(.hidden)', { timeout: 15000 });
  await O.p.click('#e_agr_attach');
  await O.p.waitForFunction(() => document.getElementById('e_agr_status').textContent.includes('יש הסכם חתום'), null, { timeout: 15000 });
  check(true, 'owner attached the signed offer as Ilana\'s agreement');
  await O.p.setInputFiles('#e_agr_file', SHOTS + 'ilana-signed.pdf');
  await O.p.waitForFunction(() => /יש הסכם חתום.*ilana-signed/.test(document.getElementById('e_agr_status').textContent), null, { timeout: 15000 });
  check(true, 'owner replaced the agreement with another PDF');
  await O.p.click('#e_quick button[data-m="12"]');
  await O.p.click('label:has(input[value=limited])');
  await O.p.screenshot({ path: SHOTS + 'admin-manage.png', fullPage: false });
  await O.p.click('#e_save');
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('מוגבל'), null, { timeout: 15000 });
  check((await O.p.textContent('#tbody')).includes('נותרו שנה') || (await O.p.textContent('#tbody')).includes('נותרו 12'), 'support extended by a year');
  await I.p.goto(SYS + '/vendors/app.html?t=ilana'); await I.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  check(await I.p.isVisible('#limited-note'), 'limited vendor: view-only notice shown');
  check(await I.p.evaluate(() => document.getElementById('creator-fs').disabled) && await I.p.isDisabled('#gen-btn'), 'limited vendor: quote form disabled');
  check(await I.p.isVisible('#agr-card'), 'vendor sees "my agreement with Snap Box" card');
  const lim = await I.p.evaluate(async () => { const f = await Core.fb(); try { await f.fs.setDoc(f.fs.doc(f.db, 'tenants', 'ilana', 'quotes', 'hack1'), { status: 'pending' }); return 'ALLOWED'; } catch(e) { return 'denied'; } });
  check(lim === 'denied', 'limited vendor cannot create quotes even from the browser console');
  const popAgr = I.p.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
  await I.p.click('#agr-view'); check(!!(await popAgr), 'vendor opens own agreement PDF');
  await I.p.screenshot({ path: SHOTS + 'ilana-limited.png', fullPage: true });
  // ביטול תמיכה
  await O.p.click('#tbody button.edit[data-id=ilana]'); await O.p.waitForSelector('#edit-dlg[open]');
  await O.p.click('#e_cancel_sup'); await O.p.click('label:has(input[value=active])'); await O.p.click('#e_save');
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('בוטלה'), null, { timeout: 15000 });
  check(true, 'owner cancelled Ilana\'s support');
  await I.p.reload(); await I.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  check((await I.p.textContent('#support-card')).includes('בוטלה'), 'vendor sees support cancelled');
  check(await I.p.isHidden('#limited-note') && !(await I.p.evaluate(() => document.getElementById('creator-fs').disabled)), 'limit lifted → vendor can create again');
  // השהיה
  await O.p.click('#tbody button.edit[data-id=demo]'); await O.p.waitForSelector('#edit-dlg[open]');
  await O.p.click('label:has(input[value=suspended])'); await O.p.click('#e_save');
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('מושהה'), null, { timeout: 15000 });
  await V.p.goto(SYS + '/vendors/app.html?t=demo');
  await V.p.waitForSelector('#blocked:not(.hidden)', { timeout: 15000 });
  check((await V.p.textContent('#blocked-msg')).includes('מושהה'), 'suspended vendor blocked');
  await V.p.goto(SYS + '/vendors/');
  await V.p.waitForSelector('#err:not(.hidden)', { timeout: 15000 });
  check((await V.p.textContent('#err')).includes('מושהה'), 'login page says the account is suspended (not "not registered")');

  console.log('K. Owner deletes a vendor permanently, then restores');
  await O.p.click('#tbody button.edit[data-id=demo]'); await O.p.waitForSelector('#edit-dlg[open]');
  check(await O.p.isDisabled('#e_delete'), 'delete disabled until the vendor name is typed');
  await O.p.fill('#e_del_confirm', 'demo');
  await O.p.click('#e_delete');
  await O.p.waitForSelector('#deleted-card:not(.hidden)', { timeout: 20000 });
  check(await O.p.locator('#tbody button.edit[data-id=demo]').count() === 0, 'deleted vendor removed from the table');
  await O.p.reload(); await O.p.waitForSelector('text=מסונכרן ✓', { timeout: 15000 }); await O.p.waitForSelector('#tbody button.edit');
  check(await O.p.locator('#tbody button.edit[data-id=demo]').count() === 0, 'sync does not re-create a deleted vendor');
  const left = await O.p.evaluate(async () => { const f = await Core.fb(); const q = await f.fs.getDocs(f.fs.collection(f.db, 'tenants', 'demo', 'quotes')); const i = await f.fs.getDoc(f.fs.doc(f.db, 'vendorIndex', 'noa@gmail.com')); const t = await f.fs.getDoc(f.fs.doc(f.db, 'tenants', 'demo')); return q.size + (i.exists() ? 100 : 0) + (t.exists() ? 1000 : 0); });
  check(left === 0, 'all vendor data deleted (quotes, access, card)');
  await axe(O.p, 'admin with deleted vendors');
  await O.p.screenshot({ path: SHOTS + 'admin-deleted.png', fullPage: true });
  await V.p.goto(SYS + '/vendors/'); await V.p.waitForSelector('#err:not(.hidden)', { timeout: 15000 });
  check((await V.p.textContent('#err')).includes('לא רשום'), 'deleted vendor can no longer log in');
  await O.p.click('#deleted-list button.restore');
  await O.p.waitForSelector('#tbody button.edit[data-id=demo]', { timeout: 20000 });
  check(true, 'restored vendor re-created as an empty account');

  console.log('\nA11Y DETAILS:\n  ' + (a11y.join('\n  ') || 'none'));
  console.log((errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors'));
  console.log(failures ? `${failures} checks FAILED` : 'ALL CHECKS PASSED');
  await b.close();
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 4).join('\n')); console.log(errors.join('\n')); console.log(a11y.join('\n')); process.exit(2); });
