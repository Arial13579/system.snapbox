import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, increment, Timestamp, writeBatch } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'check-b2a66', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
const as = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
const owner = as('arielkahalani1@gmail.com'), noa = as('noa@gmail.com'), yossi = as('yossi@gmail.com'), stranger = as('x@gmail.com');
const ownerUnverified = as('arielkahalani1@gmail.com', false);
const anon = env.unauthenticatedContext().firestore();
let pass = 0, fail = 0;
async function t(name, p){ try { await p; pass++; console.log('  ✓', name); } catch(e){ fail++; console.log('  ✗', name, '-', e.message.split('\n')[0]); } }
const ok = (n, p) => t(n, assertSucceeds(p)), no = (n, p) => t(n, assertFails(p));

console.log('Owner setup');
await ok('owner creates tenant noa', setDoc(doc(owner, 'tenants/noa'), { admins: ['noa@gmail.com'], active: true, name: 'Noa DJ' }));
await ok('owner creates tenant yossi', setDoc(doc(owner, 'tenants/yossi'), { admins: ['yossi@gmail.com'], active: true }));
await ok('owner writes vendorIndex', setDoc(doc(owner, 'vendorIndex/noa@gmail.com'), { tenant: 'noa' }));
await no('unverified owner cannot create tenant', setDoc(doc(ownerUnverified, 'tenants/z'), { admins: [], active: true }));

console.log('Vendor');
await ok('noa reads own index', getDoc(doc(noa, 'vendorIndex/noa@gmail.com')));
await no('noa cannot read other index', getDoc(doc(noa, 'vendorIndex/yossi@gmail.com')));
await no('noa cannot list index', getDocs(collection(noa, 'vendorIndex')));
await no('noa cannot write index', setDoc(doc(noa, 'vendorIndex/noa@gmail.com'), { tenant: 'yossi' }));
await ok('noa reads own tenant', getDoc(doc(noa, 'tenants/noa')));
await no('noa cannot read yossi tenant', getDoc(doc(noa, 'tenants/yossi')));
await no('noa cannot edit own tenant (add admin)', updateDoc(doc(noa, 'tenants/noa'), { admins: ['noa@gmail.com', 'x@gmail.com'] }));
await ok('noa creates quote', setDoc(doc(noa, 'tenants/noa/quotes/q1'), { clientName: 'A', price: 5000, status: 'pending', createdAt: serverTimestamp() }));
await no('noa cannot create quote as signed', setDoc(doc(noa, 'tenants/noa/quotes/q9'), { status: 'signed' }));
await ok('noa lists own quotes', getDocs(collection(noa, 'tenants/noa/quotes')));
await no('noa cannot list yossi quotes', getDocs(collection(noa, 'tenants/yossi/quotes')));
await no('noa cannot create in yossi', setDoc(doc(noa, 'tenants/yossi/quotes/q2'), { status: 'pending' }));
await no('stranger cannot read noa quotes', getDocs(collection(stranger, 'tenants/noa/quotes')));
await no('anon cannot read noa quote', getDoc(doc(anon, 'tenants/noa/quotes/q1')));

console.log('Client signing (anonymous)');
await no('anon cannot change price', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { price: 1 }));
await no('anon cannot sign + change price', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', price: 1 }));
await no('anon cannot sign with an IP', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', signedAt: serverTimestamp(), ip: '1.2.3.4', userAgent: 'UA' }));
await no('anon cannot backdate signature', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', signedAt: new Date('2020-01-01'), ip: null, userAgent: 'UA' }));
await no('anon cannot send a huge userAgent', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'x'.repeat(700) }));
await ok('anon signs (with signedQ)', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'YQ' }));
await no('anon cannot sign twice', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', ip: '9.9.9.9' }));
await ok('anon attaches pdf', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { pdfData: 'JVBERi0xLjQ=' }));
await no('anon cannot replace pdf', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { pdfData: 'other' }));
await no('anon cannot delete', deleteDoc(doc(anon, 'tenants/noa/quotes/q1')));
await no('anon cannot create quote', setDoc(doc(anon, 'tenants/noa/quotes/q3'), { status: 'pending' }));

console.log('Owner access + suspension');
await ok('owner reads noa quotes', getDocs(collection(owner, 'tenants/noa/quotes')));
await ok('owner suspends noa', updateDoc(doc(owner, 'tenants/noa'), { active: false }));
await no('suspended noa cannot read quotes', getDocs(collection(noa, 'tenants/noa/quotes')));
await ok('owner still reads noa quotes', getDocs(collection(owner, 'tenants/noa/quotes')));
await ok('owner reactivates noa', updateDoc(doc(owner, 'tenants/noa'), { active: true }));
await (async () => { const s = (await getDoc(doc(owner, 'tenants/noa/quotes/q1'))).data() || {}; if (s.status === 'signed') { await no('vendor cannot delete a signed quote', deleteDoc(doc(noa, 'tenants/noa/quotes/q1'))); await ok('owner deletes a signed quote', deleteDoc(doc(owner, 'tenants/noa/quotes/q1'))); } else await ok('noa deletes a pending quote after reactivation', deleteDoc(doc(noa, 'tenants/noa/quotes/q1'))); })();

console.log('Legacy CHECK system (unchanged behaviour)');
await ok('owner creates check quote', setDoc(doc(owner, 'check_quotes/c1'), { status: 'pending' }));
await no('noa cannot read check quotes', getDoc(doc(noa, 'check_quotes/c1')));
await ok('anon signs check quote', updateDoc(doc(anon, 'check_quotes/c1'), { status: 'signed', ip: null, userAgent: 'UA', signedAt: serverTimestamp() }));
await ok('anon attaches pdf check', updateDoc(doc(anon, 'check_quotes/c1'), { pdfData: 'x' }));
await ok('owner deletes check quote', deleteDoc(doc(owner, 'check_quotes/c1')));

console.log('Vendor terms consent');
const cons = (who, t, email, v, extra = {}) => setDoc(doc(who, `tenants/${t}/consents/${email}|${v}`), { email, version: v, acceptedAt: serverTimestamp(), userAgent: 'UA', ...extra });
await ok('noa records consent v1', cons(noa, 'noa', 'noa@gmail.com', 'v1'));
await no('noa cannot overwrite consent v1', cons(noa, 'noa', 'noa@gmail.com', 'v1'));
await ok('noa records consent v2 (new terms)', cons(noa, 'noa', 'noa@gmail.com', 'v2'));
await no('noa cannot delete consent', deleteDoc(doc(noa, 'tenants/noa/consents/noa@gmail.com|v1')));
await no('noa cannot consent for someone else', cons(noa, 'noa', 'x@gmail.com', 'v1'));
await no('id/version mismatch denied', setDoc(doc(noa, 'tenants/noa/consents/noa@gmail.com|v9'), { email: 'noa@gmail.com', version: 'v1', acceptedAt: serverTimestamp(), userAgent: 'UA' }));
await no('noa cannot consent in yossi', cons(noa, 'yossi', 'noa@gmail.com', 'v1'));
await no('consent with extra fields denied', cons(yossi, 'yossi', 'yossi@gmail.com', 'v1', { admin: true }));
await ok('noa reads own consent', getDoc(doc(noa, 'tenants/noa/consents/noa@gmail.com|v1')));
await ok('owner reads consents', getDocs(collection(owner, 'tenants/noa/consents')));
await no('anon cannot read consent', getDoc(doc(anon, 'tenants/noa/consents/noa@gmail.com|v1')));

console.log('Vendor cannot touch subscription fields');
await no('noa cannot extend own support', updateDoc(doc(noa, 'tenants/noa'), { supportUntil: '2099-01-01' }));
await ok('owner sets support', updateDoc(doc(owner, 'tenants/noa'), { supportUntil: '2027-01-01', plan: 'launch' }));

console.log('Platform quotes (owner → prospective vendor)');
await ok('owner creates platform quote', setDoc(doc(owner, 'platformQuotes/p1'), { vendorName: 'V', total: 1499, status: 'pending' }));
await no('vendor cannot read platform quotes', getDoc(doc(noa, 'platformQuotes/p1')));
await no('vendor cannot create platform quote', setDoc(doc(noa, 'platformQuotes/p2'), { status: 'pending' }));
await no('anon cannot read platform quote', getDoc(doc(anon, 'platformQuotes/p1')));
await no('anon cannot change total', updateDoc(doc(anon, 'platformQuotes/p1'), { total: 1 }));
await ok('anon signs platform quote', updateDoc(doc(anon, 'platformQuotes/p1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'YQ', signerName: 'דוד' }));
await ok('anon attaches pdf', updateDoc(doc(anon, 'platformQuotes/p1'), { pdfData: 'x' }));
await no('anon cannot replace pdf', updateDoc(doc(anon, 'platformQuotes/p1'), { pdfData: 'y' }));
await no('stranger cannot list platform quotes', getDocs(collection(stranger, 'platformQuotes')));
await ok('owner lists platform quotes', getDocs(collection(owner, 'platformQuotes')));
await ok('owner deletes platform quote', deleteDoc(doc(owner, 'platformQuotes/p1')));

console.log('Limited vendor (read-only)');
await ok('owner limits noa', updateDoc(doc(owner, 'tenants/noa'), { limited: true }));
await ok('limited noa still reads own tenant', getDoc(doc(noa, 'tenants/noa')));
await ok('limited noa still lists quotes', getDocs(collection(noa, 'tenants/noa/quotes')));
await no('limited noa cannot create quote', setDoc(doc(noa, 'tenants/noa/quotes/lim1'), { status: 'pending' }));
await no('limited noa cannot lift the limit', updateDoc(doc(noa, 'tenants/noa'), { limited: false }));
await ok('owner can still create quote for limited noa', setDoc(doc(owner, 'tenants/noa/quotes/lim2'), { status: 'pending' }));
await ok('owner lifts limit', updateDoc(doc(owner, 'tenants/noa'), { limited: false }));
// רישיון שנתי: אחרי accessEnds — צפייה בלבד (כמו מוגבל); לכל החיים / בתוקף — יוצר הצעות
await ok('owner sets license that ended yesterday', updateDoc(doc(owner, 'tenants/noa'), { lifetime: false, accessUntil: '2020-01-01', accessEnds: Timestamp.fromMillis(Date.now() - 86400000) }));
await ok('expired noa still reads quotes', getDocs(collection(noa, 'tenants/noa/quotes')));
await no('expired noa cannot create quote', setDoc(doc(noa, 'tenants/noa/quotes/exp1'), { status: 'pending' }));
await no('expired noa cannot extend own license', updateDoc(doc(noa, 'tenants/noa'), { accessEnds: null }));
await ok('owner renews for a year', updateDoc(doc(owner, 'tenants/noa'), { accessEnds: Timestamp.fromMillis(Date.now() + 365 * 86400000) }));
await ok('renewed noa creates quote', setDoc(doc(noa, 'tenants/noa/quotes/exp2'), { status: 'pending' }));
await ok('owner sets lifetime', updateDoc(doc(owner, 'tenants/noa'), { lifetime: true, accessUntil: '', accessEnds: null }));
await ok('lifetime noa creates quote', setDoc(doc(noa, 'tenants/noa/quotes/exp3'), { status: 'pending' }));
// תזכורות חידוש המנוי השנתי (חודש / שבוע לפני)
await ok('owner sets yearly license', updateDoc(doc(owner, 'tenants/noa'), { lifetime: false, accessUntil: '2027-01-01', accessEnds: Timestamp.fromMillis(Date.now() + 30 * 86400000) }));
await ok('vendor records 30-day reminder', setDoc(doc(noa, 'tenants/noa/notices/lic30-2027-01-01'), { type: 'licenseReminder', until: '2027-01-01', stage: 30, sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await no('reminder cannot be sent twice', setDoc(doc(noa, 'tenants/noa/notices/lic30-2027-01-01'), { type: 'licenseReminder', until: '2027-01-01', stage: 30, sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await ok('vendor records 7-day reminder', setDoc(doc(noa, 'tenants/noa/notices/lic7-2027-01-01'), { type: 'licenseReminder', until: '2027-01-01', stage: 7, sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await no('reminder for another date', setDoc(doc(noa, 'tenants/noa/notices/lic30-2028-01-01'), { type: 'licenseReminder', until: '2028-01-01', stage: 30, sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await no('reminder with an unknown stage', setDoc(doc(noa, 'tenants/noa/notices/lic15-2027-01-01'), { type: 'licenseReminder', until: '2027-01-01', stage: 15, sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await no('reminder id must match stage', setDoc(doc(noa, 'tenants/noa/notices/lic7-2027-01-01x'), { type: 'licenseReminder', until: '2027-01-01', stage: 30, sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await ok('owner sets lifetime again', updateDoc(doc(owner, 'tenants/noa'), { lifetime: true, accessUntil: '', accessEnds: null }));
await ok('noa creates quote again', setDoc(doc(noa, 'tenants/noa/quotes/lim3'), { status: 'pending' }));

console.log('Vendor agreement file');
await ok('owner uploads agreement', setDoc(doc(owner, 'tenants/noa/files/agreement'), { pdfData: 'JVBER', source: 'upload' }));
await ok('noa reads own agreement', getDoc(doc(noa, 'tenants/noa/files/agreement')));
await no('noa cannot replace agreement', setDoc(doc(noa, 'tenants/noa/files/agreement'), { pdfData: 'x' }));
await no('noa cannot delete agreement', deleteDoc(doc(noa, 'tenants/noa/files/agreement')));
await no('yossi cannot read noa agreement', getDoc(doc(yossi, 'tenants/noa/files/agreement')));
await no('anon cannot read agreement', getDoc(doc(anon, 'tenants/noa/files/agreement')));
await ok('owner replaces agreement', setDoc(doc(owner, 'tenants/noa/files/agreement'), { pdfData: 'JVBER2', source: 'upload' }));

console.log('Permanent vendor deletion (owner only)');
await no('noa cannot write tombstone', setDoc(doc(noa, 'deletedTenants/yossi'), { name: 'x' }));
await no('noa cannot read tombstones', getDocs(collection(noa, 'deletedTenants')));
await no('noa cannot delete own tenant', deleteDoc(doc(noa, 'tenants/noa')));
await ok('owner deletes noa consents', deleteDoc(doc(owner, 'tenants/noa/consents/noa@gmail.com|v1')));
await ok('owner deletes noa agreement', deleteDoc(doc(owner, 'tenants/noa/files/agreement')));
await ok('owner deletes noa quote', deleteDoc(doc(owner, 'tenants/noa/quotes/lim3')));
await ok('owner deletes noa index', deleteDoc(doc(owner, 'vendorIndex/noa@gmail.com')));
await ok('owner deletes noa tenant', deleteDoc(doc(owner, 'tenants/noa')));
await ok('owner writes tombstone', setDoc(doc(owner, 'deletedTenants/noa'), { name: 'Noa DJ', deletedAt: serverTimestamp() }));
await ok('owner lists tombstones', getDocs(collection(owner, 'deletedTenants')));
await no('deleted noa cannot read tenant', getDoc(doc(noa, 'tenants/noa')));
await no('deleted noa cannot create quote', setDoc(doc(noa, 'tenants/noa/quotes/z'), { status: 'pending' }));
await ok('owner restores (removes tombstone)', deleteDoc(doc(owner, 'deletedTenants/noa')));

console.log('Short links');
await ok('owner re-creates noa (restore)', setDoc(doc(owner, 'tenants/noa'), { admins: ['noa@gmail.com'], active: true }));
const sl = (who, id, d) => setDoc(doc(who, 'shortLinks/' + id), { q: 'abc', kind: 'quote', tenant: 'noa', createdAt: serverTimestamp(), ...d });
await ok('vendor creates own short link', sl(noa, 'k1'));
await no('vendor cannot create link for other vendor', sl(noa, 'k2', { tenant: 'yossi' }));
await no('vendor cannot create offer link', sl(noa, 'k3', { kind: 'offer', tenant: '' }));
await no('stranger cannot create link', sl(stranger, 'k4'));
await no('anon cannot create link', sl(anon, 'k5'));
await no('extra fields denied', sl(noa, 'k6', { pdfData: 'x' }));
await no('cannot overwrite existing link', sl(noa, 'k1', { q: 'evil' }));
await ok('anon opens link by id', getDoc(doc(anon, 'shortLinks/k1')));
await no('anon cannot list links', getDocs(collection(anon, 'shortLinks')));
await no('vendor cannot list links', getDocs(collection(noa, 'shortLinks')));
await ok('owner creates offer link', sl(owner, 'o1', { kind: 'offer', tenant: '' }));
await ok('owner lists links', getDocs(collection(owner, 'shortLinks')));
await no('yossi cannot delete noa link', deleteDoc(doc(yossi, 'shortLinks/k1')));
await ok('noa deletes own link', deleteDoc(doc(noa, 'shortLinks/k1')));
await ok('owner limits noa', updateDoc(doc(owner, 'tenants/noa'), { limited: true }));
await no('limited vendor cannot create link', sl(noa, 'k7'));
await ok('owner deletes offer link', deleteDoc(doc(owner, 'shortLinks/o1')));

// הגדרות ספק מלוח הניהול: כולם קוראים לפי מזהה, רק הבעלים כותב
await ok('owner writes vendor config', setDoc(doc(owner, 'vendorConfigs/newv'), { config: '{"slug":"newv"}', updatedAt: serverTimestamp() }));
await ok('anon reads vendor config', getDoc(doc(anon, 'vendorConfigs/newv')));
await no('anon cannot list vendor configs', getDocs(collection(anon, 'vendorConfigs')));
await no('anon cannot write vendor config', setDoc(doc(anon, 'vendorConfigs/newv'), { config: '{}' }));
await no('vendor cannot write vendor config', setDoc(doc(noa, 'vendorConfigs/newv'), { config: '{}' }));
await no('owner: config must be text', setDoc(doc(owner, 'vendorConfigs/newv'), { config: { a: 1 } }));
await no('owner: no extra fields', setDoc(doc(owner, 'vendorConfigs/newv'), { config: '{}', x: 1 }));
await ok('owner deletes vendor config', deleteDoc(doc(owner, 'vendorConfigs/newv')));

// מבצע ההשקה: public/promo — כולם קוראים, רק הבעלים כותב
await ok('owner writes promo', setDoc(doc(owner, 'public/promo'), { launchLimit: 5, launchSigned: 2, soldOut: false }));
await ok('anon reads promo', getDoc(doc(anon, 'public/promo')));
await no('anon cannot write promo', setDoc(doc(anon, 'public/promo'), { soldOut: false }));
await no('vendor cannot write promo', updateDoc(doc(noa, 'public/promo'), { launchSigned: 0 }));
await no('anon cannot list public', getDocs(collection(anon, 'public')));

// ספק מוגבל / הצעות חתומות / הערות פנימיות
await ok('owner seeds pending + signed quotes', Promise.all([
  setDoc(doc(owner, 'tenants/noa/quotes/m1'), { status: 'pending', price: 100 }),
  setDoc(doc(owner, 'tenants/noa/quotes/m2'), { status: 'pending', price: 100 }).then(() => updateDoc(doc(owner, 'tenants/noa/quotes/m2'), { status: 'signed' })) ]));
await no('limited noa cannot delete quote', deleteDoc(doc(noa, 'tenants/noa/quotes/m1')));
await no('limited noa cannot edit quote', updateDoc(doc(noa, 'tenants/noa/quotes/m1'), { price: 1 }));
await ok('owner lifts limit again', updateDoc(doc(owner, 'tenants/noa'), { limited: false }));
await ok('noa edits pending quote (shortId)', updateDoc(doc(noa, 'tenants/noa/quotes/m1'), { shortId: 'abc' }));
await no('noa cannot change price of signed quote', updateDoc(doc(noa, 'tenants/noa/quotes/m2'), { price: 1 }));
await no('noa cannot un-sign a quote', updateDoc(doc(noa, 'tenants/noa/quotes/m2'), { status: 'pending' }));
await ok('noa replaces pdf of signed quote', updateDoc(doc(noa, 'tenants/noa/quotes/m2'), { pdfData: 'JVBE' }));
await ok('noa deletes own quote', deleteDoc(doc(noa, 'tenants/noa/quotes/m1')));
await ok('owner writes private notes', setDoc(doc(owner, 'tenants/noa/private/meta'), { notes: 'internal' }));
await no('vendor cannot read private notes', getDoc(doc(noa, 'tenants/noa/private/meta')));
await no('vendor cannot write private notes', setDoc(doc(noa, 'tenants/noa/private/meta'), { notes: 'x' }));
await no('anon cannot read private notes', getDoc(doc(anon, 'tenants/noa/private/meta')));

// תזכורת סוף תמיכה: פעם אחת לכל תאריך סיום
await ok('owner sets noa support date', updateDoc(doc(owner, 'tenants/noa'), { supportUntil: '2026-10-12' }));
await ok('vendor records reminder for current date', setDoc(doc(noa, 'tenants/noa/notices/support-2026-10-12'), { type: 'supportReminder', until: '2026-10-12', sentAt: serverTimestamp(), by: 'noa@gmail.com' }));
await no('vendor cannot record it twice', setDoc(doc(noa, 'tenants/noa/notices/support-2026-10-12'), { type: 'supportReminder', until: '2026-10-12', sentAt: serverTimestamp(), by: 'x' }));
await no('vendor cannot record a different date', setDoc(doc(noa, 'tenants/noa/notices/support-2027-01-01'), { type: 'supportReminder', until: '2027-01-01', sentAt: serverTimestamp(), by: 'x' }));
await no('vendor cannot write other fields', setDoc(doc(noa, 'tenants/noa/notices/x'), { type: 'other' }));
await no('vendor cannot delete reminder', deleteDoc(doc(noa, 'tenants/noa/notices/support-2026-10-12')));
await ok('vendor reads reminder', getDoc(doc(noa, 'tenants/noa/notices/support-2026-10-12')));
await no('other vendor cannot read reminder', getDoc(doc(yossi, 'tenants/noa/notices/support-2026-10-12')));
await no('anon cannot read reminder', getDoc(doc(anon, 'tenants/noa/notices/support-2026-10-12')));
await ok('owner deletes reminder', deleteDoc(doc(owner, 'tenants/noa/notices/support-2026-10-12')));

// חבילות הספק
const pk = { label: 'פרימיום', base: 3900, hours: 4, extraHour: 450, items: ['מגנטים'], deleted: false, updatedAt: serverTimestamp() };
await ok('vendor adds a package', setDoc(doc(noa, 'tenants/noa/packages/pabc'), pk));
await ok('vendor edits a package', setDoc(doc(noa, 'tenants/noa/packages/pabc'), { ...pk, base: 4100 }));
await ok('vendor hides a config package', setDoc(doc(noa, 'tenants/noa/packages/booth'), { deleted: true, updatedAt: serverTimestamp() }));
await ok('vendor deletes a package', deleteDoc(doc(noa, 'tenants/noa/packages/booth')));
await ok('vendor reads own packages', getDocs(collection(noa, 'tenants/noa/packages')));
await no('package with negative price rejected', setDoc(doc(noa, 'tenants/noa/packages/pbad'), { ...pk, base: -5 }));
await no('package with extra fields rejected', setDoc(doc(noa, 'tenants/noa/packages/pbad'), { ...pk, active: true }));
await no('package without name rejected', setDoc(doc(noa, 'tenants/noa/packages/pbad'), { ...pk, label: '' }));
await no('other vendor cannot write my packages', setDoc(doc(yossi, 'tenants/noa/packages/px'), pk));
await no('other vendor cannot read my packages', getDocs(collection(yossi, 'tenants/noa/packages')));
await no('anon cannot read packages', getDocs(collection(anon, 'tenants/noa/packages')));
await ok('owner limits noa (packages)', updateDoc(doc(owner, 'tenants/noa'), { limited: true }));
await no('limited vendor cannot change packages', setDoc(doc(noa, 'tenants/noa/packages/pabc'), { ...pk, base: 1 }));
await ok('limited vendor still reads packages', getDocs(collection(noa, 'tenants/noa/packages')));
await ok('owner edits vendor package', setDoc(doc(owner, 'tenants/noa/packages/pabc'), { ...pk, base: 5000 }));
await ok('owner lifts limit (packages)', updateDoc(doc(owner, 'tenants/noa'), { limited: false }));

// חיבור אחד בלבד
const ses = { sid: 'a1', bid: 'b1', at: serverTimestamp(), ua: 'UA' };
await ok('vendor claims own session', setDoc(doc(noa, 'sessions/noa@gmail.com'), ses));
await ok('vendor re-claims (another device)', setDoc(doc(noa, 'sessions/noa@gmail.com'), { ...ses, sid: 'a2', bid: 'b2' }));
await ok('vendor reads own session', getDoc(doc(noa, 'sessions/noa@gmail.com')));
await no('vendor cannot claim another vendor session', setDoc(doc(noa, 'sessions/yossi@gmail.com'), ses));
await no('vendor cannot read another vendor session', getDoc(doc(yossi, 'sessions/noa@gmail.com')));
await no('anon cannot read sessions', getDoc(doc(anon, 'sessions/noa@gmail.com')));
await no('anon cannot write sessions', setDoc(doc(anon, 'sessions/noa@gmail.com'), ses));
await no('session with extra fields rejected', setDoc(doc(noa, 'sessions/noa@gmail.com'), { ...ses, admin: true }));
await no('session with fake time rejected', setDoc(doc(noa, 'sessions/noa@gmail.com'), { ...ses, at: new Date('2020-01-01') }));
await no('vendor cannot list sessions', getDocs(collection(noa, 'sessions')));
await ok('owner reads a vendor session', getDoc(doc(owner, 'sessions/noa@gmail.com')));

// PDF חתום במסמך נפרד
const pdfDoc = { pdfData: 'JVBERi0x', at: serverTimestamp() };
await ok('vendor creates pending quote (pdf)', setDoc(doc(noa, 'tenants/noa/quotes/pq1'), { status: 'pending', price: 100 }));
await no('anon cannot add pdf before signing', setDoc(doc(anon, 'tenants/noa/quotes/pq1/pdf/file'), pdfDoc));
await ok('anon signs (pdf test)', updateDoc(doc(anon, 'tenants/noa/quotes/pq1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA' }));
await ok('anon adds the signed pdf (separate doc)', setDoc(doc(anon, 'tenants/noa/quotes/pq1/pdf/file'), pdfDoc));
await no('anon cannot overwrite the pdf', setDoc(doc(anon, 'tenants/noa/quotes/pq1/pdf/file'), { ...pdfDoc, pdfData: 'X' }));
await no('anon cannot add a pdf with extra fields', setDoc(doc(anon, 'tenants/noa/quotes/pq1/pdf/other'), pdfDoc));
await ok('anon marks hasPdf', updateDoc(doc(anon, 'tenants/noa/quotes/pq1'), { hasPdf: true }));
await no('anon cannot mark hasPdf + change price', updateDoc(doc(anon, 'tenants/noa/quotes/pq1'), { hasPdf: true, price: 1 }));
await no('anon cannot read the pdf', getDoc(doc(anon, 'tenants/noa/quotes/pq1/pdf/file')));
await no('other vendor cannot read the pdf', getDoc(doc(yossi, 'tenants/noa/quotes/pq1/pdf/file')));
await ok('vendor reads the pdf', getDoc(doc(noa, 'tenants/noa/quotes/pq1/pdf/file')));
await no('vendor cannot replace the signed pdf', setDoc(doc(noa, 'tenants/noa/quotes/pq1/pdf/file'), { ...pdfDoc, pdfData: 'JVBERi0y' }));
await no('vendor cannot delete the signed pdf', deleteDoc(doc(noa, 'tenants/noa/quotes/pq1/pdf/file')));
await no('anon cannot add in-doc pdfData once the file exists', updateDoc(doc(anon, 'tenants/noa/quotes/pq1'), { pdfData: 'JVBERi0z' }));
await no('vendor cannot add in-doc pdfData once the file exists', updateDoc(doc(noa, 'tenants/noa/quotes/pq1'), { pdfData: 'JVBERi0z' }));
await ok('owner replaces the pdf', setDoc(doc(owner, 'tenants/noa/quotes/pq1/pdf/file'), { ...pdfDoc, pdfData: 'JVBERi0y' }));
await ok('owner creates platform offer (pdf)', setDoc(doc(owner, 'platformQuotes/pp1'), { status: 'pending', total: 1 }));
await no('anon cannot add offer pdf before signing', setDoc(doc(anon, 'platformQuotes/pp1/pdf/file'), pdfDoc));
await ok('anon signs offer (pdf)', updateDoc(doc(anon, 'platformQuotes/pp1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA' }));
await ok('anon adds offer pdf', setDoc(doc(anon, 'platformQuotes/pp1/pdf/file'), pdfDoc));
await ok('anon marks offer hasPdf', updateDoc(doc(anon, 'platformQuotes/pp1'), { hasPdf: true }));
await no('anon cannot read offer pdf', getDoc(doc(anon, 'platformQuotes/pp1/pdf/file')));
await no('vendor cannot read offer pdf', getDoc(doc(noa, 'platformQuotes/pp1/pdf/file')));
await ok('owner reads offer pdf', getDoc(doc(owner, 'platformQuotes/pp1/pdf/file')));

// מונה כניסות ופעולות (אנונימי, רק +1 לשדה אחד במסמך של היום)
const today = 'stats/d' + Math.floor(Date.now() / 86400000), yday = 'stats/d' + (Math.floor(Date.now() / 86400000) - 1);
await ok('anon counts a visit (creates today)', setDoc(doc(anon, today), { v: increment(1) }, { merge: true }));
await ok('anon counts another visit', setDoc(doc(anon, today), { v: increment(1) }, { merge: true }));
await ok('anon counts a WhatsApp click', setDoc(doc(anon, today), { w: increment(1) }, { merge: true }));
await ok('anon counts a lead form', setDoc(doc(anon, today), { f: increment(1) }, { merge: true }));
await ok('anon counts a demo open', setDoc(doc(anon, today), { d: increment(1) }, { merge: true }));
await ok('anon counts a trial click', setDoc(doc(anon, today), { r: increment(1) }, { merge: true }));
await no('anon cannot add more than 1', setDoc(doc(anon, today), { v: increment(5) }, { merge: true }));
await no('anon cannot set a number', setDoc(doc(anon, today), { v: 1000 }, { merge: true }));
await no('anon cannot bump two fields at once', setDoc(doc(anon, today), { v: increment(1), l: increment(1) }, { merge: true }));
await no('anon cannot add other fields', setDoc(doc(anon, today), { x: increment(1) }, { merge: true }));
await no('anon cannot write another day', setDoc(doc(anon, yday), { v: increment(1) }, { merge: true }));
await no('anon cannot read stats', getDoc(doc(anon, today)));
await no('vendor cannot read stats', getDoc(doc(noa, today)));
await no('anon cannot delete stats', deleteDoc(doc(anon, today)));
await ok('owner reads stats', getDoc(doc(owner, today)));
await ok('owner lists stats', getDocs(collection(owner, 'stats')));

// תקופת ניסיון: ספק חדש פותח לעצמו חשבון (4 מסמכים באותה פעולה), פעם אחת לכל Gmail; אחרי 3 ימים — צפייה בלבד
const dana = as('dana@gmail.com'), rina = as('rina@gmail.com'), Dana = as('Dana.X@gmail.com');
const trialTenant = (e, slug, extra = {}) => ({ slug, name: 'דנה צילום', admins: [e], active: true, managed: 'trial', trial: true, plan: 'trial', phone: '050-1111111', contactName: 'דנה', businessType: 'צלם', createdAt: serverTimestamp(), ...extra });
function trialBatch(db, e, slug, o = {}){
    const b = writeBatch(db);
    if (!o.skipTrial) b.set(doc(db, 'trials/' + (o.trialId || e)), { tenant: o.trialTenant || slug, createdAt: serverTimestamp(), ...(o.trialExtra || {}) });
    if (!o.skipTenant) b.set(doc(db, 'tenants/' + slug), trialTenant(e, slug, o.tenant));
    if (!o.skipIndex) b.set(doc(db, 'vendorIndex/' + (o.indexId || e)), { tenant: o.indexTenant || slug });
    if (!o.skipCfg) b.set(doc(db, 'vendorConfigs/' + slug), { config: o.cfg || '{"business":{"name":"דנה"}}', updatedAt: serverTimestamp() });
    return b.commit();
}
await no('trial: tenant alone is not enough', setDoc(doc(dana, 'tenants/vdanaaaa'), trialTenant('dana@gmail.com', 'vdanaaaa')));
await no('trial: without trials record', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { skipTrial: true }));
await no('trial: without vendorIndex', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { skipIndex: true }));
await no('trial: cannot set someone else as admin', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { tenant: { admins: ['rina@gmail.com'] } }));
await no('trial: cannot set a license', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { tenant: { lifetime: true } }));
await no('trial: cannot extend own trial', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { tenant: { trialEnds: Timestamp.fromMillis(Date.now() + 365 * 864e5) } }));
await no('trial: must be a trial', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { tenant: { trial: false } }));
await no('trial: must be plan trial', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { tenant: { plan: 'launch' } }));
await no('trial: cannot backdate createdAt', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { tenant: { createdAt: Timestamp.fromMillis(Date.now() + 864e5 * 30) } }));
await no('trial: cannot claim another email', trialBatch(dana, 'rina@gmail.com', 'vdanaaaa', {}));
await no('trial: index must point to the new tenant', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { indexTenant: 'noa' }));
await no('trial: huge config refused', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', { cfg: 'x'.repeat(120000) }));
await no('trial: uppercase email refused', trialBatch(Dana, 'Dana.X@gmail.com', 'vdxxxxxx', {}));
await no('trial: cannot take an existing tenant', trialBatch(dana, 'dana@gmail.com', 'noa', {}));
await ok('owner indexes noa', setDoc(doc(owner, 'vendorIndex/noa@gmail.com'), { tenant: 'noa' }));
await no('trial: existing vendor cannot open a trial', trialBatch(noa, 'noa@gmail.com', 'vnoaaaaa', {}));
await ok('trial: new vendor opens a trial', trialBatch(dana, 'dana@gmail.com', 'vdanaaaa', {}));
await ok('trial: vendor reads own trial record', getDoc(doc(dana, 'trials/dana@gmail.com')));
await no('trial: cannot read others trial record', getDoc(doc(rina, 'trials/dana@gmail.com')));
await no('trial: cannot list trials', getDocs(collection(dana, 'trials')));
await no('trial: cannot delete own trial record', deleteDoc(doc(dana, 'trials/dana@gmail.com')));
await no('trial: cannot open a second trial (same Gmail)', trialBatch(dana, 'dana@gmail.com', 'vdanabbb', {}));
await no('trial: vendor cannot edit own tenant', updateDoc(doc(dana, 'tenants/vdanaaaa'), { trial: false }));
await no('trial: vendor cannot edit config', setDoc(doc(dana, 'vendorConfigs/vdanaaaa'), { config: '{}', updatedAt: serverTimestamp() }));
await ok('trial: vendor reads own tenant', getDoc(doc(dana, 'tenants/vdanaaaa')));
await ok('trial: vendor creates a quote', setDoc(doc(dana, 'tenants/vdanaaaa/quotes/q1'), { status: 'pending', price: 100 }));
await ok('trial: vendor edits own packages', setDoc(doc(dana, 'tenants/vdanaaaa/packages/p1'), pk));
await ok('trial: vendor creates a short link', setDoc(doc(dana, 'shortLinks/trl1'), { q: 'abc', kind: 'quote', tenant: 'vdanaaaa', createdAt: serverTimestamp() }));
// אחרי 3 ימים (מדמים: הבעלים מקדים את createdAt)
await ok('owner backdates trial (simulate 3 days later)', updateDoc(doc(owner, 'tenants/vdanaaaa'), { createdAt: Timestamp.fromMillis(Date.now() - 3 * 864e5 - 60000) }));
await no('trial ended: no new quotes', setDoc(doc(dana, 'tenants/vdanaaaa/quotes/q2'), { status: 'pending', price: 100 }));
await no('trial ended: no package edits', setDoc(doc(dana, 'tenants/vdanaaaa/packages/p2'), pk));
await no('trial ended: no short links', setDoc(doc(dana, 'shortLinks/trl2'), { q: 'abc', kind: 'quote', tenant: 'vdanaaaa', createdAt: serverTimestamp() }));
await ok('trial ended: vendor still reads quotes', getDocs(collection(dana, 'tenants/vdanaaaa/quotes')));
await ok('trial ended: customer can still sign', updateDoc(doc(anon, 'tenants/vdanaaaa/quotes/q1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA' }));
await ok('owner extends the trial', updateDoc(doc(owner, 'tenants/vdanaaaa'), { trialEnds: Timestamp.fromMillis(Date.now() + 2 * 864e5) }));
await ok('trial extended: quotes again', setDoc(doc(dana, 'tenants/vdanaaaa/quotes/q3'), { status: 'pending', price: 100 }));
await ok('owner converts to yearly', updateDoc(doc(owner, 'tenants/vdanaaaa'), { trial: false, plan: 'regular', trialEnds: Timestamp.fromMillis(Date.now() - 1000), accessEnds: Timestamp.fromMillis(Date.now() + 365 * 864e5), accessUntil: '2027-10-12', lifetime: false }));
await ok('converted: quotes work after trial', setDoc(doc(dana, 'tenants/vdanaaaa/quotes/q4'), { status: 'pending', price: 100 }));
await ok('owner lists trials', getDocs(collection(owner, 'trials')));
await ok('owner deletes a trial record (allow another try)', deleteDoc(doc(owner, 'trials/dana@gmail.com')));
await no('deleted tenant slug cannot be reused by trial', (async () => { await setDoc(doc(owner, 'deletedTenants/vgoneaaa'), { name: 'x' }); return trialBatch(rina, 'rina@gmail.com', 'vgoneaaa', {}); })());
await ok('another new vendor opens a trial', trialBatch(rina, 'rina@gmail.com', 'vrinaaaa', {}));

// ---- בדיקת אבטחה: אי אפשר לשבש הסכם ----
const vq = { clientName: 'לקוח', price: 5000, deposit: 1000, status: 'pending', createdAt: serverTimestamp(), createdBy: 'noa@gmail.com' };
await ok('vendor creates a normal quote', setDoc(doc(noa, 'tenants/noa/quotes/sec1'), vq));
await no('vendor cannot create a quote with odd id', setDoc(doc(noa, 'tenants/noa/quotes/x"><img src=x>'), vq));
await no('vendor cannot create a signed quote', setDoc(doc(noa, 'tenants/noa/quotes/sec2'), { ...vq, status: 'signed' }));
await no('vendor cannot create a quote with signature fields', setDoc(doc(noa, 'tenants/noa/quotes/sec3'), { ...vq, signedAt: serverTimestamp() }));
await no('vendor cannot create a quote with unknown fields', setDoc(doc(noa, 'tenants/noa/quotes/sec4'), { ...vq, junk: 'x' }));
await no('vendor cannot create a huge quote', setDoc(doc(noa, 'tenants/noa/quotes/sec5'), { ...vq, notes: 'x'.repeat(5000) }));
await no('vendor cannot embed a pdf in a new quote', setDoc(doc(noa, 'tenants/noa/quotes/sec6'), { ...vq, pdfData: 'JVBER' }));
await no('nobody can sign with a backdated time', updateDoc(doc(noa, 'tenants/noa/quotes/sec1'), { status: 'signed', signedAt: Timestamp.fromMillis(Date.now() - 864e5 * 30), ip: null }));
await no('vendor cannot write signature details as a vendor', updateDoc(doc(noa, 'tenants/noa/quotes/sec1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, signerName: 'x', price: 1 }));
await no('vendor cannot change price of a sent quote', updateDoc(doc(noa, 'tenants/noa/quotes/sec1'), { price: 1 }));
await ok('owner/vendor short link for sec1', setDoc(doc(noa, 'shortLinks/seclink001'), { q: 'ORIGINAL', kind: 'quote', tenant: 'noa', createdAt: serverTimestamp() }));
await ok('vendor saves the short link id', updateDoc(doc(noa, 'tenants/noa/quotes/sec1'), { shortId: 'seclink001' }));
await no('short link createdAt must be now', setDoc(doc(noa, 'shortLinks/seclink002'), { q: 'X', kind: 'quote', tenant: 'noa', createdAt: Timestamp.fromMillis(1) }));
await no('customer cannot sign altered details (signedQ ≠ link)', updateDoc(doc(anon, 'tenants/noa/quotes/sec1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'CHANGED' }));
await no('customer cannot sign without signedQ when there is a short link', updateDoc(doc(anon, 'tenants/noa/quotes/sec1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA' }));
await ok('customer signs exactly what was sent', updateDoc(doc(anon, 'tenants/noa/quotes/sec1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'ORIGINAL' }));
await no('nobody can sign twice', updateDoc(doc(anon, 'tenants/noa/quotes/sec1'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'ORIGINAL' }));
await no('anon cannot mark hasPdf without a file', updateDoc(doc(anon, 'tenants/noa/quotes/sec1'), { hasPdf: true }));
await ok('owner moves signedAt back 1 hour (simulate later)', updateDoc(doc(owner, 'tenants/noa/quotes/sec1'), { signedAt: Timestamp.fromMillis(Date.now() - 3600e3) }));
await no('anon cannot add a pdf an hour after signing', setDoc(doc(anon, 'tenants/noa/quotes/sec1/pdf/file'), pdfDoc));
await no('anon cannot add in-doc pdf an hour after signing', updateDoc(doc(anon, 'tenants/noa/quotes/sec1'), { pdfData: 'JVBERi0x' }));
await ok('vendor can attach a missing pdf once', setDoc(doc(noa, 'tenants/noa/quotes/sec1/pdf/file'), pdfDoc));
await ok('vendor marks it', updateDoc(doc(noa, 'tenants/noa/quotes/sec1'), { hasPdf: true }));
await no('vendor cannot replace it afterwards', setDoc(doc(noa, 'tenants/noa/quotes/sec1/pdf/file'), { ...pdfDoc, pdfData: 'JVBERi0z' }));
await no('vendor cannot delete a signed quote', deleteDoc(doc(noa, 'tenants/noa/quotes/sec1')));
await no('consent cannot be backdated', setDoc(doc(noa, 'tenants/noa/consents/noa@gmail.com|v9'), { email: 'noa@gmail.com', version: 'v9', acceptedAt: Timestamp.fromMillis(1), userAgent: 'UA' }));
await no('package delete marker cannot carry big data', setDoc(doc(noa, 'tenants/noa/packages/big'), { deleted: true, desc: 'x'.repeat(400), updatedAt: serverTimestamp() }));
await ok('package delete marker', setDoc(doc(noa, 'tenants/noa/packages/big'), { deleted: true, updatedAt: serverTimestamp() }));
// הצעה לספק עם קישור קצר: החתימה רק על מה שנשלח
await ok('owner offer with short link', setDoc(doc(owner, 'platformQuotes/secoff'), { status: 'pending', total: 400, shortId: 'secoffl001' }));
await ok('owner short link for offer', setDoc(doc(owner, 'shortLinks/secoffl001'), { q: 'OFFER', kind: 'offer', tenant: '', createdAt: serverTimestamp() }));
await no('vendor-to-be cannot sign altered offer', updateDoc(doc(anon, 'platformQuotes/secoff'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'OFFER-1' }));
await ok('vendor-to-be signs the offer as sent', updateDoc(doc(anon, 'platformQuotes/secoff'), { status: 'signed', signedAt: serverTimestamp(), ip: null, userAgent: 'UA', signedQ: 'OFFER', signerName: 'X' }));
// תקופת ניסיון: שם משתמש רק בפורמט אקראי, ואי אפשר לתפוס חשבון קיים
const eve = as('eve@gmail.com');
await no('trial cannot pick a chosen name like "check"', trialBatch(eve, 'eve@gmail.com', 'check', {}));
await no('trial cannot point trials/index at someone else\'s trial', (async () => { const b = writeBatch(eve); b.set(doc(eve, 'trials/eve@gmail.com'), { tenant: 'vrinaaaa', createdAt: serverTimestamp() }); b.set(doc(eve, 'vendorIndex/eve@gmail.com'), { tenant: 'vrinaaaa' }); return b.commit(); })());

// הרשמה למנוי שנתי: נכנסים לחשבון, אבל שולחים הצעות רק אחרי אישור הבעלים
const yael = as('yael@gmail.com');
const annualTenant = { slug: 'vyaelaaa', name: 'יעל', admins: ['yael@gmail.com'], active: true, managed: 'signup', trial: false, plan: 'regular', pending: true, phone: '050', contactName: 'יעל', businessType: 'DJ', pricingInfo: 'לפי שעות', createdAt: serverTimestamp() };
const annualBatch = (t, trialPlan) => { const b = writeBatch(yael); b.set(doc(yael, 'trials/yael@gmail.com'), { tenant: 'vyaelaaa', plan: trialPlan || 'regular', createdAt: serverTimestamp() }); b.set(doc(yael, 'tenants/vyaelaaa'), t); b.set(doc(yael, 'vendorIndex/yael@gmail.com'), { tenant: 'vyaelaaa' }); b.set(doc(yael, 'vendorConfigs/vyaelaaa'), { config: '{}', updatedAt: serverTimestamp() }); return b.commit(); };
await no('annual signup cannot skip approval', annualBatch({ ...annualTenant, pending: false }));
await no('annual signup cannot claim a license', annualBatch({ ...annualTenant, lifetime: true }));
await no('annual signup must match the signup record', annualBatch(annualTenant, 'trial'));
await no('annual signup: pricing note size limit', annualBatch({ ...annualTenant, pricingInfo: 'x'.repeat(2000) }));
await ok('annual signup (pending approval)', annualBatch(annualTenant));
await ok('pending vendor reads own account', getDoc(doc(yael, 'tenants/vyaelaaa')));
await no('pending vendor cannot send quotes', setDoc(doc(yael, 'tenants/vyaelaaa/quotes/a1'), { status: 'pending', price: 1 }));
await no('pending vendor cannot approve itself', updateDoc(doc(yael, 'tenants/vyaelaaa'), { pending: false }));
await ok('pending vendor can prepare packages? no — blocked too', assertFails(setDoc(doc(yael, 'tenants/vyaelaaa/packages/p1'), pk)));
await ok('owner approves the subscription', updateDoc(doc(owner, 'tenants/vyaelaaa'), { pending: false, accessEnds: Timestamp.fromMillis(Date.now() + 365 * 864e5), accessUntil: '2027-10-12', lifetime: false }));
await ok('approved vendor sends quotes', setDoc(doc(yael, 'tenants/vyaelaaa/quotes/a2'), { status: 'pending', price: 1 }));

// ספק שנמחק (הבעלים מחק את החשבון) — אותו Gmail נרשם מחדש כמו לקוח חדש, גם אם רישום ההרשמה הישן נשאר
const sam = as('sam@gmail.com');
await ok('sam opens a trial', trialBatch(sam, 'sam@gmail.com', 'vsamaaaa', {}));
await no('sam cannot sign up again while the account exists', trialBatch(sam, 'sam@gmail.com', 'vsambbbb', {}));
await ok('owner deletes sam account (tenant + index, trials record stays)', (async () => { await deleteDoc(doc(owner, 'vendorIndex/sam@gmail.com')); await deleteDoc(doc(owner, 'vendorConfigs/vsamaaaa')); await deleteDoc(doc(owner, 'tenants/vsamaaaa')); })());
await ok('deleted vendor signs up again as a new customer', trialBatch(sam, 'sam@gmail.com', 'vsamcccc', {}));
await no('someone else cannot take over sam signup record', setDoc(doc(rina, 'trials/sam@gmail.com'), { tenant: 'vxxxxxxx', plan: 'trial', createdAt: serverTimestamp() }));

// הכנסות והוצאות: הספק מזין הוצאות רק בחשבון שלו; העדפות (ההסבר החד-פעמי) — כל מייל רק את שלו
const ex = { date: '2026-10-12', amount: 250, label: 'דלק', category: 'נסיעות ודלק', createdAt: serverTimestamp() };
await ok('vendor adds an expense', setDoc(doc(noa, 'tenants/noa/expenses/e1'), ex));
await ok('vendor lists own expenses', getDocs(collection(noa, 'tenants/noa/expenses')));
await no('other vendor cannot read expenses', getDocs(collection(yossi, 'tenants/noa/expenses')));
await no('other vendor cannot add expense', setDoc(doc(yossi, 'tenants/noa/expenses/e2'), ex));
await no('anon cannot read expenses', getDocs(collection(anon, 'tenants/noa/expenses')));
await no('expense with zero amount rejected', setDoc(doc(noa, 'tenants/noa/expenses/e3'), { ...ex, amount: 0 }));
await no('expense with bad date rejected', setDoc(doc(noa, 'tenants/noa/expenses/e3'), { ...ex, date: '12/10/2026' }));
await no('expense with extra field rejected', setDoc(doc(noa, 'tenants/noa/expenses/e3'), { ...ex, x: 1 }));
await no('expense with long label rejected', setDoc(doc(noa, 'tenants/noa/expenses/e3'), { ...ex, label: 'x'.repeat(121) }));
await no('expense with backdated createdAt rejected', setDoc(doc(noa, 'tenants/noa/expenses/e3'), { ...ex, createdAt: new Date('2020-01-01') }));
await ok('vendor deletes own expense', deleteDoc(doc(noa, 'tenants/noa/expenses/e1')));
await ok('owner reads vendor expenses', getDocs(collection(owner, 'tenants/noa/expenses')));
await ok('vendor imports an income', setDoc(doc(noa, 'tenants/noa/incomes/i1'), { ...ex, label: 'אירוע', category: 'ייבוא' }));
await ok('vendor lists own incomes', getDocs(collection(noa, 'tenants/noa/incomes')));
await no('other vendor cannot read incomes', getDocs(collection(yossi, 'tenants/noa/incomes')));
await no('other vendor cannot add income', setDoc(doc(yossi, 'tenants/noa/incomes/i2'), ex));
await no('income with negative amount rejected', setDoc(doc(noa, 'tenants/noa/incomes/i3'), { ...ex, amount: -5 }));
await no('income with extra field rejected', setDoc(doc(noa, 'tenants/noa/incomes/i3'), { ...ex, quoteId: 'x' }));
await ok('vendor deletes own income', deleteDoc(doc(noa, 'tenants/noa/incomes/i1')));
await ok('vendor marks welcome seen', setDoc(doc(noa, 'tenants/noa/prefs/noa@gmail.com'), { welcomeSeen: true, updatedAt: serverTimestamp() }));
await ok('vendor reads own prefs', getDoc(doc(noa, 'tenants/noa/prefs/noa@gmail.com')));
await no('vendor cannot write prefs of another email', setDoc(doc(noa, 'tenants/noa/prefs/x@gmail.com'), { welcomeSeen: true, updatedAt: serverTimestamp() }));
await no('prefs with extra field rejected', setDoc(doc(noa, 'tenants/noa/prefs/noa@gmail.com'), { welcomeSeen: true, updatedAt: serverTimestamp(), admin: true }));
await no('other vendor cannot read prefs', getDoc(doc(yossi, 'tenants/noa/prefs/noa@gmail.com')));
await no('vendor cannot list prefs', getDocs(collection(noa, 'tenants/noa/prefs')));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
