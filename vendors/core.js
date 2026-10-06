/* מערכת הספקים — פונקציות משותפות: Firebase, התחברות, עזרים. */
(function(){
    const PF = window.PLATFORM;
    const V = '10.12.0';
    let fbPromise = null;

    function fb(){
        if (fbPromise) return fbPromise;
        fbPromise = (async () => {
            const [{ initializeApp }, authMod, fs] = await Promise.all([
                import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
                import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
                import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
            ]);
            const app = initializeApp(PF.firebase);
            const auth = authMod.getAuth(app);
            const db = fs.getFirestore(app, PF.firestoreDatabaseId || '(default)');
            if (window.__EMU__) {                       // בדיקות מקומיות בלבד
                fs.connectFirestoreEmulator(db, '127.0.0.1', window.__EMU__.firestore);
                authMod.connectAuthEmulator(auth, 'http://127.0.0.1:' + window.__EMU__.auth, { disableWarnings: true });
                window.__fb = { auth, authMod };
            }
            try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch(e){}
            return { app, auth, authMod, db, fs };
        })();
        return fbPromise;
    }

    const isOwner = user => !!user && (user.email || '').toLowerCase() === PF.ownerEmail.toLowerCase();

    async function signIn(){
        const f = await fb();
        return f.authMod.signInWithPopup(f.auth, new f.authMod.GoogleAuthProvider());
    }
    async function signOut(){ const f = await fb(); await f.authMod.signOut(f.auth); location.href = './'; }

    // קורא ל-cb(user) בכל שינוי התחברות (user=null כשלא מחובר)
    async function onAuth(cb){
        const f = await fb();
        f.authMod.onAuthStateChanged(f.auth, cb);
    }

    // לאיזה ספק שייך המשתמש (לפי vendorIndex/{email})
    async function tenantOf(user){
        const f = await fb();
        try {
            const snap = await f.fs.getDoc(f.fs.doc(f.db, 'vendorIndex', (user.email || '').toLowerCase()));
            return snap.exists() ? snap.data().tenant : null;
        } catch(e){ return null; }
    }

    function loadScript(src){
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed: ' + src));
            document.head.appendChild(s);
        });
    }
    // טוען את config.js של הספק מאתר הלקוחות (שם נמצאים המיתוג, המחירון והתנאים)
    async function loadTenant(slug){
        if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error('bad slug');
        window.TENANT = null;
        await loadScript(`${PF.customerBase}/${slug}/config.js?v=${Date.now()}`);
        if (!window.TENANT || window.TENANT.slug !== slug) throw new Error('tenant config missing');
        return window.TENANT;
    }

    function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
    function b64UrlEncode(str){
        const bytes = new TextEncoder().encode(str);
        let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    const money = n => '₪' + (Number(n) || 0).toLocaleString();
    const clean = s => String(s == null ? '' : s).replace(/\|/g, '/');

    // הקישור ללקוח — סדר השדות קבוע וזהה ל-quote.js באתר הלקוחות
    function shareUrl(slug, q){
        const raw = [clean(q.clientName), clean(q.eventType), clean(q.location), clean(q.date), clean(q.startTime), clean(q.endTime),
            q.guests || '', q.price || 0, q.deposit || 0, clean(q.notes), q.id, q.service || ''].join('|');
        return `${PF.customerBase}/${slug}/?q=${b64UrlEncode(raw)}`;
    }

    const GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C39.9 37.1 44 31.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>';

    /* ---- תאריכים ותמיכה ---- */
    const pad = n => String(n).padStart(2, '0');
    function parseISO(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
    function toISO(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fmtDate(d){ d = typeof d === 'string' ? parseISO(d) : d; return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; }
    function addMonths(d, n){ const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (r.getDate() !== d.getDate()) r.setDate(0); return r; }
    // מצב התמיכה הטכנית של ספק לפי tenants/{slug}.supportUntil (YYYY-MM-DD, כולל היום הזה)
    function supportStatus(t){
        const until = parseISO(t && t.supportUntil);
        if (!until) return { state: 'none', label: 'לא הוגדרה תמיכה טכנית' };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = Math.round((until - today) / 86400000);
        if (days < 0) return { state: 'expired', until, days, label: 'התמיכה הטכנית הסתיימה ב-' + fmtDate(until) };
        let months = (until.getFullYear() - today.getFullYear()) * 12 + (until.getMonth() - today.getMonth());
        if (until.getDate() < today.getDate()) months--;
        const left = months >= 1 ? (months === 1 ? 'חודש' : months === 2 ? 'חודשיים' : months + ' חודשים') : (days === 0 ? 'היום האחרון' : days === 1 ? 'יום אחד' : days + ' ימים');
        return { state: days <= 30 ? 'expiring' : 'active', until, days, months: Math.max(0, months), left, label: 'פעילה עד ' + fmtDate(until) };
    }

    window.Core = { fb, isOwner, parseISO, toISO, fmtDate, addMonths, supportStatus, signIn, signOut, onAuth, tenantOf, loadTenant, esc, b64UrlEncode, money, clean, shareUrl, GOOGLE_SVG, PF };
})();
