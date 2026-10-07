import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
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
await ok('anon signs', updateDoc(doc(anon, 'tenants/noa/quotes/q1'), { status: 'signed', signedAt: serverTimestamp(), ip: '1.2.3.4', userAgent: 'UA' }));
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
await ok('anon signs platform quote', updateDoc(doc(anon, 'platformQuotes/p1'), { status: 'signed', signedAt: serverTimestamp(), ip: '1.1.1.1', userAgent: 'UA' }));
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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
