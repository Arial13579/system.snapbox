// New vendor onboarding (SNAPIIII · snapiiii, photo booth): signed offer → owner admin fills the card + agreement → quote → customer page.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-onboard/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'snapboxevent.official@gmail.com';
const REG = fs.readFileSync('/home/user/system.snapbox/vendors/registry.js', 'utf8');   // the real registry
const errors = [];
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
    if (u.includes('formsubmit')) return route.fulfill({ body: 'ok', contentType: 'text/html' });
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

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });

  console.log('1. The vendor signed the owner\'s offer (as in the "סיכום להקמה")');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
  const seeded = await emu('POST', 'platformQuotes?documentId=offer-snapiiii', { fields: {
    vendorName: str('SNAPIIII'), contactName: str('אלירן לבייב'), phone: str('0546056180'), businessType: str('עמדת צילום'),
    email: str(VENDOR), deposit: int(500), pricingInfo: str('נסיעה רחוקה מבאר שבע תוספת של 150 שקל'),
    plan: str('regular'), planLabel: str('מחיר רגיל'), price: int(1999), listPrice: int(1999), freeMonths: int(0), extraMonths: int(0),
    monthly: int(69), discount: int(0), total: int(1999), notes: str(''), validDays: int(14), createdISO: str('2026-10-07'),
    status: str('signed'), createdAt: { timestampValue: '2026-10-07T09:50:00Z' }, signedAt: { timestampValue: '2026-10-07T10:12:00Z' },
    ip: str('1.2.3.4'), userAgent: str('test'), pdfData: str(pdf) } });
  check(seeded.status === 200, 'signed offer for SNAPIIII exists');

  console.log('2. Owner opens the admin: the new vendor is created and filled from the signed offer');
  const O = await newPage(b, 'owner');
  await login(O.p, OWNER);
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector('#tbody button.edit[data-id=snapiiii]', { timeout: 20000 });
  let t = null;
  for (let i = 0; i < 20; i++) { t = await emu('GET', 'tenants/snapiiii'); if (t.body.fields && t.body.fields.agreement) break; await new Promise(r => setTimeout(r, 300)); }
  const F = t.body.fields || {};
  check(val(F.name) === 'SNAPIIII' && val(F.active) !== false, 'vendor card created: SNAPIIII');
  check(val(F.contactName) === 'אלירן לבייב' && val(F.phone) === '0546056180', 'contact + phone from the offer');
  check(val(F.plan) === 'regular' && val(F.pricePaid) === 1999, 'plan "מחיר רגיל", paid ₪1,999');
  check(val(F.purchaseDate) === '2026-10-07', 'purchase date = signing date (7.10.2026)');
  check(val(F.supportUntil) === '', 'support: 0 months → none');
  const agr = F.agreement && F.agreement.mapValue && F.agreement.mapValue.fields;
  check(agr && val(agr.source) === 'offer', 'agreement attached from the signed offer');
  const file = await emu('GET', 'tenants/snapiiii/files/agreement');
  check(file.status === 200 && val(file.body.fields.pdfData) === pdf, 'signed PDF stored in the vendor card');
  await O.p.reload(); await O.p.waitForSelector('#tbody button.edit[data-id=snapiiii]', { timeout: 20000 });
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('אלירן לבייב'), null, { timeout: 15000 });
  const row = await O.p.locator('#tbody tr', { has: O.p.locator('button.edit[data-id=snapiiii]') }).textContent();
  check(row.includes('אלירן לבייב') && row.includes('מחיר רגיל') && row.includes('1,999') && row.includes(VENDOR), 'admin row: contact, plan, amount and login Gmail');
  const again = await emu('GET', 'tenants/snapiiii');
  check(val(again.body.fields.contactName) === 'אלירן לבייב', 'second sync keeps the details (filled only once)');
  await O.p.click('#tbody button.edit[data-id=snapiiii]');
  await O.p.waitForFunction(() => document.getElementById('e_agr_status').textContent.includes('יש הסכם חתום'), null, { timeout: 15000 });
  check(true, 'manage dialog: signed agreement present');
  await O.p.screenshot({ path: SHOTS + 'admin-manage.png' });
  await O.p.click('#edit-close');
  await O.p.screenshot({ path: SHOTS + 'admin-vendors.png', fullPage: true });

  console.log('3. Eliran logs in with his Gmail and creates a photo booth quote');
  const V = await newPage(b, 'vendor');
  await login(V.p, VENDOR);
  await V.p.waitForURL(/app\.html\?t=snapiiii/, { timeout: 15000 });
  await V.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  await V.p.check('#consent-check'); await V.p.click('#consent-btn');
  check(true, 'Gmail opens SNAPIIII → terms consent');
  O.p = V.p;
  await O.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  const top = await O.p.textContent('body');
  check(top.includes('SNAPIIII'), 'vendor account shows SNAPIIII');
  check((await O.p.textContent('#support-card')).includes('לא כלולה כרגע'), 'support card: not included (0 months) + add via WhatsApp');
  check(await O.p.locator('#in_service option').count() === 2, '2 photo booth packages in the generator');
  await O.p.fill('#in_clientName', 'נועה ואיתי'); await O.p.fill('#in_clientPhone', '052-1112233');
  await O.p.fill('#in_eventType', 'חתונה');
  await O.p.selectOption('#in_service', 'booth_m');
  await O.p.fill('#in_location', 'באר שבע'); await O.p.locator('#in_location').blur();
  await O.p.locator('#in_date').pressSequentially('20082027'); await O.p.locator('#in_startTime').pressSequentially('2000'); await O.p.locator('#in_endTime').pressSequentially('0100');
  await O.p.fill('#in_guests', '600'); await O.p.locator('#in_guests').dispatchEvent('input');
  await O.p.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 });
  await O.p.waitForTimeout(300);
  check(await O.p.inputValue('#in_price') === '5350', 'price = booth+magnets 3,200 + 2 extra hours 1,000 + over 500 guests 1,000 + far travel 150 = ₪5,350 (got ' + await O.p.inputValue('#in_price') + ')');
  check(await O.p.inputValue('#in_deposit') === '500', 'deposit ₪500');
  await axe(O.p, 'snapiiii generator');
  await O.p.click('#gen-btn'); await O.p.waitForSelector('#link-result:not(.hidden)', { timeout: 20000 });
  const link = await O.p.inputValue('#shareable-url');
  check(/\/hatzaa\/snapiiii\/\?k=[a-z0-9]{10}$/.test(link), 'customer link = short link on the neutral site');
  check((await O.p.getAttribute('#wa-share-btn', 'href')).startsWith('https://wa.me/972521112233?text='), 'WhatsApp opens the client chat directly');
  check((await O.p.getAttribute('#wa-preview-img', 'src')).includes('/hatzaa/snapiiii/og.jpg'), 'preview shows the SNAPIIII WhatsApp image');
  await O.p.waitForFunction(() => document.getElementById('wa-preview-img').naturalWidth === 1200, null, { timeout: 10000 }).catch(() => {});
  check(await O.p.evaluate(() => document.getElementById('wa-preview-img').naturalWidth) === 1200, 'WhatsApp image loads (1200×630)');
  check(await O.p.textContent('#wa-preview-url') === link, 'preview: image + link line');
  await O.p.screenshot({ path: SHOTS + 'result.png', fullPage: true });

  console.log('4. The customer opens the link');
  const C = await newPage(b, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE));
  await C.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C.p.waitForTimeout(500);
  const ct = await C.p.textContent('body');
  check(ct.includes('SNAPIIII') && ct.includes('עמדת צילום + מגנטים') && ct.includes('5,350'), 'customer sees SNAPIIII, the package and the price');
  const noBrand = t => !/snap ?box/i.test(t.replace(/snapboxevent\.official@gmail\.com/gi, ''));
  check(noBrand(ct), 'no Snap Box on the customer page (besides the vendor email)');
  check(await C.p.locator('.contact a[href^="tel:"]').count() === 1 && await C.p.locator('.contact a[href^="https://wa.me/972546056180"]').count() === 1 && await C.p.locator('.contact a[href^="mailto:"]').count() === 1, 'contact box: phone, WhatsApp and email');
  await axe(C.p, 'snapiiii customer page');
  await C.p.screenshot({ path: SHOTS + 'customer.png', fullPage: true });
  for (const d of ['terms', 'privacy', 'accessibility', 'refunds']) {
    await C.p.goto(SITE + '/hatzaa/legal/' + d + '.html?t=snapiiii');
    await C.p.waitForSelector('section.card'); await C.p.waitForTimeout(500);
    const lt = await C.p.textContent('body');
    check(lt.includes('SNAPIIII') && lt.includes('054-6056180') && noBrand(lt), `legal/${d}: SNAPIIII + phone, no Snap Box`);
    if (d === 'refunds') check(lt.includes('בניכוי 10% דמי טיפול') && lt.includes('פעם אחת ללא עלות'), 'refunds page shows the vendor policy');
    await axe(C.p, 'snapiiii legal/' + d);
  }

  console.log('5. Vendor manages own packages + discount 10% / 20% / custom');
  const VP = V.p;
  check(await VP.isHidden('.items-box'), 'package-dropdown vendor: the items box is hidden (it was showing with a dead button)');
  await VP.click('.tabs button[data-tab="dash"]');
  await VP.waitForSelector('#pkg-list .pkg-row');
  check(await VP.locator('#pkg-list .pkg-row').count() === 2, 'dashboard: "החבילות שלי" lists the 2 packages');
  await VP.click('#pkg-card .pkg-new');
  await VP.fill('#pk_label', 'עמדת צילום פרימיום'); await VP.fill('#pk_price', '3900'); await VP.fill('#pk_hours', '4'); await VP.fill('#pk_extra', '450');
  await VP.fill('#pk_inc', 'מגנטים ללא הגבלה\nאלבום אורחים');
  await axe(VP, 'package dialog');
  await VP.click('#pk_save');
  await VP.waitForFunction(() => document.querySelectorAll('#pkg-list .pkg-row').length === 3);
  check(true, 'new package added');
  check(await VP.locator('#in_service option').count() === 3 && (await VP.textContent('#in_service')).includes('עמדת צילום פרימיום · מ-₪3,900'), 'new package appears in the "חבילה" dropdown');
  await VP.click('.pkg-edit[data-id="booth"]');
  check(await VP.inputValue('#pk_price') === '2500', 'edit opens with the current price');
  await VP.fill('#pk_price', '2700'); await VP.click('#pk_save');
  await VP.waitForFunction(() => document.getElementById('in_service').textContent.includes('₪2,700'));
  check(true, 'edited price shows in the dropdown');
  await VP.click('.pkg-del[data-id="booth"]');
  await VP.waitForFunction(() => document.querySelectorAll('#pkg-list .pkg-row').length === 2);
  check(await VP.locator('#in_service option[value="booth"]').count() === 0, 'deleted package removed from the dropdown');
  await VP.screenshot({ path: SHOTS + 'packages.png', fullPage: true });
  await VP.reload(); await VP.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  const opts = await VP.locator('#in_service option').allTextContents();
  check(opts.length === 2 && opts.some(o => o.includes('פרימיום')), 'packages saved (after reload): ' + opts.join(' | '));
  await VP.click('.tabs button[data-tab="new"]');
  const pid = await VP.evaluate(() => [...document.querySelectorAll('#in_service option')].find(o => o.textContent.includes('פרימיום')).value);
  await VP.fill('#in_clientName', 'שירה ועומר'); await VP.fill('#in_eventType', 'בר מצווה');
  await VP.selectOption('#in_service', pid);
  check((await VP.textContent('#svc-inc')).includes('מגנטים ללא הגבלה'), 'what the package includes is shown under the dropdown');
  await VP.fill('#in_location', 'אופקים'); await VP.locator('#in_location').blur();
  await VP.locator('#in_date').pressSequentially('05052027'); await VP.locator('#in_startTime').pressSequentially('2000'); await VP.locator('#in_endTime').pressSequentially('0000');
  await VP.fill('#in_guests', '100'); await VP.locator('#in_guests').dispatchEvent('input');
  await VP.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 });
  await VP.waitForTimeout(300);
  check(await VP.inputValue('#in_price') === '4050', 'price = premium 3,900 + far travel 150 = ₪4,050 (got ' + await VP.inputValue('#in_price') + ')');
  await VP.click('#disc-quick button[data-p="10"]');
  check(await VP.inputValue('#in_discount') === '405' && await VP.inputValue('#in_price') === '3645', '10% discount → −₪405, price ₪3,645');
  await VP.click('#disc-quick button[data-p="20"]');
  check(await VP.inputValue('#in_discount') === '810' && await VP.inputValue('#in_price') === '3240', '20% discount → −₪810, price ₪3,240');
  await VP.fill('#in_discount', '500');
  check(await VP.inputValue('#in_price') === '3550', 'custom discount ₪500 → price ₪3,550');
  check((await VP.textContent('#price-breakdown')).includes('הנחה'), 'breakdown shows the discount line');
  await axe(VP, 'generator with discount');
  await VP.click('#gen-btn'); await VP.waitForSelector('#link-result:not(.hidden)', { timeout: 20000 });
  const link2 = await VP.inputValue('#shareable-url');
  const C2 = await newPage(b, 'customer2');
  await C2.p.goto(link2.replace('https://arial13579.github.io', SITE));
  await C2.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C2.p.waitForTimeout(500);
  const ct2 = await C2.p.textContent('body');
  check(ct2.includes('עמדת צילום פרימיום') && ct2.includes('מגנטים ללא הגבלה') && ct2.includes('אלבום אורחים'), 'customer sees the new package and what it includes');
  check(ct2.includes('3,550') && ct2.includes('4,050') && ct2.includes('הנחה'), 'customer sees price before discount, the discount and the final price');
  await axe(C2.p, 'customer page with discount');
  await C2.p.screenshot({ path: SHOTS + 'customer-discount.png', fullPage: true });

  console.log('6. What closes deals: price breakdown, perks, optional extras, validity, payment terms');
  await VP.click('.tabs button[data-tab="new"]');
  await VP.reload(); await VP.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await VP.click('.tabs button[data-tab="new"]');
  check(await VP.inputValue('#in_valid') === '14' && (await VP.textContent('#valid-hint')).startsWith('בתוקף עד'), 'validity: 14 days by default, shows the date');
  check(await VP.locator('#pay-methods input:checked').count() === 3, 'payment methods: 3 defaults ticked');
  await VP.fill('#in_clientName', 'מאיה ודניאל'); await VP.fill('#in_eventType', 'חתונה');
  await VP.selectOption('#in_service', 'booth_m');
  await VP.fill('#in_location', 'דימונה'); await VP.locator('#in_location').blur();
  await VP.locator('#in_date').pressSequentially('01092027'); await VP.locator('#in_startTime').pressSequentially('2000'); await VP.locator('#in_endTime').pressSequentially('0000');
  await VP.fill('#in_guests', '300'); await VP.locator('#in_guests').dispatchEvent('input');
  await VP.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 }); await VP.waitForTimeout(300);
  check(await VP.inputValue('#in_price') === '3850', 'price = 3,200 + 1 extra hour 500 + travel 150 = ₪3,850 (got ' + await VP.inputValue('#in_price') + ')');
  await VP.click('#disc-quick button[data-p="10"]');
  await VP.selectOption('#in_valid', '7'); await VP.fill('#in_due', 'עד שבוע לפני האירוע');
  await VP.check('#pay-methods input[value="פייבוקס"]');
  await VP.click('#add-perk'); const pr = VP.locator('#perks .mrow').last();
  await pr.locator('[data-k="label"]').fill('100 מגנטים נוספים'); await pr.locator('[data-k="worth"]').fill('300');
  await VP.click('#add-extra'); const ex = VP.locator('#extras .mrow').last();
  await ex.locator('[data-k="label"]').fill('שעה נוספת'); await ex.locator('[data-k="price"]').fill('500'); await ex.locator('[data-k="desc"]').fill('הארכת הפעילות');
  await axe(VP, 'generator with perks / extras / payment');
  await VP.screenshot({ path: SHOTS + 'more-box.png', fullPage: true });
  await VP.click('#gen-btn'); await VP.waitForSelector('#link-result:not(.hidden)', { timeout: 20000 });
  const link3 = await VP.inputValue('#shareable-url');
  const C3 = await newPage(b, 'customer3');
  await C3.p.goto(link3.replace('https://arial13579.github.io', SITE));
  await C3.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C3.p.waitForTimeout(500);
  const t3 = await C3.p.textContent('body');
  check(t3.includes('פירוט המחיר') && t3.includes('3,200') && t3.includes('זמן נוסף') && t3.includes('−₪385') && t3.includes('3,465'), 'client sees the price breakdown: package, extra time, travel, discount, total');
  check(t3.includes('100 מגנטים נוספים') && t3.includes('מתנה') && t3.includes('300'), 'client sees the free perk and its worth');
  check(t3.includes('תוספות אפשריות') && t3.includes('שעה נוספת') && t3.includes('+₪500') && t3.includes('לא כלולות במחיר'), 'client sees optional extras (not in the total)');
  check(t3.includes('תשלום ולוח זמנים') && t3.includes('עם החתימה') && t3.includes('עד שבוע לפני האירוע') && t3.includes('פייבוקס'), 'client sees payment schedule and methods');
  check(/בתוקף עד \d\d\/\d\d\/\d{4}/.test(t3), 'client sees "valid until" date');
  check(await C3.p.isVisible('#submit-btn'), 'valid quote can be signed');
  await axe(C3.p, 'customer page with perks / extras / payment');
  await C3.p.screenshot({ path: SHOTS + 'customer-more.png', fullPage: true });

  console.log('7. Expired quote cannot be signed');
  const expired = await VP.evaluate(() => Core.shareUrl('snapiiii', { id: 'expired1', clientName: 'בדיקה', eventType: 'חתונה', location: 'x', date: '01/01/2027', price: 1000, deposit: 200, service: 'booth', validUntil: '2020-01-01' }));
  const C4 = await newPage(b, 'customer4');
  await C4.p.goto(expired.replace('https://arial13579.github.io', SITE));
  await C4.p.waitForSelector('#sig-canvas', { timeout: 20000 });
  const t4 = await C4.p.textContent('body');
  check(t4.includes('תוקף ההצעה פג') && await C4.p.locator('#submit-btn').count() === 0, 'expired: no sign button, asks for an updated quote');
  check(await C4.p.locator('a[href*="wa.me/972546056180"]').count() >= 1, 'expired: WhatsApp button to ask for an updated quote');
  await C4.p.screenshot({ path: SHOTS + 'customer-expired.png', fullPage: true });

  await b.close();
  if (errors.length) { console.log('\nPage errors:'); errors.forEach(e => console.log('  - ' + e)); }
  console.log(failures ? `\n${failures} FAILED` : (errors.length ? '\nchecks passed, but there were page errors' : '\nALL CHECKS PASSED'));
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
