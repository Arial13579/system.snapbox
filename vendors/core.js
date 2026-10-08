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

    // התחברות עם Google. תמיד מציג את בורר החשבונות של Google (אחרת Google בוחר לבד את החשבון האחרון
    // ואי אפשר לעבור לחשבון אחר). hint = המייל שנזכר במכשיר, כדי שיופיע ראשון.
    const LAST_KEY = 'sb.lastEmail';
    function rememberEmail(email){ try { localStorage.setItem(LAST_KEY, String(email || '').toLowerCase()); } catch(e){} }
    function rememberedEmail(){ try { return localStorage.getItem(LAST_KEY) || ''; } catch(e){ return ''; } }
    function forgetEmail(){ try { localStorage.removeItem(LAST_KEY); } catch(e){} }
    async function signIn(hint){
        const f = await fb();
        const provider = new f.authMod.GoogleAuthProvider();
        const params = { prompt: 'select_account' };
        if (hint) params.login_hint = hint;
        provider.setCustomParameters(params);
        if (window.__EMU__) window.__lastAuthParams = provider.getCustomParameters();   // בדיקות מקומיות בלבד
        try { return await f.authMod.signInWithPopup(f.auth, provider); }
        catch(e) {
            // חלון קופץ חסום (נפוץ בטלפונים) — מעבר לכניסה באותו חלון
            if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return f.authMod.signInWithRedirect(f.auth, provider);
            throw e;
        }
    }
    async function signOut(){ const f = await fb(); await f.authMod.signOut(f.auth); location.href = './'; }
    // ניתוק בלי מעבר דף — לחשבון שאינו רשום, כדי שהמכשיר לא "יזכור" אותו
    async function signOutQuiet(){ const f = await fb(); await f.authMod.signOut(f.auth); }
    // דפדפן פנימי של וואטסאפ / אינסטגרם / פייסבוק — Google חוסם בו התחברות
    const inAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent || '');

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

    // מצב הגישה של משתמש: { slug, state: 'ok' | 'suspended' | 'none' }. ספק מושהה לא יכול לקרוא את כרטיס הספק (נאכף בשרת).
    async function vendorAccess(user){
        const slug = await tenantOf(user);
        if (!slug) return { slug: null, state: 'none' };
        const f = await fb();
        try { const snap = await f.fs.getDoc(f.fs.doc(f.db, 'tenants', slug)); return { slug, state: snap.exists() ? 'ok' : 'none', data: snap.exists() ? snap.data() : null }; }
        catch(e) { return { slug, state: 'suspended' }; }
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
    function b64UrlDecode(str){
        str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '=';
        const bin = atob(str), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    /* האם מה שנחתם (signedQ = הפרטים בדיוק כפי שהוצגו לחותם) שונה מההצעה המקורית?
       quote: מחיר, מקדמה ותאריך. offer: סכום, חבילה ומקדמה. מחזיר true רק כשיש הבדל ממשי. */
    function signedMismatch(doc, kind){
        if (!doc || doc.status !== 'signed' || !doc.signedQ) return false;
        let p; try { p = b64UrlDecode(doc.signedQ).split('|'); } catch(e) { return true; }
        const num = (a, b) => (Number(a) || 0) !== (Number(b) || 0);
        if (kind === 'offer') return p[0] !== doc.id || num(p[10], doc.total) || String(p[4] || '') !== String(doc.plan || '') || (p.length > 17 && num(p[17], doc.deposit));
        return p[10] !== doc.id || num(p[7], doc.price) || num(p[8], doc.deposit) || String(p[3] || '') !== String(doc.date || '');
    }
    function b64UrlEncode(str){
        const bytes = new TextEncoder().encode(str);
        let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    const money = n => '₪' + (Number(n) || 0).toLocaleString();
    const clean = s => String(s == null ? '' : s).replace(/\|/g, '/');

    // הקישור ללקוח — סדר השדות קבוע וזהה ל-quote.js באתר הלקוחות.
    // שדות 13–14 (פריטים והנחה) קיימים רק בהצעות במצב "פריטים": שם^כמות^מחיר ליחידה, מופרדים ב-~
    const cleanItem = s => clean(s).replace(/[~^]/g, '-');
    const encodeItems = items => (items || []).map(i => [cleanItem(i.label), Number(i.qty) || 1, Number(i.price) || 0].concat(i.desc ? [cleanItem(i.desc)] : []).join('^')).join('~');   // שם^כמות^מחיר[^מה כלול]
    function shareUrl(slug, q){
        const f = [clean(q.clientName), clean(q.eventType), clean(q.location), clean(q.date), clean(q.startTime), clean(q.endTime),
            q.guests || '', q.price || 0, q.deposit || 0, clean(q.notes), q.id, q.service || ''];
        if (q.items && q.items.length) f.push(encodeItems(q.items), Number(q.discount) || 0);
        return `${PF.customerBase}/${slug}/?q=${b64UrlEncode(f.join('|'))}`;
    }

    /* ---- קישורים קצרים: shortLinks/{id} = { q, kind, tenant } ----
       במקום קישור ארוך עם כל הפרטים — קישור קצר ונקי (…/?k=xxxxxxxxxx), כך שבוואטסאפ בולטת התמונה ולא שורת תווים.
       אם השמירה נכשלת (למשל לפני עדכון הכללים) — חוזרים לקישור הארוך, שממשיך לעבוד. */
    function randomId(n){
        const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n || 10));
        return Array.from(b, x => a[x % a.length]).join('');
    }
    async function makeShortLink(kind, tenant, longUrl){
        const f = await fb(), u = new URL(longUrl), q = u.searchParams.get('q');
        for (let i = 0; i < 3; i++) {
            const id = randomId(10);
            try {
                await f.fs.setDoc(f.fs.doc(f.db, 'shortLinks', id), { q, kind, tenant: tenant || '', createdAt: f.fs.serverTimestamp() });
                u.search = '?k=' + id;
                return { url: u.href, id };
            } catch(e) { console.warn('short link failed', e && e.code); }
        }
        return { url: longUrl, id: null };
    }
    const shortUrl = (longUrl, id) => { if (!id) return longUrl; const u = new URL(longUrl); u.search = '?k=' + id; return u.href; };
    async function resolveShortLink(id){
        if (!/^[a-z0-9]{6,20}$/.test(String(id || ''))) return null;
        const f = await fb();
        try { const s = await f.fs.getDoc(f.fs.doc(f.db, 'shortLinks', id)); return s.exists() ? s.data().q : null; } catch(e) { return null; }
    }
    async function deleteShortLink(id){ if (!id) return; try { const f = await fb(); await f.fs.deleteDoc(f.fs.doc(f.db, 'shortLinks', id)); } catch(e){} }

    /* ---- שליחה בוואטסאפ: wa.me עם הקישור בלבד. וואטסאפ מציג כרטיס תמונה + שורת קישור.
       נוסו ונכשלו אצל הבעלים: תפריט השיתוף, ו-1000 תווים בלתי נראים ("קרא עוד"). בוואטסאפ רגיל אי אפשר להסתיר את הקישור. */
    const waText = url => url;
    // טלפון ישראלי (050-1234567 / +972…) → 972501234567. מספר לא תקין → '' (וואטסאפ ישאל למי לשלוח)
    function waPhone(p){
        let d = String(p || '').replace(/\D/g, '');
        if (d.startsWith('00')) d = d.slice(2);
        if (d.startsWith('0')) d = '972' + d.slice(1);
        return /^\d{10,15}$/.test(d) ? d : '';
    }
    // עם טלפון — נפתח ישר הצ'אט של הלקוח; בלי טלפון — וואטסאפ שואל למי לשלוח
    function bindWhatsApp(a, url, phone){ a.href = 'https://wa.me/' + waPhone(phone) + '?text=' + encodeURIComponent(url); a.onclick = null; }

    const GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C39.9 37.1 44 31.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>';

    // מצב החשבון של ספק: active | limited | suspended
    const accountState = t => !t || t.active === false ? 'suspended' : t.limited ? 'limited' : 'active';

    /* ---- תאריכים ותמיכה ---- */
    const pad = n => String(n).padStart(2, '0');
    function parseISO(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
    function toISO(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fmtDate(d){ d = typeof d === 'string' ? parseISO(d) : d; return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; }
    function addMonths(d, n){ const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (r.getDate() !== d.getDate()) r.setDate(0); return r; }
    // מצב התמיכה הטכנית של ספק לפי tenants/{slug}.supportUntil (YYYY-MM-DD, כולל היום הזה)
    function supportStatus(t){
        if (t && t.supportCancelled) return { state: 'cancelled', label: 'התמיכה הטכנית בוטלה' + (t.supportCancelledAt ? ' ב-' + fmtDate(t.supportCancelledAt) : '') };
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

    /* ---- תזכורת במייל בשבוע האחרון של התמיכה הטכנית ----
       פעם אחת לכל תאריך סיום: נרשם tenants/{slug}/notices/support-<YYYY-MM-DD> (כשהבעלים מאריך — תאריך חדש, תזכורת חדשה בבוא הזמן).
       נשלחת מהדף הראשון שנפתח (לוח הניהול או חשבון הספק) — אל הבעלים, עם עותק לספק (FormSubmit _cc, כך שלא צריך הפעלה אצל הספק). */
    function reminderDue(t){
        const st = supportStatus(t);
        return st.state === 'expiring' && st.days <= (PF.supportReminderDays || 7) && t.active !== false ? st : null;
    }
    async function supportReminder(slug, t, emails, bizName){
        const st = reminderDue(t); if (!st || !slug) return false;
        const until = t.supportUntil, f = await fb(), ref = f.fs.doc(f.db, 'tenants', slug, 'notices', 'support-' + until);
        try { if ((await f.fs.getDoc(ref)).exists()) return false; } catch(e) { return false; }
        try { await f.fs.setDoc(ref, { type: 'supportReminder', until, sentAt: f.fs.serverTimestamp(), by: ((f.auth.currentUser || {}).email || '').toLowerCase() }); }
        catch(e) { return false; }   // כבר נשלחה (מדף אחר) או שאין הרשאה
        const c = PF.contact || {}, name = bizName || t.name || slug;
        const cc = [...new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e !== String(c.email).toLowerCase()))];
        const wa = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(`היי, זה ${name}. אשמח לחדש את התמיכה הטכנית 🙂`);
        const body = { _subject: `תזכורת: התמיכה הטכנית שלך מסתיימת ב-${fmtDate(until)}`, _template: 'box', _captcha: 'false',
            'עסק': name,
            'הודעה': `שלום! התמיכה הטכנית במערכת הצעות המחיר שלך מסתיימת ב-${fmtDate(until)} (נותרו ${st.left}). המערכת ממשיכה לעבוד כרגיל. כדי להמשיך לקבל תמיכה, שינויים ועדכונים — אפשר לחדש בכל רגע מולי בוואטסאפ ${c.phone}.`,
            'לחידוש בוואטסאפ': wa };
        if (cc.length) body._cc = cc.join(',');
        try { await fetch('https://formsubmit.co/ajax/' + c.email, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); }
        catch(e) { console.warn('reminder mail failed', e); }
        return true;
    }

    window.Core = { reminderDue, supportReminder, fb, bindWhatsApp, waPhone, waText, makeShortLink, shortUrl, resolveShortLink, deleteShortLink, isOwner, accountState, rememberEmail, rememberedEmail, forgetEmail, inAppBrowser, parseISO, toISO, fmtDate, addMonths, supportStatus, signIn, signOut, signOutQuiet, onAuth, tenantOf, vendorAccess, loadTenant, esc, b64UrlEncode, b64UrlDecode, signedMismatch, money, clean, shareUrl, GOOGLE_SVG, PF };
})();
