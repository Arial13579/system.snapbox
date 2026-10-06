/* דף הצעת המחיר ללקוח: הצגה, חתימה, PDF, שליחה לספק ועדכון הסטטוס בלוח הבקרה שלו.
   נטען מתוך <slug>/index.html אחרי config.js של הספק (window.TENANT) ו-platform.js. */
(function(){
    const T = window.TENANT, PF = window.PLATFORM || {};
    const B = Object.assign({ name: '', tagline: '', email: '', phone: '', businessId: '' }, T.business || {});
    const P = T.pricing || {};
    const L = Object.assign({ service: 'חבילה', included: 'מה כלול', docTitle: 'הצעת מחיר והסכם' }, T.labels || {});
    const SUPPLIER_EMAIL = B.email;
    const WEB3FORMS_KEY = T.web3formsKey || '';
    const esc = Brand.esc, $ = id => document.getElementById(id);
    const dataParam = new URLSearchParams(location.search).get('q');

    Brand.apply(T);
    document.title = `${B.name} | ${L.docTitle}`;

    /* ---------- עזרי זמן ---------- */
    function parseHM(v){ const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); if (!m) return null; const h = +m[1], mm = +m[2]; return h > 23 || mm > 59 ? null : h * 60 + mm; }
    function durationMinutes(s, e){ s = parseHM(s); e = parseHM(e); if (s == null || e == null) return null; let d = e - s; if (d <= 0) d += 1440; return d; }
    function hoursWord(startStr, endStr){
        const mins = durationMinutes(startStr, endStr);
        if (!mins) return '';
        const h = Math.floor(mins / 60), m = mins % 60;
        const names = { 1:'שעה', 2:'שעתיים', 3:'שלוש שעות', 4:'ארבע שעות', 5:'חמש שעות', 6:'שש שעות', 7:'שבע שעות', 8:'שמונה שעות', 9:'תשע שעות', 10:'עשר שעות', 11:'אחת עשרה שעות', 12:'שתים עשרה שעות' };
        let base = names[h] || (h + ' שעות');
        if (m === 30) base = h === 0 ? 'חצי שעה' : h === 1 ? 'שעה וחצי' : h === 2 ? 'שעתיים וחצי' : base + ' וחצי';
        else if (m === 15) base = h === 0 ? 'רבע שעה' : base + ' ורבע';
        else if (m === 45) base += ' ושלושת רבעי השעה';
        else if (m) base = h ? `${h}:${String(m).padStart(2, '0')} שעות` : `${m} דקות`;
        return base;
    }
    function plainHours(h){ return ({ 1:'שעה', 2:'שעתיים', 3:'שלוש שעות', 4:'ארבע שעות', 5:'חמש שעות', 6:'שש שעות' })[h] || (h + ' שעות'); }
    function b64UrlDecode(str){
        str = String(str).replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        const bin = atob(str), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    const SERVICES = P.SERVICES || {};
    const serviceOf = k => SERVICES[k] || SERVICES[P.DEFAULT_SERVICE] || Object.values(SERVICES)[0] || { label: '', lead: '', items: [], hours: 0 };
    const termsList = () => (T.terms || []).map(t => String(t).replace(/\{name\}/g, B.name));

    /* ---------- מבנה הדף ---------- */
    const app = $('app');
    function renderShell(inner){
        app.innerHTML = `
        <div id="pdf-overlay" role="status" aria-live="polite"><div class="spin"></div><b>מכין את ההסכם החתום ושולח…</b><span>רגע אחד, אין צורך לסגור את הדף</span></div>
        <div class="page">${Brand.headerHtml(T, './')}${inner}${Brand.footerHtml(T, '../legal/', dataParam)}</div>
        <div id="pdf-doc"></div>`;
        Icons.paint(app);
    }

    if (!dataParam) {
        renderShell(`<div class="card card-b rise" style="text-align:center">כדי לצפות בהצעת מחיר יש לפתוח את הקישור האישי שקיבלתם מ-${esc(B.name)}.</div>`);
        return;
    }

    let c;
    try {
        const p = b64UrlDecode(dataParam).split('|');
        if (p.length < 9) throw new Error('bad link');
        c = { name: p[0], type: p[1], location: p[2], date: p[3], startTime: p[4], endTime: p[5], guests: p[6] || '',
              price: Number(p[7]) || 0, deposit: Number(p[8]) || 0, notes: p[9] || '', quoteId: p[10] || '', service: p[11] || P.DEFAULT_SERVICE };
    } catch (err) {
        console.error(err);
        renderShell(`<div class="card card-b rise" style="text-align:center;color:var(--bad);font-weight:700">הקישור אינו תקין. בקשו מ-${esc(B.name)} קישור חדש.</div>`);
        return;
    }

    const svc = serviceOf(c.service), act = hoursWord(c.startTime, c.endTime), bal = c.price - c.deposit;
    const PKG_ITEMS = [ `${act || plainHours(svc.hours || 0)} ${svc.lead || ''}`.trim() ].concat(svc.items || [], P.COMMON_ITEMS || []).filter(Boolean);
    const shortId = c.quoteId ? '#' + c.quoteId.slice(-6).toUpperCase() : '';
    const money = n => '₪' + Number(n || 0).toLocaleString();
    document.title = `${B.name} | ${L.docTitle} · ${c.name}`;

    renderShell(`
        <section class="card rise" aria-label="פרטי ההצעה">
            <div class="hero">
                <div class="row"><span class="pill">${esc(L.docTitle)}</span><span class="qid ltr">${esc(shortId)}</span></div>
                <p class="for">לכבוד</p>
                <h1>${esc(c.name)}</h1>
                <div class="what">${esc(svc.label)}${c.type ? ' · ' + esc(c.type) : ''}</div>
            </div>
            <div class="facts">
                <div class="fact"><span class="k"><i data-i="party"></i>סוג האירוע</span><span class="v">${esc(c.type)}</span></div>
                <div class="fact"><span class="k"><i data-i="calendar"></i>תאריך</span><span class="v ltr" style="text-align:right">${esc(c.date)}</span></div>
                <div class="fact"><span class="k"><i data-i="pin"></i>מיקום</span><span class="v">${esc(c.location)}</span></div>
                <div class="fact"><span class="k"><i data-i="clock"></i>שעות</span><span class="v"><span class="ltr">${esc(c.startTime)}–${esc(c.endTime)}</span>${act ? `<small>${esc(act)}</small>` : ''}</span></div>
                <div class="fact"><span class="k"><i data-i="users"></i>מוזמנים</span><span class="v">${c.guests ? 'עד ' + Number(c.guests).toLocaleString() : '—'}</span></div>
                <div class="fact"><span class="k"><i data-i="file"></i>${esc(L.service)}</span><span class="v">${esc(svc.label)}</span></div>
            </div>
            <div class="money">
                <div class="total"><div class="k">מחיר כולל</div><div class="v">${money(c.price)}</div></div>
                <div><div class="k">מקדמה</div><div class="v">${money(c.deposit)}</div></div>
                <div><div class="k">יתרה בסיום</div><div class="v">${money(bal)}</div></div>
            </div>
            ${c.notes.trim() ? `<div class="notes"><div class="k"><i data-i="info"></i>הערות וסיכומים</div><p>${esc(c.notes)}</p></div>` : ''}
        </section>

        <section class="card rise">
            <div class="card-h"><span class="n">1</span><h2>${esc(L.included)}</h2></div>
            <div class="card-b"><ul class="incl">${PKG_ITEMS.map(x => `<li><i data-i="check"></i><span>${esc(x)}</span></li>`).join('')}</ul></div>
        </section>

        <section class="card rise">
            <div class="card-h"><span class="n">2</span><h2>תנאי ההסכם וביטולים</h2></div>
            <div class="card-b"><ol class="terms">${termsList().map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>
        </section>

        <section class="card rise">
            <div class="card-h"><span class="n">3</span><h2>אישור וחתימה</h2></div>
            <div class="card-b">
                <form id="signature-form" style="display:flex;flex-direction:column;gap:16px">
                    <div>
                        <div class="sig-head"><label class="lbl" style="margin:0" for="sig-canvas">חתמו בתוך התיבה *</label><button type="button" id="clear-sig" class="link">ניקוי</button></div>
                        <canvas id="sig-canvas" aria-label="תיבת חתימה"></canvas>
                        <p class="hint">תאריך: <span class="ltr">${new Date().toLocaleDateString('he-IL')}</span></p>
                    </div>
                    <div id="pdf-hide-controls" style="display:flex;flex-direction:column;gap:14px">
                        <div class="callout"><b>מה קורה בלחיצה:</b> ה-PDF המלא של ההסכם יירד למכשיר שלכם, ובמקביל האישור והחתימה יישלחו ל-${esc(B.name)}. לחיזוק התוקף המשפטי של החתימה מתועדים גם תאריך, שעה, כתובת IP וסוג הדפדפן.</div>
                        <label class="agree"><input type="checkbox" id="agree-terms" required>
                            <span>קראתי ואני מאשר/ת את <a href="../legal/terms.html?t=${encodeURIComponent(T.slug)}&q=${encodeURIComponent(dataParam)}" target="_blank" rel="noopener">תנאי השימוש</a> ואת <a href="../legal/privacy.html?t=${encodeURIComponent(T.slug)}&q=${encodeURIComponent(dataParam)}" target="_blank" rel="noopener">מדיניות הפרטיות</a>.</span></label>
                        <button type="submit" id="submit-btn" class="btn btn-block"><i data-i="shield"></i> אישור ההסכם, הורדת PDF ושליחה</button>
                    </div>
                </form>
            </div>
        </section>`);

    // כפתור יומן + טופס FormSubmit נסתר
    document.body.insertAdjacentHTML('beforeend', `
        <div id="cal-fab-wrap" class="hidden"><button type="button" id="cal-fab" class="btn">${Icons.svg('calendar')}<span id="cal-fab-label">הוסף ליומן</span></button></div>
        <iframe name="fs-sink" title="sink" style="position:absolute;width:0;height:0;border:0;left:-9999px;top:0"></iframe>
        <form id="fs-form" method="POST" enctype="multipart/form-data" target="fs-sink" accept-charset="UTF-8" style="display:none"></form>`);

    /* ---------- חתימה ---------- */
    const canvas = $('sig-canvas'), ctx = canvas.getContext('2d');
    let isDrawing = false, hasSigned = false, lastSigDataUrl = '', lastSigMeta = null;
    function resizeCanvas(){
        const prev = hasSigned ? canvas.toDataURL() : null, r = canvas.getBoundingClientRect();
        canvas.width = r.width; canvas.height = r.height;
        ctx.strokeStyle = '#16161A'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (prev) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, canvas.width, canvas.height); im.src = prev; }
    }
    window.addEventListener('resize', () => setTimeout(resizeCanvas, 150));
    setTimeout(resizeCanvas, 300);
    const pos = e => { const r = canvas.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const down = e => { isDrawing = true; hasSigned = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = e => { if (!isDrawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { isDrawing = false; };
    canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); canvas.addEventListener('mouseup', up); canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up);
    $('clear-sig').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasSigned = false; });

    /* ---------- Firebase (רק לעדכון הסטטוס — בלי התחברות) ---------- */
    let fbPromise = null;
    function initFirebase(){
        if (fbPromise) return fbPromise;
        fbPromise = (async () => {
            try {
                if (!PF.firebase || !PF.firebase.apiKey) return null;
                const [{ initializeApp }, fs] = await Promise.all([
                    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
                    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
                ]);
                const appFb = initializeApp(PF.firebase, 'quote');
                const db = fs.getFirestore(appFb, PF.firestoreDatabaseId || '(default)');
                if (window.__EMU__) fs.connectFirestoreEmulator(db, '127.0.0.1', window.__EMU__.firestore);   // בדיקות מקומיות בלבד
                return { db, fs };
            } catch (err) { console.warn('firebase init failed', err); return null; }
        })();
        return fbPromise;
    }
    function withTimeout(promise, ms, fallback){ return Promise.race([promise, new Promise(r => setTimeout(() => r(fallback), ms))]); }

    const PDF_MAX_STORE_BYTES = 700 * 1024;
    let criticalSaveDone = true;
    async function saveSignedQuote(meta, pdfBlob){
        const fb = await initFirebase();
        if (!fb || !c.quoteId) { criticalSaveDone = true; return; }
        const ref = fb.fs.doc(fb.db, 'tenants', T.slug, 'quotes', c.quoteId);
        try {
            await fb.fs.updateDoc(ref, { status: 'signed', signedAt: fb.fs.serverTimestamp(), ip: meta && meta.ip ? meta.ip : null, userAgent: meta && meta.ua ? meta.ua : null });
        } catch (err) { console.warn('status update failed', err); criticalSaveDone = true; return; }
        criticalSaveDone = true;
        if (pdfBlob && pdfBlob.size <= PDF_MAX_STORE_BYTES) {
            try { const pdfData = await withTimeout(blobToBase64(pdfBlob), 10000, null); if (pdfData) await fb.fs.updateDoc(ref, { pdfData }); }
            catch (err) { console.warn('pdf save failed', err); }
        }
    }

    /* ---------- PDF ---------- */
    function dataUrlToBlob(u){ const [h, b64] = u.split(','); const mime = (h.match(/:(.*?);/) || [])[1] || 'image/png'; const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
    function blobToBase64(blob){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const s = r.result || '', i = s.indexOf(','); res(i >= 0 ? s.slice(i + 1) : s); }; r.onerror = rej; r.readAsDataURL(blob); }); }
    function triggerDownload(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 6000); }

    function buildPdfDoc(sig, meta){
        const m = meta || lastSigMeta || { ts: new Date(), ip: null, ua: navigator.userAgent };
        $('pdf-doc').innerHTML = `
          <div class="doc-inner">
            <div class="doc-section doc-head">
              <div class="doc-brand">${B.logo ? `<img src="./${esc(B.logo)}" alt="">` : ''}<div><div class="nm">${esc(B.name)}</div>${B.tagline ? `<div class="tg">${esc(B.tagline)}</div>` : ''}</div></div>
              <div class="doc-title">${esc(L.docTitle)}<small>${shortId ? 'מס׳ ' + esc(shortId.slice(1)) : ''}</small></div>
            </div>
            <div class="doc-section"><table>
              <tr><td class="k">לכבוד</td><td>${esc(c.name)}</td><td class="k">סוג האירוע</td><td>${esc(c.type)}</td></tr>
              <tr><td class="k">${esc(L.service)}</td><td colspan="3">${esc(svc.label)}</td></tr>
              <tr><td class="k">מיקום</td><td>${esc(c.location)}</td><td class="k">תאריך</td><td dir="ltr" style="text-align:right">${esc(c.date)}</td></tr>
              <tr><td class="k">שעות</td><td><span dir="ltr">${esc(c.startTime)} - ${esc(c.endTime)}</span>${act ? ' &nbsp;·&nbsp; ' + esc(act) : ''}</td><td class="k">מוזמנים</td><td>${c.guests ? 'עד ' + Number(c.guests).toLocaleString() : '—'}</td></tr>
              <tr><td class="k">מחיר כולל</td><td class="hl">${c.price.toLocaleString()} ש"ח</td><td class="k">מקדמה</td><td>${c.deposit.toLocaleString()} ש"ח</td></tr>
              <tr><td class="k">יתרה בסיום</td><td colspan="3"><b>${bal.toLocaleString()} ש"ח</b></td></tr>
            </table></div>
            ${c.notes.trim() ? `<div class="doc-section"><div class="doc-h">הערות וסיכומים</div><div class="doc-notes">${esc(c.notes)}</div></div>` : ''}
            <div class="doc-section"><div class="doc-h">${esc(L.included)}</div><ul>${PKG_ITEMS.map(x => `<li><span class="mk">✓</span>${esc(x)}</li>`).join('')}</ul></div>
            <div class="doc-section"><div class="doc-h">תנאי ההסכם וביטולים</div><ol class="terms-pdf">${termsList().map((t, i) => `<li><span class="mk">${i + 1}.</span>${esc(t)}</li>`).join('')}</ol></div>
            <div class="doc-section doc-sign">
              <div class="doc-h">אישור וחתימת הלקוח</div>
              <p>אני, <b>${esc(c.name)}</b>, מאשר/ת בזאת את פרטי הצעת המחיר ואת תנאי ההסכם המפורטים במסמך זה, וחותם/ת עליהם בחתימה דיגיטלית מחייבת. לצורך תוקפה המשפטי של החתימה מתועדים להלן מועד, כתובת IP וסוג הדפדפן שמהם בוצעה החתימה.</p>
              <img class="sig" src="${sig}" alt="חתימת הלקוח">
              <div class="doc-meta">חתימה דיגיטלית · תאריך: ${m.ts.toLocaleDateString('he-IL')} · שעה: ${m.ts.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}<br>כתובת IP: ${esc(m.ip || 'לא זוהתה')} · דפדפן: ${esc(m.ua)}</div>
            </div>
            <div class="doc-foot">${esc(B.name)}${B.businessId ? ' · ' + esc(B.businessId) : ''} · ${esc(SUPPLIER_EMAIL)}${B.phone ? ' · ' + esc(B.phone) : ''}</div>
          </div>`;
    }
    const PDF_W = 760;
    async function generatePdfBlob(sig, meta){
        buildPdfDoc(sig, meta);
        const el = $('pdf-doc');
        window.scrollTo(0, 0);
        el.style.cssText = `position:absolute;left:0;top:0;width:${PDF_W}px;visibility:visible;background:#fff;z-index:1;`;
        if (document.fonts && document.fonts.ready) { try { await withTimeout(document.fonts.ready, 4000, null); } catch(e){} }
        await Promise.all([...el.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 2500); })));
        await new Promise(r => setTimeout(r, 200));
        let big;
        try { big = await withTimeout(html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: PDF_W, windowWidth: PDF_W, x: 0, y: 0, scrollX: 0, scrollY: 0 }), 15000, null); }
        finally { el.style.cssText = ''; }
        if (!big || big.height < 40) throw new Error('empty canvas');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
        const M = 8, usableW = pageW - M * 2, usableH = pageH - M * 2, pxPerMm = big.width / usableW, pagePx = Math.floor(usableH * pxPerMm);
        let y = 0, page = 0;
        while (y < big.height && page <= 20) {
            const h = Math.min(pagePx, big.height - y), s = document.createElement('canvas');
            s.width = big.width; s.height = h;
            const sc = s.getContext('2d'); sc.fillStyle = '#fff'; sc.fillRect(0, 0, s.width, h);
            sc.drawImage(big, 0, y, big.width, h, 0, 0, big.width, h);
            if (page > 0) pdf.addPage();
            pdf.addImage(s.toDataURL('image/jpeg', 0.95), 'JPEG', M, M, usableW, h / pxPerMm);
            y += h; page++;
        }
        const blob = pdf.output('blob');
        if (!blob || blob.size < 12000) throw new Error('PDF blank');
        return blob;
    }
    function printFallback(){
        buildPdfDoc(hasSigned ? canvas.toDataURL('image/png') : lastSigDataUrl, lastSigMeta);
        document.body.classList.add('printing-doc');
        window.addEventListener('afterprint', () => document.body.classList.remove('printing-doc'), { once: true });
        setTimeout(() => window.print(), 250);
    }

    /* ---------- שליחה לספק ---------- */
    async function uploadPdf(blob, name){
        try {
            const fd = new FormData(); fd.append('file', blob, name);
            const r = await withTimeout(fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd }), 10000, null);
            if (!r) return null;
            const j = await r.json(), u = j && j.data && j.data.url;
            if (u) return u.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        } catch(e){ console.warn('tmpfiles failed', e); }
        return null;
    }
    async function getClientIp(){
        try { const r = await withTimeout(fetch('https://api.ipify.org?format=json'), 5000, null); if (!r) return null; const j = await r.json(); return (j && j.ip) || null; }
        catch(e){ return null; }
    }
    async function sendViaWeb3Forms(fields, pdfBlob, sigBlob, safe){
        if (!WEB3FORMS_KEY || WEB3FORMS_KEY.trim().length < 20) return false;
        try {
            const fd = new FormData();
            fd.append('access_key', WEB3FORMS_KEY.trim()); fd.append('from_name', `${B.name} · הסכם חתום`); fd.append('subject', fields._subject);
            Object.entries(fields).forEach(([k, v]) => { if (k[0] !== '_') fd.append(k, v); });
            if (pdfBlob) fd.append('attachment', new File([pdfBlob], `Contract_${safe}.pdf`, { type: 'application/pdf' }));
            if (sigBlob) fd.append('signature', new File([sigBlob], `Signature_${safe}.png`, { type: 'image/png' }));
            const r = await withTimeout(fetch('https://api.web3forms.com/submit', { method: 'POST', body: fd }), 12000, null);
            return !!(r && (await r.json()).success);
        } catch(e){ return false; }
    }
    function sendViaFormSubmit(fields, pdfBlob, sigBlob, safe){
        return new Promise(resolve => {
            if (!SUPPLIER_EMAIL) return resolve(false);
            const f = $('fs-form');
            f.action = 'https://formsubmit.co/' + SUPPLIER_EMAIL;
            const hidden = Object.assign({ _captcha: 'false', _template: 'table' }, fields);
            f.innerHTML = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('') + '<input type="file" name="attachment" id="fs_files" multiple>';
            try {
                const dt = new DataTransfer();
                if (pdfBlob) dt.items.add(new File([pdfBlob], `Contract_${safe}.pdf`, { type: 'application/pdf' }));
                if (sigBlob) dt.items.add(new File([sigBlob], `Signature_${safe}.png`, { type: 'image/png' }));
                $('fs_files').files = dt.files;
            } catch(e){}
            const sink = document.querySelector('iframe[name="fs-sink"]');
            let done = false; const fin = ok => { if (!done) { done = true; resolve(ok); } };
            sink.onload = () => fin(true); setTimeout(() => fin(true), 9000);
            f.submit();
        });
    }
    async function sendToBusiness(pdfBlob, sigBlob, safe, m){
        const link = pdfBlob ? await uploadPdf(pdfBlob, `Contract_${safe}.pdf`) : null;
        const fields = {
            _subject: `הסכם חתום חדש — ${c.name} (${c.type})`,
            'שם הלקוח': c.name, 'סוג אירוע': c.type, [L.service]: svc.label, 'מיקום': c.location, 'תאריך האירוע': c.date,
            'שעות': `${c.startTime} - ${c.endTime}`, 'כמות מוזמנים': c.guests || '—', 'מחיר כולל': `${c.price} ש"ח`, 'מקדמה': `${c.deposit} ש"ח`,
            'יתרה לתשלום': `${bal} ש"ח`, 'הערות': c.notes || '—', 'נחתם בתאריך': m.ts.toLocaleString('he-IL'), 'כתובת IP': m.ip || 'לא זוהתה',
            'דפדפן (User Agent)': m.ua, 'הורדת ההסכם החתום (PDF)': link ? link + '  (זמין בשעה הקרובה — הקובץ גם מצורף למייל)' : 'הקובץ מצורף למייל'
        };
        let ok = await sendViaWeb3Forms(fields, pdfBlob, sigBlob, safe);
        if (!ok) ok = await sendViaFormSubmit(fields, pdfBlob, sigBlob, safe);
        return ok;
    }

    $('signature-form').addEventListener('submit', async e => {
        e.preventDefault();
        if (!hasSigned) { alert('נא לחתום בתיבה לפני אישור ההסכם.'); return; }
        if (!$('agree-terms').checked) { alert('יש לאשר את תנאי השימוש ומדיניות הפרטיות לפני השליחה.'); return; }
        const btn = $('submit-btn'), overlay = $('pdf-overlay');
        btn.disabled = true; btn.textContent = 'מעבד…'; overlay.style.display = 'flex'; criticalSaveDone = false;
        lastSigDataUrl = canvas.toDataURL('image/png');
        const sigBlob = dataUrlToBlob(lastSigDataUrl), safe = (c.name || 'Client').replace(/[\\/:*?"<>|]+/g, '_');
        lastSigMeta = { ts: new Date(), ip: await getClientIp(), ua: navigator.userAgent };
        let pdfBlob = null;
        try { pdfBlob = await generatePdfBlob(lastSigDataUrl, lastSigMeta); } catch (err) { console.error('PDF failed', err); }
        let emailOk = false;
        try {
            const [ok] = await Promise.all([ sendToBusiness(pdfBlob, sigBlob, safe, lastSigMeta), withTimeout(saveSignedQuote(lastSigMeta, pdfBlob), 15000, null) ]);
            emailOk = ok;
        } catch (err) { console.error(err); }
        if (pdfBlob) { try { triggerDownload(pdfBlob, `${B.name}_Contract_${safe}.pdf`); } catch (err) {} }
        overlay.style.display = 'none';
        const box = $('pdf-hide-controls');
        if (pdfBlob && emailOk) {
            box.innerHTML = `<div class="done">${Icons.svg('party')}ההסכם נחתם בהצלחה!<span>ה-PDF ירד למכשיר שלכם והאישור נשלח ל-${esc(B.name)}.</span></div>`;
        } else {
            box.innerHTML = `<div class="warnbox"><p>${pdfBlob ? '✓ ה-PDF ירד למכשיר.' : '⚠️ יצירת ה-PDF האוטומטית נכשלה.'}</p><p>${emailOk ? '✓ האישור והחתימה נשלחו.' : `⚠️ שליחת האישור לא הושלמה — צרו קשר עם ${esc(B.name)}.`}</p><p>להורדה / הדפסה של עותק גיבוי מלא:</p></div>
                <button type="button" id="print-fallback" class="btn btn-block">${Icons.svg('printer')} הורדה / הדפסה של עותק גיבוי</button>`;
            $('print-fallback').addEventListener('click', printFallback);
            btn.disabled = false;
        }
    });

    /* ---------- הוספה ליומן ---------- */
    function eventDateParts(){
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(c.date || '').trim());
        const s = parseHM(c.startTime), e = parseHM(c.endTime);
        if (!m || s == null || e == null) return null;
        const start = new Date(+m[3], +m[2] - 1, +m[1], Math.floor(s / 60), s % 60);
        const end = new Date(+m[3], +m[2] - 1, +m[1], 0, 0); end.setMinutes(e <= s ? e + 1440 : e);
        return { start, end };
    }
    const fmtCal = d => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + '00'; };
    function calEvent(){
        const parts = eventDateParts(); if (!parts) return null;
        const details = [ `${B.name} · ${svc.label} — ${c.type || 'אירוע'}`, `לכבוד: ${c.name}`, `שעות: ${c.startTime} - ${c.endTime}` + (act ? ` (${act})` : ''),
            c.guests ? `מוזמנים: עד ${Number(c.guests).toLocaleString()}` : '', `מחיר כולל: ${money(c.price)} · מקדמה: ${money(c.deposit)} · יתרה בסיום: ${money(bal)}`,
            B.phone ? `טלפון: ${B.phone}` : '', c.notes.trim() ? `הערות: ${c.notes.trim()}` : '' ].filter(Boolean).join('\n');
        return { start: parts.start, end: parts.end, title: `${B.name} · ${c.type || 'אירוע'}`, location: c.location || '', details };
    }
    function waitForCriticalSave(max){ return new Promise(r => { const t0 = Date.now(); (function chk(){ if (criticalSaveDone || Date.now() - t0 >= max) r(); else setTimeout(chk, 150); })(); }); }
    async function addToCalendar(){
        const ev = calEvent(); if (!ev) return;
        await waitForCriticalSave(5000);
        const u = new URL('https://calendar.google.com/calendar/render');
        u.searchParams.set('action', 'TEMPLATE'); u.searchParams.set('text', ev.title); u.searchParams.set('dates', fmtCal(ev.start) + '/' + fmtCal(ev.end));
        u.searchParams.set('details', ev.details); u.searchParams.set('location', ev.location); u.searchParams.set('ctz', 'Asia/Jerusalem');
        const gc = u.toString(), ua = navigator.userAgent || '';
        if (/Android/.test(ua)) {
            location.href = 'intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/event;S.title=' + encodeURIComponent(ev.title)
                + ';S.eventLocation=' + encodeURIComponent(ev.location) + ';S.description=' + encodeURIComponent(ev.details)
                + ';l.beginTime=' + ev.start.getTime() + ';l.endTime=' + ev.end.getTime() + ';S.browser_fallback_url=' + encodeURIComponent(gc) + ';end';
        } else if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
            if (!window.open(gc, '_blank')) location.href = gc;
        } else {
            const w = 640, h = 720, x = Math.max(0, ((screen.width || 1200) - w) / 2), y = Math.max(0, ((screen.height || 800) - h) / 2);
            if (!window.open(gc, 'cal', `popup=yes,width=${w},height=${h},left=${x},top=${y}`)) window.open(gc, '_blank');
        }
    }
    if (eventDateParts()) {
        $('cal-fab-wrap').classList.remove('hidden');
        $('cal-fab').addEventListener('click', () => {
            addToCalendar();
            const fab = $('cal-fab'), lbl = $('cal-fab-label');
            fab.classList.add('is-busy'); lbl.textContent = 'נפתח ביומן…';
            setTimeout(() => { fab.classList.remove('is-busy'); lbl.textContent = 'הוסף ליומן'; }, 2500);
        });
    }
})();
