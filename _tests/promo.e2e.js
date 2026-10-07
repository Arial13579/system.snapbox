// Launch promo limited to 5 signed offers: admin counter + public/promo + sales page + offer page block.
// Run inside: firebase emulators:exec --only firestore,auth --project check-b2a66 "node promo.e2e.js" (setup like full.e2e.js)
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = NM + 'firebase/', FBV = require(NM + 'firebase/package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const EMU = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const REG = fs.readFileSync('/home/user/system.snapbox/vendors/registry.js', 'utf8');
const errors = []; let failures = 0;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };
async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099 }; });
  await ctx.route('**/*', async route => {
    const u = route.request().url(), H = { 'Access-Control-Allow-Origin': '*' };
    const m = u.match(/gstatic\.com\/firebasejs\/([\d.]+)\/(firebase-(app|auth|firestore)\.js)$/);
    if (m && m[1] !== FBV) return route.fulfill({ body: `export * from 'https://www.gstatic.com/firebasejs/${FBV}/${m[2]}';`, contentType: 'application/javascript', headers: H });
    if (m) return route.fulfill({ body: fs.readFileSync(FB + m[2]), contentType: 'application/javascript', headers: H });
    if (u.startsWith('https://firestore.googleapis.com/v1/projects/check-b2a66/databases/default/documents/')) {
      const r = await fetch(EMU + u.split('/documents/')[1]); return route.fulfill({ status: r.status, body: await r.text(), contentType: 'application/json', headers: H });
    }
    if (u.endsWith('html2canvas.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'html2canvas/dist/html2canvas.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('jspdf.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'jspdf/dist/jspdf.umd.min.js'), contentType: 'application/javascript' });
    if (u.endsWith('chart.umd.min.js')) return route.fulfill({ body: fs.readFileSync(NM + 'chart.js/dist/chart.umd.js'), contentType: 'application/javascript' });
    if (u.includes('/vendors/registry.js')) return route.fulfill({ body: REG, contentType: 'application/javascript' });
    if (u.startsWith(SITE) || u.includes('127.0.0.1')) return route.continue();
    if (u.includes('fonts.g')) return route.fulfill({ body: '', contentType: 'text/css' });
    return route.abort();
  });
}
async function newPage(b, name){
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' }); await setup(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ': ' + e.message));
  p.on('dialog', d => d.accept());
  return { ctx, p };
}
const str = v => ({ stringValue: v }), int = v => ({ integerValue: String(v) });
const offer = (id, status) => fetch(EMU + 'platformQuotes?documentId=' + id, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {
  vendorName: str('ספק ' + id), contactName: str('בדיקה'), plan: str('launch'), price: int(1499), total: int(1499), status: str(status),
  createdAt: { timestampValue: '2026-10-07T09:00:00Z' }, ...(status === 'signed' ? { signedAt: { timestampValue: '2026-10-07T10:00:00Z' } } : {}) } }) });
const promoDoc = async () => { const r = await fetch(EMU + 'public/promo', { headers: { Authorization: 'Bearer owner' } }); return r.ok ? (await r.json()).fields : null; };
const b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (let i = 1; i <= 4; i++) await offer('s' + i, 'signed');
  await offer('p1', 'pending'); await offer('r1', 'pending');

  console.log('1. 4 of 5 signed');
  const O = await newPage(b, 'owner');
  await O.p.goto(SYS + '/vendors/'); await O.p.waitForFunction(() => window.__fb);
  await O.p.evaluate(() => __fb.authMod.signInWithCredential(__fb.auth, __fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: 'owner', email: 'arielkahalani1@gmail.com', email_verified: true }))));
  await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForFunction(() => document.getElementById('o_promo').textContent.includes('4 מתוך 5'), null, { timeout: 15000 });
  check(true, 'admin: "4 מתוך 5 חתמו" (pending offers not counted)');
  check(!(await O.p.evaluate(() => document.querySelector('#o_plan option[value=launch]').disabled)) && (await O.p.textContent('#o_plan option[value=launch]')).includes('נשארו 1'), 'launch still selectable: "נשארו 1 מתוך 5"');
  let pr = null; for (let i = 0; i < 20 && !(pr && pr.launchSigned && pr.launchSigned.integerValue === '4'); i++) { pr = await promoDoc(); await new Promise(r => setTimeout(r, 300)); }
  check(pr && pr.launchSigned.integerValue === '4' && pr.soldOut.booleanValue === false, 'public/promo: 4 signed, not sold out');
  const W = await newPage(b, 'site');
  await W.p.goto(SYS + '/');
  await W.p.waitForFunction(() => document.getElementById('launch-left').textContent.includes('נשארו 1'), null, { timeout: 15000 });
  check(await W.p.locator('#launch-seats i.used').count() === 4, 'sales page: 1 seat left, 4 taken');

  console.log('2. 5th signature → sold out');
  await offer('s5', 'signed');
  await O.p.waitForFunction(() => document.getElementById('o_promo').textContent.includes('נגמר'), null, { timeout: 15000 });
  check(await O.p.evaluate(() => document.querySelector('#o_plan option[value=launch]').disabled), 'admin: launch option disabled');
  check((await O.p.textContent('#o_plan option[value=launch]')).includes('המבצע נגמר'), 'admin: "המבצע נגמר"');
  check(await O.p.inputValue('#o_plan') === 'regular', 'admin switched the form to the regular price');
  for (let i = 0; i < 20 && !(pr && pr.soldOut && pr.soldOut.booleanValue); i++) { pr = await promoDoc(); await new Promise(r => setTimeout(r, 300)); }
  check(pr.soldOut.booleanValue === true && pr.launchSigned.integerValue === '5', 'public/promo: sold out');
  await W.p.reload();
  await W.p.waitForFunction(() => document.getElementById('launch-card').classList.contains('soldout'), null, { timeout: 15000 });
  const card = await W.p.textContent('#launch-card');
  check(card.includes('נגמר המבצע') && card.includes('הפתעות בהמשך'), 'sales page: "נגמר המבצע · הפתעות בהמשך"');
  await W.p.locator('#launch-card').screenshot({ path: S + '/promo-site.png' });

  console.log('3. pending launch offer can no longer be signed; regular can');
  const raw = id => [id, 'ספק ' + id, 'בדיקה', '', 'launch', 1499, 2, 0, 69, 0, 1499, '', 30, '2026-10-07', '', 1999, '', 500, ''].join('|');
  await W.p.goto(SYS + '/offer/?q=' + b64(raw('p1')));
  await W.p.waitForSelector('.expired', { timeout: 15000 });
  check((await W.p.textContent('.expired')).includes('מבצע ההשקה נגמר') && await W.p.locator('#sign-form').count() === 0, 'launch offer: "מבצע ההשקה נגמר", no signing');
  await W.p.goto(SYS + '/offer/?q=' + b64(raw('r1').replace('|launch|', '|regular|').replace('|1499|2|', '|1999|0|').replace('|1499||', '|1999||')));
  await W.p.waitForSelector('#sign-form', { timeout: 15000 });
  check(true, 'regular offer still signable');

  await b.close();
  if (errors.length) { console.log('\nPage errors:'); errors.forEach(e => console.log('  - ' + e)); }
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
