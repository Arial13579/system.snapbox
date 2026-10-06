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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
