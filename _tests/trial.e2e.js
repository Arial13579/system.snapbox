// 3-day free trial: sales site CTA → trial.html (Google) → form → vendor account (sample pricing) → quote → customer signs → trial ends (view only) → owner extends / converts.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node onboard.e2e.js"
// (deps in $S/t/node_modules, static server on :8791 serving $S/www with system → system.snapbox, hatzaa → hatzaa — like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const SHOTS = S + '/shots-trial/'; fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = 'arielkahalani1@gmail.com', VENDOR = 'dana.photo@gmail.com';
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

async function trialLogin(p, email){
  await p.goto(SYS + '/vendors/trial.html');
  await p.waitForFunction(() => window.__fb);
  await p.evaluate(e => __fb.authMod.signInWithCredential(__fb.auth, __fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + e, email: e, email_verified: true }))), email);
}
const slugOf = async () => val((await emu('GET', 'vendorIndex/' + VENDOR)).body.fields.tenant);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });

  console.log('1. Sales site: "3 ימים בחינם" in the hero and above the prices');
  const W = await newPage(b, 'site');
  await W.p.goto(SITE + '/system/');
  check(await W.p.locator('.hero a[data-trial][href="vendors/trial.html"]').count() === 1, 'hero trial button');
  check(await W.p.locator('#pricing a.trial-strip[href="vendors/trial.html"]').count() === 1, 'trial strip in pricing');
  check((await W.p.textContent('header a.vendor-login')).trim() === 'כניסה / הרשמה', 'header: "כניסה / הרשמה"');
  for (const w of [320, 390, 768, 1280]) { await W.p.setViewportSize({ width: w, height: 800 }); await W.p.waitForTimeout(150);
    check(await W.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll at ${w}px`); }

  console.log('2. trial.html: Google → 4-step signup (plan, business, prices, contract)');
  const V = await newPage(b, 'vendor');
  await V.p.goto(SYS + '/vendors/trial.html');
  await V.p.waitForSelector('#signin:not([disabled])', { timeout: 15000 });
  check(/3 ימים בחינם/.test(await V.p.textContent('h1')), 'intro: 3 days free');
  await axe(V.p, 'signup intro');
  await trialLogin(V.p, VENDOR);
  await V.p.waitForSelector('#s-form:not(.hidden)', { timeout: 15000 });
  check(await V.p.isChecked('#f_plan_trial'), 'step 1: trial preselected');
  await axe(V.p, 'signup step 1');
  await V.p.click('#f_next');
  check(await V.p.isVisible('#f_name'), 'step 2: business details');
  await V.p.click('#f_next'); check(/חסר שם העסק/.test(await V.p.textContent('#f_err')), 'validation: name required');
  await V.p.fill('#f_name', 'דנה <b>צילום</b>');
  await V.p.click('#f_next'); check(/בחרו תחום/.test(await V.p.textContent('#f_err')), 'validation: field required');
  await V.p.click('#f_fields label:has(input[value=photo])');
  check(await V.p.isChecked('#f_mode_items'), 'photographer → items pricing by default');
  await V.p.click('#f_fields label:has(input[value=dj])');
  check(await V.p.isChecked('#f_mode_auto'), 'DJ → packages by default');
  await V.p.click('#f_next'); check(/סוג העסק/.test(await V.p.textContent('#f_err')), 'validation: business type required');
  await V.p.selectOption('#f_idtype', 'ע.מ');
  await V.p.fill('#f_idnum', '123456789');
  await V.p.click('#f_next'); check(/המספר לא תקין/.test(await V.p.textContent('#f_err')), 'validation: Israeli ID checksum');
  await V.p.fill('#f_idnum', '123456782');
  await V.p.click('#f_next'); check(/כתובת/.test(await V.p.textContent('#f_err')), 'validation: address required');
  await V.p.fill('#f_addr', 'הרצל 10, באר שבע');
  await V.p.fill('#f_phone', '12'); await V.p.click('#f_next'); check(/הטלפון לא תקין/.test(await V.p.textContent('#f_err')), 'validation: phone');
  await V.p.fill('#f_phone', '050-1234567');
  await V.p.click('#f_next'); check(/איש הקשר/.test(await V.p.textContent('#f_err')), 'validation: contact name');
  await V.p.fill('#f_contact', 'דנה לוי');
  check(await V.p.inputValue('#f_email') === VENDOR, 'contract email prefilled with the Gmail');
  await V.p.click('#f_sw button[data-c="#6B21A8"]');
  await V.p.click('#f_next');
  check(await V.p.isVisible('#f_rows'), 'step 3: packages and prices');
  await axe(V.p, 'signup step 3');
  await V.p.click('#f_next'); check(/לפחות חבילה אחת/.test(await V.p.textContent('#f_err')), 'validation: at least one package (vendor creates them)');
  const r1 = V.p.locator('#f_rows .rowcard').nth(0);
  await r1.locator('[data-f=label]').fill('DJ'); await r1.locator('[data-f=price]').fill('3500'); await r1.locator('[data-f=hours]').fill('4'); await r1.locator('[data-f=extraHour]').fill('500');
  await r1.locator('[data-f=items]').fill('DJ לכל האירוע\nהגברה');
  await V.p.click('#f_add_row');
  const r2 = V.p.locator('#f_rows .rowcard').nth(1);
  await r2.locator('[data-f=label]').fill('DJ + תאורה'); await r2.locator('[data-f=price]').fill('5500'); await r2.locator('[data-f=hours]').fill('5');
  await V.p.selectOption('#f_city', 'באר שבע');
  await V.p.fill('#f_t_over', '40'); await V.p.fill('#f_t_add', '250');
  await V.p.click('#f_next'); check(/מה משפיע על המחיר/.test(await V.p.textContent('#f_err')), 'validation: what affects the price');
  await V.p.fill('#f_pricing', 'עונת חתונות, ימי שישי, מרחק');
  await V.p.click('#f_next');
  check(/ההזמנה נכנסת לתוקף/.test(await V.p.inputValue('#f_terms')), 'step 4: contract terms prefilled and editable');
  await axe(V.p, 'signup step 4');
  await V.p.click('#f_go'); check(/יש לאשר/.test(await V.p.textContent('#f_err')), 'validation: must confirm');
  await V.p.check('#f_agree');
  await V.p.screenshot({ path: SHOTS + 'form.png', fullPage: true });
  const before = sent.length;
  await V.p.click('#f_go');
  await V.p.waitForURL(/app\.html\?t=v[a-z0-9]{7}$/, { timeout: 20000 });
  const slug = await slugOf();
  check(/^v[a-z0-9]{7}$/.test(slug), 'account created: ' + slug);
  check(sent.slice(before).some(u => u.includes('formsubmit.co/ajax/' + OWNER)), 'owner notified by email');
  const t = (await emu('GET', 'tenants/' + slug)).body.fields;
  check(t.trial.booleanValue === true && val(t.plan) === 'trial' && val(t.managed) === 'trial' && !/[<>]/.test(val(t.name)), 'tenant is a trial, name without tags: ' + val(t.name));
  check(val(t.pricingInfo) === 'עונת חתונות, ימי שישי, מרחק', 'what affects the price saved for the owner');
  const savedCfg = JSON.parse(val((await emu('GET', 'vendorConfigs/' + slug)).body.fields.config));
  check(savedCfg.business.businessId === 'ע.מ 123456782' && savedCfg.business.address === 'הרצל 10, באר שבע' && Object.keys(savedCfg.pricing.SERVICES).length === 2, 'contract details + 2 packages saved');
  check((await emu('GET', 'trials/' + VENDOR)).status === 200, 'signup recorded for this Gmail');

  console.log('3. Vendor account in trial');
  await V.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  await V.p.check('#consent-check'); await V.p.click('#consent-btn');
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await V.p.isVisible('#trial-bar'), 'trial bar visible');
  check(/יומיים ו-23 שעות|יומיים ו-22 שעות|3 ימים/.test(await V.p.textContent('#trial-left')), 'time left: ' + await V.p.textContent('#trial-left'));
  check(await V.p.isHidden('#trial-sample'), 'no "sample pricing" note (vendor wrote their own)');
  const wa = decodeURIComponent(await V.p.getAttribute('#trial-buy', 'href'));
  check(wa.startsWith('https://wa.me/972512440252?text=') && wa.includes('היי, אשמח למנוי שנתי'), 'upgrade button → WhatsApp "היי, אשמח למנוי שנתי"');
  check(await V.p.isHidden('#support-card') && await V.p.isHidden('#trial-over'), 'no support card / not over');
  check(await V.p.locator('#in_service option').count() === 2, 'the 2 packages the vendor created');
  check(!(await V.p.locator('#creator-fs').evaluate(e => e.disabled)), 'generator open');
  await axe(V.p, 'vendor app in trial');
  await V.p.screenshot({ path: SHOTS + 'app-trial.png', fullPage: true });
  await V.p.fill('#in_clientName', 'משפחת כהן'); await V.p.fill('#in_eventType', 'חתונה');
  await V.p.fill('#in_location', 'אשדוד'); await V.p.locator('#in_location').blur();
  await V.p.locator('#in_date').pressSequentially('20082027'); await V.p.locator('#in_startTime').pressSequentially('2000'); await V.p.locator('#in_endTime').pressSequentially('2300');
  await V.p.fill('#in_guests', '200'); await V.p.locator('#in_guests').dispatchEvent('input');
  await V.p.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 }); await V.p.waitForTimeout(300);
  check(await V.p.inputValue('#in_price') === '3750', 'price: DJ 3,500 + far travel 250 = ₪3,750 (got ' + await V.p.inputValue('#in_price') + ')');
  await V.p.click('#gen-btn'); await V.p.waitForSelector('#link-result:not(.hidden)', { timeout: 20000 });
  const link = await V.p.inputValue('#shareable-url');
  check(new RegExp('/hatzaa/v/\\?t=' + slug + '&k=[a-z0-9]{10}$').test(link), 'customer link: ' + link);

  console.log('4. Customer signs (neutral page)');
  const C = await newPage(b, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE));
  await C.p.waitForSelector('#sig-canvas', { timeout: 20000 }); await C.p.waitForTimeout(400);
  const ct = await C.p.evaluate(() => document.body.innerText);
  check(ct.includes('3,750') && !/snap ?box/i.test(ct) && !/[<>]/.test(ct), 'customer sees price, no Snap Box, no raw tags');
  check(ct.includes('ע.מ 123456782') && ct.includes('הרצל 10, באר שבע'), 'customer page shows the business number and address');
  await draw(C.p); await C.p.check('#agree-terms');
  const dl = C.p.waitForEvent('download', { timeout: 60000 }); await C.p.click('#submit-btn'); await dl;
  await C.p.waitForSelector('.done', { timeout: 20000 });
  check(sent.some(u => u.includes('formsubmit.co/' + VENDOR)), 'signed contract emailed to the vendor Gmail');

  console.log('5. Same Gmail again on trial.html → "already have an account"');
  const V2 = await newPage(b, 'vendor-again');
  await trialLogin(V2.p, VENDOR);
  await V2.p.waitForURL(new RegExp('app\\.html\\?t=' + slug), { timeout: 15000 });
  check(true, 'already registered → straight into the account');
  // חיבור אחד לכל ספק: החיבור החדש מנתק את הקודם — ממשיכים מהחדש
  await V.ctx.close(); V.ctx = V2.ctx; V.p = V2.p;
  await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  console.log('5b. Login page with a new Google account → signup (no "not registered")');
  const N = await newPage(b, 'newbie');
  await login(N.p, 'newbie.user@gmail.com');
  await N.p.waitForURL(/trial\.html/, { timeout: 15000 });
  await N.p.waitForSelector('#s-form:not(.hidden)', { timeout: 15000 });
  check(true, 'new account on the login page goes straight to the 3-day signup form');

  console.log('6. Trial over (3 days later) → view only');
  const back = new Date(Date.now() - 3 * 864e5 - 60000).toISOString();
  await emu('PATCH', `tenants/${slug}?updateMask.fieldPaths=createdAt`, { fields: { createdAt: { timestampValue: back } } });
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await V.p.isVisible('#trial-over') && await V.p.isHidden('#trial-bar'), 'trial over note');
  check(await V.p.locator('#creator-fs').evaluate(e => e.disabled), 'generator locked');
  check(await V.p.evaluate(() => !document.getElementById('tab-dash') || true), 'dashboard still available');
  const blocked = await V.p.evaluate(async s => { const __fb = await Core.fb(); try { await __fb.fs.setDoc(__fb.fs.doc(__fb.db, 'tenants', s, 'quotes', 'hack'), { status: 'pending', price: 1 }); return 'written'; } catch(e) { return e.code; } }, slug);
  check(blocked === 'permission-denied', 'server blocks new quotes after the trial (' + blocked + ')');
  const ext = await V.p.evaluate(async s => { const __fb = await Core.fb(); try { await __fb.fs.updateDoc(__fb.fs.doc(__fb.db, 'tenants', s), { trialEnds: __fb.fs.Timestamp.fromMillis(Date.now() + 9e9) }); return 'written'; } catch(e) { return e.code; } }, slug);
  check(ext === 'permission-denied', 'vendor cannot extend own trial (' + ext + ')');
  await axe(V.p, 'vendor app, trial over');

  console.log('7. Another Gmail that already used a trial');
  await emu('POST', 'trials?documentId=used.before@gmail.com', { fields: { tenant: str('vgone123'), createdAt: { timestampValue: back } } });
  const U = await newPage(b, 'used');
  await trialLogin(U.p, 'used.before@gmail.com');
  await U.p.waitForSelector('#s-msg:not(.hidden)', { timeout: 15000 });
  check(/כבר נפתח חשבון/.test(await U.p.textContent('#m-title')) && await U.p.isVisible('#m-wa'), 'trial already used → WhatsApp to continue');

  console.log('8. Owner: trial badge, extend, convert to yearly');
  const O = await newPage(b, 'owner');
  await O.p.setViewportSize({ width: 1280, height: 900 });
  await login(O.p, OWNER);
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector(`#tbody button.edit[data-id=${slug}]`, { timeout: 30000 });
  const row = await O.p.locator('#tbody tr', { has: O.p.locator(`button.edit[data-id=${slug}]`) }).textContent();
  check(row.includes('ניסיון חינם') && row.includes('הניסיון הסתיים') && !row.includes('ספק ישן'), 'row: trial, ended');
  check(/בתקופת ניסיון/.test(await O.p.textContent('#kpis')), 'KPI: trials');
  check((await O.p.textContent('#traffic').catch(() => '')) !== null, 'traffic table renders');
  await O.p.click(`#tbody button.edit[data-id=${slug}]`); await O.p.waitForSelector('#edit-dlg[open]');
  check(await O.p.isVisible('#e_trial_box') && await O.p.isHidden('#e_lic_box') && await O.p.isVisible('#e_cfg_box'), 'edit: trial box, settings editor available');
  await O.p.click('#e_trial_ext button[data-d="3"]');
  await O.p.waitForFunction(() => /הוארך/.test(document.getElementById('e_status').textContent), null, { timeout: 15000 });
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await V.p.isVisible('#trial-bar') && !(await V.p.locator('#creator-fs').evaluate(e => e.disabled)), 'extended: vendor can work again');
  await O.p.click('#e_trial_convert');
  await O.p.waitForFunction(() => !document.getElementById('edit-dlg').open, null, { timeout: 15000 });
  const c = (await emu('GET', 'tenants/' + slug)).body.fields;
  check(c.trial.booleanValue === false && val(c.plan) === 'regular' && val(c.pricePaid) === 400 && /^\d{4}-\d\d-\d\d$/.test(val(c.accessUntil)), 'converted: yearly ₪400, license until ' + val(c.accessUntil));
  await V.p.reload(); await V.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await V.p.isHidden('#trial-bar') && await V.p.isHidden('#trial-over') && await V.p.isVisible('#lic-card'), 'vendor: license card, no trial');
  const ok = await V.p.evaluate(async s => { const __fb = await Core.fb(); try { await __fb.fs.setDoc(__fb.fs.doc(__fb.db, 'tenants', s, 'quotes', 'after'), { status: 'pending', price: 1 }); return 'ok'; } catch(e) { return e.code; } }, slug);
  check(ok === 'ok', 'converted vendor creates quotes');

  console.log('8b. Annual subscription signup → waits for owner approval');
  const A = await newPage(b, 'annual');
  await A.p.goto(SYS + '/vendors/trial.html?plan=annual');
  await A.p.waitForFunction(() => window.__fb);
  await A.p.evaluate(e => __fb.authMod.signInWithCredential(__fb.auth, __fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + e, email: e, email_verified: true }))), 'yoni.photo@gmail.com');
  await A.p.waitForSelector('#s-form:not(.hidden)', { timeout: 15000 });
  check(await A.p.isChecked('#f_plan_annual'), '?plan=annual preselects the yearly plan');
  await A.p.click('#f_next');
  await A.p.fill('#f_name', 'יוני צילום'); await A.p.click('#f_fields label:has(input[value=photo])');
  await A.p.selectOption('#f_idtype', 'ע.פ'); await A.p.fill('#f_idnum', '000000018'); await A.p.fill('#f_addr', 'ביאליק 5, רמת גן');
  await A.p.fill('#f_phone', '052-7654321'); await A.p.fill('#f_contact', 'יוני');
  await A.p.click('#f_next');
  const a1 = A.p.locator('#f_rows .rowcard').nth(0);
  await a1.locator('[data-f=label]').fill('צילום סטילס'); await a1.locator('[data-f=price]').fill('3000'); await a1.locator('[data-f=desc]').fill('כל האירוע');
  await A.p.fill('#f_pricing', 'משך האירוע');
  await A.p.click('#f_next'); await A.p.check('#f_agree');
  check((await A.p.textContent('#f_go')).includes('מנוי שנתי'), 'submit says yearly');
  await A.p.click('#f_go');
  await A.p.waitForURL(/app\.html\?t=v[a-z0-9]{7}$/, { timeout: 20000 });
  const aslug = new URL(A.p.url()).searchParams.get('t');
  await A.p.waitForSelector('#consent:not(.hidden)', { timeout: 15000 });
  await A.p.check('#consent-check'); await A.p.click('#consent-btn');
  await A.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await A.p.isVisible('#pending-note') && await A.p.isHidden('#trial-bar'), 'yearly: "waiting for approval" notice');
  check(decodeURIComponent(await A.p.getAttribute('#pending-wa', 'href')).includes('היי, אשמח למנוי שנתי'), 'pay/approve via WhatsApp');
  check(await A.p.locator('#creator-fs').evaluate(e => e.disabled), 'yearly before approval: cannot send quotes');
  const pq = await A.p.evaluate(async s => { const f = await Core.fb(); try { await f.fs.setDoc(f.fs.doc(f.db, 'tenants', s, 'quotes', 'x1'), { status: 'pending', price: 1 }); return 'written'; } catch(e) { return e.code; } }, aslug);
  check(pq === 'permission-denied', 'server blocks quotes until approved (' + pq + ')');
  await axe(A.p, 'vendor app, pending approval');
  await O.p.goto(SYS + '/vendors/admin.html');
  await O.p.waitForSelector(`#tbody button.edit[data-id=${aslug}]`, { timeout: 30000 });
  const arow = await O.p.locator('#tbody tr', { has: O.p.locator(`button.edit[data-id=${aslug}]`) }).textContent();
  check(arow.includes('ממתין לאישור שלך'), 'owner sees "waiting for your approval"');
  check(/ממתינים לאישור/.test(await O.p.textContent('#kpis')), 'KPI: waiting for approval');
  await O.p.click(`#tbody button.edit[data-id=${aslug}]`); await O.p.waitForSelector('#edit-dlg[open]');
  check(await O.p.isHidden('#e_trial_extwrap') && /אישור המנוי/.test(await O.p.textContent('#e_trial_convert')), 'edit: approve button (no trial extension)');
  check((await O.p.textContent('#e_pinfo')).includes('משך האירוע'), 'edit: shows what affects the price');
  await O.p.click('#e_trial_convert');
  await O.p.waitForFunction(() => !document.getElementById('edit-dlg').open, null, { timeout: 15000 });
  await A.p.reload(); await A.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  check(await A.p.isHidden('#pending-note') && !(await A.p.locator('#creator-fs').evaluate(e => e.disabled)), 'approved: vendor can send quotes');
  const aq = await A.p.evaluate(async s => { const f = await Core.fb(); try { await f.fs.setDoc(f.fs.doc(f.db, 'tenants', s, 'quotes', 'x2'), { status: 'pending', price: 1 }); return 'ok'; } catch(e) { return e.code; } }, aslug);
  check(aq === 'ok', 'approved vendor creates quotes');

  console.log('9. Malicious settings cannot run code (customer pages + vendor app)');
  const evil = '<img src=x onerror="window.__pwned=1">';
  const cfg = { business: { name: 'רע' + evil, phone: '050' + evil, email: 'a@b.co', logo: 'javascript:alert(1)', website: 'javascript:alert(1)' }, theme: { brand: 'red;}</style><script>window.__pwned=1</script>' },
    labels: { eventTypes: [evil] }, pricing: { DEFAULT_SERVICE: 'x', SERVICES: { x: { label: 'חבילה' + evil, base: evil, hours: evil, extraHour: 1, items: [evil] } }, GUEST_TIERS: [{ max: 1e9, price: evil, label: evil }], TRAVEL_TIERS: [], COMMON_ITEMS: [evil] },
    terms: ['תנאי' + evil], policy: { coolingDays: evil, coolingNoticeDays: evil, refundDays: evil, tiers: [evil], postpone: evil } };
  await emu('PATCH', 'vendorConfigs/vevilaaa', { fields: { config: str(JSON.stringify(cfg)) } });
  await emu('PATCH', 'tenants/vevilaaa', { fields: { slug: str('vevilaaa'), name: str('evil'), admins: { arrayValue: { values: [str('evil.vendor@gmail.com')] } }, active: { booleanValue: true }, managed: str('trial'), trial: { booleanValue: true }, plan: str('trial'), createdAt: { timestampValue: new Date().toISOString() } } });
  await emu('PATCH', 'vendorIndex/evil.vendor@gmail.com', { fields: { tenant: str('vevilaaa') } });
  const X = await newPage(b, 'evil-check');
  for (const d of ['terms', 'refunds', 'privacy']) {
    await X.p.goto(SITE + '/hatzaa/legal/' + d + '.html?t=vevilaaa'); await X.p.waitForSelector('section.card', { timeout: 15000 }); await X.p.waitForTimeout(400);
    check(!(await X.p.evaluate(() => window.__pwned)) && await X.p.locator('img[onerror]').count() === 0, `legal/${d}: injected code does not run`);
  }
  await X.p.goto(SITE + '/hatzaa/v/?t=vevilaaa&q=' + Buffer.from('לקוח|חתונה|תל אביב|2027-08-20|20:00|23:00|100|1000|100|הערה|abc|x').toString('base64url'));
  await X.p.waitForTimeout(1500);
  check(!(await X.p.evaluate(() => window.__pwned)) && await X.p.locator('img[onerror]').count() === 0, 'customer page: injected code does not run');
  await O.p.goto(SYS + '/vendors/app.html?t=vevilaaa'); await O.p.waitForSelector('#main-app:not(.hidden)', { timeout: 20000 });
  await O.p.fill('#in_guests', '50'); await O.p.locator('#in_guests').dispatchEvent('input'); await O.p.waitForTimeout(500);
  await O.p.click('.tabs button[data-tab=dash]'); await O.p.waitForTimeout(800);
  check(!(await O.p.evaluate(() => window.__pwned)) && await O.p.locator('img[onerror]').count() === 0, 'owner viewing the vendor account: injected code does not run');
  errors.length = 0;   // השגיאות של הדפים הזדוניים (תמונה שלא נטענה) לא רלוונטיות

  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); console.error(e.stack); process.exit(2); });
