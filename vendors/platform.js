/* מערכת הספקים — הגדרות כלליות (ציבוריות, אין כאן סודות). */
window.PLATFORM = {
    ownerEmail: 'arielkahalani1@gmail.com',
    // הכתובת שבה הלקוחות של הספקים פותחים את ההצעה (בלי שום אזכור של Snap Box)
    customerBase: 'https://arial13579.github.io/hatzaa',
    firebase: {
        apiKey:            'AIzaSyC57wmkBOtr7tCF_Uv-LPv6BFCVIcXAyqM',
        authDomain:        'check-b2a66.firebaseapp.com',
        projectId:         'check-b2a66',
        storageBucket:     'check-b2a66.firebasestorage.app',
        messagingSenderId: '928170638673',
        appId:             '1:928170638673:web:878d75caeda5469296e770'
    },
    firestoreDatabaseId: 'default',

    // פרטי קשר של Snap Box (מוצגים לספקים ובהצעות המחיר לספקים)
    supportReminderDays: 7,   // מייל תזכורת אחד בשבוע האחרון של התמיכה הטכנית
    singleSession: true,      // חיבור אחד בלבד לכל ספק (הבעלים פטור). false = כבוי
    contact: { phone: '051-2440252', whatsapp: '972512440252', email: 'arielkahalani1@gmail.com' },

    // גרסת תנאי השימוש לספקים. שינוי הגרסה מחייב כל ספק לאשר מחדש בכניסה הבאה
    termsVersion: '2026-10-12.3',

    // תקופת ניסיון חינם (vendors/trial.html): בלי תשלום ובלי התחייבות. אחרי הימים — צפייה בלבד, עד מעבר למנוי
    trial: { days: 3 },

    // מחירון מכירת המערכת לספקים (משמש את "הצעת מחיר לספק" בלוח הניהול)
    sales: {
        plans: {
            launch:  { label: 'מחיר השקה', price: 1499, listPrice: 1499, freeSupportMonths: 2, limit: 5, lifetime: true },   // מוגבל ל-5 חתימות · רישיון לכל החיים
            regular: { label: 'מנוי שנתי', price: 400, listPrice: 400, freeSupportMonths: 0 },                // ₪400 לשנה, כל שנה (בלי תמיכה)
            custom:  { label: 'מחיר מותאם', price: 0,    listPrice: 0,    freeSupportMonths: 0 }
        },
        supportMonthly: 89,
        // רישיון שימוש: מבצע ההשקה — לכל החיים. כל השאר — שנה מהחתימה, וחידוש ב-renewalYearly לשנה (בלי תמיכה).
        // תזכורת במייל לפני סוף השנה: חודש לפני ושבוע לפני (renewalReminderDays)
        licenseYears: 1,
        renewalYearly: 400,
        renewalReminderDays: [30, 7],
        // אותיות קטנות — בכל מקום שמופיעה חבילה / רישיון
        licenseNote: '"לכל החיים" והמנוי השנתי — כל עוד Snap Box מפעילה את השירות. אם הפעילות של Snap Box תיפסק, הרישיון, המנוי והתמיכה יסתיימו.'
    }
};
