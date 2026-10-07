// New vendor onboarding (snap cup · snapcup, signed as "כחגח"): signed offer → owner admin fills the card + agreement → quote → customer page.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = NM + 'firebase/', FBV = require(NM + 'firebase/package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-onboard/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'snapboxevent.official@gmail.com';
// the real registry + the sample vendor snap cup (hatzaa/snapcup), which the owner deleted from the live list
const REG = fs.readFileSync('/home/user/system.snapbox/vendors/registry.js', 'utf8')
  + "\nwindow.REGISTRY.push({ slug: 'snapcup', name: 'snap cup', offerName: 'כחגח', admins: ['snapboxevent.official@gmail.com'] });";
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
    .filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' [' + ((n.any[0] && n.any[0].message) || '') + ']').join(' | ')));
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

  console.log('1. The vendor signed the owner\'s offer (signed as "כחגח")');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
  const seeded = await emu('POST', 'platformQuotes?documentId=offer-kachgach', { fields: {
    vendorName: str('כחגח'), contactName: str('דוד לוי'), phone: str('0546056180'), businessType: str('צלם אח יקר'),
    plan: str('regular'), planLabel: str('מחיר רגיל'), price: int(1999), listPrice: int(1999), freeMonths: int(0), extraMonths: int(0),
    monthly: int(69), discount: int(0), total: int(1999), notes: str(''), validDays: int(14), createdISO: str('2026-10-07'),
    status: str('signed'), createdAt: { timestampValue: '2026-10-07T09:50:00Z' }, signedAt: { timestampValue: '2026-10-07T10:12:00Z' },
    ip: str('1.2.3.4'), userAgent: str('test'), pdfData: str(pdf) } });
  check(seeded.status === 200, 'signed offer exists (vendorName "כחגח")');
  // Before the move, the Gmail belonged to Ilana (tenant + login index)
  await emu('POST', 'tenants?documentId=ilana', { fields: { slug: str('ilana'), name: str('אילנה עיצוב אירועים'), admins: { arrayValue: { values: [str(VENDOR)] } }, active: { booleanValue: true } } });
  await emu('POST', 'vendorIndex?documentId=' + encodeURIComponent(VENDOR), { fields: { tenant: str('ilana') } });

  console.log('2. Owner opens the admin: snap cup is created and filled from the signed offer (offerName)');
  const O = await newPage(b, 'owner');
  await login(O.p, OWNER);
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector('#tbody button.edit[data-id=snapcup]', { timeout: 20000 });
  let t = null;
  for (let i = 0; i < 20; i++) { t = await emu('GET', 'tenants/snapcup'); if (t.body.fields && t.body.fields.agreement) break; await new Promise(r => setTimeout(r, 300)); }
  const F = t.body.fields || {};
  check(val(F.name) === 'snap cup', 'vendor card created: snap cup');
  check(val(F.contactName) === 'דוד לוי' && val(F.phone) === '0546056180', 'contact + phone from the offer');
  check(val(F.plan) === 'regular' && val(F.pricePaid) === 1999, 'plan "מחיר רגיל", paid ₪1,999');
  check(val(F.purchaseDate) === '2026-10-07', 'purchase date = signing date (7.10.2026)');
  check(val(F.supportUntil) === '', 'support: 0 months → none');
  const agr = F.agreement && F.agreement.mapValue && F.agreement.mapValue.fields;
  check(agr && val(agr.source) === 'offer', 'agreement attached from the signed offer');
  const file = await emu('GET', 'tenants/snapcup/files/agreement');
  check(file.status === 200 && val(file.body.fields.pdfData) === pdf, 'signed PDF stored in the vendor card');
  await O.p.reload(); await O.p.waitForSelector('#tbody button.edit[data-id=snapcup]', { timeout: 20000 });
  await O.p.waitForFunction(() => document.getElementById('tbody').textContent.includes('דוד לוי'), null, { timeout: 15000 });
  const row = await O.p.locator('#tbody tr', { has: O.p.locator('button.edit[data-id=snapcup]') }).textContent();
  check(row.includes('snap cup') && row.includes('דוד לוי') && row.includes('מחיר רגיל') && row.includes('1,999'), 'admin row: name, contact, plan and amount');
  check(row.includes(VENDOR) && !row.includes('רק אתה') && !row.includes('ספק ישן'), 'admin row shows the vendor login Gmail');
  const irow = await O.p.locator('#tbody tr', { has: O.p.locator('button.edit[data-id=ilana]') }).textContent();
  check(irow.includes('אין עדיין Gmail להתחברות'), 'vendor without Gmail: clear label');
  const again = await emu('GET', 'tenants/snapcup');
  check(val(again.body.fields.contactName) === 'דוד לוי', 'second sync keeps the details (filled only once)');
  await O.p.click('#tbody button.edit[data-id=snapcup]');
  await O.p.waitForFunction(() => document.getElementById('e_agr_status').textContent.includes('יש הסכם חתום'), null, { timeout: 15000 });
  check(true, 'manage dialog: signed agreement present');
  await O.p.screenshot({ path: SHOTS + 'admin-manage.png' });
  await O.p.click('#edit-close');
  await O.p.screenshot({ path: SHOTS + 'admin-vendors.png', fullPage: true });
  const vi = await emu('GET', 'vendorIndex/' + encodeURIComponent(VENDOR));
  check(vi.status === 200 && val(vi.body.fields.tenant) === 'snapcup', 'the Gmail moved from Ilana to snap cup (login index)');
  const il = await emu('GET', 'tenants/ilana');
  check(!((il.body.fields || {}).admins || {}).arrayValue || !(il.body.fields.admins.arrayValue.values || []).length, 'Ilana no longer has the Gmail');

  console.log('3. Owner can enter the account; David logs in with the Gmail and creates a photography quote');
  await O.p.goto(SYS + '/vendors/app.html?t=snapcup');
  await O.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check((await O.p.textContent('body')).includes('snap cup'), 'owner: "כניסה לחשבון" opens snap cup');
  const V = await newPage(b, 'vendor');
  await login(V.p, VENDOR);
  await V.p.waitForURL(/app\.html\?t=snapcup/, { timeout: 15000 });
  await V.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  check(true, 'David\'s Gmail opens snap cup → first login asks to accept the terms');
  await V.p.check('#consent-check'); await V.p.click('#consent-btn');
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 15000 });
  check((await V.p.textContent('body')).includes('snap cup'), 'vendor account shows snap cup');
  check((await V.p.textContent('#support-card')).includes('לא כלולה כרגע'), 'support card: not included (0 months) + add via WhatsApp');
  await V.p.waitForSelector('#agr-card:not(.hidden)', { timeout: 15000 }).catch(() => {});
  check(await V.p.isVisible('#agr-card'), 'vendor sees "my agreement" card (the signed offer)');
  const Op = O.p; O.p = V.p;   // the quote is created by David himself
  check(await O.p.isHidden('#in_service') && await O.p.isVisible('#catalog'), 'items mode: price list instead of packages');
  check(await O.p.locator('#catalog button').count() === 8, 'price list has 8 photography items');
  await O.p.fill('#in_clientName', 'נועה ואיתי'); await O.p.fill('#in_clientPhone', '052-1112233');
  await O.p.fill('#in_eventType', 'חתונה'); await O.p.locator('#in_date').pressSequentially('20082027');
  await O.p.fill('#in_location', 'אולם הגנים, ראשון לציון');
  await O.p.locator('#in_itStart').pressSequentially('1930'); await O.p.fill('#in_itGuests', '250');
  await O.p.click('#catalog button[data-i="0"]');
  await O.p.click('#catalog button[data-i="2"]');
  check(await O.p.inputValue('#in_price') === '8000', 'total = stills 3,500 + video 4,500 = ₪8,000 (got ' + await O.p.inputValue('#in_price') + ')');
  check(await O.p.inputValue('#in_deposit') === '2400', 'deposit 30% suggested = ₪2,400');
  await axe(O.p, 'snapcup generator');
  await O.p.click('#gen-btn'); await O.p.waitForSelector('#link-result:not(.hidden)', { timeout: 20000 });
  const link = await O.p.inputValue('#shareable-url');
  check(/\/hatzaa\/snapcup\/\?k=[a-z0-9]{10}$/.test(link), 'customer link = short link on the neutral site');
  check((await O.p.getAttribute('#wa-share-btn', 'href')).startsWith('https://wa.me/972521112233?text='), 'WhatsApp opens the client chat directly');
  check((await O.p.getAttribute('#wa-preview-img', 'src')).includes('/hatzaa/snapcup/og.jpg'), 'preview shows the snap cup WhatsApp image');
  await O.p.waitForFunction(() => document.getElementById('wa-preview-img').naturalWidth === 1200, null, { timeout: 10000 }).catch(() => {});
  check(await O.p.evaluate(() => document.getElementById('wa-preview-img').naturalWidth) === 1200, 'WhatsApp image loads (1200×630)');
  check(await O.p.textContent('#wa-preview-url') === link, 'preview: image + link line');
  await O.p.screenshot({ path: SHOTS + 'result.png', fullPage: true });

  O.p = Op;
  await V.p.screenshot({ path: SHOTS + 'vendor-result.png', fullPage: true });

  console.log('4. The customer opens the link');
  const C = await newPage(b, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE));
  await C.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C.p.waitForTimeout(500);
  const ct = await C.p.textContent('body');
  const noBrand = txt => !/snap ?box/i.test(txt.replace(/snapboxevent\.official@gmail\.com/gi, ''));   // the vendor email the owner chose contains "snapbox"
  check(ct.includes('snap cup') && ct.includes('צלם אחלה כבר ביקר לי'), 'customer sees snap cup + the tagline');
  check(ct.includes('צילום סטילס לאירוע') && ct.includes('צילום וידאו') && ct.includes('8,000') && ct.includes('2,400'), 'customer sees the items, total and deposit');
  check(ct.includes('מספר עוסק 3333333'), 'business ID shown');
  check(noBrand(ct), 'no Snap Box on the customer page (besides the vendor email the owner chose)');
  check(await C.p.locator('.contact a[href^="tel:"]').count() === 1 && await C.p.locator('.contact a[href^="https://wa.me/972546056180"]').count() === 1 && await C.p.locator('.contact a[href^="mailto:snapboxevent.official@gmail.com"]').count() === 1, 'contact box: phone, WhatsApp and email');
  await axe(C.p, 'snapcup customer page');
  await C.p.screenshot({ path: SHOTS + 'customer.png', fullPage: true });
  for (const d of ['terms', 'privacy', 'accessibility', 'refunds']) {
    await C.p.goto(SITE + '/hatzaa/legal/' + d + '.html?t=snapcup');
    await C.p.waitForSelector('section.card'); await C.p.waitForTimeout(500);
    const lt = await C.p.textContent('body');
    check(lt.includes('snap cup') && lt.includes('054-6056180') && lt.includes('3333333') && noBrand(lt), `legal/${d}: snap cup, phone and business ID, no Snap Box`);
    if (d === 'refunds') check(lt.includes('יוחזר 50% מהמקדמה') && lt.includes('פעם אחת ללא עלות'), 'refunds page shows the vendor policy');
    await axe(C.p, 'snapcup legal/' + d);
  }

  await b.close();
  if (errors.length) { console.log('\nPage errors:'); errors.forEach(e => console.log('  - ' + e)); }
  console.log(failures ? `\n${failures} FAILED` : (errors.length ? '\nchecks passed, but there were page errors' : '\nALL CHECKS PASSED'));
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
