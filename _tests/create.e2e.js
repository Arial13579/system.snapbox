// Owner creates a vendor account from a signed offer (no files in the repos): admin dialog → vendor logs in → quote → customer signs on hatzaa/v/.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-create/'; fs.mkdirSync(SHOTS, { recursive: true });
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
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });

  console.log('1. A vendor signed the owner\'s offer');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
  const seeded = await emu('POST', 'platformQuotes?documentId=offer-roy', { fields: {
    vendorName: str('רועי DJ'), contactName: str('רועי כהן'), phone: str('0527778899'), businessType: str('DJ לאירועים'),
    email: str(VENDOR), deposit: int(500), pricingInfo: str('חבילה בסיסית 5 שעות. מעל 300 אורחים תוספת. יוצא מבאר שבע'),
    plan: str('launch'), planLabel: str('מחיר השקה'), price: int(1499), listPrice: int(1999), freeMonths: int(2), extraMonths: int(0),
    monthly: int(89), discount: int(0), total: int(1499), notes: str(''), validDays: int(14), createdISO: str('2026-10-11'),
    status: str('signed'), createdAt: { timestampValue: '2026-10-11T09:50:00Z' }, signedAt: { timestampValue: '2026-10-11T10:12:00Z' },
    ip: { nullValue: null }, userAgent: str('test'), pdfData: str(pdf) } });
  check(seeded.status === 200, 'signed offer exists');

  console.log('2. Owner: "הצעות שנשלחו" → "יצירת משתמש" with the details from the offer');
  const O = await newPage(b, 'owner');
  await O.p.setViewportSize({ width: 1280, height: 900 });
  await login(O.p, OWNER);
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.click('.admin-tabs button[data-tab=offers]');
  await O.p.waitForSelector('#otbody button.vc-new[data-id=offer-roy]', { timeout: 20000 });
  check(true, 'signed offer row has a "יצירת משתמש" button');
  await O.p.click('#otbody button.vc-new[data-id=offer-roy]');
  await O.p.waitForSelector('#vc_dlg[open]');
  check(await O.p.inputValue('#vc_name') === 'רועי DJ' && await O.p.inputValue('#vc_gmail') === VENDOR && await O.p.inputValue('#vc_phone') === '0527778899' && await O.p.inputValue('#vc_contact') === 'רועי כהן', 'dialog prefilled: name, Gmail, phone, contact');
  check(/^[a-z0-9-]{3,40}$/.test(await O.p.inputValue('#vc_slug')), 'a username is suggested: ' + await O.p.inputValue('#vc_slug'));
  check((await O.p.textContent('#vc_ref')).includes('מעל 300 אורחים'), 'shows what the vendor wrote about pricing');
  await O.p.fill('#vc_slug', 'roydj');
  check((await O.p.textContent('#vc_url')).endsWith('/v/?t=roydj'), 'shows the customer link address');
  await O.p.fill('#vc_tag', 'DJ ומוזיקה לאירועים');
  await O.p.click('#vc_swatches button[data-c="#1D4ED8"]');
  await O.p.setInputFiles('#vc_logo_file', { name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
  await O.p.waitForSelector('#vc_logo_prev img');
  const pk = O.p.locator('#vc_pkgs .vc-card').nth(0);
  await pk.locator('[data-f=label]').fill('DJ'); await pk.locator('[data-f=base]').fill('3500'); await pk.locator('[data-f=hours]').fill('5'); await pk.locator('[data-f=extraHour]').fill('500');
  await pk.locator('[data-f=items]').fill('מערכת הגברה\nתאורת רחבה');
  await O.p.click('#vc_add_pkg');
  const pk2 = O.p.locator('#vc_pkgs .vc-card').nth(1);
  await pk2.locator('[data-f=label]').fill('DJ + סקסופון'); await pk2.locator('[data-f=base]').fill('5200'); await pk2.locator('[data-f=hours]').fill('5'); await pk2.locator('[data-f=extraHour]').fill('650');
  await O.p.fill('#vc_deposit', '1000'); await O.p.fill('#vc_city', 'באר שבע');
  await O.p.click('#vc_add_guest'); await O.p.locator('#vc_guest .vc-line [data-f=over]').fill('300'); await O.p.locator('#vc_guest .vc-line [data-f=add]').fill('600');
  await O.p.click('#vc_add_travel'); await O.p.locator('#vc_travel .vc-line [data-f=over]').fill('40'); await O.p.locator('#vc_travel .vc-line [data-f=add]').fill('200');
  await O.p.fill('#vc_common', 'פגישת תכנון ופלייליסט אישי');
  check((await O.p.inputValue('#vc_terms')).includes('{name}'), 'default contract terms are prefilled');
  await axe(O.p, 'create-account dialog');
  await O.p.screenshot({ path: SHOTS + 'dialog.png', fullPage: true });
  await O.p.click('#vc_save');
  await O.p.waitForFunction(() => /המשתמש נוצר/.test(document.getElementById('vc_status').textContent), null, { timeout: 20000 });
  check(true, 'account created');
  const cfg = await emu('GET', 'vendorConfigs/roydj');
  const T = JSON.parse(val(cfg.body.fields.config));
  check(T.business.name === 'רועי DJ' && T.business.email === VENDOR && /^data:image\//.test(T.business.logo) && T.theme.brand === '#1d4ed8', 'config: name, contracts email = Gmail, logo, color');
  check(Object.values(T.pricing.SERVICES).length === 2 && T.pricing.DEPOSIT === 1000 && T.pricing.ORIGIN.lat > 31, 'config: 2 packages, deposit, origin city with coordinates');
  check(T.pricing.GUEST_TIERS.length === 2 && T.pricing.GUEST_TIERS[1].price === 600 && T.pricing.TRAVEL_TIERS[1].price === 200, 'config: guests over 300 +600, over 40 km +200');
  const tn = (await emu('GET', 'tenants/roydj')).body.fields;
  check(val(tn.managed) === 'admin' && val(tn.admins.arrayValue.values[0]) === VENDOR && tn.active.booleanValue === true, 'vendor card created (managed from the admin, active)');
  check(val(tn.pricePaid) === 1499 && val(tn.plan) === 'launch' && val(tn.purchaseDate) === '2026-10-11' && val(tn.supportUntil) === '2026-12-11', 'purchase + 2 months support from the offer');
  check(!!(tn.agreement && tn.agreement.mapValue), 'signed agreement attached');
  check(val((await emu('GET', 'vendorIndex/' + VENDOR)).body.fields.tenant) === 'roydj', 'Gmail gets access');
  await O.p.click('#vc_close');
  await O.p.waitForSelector('#otbody button.vc-edit[data-id=offer-roy]', { timeout: 10000 });
  check(true, 'offer row now says the account was created');

  console.log('3. Reload: sync keeps the access; vendor in the list');
  await O.p.reload(); await O.p.click('.admin-tabs button[data-tab=vendors]'); await O.p.waitForSelector('#tbody button.edit[data-id=roydj]', { timeout: 20000 }).catch(async e => { console.log('   tbody:', (await O.p.textContent('#tbody')).slice(0, 300), '| sync:', await O.p.textContent('#sync-status'), '| errors:', errors.join(' ; ')); throw e; });
  await O.p.waitForFunction(() => /מסונכרן/.test(document.getElementById('sync-status').textContent), null, { timeout: 20000 });
  check(val((await emu('GET', 'vendorIndex/' + VENDOR)).body.fields.tenant) === 'roydj', 'access kept after sync');
  const row = await O.p.locator('#tbody tr', { has: O.p.locator('button.edit[data-id=roydj]') }).textContent();
  check(row.includes('רועי DJ') && !row.includes('ספק ישן'), 'listed as a normal vendor');

  console.log('4. Vendor logs in and sends a quote');
  const V = await newPage(b, 'vendor');
  await login(V.p, VENDOR);
  await V.p.waitForURL(/app\.html\?t=roydj/, { timeout: 15000 });
  await V.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  await V.p.check('#consent-check'); await V.p.click('#consent-btn');
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check((await V.p.textContent('#t-name')) === 'רועי DJ' && await V.p.locator('#t-logo img').count() === 1, 'vendor account: name + logo');
  check(await V.p.locator('#in_service option').count() === 2, '2 packages in the generator');
  await V.p.fill('#in_clientName', 'דנה ואורי'); await V.p.fill('#in_eventType', 'חתונה');
  await V.p.fill('#in_location', 'אשדוד'); await V.p.locator('#in_location').blur();
  await V.p.locator('#in_date').pressSequentially('20082027'); await V.p.locator('#in_startTime').pressSequentially('2000'); await V.p.locator('#in_endTime').pressSequentially('0100');
  await V.p.fill('#in_guests', '350'); await V.p.locator('#in_guests').dispatchEvent('input');
  await V.p.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 }); await V.p.waitForTimeout(300);
  check(await V.p.inputValue('#in_price') === '4300', 'price = 3,500 + guests 600 + travel 200 = ₪4,300 (got ' + await V.p.inputValue('#in_price') + ')');
  check(await V.p.inputValue('#in_deposit') === '1000', 'deposit ₪1,000');
  await V.p.click('#gen-btn'); await V.p.waitForSelector('#link-result:not(.hidden)', { timeout: 20000 });
  const link = await V.p.inputValue('#shareable-url');
  check(/\/hatzaa\/v\/\?t=roydj&k=[a-z0-9]{10}$/.test(link), 'customer link on the shared page: ' + link);
  check((await V.p.getAttribute('#wa-preview-img', 'src')).endsWith('/assets/og-default.jpg'), 'WhatsApp preview: neutral image');

  console.log('5. Customer opens, reads and signs');
  const C = await newPage(b, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE));
  await C.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C.p.waitForTimeout(500);
  const ct = await C.p.textContent('body');
  check(ct.includes('רועי DJ') && ct.includes('4,300') && ct.includes('מערכת הגברה') && ct.includes('פגישת תכנון'), 'customer sees the vendor, price and what is included');
  check(!/snap ?box/i.test(ct), 'no Snap Box on the customer page');
  check(await C.p.locator('.vhead img[src^="data:image/"]').count() === 1, 'vendor logo shown');
  await axe(C.p, 'customer page (v/)');
  await C.p.screenshot({ path: SHOTS + 'customer.png', fullPage: true });
  await draw(C.p); await C.p.check('#agree-terms');
  const dl = C.p.waitForEvent('download', { timeout: 60000 }); await C.p.click('#submit-btn'); await dl;
  await C.p.waitForSelector('.done', { timeout: 20000 });
  check(sent.some(u => u.includes('formsubmit.co/' + VENDOR)), 'signed contract emailed to the vendor');
  const qs = await emu('GET', 'tenants/roydj/quotes');
  check((qs.body.documents || []).some(d => val(d.fields.status) === 'signed'), 'quote marked signed');
  for (const d of ['terms', 'refunds', 'privacy', 'accessibility']) {
    await C.p.goto(SITE + '/hatzaa/legal/' + d + '.html?t=roydj');
    await C.p.waitForSelector('section.card', { timeout: 15000 }); await C.p.waitForTimeout(300);
    const lt = await C.p.textContent('body');
    check(lt.includes('רועי DJ') && lt.includes('0527778899') && !/snap ?box/i.test(lt), `legal/${d}: vendor name + phone, no Snap Box`);
  }
  const k = link.split('k=')[1];
  await C.p.goto(SITE + '/hatzaa/v/?k=' + k);
  await C.p.waitForSelector('#sig-canvas, .done, .card', { timeout: 20000 }); await C.p.waitForTimeout(500);
  check((await C.p.textContent('body')).includes('רועי DJ'), 'short link without ?t= still finds the vendor');
  await C.p.goto(SITE + '/hatzaa/v/?t=nosuchvendor&k=abcdefghij');
  await C.p.waitForFunction(() => /לא נמצאה/.test(document.body.textContent), null, { timeout: 15000 });
  check(true, 'unknown vendor → "not found" message');

  console.log('6. Owner edits the settings later (ניהול → הגדרות הספק)');
  await O.p.click('.admin-tabs button[data-tab=vendors]');
  await O.p.click('#tbody button.edit[data-id=roydj]');
  await O.p.waitForSelector('#e_cfg_box:not(.hidden)');
  await O.p.click('#e_cfg');
  await O.p.waitForFunction(() => document.getElementById('vc_dlg').open && document.querySelectorAll('#vc_pkgs .vc-card').length === 2 && document.getElementById('vc_status').textContent === '', null, { timeout: 15000 });
  check(await O.p.inputValue('#vc_slug') === 'roydj' && await O.p.getAttribute('#vc_slug', 'readonly') !== null, 'opens with the saved settings (username locked)');
  check(await O.p.inputValue('#vc_guest .vc-line [data-f=over]') === '300' && await O.p.inputValue('#vc_city') === 'באר שבע', 'guest/travel rules and city come back');
  await O.p.locator('#vc_pkgs .vc-card').nth(0).locator('[data-f=base]').fill('3800');
  await O.p.click('#vc_save');
  await O.p.waitForFunction(() => /נשמר/.test(document.getElementById('vc_status').textContent), null, { timeout: 20000 });
  const T2 = JSON.parse(val((await emu('GET', 'vendorConfigs/roydj')).body.fields.config));
  check(JSON.stringify(Object.keys(T2.pricing.SERVICES)) === JSON.stringify(Object.keys(T.pricing.SERVICES)), 'package keys stay the same after editing');
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check((await V.p.textContent('#in_service')).includes('3,800'), 'vendor sees the new price');
  await O.p.click('#vc_close');

  console.log('7. Delete the vendor');
  await O.p.click('#tbody button.edit[data-id=roydj]');
  await O.p.fill('#e_del_confirm', 'roydj'); await O.p.click('#e_delete');
  await O.p.waitForFunction(() => !document.querySelector('#tbody button.edit[data-id=roydj]'), null, { timeout: 30000 });
  check((await emu('GET', 'vendorConfigs/roydj')).status === 404, 'settings deleted');
  check(!(await emu('GET', 'platformQuotes/offer-roy')).body.fields.tenant, 'offer can be used again to create an account');
  check((await emu('GET', 'vendorIndex/' + VENDOR)).status === 404, 'access removed');

  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); console.error(e.stack); process.exit(2); });
