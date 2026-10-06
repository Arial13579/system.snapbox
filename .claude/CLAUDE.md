# זיכרון הפרויקט: מערכת הספקים של Snap Box

> Claude קורא את הקובץ הזה אוטומטית בכל שיחה על ה-repository. לעדכן בכל החלטה חשובה. בלי סיסמאות ובלי מפתחות סודיים.
> (הקובץ נמצא ב-`.claude/`, ולכן GitHub Pages לא מפרסם אותו.)

## הבעלים
- **arielkahalani1@gmail.com**: הבעלים של המערכת ושל פרויקט ה-Firebase. GitHub: **Arial13579**.
- המשתמש מדבר עברית, עובד הרבה מהטלפון ולא מתכנת. הסברים בעברית פשוטה, צעד אחר צעד, עם שמות כפתורים מדויקים.
- **הבעלים לא רוצה לעשות כלום חוץ מלאסוף נתונים מספקים ולבדוק.** Claude בונה ומקים הכל.
- עסקים נוספים (repositories נפרדים): SnapBoxEvent (snapbox.co.il, עמדת צילום), SnapBoxEvent_quotation (מערכת ההצעות המקורית), check (מערכת DJ במיתוג CHECK).

## מה המערכת
פלטפורמה שמוכרת לספקי אירועים (DJ, צלמים, מעצבים ועוד) מערכת הצעות מחיר וחוזים דיגיטליים. לכל ספק מיתוג, מחירון וחוזה משלו.
מחיר המכירה (בדף הזה): השקה ₪1,499 כולל חודשיים תמיכה, רגיל ₪1,999, תמיכה ₪69 לחודש. וואטסאפ 051-2440252.

### שני אתרים נפרדים (החלטה מ-2026-10-06)
| | מי רואה | איפה |
|---|---|---|
| **צד הספק**: כניסה, מחולל הצעות, לוח בקרה, לוח ניהול לבעלים | ספקים והבעלים | **system.snapbox.co.il/vendors/** (ה-repository הזה) |
| **צד הלקוח**: דף ההצעה, חתימה, PDF, מסמכים משפטיים | הלקוחות של הספקים | **אתר ניטרלי, בלי שום Snap Box ובלי check**. כרגע `https://arial13579.github.io/hatzaa` (repository בשם `hatzaa`). |

- ✅ **ה-repository ‏`Arial13579/hatzaa` קיים** (נוצר ב-2026-10-06) ומכיל את כל צד הלקוח. **שם עורכים את הקוד של צד הלקוח, לא כאן.** (התיקייה `_customer-site/` הוסרה מכאן.)
  ⚠️ צריך שהמשתמש יפעיל GitHub Pages ב-hatzaa: Settings ← Pages ← main / root.
- **תוכנית:** לקנות דומיין ניטרלי (רעיונות: hatzaa.co.il, hatzaot.co.il) ולחבר אותו ל-`hatzaa`. אחר כך לעדכן `customerBase` ב-`vendors/platform.js` ואת `BASE` ב-`hatzaa/tools/make_pages.py`.
- הספק עצמו יודע שזו מערכת של Snap Box, וזה בסדר. **הלקוח של הספק לא אמור לראות Snap Box בשום מקום**: לא בקישור, לא בדף, לא ב-PDF ולא בתצוגה המקדימה בוואטסאפ.

## קבצים
**`vendors/` (צד הספק, ב-repository הזה):**
- `index.html`: כניסה עם Google. הבעלים מועבר ל-`admin.html`. ספק מועבר ל-`app.html?t=<slug>`, לפי `vendorIndex/{email}`. אחרת מוצגת ההודעה "לא רשום".
- `app.html` + `app.js`: חשבון הספק, עם טאבים "הצעה חדשה" ו"לוח בקרה". ההגדרות של הספק נטענות מ-`customerBase/<slug>/config.js`. כשהבעלים צופה בחשבון של ספק מופיע באנר.
- `admin.html` + `admin.js`: לבעלים בלבד.
  - **מסנכרן את `registry.js` ל-Firebase בכל כניסה**: יוצר או מעדכן `tenants/{slug}`, ומעדכן את `vendorIndex/{email}` (ומוחק מיילים שהוסרו).
  - מציג סטטיסטיקות.
  - **השהיה והפעלה** של ספק (`active`).
  - כפתור "כניסה לחשבון" של כל ספק.
- `core.js`: Firebase, התחברות, `shareUrl()` (פורמט הקישור), `loadTenant()`.
- `platform.js`: `ownerEmail`, `customerBase`, ההגדרות של Firebase.
- `registry.js`: **רשימת הספקים** (`slug`, `name`, `admins`). זה המקום היחיד שמוסיפים בו ספק בצד הזה.
- `vendor.css`: שפת העיצוב של system.snapbox (טורקיז, Assistant + Secular One).
- `firestore.rules` (בשורש): עותק של הכללים שפורסמו ב-Firebase. **פורסמו בהצלחה ב-2026-10-06.**

**צד הלקוח: ב-repository ‏`hatzaa` (לא כאן):**
- `assets/quote.js`: דף ההצעה ללקוח. בונה את כל ה-DOM, חתימה, PDF (html2canvas + jsPDF), FormSubmit, עדכון `tenants/{slug}/quotes/{id}`, יומן.
- `assets/brand.js`: צבעי הספק (`theme.brand`), לוגו או אות ראשונה, פוטר.
- `assets/quote.css`, `icons.js`, `cookie.js`, `a11y.js`, `platform.js`, `favicon.svg`.
- `legal/terms|privacy|accessibility.html?t=<slug>`: מסמכים משותפים, ממותגים לפי הספק.
- `<slug>/config.js`: **כל ההגדרות של הספק**: `business` (name, tagline, email, phone, businessId, logo), `theme` (brand, background, font), `labels` (service, included, docTitle, eventTypes), `pricing` (ORIGIN, DEFAULT_SERVICE, DEPOSIT, SERVICES, COMMON_ITEMS, GUEST_TIERS, TRAVEL_TIERS, EXTRA_FRACTION), `terms[]` (עם `{name}`).
- `<slug>/index.html`: **נוצר על ידי `tools/make_pages.py`** (בגלל תגי התצוגה המקדימה בוואטסאפ). לא עורכים אותו ידנית.
- `demo/`: ספק לדוגמה.

**`_tests/`:** `rules.test.mjs` (36 בדיקות כללים), `e2e.js` (בדיקה מקצה לקצה, Playwright מול אמולטורים). שניהם עברו.

## עדכון 2026-10-06 (ערב): לוח ניהול מלא, הצעות לספקים, משפטי ונגישות
- **אתר המכירה** (`index.html`): כפתור "כניסת ספקים", קישורים בפוטר לתנאים, לפרטיות ולנגישות, קישור דילוג לתוכן, תפריט נגישות והודעת עוגיות (`common/a11y.js`, `common/cookie.js`). הצבעים תוקנו כך שעוברים WCAG AA (טורקיז `#0f766e` במקום `#0d9488`).
- **`legal/`**: `terms.html` (תנאי שימוש והסכם שירות לספקים), `privacy.html`, `accessibility.html`. הם בעיצוב של מערכת הספקים, עם תוכן עניינים.
- **ספק, בכניסה הראשונה**: מסך אישור תנאים. נשמר ב-`tenants/{slug}/consents/{email|version}`. הגרסה מוגדרת ב-`platform.js → termsVersion`. **כשמשנים את התנאים, מעלים את הגרסה, וכל ספק יאשר שוב.**
- **כרטיס "תמיכה טכנית"** בחשבון הספק: נותרו X חודשים, עד תאריך, עם כפתור חידוש בוואטסאפ. מבוסס על `tenants/{slug}.supportUntil`. ספק **לא יכול** לשנות את זה (נבדק).
- **לוח הניהול** (`admin.html`), בשלושה טאבים:
  1. **ספקים**:
     - מדדים: ספקים, תמיכה פעילה, תמיכה שמסתיימת בתוך 30 יום, תמיכה שהסתיימה, הצעות, סכום מכירות.
     - טבלה: איש קשר, חבילה ורכישה, תמיכה, הצעות, פעילות אחרונה, אישור תנאים, סטטוס.
     - חלון **"עריכה ותמיכה"** (contactName, phone, plan, pricePaid, purchaseDate, supportUntil, עם כפתורי ‎+חודש/+חודשיים/+3/+6/+12 וביטול, ו-notes פנימיות).
  2. **הצעת מחיר לספק**: חבילה (השקה / רגיל / מותאם, מתוך `platform.js → sales`), חודשי תמיכה כלולים, תמיכה בתשלום (חודשים × ₪69), הנחה, תוקף, הערות. יש סיכום חי. יוצר `platformQuotes/{id}` וקישור `offer/?q=…`, ושולח בוואטסאפ ישר לטלפון של הספק.
  3. **הצעות שנשלחו**: סטטוס, PDF חתום, העתקת קישור, "סיכום להקמה" (מעתיק סיכום לשליחה ל-Claude) ומחיקה.
- **`offer/`**: דף ההצעה לספק במיתוג Snap Box. כולל מה מקבלים, מחיר, איך זה עובד, תנאי ההסכם (עם קישור לתנאים המלאים), חתימה, PDF, מייל לבעלים (FormSubmit אל `contact.email`), ועדכון `platformQuotes`. הצעה שפג תוקפה לא ניתנת לחתימה.
  **פורמט הקישור:** `id|vendorName|contactName|businessType|plan|price|freeMonths|extraMonths|monthly|discount|total|notes|validDays|createdISO|phone|listPrice`. `admin.js offerUrl()` ו-`offer.js` חייבים להיות תואמים.
- ⚠️ **הכללים עודכנו** (consents ו-platformQuotes). **המשתמש צריך להדביק את `firestore.rules` מחדש ב-Firebase ← Security ← Publish.** עד שזה נעשה: אישור התנאים ויצירת הצעות לספקים ייכשלו בהרשאות.
- בדיקות: `_tests/rules.test.mjs` (60/60), `_tests/full.e2e.js` (52/52, כולל axe WCAG AA בכל דף).

## מבנה הנתונים ב-Firebase
- פרויקט **check-b2a66**. ⚠️ **מסד הנתונים נקרא `default`, לא `(default)`.** בקוד: `getFirestore(app, 'default')`.
- `tenants/{slug}`: `{ slug, name, admins:[emails], active, createdAt }`. כותב: רק הבעלים.
- `tenants/{slug}/quotes/{id}`: `{ clientName, eventType, service, location, date, startTime, endTime, guests, price, deposit, notes, status:'pending'|'signed', createdAt, createdBy, signedAt, ip, userAgent, pdfData }`.
- `vendorIndex/{email}`: `{ tenant: slug }`. מחובר יכול לקרוא רק את הרשומה של המייל שלו.
- `tenants/{slug}` שדות מנוי (רק הבעלים כותב): `contactName, phone, plan, pricePaid, purchaseDate, supportUntil (YYYY-MM-DD), notes, updatedAt`.
- `tenants/{slug}/consents/{email|version}`: `{ email, version, acceptedAt, userAgent }`. הספק יוצר פעם אחת, ואי אפשר לשנות או למחוק.
- `platformQuotes/{id}`: הצעות של הבעלים לספקים. רק הבעלים קורא, יוצר ומוחק. חתימה אנונימית בדיוק כמו בהצעות של ספקים.
- `check_quotes/{id}`: המערכת הישנה של CHECK. נשארה עובדת.
- **כללים:**
  - הבעלים: הכל.
  - ספק: רק ה-tenant שלו, ורק כש-`active == true`.
  - לקוח בלי התחברות: רק `pending` ל-`signed` עם השדות status, signedAt, ip ו-userAgent, ואחר כך `pdfData` פעם אחת.
- Authorized domains: localhost, check-b2a66.firebaseapp.com, check-b2a66.web.app, arial13579.github.io, **system.snapbox.co.il**. נבדק עם `getProjectConfig`. (`createAuthUri` **לא** בודק דומיינים, אז לא לסמוך עליו.)
- אם הדומיין הניטרלי יחובר: **אין צורך** להוסיף אותו ל-Authorized domains, כי צד הלקוח לא מתחבר.

**פורמט הקישור ללקוח:** `customerBase/<slug>/?q=` ואחריו base64url של השדות הבאים, מחוברים ב-`|`:
`name|eventType|location|date|startTime|endTime|guests|price|deposit|notes|quoteId|service`.
`Core.shareUrl` ו-`quote.js` חייבים להישאר תואמים.

## הקמת ספק חדש (Claude עושה הכל)
1. מקבלים מהבעלים את הנתונים:
   - שם לחוזה, שורת תיאור, לוגו (SVG או PNG שקוף), צבעים או "תחליט אתה", עוסק או ח.פ, טלפון, עיר יציאה.
   - **כתובת Gmail להתחברות (בלי סיסמה, אף פעם)**, מייל לקבלת חוזים, slug רצוי.
   - חבילות (מחיר, שעות כלולות, מחיר לשעה נוספת), מה כלול, תוספות לפי מוזמנים ולפי מרחק, מקדמה, תנאי ביטול ותשלום.
2. ב-repository ‏`hatzaa`: יוצרים את `<slug>/config.js` (ואם יש, `logo.png` ו-`og.jpg` בגודל 1200×630). מריצים `python3 tools/make_pages.py`. PR ל-main.
3. מוסיפים שורה ל-`vendors/registry.js`.
4. מעדכנים את שני ה-repositories (push).
5. הבעלים נכנס ל-`system.snapbox.co.il/vendors/`. הסנכרון רץ אוטומטית, ואז "כניסה לחשבון" לבדיקה (יצירת הצעה, חתימה, מחיקה).
6. שולחים לספק את `system.snapbox.co.il/vendors/`. הוא מתחבר עם ה-Gmail שלו, ולוחץ "Activate" במייל מ-FormSubmit בפעם הראשונה שלקוח חותם.

## החלטות חשובות
- **אף פעם לא מבקשים סיסמאות של לקוחות או ספקים.**
- הבעלים יכול להיכנס לכל חשבון של ספק לצורך בדיקות. **לכתוב את זה בחוזה עם הספק.**
- כל הספקים משתמשים באותו פרויקט Firebase, כך שהמכסה החינמית משותפת. כדאי סעיף פרטיות בחוזה עם הספקים.
- **השהיה** חוסמת את הספק מיד, אבל הלקוחות שלו עדיין יכולים לחתום על הצעות שכבר נשלחו.

## הערות עבודה ל-Claude
- ⚠️ GitHub Pages מפרסם מ-**`main`**. ה-branch `claude/friendly-bardeen-ki4o7d` מוגדר כ-default ב-GitHub, אבל **הוא לא מה שבאוויר**. עובדים על ה-branch, פותחים PR ל-`main` ועושים squash merge, ואז האתר מתעדכן. אחרי מיזוג: `git fetch origin main && git checkout -B claude/friendly-bardeen-ki4o7d FETCH_HEAD`, ואחרי ה-commit: `merge -s ours` של ה-branch הישן, ואז push (force חסום).
- `create_repository` מחזיר 403. Force push חסום.
- בסביבת הענן הרשת חוסמת את cdnjs, jsDelivr ו-gstatic. לבדיקות:
  - Playwright עם `executablePath: '/opt/pw-browsers/chromium'`.
  - ספריות מ-npm.
  - `firebase emulators:exec --only firestore,auth` (יש Java).
  - **שתי מלכודות בבדיקות:**
    1. ה-SDK של Firebase חייב להיות מופע אחד: לנתב את 10.12.0 ל-`export * from` של הגרסה המקומית.
    2. דף https לא יכול לדבר עם אמולטור http, אז את דף הלקוח פותחים דרך localhost.
  - Hook לבדיקות: `window.__EMU__ = {firestore:8085, auth:9099}`. התחברות בבדיקה: `__fb.authMod.signInWithCredential(..., GoogleAuthProvider.credential(JSON.stringify({sub,email,email_verified:true})))`.
- אין גישה לדפדפן של המשתמש. כשצריך פעולה בממשק של Firebase או GitHub, מבקשים צילום מסך ומדריכים לפיו. בממשק החדש של Firebase הלשונית Rules נקראת **Security**.
