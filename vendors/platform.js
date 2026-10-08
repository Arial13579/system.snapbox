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
    singleSession: false,     // חיבור אחד בלבד לכל ספק — כבוי לבקשת הבעלים (true = מפעיל שוב)
    contact: { phone: '051-2440252', whatsapp: '972512440252', email: 'arielkahalani1@gmail.com' },

    // גרסת תנאי השימוש לספקים. שינוי הגרסה מחייב כל ספק לאשר מחדש בכניסה הבאה
    termsVersion: '2026-10-07',

    // מחירון מכירת המערכת לספקים (משמש את "הצעת מחיר לספק" בלוח הניהול)
    sales: {
        plans: {
            launch:  { label: 'מחיר השקה', price: 1499, listPrice: 1999, freeSupportMonths: 2, limit: 5 },   // מוגבל ל-5 חתימות
            regular: { label: 'מחיר רגיל', price: 1999, listPrice: 1999, freeSupportMonths: 0 },
            custom:  { label: 'מחיר מותאם', price: 0,    listPrice: 0,    freeSupportMonths: 0 }
        },
        supportMonthly: 69
    }
};
