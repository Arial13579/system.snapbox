/* מסמכים משפטיים משותפים — מותאמים לספק לפי ?t=<slug>. */
(function(){
    const params = new URLSearchParams(location.search);
    const slug = (params.get('t') || '').toLowerCase(), q = params.get('q');
    const DOC = document.body.getAttribute('data-doc');
    const app = document.getElementById('app');
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) { app.innerHTML = '<div class="page"><div class="card card-b">הדף לא נמצא.</div></div>'; return; }
    const s = document.createElement('script');
    s.src = '../' + slug + '/config.js';
    s.onerror = () => { app.innerHTML = '<div class="page"><div class="card card-b">הדף לא נמצא.</div></div>'; };
    s.onload = render;
    document.head.appendChild(s);

    function render(){
        const T = window.TENANT, B = T.business || {}, esc = Brand.esc;
        Brand.apply(T);
        window.PRIVACY_URL = 'privacy.html?t=' + slug;
        const name = `<strong>${esc(B.name)}</strong>${B.businessId ? ` (${esc(B.businessId)})` : ''}`;
        const mail = B.email ? `<a href="mailto:${esc(B.email)}">${esc(B.email)}</a>` : '';
        const docs = {
            terms: ['תנאי שימוש', [
                ['כללי', `מסמך זה מסדיר את השימוש בדף הצעת המחיר וההסכם הדיגיטלי של ${name} ("העסק"). צפייה בהצעה וחתימה עליה מהוות הסכמה לתנאים אלה.`],
                ['ההזמנה', 'ההזמנה נחשבת סופית ומחייבת רק לאחר החתימה על ההסכם האישי ותשלום המקדמה הנקובה בו. תנאי התשלום, הביטול וההחזרים המלאים מפורטים בהסכם עצמו ומהווים חלק בלתי נפרד ממסמך זה.'],
                ['תוקף החתימה הדיגיטלית', 'החתימה הניתנת בדף היא חתימה אלקטרונית מחייבת לפי הדין בישראל. לחיזוק תוקפה מתועדים בעת החתימה תאריך ושעה, כתובת IP וסוג הדפדפן, כמפורט במדיניות הפרטיות.'],
                ['הגבלת אחריות', 'הדף ניתן כפי שהוא. העסק אינו אחראי לתקלות שמקורן בחיבור האינטרנט, בדפדפן או במכשיר של המשתמש/ת.'],
                ['דין וסמכות שיפוט', 'על מסמך זה חלים דיני מדינת ישראל בלבד.'],
                ['יצירת קשר', mail || '—']
            ]],
            privacy: ['מדיניות פרטיות ועוגיות', [
                ['אילו נתונים נאספים', `פרטי ההצעה (שם הלקוח, פרטי האירוע, מחיר והערות) מוזנים על ידי ${name}. בעת החתימה נאספים החתימה הדיגיטלית ונתוני התיעוד שלה: מועד החתימה, כתובת ה-IP (באמצעות השירות ipify) וסוג הדפדפן. הדף אינו מבקש מהלקוח טלפון, אימייל או פרט מזהה נוסף.`],
                ['היכן המידע נשמר ולאן הוא נשלח', 'פרטי ההצעה וסטטוס החתימה נשמרים במסד נתונים מאובטח (Google Firebase) שרק העסק מורשה לקרוא. עם החתימה נשלחים פרטי ההזמנה, החתימה ועותק ה-PDF לתיבת המייל של העסק באמצעות שירות טפסים חיצוני (FormSubmit). עותק גיבוי זמני של ה-PDF מועלה לשירות tmpfiles.org לצורך קישור הורדה, ונמחק ממנו אוטומטית תוך כשעה. ה-PDF עצמו נוצר במכשיר שלך.'],
                ['עוגיות ואחסון מקומי', 'הדף אינו משתמש בעוגיות פרסום או מעקב. נשמר במכשיר רק מידע טכני: סגירת הודעת העוגיות והעדפות הנגישות שבחרת.'],
                ['אבטחת מידע', 'כל התעבורה מוצפנת (HTTPS). הקישור האישי מכיל את פרטי ההזמנה — מומלץ לא להעבירו למי שאינו צד להזמנה.'],
                ['הזכויות שלך', `אפשר לפנות לעסק בכל עת לעיון, לתיקון או למחיקה של מידע שנשמר בנוגע להזמנה שלך: ${mail || '—'}`]
            ]],
            accessibility: ['הצהרת נגישות', [
                ['מחויבות לנגישות', 'הדף נבנה בהתייחס להנחיות WCAG 2.1 ברמה AA ולחוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998.'],
                ['מה הונגש', 'תפריט נגישות (ניגודיות גבוהה, הגדלת טקסט, הדגשת קישורים ומקטעים), מבנה כותרות תקין, תוויות לשדות, ניווט מקלדת, כיבוד הגדרת "הפחתת תנועה", ותצוגה מותאמת לטלפון, טאבלט ומחשב.'],
                ['מגבלות ידועות', 'תיבת החתימה (ציור באצבע או בעכבר) אינה נגישה למי שאינו יכול לצייר — מי שזקוק/ה לחלופה מוזמן/ת לפנות לעסק, ותוסדר חתימה בדרך אחרת. קובץ ה-PDF אינו PDF מתויג.'],
                ['פנייה בנושא נגישות', mail || '—']
            ]]
        };
        const [title, sections] = docs[DOC] || docs.terms;
        document.title = `${title} | ${B.name}`;
        const back = q ? `../${slug}/?q=${encodeURIComponent(q)}` : null;
        app.innerHTML = `<div class="page">
            ${Brand.headerHtml(T, '../' + slug + '/')}
            ${back ? `<a href="${back}" class="link" style="align-self:flex-start">→ חזרה להצעת המחיר</a>` : ''}
            <h1 style="margin:0;font-size:28px;font-weight:900">${title}</h1>
            ${sections.map(([h, body], i) => `<section class="card"><div class="card-h"><span class="n">${i + 1}</span><h2>${h}</h2></div><div class="card-b" style="font-size:14.5px;line-height:1.85">${body}</div></section>`).join('')}
            <p class="hint" style="text-align:center">עודכן לאחרונה: 06.10.2026</p>
            ${Brand.footerHtml(T, '', q)}
        </div>`;
    }
})();
