/* תבניות להגדרות ספק: ברירות מחדל לתנאים ולמדיניות, ומחירון לדוגמה לפי תחום (לתקופת הניסיון).
   המבנה זהה ל-config.js של ספק באתר הלקוחות. משמש את vendor-editor.js (לוח הניהול) ואת trial.html. */
(function(){
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
    const EVENT_TYPES = ['חתונה', 'בר מצווה', 'בת מצווה', 'חינה', 'יום הולדת', 'אירוע חברה', 'מסיבה פרטית'];

    // ערי יציאה (לחישוב מרחק הנסיעה במחולל)
    const CITIES = {
        'תל אביב': [32.0853, 34.7818], 'ירושלים': [31.7683, 35.2137], 'חיפה': [32.794, 34.9896], 'באר שבע': [31.2518, 34.7913],
        'ראשון לציון': [31.973, 34.7925], 'פתח תקווה': [32.0871, 34.8875], 'נתניה': [32.3215, 34.8532], 'אשדוד': [31.8044, 34.6553],
        'מודיעין': [31.8969, 35.0104], 'רחובות': [31.8928, 34.8113], 'כפר סבא': [32.1782, 34.9076], 'חדרה': [32.434, 34.9196],
        'עפולה': [32.6078, 35.2897], 'נצרת': [32.6996, 35.3035], 'אילת': [29.5577, 34.9519], 'קריית שמונה': [33.2075, 35.5697]
    };
    const AUTO = (services, common, included) => ({ mode: 'auto', services, common, included });
    const ITEMS = (catalog, common, included) => ({ mode: 'items', catalog, common, included });

    // מחירון לדוגמה לכל תחום. הספק משנה אותו בעצמו ("החבילות שלי" / "המחירון שלי")
    const FIELDS = {
        dj: { label: 'DJ', tagline: 'DJ לאירועים', ...AUTO({
            dj:      { label: 'DJ', base: 3500, hours: 4, extraHour: 500, lead: 'של מוזיקה ברצף', items: ['DJ מקצועי לכל האירוע', 'מערכת הגברה מקצועית', 'תאורת רחבה בסיסית'] },
            dj_plus: { label: 'DJ + תאורה ואפקטים', base: 5500, hours: 5, extraHour: 700, lead: 'של מוזיקה ברצף', items: ['DJ מקצועי לכל האירוע', 'מערכת הגברה מקצועית', 'תאורת רחבה מלאה ומסכי לד', 'עשן כבד לריקוד הראשון'] }
        }, ['פגישת תיאום לבניית הפלייליסט', 'מיקרופון אלחוטי לברכות'], 'מה כלול בחבילה') },
        booth: { label: 'עמדת צילום', tagline: 'עמדת צילום לאירועים', ...AUTO({
            booth:   { label: 'עמדת צילום', base: 2500, hours: 3, extraHour: 400, lead: 'של צילום והדפסות ללא הגבלה', items: ['עמדת צילום מעוצבת עם תאורה', 'הדפסת תמונות במקום ללא הגבלה', 'אביזרים לצילום'] },
            booth_m: { label: 'עמדת צילום + מגנטים', base: 3200, hours: 3, extraHour: 500, lead: 'של צילום והדפסות ללא הגבלה', items: ['עמדת צילום מעוצבת עם תאורה', 'מגנטים מודפסים לאורחים ללא הגבלה', 'אביזרים לצילום'] }
        }, ['עיצוב מסגרת אישית לתמונות', 'גלריה דיגיטלית אחרי האירוע'], 'מה כלול בעמדה') },
        band: { label: 'להקה / זמר', tagline: 'מוזיקה חיה לאירועים', ...AUTO({
            duo:  { label: 'הרכב קטן (זמר + קלידן)', base: 5000, hours: 3, extraHour: 900, lead: 'של מוזיקה חיה', items: ['זמר/ת וקלידן', 'מערכת הגברה', 'קבלת פנים וחופה'] },
            band: { label: 'להקה מלאה', base: 9500, hours: 4, extraHour: 1500, lead: 'של מוזיקה חיה', items: ['זמר/ת, קלידן, גיטרה, בס ותופים', 'מערכת הגברה ותאורה', 'קבלת פנים, חופה ורחבה'] }
        }, ['פגישת תיאום שירים', 'בחירת שיר לחופה'], 'מה כלול בהרכב') },
        photo: { label: 'צלם / וידאו', tagline: 'צילום אירועים', ...ITEMS([
            { label: 'צילום סטילס', price: 3500, desc: 'צלם מקצועי לכל האירוע · כל התמונות ערוכות בגלריה דיגיטלית' },
            { label: 'צילום וידאו', price: 4500, desc: 'צלם וידאו לכל האירוע · סרט ערוך באורך מלא' },
            { label: 'צלם נוסף', price: 1800, desc: 'צלם סטילס נוסף לזוויות נוספות' },
            { label: 'קליפ קצר לרשתות', price: 900, desc: 'קליפ ערוך של 60–90 שניות' },
            { label: 'רחפן', price: 1200, desc: 'צילומי אוויר (בכפוף לאישור המקום)' },
            { label: 'אלבום מודפס', price: 1600, desc: 'אלבום מעוצב 30×30, 40 עמודים' }
        ], ['גלריה דיגיטלית לשיתוף עם האורחים'], 'מה כלול') },
        design: { label: 'עיצוב אירועים', tagline: 'עיצוב והפקת אירועים', ...ITEMS([
            { label: 'עיצוב אולם', price: 6000, desc: 'קונספט עיצובי מלא, מפות, מרכזי שולחן ותאורה דקורטיבית' },
            { label: 'עיצוב חופה', price: 3500, desc: 'חופה מעוצבת עם פרחים ובדים' },
            { label: 'שולחן קבלת פנים', price: 1800, desc: 'שולחן מעוצב עם שלט ברוכים הבאים' },
            { label: 'סידורי פרחים', price: 1200, desc: 'פרחים טריים לשולחנות' },
            { label: 'תאורה דקורטיבית', price: 2200, desc: 'שרשראות אור ונרות' }
        ], ['פגישת תכנון ובחירת קונספט', 'הקמה ופירוק ביום האירוע'], 'מה כלול') },
        other: { label: 'אחר', tagline: 'שירותים לאירועים', ...ITEMS([
            { label: 'השירות הבסיסי', price: 2000, desc: 'מה כולל השירות — לעריכה' },
            { label: 'תוספת', price: 500, desc: 'תוספת אפשרית — לעריכה' }
        ], [], 'מה כלול') }
    };

    // הגדרות מלאות לספק חדש בתקופת ניסיון
    function build(field, o){
        const F = FIELDS[field] || FIELDS.other, cityName = CITIES[o.city] ? o.city : 'תל אביב', c = CITIES[cityName];
        const P = { COMMON_ITEMS: F.common.slice() };
        if (F.mode === 'items') Object.assign(P, { MODE: 'items', DEPOSIT_PERCENT: 30, EVENT_HOURS: 4, CATALOG: F.catalog.map(x => ({ ...x })) });
        else Object.assign(P, {
            ORIGIN: { name: cityName, lat: c[0], lon: c[1] },
            DEFAULT_SERVICE: Object.keys(F.services)[0], DEPOSIT: 500,
            SERVICES: JSON.parse(JSON.stringify(F.services)),
            GUEST_TIERS: [{ max: 400, price: 0, label: 'עד 400 מוזמנים' }, { max: 1e9, price: 800, label: 'מעל 400 מוזמנים' }],
            TRAVEL_TIERS: [{ max: 40, price: 0, label: `עד 40 ק"מ מ${cityName} · ללא עלות` }, { max: 1e9, price: 250, label: `נסיעה רחוקה מ${cityName}` }],
            EXTRA_FRACTION: { 0: 0, 15: 0.25, 30: 0.5, 45: 0.75 } });
        return {
            business: { name: o.name, tagline: o.tagline || F.tagline, email: o.email, phone: o.phone, businessId: '', logo: '' },
            theme: { brand: COLORS.includes(o.color) ? o.color : COLORS[0], background: '#F7F6F3', font: 'Assistant' },
            labels: { service: 'חבילה', included: F.included, docTitle: 'הצעת מחיר והסכם', eventTypes: EVENT_TYPES.slice() },
            pricing: P,
            terms: DEFAULT_TERMS.slice(),
            policy: { coolingDays: 14, coolingNoticeDays: 7, refundDays: 14, tiers: DEFAULT_TIERS.slice(), postpone: DEFAULT_POSTPONE },
            editor: { guestRules: F.mode === 'items' ? [] : [{ over: 400, add: 800 }], travelRules: F.mode === 'items' ? [] : [{ over: 40, add: 250 }] },
            sample: true   // מחירון לדוגמה — הספק מעדכן בעצמו
        };
    }

    /* ---- הגדרות מלאות ממה שהספק מילא בעצמו בהרשמה (פרטי העסק, חבילות/מחירון, מה משפיע על המחיר, תנאי החוזה) ---- */
    const txt = (s, n) => String(s == null ? '' : s).replace(/[<>|^~]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 300);
    const lines = (s, n) => String(s || '').split('\n').map(x => txt(x, n || 400)).filter(Boolean);
    const num = v => Math.max(0, Math.round(Number(v) || 0));
    // "מעל X → +₪Y" ⇒ מדרגות (max, price, label) כמו ב-config.js
    function toTiers(rules, unit, first){
        const r = rules.map(x => ({ over: num(x.over), add: num(x.add) })).filter(x => x.over > 0 && x.add > 0).sort((a, b) => a.over - b.over);
        if (!r.length) return [];
        const t = [{ max: r[0].over, price: 0, label: `עד ${r[0].over} ${unit}${first ? ' · ' + first : ''}` }];
        r.forEach((x, i) => t.push({ max: i + 1 < r.length ? r[i + 1].over : 1e9, price: x.add, label: `מעל ${x.over} ${unit}` }));
        return t;
    }
    function fromForm(o){
        const items = o.mode === 'items';
        // עיר יציאה: מהרשימה, או מקום שהוקלד חופשי (עם קואורדינטות שנמצאו בחיפוש)
        const og = o.origin && o.origin.name && Number.isFinite(o.origin.lat) ? o.origin : null;
        const cityName = og ? txt(og.name, 60) : CITIES[o.city] ? o.city : 'תל אביב', c = og ? [og.lat, og.lon] : CITIES[cityName];
        const B = { name: txt(o.name, 60), tagline: txt(o.tagline, 120) || ((FIELDS[o.field] || {}).tagline || ''), email: txt(o.email, 120).toLowerCase(), phone: txt(o.phone, 30),
            businessId: txt(o.businessId, 60), address: txt(o.address, 160), logo: /^data:image\//.test(o.logo || '') ? o.logo : '' };
        const P = { COMMON_ITEMS: lines(o.common, 200).slice(0, 15) };
        const guestRules = (o.guestRules || []).map(r => ({ over: num(r.over), add: num(r.add) })).filter(r => r.over && r.add).slice(0, 5);
        const travelRules = (o.travelRules || []).map(r => ({ over: num(r.over), add: num(r.add) })).filter(r => r.over && r.add).slice(0, 5);
        if (items) Object.assign(P, { MODE: 'items', DEPOSIT_PERCENT: Math.min(100, num(o.depositPct)), EVENT_HOURS: 4,
            CATALOG: (o.rows || []).map(r => ({ label: txt(r.label, 80), price: num(r.price), desc: txt(r.desc, 300) })).filter(r => r.label).slice(0, 30) });
        else {
            const SERVICES = {};
            (o.rows || []).filter(r => txt(r.label, 80)).slice(0, 15).forEach((r, i) => {
                SERVICES['p' + (i + 1)] = { label: txt(r.label, 80), base: num(r.price), hours: Math.max(0, Number(r.hours) || 0), extraHour: num(r.extraHour), lead: '', items: lines(r.items, 200).slice(0, 15) };
            });
            Object.assign(P, { ORIGIN: { name: cityName, lat: c[0], lon: c[1] }, DEFAULT_SERVICE: Object.keys(SERVICES)[0] || '', DEPOSIT: num(o.deposit), SERVICES,
                GUEST_TIERS: toTiers(guestRules, 'מוזמנים'), TRAVEL_TIERS: toTiers(travelRules, 'ק"מ', 'מ' + cityName), EXTRA_FRACTION: { 0: 0, 15: 0.25, 30: 0.5, 45: 0.75 } });
        }
        return {
            business: B,
            theme: { brand: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : COLORS[0], background: '#F7F6F3', font: 'Assistant' },
            labels: { service: 'חבילה', included: items ? 'מה כלול' : 'מה כלול בחבילה', docTitle: 'הצעת מחיר והסכם', eventTypes: EVENT_TYPES.slice() },
            pricing: P,
            terms: lines(o.terms, 600).slice(0, 30),
            policy: { coolingDays: 14, coolingNoticeDays: 7, refundDays: 14, tiers: lines(o.tiers, 400).slice(0, 10), postpone: txt(o.postpone, 400) },
            editor: { guestRules, travelRules }
        };
    }
    // מספר זהות / עוסק / ח.פ ישראלי: 9 ספרות עם ספרת ביקורת
    function validIsraeliId(v){
        const d = String(v || '').replace(/\D/g, '');
        if (!d || d.length > 9 || /^0+$/.test(d)) return false;
        const s = d.padStart(9, '0');
        let sum = 0;
        for (let i = 0; i < 9; i++) { let x = Number(s[i]) * (i % 2 + 1); sum += x > 9 ? x - 9 : x; }
        return sum % 10 === 0;
    }

    /* ---- לוגו: הקטנה שעובדת בכל דפדפן (ספארי באייפון לא יודע לשמור webp ומחזיר png כבד — אז מקטינים עוד, ובסוף jpeg על רקע לבן) ---- */
    function loadImage(file){
        return new Promise((ok, bad) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => ok({ img, url });
            img.onerror = () => { URL.revokeObjectURL(url); bad(Object.assign(new Error('decode'), { code: 'decode' })); };
            img.src = url;
        });
    }
    async function processLogo(file, max, limit){
        if (!file || (file.type && !/^image\//.test(file.type))) throw Object.assign(new Error('type'), { code: 'type' });
        if (file.size > 25 * 1024 * 1024) throw Object.assign(new Error('huge'), { code: 'huge' });
        const { img, url } = await loadImage(file);
        try {
            let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) { w = h = max; }   // SVG בלי מידות
            const c = document.createElement('canvas'), g = c.getContext('2d');
            const draw = (size, bg) => { const k = Math.min(1, size / Math.max(w, h)); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
                g.clearRect(0, 0, c.width, c.height); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); } g.drawImage(img, 0, 0, c.width, c.height); };
            const colors = () => { draw(64); return logoColors(g.getImageData(0, 0, c.width, c.height).data); };
            for (const size of [max, Math.round(max * 0.75), Math.round(max * 0.55), Math.round(max * 0.4)]) {
                draw(size);
                let d = c.toDataURL('image/png'); if (d.length <= limit) { const col = colors(); return { logo: d, colors: col }; }
                d = c.toDataURL('image/webp', 0.85); if (d.startsWith('data:image/webp') && d.length <= limit) { const col = colors(); return { logo: d, colors: col }; }
            }
            for (const q of [0.85, 0.7, 0.55]) { draw(Math.round(max * 0.6), '#ffffff'); const d = c.toDataURL('image/jpeg', q); if (d.length <= limit) { const col = colors(); return { logo: d, colors: col }; } }
            throw Object.assign(new Error('big'), { code: 'big' });
        } finally { URL.revokeObjectURL(url); }
    }
    const hexOf = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
    const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    // הצבעים העיקריים בלוגו (RGB): מתעלמים משקוף ומלבן כמעט-טהור, מקבצים גוונים דומים, מסדרים לפי כמות (צבעוני קודם לאפור)
    function logoColors(px){
        const buckets = new Map();
        for (let i = 0; i < px.length; i += 4) {
            const r = px[i], gg = px[i + 1], b = px[i + 2], a = px[i + 3];
            if (a < 140 || (r > 238 && gg > 238 && b > 238)) continue;
            const key = (r >> 4) + ',' + (gg >> 4) + ',' + (b >> 4), o = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            o.n++; o.r += r; o.g += gg; o.b += b; buckets.set(key, o);
        }
        const list = [...buckets.values()].map(o => { const r = o.r / o.n, g = o.g / o.n, b = o.b / o.n, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            return { hex: hexOf(r, g, b), n: o.n, sat: mx ? (mx - mn) / mx : 0 }; })
            .sort((x, y) => (y.n * (0.35 + y.sat)) - (x.n * (0.35 + x.sat)));
        const out = [];
        for (const c of list) {
            const [r, g, b] = rgbOf(c.hex);
            if (out.every(h => { const [r2, g2, b2] = rgbOf(h); return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) > 70; })) out.push(c.hex);
            if (out.length >= 5) break;
        }
        return out;
    }
    // צבע שאפשר לכתוב עליו טקסט לבן ולהשתמש בו כטקסט על רקע בהיר (ניגודיות 4.5 לפחות): מכהים בהדרגה, באותו גוון
    const lum = hex => { const [r, g, b] = rgbOf(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrastWhite = hex => 1.05 / (lum(hex) + 0.05);
    function brandFrom(hex){
        if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return COLORS[0];
        let [r, g, b] = rgbOf(hex), out = hex.toUpperCase();
        for (let i = 0; i < 40 && contrastWhite(out) < 4.6; i++) { r *= 0.92; g *= 0.92; b *= 0.92; out = hexOf(r, g, b); }
        return out;
    }
    const logoError = e => e && e.code === 'decode' ? 'לא הצלחנו לפתוח את הקובץ. נסו תמונה מסוג PNG או JPG (צילום מסך של הלוגו עובד מצוין).'
        : e && e.code === 'type' ? 'אפשר להעלות רק תמונה (PNG, JPG, WEBP או SVG).'
        : e && e.code === 'huge' ? 'הקובץ גדול מאוד (מעל 25MB). נסו תמונה קטנה יותר.'
        : 'לא הצלחנו להשתמש בתמונה. נסו קובץ אחר.';

    // מקום יציאה שהוקלד חופשי → קואורדינטות (לחישוב מרחק הנסיעה). מהרשימה — בלי חיפוש
    async function findPlace(name){
        name = txt(name, 60);
        if (!name) return null;
        if (CITIES[name]) return { name, lat: CITIES[name][0], lon: CITIES[name][1] };
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=' + encodeURIComponent(name + ', ישראל'), { headers: { 'Accept-Language': 'he' } });
            const j = await r.json();
            if (j && j[0] && Number.isFinite(+j[0].lat)) return { name, lat: +j[0].lat, lon: +j[0].lon };
        } catch(e) {}
        return null;
    }

    window.VendorTemplates = { findPlace, processLogo, logoColors, brandFrom, contrastWhite, logoError, COLORS, DEFAULT_TERMS, DEFAULT_TIERS, DEFAULT_POSTPONE, EVENT_TYPES, CITIES, FIELDS, build, fromForm, toTiers, validIsraeliId };
})();
