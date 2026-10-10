// Sales-site traffic counter (anonymous), TikTok pixel only after consent, owner admin: traffic table + Firebase usage card.
// Run like full.e2e.js.
const S = '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad';
const NM = S + '/t/node_modules/', FB = (process.env.FBDIR || NM + 'firebase/'), FBV = require(FB + 'package.json').version;
const { chromium } = require(NM + 'playwright-core');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(NM + 'axe-core/axe.min.js', 'utf8');
const SITE = 'http://localhost:8791', SYS = SITE + '/system';
const SHOTS = S + '/shots-traffic/'; fs.mkdirSync(SHOTS, { recursive: true });
const ILANA = 'snapboxevent.official@gmail.com';
const fs_size_offer = () => fs.statSync(SHOTS + 'offer-signed.pdf').size;
const REG = `window.REGISTRY = [{ slug: 'demo', name: 'עסק לדוגמה', admins: ['noa@gmail.com'] }, { slug: 'ilana', name: 'אילנה עיצוב אירועים', admins: ['${ILANA}'] }];`;
const errors = [], sent = [], a11y = [];
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function setup(ctx){
  await ctx.addInitScript(() => { window.__EMU__ = { firestore: 8085, auth: 9099 }; try { localStorage.removeItem('sb.pdfMigrated.v1'); } catch(e) {} });   // הבדיקה מוסיפה קבצים ישנים אחרי הכניסה הראשונה
  // keepalive fetch (המונה) לא עובר דרך יירוט של Playwright — לכן בקשות לאמולטור Firestore לא מיורטות כאן
  await ctx.route(url => !url.href.includes('127.0.0.1:8085'), async route => {
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
    if (u.includes('formsubmit')) { sent.push({ url: u, body: route.request().postData() || '' }); return route.fulfill({ body: 'ok', contentType: 'text/html' }); }
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
const REST = 'http://127.0.0.1:8085/v1/projects/check-b2a66/databases/default/documents/';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const iso = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
async function setUntil(slug, v){ const r = await fetch(REST + `tenants/${slug}?updateMask.fieldPaths=supportUntil`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { supportUntil: { stringValue: v } } }) }); if (!r.ok) throw new Error(await r.text()); }
async function hasNotice(slug, v){ return (await fetch(REST + `tenants/${slug}/notices/support-${v}`, { headers: H })).ok; }
const reminders = () => sent.filter(s => s.url.includes('formsubmit.co/ajax/') && s.body.includes('תזכורת'));

const big = 'JVBERi0xLjQK' + 'A'.repeat(300000);
async function put(path, fields){ const r = await fetch(REST + path, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) }); if (!r.ok) throw new Error(await r.text()); }
async function slow(page){ const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 400 * 1024, uploadThroughput: 150 * 1024 }); }
const sec = ms => (ms / 1000).toFixed(1) + 's';


const PIXEL_ID = 'CTEST1234567890ABCDEF';
const pixelHits = [];
async function salesCtx(b, withPixel){
  const { ctx, p } = await newPage(b, { width: 390, height: 844 }, withPixel ? 'sales-pixel' : 'sales');
  await ctx.route('**/analytics.tiktok.com/**', r => { pixelHits.push(r.request().url()); r.fulfill({ body: 'window.__pixelLoaded=1;', contentType: 'application/javascript' }); });
  // מזהה פיקסל לבדיקה (או ריק = כבוי), במקום המזהה האמיתי שבדף
  await ctx.addInitScript(id => { Object.defineProperty(window, 'MARKETING', { get: () => ({ tiktokPixel: id }), set: () => {} }); }, withPixel ? PIXEL_ID : '');
  return { ctx, p };
}
const stat = async () => { const j = await (await fetch(REST + 'stats/d' + Math.floor(Date.now() / 86400000), { headers: H })).json(); const f = j.fields || {}; const n = k => Number((f[k] || {}).integerValue || 0); return { v: n('v'), t: n('t'), w: n('w'), l: n('l'), f: n('f'), d: n('d') }; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors'] });
  // 1) גולש רגיל — נספר פעם אחת ביום, באנר הרגיל (בלי פיקסל מוגדר)
  const A = await salesCtx(b, false);
  await A.p.goto(SYS + '/'); await A.p.waitForTimeout(1500);
  await A.p.reload(); await A.p.waitForTimeout(1500);
  let s; for (let i = 0; i < 20 && !(s = await stat()).v; i++) await A.p.waitForTimeout(500);   // הכתיבה הראשונה לאמולטור איטית
  check(s.v === 1, `visit counted once per device per day (v=${s.v})`);
  check(await A.p.isVisible('#cookie-bar') && !(await A.p.isVisible('#cookie-yes')), 'no pixel configured → plain notice, no consent question');
  // לחיצה על וואטסאפ ועל כניסת ספקים
  await A.p.evaluate(() => { const a = document.querySelector('a.wa-float'); a.addEventListener('click', e => e.preventDefault()); a.click(); });
  await A.p.evaluate(() => { const a = document.querySelector('a.vendor-login'); a.addEventListener('click', e => e.preventDefault()); a.click(); });
  await A.p.waitForTimeout(1200);
  s = await stat(); check(s.w === 1 && s.l === 1, `WhatsApp click and vendor-login click counted (w=${s.w}, l=${s.l})`);
  check(pixelHits.length === 0, 'no pixel loaded when not configured');
  await A.ctx.close();
  // 2) גולש מטיקטוק, עם פיקסל מוגדר
  const B = await salesCtx(b, true);
  await B.p.goto(SYS + '/?utm_source=tiktok'); await B.p.waitForTimeout(1500);
  s = await stat(); check(s.v === 2 && s.t === 1, `TikTok visit counted (v=${s.v}, t=${s.t})`);
  check(await B.p.isVisible('#cookie-yes') && await B.p.isVisible('#cookie-no'), 'pixel configured → consent question with "אישור" / "רק הכרחיות"');
  check(pixelHits.length === 0, 'pixel NOT loaded before consent');
  await axe(B.p, 'sales page with consent banner');
  await B.p.click('#cookie-yes'); await B.p.waitForTimeout(800);
  check(pixelHits.some(u => u.includes('sdkid=' + PIXEL_ID)), 'pixel loads after "אישור"');
  await B.p.reload(); await B.p.waitForTimeout(1000);
  check(!(await B.p.isVisible('#cookie-bar')), 'choice remembered (no banner again)');
  await B.p.evaluate(() => { const a = document.querySelector('a.wa-float'); a.addEventListener('click', e => e.preventDefault()); a.click(); });
  await B.p.waitForTimeout(500);
  const q = await B.p.evaluate(() => JSON.stringify(window.ttq && Array.from(window.ttq).slice(-3)));
  check(/"track","Contact"/.test(q || ''), 'WhatsApp click → pixel "Contact" event');
  // 3) "רק הכרחיות" — הפיקסל לא נטען
  const C = await salesCtx(b, true); const before = pixelHits.length;
  await C.p.goto(SYS + '/'); await C.p.waitForTimeout(1000); await C.p.click('#cookie-no'); await C.p.reload(); await C.p.waitForTimeout(1000);
  check(pixelHits.length === before, 'declined → pixel never loads');
  // 3ב) מודעה בטיקטוק בלי utm — טיקטוק מוסיף ttclid לבד
  const D = await salesCtx(b, false);
  await D.p.goto(SYS + '/?ttclid=E.C.P.abc123'); await D.p.waitForTimeout(1500);
  s = await stat(); check(s.v === 4 && s.t === 2, `TikTok ad click (ttclid) counted as TikTok (v=${s.v}, t=${s.t})`);
  // 3ג) ראש הדף, פס תחתון, טופס "חזרו אליי" והצעה לדוגמה
  await D.p.click('#cookie-ok, #cookie-no').catch(() => {});
  check(await D.p.isVisible('#hero-offer') && /1,499/.test(await D.p.textContent('#hero-offer')), 'hero shows the launch price');
  const heroWa = await D.p.locator('.hero .btn.wa').boundingBox();
  check(heroWa && heroWa.y + heroWa.height <= 844, `WhatsApp button visible in the first screen on a phone (bottom=${heroWa && Math.round(heroWa.y + heroWa.height)})`);
  check(!(await D.p.isVisible('#mbar.show')), 'bottom bar hidden at the top of the page');
  await D.p.evaluate(() => window.scrollTo(0, 2500)); await D.p.waitForTimeout(600);
  check(await D.p.isVisible('#mbar.show'), 'bottom bar shows after scrolling past the hero');
  await D.p.evaluate(() => document.getElementById('contact').scrollIntoView()); await D.p.waitForTimeout(600);
  check(!(await D.p.isVisible('#mbar.show')), 'bottom bar hides at the contact section');
  const leads = [];
  let leadOk = true;
  await D.ctx.route('**/formsubmit.co/ajax/**', r => { leads.push(r.request().postData() || ''); r.fulfill(leadOk ? { body: '{"success":"true"}', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } } : { body: '{"success":"false","message":"activate"}', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } }); });
  await D.p.click('#lf-send');
  check(/שם/.test(await D.p.textContent('#lf-msg')) && leads.length === 0, 'lead form: empty name → error, nothing sent');
  await D.p.fill('#lf-name', 'דני'); await D.p.fill('#lf-phone', '050-1234567'); await D.p.selectOption('#lf-field', 'DJ'); await D.p.click('#lf-send');
  await D.p.waitForFunction(() => /תודה/.test(document.getElementById('lf-msg').textContent), null, { timeout: 8000 });
  check(leads.length === 1 && /דני/.test(leads[0]) && /050-1234567/.test(leads[0]) && /DJ/.test(leads[0]), 'lead form sent (name, phone, field)');
  leadOk = false;
  await D.p.fill('#lf-name', 'רוני'); await D.p.fill('#lf-phone', '0521234567'); await D.p.click('#lf-send');
  await D.p.waitForSelector('#lf-msg.bad a[href*="wa.me"]', { timeout: 8000 });
  check(/%D7%A8%D7%95%D7%A0%D7%99|רוני/.test(await D.p.getAttribute('#lf-msg a', 'href')), 'lead form failure → WhatsApp link with the details');
  const sentBefore = sent.length;
  const [demo] = await Promise.all([D.ctx.waitForEvent('page'), D.p.click('#demo-link')]);
  await demo.waitForSelector('.demo-note', { timeout: 20000 });
  check(/לדוגמה/.test(await demo.textContent('.demo-note')) && /משפחת כהן/.test(await demo.textContent('body')), 'demo quote opens with the "הצעה לדוגמה" note');
  check(!/Snap ?Box/i.test(await demo.textContent('body')), 'demo quote has no Snap Box');
  demo.on('dialog', d => { console.log('   dialog:', d.message()); d.dismiss(); });
  demo.on('pageerror', e => console.log('   demo error:', e.message));
  await demo.locator('#sig-canvas').scrollIntoViewIfNeeded();
  const cv = await demo.locator('#sig-canvas').boundingBox();
  await demo.mouse.move(cv.x + 40, cv.y + 60); await demo.mouse.down();
  for (let i = 0; i < 24; i++) await demo.mouse.move(cv.x + 40 + i * 9, cv.y + 60 - Math.sin(i / 3) * 30);
  await demo.mouse.up();
  await demo.check('#agree-terms'); await demo.click('#submit-btn');
  await demo.waitForFunction(() => /הדגמה/.test((document.getElementById('pdf-hide-controls') || {}).textContent || ''), null, { timeout: 30000 }).catch(async e => { console.log('   demo state:', (await demo.textContent('#pdf-hide-controls')).slice(0, 200), await demo.evaluate(() => getComputedStyle(document.getElementById('pdf-overlay')).display)); await demo.screenshot({ path: '/tmp/claude-0/-home-user/33274e87-36f1-52fb-a542-54f1e7d0e4b6/scratchpad/demo-fail.png' }); throw e; });
  check(sent.length === sentBefore, 'demo signing sends nothing to the business');
  await demo.close();
  s = await stat(); check(s.f === 1 && s.d === 1, `lead form and demo open counted (f=${s.f}, d=${s.d})`);
  await D.ctx.close();
  // 4) לוח הניהול
  const O = await newPage(b, { width: 1280, height: 900 }, 'owner');
  await O.ctx.route('https://monitoring.googleapis.com/**', r => { const u = decodeURIComponent(r.request().url());
    const n = /billable_read_units/.test(u) && !/realtime/.test(u) ? '12345' : /realtime/.test(u) ? '655' : '2345';
    r.fulfill({ body: JSON.stringify({ timeSeries: [{ points: [{ value: { int64Value: n } }] }] }), contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } }); });
  await login(O.p, 'arielkahalani1@gmail.com'); await O.p.waitForURL(/admin\.html/, { timeout: 15000 });
  await O.p.waitForFunction(() => !document.querySelector('#traffic .loading'), null, { timeout: 15000 });
  const today = (await O.p.textContent('#traffic tr:first-child')).replace(/\s+/g, ' ');
  console.log('   traffic today:', today);
  check(/היום\s*4\s*2\s*2\s*1\s*1\s*1/.test(today), 'admin traffic: today 4 visits, 2 from TikTok, 2 WhatsApp, 1 lead, 1 demo, 1 vendor login');
  await O.p.click('#quota-btn'); await O.p.waitForSelector('#quota-bars:not([hidden]) .qbar', { timeout: 15000 });
  const qt = (await O.p.textContent('#quota-card')).replace(/\s+/g, ' ');
  console.log('   quota:', qt.slice(0, 200));
  check(qt.includes('13,000') && qt.includes('50,000') && qt.includes('2,345') && qt.includes('40,000'), 'Firebase usage: reads 13,000/50,000 and writes 2,345/40,000');
  check(/מתאפס ב-\d{2}:\d{2}/.test(qt), 'shows the reset time');
  await axe(O.p, 'admin with traffic + quota cards');
  check(!errors.length, 'no page errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await b.close(); console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED'); process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
