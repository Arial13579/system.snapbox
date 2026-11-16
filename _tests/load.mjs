// Run from the repo root (deps in $S/t/node_modules, copy this file there): V=20 N=25 PDF=<signed.pdf> node $S/t/load.mjs
// Load test: 20 vendors working at the same time against the emulator with the real rules.
// Each vendor creates quotes (quote + short link + shortId), customers open (view +1), sign (signedQ = link) and attach a PDF.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, orderBy, limit, where, serverTimestamp, increment, getCountFromServer, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
const VENDORS = +(process.env.V || 20), PER = +(process.env.N || 25), SIGN_RATE = 0.4;
const PDF = 'data:application/pdf;base64,' + fs.readFileSync(process.env.PDF).toString('base64');
const env = await initializeTestEnvironment({ projectId: 'check-b2a66', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
await env.clearFirestore();
const slugs = Array.from({ length: VENDORS }, (_, i) => 'load' + String(i).padStart(2, '0'));
await env.withSecurityRulesDisabled(async c => { const db = c.firestore();
  for (const s of slugs) { await setDoc(doc(db, 'tenants', s), { slug: s, name: 'ספק ' + s, admins: [s + '@gmail.com'], active: true, createdAt: new Date() });
    await setDoc(doc(db, 'vendorIndex', s + '@gmail.com'), { tenant: s }); } });
const lat = {}, errs = [];
const time = async (k, fn) => { const t = Date.now(); try { return await fn(); } catch (e) { errs.push(k + ': ' + (e.code || e.message)); } finally { (lat[k] = lat[k] || []).push(Date.now() - t); } };
const rnd = () => Math.random().toString(36).slice(2, 12);
const anonDb = () => env.unauthenticatedContext().firestore();
let created = 0, signed = 0;
async function vendor(s){
  const db = env.authenticatedContext(s, { email: s + '@gmail.com', email_verified: true }).firestore();
  for (let i = 0; i < PER; i++) {
    const id = Date.now().toString(36) + rnd().slice(0, 6);
    const q = { clientName: 'לקוח ' + i, clientPhone: '0501234567', eventType: 'חתונה', location: 'אולם הגן, ראשון לציון', date: '20/06/2027', price: 5400, deposit: 1500,
      notes: 'הערה לדוגמה '.repeat(10), mode: 'items', items: [{ label: 'סטילס', qty: 1, price: 3500, desc: 'צלם סטילס לכל האירוע, כולל עריכה ו-400 תמונות' }, { label: 'וידאו', qty: 1, price: 1900, desc: 'צלם וידאו + סרט ערוך' }],
      discount: 0, service: '', startTime: '19:00', endTime: '', guests: 300, validUntil: '2027-01-01', payment: { methods: ['ביט', 'העברה'], due: 'שבוע לפני' },
      perks: [{ label: 'מגנטים', worth: 300 }], extras: [{ label: 'רחפן', price: 1200, desc: 'צילום אווירי' }], status: 'pending', createdAt: serverTimestamp(), createdBy: s + '@gmail.com' };
    const ok = await time('1 vendor creates quote', () => setDoc(doc(db, 'tenants', s, 'quotes', id), q).then(() => true));
    if (!ok) continue; created++;
    const linkQ = Buffer.from(JSON.stringify(q).repeat(2)).toString('base64url').slice(0, 2600);   // ~ like the real ?q=
    const sid = rnd();
    await time('2 vendor creates short link', () => setDoc(doc(db, 'shortLinks', sid), { q: linkQ, kind: 'quote', tenant: s, createdAt: serverTimestamp() }));
    await time('3 vendor saves shortId', () => updateDoc(doc(db, 'tenants', s, 'quotes', id), { shortId: sid }));
    // customer
    const a = anonDb();
    await time('4 customer opens link', () => getDoc(doc(a, 'shortLinks', sid)));
    await time('5 customer view +1', () => updateDoc(doc(a, 'tenants', s, 'quotes', id), { views: increment(1), lastViewedAt: serverTimestamp() }));
    if (Math.random() < SIGN_RATE) {
      const r = await time('6 customer signs', () => updateDoc(doc(a, 'tenants', s, 'quotes', id), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'Mozilla/5.0 load', signedQ: linkQ, signerName: 'לקוח' }).then(() => true));
      if (r) { signed++;
        await time('7 customer uploads PDF', () => setDoc(doc(a, 'tenants', s, 'quotes', id, 'pdf', 'file'), { pdfData: PDF, at: serverTimestamp() }));
        await time('8 customer marks hasPdf', () => updateDoc(doc(a, 'tenants', s, 'quotes', id), { hasPdf: true })); }
    }
  }
  // vendor opens the dashboard (as the app does)
  await time('9 dashboard: last 50', () => getDocs(query(collection(db, 'tenants', s, 'quotes'), orderBy('createdAt', 'desc'), limit(50))));
  await time('9 dashboard: counts', () => getCountFromServer(query(collection(db, 'tenants', s, 'quotes'), where('status', '==', 'signed'))));
  // attacks while under load
  const other = slugs[(slugs.indexOf(s) + 1) % slugs.length];
  for (const [k, p] of [['read other vendor', () => getDocs(collection(db, 'tenants', other, 'quotes'))], ['write other vendor', () => setDoc(doc(db, 'tenants', other, 'quotes', 'x' + rnd()), { status: 'pending' })],
    ['list shortLinks', () => getDocs(collection(db, 'shortLinks'))], ['list vendorConfigs', () => getDocs(collection(anonDb(), 'vendorConfigs'))], ['anon reads quotes', () => getDocs(collection(anonDb(), 'tenants', s, 'quotes'))]])
    try { await p(); errs.push('SECURITY HOLE: ' + k + ' allowed'); } catch (e) { /* denied = good */ }
}
const t0 = Date.now();
await Promise.all(slugs.map(vendor));
const secs = (Date.now() - t0) / 1000;
// sizes
let sizes; await env.withSecurityRulesDisabled(async c => { const db = c.firestore(); const s = slugs[0];
  const qs = await getDocs(collection(db, 'tenants', s, 'quotes')); const one = qs.docs.find(d => d.data().status === 'signed') || qs.docs[0];
  const pend = qs.docs.find(d => d.data().status === 'pending');
  sizes = { signedQuoteBytes: JSON.stringify(one.data()).length, pendingQuoteBytes: pend ? JSON.stringify(pend.data()).length : 0, pdfBytes: PDF.length, total: (await getCountFromServer(collection(db, 'tenants', s, 'quotes'))).data().count }; });
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
console.log(`\n${VENDORS} vendors × ${PER} quotes in parallel: ${created} created, ${signed} signed, ${secs.toFixed(1)}s, ${(created / secs).toFixed(1)} quotes/s`);
for (const k of Object.keys(lat).sort()) console.log(`  ${k.padEnd(30)} n=${String(lat[k].length).padStart(4)}  median ${pct(lat[k], .5)}ms  p95 ${pct(lat[k], .95)}ms  max ${Math.max(...lat[k])}ms`);
console.log('errors:', errs.length ? errs.slice(0, 20) : 'none');
console.log('sizes:', sizes);
await env.cleanup();
process.exit(errs.length ? 1 : 0);
