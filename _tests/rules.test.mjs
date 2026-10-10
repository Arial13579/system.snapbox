import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, increment } from 'firebase/firestore';
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
await ok('noa deletes after reactivation', updateDoc(doc(owner, 'tenants/noa'), { active: true }).then(() => deleteDoc(doc(noa, 'tenants/noa/quotes/q1'))));

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
await ok('vendor replaces the pdf', setDoc(doc(noa, 'tenants/noa/quotes/pq1/pdf/file'), { ...pdfDoc, pdfData: 'JVBERi0y' }));
await ok('vendor moves old in-doc pdf (hasPdf + remove pdfData)', updateDoc(doc(noa, 'tenants/noa/quotes/pq1'), { hasPdf: true }));
await ok('vendor deletes the pdf', deleteDoc(doc(noa, 'tenants/noa/quotes/pq1/pdf/file')));
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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
