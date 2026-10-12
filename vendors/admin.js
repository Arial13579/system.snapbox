/* לוח ניהול לבעלים בלבד: ספקים (סנכרון, פרטים, תמיכה, השהיה), הצעת מחיר לספק, והצעות שנשלחו. */
(async () => {
    const $ = id => document.getElementById(id), esc = Core.esc, PF = Core.PF, SALES = PF.sales;
    let fb;
    const fmtTs = ts => ts && ts.toDate ? ts.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
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
        VendorEditor.init({ fs, db, fillFromOffer, onSaved: () => renderVendors() });
        loadTraffic(); initQuota();
        await sync();
        await renderVendors();
        // מונה המבצע מתעדכן מיד בכניסה, לא רק כשפותחים את טאב ההצעות
        if (!offersStarted) { offersStarted = true; startOffers(); }
        if (!QUOTA) migrateVendorPdfs();
    });

    /* ================= תנועה באתר הראשי (common/track.js → stats/d<יום>) ================= */
    async function loadTraffic(){
        const box = $('traffic');
        try {
            const today = Math.floor(Date.now() / 86400000);
            // 30 הימים האחרונים (טווח עולה לפי המזהה — לא צריך אינדקס מיוחד)
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'stats'), fs.where(fs.documentId(), '>=', 'd' + (today - 30))));
            const by = {}; snap.docs.forEach(d => { by[d.id] = d.data(); });
            const sum = (from, to) => { const r = { v: 0, t: 0, w: 0, f: 0, d: 0, r: 0, l: 0 }; for (let i = from; i <= to; i++) { const d = by['d' + (today - i)]; if (d) for (const k in r) r[k] += Number(d[k]) || 0; } return r; };
            const rows = [['היום', 0, 0], ['אתמול', 1, 1], ['7 ימים', 0, 6], ['30 ימים', 0, 29]];
            box.innerHTML = rows.map(([l, a, b]) => { const r = sum(a, b); return `<tr><td>${l}</td><td><b>${r.v}</b></td><td>${r.t}</td><td>${r.w}</td><td>${r.f}</td><td>${r.d}</td><td>${r.r}</td><td>${r.l}</td></tr>`; }).join('');
        } catch(e) { box.innerHTML = `<tr><td colspan="8" class="loading">${esc(Core.isQuota(e) ? Core.QUOTA_MSG : 'טעינת הנתונים נכשלה (' + (e.code || e.message) + ')')}</td></tr>`; }
    }

    /* ================= מכסת Firebase היום (Google Cloud Monitoring) ================= */
    const LIMITS = { reads: 50000, writes: 40000 };   // המכסה החינמית היומית
    function laMidnight(now){
        const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
            .formatToParts(now).forEach(x => { p[x.type] = x.value; });
        return new Date(now.getTime() - ((Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 - now.getMilliseconds());
    }
    async function fetchUsage(tok){
        const now = new Date(), start = laMidnight(now), secs = Math.max(60, Math.ceil((now - start) / 1000));
        const url = m => 'https://monitoring.googleapis.com/v3/projects/' + PF.firebase.projectId + '/timeSeries?' + new URLSearchParams({
            filter: `metric.type="firestore.googleapis.com/${m}"`, 'interval.startTime': start.toISOString(), 'interval.endTime': now.toISOString(),
            'aggregation.alignmentPeriod': secs + 's', 'aggregation.perSeriesAligner': 'ALIGN_SUM', 'aggregation.crossSeriesReducer': 'REDUCE_SUM' });
        const total = async m => {
            const r = await fetch(url(m), { headers: { Authorization: 'Bearer ' + tok } });
            if (!r.ok) { const e = new Error((await r.text()).slice(0, 300)); e.status = r.status; throw e; }
            const j = await r.json(), ts = j.timeSeries || [];
            return { n: ts.reduce((s, x) => s + (x.points || []).reduce((a, p) => a + Number(p.value.int64Value != null ? p.value.int64Value : (p.value.doubleValue || 0)), 0), 0), any: ts.length > 0 };
        };
        const [r1, r2, w] = await Promise.all([total('api/billable_read_units'), total('api/billable_realtime_read_units').catch(() => ({ n: 0, any: false })), total('api/billable_write_units').catch(() => null)]);
        return { reads: r1.n + r2.n, writes: w ? w.n : null, any: r1.any || r2.any || !!(w && w.any), reset: new Date(start.getTime() + 86400000) };
    }
    function bar(label, used, limit){
        const pct = Math.min(100, Math.round(used / limit * 100)), cls = pct >= 90 ? ' bad' : pct >= 70 ? ' warn' : '';
        return `<div class="qbar${cls}"><div class="t"><span>${label}</span><span>${used.toLocaleString('he-IL')} מתוך ${limit.toLocaleString('he-IL')} (${pct}%)</span></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
    }
    function initQuota(){
        const btn = $('quota-btn'), msg = $('quota-msg'), bars = $('quota-bars');
        btn.addEventListener('click', async () => {
            btn.disabled = true; msg.textContent = 'בודק…';
            try {
                const tok = await Core.usageToken(), u = await fetchUsage(tok);
                bars.hidden = false;
                bars.innerHTML = bar('קריאה', u.reads, LIMITS.reads) + (u.writes == null ? '' : bar('כתיבה', u.writes, LIMITS.writes));
                $('quota-reset').textContent = 'מתאפס ב-' + u.reset.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                msg.textContent = u.any ? 'עודכן עכשיו (הנתונים של Google מגיעים בעיכוב של כמה דקות).' : 'עדיין אין נתונים להיום, או שהם עוד לא הגיעו. נסו שוב בעוד כמה דקות.';
            } catch(e) {
                console.warn(e);
                const g = String((e && e.message) || ''), why = /SERVICE_DISABLED|has not been used|is disabled/i.test(g) ? 'disabled' : /SCOPE_INSUFFICIENT|insufficient.*scope/i.test(g) ? 'scope' : '';
                if (e && (e.status === 401 || e.status === 403) && why !== 'disabled') Core.clearUsageToken();   // בלחיצה הבאה Google ישאל שוב
                msg.textContent = '';
                if (why === 'disabled') {
                    // פעולה חד-פעמית: להפעיל את Cloud Monitoring API בפרויקט
                    const a = document.createElement('a');
                    a.href = 'https://console.cloud.google.com/apis/library/monitoring.googleapis.com?project=' + PF.firebase.projectId;
                    a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'לפתוח את הדף ולהפעיל (Enable)';
                    msg.append('צריך להפעיל פעם אחת את השירות של Google שמחזיר את נתוני השימוש (Cloud Monitoring API). ', a, '. אחרי דקה-שתיים לחצו שוב "בדיקת השימוש היום".');
                } else msg.textContent = e && /popup-closed|cancelled-popup|user-cancelled/.test(e.code || '') ? 'החלון נסגר לפני האישור. לחצו שוב ואשרו את ההרשאה.'
                    : e && e.code === 'auth/user-mismatch' ? 'יש לבחור בחלון של Google את אותו חשבון שמחובר כאן.'
                    : why === 'scope' ? 'בחלון של Google צריך לסמן את התיבה "View monitoring data" (צפייה בנתוני ניטור) ואז Continue. לחצו שוב.'
                    : e && (e.status === 403 || e.status === 401) ? `Google לא אישר גישה לנתוני השימוש (${e.status}). לחצו שוב ואשרו את ההרשאה, או פתחו את הנתונים ישירות ב-Firebase. פרטים: ${g.replace(/\s+/g, ' ').slice(0, 160)}`
                    : 'לא הצלחנו לקבל את הנתונים כרגע. אפשר לפתוח אותם ישירות ב-Firebase.';
            } finally { btn.disabled = false; }
        });
    }

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
    // registry.js ← Firebase: כרטיס לכל ספק + אינדקס מיילים (ומחיקת מיילים שהוסרו).
    // פרטי מנוי/תמיכה: רק לספק שעוד אין לו — ממולאים פעם אחת מההצעה החתומה שלו (fillFromOffer). אחר כך עורכים בחלון "ניהול".
    // ספק שנמחק לצמיתות (deletedTenants) לא נוצר מחדש.
    let DELETED = [];
    // רשימת הספקים נטענת מחדש בכל סנכרון (בלי זיכרון מטמון של הדפדפן), כדי שספק חדש יופיע מיד
    function freshRegistry(){
        return new Promise(res => { const s = document.createElement('script'); s.src = 'registry.js?v=' + Date.now(); s.onload = s.onerror = () => { s.remove(); res(); }; document.head.appendChild(s); });
    }
    async function sync(){
        const st = $('sync-status'); st.textContent = 'מסנכרן…';
        await freshRegistry();
        try {
            const tomb = await fs.getDocs(fs.collection(db, 'deletedTenants'));
            DELETED = tomb.docs.map(d => ({ id: d.id, ...d.data() }));
            const gone = new Set(DELETED.map(d => d.id));
            const wanted = {};
            let offersP = null;
            const signedOffers = () => offersP || (offersP = fs.getDocs(fs.query(fs.collection(db, 'platformQuotes'), fs.where('status', '==', 'signed'))).then(q => q.docs.map(d => ({ id: d.id, ...d.data() }))));
            // כל הספקים במקביל, וכותבים רק מה שהשתנה (כך הסנכרון מהיר)
            const idxP = fs.getDocs(fs.collection(db, 'vendorIndex'));
            // ספקים שנוצרו מלוח הניהול (לא ב-registry.js): הגישה שלהם נשמרת לפי הכרטיס
            const managed = await fs.getDocs(fs.query(fs.collection(db, 'tenants'), fs.where('managed', 'in', ['admin', 'trial', 'signup'])));
            managed.docs.forEach(d => { if (!gone.has(d.id)) (d.data().admins || []).forEach(e => { wanted[String(e).toLowerCase()] = d.id; }); });
            await Promise.all((window.REGISTRY || []).map(async r => {
                const slug = String(r.slug || '').toLowerCase();
                if (!/^[a-z0-9-]{2,40}$/.test(slug) || gone.has(slug)) return;
                const admins = (r.admins || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
                admins.forEach(e => { wanted[e] = slug; });
                const ref = fs.doc(db, 'tenants', slug), snap = await fs.getDoc(ref);
                const t = snap.exists() ? snap.data() : {};
                if (!snap.exists()) await fs.setDoc(ref, { slug, name: r.name || slug, admins, active: true, createdAt: fs.serverTimestamp() });
                else if (t.name !== (r.name || slug) || JSON.stringify(t.admins || []) !== JSON.stringify(admins)) await fs.updateDoc(ref, { name: r.name || slug, admins });
                if (!t.pricePaid && !t.purchaseDate && !t.agreement) await fillFromOffer(slug, r.offerName || r.name || slug, await signedOffers());
                // ספק קיים בלי רישיון מוגדר: לפי החבילה ותאריך הרכישה (פעם אחת; אחר כך רק הבעלים משנה)
                else if (t.plan && t.purchaseDate && t.lifetime === undefined && t.accessUntil === undefined) await fs.updateDoc(ref, licenseFor(t.plan, Core.parseISO(t.purchaseDate)));
            }));
            const idx = await idxP, have = {};
            await Promise.all(idx.docs.map(d => { have[d.id] = d.data().tenant; return wanted[d.id] !== d.data().tenant ? fs.deleteDoc(d.ref) : null; }));
            await Promise.all(Object.entries(wanted).filter(([email, slug]) => have[email] !== slug).map(([email, slug]) => fs.setDoc(fs.doc(db, 'vendorIndex', email), { tenant: slug })));
            st.textContent = 'מסונכרן ✓';
        } catch(e) { console.error(e); st.textContent = Core.isQuota(e) ? '⚠ ' + Core.QUOTA_MSG : 'הסנכרון נכשל: ' + (e.code || e.message); if (Core.isQuota(e)) QUOTA = true; }
    }

    // רישיון לפי החבילה: מבצע השקה — לכל החיים; כל השאר — שנה (licenseYears) מתאריך הרכישה
    const licenseFor = (plan, day) => Core.licenseOf(plan) === 'lifetime' ? Core.accessFields(fs, true)
        : Core.accessFields(fs, false, Core.toISO(Core.addMonths(day, 12 * (SALES.licenseYears || 1))));
    // ספק חדש: איש קשר, טלפון, חבילה, סכום, תאריך רכישה, תמיכה וההסכם החתום — מההצעה החתומה האחרונה עם אותו שם עסק
    // (name ב-registry, או offerName אם בהצעה נכתב שם אחר)
    const normName = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    async function fillFromOffer(slug, name, offers){
        const o = offers.filter(x => normName(x.vendorName) === normName(name))
            .sort((a, b) => ((b.signedAt && b.signedAt.seconds) || 0) - ((a.signedAt && a.signedAt.seconds) || 0))[0];
        if (!o) return;
        const day = o.signedAt && o.signedAt.toDate ? o.signedAt.toDate() : new Date();
        const months = (Number(o.freeMonths) || 0) + (Number(o.extraMonths) || 0);
        await fs.updateDoc(fs.doc(db, 'tenants', slug), {
            contactName: o.contactName || '', phone: o.phone || '', plan: o.plan || '', pricePaid: Number(o.total) || 0,
            purchaseDate: Core.toISO(day), supportUntil: months ? Core.toISO(Core.addMonths(day, months)) : '',
            ...licenseFor(o.plan, day), updatedAt: fs.serverTimestamp() });
        if (Core.hasPdf(o)) await saveAgreement(slug, await Core.getPdf('platformQuotes/' + o.id, o), { source: 'offer', offerId: o.id, label: `הצעה חתומה · ${o.vendorName || ''}`, signedAt: o.signedAt || null });
    }

    // מייל ההתחברות של הספק: מרשימת הספקים (registry.js), ואם אין — מהכרטיס ב-Firebase
    const loginEmails = t => { const r = (window.REGISTRY || []).find(x => x.slug === t.id); return ((r && r.admins && r.admins.length) ? r.admins : (t.admins || [])).map(e => String(e).toLowerCase()); };

    let VENDORS = [];
    const planLabel = k => k === 'trial' ? 'ניסיון חינם' : (SALES.plans[k] || {}).label || (k ? k : '—');
    const isManaged = t => ['admin', 'trial', 'signup'].includes(t.managed);   // נוצר בלי קובץ באתר (לוח הניהול / ניסיון / הרשמה למנוי)
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
        if (Core.reminderDue(t)) { try { t.reminded = (await fs.getDoc(fs.doc(db, 'tenants', d.id, 'notices', 'support-' + t.supportUntil))).exists(); } catch(e) {} }
        const ld = Core.licenseReminderDue(t);
        if (ld) { try { t.licReminded = (await fs.getDoc(fs.doc(db, 'tenants', d.id, 'notices', ld.id))).exists(); } catch(e) {} }
        t.state = Core.accountState(t);
        t.inRegistry = isManaged(t) || (window.REGISTRY || []).some(r => r.slug === d.id);
        return t;
    }
    const STATE_BADGE = { active: '<span class="badge ok">פעיל</span>', limited: '<span class="badge lim">מוגבל</span>', suspended: '<span class="badge bad">מושהה</span>' };
    function licCell(t){
        const a = Core.accessStatus(t);
        if (a.state === 'pending') return '<div class="sub"><span class="badge warn">ממתין לאישור שלך</span></div>';
        if (a.state === 'trial') return `<div class="sub"><span class="badge warn">ניסיון · נותרו ${esc(a.left)}</span><div class="sub">עד ${esc(Core.fmtDateTime(a.until))}</div></div>`;
        if (a.state === 'trialEnded') return `<div class="sub"><span class="badge bad">הניסיון הסתיים</span><div class="sub">${esc(Core.fmtDateTime(a.until))}</div></div>`;
        return a.state === 'lifetime' ? '<div class="sub"><span class="badge ok">לכל החיים</span></div>'
            : a.state === 'none' ? '<div class="sub"><span class="badge mute">רישיון לא הוגדר</span></div>'
            : `<div class="sub"><span class="badge ${a.state === 'expired' ? 'bad' : a.state === 'expiring' ? 'warn' : 'ok'}">${a.state === 'expired' ? 'הרישיון הסתיים' : 'רישיון עד ' + Core.fmtDate(a.until)}</span>${t.licReminded ? '<div class="sub">✉️ נשלחה תזכורת חידוש</div>' : ''}</div>`;
    }
    function supportCell(s){
        return s.state === 'none' ? '<span class="badge mute">לא הוגדרה</span>'
            : s.state === 'cancelled' ? `<span class="badge bad">בוטלה</span>`
            : s.state === 'expired' ? `<span class="badge bad">הסתיימה</span><div class="sub">${Core.fmtDate(s.until)}</div>`
            : `<span class="badge ${s.state === 'expiring' ? 'warn' : 'ok'}">נותרו ${esc(s.left)}</span><div class="sub">עד ${Core.fmtDate(s.until)}</div>${s.reminded ? '<div class="sub">✉️ נשלחה תזכורת</div>' : ''}`;
    }
    // שבוע אחרון של תמיכה → מייל תזכורת אחד לספק (עם עותק אליך). רץ בכל טעינה של הרשימה, כולל מיד אחרי שמירה בחלון "ניהול"
    async function sendReminders(){
        let sent = false;
        for (const v of VENDORS.filter(v => v.inRegistry && ((!v.reminded && Core.reminderDue(v)) || (!v.licReminded && Core.licenseReminderDue(v))))) {
            const biz = await Core.loadTenant(v.id).then(T => T.business || {}).catch(() => ({}));
            const to = (v.admins || []).concat(biz.email || []), name = biz.name || v.name;
            if (!v.reminded && await Core.supportReminder(v.id, v, to, name)) { v.reminded = true; sent = true; }
            if (!v.licReminded && await Core.licenseReminder(v.id, v, to, name)) { v.licReminded = true; sent = true; }
        }
        return sent;
    }
    let QUOTA = false;
    async function renderVendors(){
        let snap;
        try { snap = await fs.getDocs(fs.collection(db, 'tenants')); }
        catch(e) { $('tbody').innerHTML = `<tr><td colspan="9" class="loading">${esc(Core.isQuota(e) ? Core.QUOTA_MSG : 'טעינת הספקים נכשלה: ' + (e.code || e.message))}</td></tr>`; if (Core.isQuota(e)) QUOTA = true; return; }
        VENDORS = (await Promise.all(snap.docs.map(loadVendor))).sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
        sendReminders().then(sent => { if (sent) renderVendors(); }).catch(() => {});   // ברקע — לא מעכב את הרשימה
        const n = k => VENDORS.filter(k).length, sum = k => VENDORS.reduce((s, v) => s + (Number(v[k]) || 0), 0);
        const kpi = (v, l, s, hl) => `<div class="card kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><div class="n">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        $('kpis').innerHTML =
            kpi(VENDORS.length, 'ספקים', `${n(v => v.state === 'active')} פעילים · ${n(v => v.state === 'limited')} מוגבלים · ${n(v => v.state === 'suspended')} מושהים`) +
            kpi(n(v => v.pending), 'מנוי שנתי · ממתינים לאישור', 'נרשמו לבד, עוד לא אושרו', n(v => v.pending) > 0) +
            kpi(n(v => v.trial && Core.accessStatus(v).state === 'trial'), 'בתקופת ניסיון', `${n(v => v.trial && Core.accessStatus(v).state === 'trialEnded')} סיימו ועוד לא עברו למנוי · ${n(v => v.managed === 'trial' && !v.trial)} עברו למנוי`) +
            kpi(n(v => v.support.state === 'active' || v.support.state === 'expiring'), 'תמיכה פעילה') +
            kpi(n(v => v.support.state === 'expiring'), 'תמיכה מסתיימת', 'בתוך 30 יום') +
            kpi(n(v => v.support.state === 'expired' || v.support.state === 'cancelled'), 'תמיכה שהסתיימה', 'כולל תמיכה שבוטלה') +
            kpi(sum('total'), 'הצעות של ספקים', `${sum('signed')} נחתמו`) +
            kpi(Core.money(sum('pricePaid')), 'סכום מכירות', 'לפי "סכום ששולם"', true);
        renderDeleted();
        if (!VENDORS.length) { $('tbody').innerHTML = '<tr><td colspan="9" class="loading">אין עדיין ספקים</td></tr>'; return; }
        $('tbody').innerHTML = VENDORS.map(t => {
            const cons = t.consent ? `<span class="badge ok">אושרו</span><div class="sub">${t.consent.acceptedAt && t.consent.acceptedAt.toDate ? t.consent.acceptedAt.toDate().toLocaleDateString('he-IL') : ''}</div>`
                : `<span class="badge ${t.oldConsent ? 'warn' : 'mute'}">${t.oldConsent ? 'גרסה קודמת' : 'עדיין לא'}</span>`;
            const agr = t.agreement ? `<button type="button" class="btn sm agr-view" data-id="${esc(t.id)}">צפייה</button><div class="sub">${Core.fmtDate(t.agreement.at)}</div>`
                : '<span class="badge mute">אין</span>';
            return `<tr>
                <td class="vend-cell"><b>${esc(t.name)}</b><span>${[esc(t.contactName || ''), t.phone ? '<span class="ltr">' + esc(t.phone) + '</span>' : ''].filter(Boolean).join(' · ')}</span><span>${loginEmails(t).map(e => '<bdi>' + esc(e) + '</bdi>').join(', ') || 'אין עדיין Gmail להתחברות'}</span>${t.inRegistry ? '' : '<span>⚠ ספק ישן שלא בשימוש · אפשר למחוק ב"ניהול"</span>'}</td>
                <td>${esc(planLabel(t.plan))}<div class="sub">${[t.purchaseDate ? Core.fmtDate(t.purchaseDate) : '', t.pricePaid ? Core.money(t.pricePaid) : ''].filter(Boolean).join(' · ')}</div>${licCell(t)}</td>
                <td>${supportCell({ ...t.support, reminded: t.reminded })}</td>
                <td>${agr}</td>
                <td class="num">${t.total}<div class="sub">${t.signed} נחתמו</div></td>
                <td>${t.lastAt ? t.lastAt.toLocaleDateString('he-IL') : '<span class="sub">—</span>'}</td>
                <td>${cons}</td>
                <td>${STATE_BADGE[t.state]}</td>
                <td><div class="acts">
                    <a class="btn sm primary" href="app.html?t=${encodeURIComponent(t.id)}">כניסה לחשבון</a>
                    <button type="button" class="btn sm edit" data-id="${esc(t.id)}">ניהול</button>
                </div></td></tr>`;
        }).join('');
    }
    // אפשר להסתיר את "ספקים שנמחקו" (נזכר במכשיר); נשאר קישור קטן להצגה
    const hideDel = { get: () => { try { return localStorage.getItem('sb.hideDeleted') === '1'; } catch(e) { return false; } },
                      set: v => { try { localStorage.setItem('sb.hideDeleted', v ? '1' : '0'); } catch(e) {} renderDeleted(); } };
    function renderDeleted(){
        const hidden = hideDel.get();
        $('deleted-card').classList.toggle('hidden', !DELETED.length || hidden);
        $('deleted-show-row').classList.toggle('hidden', !DELETED.length || !hidden);
        $('deleted-count').textContent = DELETED.length;
        $('deleted-list').innerHTML = DELETED.map(d => `<div class="del-row"><div><b>${esc(d.name || d.id)}</b> <span class="sub ltr">${esc(d.id)}</span>${(d.admins || []).length ? `<div class="sub">Gmail: <bdi>${(d.admins || []).map(esc).join(', ')}</bdi></div>` : ''}<div class="sub">נמחק ${d.deletedAt && d.deletedAt.toDate ? d.deletedAt.toDate().toLocaleDateString('he-IL') : ''}${d.quotes ? ` · ${d.quotes} הצעות נמחקו` : ''}</div></div>
            <button type="button" class="btn sm restore" data-id="${esc(d.id)}">שחזור כחשבון ריק</button></div>`).join('');
    }
    $('deleted-hide').addEventListener('click', () => hideDel.set(true));
    $('deleted-show').addEventListener('click', () => hideDel.set(false));
    // שחזור (רק הבעלים): חשבון ריק — בלי ההצעות — עם אותו Gmail, כך שהספק מתחבר שוב לחשבון שלו
    $('deleted-list').addEventListener('click', async e => {
        const b = e.target.closest('button.restore'); if (!b) return;
        const d = DELETED.find(x => x.id === b.dataset.id); if (!d) return;
        const emails = (d.admins || []).map(x => String(x).toLowerCase());
        if (!confirm(`לשחזר את "${d.name || d.id}"? ייווצר חשבון ריק (בלי ההצעות שנמחקו)${emails.length ? ', והספק יוכל להתחבר שוב עם ' + emails.join(', ') : ''}.`)) return;
        b.disabled = true;
        try {
            const inRegistry = (window.REGISTRY || []).some(r => r.slug === d.id);
            const free = [], taken = [];
            for (const em of emails) { const ix = await fs.getDoc(fs.doc(db, 'vendorIndex', em)); (ix.exists() && ix.data().tenant !== d.id ? taken : free).push(em); }
            if (!inRegistry) {
                // ספק שנוצר מלוח הניהול / נרשם לבד: ההגדרות מהגיבוי (ואם אין — הגדרות בסיס לעריכה)
                let cfg = d.config;
                if (!cfg) cfg = JSON.stringify(VendorTemplates.build('other', { name: d.name || d.id, phone: d.phone || '', email: emails[0] || '' }));
                await fs.setDoc(fs.doc(db, 'vendorConfigs', d.id), { config: cfg, updatedAt: fs.serverTimestamp() });
                await fs.setDoc(fs.doc(db, 'tenants', d.id), { slug: d.id, name: d.name || d.id, admins: free, active: true, managed: d.managed && d.managed !== 'trial' && d.managed !== 'signup' ? d.managed : 'admin',
                    plan: d.plan && d.plan !== 'trial' ? d.plan : '', contactName: d.contactName || '', phone: d.phone || '', businessType: d.businessType || '',
                    restoredAt: fs.serverTimestamp(), createdAt: fs.serverTimestamp() });
                await Promise.all(free.map(em => fs.setDoc(fs.doc(db, 'vendorIndex', em), { tenant: d.id })));
            }
            await fs.deleteDoc(fs.doc(db, 'deletedTenants', d.id));
            await sync(); await renderVendors();
            const notes = [];
            if (!inRegistry && !d.config) notes.push('לא נשמר גיבוי של ההגדרות (הספק נמחק לפני שהגיבוי התווסף) — עדכן את המיתוג והמחירון ב"ניהול" ← "הגדרות הספק".');
            if (taken.length) notes.push(`ה-Gmail ${taken.join(', ')} כבר משויך לחשבון אחר, ולכן לא חובר. אפשר לחבר אותו ב"ניהול" ← "הגדרות הספק" אחרי שמוחקים את החשבון האחר.`);
            notes.push('החשבון חזר פעיל. קבע רישיון ותמיכה בחלון "ניהול" של הספק.');
            alert('✓ הספק שוחזר.\n' + notes.join('\n'));
        } catch(err) { console.error(err); alert('השחזור נכשל: ' + (err.code || err.message)); b.disabled = false; }
    });
    $('tbody').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('edit')) return openEdit(b.dataset.id);
        if (b.classList.contains('agr-view')) return viewAgreement(b.dataset.id, b);
    });

    /* ---- PDF ---- */
    function openPdf(b64){
        try { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([a], { type: 'application/pdf' })); const w = window.open(url, '_blank'); if (!w) location.href = url; setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch(err) { alert('פתיחת הקובץ נכשלה.'); }
    }
    const fileToB64 = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const agrRef = id => fs.doc(db, 'tenants', id, 'files', 'agreement');
    const privRef = id => fs.doc(db, 'tenants', id, 'private', 'meta');
    async function viewAgreement(id, btn){
        const old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'פותח…'; }
        try { const s = await fs.getDoc(agrRef(id)); if (s.exists() && s.data().pdfData) openPdf(s.data().pdfData); else alert('לא נמצא קובץ הסכם.'); }
        catch(err) { alert('פתיחת ההסכם נכשלה: ' + (err.code || err.message)); }
        if (btn) { btn.disabled = false; btn.textContent = old; }
    }
    async function saveAgreement(id, pdfData, meta){
        await fs.setDoc(agrRef(id), { pdfData, ...meta, uploadedAt: fs.serverTimestamp() });
        await fs.updateDoc(fs.doc(db, 'tenants', id), { agreement: { at: Core.toISO(new Date()), source: meta.source, label: meta.label || '' } });
    }

    /* ---- חלון ניהול ספק ---- */
    let editing = null, cancelSupport = false, SIGNED_OFFERS = null;
    const stateRadios = () => [...document.querySelectorAll('input[name="e_state"]')];
    function licNow(){
        const life = $('e_lic_life').checked, s = Core.accessStatus(life ? { lifetime: true } : { accessUntil: $('e_lic_until').value });
        $('e_lic_until').disabled = life; $('e_lic_year').disabled = life;
        $('e_lic_now').textContent = s.state === 'none' ? 'לא הוגדר תאריך — אין הגבלת זמן' : s.label + (s.state === 'expired' ? ' · החשבון במצב צפייה בלבד' : s.state === 'expiring' ? ` · נותרו ${s.days} ימים` : '');
        $('e_lic_now').style.color = s.state === 'expired' ? 'var(--bad)' : s.state === 'expiring' ? 'var(--gold)' : s.state === 'none' ? 'var(--muted)' : 'var(--ok)';
    }
    function trialNow(t){
        const a = Core.accessStatus(t);
        if (a.state === 'pending') { $('e_trial_now').textContent = 'נרשם/ה למנוי שנתי בעצמו/ה. החשבון פתוח לצפייה, ושליחת הצעות נפתחת אחרי האישור.'; $('e_trial_now').style.color = 'var(--gold)'; return; }
        $('e_trial_now').textContent = a.state === 'trial' ? `בניסיון · נותרו ${a.left} (עד ${Core.fmtDateTime(a.until)})` : `${a.label} · החשבון במצב צפייה בלבד`;
        $('e_trial_now').style.color = a.state === 'trial' ? 'var(--gold)' : 'var(--bad)';
    }
    function supNow(){
        const fake = { supportUntil: $('e_until').value, supportCancelled: cancelSupport, supportCancelledAt: cancelSupport ? Core.toISO(new Date()) : '' };
        const s = Core.supportStatus(fake);
        $('e_sup_now').textContent = s.state === 'active' || s.state === 'expiring' ? `נותרו ${s.left} · ${s.label}` : s.label;
        $('e_sup_now').style.color = s.state === 'active' ? 'var(--ok)' : s.state === 'none' ? 'var(--muted)' : s.state === 'expiring' ? 'var(--gold)' : 'var(--bad)';
        $('e_cancel_sup').classList.toggle('hidden', s.state === 'cancelled' || s.state === 'none');
    }
    function initEdit(){
        $('e_plan').innerHTML = '<option value="">—</option>' + Object.entries(SALES.plans).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('') + '<option value="trial">ניסיון חינם</option>';
        // תקופת ניסיון: הארכה והמרה למנוי שנתי (נשמר מיד)
        $('e_trial_ext').addEventListener('click', async e => {
            const b = e.target.closest('button'), t = VENDORS.find(v => v.id === editing); if (!b || !t) return;
            const from = Math.max(Date.now(), Core.trialEnd(t).getTime()), until = new Date(from + Number(b.dataset.d) * 864e5);
            b.disabled = true;
            try { await fs.updateDoc(fs.doc(db, 'tenants', editing), { trialEnds: fs.Timestamp.fromDate(until), updatedAt: fs.serverTimestamp() });
                  t.trialEnds = until; trialNow(t); $('e_status').textContent = '✓ הניסיון הוארך עד ' + Core.fmtDateTime(until) + '.'; renderVendors(); }
            catch(err) { $('e_status').textContent = 'ההארכה נכשלה: ' + (err.code || err.message); }
            b.disabled = false;
        });
        // הצעת מחיר מוכנה לספק שנרשם לבד (ניסיון / מנוי שממתין): כל מה שמילא — שם, איש קשר, טלפון, Gmail, תחום, חבילות ומחירים
        $('e_ready_offer').addEventListener('click', async () => {
            const t = VENDORS.find(v => v.id === editing); if (!t) return;
            const b = $('e_ready_offer'); b.disabled = true; b.textContent = 'מכין…';
            let T = {}; try { T = await Core.loadTenant(t.id); } catch(e) {}
            const B = T.business || {}, P = T.pricing || {}, m = Core.money, L = [];
            if (P.MODE === 'items') (P.CATALOG || []).forEach(c => L.push(`${c.label} · ${m(c.price)}${c.desc ? ' · ' + c.desc : ''}`));
            else Object.values(P.SERVICES || {}).forEach(s => L.push(`${s.label} · ${m(s.base)}${s.hours ? ` · ${s.hours} שעות` : ''}${s.extraHour ? ` · שעה נוספת ${m(s.extraHour)}` : ''}`));
            [...(P.GUEST_TIERS || []), ...(P.TRAVEL_TIERS || [])].filter(x => x.price > 0).forEach(x => L.push(`${x.label}: +${m(x.price)}`));
            if (P.ORIGIN && P.ORIGIN.name && P.MODE !== 'items') L.push('יציאה מ' + P.ORIGIN.name);
            L.push(P.MODE === 'items' ? `מקדמה ${P.DEPOSIT_PERCENT || 0}% מהמחיר` : `מקדמה ${m(P.DEPOSIT || 0)}`);
            if (t.pricingInfo) L.push('מה משפיע על המחיר: ' + t.pricingInfo);
            $('o_vendor').value = B.name || t.name || ''; $('o_contact').value = t.contactName || '';
            $('o_phone').value = t.phone || B.phone || ''; $('o_email').value = ((t.admins || [])[0] || '');
            $('o_type').value = t.businessType || ''; $('o_pricing').value = L.join('\n').slice(0, 1500);
            $('o_plan').value = 'regular'; applyPlan();
            OFFER_TENANT = t.id; $('o_for_name').textContent = B.name || t.name; $('o_for').classList.remove('hidden');
            $('o_result').classList.add('hidden');
            b.disabled = false; b.textContent = 'הצעת מחיר מוכנה לספק · מהנתונים שמילא';
            $('edit-dlg').close(); showTab('offer'); renderSummary();
            $('o_vendor').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        $('e_trial_convert').addEventListener('click', async () => {
            const t = VENDORS.find(v => v.id === editing); if (!t) return;
            const price = SALES.plans.regular.price, today = new Date(); today.setHours(0, 0, 0, 0);
            if (!confirm(t.pending ? `לאשר את המנוי השנתי של "${t.name}" (${Core.money(price)}, שנה מהיום)? מיד אחרי האישור הספק יוכל לשלוח הצעות.` : `להמיר את "${t.name}" למנוי שנתי (${Core.money(price)}, שנה מהיום)?`)) return;
            const b = $('e_trial_convert'); b.disabled = true;
            try {
                await fs.updateDoc(fs.doc(db, 'tenants', editing), { trial: false, pending: false, plan: 'regular', pricePaid: price, purchaseDate: Core.toISO(today),
                    ...(t.trial ? { trialEnds: fs.Timestamp.fromDate(Core.trialEnd(t)) } : {}), convertedAt: fs.serverTimestamp(),
                    ...Core.accessFields(fs, false, Core.toISO(Core.addMonths(today, 12 * (SALES.licenseYears || 1)))), updatedAt: fs.serverTimestamp() });
                $('edit-dlg').close(); await renderVendors();
            } catch(err) { $('e_status').textContent = 'ההמרה נכשלה: ' + (err.code || err.message); }
            b.disabled = false;
        });
        $('edit-close').addEventListener('click', () => $('edit-dlg').close());
        $('e_quick').addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const cur = cancelSupport ? null : Core.parseISO($('e_until').value);
            const from = cur && cur >= today ? cur : today;
            cancelSupport = false;
            $('e_until').value = Core.toISO(Core.addMonths(from, +b.dataset.m));
            supNow(); $('e_status').textContent = 'לא נשמר עדיין — לחצו "שמירת השינויים".';
        });
        $('e_until').addEventListener('input', () => { cancelSupport = false; supNow(); });
        [$('e_lic_life'), $('e_lic_date')].forEach(r => r.addEventListener('change', licNow));
        $('e_lic_until').addEventListener('input', () => { $('e_lic_date').checked = true; licNow(); });
        $('e_lic_year').addEventListener('click', () => {   // חידוש: שנה מהיום או מסוף התקופה הנוכחית
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const cur = Core.parseISO($('e_lic_until').value), from = cur && cur >= today ? cur : today;
            $('e_lic_date').checked = true; $('e_lic_until').value = Core.toISO(Core.addMonths(from, 12)); licNow();
            $('e_status').textContent = 'לא נשמר עדיין — לחצו "שמירת השינויים".';
        });
        $('e_cancel_sup').addEventListener('click', () => {
            if (!confirm('לבטל את התמיכה הטכנית של הספק? הספק יראה בחשבון שהתמיכה בוטלה.')) return;
            cancelSupport = true; $('e_until').value = ''; supNow();
            $('e_status').textContent = 'התמיכה תבוטל בשמירה — לחצו "שמירת השינויים".';
        });
        $('edit-form').addEventListener('submit', async e => {
            e.preventDefault();
            if (!editing) return;
            const btn = $('e_save'); btn.disabled = true; btn.textContent = 'שומר…';
            const state = (stateRadios().find(r => r.checked) || {}).value || 'active';
            const data = { contactName: $('e_contact').value.trim(), phone: $('e_phone').value.trim(), plan: $('e_plan').value,
                pricePaid: Number($('e_paid').value) || 0, purchaseDate: $('e_purchase').value || '', supportUntil: cancelSupport ? '' : ($('e_until').value || ''),
                supportCancelled: cancelSupport, supportCancelledAt: cancelSupport ? Core.toISO(new Date()) : '',
                active: state !== 'suspended', limited: state === 'limited',
                ...Core.accessFields(fs, $('e_lic_life').checked, $('e_lic_until').value),
                notes: fs.deleteField(), updatedAt: fs.serverTimestamp() };   // ההערות הפנימיות נשמרות בנפרד (הספק לא רואה)
            const t = VENDORS.find(v => v.id === editing);
            if (t && t.supportCancelled && cancelSupport) data.supportCancelledAt = t.supportCancelledAt || data.supportCancelledAt;
            if (state === 'suspended' && t && t.state !== 'suspended' && !confirm('להשהות את הספק? הכניסה שלו תיחסם מיד.')) { btn.disabled = false; btn.textContent = 'שמירת השינויים'; return; }
            try {
                // הערות פנימיות — במסמך שרק הבעלים רואה. אם הכללים עוד לא עודכנו, נשארות בכרטיס כמו קודם
                try { await fs.setDoc(privRef(editing), { notes: $('e_notes').value.trim(), updatedAt: fs.serverTimestamp() }, { merge: true }); }
                catch(e1) { data.notes = $('e_notes').value.trim(); }
                await fs.updateDoc(fs.doc(db, 'tenants', editing), data); $('edit-dlg').close(); await renderVendors();
            }
            catch(err) { $('e_status').textContent = 'השמירה נכשלה: ' + (err.code || err.message); }
            btn.disabled = false; btn.textContent = 'שמירת השינויים';
        });

        // הסכם חתום
        $('e_agr_view').addEventListener('click', () => viewAgreement(editing, $('e_agr_view')));
        $('e_agr_upload').addEventListener('click', () => $('e_agr_file').click());
        $('e_agr_file').addEventListener('change', async e => {
            const file = e.target.files[0]; e.target.value = '';
            if (!file || !editing) return;
            if (file.type !== 'application/pdf') { alert('אפשר להעלות רק קובץ PDF.'); return; }
            if (file.size > 700 * 1024) { alert('הקובץ גדול מדי (עד כ-700KB). אפשר לכווץ אותו באתר כמו ilovepdf.'); return; }
            const t = VENDORS.find(v => v.id === editing);
            if (t && t.agreement && !confirm('להחליף את ההסכם הקיים בקובץ החדש?')) return;
            $('e_agr_status').textContent = 'מעלה…';
            try { await saveAgreement(editing, await fileToB64(file), { source: 'upload', label: file.name.slice(0, 120) }); await refreshAgreement(); renderVendors(); }
            catch(err) { $('e_agr_status').textContent = 'ההעלאה נכשלה: ' + (err.code || err.message); }
        });
        $('e_agr_attach').addEventListener('click', async () => {
            const o = (SIGNED_OFFERS || []).find(x => x.id === $('e_agr_from').value); if (!o || !editing) return;
            const t = VENDORS.find(v => v.id === editing);
            if (t && t.agreement && !confirm('להחליף את ההסכם הקיים בהסכם מההצעה החתומה?')) return;
            $('e_agr_status').textContent = 'משייך…';
            try { await saveAgreement(editing, await Core.getPdf('platformQuotes/' + o.id, o), { source: 'offer', offerId: o.id, label: `הצעה חתומה · ${o.vendorName || ''}`, signedAt: o.signedAt || null }); await refreshAgreement(); renderVendors(); }
            catch(err) { $('e_agr_status').textContent = 'השיוך נכשל: ' + (err.code || err.message); }
        });

        // הגדרות של ספק שנוצר מלוח הניהול (מחירון, חבילות, מיתוג, תנאים)
        $('e_cfg').addEventListener('click', () => {
            const t = VENDORS.find(v => v.id === editing); if (!t) return;
            $('edit-dlg').close();
            VendorEditor.open({ slug: editing, refOffer: (OFFERS || []).find(o => o.id === t.offerId) });
        });

        // מחיקה לצמיתות
        $('e_del_confirm').addEventListener('input', () => { $('e_delete').disabled = $('e_del_confirm').value.trim().toLowerCase() !== editing; });
        $('e_delete').addEventListener('click', () => deleteVendor(editing));
    }
    async function refreshAgreement(){
        const id = editing, st = $('e_agr_status');
        try {
            const s = await fs.getDoc(agrRef(id));
            if (id !== editing) return;
            const has = s.exists() && s.data().pdfData;
            $('e_agr_view').classList.toggle('hidden', !has);
            $('e_agr_upload').textContent = has ? 'החלפה בקובץ PDF אחר' : 'העלאת PDF';
            const d = has ? s.data() : null;
            st.textContent = has ? `✓ יש הסכם חתום${d.label ? ' · ' + d.label : ''}${d.uploadedAt && d.uploadedAt.toDate ? ' · עודכן ' + d.uploadedAt.toDate().toLocaleDateString('he-IL') : ''}. הספק רואה אותו בחשבון שלו.` : 'עדיין אין הסכם חתום בכרטיס של הספק.';
        } catch(err) { st.textContent = 'לא ניתן לטעון את ההסכם (' + (err.code || err.message) + ').'; }
        try {
            if (!SIGNED_OFFERS) {
                const q = await fs.getDocs(fs.query(fs.collection(db, 'platformQuotes'), fs.where('status', '==', 'signed')));
                SIGNED_OFFERS = q.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => Core.hasPdf(o));
            }
            const t = VENDORS.find(v => v.id === id) || {};
            const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
            $('e_agr_from_wrap').classList.toggle('hidden', !SIGNED_OFFERS.length);
            $('e_agr_from').innerHTML = SIGNED_OFFERS.map(o => `<option value="${esc(o.id)}"${norm(o.vendorName) === norm(t.name) ? ' selected' : ''}>${esc(o.vendorName || '—')}${o.contactName ? ' · ' + esc(o.contactName) : ''} · ${fmtTs(o.signedAt)}</option>`).join('');
        } catch(err) { $('e_agr_from_wrap').classList.add('hidden'); }
    }
    function openEdit(id){
        const t = VENDORS.find(v => v.id === id); if (!t) return;
        editing = id; cancelSupport = !!t.supportCancelled;
        $('edit-title').textContent = 'ניהול ספק · ' + t.name;
        stateRadios().forEach(r => { r.checked = r.value === t.state; });
        $('e_contact').value = t.contactName || ''; $('e_phone').value = t.phone || ''; $('e_plan').value = t.plan || '';
        $('e_paid').value = t.pricePaid || ''; $('e_purchase').value = t.purchaseDate || ''; $('e_until').value = t.supportUntil || '';
        $('e_notes').value = t.notes || ''; $('e_status').textContent = '';
        fs.getDoc(privRef(id)).then(s => { if (editing === id && s.exists() && s.data().notes != null) $('e_notes').value = s.data().notes; }).catch(() => {});
        $('e_del_slug').textContent = id; $('e_del_confirm').value = ''; $('e_delete').disabled = true;
        $('e_lic_life').checked = !!t.lifetime; $('e_lic_date').checked = !t.lifetime; $('e_lic_until').value = t.accessUntil || ''; licNow();
        $('e_cfg_box').classList.toggle('hidden', !isManaged(t));
        const tp = !!(t.trial || t.pending);
        $('e_trial_box').classList.toggle('hidden', !tp); $('e_lic_box').classList.toggle('hidden', tp);
        $('e_trial_legend').textContent = t.pending ? 'מנוי שנתי · ממתין לאישור' : 'תקופת ניסיון חינם';
        $('e_trial_extwrap').classList.toggle('hidden', !t.trial);
        $('e_trial_convert').textContent = t.pending ? 'אישור המנוי (שולם) · שנה מהיום' : 'המרה למנוי שנתי · שנה מהיום';
        if (tp) trialNow(t);
        $('e_pinfo').textContent = t.pricingInfo ? 'מה משפיע על המחיר (מההרשמה): ' + t.pricingInfo : '';
        $('e_agr_view').classList.add('hidden'); $('e_agr_status').textContent = 'טוען…';
        supNow();
        $('edit-dlg').showModal();
        refreshAgreement();
    }

    // מחיקה לצמיתות: קודם רשומת "נמחק" (כדי שהסנכרון לא ייצור אותו מחדש), ואז כל הנתונים
    async function deleteAll(colRef){
        const snap = await fs.getDocs(colRef);
        for (let i = 0; i < snap.docs.length; i += 400) {
            const b = fs.writeBatch(db);
            snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
            await b.commit();
        }
        return snap.size;
    }
    async function deleteVendor(id){
        const t = VENDORS.find(v => v.id === id); if (!t || $('e_del_confirm').value.trim().toLowerCase() !== id) return;
        if (!confirm(`מחיקה לצמיתות של "${t.name}" וכל הנתונים שלו. אי אפשר לבטל. להמשיך?`)) return;
        const btn = $('e_delete'); btn.disabled = true; btn.textContent = 'מוחק…';
        try {
            // גיבוי לשחזור (רק הבעלים): המיילים, פרטי הקשר וההגדרות (מיתוג, מחירון, תנאים) — בלי ההצעות
            let cfg = '';
            if (isManaged(t)) { try { const c = await fs.getDoc(fs.doc(db, 'vendorConfigs', id)); cfg = c.exists() ? c.data().config || '' : ''; } catch(e) {} }
            await fs.setDoc(fs.doc(db, 'deletedTenants', id), { name: t.name || id, admins: t.admins || [], quotes: Number(t.total) || 0, deletedAt: fs.serverTimestamp(),
                managed: t.managed || '', plan: t.plan || '', contactName: t.contactName || '', phone: t.phone || '', businessType: t.businessType || '', config: cfg });
            // ה-Gmail משתחרר: מעכשיו הוא נרשם כמו לקוח חדש (רישום ההרשמה הקודם נמחק)
            await Promise.all((t.admins || []).map(e => fs.deleteDoc(fs.doc(db, 'trials', String(e).toLowerCase())).catch(() => {})));
            const qs = await fs.getDocs(fs.collection(db, 'tenants', id, 'quotes'));
            await Promise.all(qs.docs.map(d => Core.deletePdf(`tenants/${id}/quotes/${d.id}`)));
            await deleteAll(fs.collection(db, 'tenants', id, 'quotes'));
            await deleteAll(fs.collection(db, 'tenants', id, 'consents'));
            await deleteAll(fs.collection(db, 'tenants', id, 'files'));
            await deleteAll(fs.collection(db, 'tenants', id, 'private')).catch(() => {});
            await deleteAll(fs.collection(db, 'tenants', id, 'notices')).catch(() => {});
            await deleteAll(fs.collection(db, 'tenants', id, 'packages')).catch(() => {});
            await deleteAll(fs.query(fs.collection(db, 'vendorIndex'), fs.where('tenant', '==', id)));
            await deleteAll(fs.query(fs.collection(db, 'shortLinks'), fs.where('tenant', '==', id))).catch(() => {});
            if (isManaged(t)) {
                await fs.deleteDoc(fs.doc(db, 'vendorConfigs', id)).catch(() => {});
                if (t.offerId) await fs.updateDoc(fs.doc(db, 'platformQuotes', t.offerId), { tenant: fs.deleteField() }).catch(() => {});
            }
            await fs.deleteDoc(fs.doc(db, 'tenants', id));
            $('edit-dlg').close();
            await sync(); await renderVendors();
        } catch(err) { console.error(err); $('e_status').textContent = 'המחיקה לא הושלמה: ' + (err.code || err.message) + '. נסו שוב.'; }
        btn.textContent = 'מחיקה לצמיתות';
    }

    /* ================= הצעת מחיר לספק ================= */
    const num = id => Number($(id).value) || 0;
    function offerCalc(){
        const plan = SALES.plans[$('o_plan').value] || SALES.plans.regular;
        const price = num('o_price'), free = num('o_free');
        const extra = $('o_support_on').checked ? num('o_months') : 0, monthly = $('o_support_on').checked ? num('o_monthly') : 0;
        const supportCost = extra * monthly, discount = Math.min(num('o_discount'), price + supportCost);
        const total = Math.max(0, price + supportCost - discount), deposit = Math.min(num('o_deposit'), total);
        return { plan, planKey: $('o_plan').value, price, listPrice: plan.listPrice || price, free, extra, monthly, supportCost, discount,
                 total, deposit, months: free + extra };
    }
    const licNote = k => (Core.licenseOf(k) === 'lifetime' ? 'רישיון שימוש לכל החיים*.' : `רישיון שימוש לשנה מהחתימה*. אחר כך חידוש ב-${Core.money(SALES.renewalYearly || 400)} לשנה (בלי תמיכה).`) + `<br><small>* ${esc(SALES.licenseNote || '')}</small>`;
    function renderSummary(){
        const o = offerCalc(), r = (k, v, cls) => `<div class="row ${cls || ''}"><span>${k}</span><span>${v}</span></div>`;
        let h = r(`מערכת · ${esc(o.plan.label)}`, Core.money(o.price));
        if (o.listPrice > o.price) h += r('מחיר רגיל', `<s>${Core.money(o.listPrice)}</s>`);
        if (o.free) h += r(`תמיכה טכנית · ${o.free} חודשים כלולים`, 'ללא עלות', 'minus');
        if (o.extra) h += r(`תמיכה טכנית · ${o.extra} חודשים × ${Core.money(o.monthly)}`, Core.money(o.supportCost));
        if (o.discount) h += r('הנחה', '−' + Core.money(o.discount), 'minus');
        h += `<div class="total"><span>סה"כ לתשלום</span><b>${Core.money(o.total)}</b></div>`;
        if (o.deposit) h += r('מקדמה בחתימה', Core.money(o.deposit)) + r('יתרה', Core.money(o.total - o.deposit));
        h += `<p class="note">${licNote(o.planKey)} ${o.months ? `סה"כ ${o.months} חודשי תמיכה טכנית ממועד מסירת המערכת.` : 'ללא תמיכה טכנית חודשית.'}</p>`;
        $('o_summary').innerHTML = h;
    }
    function applyPlan(){
        const p = SALES.plans[$('o_plan').value];
        if (!p) return;
        if ($('o_plan').value !== 'custom') { $('o_price').value = p.price; $('o_free').value = p.freeSupportMonths; $('o_deposit').value = p.price > 500 ? 500 : 0; }   // מנוי שנתי — בלי מקדמה, תשלום מלא
        renderSummary();
    }
    function initOfferForm(){
        $('o_plan').innerHTML = Object.entries(SALES.plans).map(([k, p]) => `<option value="${k}">${esc(p.label)}${p.price ? ' · ' + Core.money(p.price) : ''}${p.freeSupportMonths ? ` · כולל ${p.freeSupportMonths} חודשי תמיכה` : ''}</option>`).join('');
        $('o_monthly').value = SALES.supportMonthly;
        $('o_plan').addEventListener('change', applyPlan);
        $('o_support_on').addEventListener('change', () => { $('o_support_box').hidden = !$('o_support_on').checked; renderSummary(); });
        $('o_quick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('o_months').value = b.dataset.m; renderSummary(); });
        ['o_price', 'o_free', 'o_months', 'o_monthly', 'o_discount', 'o_deposit'].forEach(id => $(id).addEventListener('input', renderSummary));
        applyPlan();
        $('offer-form').addEventListener('submit', createOffer);
        $('o_for_clear').addEventListener('click', () => { OFFER_TENANT = ''; $('o_for').classList.add('hidden'); $('offer-form').reset(); applyPlan(); renderSummary(); });
        $('o_copy').addEventListener('click', () => copyText($('o_url').value, $('o_copy')));
    }
    let OFFER_TENANT = '';   // הצעה מוכנה לספק שכבר יש לו חשבון (נרשם לבד) — ההצעה משויכת אליו, ואין "יצירת משתמש"
    const genId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const clean = Core.clean;
    function offerUrl(q){
        const raw = [q.id, clean(q.vendorName), clean(q.contactName), clean(q.businessType), q.plan, q.price, q.freeMonths, q.extraMonths, q.monthly,
            q.discount, q.total, clean(q.notes), q.validDays, q.createdISO, clean(q.phone), q.listPrice,
            clean(q.email), q.deposit, clean(q.pricingInfo)].join('|');   // 17–19: Gmail, מקדמה, מה משפיע על המחיר
        return new URL('../offer/', location.href).href + '?q=' + Core.b64UrlEncode(raw);
    }
    async function createOffer(e){
        e.preventDefault();
        const o = offerCalc(), btn = $('o_gen');
        const q = { id: genId(), vendorName: $('o_vendor').value.trim(), contactName: $('o_contact').value.trim(), phone: $('o_phone').value.trim(),
            businessType: $('o_type').value.trim(), plan: o.planKey, planLabel: o.plan.label, price: o.price, listPrice: o.listPrice, freeMonths: o.free,
            extraMonths: o.extra, monthly: o.monthly, discount: o.discount, total: o.total, notes: $('o_notes').value.trim(),
            validDays: num('o_valid') || 14, createdISO: Core.toISO(new Date()),
            email: $('o_email').value.trim().toLowerCase(), deposit: o.deposit, pricingInfo: $('o_pricing').value.trim(), ...(OFFER_TENANT ? { tenant: OFFER_TENANT } : {}) };
        btn.disabled = true; btn.textContent = 'שומר…';
        try {
            const { id, ...data } = q;
            await fs.setDoc(fs.doc(db, 'platformQuotes', id), { ...data, status: 'pending', createdAt: fs.serverTimestamp() });
        } catch(err) { alert('השמירה נכשלה: ' + (err.code || err.message)); btn.disabled = false; btn.textContent = 'יצירת קישור להצעה'; return; }
        // קישור קצר (/offer/?k=…); אם נכשל — הקישור הארוך. וואטסאפ נפתח ישר לטלפון של הספק (אם הוזן)
        let url = offerUrl(q);
        try {
            const s = await Core.makeShortLink('offer', '', url);
            if (s.id) { url = s.url; await fs.updateDoc(fs.doc(db, 'platformQuotes', q.id), { shortId: s.id }).catch(() => {}); }
        } catch(err) { console.warn('short link failed', err); }
        OFFER_TENANT = ''; $('o_for').classList.add('hidden');
        $('o_url').value = url; $('o_preview').href = url; $('o_wa_preview').href = url; $('o_wa_url').textContent = url;
        Core.bindWhatsApp($('o_wa'), url, q.phone);
        $('o_result').classList.remove('hidden'); $('o_result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        btn.disabled = false; btn.textContent = 'יצירת קישור להצעה';
    }

    /* העברה חד-פעמית של PDF ישנים מתוך ההצעות של כל הספקים למסמך נפרד — רק מכאן (הבעלים), ברקע, קובץ אחד בכל פעם.
       כך הטלפון של הספק לא מעלה קבצים, ולוח הבקרה שלו נטען מהר. אחרי שהועברו — אין מה להעביר והבדיקה קלה. */
    // אחרי שבדיקה מלאה לא מצאה אף קובץ ישן — לא בודקים שוב במכשיר הזה (חוסך קריאות ממכסת Firebase בכל כניסה).
    // חתימות חדשות כבר נשמרות במסמך הנפרד, כך שקבצים ישנים לא נוצרים מחדש.
    const MIGRATED_KEY = 'sb.pdfMigrated.v1';
    async function migrateVendorPdfs(){
        try { if (localStorage.getItem(MIGRATED_KEY)) return; } catch(e) {}
        let found = 0, failed = false;
        for (const v of VENDORS) {
            try {
                const qs = await fs.getDocs(fs.query(fs.collection(db, 'tenants', v.id, 'quotes'), fs.where('status', '==', 'signed')));
                const jobs = qs.docs.filter(d => d.data().pdfData).map(d => Core.migratePdf(`tenants/${v.id}/quotes/${d.id}`, d.data()));
                found += jobs.length;
                if (jobs.length && (await Promise.all(jobs)).some(ok => !ok)) failed = true;
            } catch(e) { console.warn(e); failed = true; }
        }
        if (!found && !failed) { try { localStorage.setItem(MIGRATED_KEY, new Date().toISOString()); } catch(e) {} }
    }

    /* ================= הצעות שנשלחו ================= */
    let OFFERS = [];
    function startOffers(){
        fs.onSnapshot(fs.query(fs.collection(db, 'platformQuotes'), fs.orderBy('createdAt', 'desc')), snap => {
            OFFERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // העברה חד-פעמית של PDF ישן מתוך ההצעה למסמך נפרד (כך הרשימה לא מורידה את כל הקבצים בכל טעינה)
            OFFERS.filter(o => o.pdfData).forEach(o => Core.migratePdf('platformQuotes/' + o.id, o));
            renderOffers();
        }, err => { console.error(err); $('otbody').innerHTML = '<tr><td colspan="8" class="loading">שגיאת הרשאות</td></tr>'; });
    }
    // מבצע ההשקה: מוגבל ל-limit חתימות. נספר רק מה שנחתם, ונשמר ב-public/promo (האתר ודף ההצעה קוראים משם)
    let PROMO = null;
    function updatePromo(){
        const L = SALES.plans.launch, limit = (L && L.limit) || 0; if (!limit) return;
        const used = OFFERS.filter(o => o.status === 'signed' && o.plan === 'launch').length;
        const promo = { launchLimit: limit, launchSigned: Math.min(used, limit), soldOut: used >= limit };
        const opt = $('o_plan').querySelector('option[value="launch"]');
        if (opt) {
            opt.disabled = promo.soldOut;
            opt.textContent = `${L.label} · ${Core.money(L.price)} · ` + (promo.soldOut ? 'המבצע נגמר' : `נשארו ${limit - promo.launchSigned} מתוך ${limit}`);
        }
        if (promo.soldOut && $('o_plan').value === 'launch') { $('o_plan').value = 'regular'; applyPlan(); }
        $('o_promo').textContent = promo.soldOut ? `מבצע ההשקה נגמר: ${limit} מתוך ${limit} חתמו. באתר מופיע "נגמר המבצע".`
            : `מבצע ההשקה: ${promo.launchSigned} מתוך ${limit} חתמו. נספר רק אחרי חתימה.`;
        if (PROMO && PROMO.launchSigned === promo.launchSigned && PROMO.soldOut === promo.soldOut) return;
        PROMO = promo;
        fs.setDoc(fs.doc(db, 'public', 'promo'), { ...promo, updatedAt: fs.serverTimestamp() }).catch(err => console.warn('promo save failed', err));
    }
    function renderOffers(){
        updatePromo();
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
            <td>${o.status === 'signed' ? `<span class="badge ok">נחתמה</span><div class="sub">${fmtTs(o.signedAt)}${o.signerName ? ' · ' + esc(o.signerName) : ''}</div>${Core.signedMismatch(o, 'offer') ? '<div class="sub" style="color:#B91C1C;font-weight:700">⚠ נחתמה על פרטים שונים מההצעה ששלחת</div>' : ''}` : '<span class="badge warn">ממתינה</span>'}</td>
            <td>${Core.hasPdf(o) ? `<button type="button" class="btn sm view" data-id="${o.id}">צפייה</button>` : '<span class="sub">—</span>'}</td>
            <td><div class="acts"><button type="button" class="btn sm copy" data-id="${o.id}">העתק קישור</button>
                ${o.status === 'signed' ? (o.tenant ? `<button type="button" class="btn sm vc-edit" data-id="${o.id}">הגדרות הספק</button><span class="badge ok">המשתמש נוצר</span>`
                    : `<button type="button" class="btn sm primary vc-new" data-id="${o.id}">יצירת משתמש</button>`) + `<button type="button" class="btn sm setup" data-id="${o.id}">סיכום להקמה</button>` : ''}
                <button type="button" class="btn sm danger del" data-id="${o.id}">מחיקה</button></div></td></tr>`).join('');
    }
    $('otbody').addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        const o = OFFERS.find(x => x.id === b.dataset.id); if (!o) return;
        if (b.classList.contains('copy')) copyText(Core.shortUrl(offerUrl(o), o.shortId), b);
        else if (b.classList.contains('vc-new')) {
            if (Core.signedMismatch(o, 'offer') && !confirm('ההצעה נחתמה על פרטים שונים ממה ששלחת. ליצור משתמש בכל זאת?')) return;
            VendorEditor.open({ offer: o });
        }
        else if (b.classList.contains('vc-edit')) VendorEditor.open({ slug: o.tenant, refOffer: o });
        else if (b.classList.contains('setup')) {
            const s = (o.freeMonths || 0) + (o.extraMonths || 0);
            copyText(`ספק חדש להקמה:\nעסק: ${o.vendorName}\nאיש קשר: ${o.contactName}${o.phone ? ' · ' + o.phone : ''}\nGmail להתחברות: ${o.email || '—'}\nתחום: ${o.businessType || '—'}\nחבילה: ${o.planLabel || o.plan} · סה"כ: ${o.total} ₪${o.deposit ? ` · מקדמה: ${o.deposit} ₪` : ''}\nתמיכה: ${s} חודשים\nנחתם: ${fmtTs(o.signedAt)}${o.signerName ? ' · על ידי ' + o.signerName : ''}${Core.signedMismatch(o, 'offer') ? '\n⚠ נחתמה על פרטים שונים מההצעה שנשלחה — לבדוק לפני הקמה' : ''}${o.pricingInfo ? `\nמה משפיע על המחיר ללקוחות:\n${o.pricingInfo}` : ''}`, b);
        } else if (b.classList.contains('del')) {
            if (!confirm(`למחוק את ההצעה ל-${o.vendorName}? לא ניתן לשחזר.`)) return;
            b.disabled = true;
            try { await Core.deletePdf('platformQuotes/' + o.id); await fs.deleteDoc(fs.doc(db, 'platformQuotes', o.id)); Core.deleteShortLink(o.shortId); } catch(err) { alert('המחיקה נכשלה.'); b.disabled = false; }
        } else if (b.classList.contains('view')) {
            Core.openPdf('platformQuotes/' + o.id, o);
        }
    });

    function copyText(t, btn){
        const old = btn.textContent, done = () => { btn.textContent = 'הועתק ✓'; setTimeout(() => btn.textContent = old, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => prompt('העתיקו:', t));
        else prompt('העתיקו:', t);
    }
})();
