/* לוח ניהול לבעלים בלבד: ספקים (סנכרון, פרטים, תמיכה, השהיה), הצעת מחיר לספק, והצעות שנשלחו. */
(async () => {
    const $ = id => document.getElementById(id), esc = Core.esc, PF = Core.PF, SALES = PF.sales;
    let fb;
    $('signout').addEventListener('click', () => Core.signOut());
    try { fb = await Core.fb(); } catch(e) { $('loading').textContent = 'טעינת המערכת נכשלה. רעננו את הדף.'; return; }
    const { fs, db } = fb;

    let started = false;
    Core.onAuth(async user => {
        if (!user) { location.replace('./'); return; }
        if (started) return; started = true;
        $('user-email').textContent = user.email;
        if (!Core.isOwner(user)) { $('loading').classList.add('hidden'); $('blocked').classList.remove('hidden'); return; }
        $('loading').classList.add('hidden'); $('main-app').classList.remove('hidden');
        initTabs(); initOfferForm(); initEdit();
        await sync();
        await renderVendors();
    });

    /* ================= טאבים ================= */
    let offersStarted = false;
    function showTab(t){
        document.querySelectorAll('.admin-tabs button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        ['vendors', 'offer', 'offers'].forEach(k => $('tab-' + k).classList.toggle('hidden', k !== t));
        history.replaceState(null, '', location.pathname + (t === 'vendors' ? '' : '#' + t));
        if (t === 'offers' && !offersStarted) { offersStarted = true; startOffers(); }
    }
    function initTabs(){
        document.querySelectorAll('.admin-tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
        const h = location.hash.slice(1); if (h === 'offer' || h === 'offers') showTab(h);
    }

    /* ================= ספקים ================= */
    // registry.js ← Firebase: כרטיס לכל ספק + אינדקס מיילים (ומחיקת מיילים שהוסרו). לא נוגע בפרטי מנוי/תמיכה.
    async function sync(){
        const st = $('sync-status'); st.textContent = 'מסנכרן…';
        try {
            const wanted = {};
            for (const r of (window.REGISTRY || [])) {
                const slug = String(r.slug || '').toLowerCase();
                if (!/^[a-z0-9-]{2,40}$/.test(slug)) continue;
                const admins = (r.admins || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
                const ref = fs.doc(db, 'tenants', slug), snap = await fs.getDoc(ref);
                if (snap.exists()) await fs.updateDoc(ref, { name: r.name || slug, admins });
                else await fs.setDoc(ref, { slug, name: r.name || slug, admins, active: true, createdAt: fs.serverTimestamp() });
                admins.forEach(e => { wanted[e] = slug; });
            }
            const idx = await fs.getDocs(fs.collection(db, 'vendorIndex'));
            for (const d of idx.docs) if (wanted[d.id] !== d.data().tenant) await fs.deleteDoc(d.ref);
            for (const [email, slug] of Object.entries(wanted)) await fs.setDoc(fs.doc(db, 'vendorIndex', email), { tenant: slug });
            st.textContent = 'מסונכרן ✓';
        } catch(e) { console.error(e); st.textContent = 'הסנכרון נכשל: ' + (e.code || e.message); }
    }

    let VENDORS = [];
    const planLabel = k => (SALES.plans[k] || {}).label || (k ? k : '—');
    async function loadVendor(d){
        const t = { id: d.id, ...d.data() }, col = fs.collection(db, 'tenants', d.id, 'quotes');
        try {
            const [all, signed, last, cons] = await Promise.all([
                fs.getCountFromServer(col),
                fs.getCountFromServer(fs.query(col, fs.where('status', '==', 'signed'))),
                fs.getDocs(fs.query(col, fs.orderBy('createdAt', 'desc'), fs.limit(1))),
                fs.getDocs(fs.collection(db, 'tenants', d.id, 'consents'))
            ]);
            t.total = all.data().count; t.signed = signed.data().count;
            const l = last.docs[0]; t.lastAt = l && l.data().createdAt && l.data().createdAt.toDate ? l.data().createdAt.toDate() : null;
            const cur = cons.docs.map(c => c.data()).filter(c => c.version === PF.termsVersion);
            t.consent = cur.length ? cur[0] : null;
            t.oldConsent = !cur.length && cons.size > 0;
        } catch(e) { console.warn(e); t.total = t.signed = '—'; }
        t.support = Core.supportStatus(t);
        t.inRegistry = (window.REGISTRY || []).some(r => r.slug === d.id);
        return t;
    }
    async function renderVendors(){
        const snap = await fs.getDocs(fs.collection(db, 'tenants'));
        VENDORS = (await Promise.all(snap.docs.map(loadVendor))).sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
        const n = k => VENDORS.filter(k).length, sum = k => VENDORS.reduce((s, v) => s + (Number(v[k]) || 0), 0);
        const kpi = (v, l, s, hl) => `<div class="card kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><div class="n">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        $('kpis').innerHTML =
            kpi(VENDORS.length, 'ספקים', `${n(v => v.active)} פעילים · ${n(v => !v.active)} מושהים`) +
            kpi(n(v => v.support.state === 'active' || v.support.state === 'expiring'), 'תמיכה פעילה') +
            kpi(n(v => v.support.state === 'expiring'), 'תמיכה מסתיימת', 'בתוך 30 יום') +
            kpi(n(v => v.support.state === 'expired'), 'תמיכה שהסתיימה') +
            kpi(sum('total'), 'הצעות של ספקים', `${sum('signed')} נחתמו`) +
            kpi(Core.money(sum('pricePaid')), 'סכום מכירות', 'לפי "סכום ששולם"', true);
        if (!VENDORS.length) { $('tbody').innerHTML = '<tr><td colspan="8" class="loading">אין עדיין ספקים</td></tr>'; return; }
        $('tbody').innerHTML = VENDORS.map(t => {
            const s = t.support;
            const sup = s.state === 'none' ? '<span class="badge mute">לא הוגדרה</span>'
                : s.state === 'expired' ? `<span class="badge bad">הסתיימה</span><div class="sub">${Core.fmtDate(s.until)}</div>`
                : `<span class="badge ${s.state === 'expiring' ? 'warn' : 'ok'}">נותרו ${esc(s.left)}</span><div class="sub">עד ${Core.fmtDate(s.until)}</div>`;
            const cons = t.consent ? `<span class="badge ok">אושרו</span><div class="sub">${t.consent.acceptedAt && t.consent.acceptedAt.toDate ? t.consent.acceptedAt.toDate().toLocaleDateString('he-IL') : ''}</div>`
                : `<span class="badge ${t.oldConsent ? 'warn' : 'mute'}">${t.oldConsent ? 'גרסה קודמת' : 'עדיין לא'}</span>`;
            return `<tr>
                <td class="vend-cell"><b>${esc(t.name)}</b><span>${[esc(t.contactName || ''), t.phone ? '<span class="ltr">' + esc(t.phone) + '</span>' : ''].filter(Boolean).join(' · ')}</span><span>${(t.admins || []).map(esc).join(', ') || 'רק אתה'}</span>${t.inRegistry ? '' : '<span>⚠ לא ברשימת הספקים</span>'}</td>
                <td>${esc(planLabel(t.plan))}<div class="sub">${[t.purchaseDate ? Core.fmtDate(t.purchaseDate) : '', t.pricePaid ? Core.money(t.pricePaid) : ''].filter(Boolean).join(' · ')}</div></td>
                <td>${sup}</td>
                <td class="num">${t.total}<div class="sub">${t.signed} נחתמו</div></td>
                <td>${t.lastAt ? t.lastAt.toLocaleDateString('he-IL') : '<span class="sub">—</span>'}</td>
                <td>${cons}</td>
                <td>${t.active ? '<span class="badge ok">פעיל</span>' : '<span class="badge bad">מושהה</span>'}</td>
                <td><div class="acts">
                    <a class="btn sm primary" href="app.html?t=${encodeURIComponent(t.id)}">כניסה לחשבון</a>
                    <button type="button" class="btn sm edit" data-id="${esc(t.id)}">עריכה ותמיכה</button>
                    <button type="button" class="btn sm ${t.active ? 'danger' : ''} toggle" data-id="${esc(t.id)}" data-active="${t.active ? 1 : 0}">${t.active ? 'השהיה' : 'הפעלה'}</button>
                </div></td></tr>`;
        }).join('');
    }
    $('tbody').addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('edit')) return openEdit(b.dataset.id);
        if (!b.classList.contains('toggle')) return;
        const on = b.dataset.active === '1';
        if (on && !confirm('להשהות את הספק? הוא לא יוכל להיכנס לחשבון עד שתפעיל אותו מחדש.')) return;
        b.disabled = true;
        try { await fs.updateDoc(fs.doc(db, 'tenants', b.dataset.id), { active: !on }); await renderVendors(); }
        catch(err) { alert('הפעולה נכשלה: ' + (err.code || err.message)); b.disabled = false; }
    });

    /* ---- עריכת פרטי ספק ותמיכה ---- */
    let editing = null;
    function initEdit(){
        $('e_plan').innerHTML = '<option value="">—</option>' + Object.entries(SALES.plans).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
        $('edit-close').addEventListener('click', () => $('edit-dlg').close());
        $('e_quick').addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            const m = +b.dataset.m;
            if (!m) { $('e_until').value = ''; return; }
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const cur = Core.parseISO($('e_until').value);
            const from = cur && cur >= today ? cur : today;
            $('e_until').value = Core.toISO(Core.addMonths(from, m));
            $('e_status').textContent = `התמיכה תהיה בתוקף עד ${Core.fmtDate($('e_until').value)} (לא נשמר עדיין)`;
        });
        $('edit-form').addEventListener('submit', async e => {
            e.preventDefault();
            if (!editing) return;
            const btn = $('e_save'); btn.disabled = true; btn.textContent = 'שומר…';
            const data = { contactName: $('e_contact').value.trim(), phone: $('e_phone').value.trim(), plan: $('e_plan').value,
                pricePaid: Number($('e_paid').value) || 0, purchaseDate: $('e_purchase').value || '', supportUntil: $('e_until').value || '',
                notes: $('e_notes').value.trim(), updatedAt: fs.serverTimestamp() };
            try { await fs.updateDoc(fs.doc(db, 'tenants', editing), data); $('edit-dlg').close(); await renderVendors(); }
            catch(err) { $('e_status').textContent = 'השמירה נכשלה: ' + (err.code || err.message); }
            btn.disabled = false; btn.textContent = 'שמירה';
        });
    }
    function openEdit(id){
        const t = VENDORS.find(v => v.id === id); if (!t) return;
        editing = id;
        $('edit-title').textContent = 'פרטי ספק · ' + t.name;
        $('e_contact').value = t.contactName || ''; $('e_phone').value = t.phone || ''; $('e_plan').value = t.plan || '';
        $('e_paid').value = t.pricePaid || ''; $('e_purchase').value = t.purchaseDate || ''; $('e_until').value = t.supportUntil || '';
        $('e_notes').value = t.notes || ''; $('e_status').textContent = '';
        $('edit-dlg').showModal();
    }

    /* ================= הצעת מחיר לספק ================= */
    const num = id => Number($(id).value) || 0;
    function offerCalc(){
        const plan = SALES.plans[$('o_plan').value] || SALES.plans.regular;
        const price = num('o_price'), free = num('o_free');
        const extra = $('o_support_on').checked ? num('o_months') : 0, monthly = $('o_support_on').checked ? num('o_monthly') : 0;
        const supportCost = extra * monthly, discount = Math.min(num('o_discount'), price + supportCost);
        return { plan, planKey: $('o_plan').value, price, listPrice: plan.listPrice || price, free, extra, monthly, supportCost, discount,
                 total: Math.max(0, price + supportCost - discount), months: free + extra };
    }
    function renderSummary(){
        const o = offerCalc(), r = (k, v, cls) => `<div class="row ${cls || ''}"><span>${k}</span><span>${v}</span></div>`;
        let h = r(`מערכת · ${esc(o.plan.label)}`, Core.money(o.price));
        if (o.listPrice > o.price) h += r('מחיר רגיל', `<s>${Core.money(o.listPrice)}</s>`);
        if (o.free) h += r(`תמיכה טכנית · ${o.free} חודשים כלולים`, 'ללא עלות', 'minus');
        if (o.extra) h += r(`תמיכה טכנית · ${o.extra} חודשים × ${Core.money(o.monthly)}`, Core.money(o.supportCost));
        if (o.discount) h += r('הנחה', '−' + Core.money(o.discount), 'minus');
        h += `<div class="total"><span>סה"כ לתשלום</span><b>${Core.money(o.total)}</b></div>`;
        h += `<p class="note">${o.months ? `סה"כ ${o.months} חודשי תמיכה טכנית ממועד מסירת המערכת.` : 'ללא תמיכה טכנית חודשית.'}</p>`;
        $('o_summary').innerHTML = h;
    }
    function applyPlan(){
        const p = SALES.plans[$('o_plan').value];
        if (!p) return;
        if ($('o_plan').value !== 'custom') { $('o_price').value = p.price; $('o_free').value = p.freeSupportMonths; }
        renderSummary();
    }
    function initOfferForm(){
        $('o_plan').innerHTML = Object.entries(SALES.plans).map(([k, p]) => `<option value="${k}">${esc(p.label)}${p.price ? ' · ' + Core.money(p.price) : ''}${p.freeSupportMonths ? ` · כולל ${p.freeSupportMonths} חודשי תמיכה` : ''}</option>`).join('');
        $('o_monthly').value = SALES.supportMonthly;
        $('o_plan').addEventListener('change', applyPlan);
        $('o_support_on').addEventListener('change', () => { $('o_support_box').hidden = !$('o_support_on').checked; renderSummary(); });
        $('o_quick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('o_months').value = b.dataset.m; renderSummary(); });
        ['o_price', 'o_free', 'o_months', 'o_monthly', 'o_discount'].forEach(id => $(id).addEventListener('input', renderSummary));
        applyPlan();
        $('offer-form').addEventListener('submit', createOffer);
        $('o_copy').addEventListener('click', () => copyText($('o_url').value, $('o_copy')));
    }
    const genId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const clean = Core.clean;
    function offerUrl(q){
        const raw = [q.id, clean(q.vendorName), clean(q.contactName), clean(q.businessType), q.plan, q.price, q.freeMonths, q.extraMonths, q.monthly,
            q.discount, q.total, clean(q.notes), q.validDays, q.createdISO, clean(q.phone), q.listPrice].join('|');
        return new URL('../offer/', location.href).href + '?q=' + Core.b64UrlEncode(raw);
    }
    async function createOffer(e){
        e.preventDefault();
        const o = offerCalc(), btn = $('o_gen');
        const q = { id: genId(), vendorName: $('o_vendor').value.trim(), contactName: $('o_contact').value.trim(), phone: $('o_phone').value.trim(),
            businessType: $('o_type').value.trim(), plan: o.planKey, planLabel: o.plan.label, price: o.price, listPrice: o.listPrice, freeMonths: o.free,
            extraMonths: o.extra, monthly: o.monthly, discount: o.discount, total: o.total, notes: $('o_notes').value.trim(),
            validDays: num('o_valid') || 14, createdISO: Core.toISO(new Date()) };
        btn.disabled = true; btn.textContent = 'שומר…';
        try {
            const { id, ...data } = q;
            await fs.setDoc(fs.doc(db, 'platformQuotes', id), { ...data, status: 'pending', createdAt: fs.serverTimestamp() });
        } catch(err) { alert('השמירה נכשלה: ' + (err.code || err.message)); btn.disabled = false; btn.textContent = 'יצירת קישור להצעה'; return; }
        const url = offerUrl(q);
        $('o_url').value = url; $('o_preview').href = url;
        const phone = q.phone.replace(/\D/g, '').replace(/^0/, '972');
        $('o_wa').href = 'https://wa.me/' + (phone.length >= 11 ? phone : '') + '?text=' + encodeURIComponent(`היי ${q.contactName}, מצורפת הצעת המחיר למערכת הצעות המחיר והחוזים עבור ${q.vendorName}:\n${url}`);
        $('o_result').classList.remove('hidden'); $('o_result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        btn.disabled = false; btn.textContent = 'יצירת קישור להצעה';
    }

    /* ================= הצעות שנשלחו ================= */
    let OFFERS = [];
    function startOffers(){
        fs.onSnapshot(fs.query(fs.collection(db, 'platformQuotes'), fs.orderBy('createdAt', 'desc')), snap => {
            OFFERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderOffers();
        }, err => { console.error(err); $('otbody').innerHTML = '<tr><td colspan="8" class="loading">שגיאת הרשאות</td></tr>'; });
    }
    const fmtTs = ts => ts && ts.toDate ? ts.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    function renderOffers(){
        const signed = OFFERS.filter(o => o.status === 'signed');
        const kpi = (v, l, hl) => `<div class="card kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><div class="n">${v}</div></div>`;
        $('okpis').innerHTML = kpi(OFFERS.length, 'הצעות שנשלחו') + kpi(signed.length, 'נחתמו') + kpi(OFFERS.length - signed.length, 'ממתינות') +
            kpi((OFFERS.length ? Math.round(signed.length / OFFERS.length * 100) : 0) + '%', 'אחוז סגירה') + kpi(Core.money(signed.reduce((s, o) => s + (Number(o.total) || 0), 0)), 'סכום הצעות חתומות', true);
        if (!OFFERS.length) { $('otbody').innerHTML = '<tr><td colspan="8" class="loading">עדיין לא נשלחו הצעות</td></tr>'; return; }
        $('otbody').innerHTML = OFFERS.map(o => `<tr>
            <td>${fmtTs(o.createdAt)}</td>
            <td class="vend-cell"><b>${esc(o.vendorName)}</b><span>${esc(o.contactName || '')}${o.phone ? ' · <span class="ltr">' + esc(o.phone) + '</span>' : ''}</span></td>
            <td>${esc(o.planLabel || planLabel(o.plan))}</td>
            <td>${(o.freeMonths || 0) + (o.extraMonths || 0)} חודשים</td>
            <td><b>${Core.money(o.total)}</b></td>
            <td>${o.status === 'signed' ? `<span class="badge ok">נחתמה</span><div class="sub">${fmtTs(o.signedAt)}</div>` : '<span class="badge warn">ממתינה</span>'}</td>
            <td>${o.pdfData ? `<button type="button" class="btn sm view" data-id="${o.id}">צפייה</button>` : '<span class="sub">—</span>'}</td>
            <td><div class="acts"><button type="button" class="btn sm copy" data-id="${o.id}">העתק קישור</button>
                ${o.status === 'signed' ? `<button type="button" class="btn sm setup" data-id="${o.id}">סיכום להקמה</button>` : ''}
                <button type="button" class="btn sm danger del" data-id="${o.id}">מחיקה</button></div></td></tr>`).join('');
    }
    $('otbody').addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        const o = OFFERS.find(x => x.id === b.dataset.id); if (!o) return;
        if (b.classList.contains('copy')) copyText(offerUrl(o), b);
        else if (b.classList.contains('setup')) {
            const s = (o.freeMonths || 0) + (o.extraMonths || 0);
            copyText(`ספק חדש להקמה:\nעסק: ${o.vendorName}\nאיש קשר: ${o.contactName}${o.phone ? ' · ' + o.phone : ''}\nתחום: ${o.businessType || '—'}\nחבילה: ${o.planLabel || o.plan} · שולם: ${o.total} ₪\nתמיכה: ${s} חודשים\nנחתם: ${fmtTs(o.signedAt)}`, b);
        } else if (b.classList.contains('del')) {
            if (!confirm(`למחוק את ההצעה ל-${o.vendorName}? לא ניתן לשחזר.`)) return;
            b.disabled = true;
            try { await fs.deleteDoc(fs.doc(db, 'platformQuotes', o.id)); } catch(err) { alert('המחיקה נכשלה.'); b.disabled = false; }
        } else if (b.classList.contains('view')) {
            try { const bin = atob(o.pdfData), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
                const url = URL.createObjectURL(new Blob([a], { type: 'application/pdf' })); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
            } catch(err) { alert('פתיחת הקובץ נכשלה.'); }
        }
    });

    function copyText(t, btn){
        const old = btn.textContent, done = () => { btn.textContent = 'הועתק ✓'; setTimeout(() => btn.textContent = old, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => prompt('העתיקו:', t));
        else prompt('העתיקו:', t);
    }
})();
