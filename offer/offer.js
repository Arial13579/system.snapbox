/* הצעת מחיר של Snap Box לספק: הצגה, חתימה, PDF, שליחה לבעלים ועדכון platformQuotes/{id}. */
(async function(){
    const $ = id => document.getElementById(id), esc = Core.esc, PF = Core.PF, CT = PF.contact || {};
    const params = new URLSearchParams(location.search), main = $('main');
    let qp = params.get('q');
    if (!qp && params.get('k')) qp = await Core.resolveShortLink(params.get('k'));   // קישור קצר
    const money = Core.money;

    function b64UrlDecode(str){
        str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '=';
        const bin = atob(str), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    let o;
    try {
        const p = b64UrlDecode(qp || '').split('|');
        if (p.length < 14 || !p[0]) throw new Error('bad');
        o = { id: p[0], vendorName: p[1], contactName: p[2], businessType: p[3], plan: p[4], price: +p[5] || 0, freeMonths: +p[6] || 0,
              extraMonths: +p[7] || 0, monthly: +p[8] || 0, discount: +p[9] || 0, total: +p[10] || 0, notes: p[11] || '', validDays: +p[12] || 14,
              created: Core.parseISO(p[13]) || new Date(), phone: p[14] || '', listPrice: +p[15] || 0,
              email: p[16] || '', deposit: Math.min(+p[17] || 0, +p[10] || 0), pricingInfo: p[18] || '' };
    } catch(e) {
        main.innerHTML = '<div class="card card-b" style="text-align:center;margin-top:30px">הקישור להצעה אינו תקין. לקבלת הצעה חדשה פנו אלינו בוואטסאפ <a href="https://wa.me/' + esc(CT.whatsapp) + '">' + esc(CT.phone) + '</a>.</div>';
        return;
    }
    const plan = (PF.sales.plans || {})[o.plan] || { label: 'מערכת מותאמת' };
    const months = o.freeMonths + o.extraMonths, supportCost = o.extraMonths * o.monthly;
    const validUntil = new Date(o.created.getFullYear(), o.created.getMonth(), o.created.getDate() + o.validDays);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expired = today > validUntil;
    // מבצע ההשקה מוגבל ל-5 חתימות. כשנגמר, הצעה במחיר ההשקה כבר לא ניתנת לחתימה
    let promoOut = false;
    if (o.plan === 'launch') {
        try {
            const f = await Core.fb();
            const s = await Promise.race([f.fs.getDoc(f.fs.doc(f.db, 'public', 'promo')), new Promise(r => setTimeout(() => r(null), 6000))]);
            promoOut = !!(s && s.exists() && s.data().soldOut);
        } catch(e) { console.warn('promo check failed', e); }
    }
    const shortId = '#' + o.id.slice(-6).toUpperCase();
    document.title = `הצעת מחיר ל-${o.vendorName} | Snap Box`;

    const FEATURES = [
        'מחולל הצעות מחיר עם המחירון, החבילות והתוספות שלכם — המחיר מחושב אוטומטית',
        'דף הצעה ללקוח בעיצוב, בצבעים ובלוגו של העסק — בלי שום אזכור שלנו',
        'חתימה דיגיטלית עם תיעוד מועד ודפדפן לחיזוק התוקף המשפטי',
        'הסכם PDF חתום שיורד ללקוח ונשלח אליכם למייל',
        'לוח בקרה: כל ההצעות, מה נחתם, אחוז סגירה והכנסות',
        'חישוב מרחק נסיעה אוטומטי וכפתור "הוסף ליומן" ללקוח',
        'עמודי תנאי שימוש, פרטיות ונגישות ממותגים לעסק',
        'כניסה מאובטחת עם חשבון Google, מכל מכשיר'
    ];
    const TERMS = [
        `ההצעה בתוקף עד ${Core.fmtDate(validUntil)}.`,
        o.deposit ? `מקדמה של ${money(o.deposit)} משולמת עם החתימה, והיתרה (${money(o.total - o.deposit)}) לפני תחילת ההקמה, אלא אם סוכם אחרת בהערות להצעה.`
                  : 'התשלום יבוצע במלואו לפני תחילת ההקמה, אלא אם סוכם אחרת בהערות להצעה.',
        'ההקמה מתחילה לאחר קבלת התשלום וכל הנתונים (פרטי עסק, מחירון, תנאים, לוגו וכתובת Gmail להתחברות), ובדרך כלל מסתיימת בתוך 7 ימי עבודה.',
        months ? `תמיכה טכנית ל-${months} חודשים ממועד מסירת המערכת. לאחר מכן ניתן לחדש ב-${money(PF.sales.supportMonthly)} לחודש.` : `ההצעה אינה כוללת תמיכה טכנית חודשית. ניתן להוסיף בכל עת ב-${money(PF.sales.supportMonthly)} לחודש.`,
        'ביטול בתוך 14 יום מהחתימה ולפני תחילת ההקמה — החזר מלא. לאחר תחילת ההקמה לא יינתן החזר על דמי ההקמה.',
        ...(o.plan === 'launch' ? [`מחיר ההשקה מוגבל ל-${PF.sales.plans.launch.limit || 5} הספקים הראשונים שחותמים עליו. ההצעה ניתנת לחתימה כל עוד נותרו מקומות במבצע.`] : []),
        'ההתקשרות כפופה לתנאי השימוש והסכם השירות לספקים של Snap Box, המהווים חלק בלתי נפרד מהסכם זה.'
    ];
    const priceRows = () => {
        const r = [];
        r.push([`מערכת הצעות מחיר וחוזים · ${plan.label}`, money(o.price)]);
        if (o.listPrice > o.price) r.push(['מחיר רגיל', `<s>${money(o.listPrice)}</s>`, 'minus']);
        if (o.freeMonths) r.push([`תמיכה טכנית · ${o.freeMonths} חודשים`, 'כלול במחיר', 'minus']);
        if (o.extraMonths) r.push([`תמיכה טכנית · ${o.extraMonths} חודשים × ${money(o.monthly)}`, money(supportCost)]);
        if (o.discount) r.push(['הנחה', '−' + money(o.discount), 'minus']);
        return r;
    };

    main.innerHTML = `
      <section class="offer-hero rise">
        <span class="pill">הצעת מחיר ${esc(shortId)}</span>
        <h1>${esc(o.vendorName)}</h1>
        <p>מערכת הצעות מחיר וחוזים דיגיטליים, בנויה לעסק שלכם</p>
        <div class="meta"><span>לכבוד: ${esc(o.contactName)}</span>${o.businessType ? `<span>תחום: ${esc(o.businessType)}</span>` : ''}<span>תאריך: ${Core.fmtDate(o.created)}</span><span>בתוקף עד: ${Core.fmtDate(validUntil)}</span></div>
      </section>
      <div class="stack">
        <section class="card"><div class="card-h"><h2>מה מקבלים</h2></div><div class="card-b"><ul class="feat">${FEATURES.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></section>
        <section class="card"><div class="card-h"><h2>המחיר</h2></div><div class="card-b">
          <div class="price-rows">${priceRows().map(([k, v, c]) => `<div class="row ${c || ''}"><span>${esc(k)}</span><span>${v}</span></div>`).join('')}</div>
          <div class="price-total"><span>סה"כ לתשלום</span><b>${money(o.total)}</b></div>
          ${o.deposit ? `<div class="price-rows" style="margin-top:10px"><div class="row"><span>מקדמה עם החתימה</span><span>${money(o.deposit)}</span></div><div class="row"><span>יתרה לפני ההקמה</span><span>${money(o.total - o.deposit)}</span></div></div>` : ''}
          ${o.notes ? `<div class="callout" style="margin-top:14px"><b>הערות:</b> ${esc(o.notes)}</div>` : ''}
        </div></section>
        ${o.email || o.pricingInfo ? `<section class="card"><div class="card-h"><h2>הפרטים להקמת המערכת</h2></div><div class="card-b">
          ${o.email ? `<p style="margin:0 0 10px"><b>Gmail להתחברות למערכת:</b> <bdi>${esc(o.email)}</bdi></p>` : ''}
          ${o.pricingInfo ? `<div><b>מה משפיע על המחיר ללקוחות שלכם:</b><div class="callout" style="margin-top:6px;white-space:pre-line">${esc(o.pricingInfo)}</div></div>` : ''}
          <p class="note" style="margin:10px 0 0">לפי הפרטים האלה נבנה את המחירון שלכם. משהו לא מדויק? כתבו לנו בוואטסאפ לפני החתימה.</p>
        </div></section>` : ''}
        <section class="card"><div class="card-h"><h2>איך זה עובד</h2></div><div class="card-b"><ol class="steps">
          <li>חותמים כאן על ההצעה — זה לוקח דקה.</li>
          <li>מעבירים תשלום ושולחים לנו את הפרטים: מחירון, חבילות, תנאים, לוגו וכתובת Gmail.</li>
          <li>אנחנו מקימים את המערכת עם המיתוג והמחירים שלכם.</li>
          <li>מקבלים קישור לכניסת ספקים, מתחברים עם Google — ומתחילים לשלוח הצעות.</li>
        </ol></div></section>
        <section class="card"><div class="card-h"><h2>תנאי ההסכם</h2></div><div class="card-b">
          <ol class="terms">${TERMS.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
          <p class="hint" style="margin-top:10px">הנוסח המלא: <a href="../legal/terms.html" target="_blank" rel="noopener">תנאי שימוש והסכם שירות לספקים</a> · <a href="../legal/privacy.html" target="_blank" rel="noopener">מדיניות פרטיות</a></p>
        </div></section>
        <section class="card" id="sign-card"><div class="card-h"><h2>אישור וחתימה</h2></div><div class="card-b">
          ${promoOut ? `<div class="expired">מבצע ההשקה נגמר · הפתעות בהמשך 🎁<br>לקבלת הצעה מעודכנת: <a href="https://wa.me/${esc(CT.whatsapp)}">וואטסאפ ${esc(CT.phone)}</a></div>` : expired ? `<div class="expired">תוקף ההצעה הסתיים ב-${Core.fmtDate(validUntil)}. לקבלת הצעה מעודכנת: <a href="https://wa.me/${esc(CT.whatsapp)}">וואטסאפ ${esc(CT.phone)}</a></div>` : `
          <form id="sign-form" style="display:flex;flex-direction:column;gap:14px">
            <div><label class="lbl" for="signer">שם החותם/ת *</label><input class="field" id="signer" required value="${esc(o.contactName)}" autocomplete="name"></div>
            <div><div class="sig-head"><label class="lbl" style="margin:0" for="sig-canvas">חתימה *</label><button type="button" class="link" id="clear-sig">ניקוי</button></div>
              <canvas id="sig-canvas" aria-label="תיבת חתימה"></canvas><p class="hint">תאריך: ${new Date().toLocaleDateString('he-IL')}</p></div>
            <div id="sign-controls" style="display:flex;flex-direction:column;gap:12px">
              <div class="callout">בלחיצה, ההסכם החתום יירד אליכם כ-PDF ויישלח אלינו. לחיזוק התוקף המשפטי מתועדים תאריך, שעה וסוג הדפדפן.</div>
              <label class="agree"><input type="checkbox" id="agree" required><span>קראתי ואני מאשר/ת את ההצעה, את תנאי ההסכם ואת <a href="../legal/terms.html" target="_blank" rel="noopener">תנאי השימוש והסכם השירות</a>.</span></label>
              <button type="submit" class="btn primary lg block" id="sign-btn">חתימה ואישור ההצעה</button>
            </div>
          </form>`}
        </div></section>
      </div>`;
    if (expired || promoOut) return;

    /* ---------- חתימה ---------- */
    const canvas = $('sig-canvas'), ctx = canvas.getContext('2d');
    let drawing = false, signed = false, sigUrl = '', meta = null;
    function resize(){ const prev = signed ? canvas.toDataURL() : null, r = canvas.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height;
        ctx.strokeStyle = '#0F2321'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (prev) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, canvas.width, canvas.height); im.src = prev; } }
    window.addEventListener('resize', () => setTimeout(resize, 150)); setTimeout(resize, 200);
    const pos = e => { const r = canvas.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const down = e => { drawing = true; signed = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { drawing = false; };
    canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); canvas.addEventListener('mouseup', up); canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up);
    $('clear-sig').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); signed = false; });

    const withTimeout = (p, ms, fb) => Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))]);
    async function getIp(){ return null; }   // כתובת IP לא נאספת
    const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b); });

    function buildPdf(signer){
        const m = meta;
        $('pdf-doc').innerHTML = `<div class="in">
          <div class="sec hd"><div><div class="nm">Snap Box</div><div class="tg">מחולל הצעות מחיר וחוזים דיגיטליים</div></div><div class="tt">הצעת מחיר והסכם התקשרות<small>מס׳ ${esc(shortId.slice(1))} · ${Core.fmtDate(o.created)}</small></div></div>
          <div class="sec"><table>
            <tr><td class="k">לכבוד</td><td>${esc(o.vendorName)} · ${esc(o.contactName)}${o.phone ? ' · ' + esc(o.phone) : ''}</td></tr>
            ${priceRows().map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${v.replace(/<\/?s>/g, '')}</td></tr>`).join('')}
            <tr><td class="k tot">סה"כ לתשלום</td><td class="tot">${o.total.toLocaleString()} ש"ח</td></tr>
            ${o.deposit ? `<tr><td class="k">מקדמה עם החתימה</td><td>${o.deposit.toLocaleString()} ש"ח · יתרה ${(o.total - o.deposit).toLocaleString()} ש"ח</td></tr>` : ''}
            ${o.email ? `<tr><td class="k">Gmail להתחברות</td><td>${esc(o.email)}</td></tr>` : ''}
          </table></div>
          ${o.pricingInfo ? `<div class="sec"><div class="h">מה משפיע על המחיר ללקוחות</div><div class="notes" style="white-space:pre-line">${esc(o.pricingInfo)}</div></div>` : ''}
          ${o.notes ? `<div class="sec"><div class="h">הערות</div><div class="notes">${esc(o.notes)}</div></div>` : ''}
          <div class="sec"><div class="h">מה כלול</div><ul>${FEATURES.map(f => `<li><span class="mk">✓</span>${esc(f)}</li>`).join('')}</ul></div>
          <div class="sec"><div class="h">תנאי ההסכם</div><ul>${TERMS.map((t, i) => `<li><span class="mk">${i + 1}.</span>${esc(t)}</li>`).join('')}</ul></div>
          <div class="sec sign"><div class="h">אישור וחתימה</div>
            <p>אני, <b>${esc(signer)}</b>, בשם <b>${esc(o.vendorName)}</b>, מאשר/ת את הצעת המחיר ואת תנאי ההסכם המפורטים במסמך זה ואת תנאי השימוש והסכם השירות לספקים של Snap Box, וחותם/ת עליהם בחתימה דיגיטלית מחייבת.</p>
            <img class="sig" src="${sigUrl}" alt="חתימה">
            <div class="meta">תאריך: ${m.ts.toLocaleDateString('he-IL')} · שעה: ${m.ts.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}<br>דפדפן: ${esc(m.ua)}</div></div>
          <div class="ft">Snap Box · ${esc(CT.phone)} · ${esc(CT.email)} · system.snapbox.co.il</div></div>`;
    }
    async function makePdf(signer){
        buildPdf(signer);
        const el = $('pdf-doc'); window.scrollTo(0, 0);
        el.style.cssText = 'position:absolute;left:0;top:0;width:760px;visibility:visible;background:#fff;z-index:1;';
        if (document.fonts && document.fonts.ready) { try { await withTimeout(document.fonts.ready, 4000, null); } catch(e){} }
        await new Promise(r => setTimeout(r, 250));
        let big; try { big = await withTimeout(html2canvas(el, { scale: 2, backgroundColor: '#fff', logging: false, width: 760, windowWidth: 760, x: 0, y: 0, scrollX: 0, scrollY: 0 }), 15000, null); }
        finally { el.style.cssText = ''; }
        if (!big || big.height < 40) throw new Error('empty');
        const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 8, uw = W - M * 2, uh = H - M * 2, ppm = big.width / uw, pp = Math.floor(uh * ppm);
        for (let y = 0, i = 0; y < big.height && i < 20; i++) {
            const h = Math.min(pp, big.height - y), c = document.createElement('canvas'); c.width = big.width; c.height = h;
            const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, h); x.drawImage(big, 0, y, big.width, h, 0, 0, big.width, h);
            if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', .95), 'JPEG', M, M, uw, h / ppm); y += h;
        }
        const blob = pdf.output('blob'); if (!blob || blob.size < 12000) throw new Error('blank'); return blob;
    }
    async function saveSigned(pdfBlob, signer){
        try {
            const f = await Core.fb(), ref = f.fs.doc(f.db, 'platformQuotes', o.id);
            const base = { status: 'signed', signedAt: f.fs.serverTimestamp(), ip: null, userAgent: meta.ua ? String(meta.ua).slice(0, 500) : null };
            // אם הכללים עוד לא עודכנו (signedQ/signerName) — חותמים בלעדיהם
            try { await withTimeout(f.fs.updateDoc(ref, { ...base, signedQ: String(qp || '').slice(0, 7900), signerName: String(signer || '').slice(0, 100) }), 12000, null); }
            catch(e1) { await withTimeout(f.fs.updateDoc(ref, base), 12000, null); }
            if (pdfBlob && pdfBlob.size <= 700 * 1024) {
                const d = await blobToB64(pdfBlob);
                // PDF במסמך נפרד (הרשימות נטענות מהר); אם הכללים עוד ישנים — כמו קודם, בתוך ההצעה
                try { await withTimeout(f.fs.setDoc(f.fs.doc(f.db, 'platformQuotes', o.id, 'pdf', 'file'), { pdfData: d, at: f.fs.serverTimestamp() }).then(() => f.fs.updateDoc(ref, { hasPdf: true })), 15000, null); }
                catch(e2) { await withTimeout(f.fs.updateDoc(ref, { pdfData: d }), 12000, null); }
            }
        } catch(e) { console.warn('save failed', e); }
    }
    function email(pdfBlob, signer){
        return new Promise(resolve => {
            if (!CT.email) return resolve(false);
            const f = $('fs-form'); f.action = 'https://formsubmit.co/' + CT.email;
            const fields = { _subject: `הצעה נחתמה — ${o.vendorName}`, _captcha: 'false', _template: 'table', 'עסק': o.vendorName, 'חותם/ת': signer,
                'איש קשר': o.contactName, 'טלפון': o.phone || '—', 'חבילה': plan.label, 'חודשי תמיכה': String(months), 'סה"כ': o.total + ' ש"ח', 'מקדמה': o.deposit ? o.deposit + ' ש"ח' : '—', 'Gmail להתחברות': o.email || '—', 'מה משפיע על המחיר': o.pricingInfo || '—', 'הערות': o.notes || '—',
                'נחתם': meta.ts.toLocaleString('he-IL'), 'מזהה הצעה': o.id };
            f.innerHTML = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('') + '<input type="file" name="attachment" id="fs_files">';
            try { const dt = new DataTransfer(); if (pdfBlob) dt.items.add(new File([pdfBlob], `SnapBox_Offer_${o.id}.pdf`, { type: 'application/pdf' })); $('fs_files').files = dt.files; } catch(e){}
            const sink = document.querySelector('iframe[name="fs-sink"]'); let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
            sink.onload = () => fin(true); setTimeout(() => fin(true), 9000); f.submit();
        });
    }

    $('sign-form').addEventListener('submit', async e => {
        e.preventDefault();
        const signer = $('signer').value.trim();
        if (!signer) { $('signer').focus(); return; }
        if (!signed) { alert('נא לחתום בתיבה.'); return; }
        if (!$('agree').checked) { alert('יש לאשר את תנאי ההסכם.'); return; }
        const btn = $('sign-btn'), ov = $('pdf-overlay');
        btn.disabled = true; ov.style.display = 'flex';
        sigUrl = canvas.toDataURL('image/png');
        meta = { ts: new Date(), ip: await getIp(), ua: navigator.userAgent };
        let pdf = null; try { pdf = await makePdf(signer); } catch(err) { console.error(err); }
        const [mailed] = await Promise.all([email(pdf, signer), saveSigned(pdf, signer)]);
        if (pdf) { const a = document.createElement('a'); a.href = URL.createObjectURL(pdf); a.download = `SnapBox_Offer_${o.vendorName.replace(/[\\/:*?"<>|]+/g, '_')}.pdf`; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 5000); }
        ov.style.display = 'none';
        $('sign-controls').innerHTML = pdf && mailed
            ? `<div class="done" role="status">ההצעה נחתמה — ברוכים הבאים! 🎉<span>ה-PDF ירד אליכם, ונחזור אליכם בהקדם להמשך התהליך.</span></div>`
            : `<div class="warnbox" role="alert"><p>${pdf ? '✓ ה-PDF ירד למכשיר.' : '⚠️ יצירת ה-PDF נכשלה.'}</p><p>${mailed ? '✓ האישור נשלח.' : '⚠️ השליחה לא הושלמה.'}</p><p>אפשר לשלוח לנו הודעה: <a href="https://wa.me/${esc(CT.whatsapp)}">${esc(CT.phone)}</a></p></div>`;
    });
})();
