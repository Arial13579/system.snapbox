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
    // ניסיון חוזר בתקלת רשת (לא בחסימת הרשאות) — כדי שאינטרנט איטי לא ייראה כמו "לא רשום"
    async function withRetry(fn, tries){
        let last;
        for (let i = 0; i < (tries || 4); i++) {
            try { return await fn(); }
            catch(e) { last = e; if (e && (e.code === 'permission-denied' || isQuota(e))) throw e; await new Promise(r => setTimeout(r, 700 * (i + 1))); }
        }
        throw last;
    }
    // null = המייל לא רשום כספק. בבעיית חיבור — זורק שגיאה (ולא מחזיר "לא רשום")
    async function tenantOf(user){
        const f = await fb();
        const snap = await withRetry(() => f.fs.getDoc(f.fs.doc(f.db, 'vendorIndex', (user.email || '').toLowerCase())));
        return snap.exists() ? snap.data().tenant : null;
    }

    // מצב הגישה של משתמש: { slug, state: 'ok' | 'suspended' | 'none' }. ספק מושהה לא יכול לקרוא את כרטיס הספק (נאכף בשרת).
    async function vendorAccess(user){
        let slug;
        try { slug = await tenantOf(user); } catch(e) { return { slug: null, state: isQuota(e) ? 'quota' : 'error' }; }
        if (!slug) return { slug: null, state: 'none' };
        const f = await fb();
        try { const snap = await withRetry(() => f.fs.getDoc(f.fs.doc(f.db, 'tenants', slug))); return { slug, state: snap.exists() ? 'ok' : 'none', data: snap.exists() ? snap.data() : null }; }
        catch(e) { return { slug, state: e && e.code === 'permission-denied' ? 'suspended' : isQuota(e) ? 'quota' : 'error' }; }
    }

    /* ---- PDF חתום: במסמך נפרד <מסמך>/pdf/file, כדי שהרשימות לא יורידו את כל הקבצים בכל טעינה ----
       מסמכים ישנים מחזיקים את הקובץ בשדה pdfData של המסמך עצמו — נקראים כרגיל ומועברים (migratePdf) בפעם הבאה שהרשימה נטענת. */
    const hasPdf = d => !!(d && (d.hasPdf || d.pdfData));
    async function getPdf(path, d){
        if (d && d.pdfData && !d.hasPdf) return d.pdfData;
        const f = await fb(), s = await withRetry(() => f.fs.getDoc(f.fs.doc(f.db, path + '/pdf/file')));
        return s.exists() ? s.data().pdfData : null;
    }
    async function putPdf(path, pdfData, noFallback){
        const f = await fb();
        try { await f.fs.setDoc(f.fs.doc(f.db, path + '/pdf/file'), { pdfData, at: f.fs.serverTimestamp() }); }
        catch(e) {
            // כללים ישנים (לפני ההדבקה ב-Firebase): שומרים כמו קודם, בתוך המסמך
            if (noFallback || !(e && e.code === 'permission-denied')) throw e;
            await f.fs.updateDoc(f.fs.doc(f.db, path), { pdfData }); return;
        }
        await f.fs.updateDoc(f.fs.doc(f.db, path), { hasPdf: true, pdfData: f.fs.deleteField() });
    }
    // תור אחד: קובץ אחד בכל פעם, וכל קובץ פעם אחת בלבד — גם אם הרשימה מתעדכנת שוב ושוב בזמן ההעברה
    // (בלי זה כל עדכון של הרשימה התחיל את כל ההעברות מחדש, והחיבור נחנק)
    // נעצר מיד אם המכסה היומית של Firebase נגמרה (resource-exhausted), וממשיך בכניסה הבאה.
    const migrated = new Set(); let migQ = Promise.resolve(true), migStop = false;
    function migratePdf(path, d){
        if (migStop || !d || !d.pdfData || migrated.has(path)) return Promise.resolve(false);
        migrated.add(path);
        const data = d.pdfData;
        return (migQ = migQ.then(() => migStop ? false : putPdf(path, data, true).then(() => true, e => { if (isQuota(e)) migStop = true; return false; })));
    }
    /* המכסה היומית החינמית של Firebase נגמרה (מתאפסת ב-10:00 בבוקר שעון ישראל) */
    const isQuota = e => !!e && (e.code === 'resource-exhausted' || /quota/i.test(String(e.message || '')));
    const QUOTA_MSG = 'המכסה היומית החינמית של Firebase נגמרה, ולכן אי אפשר לטעון נתונים כרגע. היא מתאפסת כל יום ב-10:00 בבוקר (שעון ישראל), או מיד אחרי הפעלת חיוב בפרויקט ב-Firebase.';
    /* פתיחת PDF: החלון נפתח מיד בלחיצה (אחרת הטלפון חוסם אותו), ואז נטען הקובץ */
    async function openPdf(path, d){
        const w = window.open('', '_blank');
        try {
            const pdf = await getPdf(path, d); if (!pdf) throw new Error('missing');
            const bin = atob(pdf), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([a], { type: 'application/pdf' }));
            if (w) w.location.href = url; else window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch(e) { if (w) w.close(); alert(isQuota(e) ? QUOTA_MSG : 'פתיחת הקובץ נכשלה.'); }
    }
    async function deletePdf(path){ const f = await fb(); try { await f.fs.deleteDoc(f.fs.doc(f.db, path + '/pdf/file')); } catch(e) {} }

    function loadScript(src){
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed: ' + src));
            document.head.appendChild(s);
        });
    }
    // טוען את config.js של הספק מאתר הלקוחות (שם נמצאים המיתוג, המחירון והתנאים).
    // ספק שנוצר מלוח הניהול אין לו קובץ — ההגדרות שלו ב-vendorConfigs/<slug> (T.dynamic = true)
    async function loadTenant(slug){
        if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error('bad slug');
        window.TENANT = null;
        try { await loadScript(`${PF.customerBase}/${slug}/config.js?v=${Date.now()}`); } catch(e) {}
        if (!window.TENANT || window.TENANT.slug !== slug) window.TENANT = await remoteConfig(slug);
        if (!window.TENANT) throw new Error('tenant config missing');
        return window.TENANT;
    }
    /* הגדרות ספק שנשמרו במאגר (vendorConfigs) אינן קוד שלנו — מנקים לפני שימוש: בלי תגיות, מספרים כמספרים,
       צבעים וקישורים בפורמט תקין בלבד. כך שום ערך לא יכול להריץ קוד בדף. */
    function cleanConfig(T){
        const deep = v => Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
            : typeof v === 'string' ? v.replace(/[<>]/g, '') : (typeof v === 'number' || typeof v === 'boolean' || v == null) ? v : '';
        T = deep(T && typeof T === 'object' && !Array.isArray(T) ? T : {});
        const N = v => Math.max(0, Number(v) || 0), str = v => typeof v === 'string' ? v : '', arr = v => Array.isArray(v) ? v : [];
        const strs = v => arr(v).map(str).filter(Boolean), hex = (v, d) => /^#[0-9a-f]{6}$/i.test(v) ? v : d;
        const B = T.business = Object.assign({}, T.business);
        ['name', 'tagline', 'email', 'phone', 'businessId', 'address'].forEach(k => { B[k] = str(B[k]); });
        B.logo = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(str(B.logo)) ? B.logo : '';
        ['website', 'instagram', 'facebook', 'tiktok'].forEach(k => { if (B[k] !== undefined && !/^https:\/\/[^\s"'`]+$/i.test(str(B[k]))) delete B[k]; });
        const th = T.theme = Object.assign({}, T.theme);
        th.brand = hex(th.brand, '#0F766E'); th.background = hex(th.background, '#F7F6F3'); th.font = /^[A-Za-z ]{1,40}$/.test(str(th.font)) ? th.font : 'Assistant';
        const L = T.labels = Object.assign({}, T.labels);
        ['service', 'included', 'docTitle'].forEach(k => { if (L[k] !== undefined) L[k] = str(L[k]); });
        L.eventTypes = strs(L.eventTypes);
        const P = T.pricing = Object.assign({}, T.pricing), sv = {};
        Object.entries(P.SERVICES && typeof P.SERVICES === 'object' ? P.SERVICES : {}).forEach(([k, s]) => {
            if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k) && s && typeof s === 'object')
                sv[k] = { label: str(s.label), lead: str(s.lead), base: N(s.base), hours: N(s.hours), extraHour: N(s.extraHour), items: strs(s.items) };
        });
        P.SERVICES = sv;
        if (!sv[P.DEFAULT_SERVICE]) P.DEFAULT_SERVICE = Object.keys(sv)[0] || '';
        ['GUEST_TIERS', 'TRAVEL_TIERS'].forEach(k => { P[k] = arr(P[k]).map(t => ({ max: Number(t && t.max) || 0, price: N(t && t.price), label: str(t && t.label) })); });
        P.CATALOG = arr(P.CATALOG).map(c => ({ label: str(c && c.label), price: N(c && c.price), desc: str(c && c.desc) }));
        P.COMMON_ITEMS = strs(P.COMMON_ITEMS);
        ['DEPOSIT', 'EVENT_HOURS', 'QUOTE_VALID_DAYS'].forEach(k => { if (P[k] != null) P[k] = N(P[k]); });
        if (P.DEPOSIT_PERCENT != null) P.DEPOSIT_PERCENT = Math.min(100, N(P.DEPOSIT_PERCENT));
        if (P.MODE !== undefined) P.MODE = P.MODE === 'items' ? 'items' : '';
        P.EXTRA_FRACTION = Object.fromEntries(Object.entries(P.EXTRA_FRACTION && typeof P.EXTRA_FRACTION === 'object' ? P.EXTRA_FRACTION : { 0: 0, 15: 0.25, 30: 0.5, 45: 0.75 }).map(([k, v]) => [String(N(k)), N(v)]));
        if (P.ORIGIN) { const o = P.ORIGIN; P.ORIGIN = { name: str(o.name) }; if (Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)) && o.lat !== '' && o.lon !== '') { P.ORIGIN.lat = Number(o.lat); P.ORIGIN.lon = Number(o.lon); } }
        if (P.PAYMENT_METHODS !== undefined) P.PAYMENT_METHODS = strs(P.PAYMENT_METHODS);
        if (P.BALANCE_DUE !== undefined) P.BALANCE_DUE = str(P.BALANCE_DUE);
        T.terms = strs(T.terms);
        const pol = T.policy = Object.assign({}, T.policy);
        ['coolingDays', 'coolingNoticeDays', 'refundDays'].forEach(k => { pol[k] = N(pol[k]); });
        pol.tiers = strs(pol.tiers); pol.postpone = str(pol.postpone);
        if (T.og !== undefined) T.og = { head: str(T.og && T.og.head), cta: str(T.og && T.og.cta) };
        T.sample = T.sample === true;
        return T;
    }
    async function remoteConfig(slug){
        const f = await fb(), snap = await f.fs.getDoc(f.fs.doc(f.db, 'vendorConfigs', slug));
        if (!snap.exists()) return null;
        let T = null; try { T = JSON.parse(snap.data().config || 'null'); } catch(e) {}
        if (!T || typeof T !== 'object') return null;
        T = cleanConfig(T);
        T.slug = slug; T.dynamic = true;
        return T;
    }
    // כתובת דף ההצעה: ספק עם תיקייה משלו — /<slug>/ ; ספק שנוצר מלוח הניהול — הדף המשותף /v/?t=<slug>
    const isDynamic = slug => !!(window.TENANT && window.TENANT.slug === slug && window.TENANT.dynamic);
    const quoteBase = slug => isDynamic(slug) ? `${PF.customerBase}/v/?t=${slug}&` : `${PF.customerBase}/${slug}/?`;
    const withKey = (u, id) => { const t = u.searchParams.get('t'); u.search = (t ? '?t=' + encodeURIComponent(t) + '&' : '?') + 'k=' + id; return u.href; };

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
    const lines = (arr, pick) => (arr || []).map(x => pick(x).map(v => typeof v === 'number' ? v : cleanItem(v)).join('^')).join('~');
    // חבילה: שם^שעות^שורת פתיחה^מה כלול (מופרד ב-~)
    const encodePkg = p => p ? [cleanItem(p.label), Number(p.hours) || 0, cleanItem(p.lead || ''), (p.items || []).map(cleanItem).join('~')].join('^') : '';
    function shareUrl(slug, q){
        const f = [clean(q.clientName), clean(q.eventType), clean(q.location), clean(q.date), clean(q.startTime), clean(q.endTime),
            q.guests || '', q.price || 0, q.deposit || 0, clean(q.notes), q.id, q.service || ''];
        if (q.items && q.items.length) f.push(encodeItems(q.items), Number(q.discount) || 0);
        else if (q.pkg || q.discount) f.push('', Number(q.discount) || 0, encodePkg(q.pkg));   // 13: הנחה, 14: תמונת מצב של החבילה
        // 15–19: פירוט מחיר, תוספות אפשריות, הטבות, תוקף, תנאי תשלום
        const pay = q.payment && (q.payment.methods || []).length + (q.payment.due ? 1 : 0) ? [(q.payment.methods || []).map(cleanItem).join(','), cleanItem(q.payment.due || '')].join('^') : '';
        const more = [lines(q.breakdown, x => [x.label, Number(x.amount) || 0]), lines(q.extras, x => [x.label, Number(x.price) || 0, x.desc || '']),
            lines(q.perks, x => [x.label, Number(x.worth) || 0]), q.validUntil || '', pay];
        if (more.some(Boolean)) { while (f.length < 15) f.push(f.length === 13 ? (Number(q.discount) || 0) : ''); f.push(...more); }
        return `${quoteBase(slug)}q=${b64UrlEncode(f.join('|'))}`;
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
                return { url: withKey(u, id), id };
            } catch(e) { console.warn('short link failed', e && e.code); }
        }
        return { url: longUrl, id: null };
    }
    const shortUrl = (longUrl, id) => id ? withKey(new URL(longUrl), id) : longUrl;
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

    /* רישיון השימוש במערכת: lifetime (מבצע ההשקה) או accessUntil (YYYY-MM-DD; regular/מותאם — שנה, וחידוש שנתי).
       אחרי התאריך החשבון במצב צפייה בלבד (נאכף בכללים לפי accessEnds). בלי שדות בכלל = לא הוגדר (לא מוגבל). */
    const licenseOf = plan => ((PF.sales || {}).plans || {})[plan] && PF.sales.plans[plan].lifetime ? 'lifetime' : 'year';
    /* תקופת ניסיון (trial): PF.trial.days ימים מרגע הפתיחה (createdAt, זמן השרת), או עד trialEnds אם הבעלים האריך.
       אחרי הסיום — צפייה בלבד (נאכף בכללים). */
    const tsDate = v => v && v.toDate ? v.toDate() : v instanceof Date ? v : (v && v.seconds ? new Date(v.seconds * 1000) : null);
    function trialEnd(t){
        if (!t || !t.trial) return null;
        const e = tsDate(t.trialEnds); if (e) return e;
        const c = tsDate(t.createdAt) || new Date();
        return new Date(c.getTime() + ((PF.trial || {}).days || 3) * 86400000);
    }
    function leftText(ms){
        const h = Math.max(0, Math.floor(ms / 3600000)), d = Math.floor(h / 24), r = h % 24;
        if (d >= 1) return (d === 1 ? 'יום' : d === 2 ? 'יומיים' : d + ' ימים') + (r ? ` ו-${r === 1 ? 'שעה' : r === 2 ? 'שעתיים' : r + ' שעות'}` : '');
        if (h >= 1) return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות';
        return 'פחות משעה';
    }
    const fmtDateTime = d => fmtDate(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    function accessStatus(t){
        if (t && t.pending) return { state: 'pending', label: 'מנוי שנתי · ממתין לאישור' };
        if (t && t.trial) {
            const until = trialEnd(t), ms = until - Date.now();
            return ms > 0 ? { state: 'trial', until, ms, left: leftText(ms), label: 'ניסיון חינם עד ' + fmtDateTime(until) }
                : { state: 'trialEnded', until, ms: 0, label: 'תקופת הניסיון הסתיימה ב-' + fmtDateTime(until) };
        }
        if (t && t.lifetime) return { state: 'lifetime', label: 'רישיון לכל החיים' };
        const until = parseISO(t && t.accessUntil);
        if (!until) return { state: 'none', label: 'לא הוגדר' };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = Math.round((until - today) / 86400000);
        if (days < 0) return { state: 'expired', until, days, label: 'הרישיון הסתיים ב-' + fmtDate(until) };
        return { state: days <= 30 ? 'expiring' : 'active', until, days, label: 'בתוקף עד ' + fmtDate(until) };
    }
    // צפייה בלבד בגלל זמן: רישיון שנתי שהסתיים או תקופת ניסיון שהסתיימה
    const accessOver = t => { const s = accessStatus(t).state; return s === 'expired' || s === 'trialEnded' || s === 'pending'; };

    /* פתיחת תקופת ניסיון: ספק חדש פותח לעצמו חשבון. ארבעה מסמכים בפעולה אחת (הכללים בודקים שהם יחד):
       trials/{מייל} (פעם אחת לכל Gmail), tenants/{ספק}, vendorIndex/{מייל}, vendorConfigs/{ספק}. מחזיר את ה-slug. */
    function randomSlug(){ return 'v' + Array.from(crypto.getRandomValues(new Uint8Array(7)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); }
    // o = { plan: 'trial'|'regular', name, phone, contactName, businessType, pricingInfo, config }
    async function startTrial(o){
        const f = await fb(), u = f.auth.currentUser; if (!u) throw new Error('not signed in');
        const email = String(u.email || ''), annual = o.plan === 'regular';
        const cfg = JSON.stringify(o.config || window.VendorTemplates.build(o.field, { name: o.name, phone: o.phone, email: email.toLowerCase(), color: o.color, city: o.city }));
        let lastErr;
        for (let i = 0; i < 3; i++) {   // שם משתמש אקראי; אם במקרה תפוס — מנסים שם אחר
            const slug = randomSlug(), b = f.fs.writeBatch(f.db), now = f.fs.serverTimestamp();
            b.set(f.fs.doc(f.db, 'trials', email), { tenant: slug, plan: annual ? 'regular' : 'trial', createdAt: now });
            b.set(f.fs.doc(f.db, 'tenants', slug), { slug, name: String(o.name || '').slice(0, 80), admins: [email], active: true,
                managed: annual ? 'signup' : 'trial', trial: !annual, plan: annual ? 'regular' : 'trial', pending: annual,
                phone: String(o.phone || '').slice(0, 30), contactName: String(o.contactName || '').slice(0, 80),
                businessType: String(o.businessType || (window.VendorTemplates.FIELDS[o.field] || {}).label || '').slice(0, 40),
                pricingInfo: String(o.pricingInfo || '').slice(0, 1500), createdAt: now });
            b.set(f.fs.doc(f.db, 'vendorIndex', email), { tenant: slug });
            b.set(f.fs.doc(f.db, 'vendorConfigs', slug), { config: cfg, updatedAt: now });
            try { await b.commit(); return slug; }
            catch(e) { lastErr = e; if (e.code !== 'permission-denied') throw e;
                // אם כבר נרשם חשבון למייל הזה — לא מנסים שוב
                try { if ((await f.fs.getDoc(f.fs.doc(f.db, 'trials', email))).exists()) throw Object.assign(new Error('used'), { code: 'trial-used' }); } catch(x) { if (x.code === 'trial-used') throw x; }
            }
        }
        throw lastErr;
    }
    async function trialUsed(email){
        const f = await fb();
        try { return (await f.fs.getDoc(f.fs.doc(f.db, 'trials', String(email || '')))).exists(); } catch(e) { return false; }
    }

    // השדות לכרטיס הספק: accessUntil לתצוגה, accessEnds (סוף היום) לאכיפה בכללים
    function accessFields(fs, lifetime, untilISO){
        if (lifetime) return { lifetime: true, accessUntil: '', accessEnds: null };
        const d = parseISO(untilISO);
        return { lifetime: false, accessUntil: untilISO || '', accessEnds: d ? fs.Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)) : null };
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

    /* ---- תזכורת חידוש המנוי השנתי: חודש לפני ושבוע לפני (sales.renewalReminderDays) ----
       פעם אחת לכל שלב ולכל תאריך: tenants/{slug}/notices/lic<ימים>-<YYYY-MM-DD>. חידוש = תאריך חדש = תזכורות חדשות בבוא הזמן.
       אם הגיע שלב השבוע לפני שנשלחה תזכורת החודש — נשלחת רק של השבוע. */
    function licenseReminderDue(t){
        const a = accessStatus(t);
        if (!t || t.active === false || !(a.state === 'expiring' || a.state === 'active') || a.days < 0) return null;
        const stages = ((PF.sales || {}).renewalReminderDays || [30, 7]).slice().sort((x, y) => x - y);
        const stage = stages.find(d => a.days <= d);
        return stage ? Object.assign({ stage, id: 'lic' + stage + '-' + t.accessUntil }, a) : null;
    }
    async function licenseReminder(slug, t, emails, bizName){
        const due = licenseReminderDue(t); if (!due || !slug) return false;
        const f = await fb(), ref = f.fs.doc(f.db, 'tenants', slug, 'notices', due.id);
        try { if ((await f.fs.getDoc(ref)).exists()) return false; } catch(e) { return false; }
        try { await f.fs.setDoc(ref, { type: 'licenseReminder', until: t.accessUntil, stage: due.stage, sentAt: f.fs.serverTimestamp(), by: ((f.auth.currentUser || {}).email || '').toLowerCase() }); }
        catch(e) { return false; }   // כבר נשלחה (מדף אחר) או שאין הרשאה
        const c = PF.contact || {}, name = bizName || t.name || slug, price = money((PF.sales || {}).renewalYearly || 400);
        const cc = [...new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e !== String(c.email).toLowerCase()))];
        const wa = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(`היי, זה ${name}. אשמח לחדש את המנוי השנתי של המערכת 🙂`);
        const left = due.days === 0 ? 'היום' : due.days === 1 ? 'מחר' : `בעוד ${due.days} ימים`;
        const body = { _subject: `${due.stage <= 7 ? 'נשאר שבוע: ' : ''}המנוי השנתי למערכת הצעות המחיר מסתיים ב-${fmtDate(t.accessUntil)}`, _template: 'box', _captcha: 'false',
            'עסק': name,
            'הודעה': `שלום! המנוי השנתי שלך למערכת הצעות המחיר מסתיים ב-${fmtDate(t.accessUntil)} (${left}). חידוש לשנה נוספת: ${price} (בלי תמיכה טכנית). `
                + (due.stage <= 7 ? 'אם המנוי לא יחודש, החשבון יעבור למצב צפייה בלבד: ההצעות וההסכמים נשמרים, אבל לא יהיה אפשר ליצור הצעות חדשות. ' : '')
                + `לחידוש — וואטסאפ ${c.phone}.`,
            'לחידוש בוואטסאפ': wa };
        if (cc.length) body._cc = cc.join(',');
        try { await fetch('https://formsubmit.co/ajax/' + c.email, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); }
        catch(e) { console.warn('license reminder mail failed', e); }
        return true;
    }

    /* ---- חיבור אחד בלבד לכל ספק (הבעלים פטור) ----
       כל פתיחה של חשבון הספק רושמת sessions/{email} = { sid, bid } (sid חדש בכל טעינת דף, bid קבוע לדפדפן).
       כל דף פתוח מאזין למסמך: אם נרשם sid אחר — החשבון נפתח במקום אחר, והדף הזה מתנתק.
       בדפדפן/מכשיר אחר — התנתקות מלאה. באותו דפדפן (לשונית אחרת) — רק חסימת הלשונית, כדי לא לנתק גם את הלשונית החדשה. */
    const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    async function singleSession(onKicked){
        const f = await fb(), u = f.auth.currentUser;
        if (!u || isOwner(u)) return false;
        let bid = ''; try { bid = localStorage.getItem('sb.bid') || ''; if (!bid) { bid = rid(); localStorage.setItem('sb.bid', bid); } } catch(e) { bid = rid(); }
        const sid = rid(), ref = f.fs.doc(f.db, 'sessions', String(u.email || '').toLowerCase());
        try { await f.fs.setDoc(ref, { sid, bid, at: f.fs.serverTimestamp(), ua: navigator.userAgent.slice(0, 200) }); }
        catch(e) { console.warn('session claim failed', e); return false; }   // לפני עדכון הכללים — לא חוסמים
        let done = false;
        const unsub = f.fs.onSnapshot(ref, s => {
            const d = s.data();
            if (done || !d || !d.sid || d.sid === sid) return;
            done = true; unsub();
            const sameBrowser = d.bid === bid;
            if (!sameBrowser) f.authMod.signOut(f.auth).catch(() => {});
            onKicked(sameBrowser);
        }, () => {});
        return true;
    }

    /* אסימון צפייה בנתוני השימוש של Google Cloud (לוח הניהול → "מכסת Firebase היום"). רק לבעלים.
       מבקש מ-Google הרשאת קריאה בלבד (monitoring.read) לאותו חשבון, ושומר אותה ל-50 דקות בלשונית הזו. */
    async function usageToken(){
        if (window.__EMU__) return 'test-token';   // בדיקות מקומיות בלבד
        try { const c = JSON.parse(sessionStorage.getItem('sb.mon') || 'null'); if (c && c.exp > Date.now()) return c.t; } catch(e) {}
        const f = await fb(), u = f.auth.currentUser;
        const p = new f.authMod.GoogleAuthProvider();
        p.addScope('https://www.googleapis.com/auth/monitoring.read');
        p.setCustomParameters({ login_hint: u.email });
        const res = await f.authMod.reauthenticateWithPopup(u, p);
        const cred = f.authMod.GoogleAuthProvider.credentialFromResult(res), t = cred && cred.accessToken;
        if (!t) throw new Error('no token');
        try { sessionStorage.setItem('sb.mon', JSON.stringify({ t, exp: Date.now() + 50 * 60000 })); } catch(e) {}
        return t;
    }
    const clearUsageToken = () => { try { sessionStorage.removeItem('sb.mon'); } catch(e) {} };

    window.Core = { cleanConfig, trialEnd, leftText, fmtDateTime, accessOver, startTrial, trialUsed, licenseReminderDue, licenseReminder, accessStatus, accessFields, licenseOf, isDynamic, usageToken, clearUsageToken, isQuota, QUOTA_MSG, openPdf, withRetry, hasPdf, getPdf, putPdf, migratePdf, deletePdf, singleSession, reminderDue, supportReminder, fb, bindWhatsApp, waPhone, waText, makeShortLink, shortUrl, resolveShortLink, deleteShortLink, isOwner, accountState, rememberEmail, rememberedEmail, forgetEmail, inAppBrowser, parseISO, toISO, fmtDate, addMonths, supportStatus, signIn, signOut, signOutQuiet, onAuth, tenantOf, vendorAccess, loadTenant, esc, b64UrlEncode, b64UrlDecode, signedMismatch, money, clean, shareUrl, GOOGLE_SVG, PF };
})();
