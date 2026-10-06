/* חשבון הספק: מחולל הצעות + לוח בקרה. הנתונים: tenants/{slug}/quotes. */
(async () => {
    const $ = id => document.getElementById(id), esc = Core.esc;
    const slug = (new URLSearchParams(location.search).get('t') || '').toLowerCase();
    let fb, T, P, user, isOwnerView = false;

    function block(msg){ $('loading').classList.add('hidden'); $('main').classList.add('hidden'); $('blocked').classList.remove('hidden'); $('blocked-msg').textContent = msg; }
    $('signout').addEventListener('click', () => Core.signOut());

    try { fb = await Core.fb(); } catch(e) { block('טעינת המערכת נכשלה. רעננו את הדף.'); return; }

    let started = false;
    Core.onAuth(async u => {
        if (!u) { location.replace('./'); return; }
        if (started) return; started = true;
        user = u;
        $('user-email').textContent = u.email;
        isOwnerView = Core.isOwner(u);
        if (!isOwnerView) {
            const mine = await Core.tenantOf(u);
            if (!mine) { block('החשבון ' + u.email + ' לא רשום כספק במערכת.'); return; }
            if (mine !== slug) { location.replace('app.html?t=' + encodeURIComponent(mine)); return; }
        }
        // בדיקת הרשאה מול השרת (ספק מושהה / לא משויך — ייחסם כאן)
        try {
            const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'tenants', slug));
            if (!snap.exists()) { block(isOwnerView ? 'הספק עדיין לא סונכרן. היכנס ללוח הניהול כדי לסנכרן.' : 'החשבון לא נמצא.'); return; }
        } catch(e) { block('החשבון מושהה או שאין לך הרשאה אליו. לבירור פנו ל-Snap Box.'); return; }
        try { T = await Core.loadTenant(slug); } catch(e) { block('לא נמצאו הגדרות העסק. פנו ל-Snap Box.'); return; }
        P = T.pricing || {};
        render();
    });

    /* ================= תצוגה כללית ================= */
    function render(){
        const B = T.business || {}, L = Object.assign({ service: 'חבילה' }, T.labels || {});
        document.title = `${B.name} | החשבון שלי`;
        const logo = $('t-logo');
        logo.style.background = (T.theme && T.theme.brand) || '#0D9488';
        logo.innerHTML = B.logo ? `<img src="${esc(Core.PF.customerBase + '/' + slug + '/' + B.logo)}" alt="">` : esc((B.name || '?').charAt(0));
        $('t-name').textContent = B.name;
        $('t-tag').textContent = B.tagline || '';
        if (isOwnerView) { $('owner-banner').classList.remove('hidden'); $('ob-name').textContent = B.name; }
        $('lbl-service').textContent = L.service + ' *';
        $('th-service').textContent = L.service;
        $('event-types').innerHTML = (L.eventTypes || []).map(x => `<option value="${esc(x)}">`).join('');
        $('in_service').innerHTML = Object.entries(P.SERVICES || {}).map(([k, s]) => `<option value="${esc(k)}">${esc(s.label)} · מ-₪${Number(s.base).toLocaleString()}</option>`).join('');
        if (P.DEFAULT_SERVICE) $('in_service').value = P.DEFAULT_SERVICE;
        $('in_deposit').value = P.DEPOSIT != null ? P.DEPOSIT : 0;
        $('loading').classList.add('hidden');
        $('main').classList.remove('hidden');
        document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
        if (location.hash === '#dash') showTab('dash');
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
        if (!q) { box.classList.add('hidden'); return; }
        const row = (k, v) => `<div class="row"><span>${k}</span><span>₪${v.toLocaleString()}</span></div>`;
        let h = row(`${esc(q.svc.label)}${q.svc.hours ? ' · עד ' + hoursPlain(q.svc.hours) : ''}`, q.svc.base);
        if (q.sound) h += row(`תוספת לפי גודל האירוע · ${esc(q.soundLabel)}`, q.sound);
        if (q.travel) h += row(`נסיעה · ${esc(q.travelLabel)}`, q.travel);
        if (q.extraCost) h += row(`זמן נוסף · ${fmtDur(q.extraMin)} שעות`, q.extraCost);
        h += `<div class="row sum"><span>סה"כ מחיר מוצע</span><span>₪${q.total.toLocaleString()}</span></div><div><button type="button" class="link" id="recalc">⟳ עדכן את שדה המחיר לסכום זה</button></div>`;
        box.innerHTML = h; box.classList.remove('hidden');
        $('recalc').addEventListener('click', () => { priceTouched = false; onCalc(); });
        if (!priceTouched) $('in_price').value = q.total;
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
    $('in_service').addEventListener('change', onCalc);
    $('in_location').addEventListener('blur', autoDistance);
    $('in_distance').addEventListener('input', () => { distanceTouched = true; onCalc(); });
    $('in_price').addEventListener('input', () => { priceTouched = true; });

    const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    $('creator-form').addEventListener('submit', async e => {
        e.preventDefault();
        const g = id => Core.clean($(id).value.trim());
        const q = { id: genId(), clientName: g('in_clientName'), eventType: g('in_eventType'), service: $('in_service').value, location: g('in_location'),
            date: g('in_date'), startTime: g('in_startTime'), endTime: g('in_endTime'), guests: Number($('in_guests').value) || 0,
            price: Number($('in_price').value) || 0, deposit: Number($('in_deposit').value) || 0, notes: Core.clean($('in_notes').value || '') };
        const btn = $('gen-btn'); btn.disabled = true; btn.textContent = 'שומר…';
        try {
            const { id, ...data } = q;
            await fb.fs.setDoc(fb.fs.doc(fb.db, 'tenants', slug, 'quotes', id), { ...data, status: 'pending', createdAt: fb.fs.serverTimestamp(), createdBy: user.email });
        } catch(err) {
            console.error(err); alert('שמירת ההצעה נכשלה (' + (err.code || err.message) + '). בדקו את החיבור ונסו שוב.');
            btn.disabled = false; btn.textContent = 'צור קישור ללקוח'; return;
        }
        const url = Core.shareUrl(slug, q);
        $('shareable-url').value = url;
        $('wa-share-btn').href = 'https://wa.me/?text=' + encodeURIComponent(url);
        $('preview-btn').href = url;
        $('link-result').classList.remove('hidden');
        $('link-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        btn.disabled = false; btn.textContent = 'צור קישור ללקוח';
    });
    $('copy-btn').addEventListener('click', () => copyText($('shareable-url').value, $('copy-btn')));
    function copyText(t, btn){
        const old = btn.textContent, done = () => { btn.textContent = 'הועתק ✓'; setTimeout(() => btn.textContent = old, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => prompt('העתיקו את הקישור:', t));
        else prompt('העתיקו את הקישור:', t);
    }

    /* ================= לוח בקרה ================= */
    let QUOTES = [], statusChart, revenueChart, statusFilter = 'all', searchTerm = '', pendingUploadId = null;
    const serviceLabel = k => ((P.SERVICES || {})[k] || {}).label || '';
    const fmtTs = ts => ts && ts.toDate ? ts.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : null;
    const qCol = () => fb.fs.collection(fb.db, 'tenants', slug, 'quotes');

    function loadChartJs(){
        if (window.Chart) return Promise.resolve();
        return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    function startDashboard(){
        loadChartJs().catch(() => {});
        fb.fs.onSnapshot(fb.fs.query(qCol(), fb.fs.orderBy('createdAt', 'desc')), snap => {
            QUOTES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderKpis(); renderTable(); loadChartJs().then(renderCharts).catch(() => {});
        }, err => { console.error(err); $('tbody').innerHTML = '<tr><td colspan="9" class="loading">אין הרשאה לנתונים — ייתכן שהחשבון מושהה.</td></tr>'; });
    }
    function renderKpis(){
        const total = QUOTES.length, signedL = QUOTES.filter(q => q.status === 'signed'), signed = signedL.length;
        const revenue = signedL.reduce((s, q) => s + (Number(q.price) || 0), 0), rate = total ? Math.round(signed / total * 100) : 0;
        const k = (n, l, hl) => `<div class="card kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><div class="n">${n}</div></div>`;
        $('kpis').innerHTML = k(total, 'הצעות שנשלחו') + k(signed, 'נחתמו') + k(total - signed, 'ממתינות') + k(rate + '%', 'אחוז סגירה') + k(Core.money(revenue), 'הכנסה מחתומות', true);
    }
    function renderCharts(){
        if (!window.Chart) return;
        const font = { family: 'Assistant', weight: 700 }, signed = QUOTES.filter(q => q.status === 'signed').length;
        if (statusChart) statusChart.destroy();
        statusChart = new Chart($('statusChart'), { type: 'doughnut',
            data: { labels: ['נחתמו', 'ממתינות'], datasets: [{ data: [signed, QUOTES.length - signed], backgroundColor: ['#0D9488', '#F2C46D'], borderWidth: 0 }] },
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
        if (searchTerm) rows = rows.filter(q => `${q.clientName || ''} ${q.eventType || ''} ${serviceLabel(q.service)}`.toLowerCase().includes(searchTerm));
        if (!rows.length) { $('tbody').innerHTML = '<tr><td colspan="9" class="loading">אין הצעות להצגה</td></tr>'; return; }
        $('tbody').innerHTML = rows.map(q => {
            const signed = q.status === 'signed', sa = fmtTs(q.signedAt);
            const pill = signed ? `<span class="pill signed">נחתם</span>${sa ? `<div class="sub">${sa}</div>` : ''}` : '<span class="pill pending">ממתין</span>';
            const file = q.pdfData ? `<div class="acts"><button type="button" class="btn sm view-file" data-id="${q.id}">צפייה</button><button type="button" class="btn sm upload-file" data-id="${q.id}">החלפה</button></div>`
                                   : `<button type="button" class="btn sm upload-file" data-id="${q.id}">העלאה</button>`;
            return `<tr><td>${fmtTs(q.createdAt) || '—'}</td><td class="name">${esc(q.clientName)}</td><td>${esc(q.eventType)}</td><td>${esc(serviceLabel(q.service))}</td>
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
        if (btn.classList.contains('copy-link')) copyText(Core.shareUrl(slug, q), btn);
        else if (btn.classList.contains('delete-row')) {
            if (!confirm(`למחוק לצמיתות את ההצעה של ${q.clientName || 'הלקוח'}? לא ניתן לשחזר.`)) return;
            btn.disabled = true; btn.textContent = 'מוחק…';
            try { await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'tenants', slug, 'quotes', q.id)); } catch(err) { alert('המחיקה נכשלה.'); btn.disabled = false; btn.textContent = 'מחיקה'; }
        } else if (btn.classList.contains('view-file')) {
            try { const bin = atob(q.pdfData), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
                const url = URL.createObjectURL(new Blob([a], { type: 'application/pdf' })); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
            } catch(err) { alert('פתיחת הקובץ נכשלה.'); }
        } else if (btn.classList.contains('upload-file')) { pendingUploadId = q.id; $('fileUploadInput').click(); }
    });
    $('fileUploadInput').addEventListener('change', async e => {
        const file = e.target.files[0]; e.target.value = '';
        const id = pendingUploadId; pendingUploadId = null;
        if (!file || !id) return;
        if (file.type !== 'application/pdf') { alert('אפשר להעלות רק קובץ PDF.'); return; }
        if (file.size > 700 * 1024) { alert('הקובץ גדול מדי (עד כ-700KB).'); return; }
        const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(file); });
        try { await fb.fs.updateDoc(fb.fs.doc(fb.db, 'tenants', slug, 'quotes', id), { pdfData: data }); } catch(err) { alert('ההעלאה נכשלה.'); }
    });
})();
