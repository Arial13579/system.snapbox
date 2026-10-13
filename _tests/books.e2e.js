// Calendar + income/expenses + one-time welcome in the vendor account: signed quote → calendar (Google link, ics), income from the signature, expenses, chart, CSV; welcome shows once per account+email (also across devices), never for the owner.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-books/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'books.dj@gmail.com', SLUG = 'vbooksaa';
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
const ts = d => ({ timestampValue: d.toISOString() });
const pad = n => String(n).padStart(2, '0');
const dmy = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
const fields = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? int(v) : typeof v === 'boolean' ? { booleanValue: v } : v instanceof Date ? ts(v) : Array.isArray(v) ? { arrayValue: { values: v.map(str) } } : str(v)]));

(async () => {
  // הגדרות ספק לדוגמה (מחירון אוטומטי) מתוך hatzaa/snapiiii/config.js
  const win = {}; new Function('window', fs.readFileSync('/home/user/hatzaa/snapiiii/config.js', 'utf8'))(win);
  const cfg = win.TENANT; cfg.business.name = 'די ג׳יי ספרים'; cfg.business.logo = '';
  const now = new Date(), evDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
  await emu('PATCH', 'vendorConfigs/' + SLUG, { fields: { config: str(JSON.stringify(cfg)), updatedAt: ts(now) } });
  await emu('PATCH', 'tenants/' + SLUG, { fields: fields({ slug: SLUG, name: 'די ג׳יי ספרים', admins: [VENDOR], active: true, managed: 'admin', createdAt: now }) });
  await emu('PATCH', 'vendorIndex/' + VENDOR, { fields: fields({ tenant: SLUG }) });
  const q1 = { clientName: 'דני כהן', clientPhone: '0501234567', eventType: 'חתונה', location: 'תל אביב', date: dmy(evDay), startTime: '19:00', endTime: '01:00', guests: 300, price: 5000, deposit: 1000, notes: 'כניסה מהחניה', service: 'booth', status: 'signed', createdAt: now, signedAt: now };
  await emu('PATCH', `tenants/${SLUG}/quotes/q1`, { fields: fields(q1) });
  await emu('PATCH', `tenants/${SLUG}/quotes/q2`, { fields: fields({ ...q1, clientName: 'רונית לוי', eventType: 'בר מצווה', price: 3000, status: 'pending', signedAt: undefined }) });

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  console.log('1. First login → consent → one-time welcome');
  const V = await newPage(b, 'vendor');
  await login(V.p, VENDOR);
  await V.p.waitForSelector('#consent:not(.hidden)', { timeout: 20000 });
  await V.p.check('#consent-check'); await V.p.click('#consent-btn');
  await V.p.waitForSelector('#wl-dlg[open]', { timeout: 15000 });
  check(await V.p.textContent('#wl-h') === 'ברוכים הבאים!', 'welcome opens after consent');
  await axe(V.p, 'welcome dialog');
  await V.p.screenshot({ path: SHOTS + 'welcome.png' });
  const titles = [];
  for (let i = 0; i < 7; i++) { titles.push(await V.p.textContent('#wl-h')); await V.p.click('#wl-next'); }
  check(titles.join('|') === 'ברוכים הבאים!|הצעה חדשה|הלקוח חותם|יומן|הכנסות והוצאות|לוח בקרה|צריכים עזרה?', 'welcome has 7 short steps: ' + titles.join(' · '));
  check(!(await V.p.locator('#wl-dlg').evaluate(d => d.open)), '"מתחילים!" closes it');
  await V.p.waitForTimeout(800);
  const pref = await emu('GET', `tenants/${SLUG}/prefs/${VENDOR}`);
  check(pref.status === 200 && pref.body.fields.welcomeSeen.booleanValue === true, 'seen saved on the account (for every device)');
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 }); await V.p.waitForTimeout(1500);
  check(!(await V.p.locator('#wl-dlg').evaluate(d => d.open)), 'not shown again after reload');
  const V2 = await newPage(b, 'vendor-2nd-device');
  await login(V2.p, VENDOR); await V2.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 }); await V2.p.waitForTimeout(1500);
  check(!(await V2.p.locator('#wl-dlg').evaluate(d => d.open)), 'not shown on a second device (same Gmail)');
  await V2.ctx.close();
  await login(V.p, VENDOR); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });   // חיבור אחד לספק: המכשיר השני ניתק את הראשון — מתחברים שוב
  await V.p.click('#help-btn');
  check(await V.p.locator('#wl-dlg').evaluate(d => d.open), '"איך זה עובד?" opens it again on demand');
  await V.p.click('#wl-skip');

  console.log('2. Calendar');
  await V.p.click('.tabs button[data-tab=cal]');
  await V.p.waitForSelector('#cal-list .ev-card', { timeout: 15000 });
  check(V.p.url().endsWith('#cal'), 'tab in the address (#cal)');
  check(await V.p.locator('#cal-list .ev-card').count() === 1, 'only the signed quote is in the calendar (pending is not)');
  const card = await V.p.textContent('#cal-list .ev-card');
  check(/דני כהן/.test(card) && /19:00–01:00/.test(card) && /תל אביב/.test(card) && /300 מוזמנים/.test(card) && /₪5,000/.test(card) && /₪1,000/.test(card) && /₪4,000/.test(card) && /כניסה מהחניה/.test(card) && /נחתם עכשיו/.test(card), 'event card: client, time, place, guests, price/deposit/balance, notes, "just signed"');
  const g = await V.p.getAttribute('#cal-list .ev-card a.primary', 'href');
  const gd = new URL(g).searchParams;
  const ymd = evDay.getFullYear() + pad(evDay.getMonth() + 1) + pad(evDay.getDate()), nxt = new Date(evDay.getTime() + 86400e3), ymd2 = nxt.getFullYear() + pad(nxt.getMonth() + 1) + pad(nxt.getDate());
  check(g.startsWith('https://calendar.google.com/') && gd.get('dates') === ymd + 'T190000/' + ymd2 + 'T010000' && gd.get('ctz') === 'Asia/Jerusalem' && /טלפון: 0501234567/.test(gd.get('details')), 'Google Calendar link (ends after midnight): ' + gd.get('dates'));
  check((await V.p.getAttribute('#cal-list .ev-card a[href^="https://wa.me/"]', 'href')) === 'https://wa.me/972501234567', 'WhatsApp to the client');
  if (evDay.getMonth() !== now.getMonth()) await V.p.click('#cal-next');
  const cell = V.p.locator(`#cal-grid button[data-day="${evDay.getFullYear()}-${pad(evDay.getMonth() + 1)}-${pad(evDay.getDate())}"]`);
  check(await cell.evaluate(e => e.classList.contains('has')), 'event day marked in the month grid');
  const [dl] = await Promise.all([V.p.waitForEvent('download'), V.p.click('#cal-ics')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  check(/BEGIN:VEVENT/.test(ics) && ics.includes('DTSTART;TZID=Asia/Jerusalem:' + ymd + 'T190000') && /דני כהן/.test(ics), 'ics download with the event');
  await axe(V.p, 'calendar tab');
  await V.p.screenshot({ path: SHOTS + 'cal.png', fullPage: true });
  // חתימה חדשה נכנסת מיד
  await emu('PATCH', `tenants/${SLUG}/quotes/q2?updateMask.fieldPaths=status&updateMask.fieldPaths=signedAt`, { fields: fields({ status: 'signed', signedAt: new Date() }) });
  await V.p.waitForFunction(() => document.querySelectorAll('#cal-list .ev-card').length === 2, null, { timeout: 10000 }).catch(() => {});
  check(await V.p.locator('#cal-list .ev-card').count() === 2, 'a new signature appears in the calendar live');

  console.log('3. Income & expenses');
  await V.p.click('.tabs button[data-tab=books]');
  await V.p.waitForFunction(() => /8,000/.test(document.getElementById('bk-kpis').textContent), null, { timeout: 15000 }).catch(() => {});
  const k = async () => (await V.p.textContent('#bk-kpis')).replace(/\s+/g, ' ');
  check(/הכנסות החודש ?₪8,000/.test(await k()), 'income this month from the 2 signatures: ' + await k());
  check(await V.p.locator('#inc-list tbody tr').count() === 2, 'income list: 2 signed contracts');
  await V.p.fill('#ex-amount', '300'); await V.p.fill('#ex-label', 'דלק'); await V.p.selectOption('#ex-cat', 'נסיעות ודלק');
  await V.p.click('#ex-add');
  await V.p.waitForSelector('#ex-list tbody tr', { timeout: 10000 });
  check(/דלק/.test(await V.p.textContent('#ex-list')) && /₪300/.test(await V.p.textContent('#ex-list')), 'expense added');
  check(/הוצאות החודש ?₪300/.test(await k()) && /רווח החודש ?₪7,700/.test(await k()), 'expenses + profit: ' + await k());
  await V.p.click('#ex-add');
  check(/הזינו סכום/.test(await V.p.textContent('#ex-msg')), 'empty expense → clear message');
  await V.p.waitForTimeout(800);
  check(await V.p.evaluate(() => { const c = window.Chart && Chart.getChart(document.getElementById('booksChart')); return !!c && c.data.datasets.length === 3 && c.data.datasets[0].data[new Date().getMonth()] === 8000 && c.data.datasets[1].data[new Date().getMonth()] === 300; }), 'chart: income / expenses / profit by month');
  const [dl2] = await Promise.all([V.p.waitForEvent('download'), V.p.click('#bk-csv')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  check(/הכנסה/.test(csv) && /הוצאה.*דלק.*300/.test(csv), 'CSV export');
  await axe(V.p, 'income & expenses tab');
  await V.p.screenshot({ path: SHOTS + 'books.png', fullPage: true });
  await V.p.click('#ex-list .ex-del');
  await V.p.waitForFunction(() => !document.querySelector('#ex-list tbody tr'), null, { timeout: 10000 }).catch(() => {});
  check(await V.p.locator('#ex-list tbody tr').count() === 0, 'expense deleted');
  console.log('3b. Import from Excel');
  const IMP = S + '/imp/';
  const pick = async (btn, file) => { const [fc] = await Promise.all([V.p.waitForEvent('filechooser'), V.p.click(btn)]); await fc.setFiles(IMP + file); };
  const dialogs = []; V.p.on('dialog', d => dialogs.push(d.message()));
  await pick('#imp-exp', 'exp.xlsx');
  await V.p.waitForFunction(() => /יובאו/.test(document.getElementById('imp-msg').textContent), null, { timeout: 15000 }).catch(() => {});
  check(/✓ יובאו 3 הוצאות \(₪1,630\.5\)/.test(await V.p.textContent('#imp-msg')), 'xlsx expenses imported: ' + await V.p.textContent('#imp-msg'));
  check(/נמצאו 3 הוצאות/.test(dialogs.join(' ')) && /1 שורות בלי תאריך או סכום/.test(dialogs.join(' ')), 'confirmation shows count, total and skipped "סה"כ" row');
  await V.p.waitForTimeout(800);
  const exTxt = await V.p.textContent('#ex-list');
  check(/נייר הדפסה/.test(exTxt) && /פרסום פייסבוק/.test(exTxt) && /נסיעות ודלק/.test(exTxt), 'imported rows listed with category');
  await pick('#imp-exp', 'exp.xlsx');
  await V.p.waitForFunction(() => /כבר קיימות/.test(document.getElementById('imp-msg').textContent), null, { timeout: 10000 }).catch(() => {});
  check(/כבר קיימות/.test(await V.p.textContent('#imp-msg')), 'same file again → nothing duplicated');
  await pick('#imp-inc', 'inc-nohead.xlsx');
  await V.p.waitForFunction(() => /יובאו 3 הכנסות/.test(document.getElementById('imp-msg').textContent), null, { timeout: 15000 }).catch(() => {});
  check(/✓ יובאו 3 הכנסות \(₪7,500\)/.test(await V.p.textContent('#imp-msg')), 'xlsx without headings → incomes imported');
  await V.p.waitForTimeout(800);
  const incTxt = await V.p.textContent('#inc-list');
  check(/אירוע כהן/.test(incTxt) && /חוזה חתום/.test(incTxt) && await V.p.locator('#inc-list .inc-del').count() === 3, 'imported incomes next to signed contracts (deletable)');
  check(/הכנסות 2026 ?₪15,500/.test(await k()), 'year income = contracts 8,000 + imported 7,500: ' + await k());
  await pick('#imp-exp', 'bank.csv');
  await V.p.waitForFunction(() => /יובאו 2 הוצאות/.test(document.getElementById('imp-msg').textContent), null, { timeout: 15000 }).catch(() => {});
  check(/יובאו 2 הוצאות \(₪420\.9\)/.test(await V.p.textContent('#imp-msg')), 'Hebrew bank CSV (windows-1255, negative amounts) imported');
  await pick('#imp-exp', 'old.xls');
  await V.p.waitForFunction(() => /xls/.test(document.getElementById('imp-msg').textContent), null, { timeout: 10000 }).catch(() => {});
  check(/שמירה בשם/.test(await V.p.textContent('#imp-msg')), 'old .xls → clear "save as xlsx" message');
  await V.p.click('#inc-list .inc-del >> nth=0'); await V.p.waitForTimeout(800);
  check(await V.p.locator('#inc-list .inc-del').count() === 2, 'imported income can be deleted');
  await axe(V.p, 'income & expenses with import');
  await V.p.screenshot({ path: SHOTS + 'import.png', fullPage: true });
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await V.p.isVisible('#tab-books') && await V.p.isHidden('#tab-new'), 'reload keeps the tab (#books)');
  for (const w of [320, 768, 1280]) {
    await V.p.setViewportSize({ width: w, height: 800 });
    for (const t of ['cal', 'books']) { await V.p.click(`.tabs button[data-tab=${t}]`); await V.p.waitForTimeout(400);
      check(await V.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${t} @${w}px`); }
  }

  console.log('4. Owner viewing the account: no welcome');
  const O = await newPage(b, 'owner');
  await login(O.p, OWNER); await O.p.waitForURL(/admin\.html/, { timeout: 20000 });
  await O.p.goto(SYS + `/vendors/app.html?t=${SLUG}#cal`); await O.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 }); await O.p.waitForTimeout(1500);
  check(!(await O.p.locator('#wl-dlg').evaluate(d => d.open)), 'no welcome for the owner');
  check(await O.p.locator('#cal-list .ev-card').count() === 2, 'owner sees the calendar');

  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); console.error(e.stack); process.exit(2); });
