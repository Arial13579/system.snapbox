// End-to-end: owner admin → vendor generator → customer signs → dashboards, against Firebase emulators.
const { chromium } = require('/tmp/claude-0/-home-user-Aura-event/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad/node_modules/playwright');
const fs = require('fs'), path = require('path');
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/chk/node_modules/', FB = S + '/rules/node_modules/firebase/';
const SITE = 'http://localhost:8791';
const SHOTS = S + '/e2e/shots/';
const REG = "window.REGISTRY = [{ slug: 'demo', name: 'עסק לדוגמה', admins: ['noa@gmail.com'] }];";
const errors = [], sent = [];
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099 }; });
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    const m = u.match(/gstatic\.com\/firebasejs\/([\d.]+)\/(firebase-(app|auth|firestore)\.js)$/);
    if (m && m[1] !== '10.14.1') return route.fulfill({ body: `export * from 'https://www.gstatic.com/firebasejs/10.14.1/${m[2]}';`, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (m) return route.fulfill({ body: fs.readFileSync(FB + m[2]), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.endsWith('html2canvas.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'html2canvas/dist/html2canvas.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('jspdf.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'jspdf/dist/jspdf.umd.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('chart.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'chart.js/dist/chart.umd.js'), contentType: 'application/javascript' });
    if (u.includes('/vendors/registry.js')) return route.fulfill({ body: REG, contentType: 'application/javascript' });
    if (u.startsWith('https://arial13579.github.io/hatzaa/')) {
      const rel = decodeURIComponent(new URL(u).pathname.replace('/hatzaa/', '')) || 'index.html';
      let f = path.join('/home/user/hatzaa', rel); if (f.endsWith('/')) f += 'index.html';
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      const ct = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
      return route.fulfill({ body: fs.readFileSync(f), contentType: ct });
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
  p.on('console', m => { if (m.type() === 'warning' && name === 'customer') console.log('    [warn]', m.text().slice(0, 300)); if (m.type() === 'error' && !/404|ERR_FAILED|net::/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  return { ctx, p };
}
async function login(p, email){
  await p.goto(SITE + '/system/vendors/');
  await p.waitForFunction(() => window.__fb);
  await p.evaluate(e => __fb.authMod.signInWithCredential(__fb.auth, __fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + e, email: e, email_verified: true }))), email);
}
async function fillQuote(p, name){
  await p.waitForSelector('#in_clientName', { state: 'visible' });
  await p.fill('#in_clientName', name);
  await p.fill('#in_eventType', 'חתונה');
  await p.selectOption('#in_service', 'dj_sax');
  await p.fill('#in_location', 'אולמי הנסיכה, באר שבע');
  await p.locator('#in_location').blur();
  await p.locator('#in_date').pressSequentially('20082027');
  await p.locator('#in_startTime').pressSequentially('2000');
  await p.locator('#in_endTime').pressSequentially('0200');
  await p.fill('#in_guests', '320'); await p.locator('#in_guests').dispatchEvent('input');
  await p.fill('#in_notes', 'שיר כניסה לחופה לבחירת הזוג');
  await p.waitForFunction(() => document.getElementById('in_distance').value === '112', null, { timeout: 15000 });
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }, args: ['--ignore-certificate-errors'] });

  console.log('1. Owner → admin (sync)');
  const O = await newPage(b, { width: 1280, height: 900 }, 'owner');
  await login(O.p, 'arielkahalani1@gmail.com');
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForSelector('text=מסונכרן ✓', { timeout: 15000 });
  await O.p.waitForSelector('#tbody tr td.name');
  check((await O.p.textContent('#tbody')).includes('noa@gmail.com'), 'admin lists demo with vendor email');
  await O.p.screenshot({ path: SHOTS + 'admin.png', fullPage: true });

  console.log('2. Owner enters vendor account');
  await O.p.click('text=כניסה לחשבון');
  await O.p.waitForURL(/app\.html\?t=demo/);
  await O.p.waitForSelector('#owner-banner:not(.hidden)');
  check(true, 'owner banner shown');
  await fillQuote(O.p, 'בדיקת בעלים');
  check(await O.p.inputValue('#in_price') === '7450', 'price computed: ' + await O.p.inputValue('#in_price'));
  await O.p.click('#gen-btn');
  await O.p.waitForSelector('#link-result:not(.hidden)');
  await O.p.screenshot({ path: SHOTS + 'owner-app.png', fullPage: true });

  console.log('3. Vendor logs in');
  const V = await newPage(b, { width: 390, height: 844 }, 'vendor');
  await login(V.p, 'noa@gmail.com');
  await V.p.waitForURL(/app\.html\?t=demo/, { timeout: 15000 });
  check(await V.p.isHidden('#owner-banner'), 'no owner banner for vendor');
  await fillQuote(V.p, 'נועה ואיתי כהן');
  await V.p.screenshot({ path: SHOTS + 'vendor-form.png', fullPage: true });
  await V.p.click('#gen-btn');
  await V.p.waitForSelector('#link-result:not(.hidden)');
  const link = await V.p.inputValue('#shareable-url');
  check(link.startsWith('https://arial13579.github.io/hatzaa/demo/?q='), 'customer link on neutral site: ' + link.slice(0, 60));
  check(!/snapbox|check/i.test(link.replace('arial13579.github.io', '')), 'link has no snapbox/check');

  console.log('4. Customer signs');
  const C = await newPage(b, { width: 390, height: 844 }, 'customer');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE));
  await C.p.waitForSelector('#sig-canvas');
  await C.p.waitForTimeout(800);
  const html = await C.p.content();
  check(!/snap ?box/i.test(await C.p.textContent('body')), 'customer page text has no Snap Box');
  await C.p.screenshot({ path: SHOTS + 'customer.png', fullPage: true });
  await C.p.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const bb = await C.p.locator('#sig-canvas').boundingBox();
  await C.p.mouse.move(bb.x + 40, bb.y + 110); await C.p.mouse.down();
  for (let i = 0; i < 28; i++) await C.p.mouse.move(bb.x + 40 + i * 9, bb.y + 110 - Math.sin(i / 3) * 40);
  await C.p.mouse.up();
  await C.p.check('#agree-terms');
  const dl = C.p.waitForEvent('download', { timeout: 60000 });
  await C.p.click('#submit-btn');
  const d = await dl; await d.saveAs(SHOTS + 'contract.pdf');
  await C.p.waitForSelector('.done', { timeout: 20000 });
  check(true, 'customer sees success');
  await C.p.screenshot({ path: SHOTS + 'customer-signed.png', fullPage: true });
  check(sent.some(u => u.includes('formsubmit.co/arielkahalani1@gmail.com')), 'email sent to tenant email');

  console.log('5. Vendor dashboard');
  for (const db of ['default', '(default)']) {
    const r = await fetch(`http://127.0.0.1:8085/v1/projects/check-b2a66/databases/${encodeURIComponent(db)}/documents/tenants/demo/quotes`, { headers: { Authorization: 'Bearer owner' } });
    const j = await r.json(); console.log('   db', db, (j.documents || []).map(d => d.name.split('/').pop() + ':' + d.fields.status.stringValue).join(', ') || JSON.stringify(j).slice(0, 120));
  }
  await V.p.click('.tabs button[data-tab=dash]');
  await V.p.waitForSelector('#tbody .pill.signed', { timeout: 15000 });
  const rowsTxt = await V.p.textContent('#tbody');
  check(rowsTxt.includes('נועה ואיתי כהן') && rowsTxt.includes('בדיקת בעלים'), 'vendor sees both quotes');
  check(await V.p.locator('.view-file').count() === 1, 'signed PDF stored');
  await V.p.waitForTimeout(800);
  await V.p.screenshot({ path: SHOTS + 'vendor-dash.png', fullPage: true });

  console.log('6. Customer legal page');
  await C.p.goto(link.replace('https://arial13579.github.io', SITE).replace('/demo/?q=', '/legal/terms.html?t=demo&q='));
  await C.p.waitForSelector('h1');
  check((await C.p.textContent('body')).includes('עסק לדוגמה'), 'legal page branded');
  await C.p.screenshot({ path: SHOTS + 'legal.png' });

  console.log('7. Stranger + suspension');
  const X = await newPage(b, { width: 390, height: 844 }, 'stranger');
  await login(X.p, 'stranger@gmail.com');
  await X.p.waitForSelector('#err:not(.hidden)', { timeout: 15000 });
  check((await X.p.textContent('#err')).includes('לא רשום'), 'stranger blocked');
  await X.p.goto(SITE + '/system/vendors/app.html?t=demo');
  await X.p.waitForSelector('#blocked:not(.hidden)', { timeout: 15000 });
  check(true, 'stranger blocked from app URL directly');
  await X.p.goto(SITE + '/system/vendors/admin.html');
  await X.p.waitForSelector('#blocked:not(.hidden)', { timeout: 15000 });
  check(true, 'stranger blocked from admin');

  await O.p.goto(SITE + '/system/vendors/admin.html');
  await O.p.waitForSelector('button.toggle');
  check((await O.p.textContent('#kpis')).includes('2'), 'admin counts quotes');
  O.p.once('dialog', d => d.accept());
  await O.p.click('button.toggle');
  await O.p.waitForSelector('.pill.off');
  await O.p.screenshot({ path: SHOTS + 'admin-suspended.png', fullPage: true });
  await V.p.goto(SITE + '/system/vendors/app.html?t=demo');
  await V.p.waitForSelector('#blocked:not(.hidden)', { timeout: 15000 });
  check((await V.p.textContent('#blocked-msg')).includes('מושהה'), 'suspended vendor blocked');

  console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors'));
  console.log(failures ? `${failures} checks FAILED` : 'ALL CHECKS PASSED');
  await b.close();
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); console.log(errors.join('\n')); process.exit(2); });
