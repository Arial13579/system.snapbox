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
2. ב-repository ‏`hatzaa`: יוצרים את `<slug>/config.js` (ואם יש, `logo.png`).
   - **תמיד** מייצרים תמונת וואטסאפ: `node tools/make_og.mjs <hatzaa> <slug> --force` (מתוך תיקייה עם `playwright-core` ו-`@fontsource/assistant` מ-npm). נוצר `<slug>/og.jpg` 1200×630 מהשם, השורה והצבעים. כשמשנים אותה, מעלים `ogVersion` ב-config.
   - מריצים `python3 tools/make_pages.py`. PR ל-main.
   - **תמיד** טלפון + מייל ב-`business` (מופיעים בתיבת "יש שאלה?", בפוטר ובמסמכים המשפטיים).
   - **מצב מחירון:** DJ/להקות = מחירון אוטומטי (`SERVICES`, `GUEST_TIERS`...). מעצבים/צלמים וכו' = `pricing.MODE: 'items'` עם `CATALOG` (label, price, desc), `DEPOSIT_PERCENT`, `COMMON_ITEMS`. הספק בוחר פריטים, מזין מחיר ומקדמה.
   - `policy` (ימי צינון, מדרגות ביטול, דחייה) מוצג בדף `legal/refunds.html`. **לא מפרטים שמות של שירותי צד שלישי במסמכים המשפטיים** (בקשת הבעלים).
3. מוסיפים שורה ל-`vendors/registry.js`.
4. מעדכנים את שני ה-repositories (push).
5. הבעלים נכנס ל-`system.snapbox.co.il/vendors/`. הסנכרון רץ אוטומטית, ואז "כניסה לחשבון" לבדיקה (יצירת הצעה, חתימה, מחיקה).
   **מ-2026-10-07:** הסנכרון ממלא לבד את כרטיס הספק מההצעה החתומה שלו (לפי שם העסק: `name` ב-registry = `vendorName` בהצעה. אם ההצעה נחתמה בשם אחר, כותבים אותו ב-`offerName`). נכנסים איש קשר, טלפון, חבילה, סכום, תאריך רכישה, תמיכה וה-PDF החתום. זה קורה פעם אחת, רק לספק שעוד אין לו פרטי רכישה. הקוד: `fillFromOffer` ב-`admin.js`.
6. שולחים לספק את `system.snapbox.co.il/vendors/`. הוא מתחבר עם ה-Gmail שלו, ולוחץ "Activate" במייל מ-FormSubmit בפעם הראשונה שלקוח חותם.

## עדכון 2026-10-06 (לילה): ספקית בדיקה "אילנה", שליטת בעלים מלאה, כניסה משופרת
- **ספקית לבדיקה:** `ilana` · אילנה עיצוב אירועים · Gmail `snapboxevent.official@gmail.com` · טלפון לדוגמה 050-1234567 · בלי לוגו (אות "א") · צבע `#9C4668` · מצב פריטים, מקדמה 30%.
- **כניסה:** `Core.signIn` תמיד שולח `prompt: 'select_account'` (בלי זה Google בחר לבד את החשבון האחרון, ו"חשבון אחר" לא עבד). המייל האחרון נשמר במכשיר (`localStorage sb.lastEmail`) ומוצג "המשך בתור…" עם `login_hint`. מושהה ≠ לא רשום (הודעות נפרדות). **חשבון לא רשום מנותק מיד ולא נזכר** — המכשיר זוכר רק כניסה מוצלחת (בקשת הבעלים). לוח הניהול טוען את `registry.js` מחדש בכל סנכרון (בלי מטמון). אזהרה לדפדפן הפנימי של וואטסאפ/אינסטגרם.
- **מצבי חשבון** (חלון "ניהול" בלוח הניהול): פעיל / **מוגבל** (`limited: true` — צפייה בלבד, נאכף בכללים) / מושהה (`active: false`).
- **ביטול תמיכה:** `supportCancelled: true`, `supportCancelledAt`. מצב `cancelled` ב-`Core.supportStatus`.
- **מחיקה לצמיתות:** מקלידים את ה-slug לאישור. נכתב `deletedTenants/{slug}` (כדי שהסנכרון לא ייצור מחדש), ואז נמחקים quotes, consents, files, vendorIndex והכרטיס. "שחזור כחשבון ריק" מוחק את הרשומה.
- **ההסכם החתום של הספק:** `tenants/{slug}/files/agreement` (`pdfData`), וסיכום ב-`tenants/{slug}.agreement {at, source, label}`. הבעלים מעלה/מחליף PDF או משייך מהצעה חתומה (`platformQuotes`). הספק רואה כרטיס "ההסכם שלי עם Snap Box".
- **הקישור ללקוח הורחב:** שדות 13–14 (רק במצב פריטים): `label^qty^price` מופרדים ב-`~`, ואז `discount`. `Core.shareUrl` ↔ `quote.js` תואמים.
- **אחרי יצירת הצעה:** מוצגת תצוגת וואטסאפ (og.jpg) — "התמונה היא הקישור". שליחה ישירה לטלפון הלקוח אם הוזן.
- `termsVersion` עלה ל-`2026-10-06.2` (נוסף סעיף הגבלה/השהיה/מחיקה) — כל ספק יאשר שוב.
- ⚠️ **הכללים עודכנו** (limited, files, deletedTenants, מחיקת consents). המשתמש צריך להדביק את `firestore.rules` מחדש ב-Firebase ← Security ← Publish.
- בדיקות: `rules.test.mjs` 88/88, `full.e2e.js` 117/117 (כולל axe בכל דף).

## עדכון: קישורים קצרים + תמונה בוואטסאפ (בקשת הבעלים: "כתמונה, לא קישור עם מלא מילים")
- `shortLinks/{id}` = `{ q, kind:'quote'|'offer', tenant, createdAt }`. id אקראי 10 תווים. קריאה לפי id פתוחה לכולם (מכיל רק מה שהקישור הארוך הכיל), בלי list. ספק יוצר רק ל-tenant שלו (וכשמותר לו ליצור הצעות), הבעלים הכל.
- קישור ללקוח: `customerBase/<slug>/?k=<id>`. קישור להצעה לספק: `/offer/?k=<id>`. ה-id נשמר ב-`shortId` בהצעה (להעתקת קישור ולמחיקה). אם יצירת הקישור הקצר נכשלת — חוזרים לקישור הארוך `?q=` (עדיין נתמך).
- היסטוריה (2026-10-06): עברנו בין קישור קצר לקישור מלא בניסיון להסתיר את שורת הקישור בוואטסאפ, ושום דבר לא הסתיר אותה. **המצב הנוכחי: ראו "החלטה סופית 2026-10-07" בסוף הקובץ.** `offer/og.jpg` נוצר עם `make_og.mjs` (Snap Box, טורקיז).
- בדיקות: rules 106/106, e2e 125/125.

## וואטסאפ: שורת הקישור — אי אפשר להסתיר בוואטסאפ רגיל (נבדק אצל הבעלים)
- `wa.me/?text=<url>` → כרטיס תמונה + שורת קישור. כך גם במערכת הישנה (צילום מסך של הבעלים, 2026-10-06).
- נוסו ונכשלו בטלפון של הבעלים, ובוטלו: (1) קישור קצר, (2) wa.me בלי מספר, (3) תפריט השיתוף `navigator.share({url})`, (4) 1000 × U+200E לפני הקישור ("קרא עוד").
- (5) רענון כל הדפים ב-Facebook Sharing Debugger (Scrape Again) — התמונה מתעדכנת, אבל שורת הקישור נשארת. האזהרה היחידה שם: `fb:app_id` (לא רלוונטית לוואטסאפ).
- המצב הנוכחי: ראו "החלטה סופית 2026-10-07" בסוף הקובץ.
- תמונות תצוגה (og.jpg): `offer/og.jpg` (הצעה לספק), `og.jpg` בשורש (אתר המכירה + כניסת ספקים, נוסף אחרי אזהרת Debugger "og:image should be explicitly provided"). נוצרות עם `hatzaa/tools/make_og.mjs` — אפשר `og: { head, cta }` ב-config לכותרת ולכפתור מותאמים.
- הדרך היחידה לתמונה + כפתור בלי קישור גלוי: **WhatsApp Business (Cloud) API** — הודעת template עם כותרת תמונה וכפתור URL. דורש חשבון Meta Business, מספר עסקי ייעודי, אישור template, שרת (למשל Cloudflare Worker / Firebase Functions בתוכנית Blaze) ותשלום לשיחה. ממתין להחלטת הבעלים.

## מטמון בדפדפן
- GitHub Pages שומר קבצים במטמון עד ~10 דקות. לכן לכל `<script>`/`<link>` ב-`vendors/*.html` וב-`offer/index.html` יש `?v=<גרסה>`. **בכל שינוי ב-JS/CSS מעלים את הגרסה בכל הקבצים** (חיפוש והחלפה של `?v=`). ולבקש מהמשתמש לסגור ולפתוח את הדף לפני בדיקה.

## החלטות חשובות
- **אף פעם לא מבקשים סיסמאות של לקוחות או ספקים.**
- הבעלים יכול להיכנס לכל חשבון של ספק לצורך בדיקות. **לכתוב את זה בחוזה עם הספק.**
- כל הספקים משתמשים באותו פרויקט Firebase, כך שהמכסה החינמית משותפת. כדאי סעיף פרטיות בחוזה עם הספקים.
- **השהיה** חוסמת את הספק מיד, אבל הלקוחות שלו עדיין יכולים לחתום על הצעות שכבר נשלחו.
- **רק לבעלים יש שליטה** על מצב החשבון, התמיכה, ההסכם והמחיקה (נאכף בכללי Firestore ונבדק).

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

## עדכון 2026-10-07: חזרה לקישורים קצרים + שליחה ישירה לטלפון (בקשת הבעלים)
- הבעלים ביקש שוב "רק תמונה". הוסבר שאי אפשר להסתיר את שורת הקישור דרך wa.me, ולכן לפי בקשתו: **קישור קצר בכל מקום** (הצעות ספקים ללקוחות + הצעות לספקים). `shortId` נשמר במסמך, "העתק קישור" מחזיר את הקצר (`Core.shortUrl`), ואם יצירת הקישור הקצר נכשלת — הקישור הארוך.
- כפתור הוואטסאפ: `Core.bindWhatsApp(a, url, phone)` → `wa.me/<972…>?text=<url>` כשהוזן טלפון (`Core.waPhone` ממיר 05x/‎+972/00972), אחרת `wa.me/?text=`. בהצעת ספק ללקוח — `clientPhone`; בהצעה לספק — `phone`.
- גרסת מטמון: `?v=20261007c` (עכשיו `?v=20261007d`, ראו בסוף הקובץ).

## מחקר 2026-10-07: "רק תמונה" בוואטסאפ — מה אפשרי (בקשת הבעלים: "תבדוק בפעם האחרונה")
- **הודעה שהיא רק תמונה שפותחת קישור, בלי שום טקסט, לא קיימת בוואטסאפ:** לא ברגיל, לא בביזנס ולא ב-API.
  - template ב-Cloud API: חובה טקסט (body). מ-2025 לחיצה על תמונת הכותרת פותחת את ה-URL, אבל הטקסט והכפתור נשארים.
  - קטלוג בוואטסאפ ביזנס: כרטיס מוצר עם כפתור "צפייה", והקישור מופיע רק בפרטי המוצר.
  - API לא רשמי (Green API, Baileys): הקישור חייב להופיע בטקסט, ויש סכנה שהמספר ייחסם. לא להציע.
- **הכי קרוב, כבר מובנה בוואטסאפ:** מגרסה 26.1.74 של WhatsApp לאייפון (ינואר 2026), קישור עם תצוגה מקדימה מוצג ככרטיס (תמונה, כותרת, 🔗 דומיין) **בלי** הקישור הארוך.
  - לחיצה על הכרטיס פותחת את הקישור. לחיצה על הדומיין מציגה את הקישור המלא.
  - לפי WABetaInfo: רק כשיש תצוגה מקדימה עשירה שלא הוסרה. אם השולח כיבה תצוגות מקדימות, מוצג הנתיב המלא.
  - באנדרואיד אין את זה (יש רק favicon ליד הדומיין).
- **מה נראה אצל הבעלים:** בצילום המסך (אייפון, צ'אט "שליחת הודעה לעצמך", 2026-10-06) הכרטיס כבר בעיצוב החדש, ובכל זאת הקישור המלא מופיע מתחתיו.
  - הסיבה לא ידועה. השערות: (1) הודעה לעצמך או הודעה יוצאת, (2) ה-`?` בקישור, (3) `og:url` שונה מהקישור.
- **בדיקה שהוצעה לבעלים (בוטלה: הבעלים בחר "תמונה + קישור", ראו בסוף הקובץ):**
  1. לשלוח לעצמו שלושה קישורים: `https://system.snapbox.co.il/`, `https://system.snapbox.co.il/?k=test`, `https://system.snapbox.co.il/#k=test`.
  2. לשלוח הצעה אמיתית לחבר עם אייפון, ולבקש צילום מסך.
  - אם רק עם `#` הקישור הארוך נעלם: להעביר את כל הקישורים ל-`#k=`/`#q=` (ולהמשיך לתמוך ב-`?`). להציג לבעלים את השורות לפני השינוי.
- **המערכת הישנה (`SnapBoxEvent_quotation`):** עברה לקישור קצר `?k=<quoteId>` ב-2026-10-07.
  - פרויקט Firebase: `wedding-rsvp-e2e0f`, אוסף `snapbox_quotes`.
  - קריאה בלי התחברות מותרת: REST החזיר 404 על מסמך שלא קיים, ולא 403.

## החלטה סופית 2026-10-07: תמונה + קישור קצר בכל המערכות (בקשת הבעלים: "שלכולם יהיה את התמונה או כרטיס ויהיה את הקישור להצעת מחיר")
- **לא מנסים יותר להסתיר את שורת הקישור.** כל הודעת וואטסאפ = כרטיס התמונה (og) ומתחתיו קישור קצר להצעה. לחיצה על התמונה או על הקישור פותחת את ההצעה.
- **המערכות והקישורים:**

  | מערכת | הקישור |
  |---|---|
  | ספק → לקוח | `arial13579.github.io/hatzaa/<slug>/?k=<id>` (`shortLinks`) |
  | בעלים → ספק | `system.snapbox.co.il/offer/?k=<id>` (`shortLinks`) |
  | Snap Box הישנה (`SnapBoxEvent_quotation`) | `?k=<quoteId>` (שדה `q` ב-`snapbox_quotes`, פרויקט `wedding-rsvp-e2e0f`) |
  | CHECK | `?k=<id>` (`shortLinks`, `tenant:'check'`, ו-`shortId` ב-`check_quotes`) |

  - בכולן: אם יצירת הקישור הקצר נכשלת, נשלח הקישור המלא `?q=`.
- **ההודעה בוואטסאפ:**
  - במערכת הספקים, כשהוזן טלפון, ההודעה נשלחת ישר לצ'אט של הלקוח או הספק (`wa.me/<972…>?text=`). אחרת, `wa.me/?text=`.
  - ב-CHECK וב-Snap Box הישנה: `wa.me/?text=`.
- **בתצוגה המקדימה של התוצאה** (`app.html` ‏`#wa-preview-url`, ‏`admin.html` ‏`#o_wa_url`) מוצגת גם שורת הקישור מתחת לכרטיס, כמו שהלקוח רואה בפועל. ההסבר: "הלקוח יקבל את התמונה ומתחתיה קישור קצר".
- גרסת מטמון: `?v=20261007d`.
- **בדיקות:**
  - `full.e2e.js` עודכן לקישור הקצר, לשליחה ישירה לטלפון ולשורת הקישור.
  - ב-repository ‏`check`: `_tests/check.e2e.js`.

## ספק לדוגמה "snap cup" (`snapcup`), הוקם 2026-10-07
- **מקור:** "סיכום להקמה" + פרטי העסק שהבעלים שלח.
- **פרטים:**
  - שם: snap cup · תיאור: "צלם אחלה כבר ביקר לי" · תחום: צלם
  - מספר עוסק 3333333 · טלפון 054-6056180
  - מייל ללקוחות ולחוזים: `snapboxevent.official@gmail.com`
  - איש קשר: דוד לוי
  - מחיר רגיל, שולם ₪1,999 · תמיכה: 0 חודשים · נחתם 7.10.2026 13:12
- **ההצעה נחתמה בשם "כחגח"**, ולכן ב-registry יש `offerName: 'כחגח'`.
- **slug:** `snapcup`.
  - קודם היה `kachgach`, והוחלף כשהגיע השם האמיתי.
  - אם הסנכרון כבר יצר כרטיס `kachgach`, הוא יופיע עם "⚠ לא ברשימת הספקים" ואפשר למחוק אותו.
- **מצב פריטים, מקדמה 30%.** 8 פריטי צילום:

  | פריט | מחיר |
  |---|---|
  | סטילס | ₪3,500 |
  | צלם נוסף | ₪1,800 |
  | וידאו | ₪4,500 |
  | קליפ | ₪900 |
  | רחפן | ₪1,200 |
  | אלבום | ₪1,600 |
  | טרום אירוע | ₪1,500 |
  | שעה נוספת | ₪450 |
- **צבע:** `#92400E`. הצבע `#B45309` נכשל ב-AA על `.total .v`.
- ⚠️ **המייל `snapboxevent.official@gmail.com` מכיל "snapbox", והלקוחות רואים אותו.** לבדיקה זה בסדר. אצל ספק אמיתי שמים את המייל שלו.
- **חסר: Gmail להתחברות** (`admins: []`). המייל `snapboxevent.official@gmail.com` כבר מחובר לאילנה, וכל Gmail שייך לעסק אחד בלבד (`vendorIndex`).
- **זמני:** המחירון והתנאים לדוגמה.
- **בדיקה:** `_tests/onboard.e2e.js`, ‏38/38.
- **תיקון אגב:** `.catalog button small` צבוע `#3F5A56`, כי muted נכשל ב-AA על רקע ה-hover.
- גרסת מטמון: `?v=20261007f`.
