/* חשבון הספק: מחולל הצעות + לוח בקרה. הנתונים: tenants/{slug}/quotes. */
(async () => {
    const $ = id => document.getElementById(id), esc = Core.esc;
    const slug = (new URLSearchParams(location.search).get('t') || '').toLowerCase();
    let fb, T, P, user, tenantData = {}, isOwnerView = false, MODE = 'classic';

    function block(msg){ $('loading').classList.add('hidden'); $('main-app').classList.add('hidden'); $('consent').classList.add('hidden'); $('blocked').classList.remove('hidden'); $('blocked-msg').textContent = msg; }
    $('signout').addEventListener('click', () => Core.signOut());

    try { fb = await Core.fb(); } catch(e) { block('טעינת המערכת נכשלה. רעננו את הדף.'); return; }

    let started = false, leaving = false;
    Core.onAuth(async u => {
        if (!u) { if (!leaving) location.replace('./'); return; }
        if (started) return; started = true;
        user = u;
        $('user-email').textContent = u.email;
        isOwnerView = Core.isOwner(u);
        if (!isOwnerView) {
            let mine;
            try { mine = await Core.tenantOf(u); }
            catch(e) { block(Core.isQuota(e) ? Core.QUOTA_MSG : 'לא הצלחנו להתחבר לשרת כרגע. בדקו את החיבור לאינטרנט ורעננו את הדף.'); return; }
            if (!mine) { leaving = true; Core.signOutQuiet(); block('החשבון ' + u.email + ' לא רשום כספק במערכת.'); return; }
            if (mine !== slug) { location.replace('app.html?t=' + encodeURIComponent(mine)); return; }
        }
        // בדיקת הרשאה מול השרת (ספק מושהה / לא משויך — ייחסם כאן)
        // הכול במקביל (ולא אחד אחרי השני): כרטיס הספק, ההגדרות, החבילות ואישור התנאים
        const tenantP = Core.withRetry(() => fb.fs.getDoc(fb.fs.doc(fb.db, 'tenants', slug)));
        const cfgP = Core.loadTenant(slug), pkgP = fetchPackages(), consentP = isOwnerView ? Promise.resolve(true) : hasConsent();
        [tenantP, cfgP, pkgP, consentP].forEach(p => p.catch(() => {}));
        try {
            const snap = await tenantP;
            if (!snap.exists()) { block(isOwnerView ? 'הספק עדיין לא סונכרן. היכנס ללוח הניהול כדי לסנכרן.' : 'החשבון לא נמצא.'); return; }
            tenantData = snap.data() || {};
        } catch(e) { block(e && e.code === 'permission-denied' ? 'החשבון מושהה או שאין לך הרשאה אליו. לבירור פנו ל-Snap Box.' : Core.isQuota(e) ? Core.QUOTA_MSG : 'לא הצלחנו להתחבר לשרת כרגע. בדקו את החיבור לאינטרנט ורעננו את הדף.'); return; }
        try { T = await cfgP; } catch(e) { block('לא נמצאו הגדרות העסק. פנו ל-Snap Box.'); return; }
        P = T.pricing || {};
        MODE = P.MODE === 'items' ? 'items' : 'classic';
        CFG_SERVICES = { ...(P.SERVICES || {}) }; CFG_CATALOG = (P.CATALOG || []).slice();
        PKG_DOCS = await pkgP.catch(() => []); applyPackages();
        if (!(await consentP.catch(() => false))) { askConsent(); return; }
        render(); remindSupport(); oneSession();
    });
    // חיבור אחד בלבד: פתיחה במקום אחר מנתקת כאן (הבעלים פטור)
    const oneSession = () => { if (!isOwnerView && Core.PF.singleSession) Core.singleSession(sameBrowser => {
        leaving = true;
        $('main-app').classList.add('hidden'); $('consent').classList.add('hidden'); $('loading').classList.add('hidden');
        $('kicked').classList.remove('hidden');
        $('kicked-msg').textContent = sameBrowser ? 'החשבון נפתח בלשונית אחרת בדפדפן הזה, ולכן הלשונית הזו נסגרה. אפשר להמשיך לעבוד בלשונית החדשה.'
            : 'החשבון נפתח במכשיר או בדפדפן אחר, ולכן נותקת כאן. אפשר להיות מחוברים רק ממקום אחד בכל פעם.';
        $('kicked-btn').textContent = sameBrowser ? 'להמשיך לעבוד כאן' : 'להתחבר שוב כאן';
        $('kicked-btn').onclick = () => { location.href = sameBrowser ? location.href : './'; };
    }).catch(() => {}); };
    // שבוע אחרון של התמיכה → מייל תזכורת אחד (אם עוד לא נשלח לתאריך הזה)
    const remindSupport = () => Core.supportReminder(slug, tenantData, (tenantData.admins || []).concat(T.business.email || []), T.business.name).catch(() => {});

    /* ================= אישור תנאי שימוש ================= */
    const consentId = () => (user.email || '').toLowerCase() + '|' + Core.PF.termsVersion;
    async function hasConsent(){
        try { return (await Core.withRetry(() => fb.fs.getDoc(fb.fs.doc(fb.db, 'tenants', slug, 'consents', consentId()))) ).exists(); }
        catch(e) { return false; }
    }
    function askConsent(){
        $('loading').classList.add('hidden');
        $('consent').classList.remove('hidden');
        const chk = $('consent-check'), btn = $('consent-btn');
        chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
        btn.addEventListener('click', async () => {
            btn.disabled = true; btn.textContent = 'שומר…';
            try {
                await fb.fs.setDoc(fb.fs.doc(fb.db, 'tenants', slug, 'consents', consentId()), {
                    email: (user.email || '').toLowerCase(), version: Core.PF.termsVersion, acceptedAt: fb.fs.serverTimestamp(), userAgent: navigator.userAgent.slice(0, 300) });
                $('consent').classList.add('hidden');
                render(); remindSupport(); oneSession();
            } catch(e) { $('consent-err').textContent = 'השמירה נכשלה, נסו שוב.'; btn.disabled = false; btn.textContent = 'אישור וכניסה לחשבון'; }
        });
    }

    /* ================= כרטיס תמיכה טכנית ================= */
    function renderSupport(){
        const st = Core.supportStatus(tenantData), c = Core.PF.contact || {}, card = $('support-card');
        const wa = 'https://wa.me/' + (c.whatsapp || '') + '?text=' + encodeURIComponent(`היי, זה ${T.business.name}. אשמח ${st.state === 'active' ? 'לעזרה' : 'לחדש את התמיכה הטכנית'} 🙂`);
        $('wa-support').href = wa;
        document.querySelectorAll('.wa-support-link').forEach(a => { a.href = wa; a.target = '_blank'; a.rel = 'noopener'; });
        const total = tenantData.supportMonths ? tenantData.supportMonths * 30 : 60;
        const frac = st.state === 'active' || st.state === 'expiring' ? Math.max(0.04, Math.min(1, st.days / total)) : 0;
        const C = 2 * Math.PI * 18;
        card.className = 'support-card ' + st.state;
        card.innerHTML = `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 22 22)" stroke-linecap="round"/></svg>
            <div><div class="t">תמיכה טכנית</div>
            ${st.state === 'none' ? `<div class="v">לא כלולה כרגע</div><a href="${wa}" target="_blank" rel="noopener">להוספת תמיכה בוואטסאפ</a>`
              : st.state === 'cancelled' ? `<div class="v">בוטלה</div><div class="s">${esc(st.label)}</div><a href="${wa}" target="_blank" rel="noopener">לחידוש בוואטסאפ</a>`
              : st.state === 'expired' ? `<div class="v">הסתיימה</div><div class="s">ב-${Core.fmtDate(st.until)}</div><a href="${wa}" target="_blank" rel="noopener">לחידוש בוואטסאפ</a>`
              : `<div class="v">נותרו ${esc(st.left)}</div><div class="s">${esc(st.label)}</div>${st.state === 'expiring' ? `<a href="${wa}" target="_blank" rel="noopener">לחידוש בוואטסאפ</a>` : ''}`}</div>`;
    }

    /* ================= תצוגה כללית ================= */
    function render(){
        const B = T.business || {}, L = Object.assign({ service: 'חבילה' }, T.labels || {});
        document.title = `${B.name} | החשבון שלי`;
        const logo = $('t-logo');
        logo.style.background = (T.theme && T.theme.brand) || '#0D9488';
        logo.innerHTML = B.logo ? `<img src="${esc(/^data:image\//.test(B.logo) ? B.logo : Core.PF.customerBase + '/' + slug + '/' + B.logo)}" alt="">` : esc((B.name || '?').charAt(0));
        $('t-name').textContent = B.name;
        $('t-tag').textContent = B.tagline || '';
        if (isOwnerView) { $('owner-banner').classList.remove('hidden'); $('ob-name').textContent = B.name; }
        renderSupport();
        renderAgreement();
        // מצב מוגבל: צפייה בלבד (נאכף גם בשרת)
        const limited = Core.accountState(tenantData) === 'limited';
        if (limited) { $('limited-note').classList.remove('hidden'); if (!isOwnerView) $('creator-fs').disabled = true; }
        // מצב המחולל: מחירון אוטומטי או פריטים
        document.querySelectorAll('.m-classic, .m-items').forEach(el => {
            const on = el.classList.contains(MODE === 'items' ? 'm-items' : 'm-classic');
            el.hidden = !on;
            el.querySelectorAll('input, select, textarea').forEach(i => { i.disabled = !on; });
        });
        if (MODE === 'items') initItems(L);
        $('lbl-service').textContent = L.service + ' *';
        $('th-service').textContent = L.service;
        $('event-types').innerHTML = (L.eventTypes || []).map(x => `<option value="${esc(x)}">`).join('');
        renderServiceSelect(P.DEFAULT_SERVICE);
        renderPackages();
        initMore();
        $('in_deposit').value = P.DEPOSIT != null ? P.DEPOSIT : 0;
        depositTouched = false;
        renderSums();
        $('loading').classList.add('hidden');
        $('main-app').classList.remove('hidden');
        document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
        if (location.hash === '#dash' || (limited && !isOwnerView)) showTab('dash');
    }

    /* ================= ההסכם של הספק מול Snap Box ================= */
    function renderAgreement(){
        const a = tenantData.agreement;
        $('agr-card').classList.toggle('hidden', !a);
        if (!a) return;
        $('agr-date').textContent = 'עודכן ' + Core.fmtDate(a.at);
    }
    $('agr-view').addEventListener('click', async () => {
        const b = $('agr-view'); b.disabled = true; b.textContent = 'פותח…';
        try { const s = await fb.fs.getDoc(fb.fs.doc(fb.db, 'tenants', slug, 'files', 'agreement')); if (s.exists() && s.data().pdfData) openPdf(s.data().pdfData); else alert('ההסכם לא נמצא.'); }
        catch(e) { alert('פתיחת ההסכם נכשלה.'); }
        b.disabled = false; b.textContent = 'צפייה';
    });
    function openPdf(b64){
        try { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([a], { type: 'application/pdf' })); const w = window.open(url, '_blank'); if (!w) location.href = url; setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch(err) { alert('פתיחת הקובץ נכשלה.'); }
    }
    let dashStarted = false;
    function showTab(t){
        document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        $('tab-new').classList.toggle('hidden', t !== 'new');
        $('tab-dash').classList.toggle('hidden', t !== 'dash');
        history.replaceState(null, '', location.pathname + location.search + (t === 'dash' ? '#dash' : ''));
        if (t === 'dash' && !dashStarted) { dashStarted = true; startDashboard(); }
    }

    /* ================= מחולל ההצעות ================= */
    const isDeleting = e => !!(e && typeof e.inputType === 'string' && e.inputType.indexOf('delete') === 0);
    function formatDate(i, e){ const v = i.value.replace(/\D/g, '').slice(0, 8), del = isDeleting(e); let o = v.slice(0, 2);
        if (v.length >= 3) o += '/' + v.slice(2, 4); else if (v.length === 2 && !del) o += '/';
        if (v.length >= 5) o += '/' + v.slice(4, 8); else if (v.length === 4 && !del) o += '/'; i.value = o; }
    function formatTime(i, e){ const v = i.value.replace(/\D/g, '').slice(0, 4), del = isDeleting(e); let o = v.slice(0, 2);
        if (v.length >= 3) o += ':' + v.slice(2, 4); else if (v.length === 2 && !del) o += ':'; i.value = o; }
    function parseHM(v){ const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); if (!m) return null; const h = +m[1], mm = +m[2]; return h > 23 || mm > 59 ? null : h * 60 + mm; }
    function durationMinutes(s, e){ s = parseHM(s); e = parseHM(e); if (s == null || e == null) return null; let d = e - s; if (d <= 0) d += 1440; return d; }
    const fmtDur = m => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
    const hoursPlain = h => ({ 1:'שעה', 2:'שעתיים', 3:'שלוש שעות', 4:'ארבע שעות', 5:'חמש שעות', 6:'שש שעות' })[h] || (h + ' שעות');
    const tierFor = (tiers, n) => (tiers || []).find(t => n <= t.max) || (tiers || [])[tiers.length - 1] || { price: 0, label: '' };

    let priceTouched = false, distanceTouched = false, lastGeo = '';
    function computeQuote(){
        const g = Number($('in_guests').value) || 0;
        if (g <= 0) return null;
        const svc = (P.SERVICES || {})[$('in_service').value];
        if (!svc) return null;
        const km = Number($('in_distance').value) || 0;
        const gt = tierFor(P.GUEST_TIERS || [], g), tt = tierFor(P.TRAVEL_TIERS || [], km);
        let extraMin = 0, extraCost = 0;
        const dur = durationMinutes($('in_startTime').value, $('in_endTime').value);
        if (dur != null && svc.hours) {
            extraMin = dur - svc.hours * 60;
            if (extraMin > 0) {
                extraMin = Math.round(extraMin / 15) * 15;
                const whole = Math.floor(extraMin / 60), frac = extraMin - whole * 60;
                extraCost = whole * (svc.extraHour || 0) + Math.round((svc.extraHour || 0) * ((P.EXTRA_FRACTION || {})[frac] || frac / 60));
            } else extraMin = 0;
        }
        return { svc, sound: gt.price || 0, soundLabel: gt.label, travel: tt.price || 0, travelLabel: tt.label, extraMin, extraCost,
                 total: svc.base + (gt.price || 0) + (tt.price || 0) + extraCost };
    }
    function onCalc(){
        const q = computeQuote(), box = $('price-breakdown');
        if (!q) { box.classList.add('hidden'); lastBreakdown = []; return; }
        const row = (k, v) => `<div class="row"><span>${k}</span><span>₪${v.toLocaleString()}</span></div>`;
        let h = row(`${esc(q.svc.label)}${q.svc.hours ? ' · עד ' + hoursPlain(q.svc.hours) : ''}`, q.svc.base);
        if (q.sound) h += row(`תוספת לפי גודל האירוע · ${esc(q.soundLabel)}`, q.sound);
        if (q.travel) h += row(`נסיעה · ${esc(q.travelLabel)}`, q.travel);
        if (q.extraCost) h += row(`זמן נוסף · ${fmtDur(q.extraMin)} שעות`, q.extraCost);
        const disc = Math.min(discountNow(), q.total), fin = q.total - disc;
        lastBreakdown = [[`${q.svc.label}${q.svc.hours ? ' · עד ' + hoursPlain(q.svc.hours) : ''}`, q.svc.base], q.sound ? [`תוספת לפי גודל האירוע · ${q.soundLabel}`, q.sound] : null,
            q.travel ? [`נסיעה · ${q.travelLabel}`, q.travel] : null, q.extraCost ? [`זמן נוסף · ${fmtDur(q.extraMin)} שעות`, q.extraCost] : null].filter(Boolean).map(([label, amount]) => ({ label, amount }));
        if (disc) h += `<div class="row disc"><span>הנחה${discLabel(q.total)}</span><span>−₪${disc.toLocaleString()}</span></div>`;
        h += `<div class="row sum"><span>סה"כ מחיר מוצע</span><span>₪${fin.toLocaleString()}</span></div><div><button type="button" class="link" id="recalc">⟳ עדכן את שדה המחיר לסכום זה</button></div>`;
        box.innerHTML = h; box.classList.remove('hidden');
        $('recalc').addEventListener('click', () => { priceTouched = false; onCalc(); });
        if (!priceTouched) $('in_price').value = fin;
        renderSums();
    }

    // מרחק נסיעה: Nominatim (מיקום) + OSRM (נסיעה בכביש)
    const ORIGIN = () => P.ORIGIN || { name: 'תל אביב', lat: 32.0853, lon: 34.7818 };
    function haversineKm(a, b){ const R = 6371, r = d => d * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)); }
    async function geocode(raw){
        const clean = raw.replace(/,?\s*ישראל\s*$/, '').replace(/[,،]/g, ' ').trim(), w = clean.split(/\s+/).filter(Boolean), c = [];
        const push = s => { s = (s || '').trim(); if (s && !c.includes(s)) c.push(s); };
        if (w.length >= 2) push(w.slice(-2).join(' ')); if (w.length) push(w.slice(-1).join(' ')); push(clean); if (w.length >= 2) push(w.slice(1).join(' '));
        for (let i = 0; i < Math.min(c.length, 4); i++) {
            try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=' + encodeURIComponent(c[i] + ', ישראל'), { headers: { 'Accept-Language': 'he' } });
                const j = await r.json(); if (j && j[0]) return { lat: +j[0].lat, lon: +j[0].lon, name: (j[0].display_name || '').split(',').slice(0, 2).join(', ') }; } catch(e){}
            if (i < c.length - 1) await new Promise(r => setTimeout(r, 1100));
        }
        return null;
    }
    async function drivingKm(a, b){ try { const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`); const j = await r.json(); if (j && j.routes && j.routes[0]) return j.routes[0].distance / 1000; } catch(e){} return null; }
    async function autoDistance(){
        const loc = $('in_location').value.trim(), st = $('distance-status');
        if (!loc || distanceTouched || loc === lastGeo) return;
        lastGeo = loc; const O = ORIGIN();
        st.textContent = `מחשב מרחק מ${O.name}…`; st.className = 'hint';
        const g = await geocode(loc);
        if (!g) { st.textContent = 'המיקום לא זוהה — אפשר להזין מרחק ידנית'; st.className = 'hint warn'; return; }
        let km = await drivingKm(O, g), approx = false;
        if (km == null) { km = haversineKm(O, g) * 1.3; approx = true; }
        km = Math.round(km);
        if (!distanceTouched) { $('in_distance').value = km; onCalc(); }
        st.textContent = `${approx ? '≈ ' : ''}${km} ק"מ נסיעה מ${O.name} · ${g.name}`; st.className = 'hint ok';
    }

    $('in_date').addEventListener('input', e => formatDate(e.target, e));
    ['in_startTime', 'in_endTime'].forEach(id => $(id).addEventListener('input', e => { formatTime(e.target, e); onCalc(); }));
    $('in_guests').addEventListener('input', onCalc);
    $('in_service').addEventListener('change', () => { showServiceIncludes(); onCalc(); });
    $('in_location').addEventListener('blur', autoDistance);
    $('in_distance').addEventListener('input', () => { distanceTouched = true; onCalc(); });
    $('in_price').addEventListener('input', () => { priceTouched = true; renderSums(); });
    $('in_deposit').addEventListener('input', () => { depositTouched = true; renderSums(); });
    $('dep-quick').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const price = Number($('in_price').value) || 0;
        if (!price) { $('in_price').focus(); return; }
        $('in_deposit').value = Math.round(price * (+b.dataset.p) / 100 / 10) * 10;
        depositTouched = true; renderSums();
    });

    /* ---- הנחה ללקוח: סכום חופשי או 10% / 20% ---- */
    const discountNow = () => Math.max(0, Number($('in_discount').value) || 0);
    function subtotalNow(){
        if (MODE === 'items') return itemsSubtotal();
        const q = computeQuote(); return q ? q.total : (Number($('in_price').value) || 0) + discountNow();
    }
    const discLabel = sub => { const d = discountNow(); return d && sub ? ` (${Math.round(d / sub * 100)}%)` : ''; };
    function discountChanged(){
        const sub = subtotalNow();
        $('disc-pct').textContent = discountNow() ? '·' + (discLabel(sub) || ' ').trim() + ' מהמחיר' : '· אופציונלי';
        if (MODE === 'items') return itemsChanged();
        if (computeQuote()) return onCalc();
        if (!priceTouched || discountNow() === 0) { $('in_price').value = Math.max(0, sub - discountNow()) || ''; }
        renderSums();
    }
    $('in_discount').addEventListener('input', () => { priceTouched = false; discountChanged(); });
    $('disc-quick').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const sub = subtotalNow();
        if (!sub && +b.dataset.p) { (MODE === 'items' ? $('add-item') : $('in_guests')).focus(); return; }
        $('in_discount').value = +b.dataset.p ? Math.round(sub * (+b.dataset.p) / 100) : '';
        priceTouched = false; discountChanged();
    });

    /* ---- החבילות של הספק: tenants/{slug}/packages/{id} ----
       מזהה = מפתח החבילה. חבילה מההגדרות (config) שנערכה נשמרת באותו מזהה; deleted:true מסתיר אותה. חבילה חדשה = p<אקראי>.
       במצב פריטים — אותו דבר על פריטי המחירון (מזהה cat<מספר> לפריטים מההגדרות). */
    let CFG_SERVICES = {}, CFG_CATALOG = [], PKG_DOCS = [], editingPkg = null;
    async function fetchPackages(){
        try { return (await fb.fs.getDocs(fb.fs.collection(fb.db, 'tenants', slug, 'packages'))).docs.map(d => ({ id: d.id, ...d.data() })); }
        catch(e) { return []; }
    }
    async function loadPackages(){ PKG_DOCS = await fetchPackages(); applyPackages(); }
    function applyPackages(){
        const S = {}; Object.entries(CFG_SERVICES).forEach(([k, v]) => { S[k] = { ...v }; });
        const C = CFG_CATALOG.map((c, i) => ({ ...c, id: 'cat' + i }));
        PKG_DOCS.forEach(x => {
            if (MODE === 'items') {
                const i = C.findIndex(c => c.id === x.id);
                if (x.deleted) { if (i >= 0) C.splice(i, 1); return; }
                const v = { id: x.id, label: x.label, price: Number(x.base) || 0, desc: x.desc || '' };
                if (i >= 0) C[i] = { ...C[i], ...v }; else C.push(v);
            } else {
                if (x.deleted) { delete S[x.id]; return; }
                S[x.id] = { ...(S[x.id] || { lead: '' }), label: x.label, base: Number(x.base) || 0, hours: Number(x.hours) || 0, extraHour: Number(x.extraHour) || 0, items: x.items || [] };
            }
        });
        P.SERVICES = S; P.CATALOG = C;
    }
    function pkgList(){
        return MODE === 'items' ? (P.CATALOG || []).map(c => ({ id: c.id, label: c.label, base: c.price, inc: c.desc ? [c.desc] : [] }))
            : Object.entries(P.SERVICES || {}).map(([k, s]) => ({ id: k, label: s.label, base: s.base, hours: s.hours, extraHour: s.extraHour, inc: s.items || [] }));
    }
    function renderServiceSelect(keep){
        if (MODE === 'items') return;
        const sel = $('in_service'), cur = keep || sel.value;
        sel.innerHTML = Object.entries(P.SERVICES || {}).map(([k, s]) => `<option value="${esc(k)}">${esc(s.label)} · מ-₪${Number(s.base).toLocaleString()}</option>`).join('');
        if (cur && (P.SERVICES || {})[cur]) sel.value = cur;
        showServiceIncludes();
    }
    function showServiceIncludes(){
        const s = (P.SERVICES || {})[$('in_service').value];
        $('svc-inc').textContent = s ? [s.hours ? `עד ${hoursPlain(s.hours)}` : '', s.extraHour ? `שעה נוספת ₪${Number(s.extraHour).toLocaleString()}` : '', (s.items || []).join(' · ')].filter(Boolean).join(' · ') : '';
    }
    function renderPackages(){
        const L = pkgList(), items = MODE === 'items';
        $('pkg-h').textContent = items ? 'המחירון שלי' : 'החבילות שלי';
        $('pkg-hint').textContent = items ? 'הפריטים מופיעים כלחצנים במחולל ההצעות. שינוי כאן לא משנה הצעות שכבר נשלחו.' : 'החבילות מופיעות ברשימה "חבילה" במחולל ההצעות. שינוי כאן לא משנה הצעות שכבר נשלחו.';
        $('pkg-list').innerHTML = L.length ? L.map(p => `<div class="pkg-row" data-id="${esc(p.id)}"><div><b>${esc(p.label)}</b>
            <span class="m">₪${Number(p.base || 0).toLocaleString()}${p.hours ? ` · עד ${esc(hoursPlain(p.hours))}` : ''}${p.extraHour ? ` · שעה נוספת ₪${Number(p.extraHour).toLocaleString()}` : ''}</span>
            ${p.inc.length ? `<small>${p.inc.map(esc).join(' · ')}</small>` : ''}</div>
            <div class="acts"><button type="button" class="btn sm pkg-edit" data-id="${esc(p.id)}">עריכה</button><button type="button" class="btn sm danger pkg-del" data-id="${esc(p.id)}" aria-label="מחיקה: ${esc(p.label)}">מחיקה</button></div></div>`).join('')
            : '<p class="hint">עדיין אין חבילות. לחצו "+ הוספת חבילה".</p>';
    }
    function openPkg(id){
        const items = MODE === 'items', p = id ? pkgList().find(x => x.id === id) : null;
        editingPkg = id || null;
        $('pkg-title').textContent = p ? 'עריכת ' + (items ? 'פריט' : 'חבילה') : (items ? 'פריט חדש במחירון' : 'חבילה חדשה');
        document.querySelectorAll('.pk-classic').forEach(el => { el.hidden = items; });
        $('pk_inc_hint').textContent = items ? '· תיאור קצר' : '· כל שורה = פריט';
        $('pk_label').value = p ? p.label : ''; $('pk_price').value = p ? (p.base || 0) : '';
        $('pk_hours').value = p && p.hours ? p.hours : ''; $('pk_extra').value = p && p.extraHour ? p.extraHour : '';
        $('pk_inc').value = p ? p.inc.join('\n') : ''; $('pk_status').textContent = '';
        $('pkg-dlg').showModal(); $('pk_label').focus();
    }
    document.addEventListener('click', e => { if (e.target.closest('.pkg-new')) openPkg(null); });
    $('pkg-close').addEventListener('click', () => $('pkg-dlg').close());
    $('pkg-list').addEventListener('click', async e => {
        const ed = e.target.closest('.pkg-edit'); if (ed) return openPkg(ed.dataset.id);
        const del = e.target.closest('.pkg-del'); if (!del) return;
        const p = pkgList().find(x => x.id === del.dataset.id); if (!p) return;
        if (MODE !== 'items' && pkgList().length <= 1) { alert('חייבת להישאר לפחות חבילה אחת.'); return; }
        if (!confirm(`למחוק את "${p.label}"? הצעות שכבר נשלחו לא ישתנו.`)) return;
        del.disabled = true;
        try { await fb.fs.setDoc(fb.fs.doc(fb.db, 'tenants', slug, 'packages', p.id), { deleted: true, updatedAt: fb.fs.serverTimestamp() }); await refreshPackages(); }
        catch(err) { alert(err.code === 'permission-denied' ? 'אין הרשאה (ייתכן שהחשבון מוגבל).' : 'המחיקה נכשלה.'); del.disabled = false; }
    });
    $('pkg-form').addEventListener('submit', async e => {
        e.preventDefault();
        const items = MODE === 'items', label = Core.clean($('pk_label').value.trim()).slice(0, 80), base = Math.max(0, Number($('pk_price').value) || 0);
        if (!label) { $('pk_label').focus(); return; }
        const inc = $('pk_inc').value.split('\n').map(x => Core.clean(x.trim())).filter(Boolean);
        const data = { label, base, deleted: false, updatedAt: fb.fs.serverTimestamp() };
        if (items) data.desc = inc.join(' ').slice(0, 300);
        else Object.assign(data, { hours: Math.max(0, Number($('pk_hours').value) || 0), extraHour: Math.max(0, Number($('pk_extra').value) || 0), items: inc.slice(0, 20).map(x => x.slice(0, 120)) });
        const id = editingPkg || ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        const btn = $('pk_save'); btn.disabled = true; $('pk_status').textContent = 'שומר…';
        try {
            await fb.fs.setDoc(fb.fs.doc(fb.db, 'tenants', slug, 'packages', id), data);
            $('pkg-dlg').close(); await refreshPackages(items ? null : id);
        } catch(err) { $('pk_status').textContent = err.code === 'permission-denied' ? 'אין הרשאה לשמור (ייתכן שהחשבון מוגבל).' : 'השמירה נכשלה, נסו שוב.'; }
        btn.disabled = false;
    });
    async function refreshPackages(select){
        await loadPackages(); renderPackages();
        if (MODE === 'items') renderCatalog(); else { renderServiceSelect(select); onCalc(); }
    }

    /* ---- מה שהופך הצעה לסגירה: תוקף, תנאי תשלום, הטבות ותוספות (נשמר במכשיר כברירת מחדל לפעם הבאה) ---- */
    let lastBreakdown = [], PERKS = [], EXTRAS = [];
    const PAY_ALL = ['העברה בנקאית', 'ביט', 'פייבוקס', 'מזומן', 'כרטיס אשראי', "צ'ק"];
    const prefKey = () => 'sb.qprefs.' + slug;
    function loadPrefs(){ try { return JSON.parse(localStorage.getItem(prefKey()) || '{}'); } catch(e) { return {}; } }
    function savePrefs(){ try { localStorage.setItem(prefKey(), JSON.stringify({ valid: $('in_valid').value, due: $('in_due').value, methods: payMethods() })); } catch(e) {} }
    const payMethods = () => [...document.querySelectorAll('#pay-methods input:checked')].map(i => i.value);
    function validUntilISO(){ const d = Number($('in_valid').value) || 0; if (!d) return ''; const x = new Date(); x.setDate(x.getDate() + d); return Core.toISO(x); }
    function initMore(){
        const pr = loadPrefs();
        $('in_valid').value = String(pr.valid != null ? pr.valid : (P.QUOTE_VALID_DAYS != null ? P.QUOTE_VALID_DAYS : 14));
        if (![...$('in_valid').options].some(o => o.value === $('in_valid').value)) $('in_valid').value = '14';
        $('in_due').value = pr.due != null ? pr.due : (P.BALANCE_DUE || 'ביום האירוע');
        const on = pr.methods || P.PAYMENT_METHODS || ['העברה בנקאית', 'ביט', 'מזומן'];
        $('pay-methods').innerHTML = PAY_ALL.concat(on.filter(m => !PAY_ALL.includes(m))).map(m => `<label class="chip"><input type="checkbox" value="${esc(m)}"${on.includes(m) ? ' checked' : ''}><span>${esc(m)}</span></label>`).join('');
        validHint();
    }
    function validHint(){ const v = validUntilISO(); $('valid-hint').textContent = v ? 'בתוקף עד ' + Core.fmtDate(v) : 'ללא תאריך תפוגה'; }
    $('in_valid').addEventListener('change', () => { validHint(); savePrefs(); });
    $('in_due').addEventListener('change', savePrefs);
    $('pay-methods').addEventListener('change', savePrefs);
    function rowsUi(box, list, fields){
        $(box).innerHTML = list.map((r, i) => `<div class="mrow" data-i="${i}">${fields.map(f => `<input class="field" data-k="${f.k}" ${f.type ? `type="${f.type}" min="0" inputmode="numeric"` : 'maxlength="100"'} placeholder="${f.ph}" aria-label="${f.ph}" value="${esc(r[f.k] || '')}">`).join('')}<button type="button" class="rm" aria-label="הסרה">✕</button></div>`).join('');
    }
    function bindRows(box, list, fields, addBtn, blank){
        $(addBtn).addEventListener('click', () => { list.push({ ...blank }); rowsUi(box, list, fields); const r = $(box).lastElementChild; if (r) r.querySelector('input').focus(); });
        $(box).addEventListener('input', e => { const r = e.target.closest('.mrow'); if (!r) return; list[+r.dataset.i][e.target.dataset.k] = e.target.value; });
        $(box).addEventListener('click', e => { const b = e.target.closest('.rm'); if (!b) return; list.splice(+b.closest('.mrow').dataset.i, 1); rowsUi(box, list, fields); });
    }
    const PERK_F = [{ k: 'label', ph: 'למשל: מגנטים לכל האורחים' }, { k: 'worth', ph: 'שווי ₪', type: 'number' }];
    const EXTRA_F = [{ k: 'label', ph: 'למשל: שעה נוספת' }, { k: 'price', ph: 'מחיר ₪', type: 'number' }, { k: 'desc', ph: 'פירוט קצר (אופציונלי)' }];
    bindRows('perks', PERKS, PERK_F, 'add-perk', { label: '', worth: '' });
    bindRows('extras', EXTRAS, EXTRA_F, 'add-extra', { label: '', price: '', desc: '' });
    function quoteExtras(){
        const cl = s => Core.clean(String(s || '').trim()).slice(0, 100);
        const out = {
            validUntil: validUntilISO(),
            payment: { methods: payMethods(), due: cl($('in_due').value).slice(0, 60) },
            perks: PERKS.filter(p => cl(p.label)).map(p => ({ label: cl(p.label), worth: Math.max(0, Number(p.worth) || 0) })).slice(0, 10),
            extras: EXTRAS.filter(p => cl(p.label)).map(p => ({ label: cl(p.label), price: Math.max(0, Number(p.price) || 0), desc: cl(p.desc) })).slice(0, 10)
        };
        // פירוט המחיר נשלח רק כשהוא תואם בדיוק למחיר הסופי (אם המחיר שונה ידנית — לא מציגים פירוט)
        if (MODE !== 'items' && lastBreakdown.length && lastBreakdown.reduce((s, x) => s + x.amount, 0) - discountNow() === (Number($('in_price').value) || 0)) out.breakdown = lastBreakdown;
        savePrefs();
        return out;
    }

    /* ---- סיכום: מחיר, מקדמה, יתרה ---- */
    let depositTouched = false;
    function renderSums(){
        const price = Number($('in_price').value) || 0, dep = Number($('in_deposit').value) || 0;
        if (!price) { $('sum-strip').innerHTML = ''; return; }
        $('sum-strip').innerHTML = `<div class="tot"><span>מחיר כולל</span><b>${Core.money(price)}</b></div><div><span>מקדמה</span><b>${Core.money(dep)}</b></div><div><span>יתרה</span><b>${Core.money(price - dep)}</b></div>`;
        $('in_deposit').setCustomValidity(dep > price ? 'המקדמה גדולה מהמחיר הכולל' : '');
    }

    /* ================= מצב פריטים ================= */
    let ITEMS = [];
    function initItems(L){
        $('items-title').textContent = (L.included || 'מה כלול בהצעה') + ' *';
        $('price-hint').textContent = '· סכום הפריטים, ניתן לעריכה';
        renderCatalog();
        $('catalog').addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            const c = (P.CATALOG || [])[+b.dataset.i]; if (!c) return;
            const ex = ITEMS.find(x => x.label === c.label);
            if (ex) ex.qty = (Number(ex.qty) || 1) + 1; else ITEMS.push({ label: c.label, qty: 1, price: Number(c.price) || 0, desc: c.desc || '' });
            renderItems(); itemsChanged();
        });
        $('add-item').addEventListener('click', () => {
            ITEMS.push({ label: '', qty: 1, price: 0, desc: '' }); renderItems();
            const r = $('items').lastElementChild; if (!r) return;
            r.classList.add('new'); r.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => r.querySelector('.it-label').focus({ preventScroll: true }), 350);
        });
        $('items').addEventListener('input', e => {
            const row = e.target.closest('.it-row'); if (!row) return;
            const it = ITEMS[+row.dataset.i]; if (!it) return;
            if (e.target.classList.contains('it-label')) it.label = e.target.value;
            if (e.target.classList.contains('it-desc')) it.desc = e.target.value;
            if (e.target.classList.contains('it-qty')) it.qty = Math.max(1, Number(e.target.value) || 1);
            if (e.target.classList.contains('it-price')) it.price = Math.max(0, Number(e.target.value) || 0);
            row.querySelector('.tot').textContent = Core.money((Number(it.qty) || 1) * (Number(it.price) || 0));
            itemsChanged();
        });
        $('items').addEventListener('click', e => {
            const b = e.target.closest('.rm'); if (!b) return;
            ITEMS.splice(+b.closest('.it-row').dataset.i, 1); renderItems(); itemsChanged();
        });
        $('in_itStart').addEventListener('input', e => formatTime(e.target, e));
        (P.DEFAULT_ITEMS || []).forEach(l => { const c = (P.CATALOG || []).find(x => x.label === l); if (c) ITEMS.push({ label: c.label, qty: 1, price: Number(c.price) || 0, desc: c.desc || '' }); });
        renderItems(); if (ITEMS.length) itemsChanged();
    }
    function renderCatalog(){
        $('catalog').innerHTML = (P.CATALOG || []).map((c, i) => `<button type="button" data-i="${i}">+ ${esc(c.label)}${c.price ? `<small>${Core.money(c.price)}</small>` : ''}</button>`).join('');
    }
    function renderItems(){
        // כל חבילה/פריט = כרטיס: שם, מה כלול, כמות ומחיר (נוח גם בטלפון)
        $('items').innerHTML = ITEMS.map((it, i) => `<div class="it-row" data-i="${i}">
            <div class="it-top"><input class="field it-label" value="${esc(it.label)}" placeholder="שם החבילה / הפריט" aria-label="שם החבילה או הפריט" maxlength="120" required>
              <button type="button" class="rm" aria-label="הסרת ${esc(it.label || 'החבילה')}">✕</button></div>
            <textarea class="field it-desc" rows="2" maxlength="300" placeholder="מה כלול? למשל: 4 שעות צילום, 300 תמונות ערוכות, אלבום דיגיטלי" aria-label="מה כלול ב${esc(it.label || 'חבילה')}">${esc(it.desc || '')}</textarea>
            <div class="it-nums">
              <label>כמות<input class="field it-qty" type="number" min="1" inputmode="numeric" value="${Number(it.qty) || 1}"></label>
              <label>מחיר (₪)<input class="field it-price" type="number" min="0" inputmode="numeric" value="${Number(it.price) || 0}"></label>
              <span class="tot" aria-label="סה&quot;כ לפריט">${Core.money((Number(it.qty) || 1) * (Number(it.price) || 0))}</span>
            </div></div>`).join('');
    }
    const itemsSubtotal = () => ITEMS.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);
    function itemsTotal(){ return Math.max(0, itemsSubtotal() - discountNow()); }
    function itemsChanged(){
        if (!priceTouched) $('in_price').value = itemsTotal() || '';
        if (!depositTouched) {
            const price = Number($('in_price').value) || 0;
            if (P.DEPOSIT_PERCENT) $('in_deposit').value = Math.round(price * P.DEPOSIT_PERCENT / 100 / 10) * 10;
        }
        renderSums();
    }

    const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    $('creator-form').addEventListener('submit', async e => {
        e.preventDefault();
        const g = id => Core.clean($(id).value.trim());
        const base = { id: genId(), clientName: g('in_clientName'), clientPhone: g('in_clientPhone'), eventType: g('in_eventType'), location: g('in_location'),
            date: g('in_date'), price: Number($('in_price').value) || 0, deposit: Number($('in_deposit').value) || 0, notes: Core.clean($('in_notes').value || '') };
        let q;
        if (MODE === 'items') {
            const items = ITEMS.filter(i => String(i.label).trim()).map(i => ({ label: Core.clean(String(i.label).trim()).slice(0, 120), qty: Number(i.qty) || 1, price: Number(i.price) || 0, desc: Core.clean(String(i.desc || '').trim()).slice(0, 300) }));
            if (!items.length) { alert('הוסיפו לפחות פריט אחד להצעה.'); return; }
            q = { ...base, mode: 'items', items, discount: discountNow(), service: '', startTime: g('in_itStart'), endTime: '', guests: Number($('in_itGuests').value) || 0 };
        } else {
            const sv = (P.SERVICES || {})[$('in_service').value] || {};
            // תמונת מצב של החבילה (כך הלקוח רואה בדיוק מה הוצע, גם אם החבילה תשתנה אחר כך)
            const pkg = { label: Core.clean(sv.label || ''), hours: Number(sv.hours) || 0, lead: Core.clean(sv.lead || ''), items: (sv.items || []).map(x => Core.clean(x)).slice(0, 20) };
            q = { ...base, service: $('in_service').value, pkg, discount: discountNow(), startTime: g('in_startTime'), endTime: g('in_endTime'), guests: Number($('in_guests').value) || 0 };
        }
        Object.assign(q, quoteExtras());   // תוקף, תשלום, הטבות, תוספות ופירוט מחיר
        if (q.deposit > q.price) { alert('המקדמה גדולה מהמחיר הכולל.'); return; }
        const btn = $('gen-btn'); btn.disabled = true; btn.textContent = 'שומר…';
        try {
            const { id, ...data } = q;
            await fb.fs.setDoc(fb.fs.doc(fb.db, 'tenants', slug, 'quotes', id), { ...data, status: 'pending', createdAt: fb.fs.serverTimestamp(), createdBy: user.email });
        } catch(err) {
            console.error(err);
            alert(err.code === 'permission-denied' ? 'אין הרשאה ליצור הצעה (ייתכן שהחשבון מוגבל). פנו ל-Snap Box.' : 'שמירת ההצעה נכשלה (' + (err.code || err.message) + '). בדקו את החיבור ונסו שוב.');
            btn.disabled = false; btn.textContent = 'יצירת הצעה ללקוח'; return;
        }
        // קישור קצר (…/?k=xxxxxxxxxx); אם נכשל — הקישור הארוך, שממשיך לעבוד
        let url = Core.shareUrl(slug, q);
        try {
            const s = await Core.makeShortLink('quote', slug, url);
            if (s.id) { url = s.url; q.shortId = s.id; await fb.fs.updateDoc(fb.fs.doc(fb.db, 'tenants', slug, 'quotes', q.id), { shortId: s.id }).catch(() => {}); }
        } catch(err) { console.warn('short link failed', err); }
        showResult(q, url);
        btn.disabled = false; btn.textContent = 'יצירת הצעה ללקוח';
    });
    // בכל מקום (וואטסאפ, העתקה, שיתוף) — הקישור הקצר. הלקוח מקבל את כרטיס התמונה ומתחתיו את הקישור.
    function showResult(q, url){
        const B = T.business || {};
        const msg = url;
        $('shareable-url').value = url;
        // אם הוזן טלפון הלקוח — הכפתור פותח ישר את הצ'אט שלו, וההודעה כבר מוכנה (רק לשלוח)
        const hasPhone = !!Core.waPhone(q.clientPhone);
        Core.bindWhatsApp($('wa-share-btn'), msg, q.clientPhone);
        $('wa-share-btn').textContent = hasPhone ? `שליחה בוואטסאפ ל-${q.clientName || 'לקוח'}` : 'שליחה ללקוח בוואטסאפ';
        $('wa-hint').textContent = (hasPhone
            ? 'הצ\'אט של הלקוח ייפתח עם ההודעה מוכנה. שולחים כמו שזה: '
            : 'לא הוזן טלפון תקין, אז וואטסאפ ישאל למי לשלוח. שולחים כמו שזה: ')
            + 'הלקוח יקבל את התמונה ומתחתיה קישור קצר. לחיצה על התמונה או על הקישור פותחת את ההצעה.';
        $('preview-btn').href = url; $('wa-preview').href = url; $('wa-preview-url').textContent = url;
        const img = $('wa-preview-img');
        img.onerror = () => { img.onerror = null; img.src = Core.PF.customerBase + '/assets/og-default.jpg'; };
        img.src = T.dynamic ? Core.PF.customerBase + '/assets/og-default.jpg' : `${Core.PF.customerBase}/${slug}/og.jpg?v=${encodeURIComponent(T.ogVersion || '1')}`;   // ספק מלוח הניהול: תמונה כללית
        $('wa-preview-title').textContent = `${B.name} · הצעת המחיר שלך מוכנה`;
        $('link-result').classList.remove('hidden');
        $('link-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        $('link-result').focus({ preventScroll: true });
    }
    $('copy-btn').addEventListener('click', () => copyText($('shareable-url').value, $('copy-btn')));
    function copyText(t, btn){
        const old = btn.textContent, done = () => { btn.textContent = 'הועתק ✓'; setTimeout(() => btn.textContent = old, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => prompt('העתיקו את הקישור:', t));
        else prompt('העתיקו את הקישור:', t);
    }

    /* ================= לוח בקרה ================= */
    let QUOTES = [], statusChart, revenueChart, statusFilter = 'all', searchTerm = '', pendingUploadId = null;
    const serviceLabel = q => q && q.items && q.items.length ? q.items[0].label + (q.items.length > 1 ? ` +${q.items.length - 1}` : '') : ((q && q.pkg && q.pkg.label) || ((P.SERVICES || {})[q && q.service] || {}).label || '');
    const fmtTs = ts => ts && ts.toDate ? ts.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : null;
    const qCol = () => fb.fs.collection(fb.db, 'tenants', slug, 'quotes');

    function loadChartJs(){
        if (window.Chart) return Promise.resolve();
        return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    /* חיסכון במכסה של Firebase: הרשימה טוענת רק את ההצעות האחרונות (PAGE בכל פעם, "טעינת הצעות קודמות" מוסיף),
       והמדדים (סה"כ, נחתמו, הכנסה) מחושבים בשרת (count/sum) — עולים יחידות בודדות במקום לקרוא את כל ההצעות. */
    const PAGE = 50;
    let qLimit = PAGE, unsubQuotes = null, STATS = null, statsTimer = null;
    function startDashboard(){
        loadChartJs().catch(() => {});
        $('more-quotes').addEventListener('click', () => { qLimit += PAGE; $('more-quotes').disabled = true; subscribeQuotes(); });
        subscribeQuotes();
    }
    function subscribeQuotes(){
        if (unsubQuotes) unsubQuotes();
        unsubQuotes = fb.fs.onSnapshot(fb.fs.query(qCol(), fb.fs.orderBy('createdAt', 'desc'), fb.fs.limit(qLimit)), snap => {
            QUOTES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            $('more-quotes').disabled = false;
            renderAll(); clearTimeout(statsTimer); statsTimer = setTimeout(refreshStats, 300);
        }, err => { console.error(err); $('tbody').innerHTML = `<tr><td colspan="9" class="loading">${Core.isQuota(err) ? esc(Core.QUOTA_MSG) : 'אין הרשאה לנתונים — ייתכן שהחשבון מושהה.'}</td></tr>`; });
    }
    async function refreshStats(){
        try {
            const fs = fb.fs, col = qCol();
            const [all, sig] = await Promise.all([
                fs.getAggregateFromServer(col, { n: fs.count() }),
                fs.getAggregateFromServer(fs.query(col, fs.where('status', '==', 'signed')), { n: fs.count(), rev: fs.sum('price') })
            ]);
            STATS = { total: all.data().n, signed: sig.data().n, revenue: Number(sig.data().rev) || 0 };
        } catch(e) { console.warn('stats', e); STATS = null; }   // אם נכשל — מחשבים מההצעות שנטענו
        renderAll();
    }
    function renderAll(){
        renderKpis(); renderTable(); loadChartJs().then(renderCharts).catch(() => {});
        const total = STATS ? STATS.total : QUOTES.length, more = total > QUOTES.length || (!STATS && QUOTES.length >= qLimit);
        $('load-more').hidden = !more;
        $('more-note').textContent = more ? `מוצגות ${QUOTES.length} ההצעות האחרונות מתוך ${total}. החיפוש והגרף "הכנסות לפי חודש" לפי ההצעות המוצגות.` : '';
    }
    function counts(){
        if (STATS) return STATS;
        const signedL = QUOTES.filter(q => q.status === 'signed');
        return { total: QUOTES.length, signed: signedL.length, revenue: signedL.reduce((s, q) => s + (Number(q.price) || 0), 0) };
    }
    function renderKpis(){
        const { total, signed, revenue } = counts(), rate = total ? Math.round(signed / total * 100) : 0;
        const k = (n, l, hl) => `<div class="card kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><div class="n">${n}</div></div>`;
        $('kpis').innerHTML = k(total, 'הצעות שנשלחו') + k(signed, 'נחתמו') + k(total - signed, 'ממתינות') + k(rate + '%', 'אחוז סגירה') + k(Core.money(revenue), 'הכנסה מחתומות', true);
    }
    function renderCharts(){
        if (!window.Chart) return;
        const font = { family: 'Assistant', weight: 700 }, { total, signed } = counts();
        if (statusChart) statusChart.destroy();
        statusChart = new Chart($('statusChart'), { type: 'doughnut',
            data: { labels: ['נחתמו', 'ממתינות'], datasets: [{ data: [signed, total - signed], backgroundColor: ['#0D9488', '#F2C46D'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '64%', plugins: { legend: { position: 'bottom', labels: { font, usePointStyle: true } } } } });
        const by = {};
        QUOTES.filter(q => q.status === 'signed').forEach(q => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(q.date || '')); if (!m) return;
            const key = m[3] + '-' + m[2]; by[key] = by[key] || { label: m[2] + '/' + m[3], total: 0 }; by[key].total += Number(q.price) || 0; });
        const keys = Object.keys(by).sort();
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart($('revenueChart'), { type: 'bar',
            data: { labels: keys.map(k => by[k].label), datasets: [{ data: keys.map(k => by[k].total), backgroundColor: '#0D9488', borderRadius: 6, maxBarThickness: 40 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => Core.money(c.parsed.y) } } },
                scales: { x: { ticks: { font }, grid: { display: false } }, y: { ticks: { font, callback: v => '₪' + Number(v).toLocaleString() }, grid: { color: 'rgba(15,35,33,.08)' } } } } });
    }
    function renderTable(){
        let rows = QUOTES.slice();
        if (statusFilter !== 'all') rows = rows.filter(q => (q.status || 'pending') === statusFilter);
        if (searchTerm) rows = rows.filter(q => `${q.clientName || ''} ${q.eventType || ''} ${serviceLabel(q)}`.toLowerCase().includes(searchTerm));
        if (!rows.length) { $('tbody').innerHTML = '<tr><td colspan="9" class="loading">אין הצעות להצגה</td></tr>'; return; }
        $('tbody').innerHTML = rows.map(q => {
            const signed = q.status === 'signed', sa = fmtTs(q.signedAt);
            const bad = Core.signedMismatch(q, 'quote');
            const pill = signed ? `<span class="pill signed">נחתם</span>${sa ? `<div class="sub">${sa}</div>` : ''}${bad ? '<div class="sub" style="color:#B91C1C;font-weight:700">⚠ נחתם על פרטים שונים מההצעה ששלחתם</div>' : ''}` : '<span class="pill pending">ממתין</span>';
            const file = Core.hasPdf(q) ? `<div class="acts"><button type="button" class="btn sm view-file" data-id="${q.id}">צפייה</button><button type="button" class="btn sm upload-file" data-id="${q.id}">החלפה</button></div>`
                                   : `<button type="button" class="btn sm upload-file" data-id="${q.id}">העלאה</button>`;
            return `<tr><td>${fmtTs(q.createdAt) || '—'}</td><td class="name">${esc(q.clientName)}</td><td>${esc(q.eventType)}</td><td>${esc(serviceLabel(q))}</td>
                <td dir="ltr" style="text-align:right">${esc(q.date)}</td><td><b>${Core.money(q.price)}</b></td><td>${pill}</td><td>${file}</td>
                <td><div class="acts"><button type="button" class="btn sm copy-link" data-id="${q.id}">העתק קישור</button><button type="button" class="btn sm danger delete-row" data-id="${q.id}">מחיקה</button></div></td></tr>`;
        }).join('');
    }
    $('search').addEventListener('input', e => { searchTerm = e.target.value.trim().toLowerCase(); renderTable(); });
    $('statusSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; statusFilter = b.dataset.v;
        document.querySelectorAll('#statusSeg button').forEach(x => x.classList.toggle('on', x === b)); renderTable(); });
    $('tbody').addEventListener('click', async e => {
        const btn = e.target.closest('button'); if (!btn) return;
        const q = QUOTES.find(x => x.id === btn.dataset.id); if (!q) return;
        if (btn.classList.contains('copy-link')) copyText(Core.shortUrl(Core.shareUrl(slug, q), q.shortId), btn);
        else if (btn.classList.contains('delete-row')) {
            if (!confirm(`למחוק לצמיתות את ההצעה של ${q.clientName || 'הלקוח'}? לא ניתן לשחזר.`)) return;
            btn.disabled = true; btn.textContent = 'מוחק…';
            try { await Core.deletePdf(`tenants/${slug}/quotes/${q.id}`); await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'tenants', slug, 'quotes', q.id)); Core.deleteShortLink(q.shortId); } catch(err) { alert('המחיקה נכשלה.'); btn.disabled = false; btn.textContent = 'מחיקה'; }
        } else if (btn.classList.contains('view-file')) {
            Core.openPdf(`tenants/${slug}/quotes/${q.id}`, q);
        } else if (btn.classList.contains('upload-file')) { pendingUploadId = q.id; $('fileUploadInput').click(); }
    });
    $('fileUploadInput').addEventListener('change', async e => {
        const file = e.target.files[0]; e.target.value = '';
        const id = pendingUploadId; pendingUploadId = null;
        if (!file || !id) return;
        if (file.type !== 'application/pdf') { alert('אפשר להעלות רק קובץ PDF.'); return; }
        if (file.size > 700 * 1024) { alert('הקובץ גדול מדי (עד כ-700KB).'); return; }
        const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(file); });
        try { await Core.putPdf(`tenants/${slug}/quotes/${id}`, data); } catch(err) { alert('ההעלאה נכשלה.'); }
    });
})();
