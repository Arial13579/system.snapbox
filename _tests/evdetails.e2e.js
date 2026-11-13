// Dashboard row actions (upload/view/replace · event details · copy link · delete) + event-details window (every field editable, deposit/calendar/paid checkboxes, paid row = green) for vendors, and the same row actions + paid in the owner's sent-offers table.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-ev/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'ev.dj@gmail.com', SLUG = 'vevdetaa';
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



(async () => {
  const win = {}; new Function('window', fs.readFileSync('/home/user/hatzaa/snapiiii/config.js', 'utf8'))(win);
  const cfg = win.TENANT; cfg.business.name = 'שירז אירועים'; cfg.business.logo = ''; cfg.business.email = 'shiraz@gmail.com';
  const now = new Date();
  await emu('PATCH', 'vendorConfigs/' + SLUG, { fields: { config: str(JSON.stringify(cfg)), updatedAt: ts(now) } });
  await emu('PATCH', 'tenants/' + SLUG, { fields: fields({ slug: SLUG, name: 'שירז אירועים', admins: [VENDOR], active: true, managed: 'admin', createdAt: now }) });
  await emu('PATCH', 'vendorIndex/' + VENDOR, { fields: fields({ tenant: SLUG }) });
  const base = { clientName: 'שירז', eventType: 'חתונה', location: 'אלגריה בילו', date: '10/03/2027', startTime: '20:00', endTime: '22:00', guests: 300, price: 1299, deposit: 200, service: 'booth', createdAt: now };
  await emu('PATCH', `tenants/${SLUG}/quotes/qp`, { fields: fields({ ...base, status: 'pending' }) });
  await emu('PATCH', `tenants/${SLUG}/quotes/qs`, { fields: fields({ ...base, clientName: 'משפחת כהן', price: 4200, status: 'signed', signedAt: now, hasPdf: true, createdAt: new Date(now - 60e3) }) });
  await emu('PATCH', `tenants/${SLUG}/quotes/qs/pdf/file`, { fields: fields({ pdfData: 'JVBERi0xLjQK', at: now }) });
  const pdfPath = S + '/tiny.pdf'; fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const V = await newPage(b, 'vendor');
  await V.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  await login(V.p, VENDOR);
  await V.p.waitForSelector('#consent:not(.hidden), #main-app:not(.hidden)', { timeout: 20000 });
  if (await V.p.isVisible('#consent')) { await V.p.check('#consent-check'); await V.p.click('#consent-btn'); }
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await V.p.click('.tabs button[data-tab=dash]');
  await V.p.waitForSelector('#tbody .ev-open[data-id="qp"]', { timeout: 15000 });
  const btns = async id => (await V.p.locator(`#tbody tr:has(.ev-open[data-id="${id}"]) .row-acts button`).allTextContents()).map(x => x.trim()).join(' | ');

  console.log('1. Row actions');
  check(await btns('qp') === '📤 העלה קובץ | 📋 פרטי אירוע | העתק קישור | מחק', 'pending: ' + await btns('qp'));
  check(await btns('qs') === '📄 צפייה | 🔄 החלף | 📋 פרטי אירוע | העתק קישור | מחק', 'signed: ' + await btns('qs'));
  await V.p.click('#tbody .copy-link[data-id="qp"]'); await V.p.waitForTimeout(300);
  check(/hatzaa\/v\/\?t=vevdetaa/.test(await V.p.evaluate(() => navigator.clipboard.readText())), 'העתק קישור copies the client link');

  console.log('2. Event details window');
  await V.p.click('#tbody .ev-open[data-id="qp"]'); await V.p.waitForSelector('#ev-dlg[open]');
  const txt = (await V.p.evaluate(() => document.querySelector('#ev-view').innerText)).replace(/\s+/g, ' ');
  const want = ['📞 טלפון הלקוח לא הוזן · אפשר להוסיף בעיפרון ✎ למעלה', '🎉 סוג האירוע חתונה', '📅 תאריך 10/03/2027 · יום רביעי', '🕒 שעות 20:00–22:00 · שעתיים', '📍 מיקום אלגריה בילו',
    '👥 מוזמנים 300', '📦 חבילה', '💰 מחיר ₪1,299', '💵 מקדמה ₪200 · לא שולמה', '🧾 יתרה לגבייה ₪1,099', '📌 הכנסתי את האירוע עדיין לא', '📝 הערות הלקוח אין', '🗒 ההערות שלי אין'];
  want.forEach(w => check(txt.includes(w), 'shows: ' + w));
  check(await V.p.locator('#ev-view .ev-foot >> text=📅 יומן Google').count() === 1 && await V.p.locator('#ev-view .ev-foot >> text=🚗 Waze').count() === 1 && await V.p.locator('#ev-close2').count() === 1, 'buttons: יומן Google · Waze · סגירה');
  check((await V.p.getAttribute('#ev-view a[href*="waze.com"]', 'href')).includes(encodeURIComponent('אלגריה בילו')), 'Waze navigates to the location');
  await V.p.screenshot({ path: SHOTS + 'ev-view.png' });
  await axe(V.p, 'event details window');

  console.log('3. Pencil: every field editable');
  await V.p.click('#ev-edit');
  await V.p.fill('#ev_phone', '0521234567'); await V.p.fill('#ev_type', 'חינה'); await V.p.fill('#ev_pkg', 'חבילת פרימיום');
  await V.p.fill('#ev_price', '1500'); await V.p.fill('#ev_dep', '300'); await V.p.fill('#ev_guests', '320');
  await V.p.fill('#ev_cnotes', 'כניסה מהחניה'); await V.p.fill('#ev_note', 'לבדוק חשמל');
  await V.p.click('#ev-save'); await V.p.waitForSelector('#ev-view:not([hidden])'); await V.p.waitForTimeout(800);
  const t2 = (await V.p.textContent('#ev-view')).replace(/\s+/g, ' ');
  ['052', 'חינה', 'חבילת פרימיום', '₪1,500', '₪300', '₪1,200', '320', 'כניסה מהחניה', 'לבדוק חשמל'].forEach(w => check(t2.includes(w), 'after edit shows ' + w));
  let d = await emu('GET', `tenants/${SLUG}/quotes/qp`);
  const ev = d.body.fields.ev.mapValue.fields;
  check(val(ev.price) === 1500 && val(ev.eventType) === 'חינה' && val(ev.pkg) === 'חבילת פרימיום' && val(ev.notes) === 'כניסה מהחניה', 'saved in ev');
  check(val(d.body.fields.price) === 1299, 'the original quote (what the client got) is unchanged');
  check(/חינה/.test(await V.p.textContent('#tbody')) && /₪1,500/.test(await V.p.textContent('#tbody')), 'table row shows the edited values');

  console.log('4. Checkboxes: deposit paid, in calendar, event paid → row green');
  await V.p.check('#ev-view input[data-flag="depositPaid"]'); await V.p.waitForTimeout(500);
  check(/₪300 · שולמה/.test((await V.p.textContent('#ev-view')).replace(/\s+/g, ' ')), 'deposit → "שולמה"');
  await V.p.check('#ev-view input[data-flag="inCal"]'); await V.p.waitForTimeout(500);
  check(/הכנסתי את האירוע\s*כן ✓/.test(await V.p.textContent('#ev-view')), 'calendar → "כן ✓"');
  await V.p.check('#ev-view input[data-flag="paid"]'); await V.p.waitForTimeout(800);
  check(/₪0 · הכול שולם/.test(await V.p.textContent('#ev-view')), 'paid → balance ₪0');
  check(await V.p.locator('#tbody tr.paid-row').count() === 1, 'the row turned green');
  const bg = await V.p.evaluate(() => getComputedStyle(document.querySelector('#tbody tr.paid-row td')).backgroundColor);
  check(bg === 'rgb(220, 252, 231)', 'green background ' + bg);
  d = await emu('GET', `tenants/${SLUG}/quotes/qp`);
  const ev2 = d.body.fields.ev.mapValue.fields;
  check(ev2.paid.booleanValue === true && ev2.depositPaid.booleanValue === true && ev2.inCal.booleanValue === true && val(ev2.price) === 1500, 'flags saved and edits kept');
  await V.p.screenshot({ path: SHOTS + 'ev-paid.png' });
  await V.p.click('#ev-close2');
  await V.p.screenshot({ path: SHOTS + 'dash-paid.png', fullPage: true });
  await V.p.uncheck('#tbody .paid-toggle[data-id="qp"]'); await V.p.waitForTimeout(800);
  check(await V.p.locator('#tbody tr.paid-row').count() === 0, 'unchecking in the row → no longer green');
  await V.p.check('#tbody .paid-toggle[data-id="qp"]'); await V.p.waitForTimeout(800);
  check(await V.p.locator('#tbody tr.paid-row').count() === 1, 'checking in the row → green again');
  await V.p.reload(); await V.p.click('.tabs button[data-tab=dash]'); await V.p.waitForSelector('#tbody .ev-open[data-id="qp"]');
  check(await V.p.locator('#tbody tr.paid-row').count() === 1, 'still green after reload');

  console.log('5. Upload / replace / delete');
  let fc = V.p.waitForEvent('filechooser'); await V.p.click('#tbody .upload-file[data-id="qp"]'); await (await fc).setFiles(pdfPath);
  await V.p.waitForFunction(() => /🔄 החלף/.test(document.querySelector('#tbody .upload-file[data-id="qp"]').textContent), null, { timeout: 10000 });
  check(await btns('qp') === '📄 צפייה | 🔄 החלף | 📋 פרטי אירוע | העתק קישור | מחק', 'pending after upload: ' + await btns('qp'));
  fc = V.p.waitForEvent('filechooser'); await V.p.click('#tbody .upload-file[data-id="qs"]'); await (await fc).setFiles(pdfPath); await V.p.waitForTimeout(1500);
  d = await emu('GET', `tenants/${SLUG}/quotes/qs/pdf/file`);
  check(val(d.body.fields.pdfData) !== 'JVBERi0xLjQK', 'signed: 🔄 החלף replaced the PDF');
  await V.p.click('#tbody .del-q[data-id="qs"]');
  await V.p.waitForFunction(() => !document.querySelector('#tbody .ev-open[data-id="qs"]'), null, { timeout: 10000 });
  for (let i = 0; i < 20 && (d = await emu('GET', `tenants/${SLUG}/quotes/qs`)).status !== 404; i++) await new Promise(r => setTimeout(r, 300));
  check(d.status === 404, 'signed quote deleted');
  await V.p.setViewportSize({ width: 390, height: 844 }); await V.p.waitForTimeout(400);
  check(await V.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'dashboard: no sideways scroll at 390px');
  await V.p.click('#tbody .ev-open[data-id="qp"]'); await V.p.waitForSelector('#ev-dlg[open]'); await V.p.waitForTimeout(500);
  await V.p.screenshot({ path: SHOTS + 'ev-phone.png' });
  check(await V.p.evaluate(() => { const d = document.querySelector('#ev-dlg'); return d.scrollWidth <= d.clientWidth + 1; }), 'event window fits the phone');

  console.log('6. Owner: sent offers — upload/replace + paid row');
  await emu('PATCH', 'platformQuotes/offe1', { fields: fields({ vendorName: 'שירז אירועים', contactName: 'שירז', plan: 'regular', planLabel: 'מנוי שנתי', total: 400, status: 'signed', signedAt: now, createdAt: now }) });
  const A = await newPage(b, 'owner'); await A.p.setViewportSize({ width: 1280, height: 860 });
  await login(A.p, OWNER); await A.p.waitForURL(/admin\.html/, { timeout: 20000 }); await A.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await A.p.click('.admin-tabs button[data-tab=offers]'); await A.p.waitForSelector('#otbody .o-paid');
  check(/📤 העלה קובץ/.test(await A.p.textContent('#otbody')), 'offer row: 📤 העלה קובץ');
  fc = A.p.waitForEvent('filechooser'); await A.p.click('#otbody .o-up'); await (await fc).setFiles(pdfPath);
  await A.p.waitForFunction(() => /🔄 החלף/.test(document.querySelector('#otbody').textContent) && /📄 צפייה/.test(document.querySelector('#otbody').textContent), null, { timeout: 10000 });
  check(true, 'offer row after upload: 📄 צפייה · 🔄 החלף');
  await A.p.check('#otbody .o-paid'); await A.p.waitForTimeout(800);
  check(await A.p.locator('#otbody tr.paid-row').count() === 1, 'offer marked paid → row green');
  d = await emu('GET', 'platformQuotes/offe1'); check(d.body.fields.paid.booleanValue === true, 'paid saved');
  await A.p.screenshot({ path: SHOTS + 'admin-offers.png' });

  await b.close();
  console.log(errors.length ? 'page errors:\n  ' + errors.join('\n  ') : 'no page errors');
  console.log(`\n${failures ? failures + ' failed' : 'all passed'}`);
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
