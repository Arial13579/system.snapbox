/* יצירת חשבון ספק מהצעה חתומה, ועריכת ההגדרות שלו (מיתוג, מחירון, חבילות, תנאים) — בלי קבצים באתר.
   ההגדרות נשמרות ב-vendorConfigs/<slug> (באותו מבנה של config.js), והספק מקבל גישה מיד.
   דף ההצעה ללקוחות שלו: <customerBase>/v/?t=<slug>. נטען מ-admin.html; VendorEditor.init נקרא מ-admin.js. */
(function(){
    const $ = id => document.getElementById(id), esc = Core.esc;
    let fs, db, hooks = {}, mode = 'create', slug = '', offer = null, T0 = null;

    const COLORS = ['#0F766E', '#6B21A8', '#9C4668', '#1D4ED8', '#B91C1C', '#92400E', '#166534', '#1F2937'];
    const DEFAULT_TERMS = [
        'ההזמנה נכנסת לתוקף עם החתימה על הסכם זה ותשלום המקדמה. עד לתשלום המקדמה התאריך אינו שמור.',
        'ביטול בתוך 14 יום מהחתימה, ולפחות 7 ימים שאינם ימי מנוחה לפני האירוע — החזר מלא בניכוי 5% או 100 ₪ (הנמוך מביניהם), לפי חוק הגנת הצרכן. ביטול מאוחר יותר — לפי מדיניות הביטול וההחזרים של {name}.',
        'הארכת זמן מעבר לשעות שסוכמו תחויב לפי מחיר השעה הנוספת, ברבעי שעה.',
        'הלקוח אחראי לכל נזק שייגרם לציוד במהלך האירוע על ידי האורחים.',
        'אם השירות לא יסופק עקב כוח עליון, המקדמה תוחזר במלואה ואף צד לא יחויב בפיצוי נוסף.',
        'יתרת התשלום תועבר במלואה בתום האירוע.'
    ];
    const DEFAULT_TIERS = [
        'ביטול לאחר תקופת הצינון ועד 30 יום לפני האירוע — המקדמה תוחזר בניכוי 10% דמי טיפול.',
        'ביטול בתוך 30 יום לפני האירוע — המקדמה אינה מוחזרת, כי התאריך נשמר עבורכם.'
    ];
    const DEFAULT_POSTPONE = 'אפשר להעביר את האירוע למועד אחר פעם אחת ללא עלות, בהודעה של 30 יום לפחות ובכפוף לזמינות. המקדמה תועבר למועד החדש.';
    const EVENT_TYPES = 'חתונה, בר מצווה, בת מצווה, חינה, יום הולדת, אירוע חברה, מסיבה פרטית';

    // טקסט חופשי שנכנס לדף הלקוח: בלי תגיות, בלי תווים שמפרידים שדות בקישור (|^~), ובאורך סביר
    const txt = (s, n) => String(s == null ? '' : s).replace(/[<>|^~]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 300);
    const lines = (s, n) => String(s || '').split('\n').map(x => txt(x, n || 400)).filter(Boolean);
    const num = v => Math.max(0, Math.round(Number(v) || 0));
    const okSlug = s => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);
    const okMail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    function suggestSlug(name){
        const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        return okSlug(s) ? s : 'v' + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    }
    function status(t, bad){ const s = $('vc_status'); s.textContent = t; s.className = 'hint' + (bad ? ' bad-text' : ''); }

    /* ---------- שורות חוזרות: חבילות / פריטי מחירון / תוספות לפי מוזמנים ומרחק ---------- */
    function rowHtml(kind, v){
        v = v || {};
        const del = `<button type="button" class="btn sm danger vc-del" aria-label="מחיקת השורה">✕</button>`;
        if (kind === 'pkg') return `<div class="vc-row vc-card" data-kind="pkg" data-key="${esc(v.key || '')}">
            <div class="grid2"><div><label class="lbl">שם החבילה</label><input class="field" aria-label="שם החבילה" data-f="label" maxlength="80" value="${esc(v.label || '')}"></div>
            <div><label class="lbl">מחיר (₪)</label><input class="field" aria-label="מחיר החבילה" type="number" min="0" data-f="base" value="${esc(v.base != null ? v.base : '')}"></div>
            <div><label class="lbl">שעות כלולות</label><input class="field" aria-label="שעות כלולות" type="number" min="0" step="0.5" data-f="hours" value="${esc(v.hours != null ? v.hours : '')}"></div>
            <div><label class="lbl">מחיר לשעה נוספת (₪)</label><input class="field" aria-label="מחיר לשעה נוספת" type="number" min="0" data-f="extraHour" value="${esc(v.extraHour != null ? v.extraHour : '')}"></div></div>
            <label class="lbl">מה כלול <small>· שורה לכל פריט</small></label><textarea class="field" aria-label="מה כלול בחבילה" rows="3" data-f="items">${esc((v.items || []).join('\n'))}</textarea>
            ${del}</div>`;
        if (kind === 'item') return `<div class="vc-row vc-card" data-kind="item">
            <div class="grid2"><div><label class="lbl">שם הפריט</label><input class="field" aria-label="שם הפריט" data-f="label" maxlength="80" value="${esc(v.label || '')}"></div>
            <div><label class="lbl">מחיר (₪)</label><input class="field" aria-label="מחיר הפריט" type="number" min="0" data-f="price" value="${esc(v.price != null ? v.price : '')}"></div></div>
            <label class="lbl">מה כלול</label><input class="field" aria-label="מה כלול בפריט" data-f="desc" maxlength="300" value="${esc(v.desc || '')}">
            ${del}</div>`;
        const unit = kind === 'guest' ? 'מוזמנים' : 'ק"מ';
        return `<div class="vc-row vc-line" data-kind="${kind}"><span>מעל</span><input class="field" type="number" min="0" data-f="over" aria-label="מעל כמה ${unit}" value="${esc(v.over != null ? v.over : '')}"><span>${unit} — תוספת ₪</span><input class="field" type="number" min="0" data-f="add" aria-label="תוספת בשקלים" value="${esc(v.add != null ? v.add : '')}">${del}</div>`;
    }
    const listOf = id => $(id);
    function addRow(listId, kind, v, focus){
        const box = listOf(listId); box.insertAdjacentHTML('beforeend', rowHtml(kind, v));
        if (focus) { const el = box.lastElementChild.querySelector('input'); el && el.focus(); }
    }
    function readRows(listId){
        return Array.from(listOf(listId).querySelectorAll('.vc-row')).map(r => {
            const o = { key: r.dataset.key || '' }; r.querySelectorAll('[data-f]').forEach(i => { o[i.dataset.f] = i.value; }); return o;
        });
    }
    // "מעל X → +₪Y" ⇄ מדרגות (max, price, label) כמו ב-config.js
    function toTiers(rules, unit, first){
        const r = rules.map(x => ({ over: num(x.over), add: num(x.add) })).filter(x => x.over > 0 && x.add > 0).sort((a, b) => a.over - b.over);
        if (!r.length) return [];
        const t = [{ max: r[0].over, price: 0, label: `עד ${r[0].over} ${unit}${first ? ' · ' + first : ''}` }];
        r.forEach((x, i) => t.push({ max: i + 1 < r.length ? r[i + 1].over : 1e9, price: x.add, label: `מעל ${x.over} ${unit}` }));
        return t;
    }

    /* ---------- פתיחה ---------- */
    function fill(T, o){
        const B = T.business || {}, P = T.pricing || {}, L = T.labels || {}, E = T.editor || {};
        $('vc_name').value = B.name || ''; $('vc_tag').value = B.tagline || ''; $('vc_phone').value = B.phone || '';
        $('vc_email').value = B.email || ''; $('vc_bid').value = B.businessId || '';
        ['website', 'instagram', 'facebook', 'tiktok'].forEach(k => { $('vc_' + k).value = B[k] || ''; });
        setColor((T.theme && T.theme.brand) || COLORS[0]);
        setLogo(B.logo || '');
        const items = P.MODE === 'items';
        $('vc_mode_pkg').checked = !items; $('vc_mode_items').checked = items;
        $('vc_pkgs').innerHTML = ''; $('vc_items').innerHTML = ''; $('vc_guest').innerHTML = ''; $('vc_travel').innerHTML = '';
        Object.entries(P.SERVICES || {}).forEach(([key, s]) => addRow('vc_pkgs', 'pkg', Object.assign({ key }, s)));
        (P.CATALOG || []).forEach(c => addRow('vc_items', 'item', c));
        if (!$('vc_pkgs').children.length) addRow('vc_pkgs', 'pkg', {});
        if (!$('vc_items').children.length) addRow('vc_items', 'item', {});
        (E.guestRules || []).forEach(r => addRow('vc_guest', 'guest', r));
        (E.travelRules || []).forEach(r => addRow('vc_travel', 'travel', r));
        $('vc_city').value = (P.ORIGIN && P.ORIGIN.name) || '';
        $('vc_deposit').value = P.DEPOSIT != null ? P.DEPOSIT : 500;
        $('vc_deposit_pct').value = P.DEPOSIT_PERCENT != null ? P.DEPOSIT_PERCENT : 30;
        $('vc_common').value = (P.COMMON_ITEMS || []).join('\n');
        $('vc_types').value = (L.eventTypes || EVENT_TYPES.split(', ')).join(', ');
        $('vc_included').value = L.included || 'מה כלול';
        $('vc_terms').value = (T.terms || DEFAULT_TERMS).join('\n');
        const pol = T.policy || {};
        $('vc_ptiers').value = (pol.tiers || DEFAULT_TIERS).join('\n');
        $('vc_postpone').value = pol.postpone || DEFAULT_POSTPONE;
        syncMode();
    }
    function fromOffer(o){
        // ממה שהספק מילא בהצעה: שם, תחום, טלפון, Gmail
        return { business: { name: o.vendorName || '', tagline: o.businessType || '', phone: o.phone || '', email: o.email || '' },
                 theme: { brand: COLORS[Math.floor(Math.random() * COLORS.length)] } };
    }
    async function open(opts){
        mode = opts.offer ? 'create' : 'edit'; offer = opts.offer || null; slug = opts.slug || ''; T0 = null;
        status('');
        $('vc_title').textContent = mode === 'create' ? `יצירת משתמש · ${offer.vendorName || ''}` : 'הגדרות הספק';
        $('vc_save').textContent = mode === 'create' ? 'יצירת המשתמש' : 'שמירת ההגדרות';
        $('vc_slug').readOnly = mode === 'edit';
        // תזכורת ממה שהספק סיפר בהצעה
        const ref = offer || opts.refOffer;
        $('vc_ref').classList.toggle('hidden', !ref);
        if (ref) $('vc_ref_body').innerHTML = [
            ['עסק', ref.vendorName], ['איש קשר', ref.contactName], ['טלפון', ref.phone], ['תחום', ref.businessType], ['Gmail', ref.email],
            ['חבילה', (ref.planLabel || ref.plan) + (ref.total ? ' · ₪' + Number(ref.total).toLocaleString() : '')],
            ['מה משפיע על המחיר', ref.pricingInfo], ['הערות', ref.notes]
        ].filter(x => x[1]).map(([k, v]) => `<div><b>${esc(k)}:</b> <span style="white-space:pre-wrap">${esc(v)}</span></div>`).join('');
        if (mode === 'create') {
            fill(fromOffer(offer), offer);
            $('vc_slug').value = suggestSlug(offer.vendorName);
            $('vc_gmail').value = (offer.email || '').toLowerCase();
            $('vc_contact').value = offer.contactName || '';
        } else {
            $('vc_slug').value = slug; status('טוען…');
            $('vc_dlg').showModal();
            try {
                const [c, t] = await Promise.all([fs.getDoc(fs.doc(db, 'vendorConfigs', slug)), fs.getDoc(fs.doc(db, 'tenants', slug))]);
                T0 = c.exists() ? JSON.parse(c.data().config) : { business: { name: t.exists() ? t.data().name : slug } };
                fill(T0, null);
                $('vc_gmail').value = ((t.exists() && t.data().admins) || [])[0] || '';
                $('vc_contact').value = (t.exists() && t.data().contactName) || '';
                status('');
            } catch(e) { status('הטעינה נכשלה: ' + (e.code || e.message), true); }
        }
        updateUrl();
        if (!$('vc_dlg').open) $('vc_dlg').showModal();
    }

    /* ---------- מיתוג ---------- */
    function setColor(c){
        $('vc_color').value = /^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[0];
        $('vc_swatches').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === $('vc_color').value.toLowerCase())));
    }
    let LOGO = '';
    function setLogo(src){
        LOGO = /^data:image\//.test(src) ? src : '';
        $('vc_logo_prev').innerHTML = LOGO ? `<img src="${esc(LOGO)}" alt="הלוגו">` : '<span>אין לוגו · תוצג האות הראשונה של השם</span>';
        $('vc_logo_rm').classList.toggle('hidden', !LOGO);
    }
    // לוגו מוקטן (עד 320px) — נשמר בתוך ההגדרות, כך שאין צורך בקובץ באתר
    function shrink(file){
        return new Promise((ok, bad) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
                let d = c.toDataURL('image/png'); if (d.length > 90000) d = c.toDataURL('image/webp', 0.85);
                d.length > 120000 ? bad(new Error('big')) : ok(d);
            };
            img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('bad image')); };
            img.src = url;
        });
    }

    function syncMode(){
        const items = $('vc_mode_items').checked;
        $('vc_pkg_box').classList.toggle('hidden', items); $('vc_items_box').classList.toggle('hidden', !items);
    }
    function updateUrl(){
        const s = $('vc_slug').value.trim().toLowerCase();
        $('vc_url').textContent = `${Core.PF.customerBase}/v/?t=${s || '…'}`;
    }

    /* ---------- בניית ההגדרות ---------- */
    function build(){
        const name = txt($('vc_name').value, 80);
        const items = $('vc_mode_items').checked;
        const city = txt($('vc_city').value, 60);
        const guestRules = readRows('vc_guest').map(r => ({ over: num(r.over), add: num(r.add) })).filter(r => r.over && r.add);
        const travelRules = readRows('vc_travel').map(r => ({ over: num(r.over), add: num(r.add) })).filter(r => r.over && r.add);
        const B = { name, tagline: txt($('vc_tag').value, 120), email: txt($('vc_email').value, 120).toLowerCase(), phone: txt($('vc_phone').value, 30),
            businessId: txt($('vc_bid').value, 60), logo: LOGO };
        ['website', 'instagram', 'facebook', 'tiktok'].forEach(k => { const v = txt($('vc_' + k).value, 200); if (/^https:\/\//i.test(v)) B[k] = v; });
        const P = { COMMON_ITEMS: lines($('vc_common').value, 200) };
        if (items) {
            Object.assign(P, { MODE: 'items', DEPOSIT_PERCENT: Math.min(100, num($('vc_deposit_pct').value)), EVENT_HOURS: 4,
                CATALOG: readRows('vc_items').map(r => ({ label: txt(r.label, 80), price: num(r.price), desc: txt(r.desc, 300) })).filter(r => r.label) });
        } else {
            const SERVICES = {};
            // מפתח קבוע לכל חבילה (גם אחרי שינוי סדר), כי הספק יכול לערוך חבילה בעצמו לפי המפתח שלה
            readRows('vc_pkgs').filter(r => txt(r.label, 80)).forEach(r => {
                let key = /^[a-z][a-z0-9_]{0,30}$/.test(r.key) && !SERVICES[r.key] ? r.key : '';
                while (!key || SERVICES[key]) key = 'c' + suggestSlug('').slice(1);
                SERVICES[key] = { label: txt(r.label, 80), base: num(r.base), hours: Math.max(0, Number(r.hours) || 0), extraHour: num(r.extraHour), lead: '', items: lines(r.items, 200) };
            });
            Object.assign(P, { DEFAULT_SERVICE: Object.keys(SERVICES)[0] || '', DEPOSIT: num($('vc_deposit').value), SERVICES,
                GUEST_TIERS: toTiers(guestRules, 'מוזמנים'), TRAVEL_TIERS: toTiers(travelRules, 'ק"מ', city ? 'מ' + city : ''),
                EXTRA_FRACTION: { 0: 0, 15: 0.25, 30: 0.5, 45: 0.75 } });
            const prev = T0 && T0.pricing && T0.pricing.ORIGIN;
            if (city) P.ORIGIN = prev && prev.name === city ? prev : { name: city };
        }
        return {
            business: B,
            theme: { brand: $('vc_color').value, background: '#F7F6F3', font: 'Assistant' },
            labels: { service: 'חבילה', included: txt($('vc_included').value, 40) || 'מה כלול', docTitle: 'הצעת מחיר והסכם',
                eventTypes: $('vc_types').value.split(/[,\n]/).map(x => txt(x, 40)).filter(Boolean).slice(0, 20) },
            pricing: P,
            terms: lines($('vc_terms').value, 600),
            policy: { coolingDays: 14, coolingNoticeDays: 7, refundDays: 14, tiers: lines($('vc_ptiers').value, 400), postpone: txt($('vc_postpone').value, 400) },
            editor: { guestRules, travelRules }
        };
    }
    // עיר היציאה → קואורדינטות (לחישוב המרחק במחולל). אם לא נמצאה — החישוב יהיה מתל אביב
    async function geocode(P){
        if (!P.ORIGIN || P.ORIGIN.lat) return true;
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=' + encodeURIComponent(P.ORIGIN.name + ', ישראל'), { headers: { 'Accept-Language': 'he' } });
            const j = await r.json();
            if (j && j[0]) { P.ORIGIN.lat = Number(j[0].lat); P.ORIGIN.lon = Number(j[0].lon); return true; }
        } catch(e) {}
        delete P.ORIGIN; return false;
    }

    async function save(){
        const s = $('vc_slug').value.trim().toLowerCase(), gmail = $('vc_gmail').value.trim().toLowerCase();
        const T = build(), P = T.pricing;
        if (!T.business.name) return status('חסר שם העסק.', true);
        if (!okSlug(s)) return status('שם המשתמש באנגלית: אותיות קטנות, מספרים ומקפים (3–40 תווים).', true);
        if (gmail && !okMail(gmail)) return status('כתובת ה-Gmail לא תקינה.', true);
        if (T.business.email && !okMail(T.business.email)) return status('המייל לקבלת ההסכמים לא תקין.', true);
        if (P.MODE === 'items' ? !P.CATALOG.length : !Object.keys(P.SERVICES).length) return status(P.MODE === 'items' ? 'צריך לפחות פריט אחד במחירון.' : 'צריך לפחות חבילה אחת עם שם.', true);
        if (!T.terms.length) return status('צריך לפחות סעיף אחד בתנאי ההסכם.', true);
        if (!T.business.email) T.business.email = gmail;
        const btn = $('vc_save'); btn.disabled = true; status('שומר…');
        try {
            if (mode === 'create') {
                if ((window.REGISTRY || []).some(r => r.slug === s)) throw new Error('שם המשתמש תפוס. בחרו שם אחר.');
                const [t, c, d] = await Promise.all([fs.getDoc(fs.doc(db, 'tenants', s)), fs.getDoc(fs.doc(db, 'vendorConfigs', s)), fs.getDoc(fs.doc(db, 'deletedTenants', s))]);
                if (t.exists() || c.exists()) throw new Error('שם המשתמש תפוס. בחרו שם אחר.');
                if (d.exists()) throw new Error('השם שייך לספק שנמחק. בחרו שם אחר.');
            }
            if (gmail) {
                const ix = await fs.getDoc(fs.doc(db, 'vendorIndex', gmail));
                if (ix.exists() && ix.data().tenant !== s) throw new Error(`ה-Gmail הזה כבר משויך לספק אחר (${ix.data().tenant}). כל Gmail — לעסק אחד.`);
            }
            const found = await geocode(P);
            await fs.setDoc(fs.doc(db, 'vendorConfigs', s), { config: JSON.stringify(T), updatedAt: fs.serverTimestamp() });
            const tref = fs.doc(db, 'tenants', s), admins = gmail ? [gmail] : [];
            if (mode === 'create') {
                await fs.setDoc(tref, { slug: s, name: T.business.name, admins, active: true, managed: 'admin', offerId: offer.id,
                    contactName: txt($('vc_contact').value, 80), phone: T.business.phone, createdAt: fs.serverTimestamp() });
                await hooks.fillFromOffer(s, offer.vendorName, [offer]).catch(e => console.warn('fill from offer', e));
                await fs.updateDoc(fs.doc(db, 'platformQuotes', offer.id), { tenant: s }).catch(() => {});
            } else {
                const prev = await fs.getDoc(tref), old = ((prev.exists() && prev.data().admins) || []);
                await fs.updateDoc(tref, { name: T.business.name, admins, contactName: txt($('vc_contact').value, 80), updatedAt: fs.serverTimestamp() });
                await Promise.all(old.filter(e => !admins.includes(e)).map(e => fs.deleteDoc(fs.doc(db, 'vendorIndex', e)).catch(() => {})));
            }
            if (gmail) await fs.setDoc(fs.doc(db, 'vendorIndex', gmail), { tenant: s });
            status((mode === 'create' ? '✓ המשתמש נוצר. ' : '✓ נשמר. ') + (found ? '' : 'לא מצאנו את עיר היציאה — המרחק יחושב מתל אביב. '));
            mode = 'edit'; slug = s; T0 = T; $('vc_slug').readOnly = true; $('vc_save').textContent = 'שמירת ההגדרות';
            $('vc_done').classList.remove('hidden');
            $('vc_open').href = 'app.html?t=' + encodeURIComponent(s);
            hooks.onSaved && hooks.onSaved(s);
        } catch(e) { console.error(e); status(e.code ? 'השמירה נכשלה: ' + e.code : e.message, true); }
        btn.disabled = false;
    }

    function init(o){
        fs = o.fs; db = o.db; hooks = o;
        $('vc_swatches').innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="צבע ${c}" aria-pressed="false"></button>`).join('');
        $('vc_swatches').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setColor(b.dataset.c); });
        $('vc_color').addEventListener('input', () => setColor($('vc_color').value));
        $('vc_logo_btn').addEventListener('click', () => $('vc_logo_file').click());
        $('vc_logo_file').addEventListener('change', async e => {
            const f = e.target.files[0]; e.target.value = ''; if (!f) return;
            if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) return alert('אפשר להעלות תמונה מסוג PNG, JPG, WEBP או SVG.');
            try { setLogo(await shrink(f)); } catch(err) { alert('לא הצלחנו להשתמש בתמונה. נסו קובץ אחר או קטן יותר.'); }
        });
        $('vc_logo_rm').addEventListener('click', () => setLogo(''));
        [['vc_add_pkg', 'vc_pkgs', 'pkg'], ['vc_add_item', 'vc_items', 'item'], ['vc_add_guest', 'vc_guest', 'guest'], ['vc_add_travel', 'vc_travel', 'travel']]
            .forEach(([b, l, k]) => $(b).addEventListener('click', () => addRow(l, k, {}, true)));
        $('vc_dlg').addEventListener('click', e => { const d = e.target.closest('.vc-del'); if (d) d.closest('.vc-row').remove(); });
        $('vc_mode_pkg').addEventListener('change', syncMode); $('vc_mode_items').addEventListener('change', syncMode);
        $('vc_slug').addEventListener('input', updateUrl);
        $('vc_close').addEventListener('click', () => $('vc_dlg').close());
        $('vc_dlg').addEventListener('close', () => $('vc_done').classList.add('hidden'));
        $('vc_form').addEventListener('submit', e => { e.preventDefault(); save(); });
    }
    window.VendorEditor = { init, open, build, suggestSlug };
})();
