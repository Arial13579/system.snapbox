/* חשבון הספק — יומן, הכנסות והוצאות, והסבר חד-פעמי בכניסה הראשונה. נטען לפני app.js; app.js קורא ל-AppExtras.
   יומן:       כל הצעה שנחתמה מופיעה לבד לפי תאריך האירוע (מאזין חי — חתימה חדשה נכנסת מיד), + הוספה ליומן Google / קובץ ics.
   הכנסות:     נרשמות אוטומטית מכל הצעה חתומה, לפי מועד החתימה וסכום ההצעה. הוצאות — הספק מזין (tenants/{t}/expenses).
   ההסבר:      פעם אחת לכל חשבון ומייל (tenants/{t}/prefs/{email}.welcomeSeen; גם במכשיר), כך שמעבר מניסיון למנוי לא מציג אותו שוב. */
(function(){
    const $ = id => document.getElementById(id);
    let C = null, SIGNED = [], EXP = [], INC = [], unsubSigned = null, unsubExp = null, unsubInc = null, calMonth = null, calDay = null, booksChart = null, started = { cal: false, books: false };

    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    // תאריך האירוע בהצעה נשמר כ-dd/mm/yyyy
    const eventDate = q => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(q.date || '')); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
    const tsDate = v => v && v.toDate ? v.toDate() : null;
    const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const CATS = ['ציוד', 'נסיעות ודלק', 'שיווק ופרסום', 'עובדים ועוזרים', 'מנויים ותוכנות', 'אחר'];
    const money = n => C.money(n);

    /* ---------- נתונים משותפים: הצעות חתומות (24 חודשים אחרונים) ---------- */
    function listenSigned(){
        if (unsubSigned) return;
        const fs = C.fb.fs, since = new Date(); since.setMonth(since.getMonth() - 24);
        // שאילתה על שדה אחד (signedAt) — לא צריך אינדקס מיוחד; רק הצעות חתומות מכילות signedAt
        unsubSigned = fs.onSnapshot(fs.query(fs.collection(C.fb.db, 'tenants', C.slug, 'quotes'), fs.where('signedAt', '>=', fs.Timestamp.fromDate(since))), snap => {
            SIGNED = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.status === 'signed');
            if (started.cal) renderCal();
            if (started.books) renderBooks();
        }, err => { console.warn('signed', err); const m = C.isQuota(err) ? C.QUOTA_MSG : 'טעינת ההסכמים החתומים נכשלה.'; ['cal-list', 'inc-list'].forEach(id => { if ($(id)) $(id).innerHTML = `<p class="hint">${C.esc(m)}</p>`; }); });
    }

    /* =================== יומן =================== */
    function startCal(){
        if (started.cal) return; started.cal = true;
        const now = new Date(); calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        $('cal-prev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); calDay = null; renderCal(); });
        $('cal-next').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); calDay = null; renderCal(); });
        $('cal-today').addEventListener('click', () => { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); calDay = null; renderCal(); });
        $('cal-grid').addEventListener('click', e => { const b = e.target.closest('button[data-day]'); if (!b) return; calDay = calDay === b.dataset.day ? null : b.dataset.day; renderCal(); $('cal-list').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        $('cal-ics').addEventListener('click', downloadIcs);
        $('cal-list').addEventListener('click', e => {
            const b = e.target.closest('button.cal-pdf'); if (!b) return;
            const q = SIGNED.find(x => x.id === b.dataset.id); if (q) C.Core.openPdf(`tenants/${C.slug}/quotes/${q.id}`, q);
        });
        listenSigned(); renderCal();
    }
    const evTitle = q => `${q.eventType || 'אירוע'} · ${q.clientName || ''}`.trim();
    function evDetails(q){
        const bal = (Number(q.price) || 0) - (Number(q.deposit) || 0);
        return [`לקוח: ${q.clientName || ''}`, q.clientPhone ? `טלפון: ${q.clientPhone}` : '', `סוג אירוע: ${q.eventType || ''}`, q.location ? `מקום: ${q.location}` : '',
            C.serviceLabel(q) ? `חבילה: ${C.serviceLabel(q)}` : '', q.guests ? `מוזמנים: ${q.guests}` : '',
            `מחיר: ${money(q.price)} · מקדמה: ${money(q.deposit)} · יתרה: ${money(bal)}`, q.notes ? `הערות: ${q.notes}` : ''].filter(Boolean).join('\n');
    }
    // זמני האירוע (שעת סיום לפני ההתחלה = אחרי חצות)
    function evTimes(q){
        const d = eventDate(q); if (!d) return null;
        const t = s => /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
        const a = t(q.startTime), b = t(q.endTime);
        if (!a) return { allDay: true, d };
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +a[1], +a[2]);
        let end = b ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), +b[1], +b[2]) : new Date(start.getTime() + 4 * 3600e3);
        if (end <= start) end = new Date(end.getTime() + 86400e3);
        return { allDay: false, d, start, end };
    }
    const gStamp = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
    const gDay = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    function googleLink(q){
        const t = evTimes(q); if (!t) return '';
        const dates = t.allDay ? gDay(t.d) + '/' + gDay(new Date(t.d.getTime() + 86400e3)) : gStamp(t.start) + '/' + gStamp(t.end);
        return 'https://calendar.google.com/calendar/render?action=TEMPLATE&ctz=Asia/Jerusalem&text=' + encodeURIComponent(evTitle(q))
            + '&dates=' + dates + '&details=' + encodeURIComponent(evDetails(q)) + '&location=' + encodeURIComponent(q.location || '');
    }
    function downloadIcs(){
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const ev = SIGNED.filter(q => { const d = eventDate(q); return d && d >= today; });
        if (!ev.length) { alert('אין אירועים קרובים להורדה.'); return; }
        const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//quotes//he', 'CALSCALE:GREGORIAN'];
        ev.forEach(q => { const t = evTimes(q);
            lines.push('BEGIN:VEVENT', 'UID:' + q.id + '@quotes', 'DTSTAMP:' + gStamp(new Date()),
                t.allDay ? 'DTSTART;VALUE=DATE:' + gDay(t.d) : 'DTSTART;TZID=Asia/Jerusalem:' + gStamp(t.start),
                t.allDay ? 'DTEND;VALUE=DATE:' + gDay(new Date(t.d.getTime() + 86400e3)) : 'DTEND;TZID=Asia/Jerusalem:' + gStamp(t.end),
                'SUMMARY:' + icsEsc(evTitle(q)), 'LOCATION:' + icsEsc(q.location), 'DESCRIPTION:' + icsEsc(evDetails(q)), 'END:VEVENT'); });
        lines.push('END:VCALENDAR');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
        a.download = 'events.ics'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    function renderCal(){
        if (!calMonth) return;
        const esc = C.esc, y = calMonth.getFullYear(), m = calMonth.getMonth(), todayIso = iso(new Date());
        $('cal-title').textContent = HE_MONTHS[m] + ' ' + y;
        const byDay = {};
        SIGNED.forEach(q => { const d = eventDate(q); if (d) (byDay[iso(d)] = byDay[iso(d)] || []).push(q); });
        Object.values(byDay).forEach(l => l.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || ''))));
        const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
        let h = HE_DAYS.map(d => `<div class="cal-dow" aria-hidden="true">${d.charAt(0)}׳</div>`).join('');
        for (let i = 0; i < first.getDay(); i++) h += '<div class="cal-cell empty"></div>';
        for (let day = 1; day <= days; day++) {
            const k = y + '-' + pad(m + 1) + '-' + pad(day), ev = byDay[k] || [];
            h += `<button type="button" class="cal-cell${k === todayIso ? ' today' : ''}${ev.length ? ' has' : ''}${calDay === k ? ' sel' : ''}" data-day="${k}" aria-pressed="${calDay === k}">
                <span class="n">${day}</span>${ev.slice(0, 2).map(q => `<span class="ev">${esc(q.startTime || '')} ${esc(q.clientName || '')}</span>`).join('')}${ev.length > 2 ? `<span class="ev more">+${ev.length - 2}</span>` : ''}</button>`;
        }
        $('cal-grid').innerHTML = h;
        // הרשימה: היום שנבחר, או כל האירועים הקרובים
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let list, head;
        if (calDay) { list = byDay[calDay] || []; const d = new Date(calDay + 'T00:00'); head = `יום ${HE_DAYS[d.getDay()]} · ${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`; }
        else { list = SIGNED.filter(q => { const d = eventDate(q); return d && d >= today; }).sort((a, b) => eventDate(a) - eventDate(b) || String(a.startTime || '').localeCompare(String(b.startTime || ''))); head = 'האירועים הקרובים'; }
        $('cal-list-h').textContent = head + (list.length ? ` (${list.length})` : '');
        $('cal-ics').classList.toggle('hidden', !SIGNED.some(q => { const d = eventDate(q); return d && d >= today; }));
        const fresh = q => { const s = tsDate(q.signedAt); return s && Date.now() - s.getTime() < 2 * 86400e3; };
        $('cal-list').innerHTML = list.length ? list.map(q => {
            const d = eventDate(q), bal = (Number(q.price) || 0) - (Number(q.deposit) || 0), ph = C.Core.waPhone(q.clientPhone);
            return `<article class="ev-card">
                <div class="ev-date"><b>${d.getDate()}</b><span>${HE_MONTHS[d.getMonth()]}</span><small>יום ${HE_DAYS[d.getDay()]}</small></div>
                <div class="ev-body">
                  <h3>${esc(q.eventType || 'אירוע')} · ${esc(q.clientName || '')}${fresh(q) ? ' <span class="badge ok">נחתם עכשיו</span>' : ''}</h3>
                  <div class="ev-meta">${q.startTime ? `<span>🕒 ${esc(q.startTime)}${q.endTime ? '–' + esc(q.endTime) : ''}</span>` : ''}${q.location ? `<span>📍 ${esc(q.location)}</span>` : ''}${C.serviceLabel(q) ? `<span>📦 ${esc(C.serviceLabel(q))}</span>` : ''}${q.guests ? `<span>👥 ${esc(q.guests)} מוזמנים</span>` : ''}</div>
                  <div class="ev-money"><span>מחיר <b>${money(q.price)}</b></span><span>מקדמה <b>${money(q.deposit)}</b></span><span>יתרה <b>${money(bal)}</b></span></div>
                  ${q.notes ? `<p class="hint" style="margin:4px 0 0">${esc(q.notes)}</p>` : ''}
                  <div class="acts">
                    <a class="btn sm primary" href="${esc(googleLink(q))}" target="_blank" rel="noopener">הוספה ליומן Google</a>
                    ${ph ? `<a class="btn sm" href="https://wa.me/${ph}" target="_blank" rel="noopener">וואטסאפ ללקוח</a><a class="btn sm" href="tel:${esc(q.clientPhone)}">חיוג</a>` : ''}
                    ${C.Core.hasPdf(q) ? `<button type="button" class="btn sm cal-pdf" data-id="${esc(q.id)}">ההסכם החתום</button>` : ''}
                  </div>
                </div></article>`;
        }).join('') : `<p class="hint">${calDay ? 'אין אירועים ביום הזה.' : 'עדיין אין אירועים קרובים. כשלקוח חותם על הצעה — האירוע נכנס לכאן לבד.'}</p>`;
    }

    /* =================== הכנסות והוצאות =================== */
    function startBooks(){
        if (started.books) return; started.books = true;
        const fs = C.fb.fs;
        $('ex-date').value = iso(new Date());
        $('ex-cat').innerHTML = CATS.map(c => `<option>${c}</option>`).join('');
        $('ex-form').addEventListener('submit', async e => {
            e.preventDefault();
            const amount = Math.round(Number($('ex-amount').value) * 100) / 100, label = C.clean($('ex-label').value.trim()).slice(0, 120), date = $('ex-date').value;
            if (!(amount > 0)) { $('ex-msg').textContent = 'הזינו סכום.'; $('ex-amount').focus(); return; }
            if (!label) { $('ex-msg').textContent = 'הזינו תיאור (למשל "דלק" או "הדפסות").'; $('ex-label').focus(); return; }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('ex-msg').textContent = 'בחרו תאריך.'; return; }
            const b = $('ex-add'); b.disabled = true; $('ex-msg').textContent = '';
            try {
                await fs.addDoc(fs.collection(C.fb.db, 'tenants', C.slug, 'expenses'), { date, amount, label, category: $('ex-cat').value, createdAt: fs.serverTimestamp() });
                $('ex-amount').value = ''; $('ex-label').value = ''; $('ex-msg').textContent = '✓ ההוצאה נוספה.';
            } catch(err) { $('ex-msg').textContent = 'השמירה נכשלה (' + (err.code || err.message) + ').'; }
            b.disabled = false;
        });
        $('ex-list').addEventListener('click', async e => {
            const b = e.target.closest('button.ex-del'); if (!b || !confirm('למחוק את ההוצאה?')) return;
            try { await fs.deleteDoc(fs.doc(C.fb.db, 'tenants', C.slug, 'expenses', b.dataset.id)); } catch(err) { alert('המחיקה נכשלה.'); }
        });
        $('bk-year').addEventListener('change', renderBooks);
        $('bk-csv').addEventListener('click', downloadCsv);
        // ייבוא מאקסל: הכנסות (tenants/{t}/incomes) והוצאות
        let impKind = 'expense';
        $('imp-inc').addEventListener('click', () => { impKind = 'income'; $('imp-file').click(); });
        $('imp-exp').addEventListener('click', () => { impKind = 'expense'; $('imp-file').click(); });
        $('imp-sample').addEventListener('click', e => { e.preventDefault(); const a = document.createElement('a'); a.href = URL.createObjectURL(SheetImport.sample('expense')); a.download = 'דוגמה-הכנסות-הוצאות.csv'; document.body.appendChild(a); a.click(); a.remove(); });
        $('imp-file').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f, impKind); });
        $('inc-list').addEventListener('click', async e => {
            const b = e.target.closest('button.inc-del'); if (!b || !confirm('למחוק את ההכנסה?')) return;
            try { await fs.deleteDoc(fs.doc(C.fb.db, 'tenants', C.slug, 'incomes', b.dataset.id)); } catch(err){ alert('המחיקה נכשלה.'); }
        });
        unsubInc = fs.onSnapshot(fs.query(fs.collection(C.fb.db, 'tenants', C.slug, 'incomes'), fs.orderBy('date', 'desc'), fs.limit(2000)), snap => {
            INC = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderBooks();
        }, err => { console.warn('incomes', err); });
        unsubExp = fs.onSnapshot(fs.query(fs.collection(C.fb.db, 'tenants', C.slug, 'expenses'), fs.orderBy('date', 'desc'), fs.limit(1000)), snap => {
            EXP = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderBooks();
        }, err => { console.warn('expenses', err); $('ex-list').innerHTML = `<p class="hint">${C.esc(C.isQuota(err) ? C.QUOTA_MSG : 'טעינת ההוצאות נכשלה.')}</p>`; });
        listenSigned(); renderBooks();
    }
    const incomeRows = () => SIGNED.map(q => ({ q, d: tsDate(q.signedAt) })).filter(x => x.d).map(x => ({ id: x.q.id, date: iso(x.d), amount: Number(x.q.price) || 0, label: `${x.q.clientName || ''} · ${x.q.eventType || ''}`, eventDate: x.q.date || '' }))
        .concat(INC.map(r => ({ id: r.id, date: String(r.date), amount: Number(r.amount) || 0, label: r.label || '', eventDate: '', manual: true, category: r.category || '' })));
    async function importFile(file, kind){
        const msg = $('imp-msg'), fs = C.fb.fs, name = kind === 'income' ? 'הכנסות' : 'הוצאות';
        msg.textContent = 'קורא את הקובץ…';
        let res;
        try { res = await SheetImport.parse(file, kind); } catch(e) { msg.textContent = SheetImport.message(e); return; }
        const have = new Set((kind === 'income' ? INC : EXP).map(SheetImport.key));
        const fresh = res.items.filter(x => !have.has(SheetImport.key(x))), dup = res.items.length - fresh.length;
        if (!fresh.length) { msg.textContent = res.items.length ? `כל ${res.items.length} השורות כבר קיימות — לא נוסף כלום.` : `לא נמצאו שורות עם תאריך וסכום. ${res.skipped ? '(' + res.skipped + ' שורות דולגו)' : ''} אפשר להוריד קובץ דוגמה.`; return; }
        const sum = fresh.reduce((s, x) => s + x.amount, 0);
        const lines = [`נמצאו ${fresh.length} ${name} בסך ${money(sum)}.`, dup ? `${dup} שורות כבר קיימות ולא ייובאו שוב.` : '', res.skipped ? `${res.skipped} שורות בלי תאריך או סכום דולגו (למשל שורת סה"כ).` : '',
            '', 'לדוגמה:', ...fresh.slice(0, 3).map(x => `• ${x.date.split('-').reverse().join('/')} · ${x.label} · ${money(x.amount)}`), '', 'לייבא?'].filter((x, i, a) => x !== '' || (a[i - 1] !== ''));
        if (!confirm(lines.join('\n'))) { msg.textContent = 'הייבוא בוטל.'; return; }
        const col = fs.collection(C.fb.db, 'tenants', C.slug, kind === 'income' ? 'incomes' : 'expenses');
        try {
            for (let i = 0; i < fresh.length; i += 400) {
                const b = fs.writeBatch(C.fb.db);
                fresh.slice(i, i + 400).forEach(x => b.set(fs.doc(col), { date: x.date, amount: x.amount, label: x.label, category: x.category, createdAt: fs.serverTimestamp() }));
                await b.commit();
                msg.textContent = `מייבא… ${Math.min(i + 400, fresh.length)}/${fresh.length}`;
            }
            msg.textContent = `✓ יובאו ${fresh.length} ${name} (${money(sum)}).`;
            const y = fresh[0].date.slice(0, 4); if ($('bk-year').value !== y && [...$('bk-year').options].some(o => o.value === y)) { $('bk-year').value = y; }
            renderBooks();
        } catch(err) { msg.textContent = err.code === 'permission-denied' ? 'אין הרשאה לשמור — פנו לתמיכה.' : 'הייבוא נכשל (' + (err.code || err.message) + ').'; }
    }
    function years(){
        const ys = new Set([new Date().getFullYear()]);
        incomeRows().forEach(r => ys.add(+String(r.date).slice(0, 4))); EXP.forEach(r => ys.add(+String(r.date).slice(0, 4)));
        return [...ys].filter(Boolean).sort((a, b) => b - a);
    }
    function renderBooks(){
        if (!started.books) return;
        const esc = C.esc, sel = $('bk-year'), cur = sel.value || String(new Date().getFullYear());
        sel.innerHTML = years().map(y => `<option value="${y}"${String(y) === cur ? ' selected' : ''}>${y}</option>`).join('');
        const Y = sel.value, inc = incomeRows().filter(r => String(r.date).startsWith(Y)), exp = EXP.filter(r => String(r.date).startsWith(Y));
        const sum = l => l.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const now = new Date(), thisM = now.getFullYear() + '-' + pad(now.getMonth() + 1);
        const mInc = sum(incomeRows().filter(r => String(r.date).startsWith(thisM))), mExp = sum(EXP.filter(r => String(r.date).startsWith(thisM)));
        const yInc = sum(inc), yExp = sum(exp);
        const k = (n, l, s, cls) => `<div class="card kpi${cls ? ' ' + cls : ''}"><div class="l">${l}</div><div class="n">${n}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        $('bk-kpis').innerHTML = k(money(mInc), 'הכנסות החודש', 'חוזים חתומים + ייבוא') + k(money(mExp), 'הוצאות החודש') + k(money(mInc - mExp), 'רווח החודש', '', mInc - mExp >= 0 ? 'hl' : 'neg')
            + k(money(yInc), 'הכנסות ' + Y) + k(money(yExp), 'הוצאות ' + Y) + k(money(yInc - yExp), 'רווח ' + Y, '', yInc - yExp >= 0 ? '' : 'neg');
        $('inc-list').innerHTML = inc.length ? `<table class="mini-t"><thead><tr><th>תאריך</th><th>תיאור</th><th>מקור</th><th>סכום</th><th></th></tr></thead><tbody>${inc.sort((a, b) => b.date.localeCompare(a.date)).map(r =>
            `<tr><td>${C.Core.fmtDate(r.date)}</td><td>${esc(r.label)}</td><td>${r.manual ? esc(r.category || 'ייבוא') : 'חוזה חתום' + (r.eventDate ? ' · ' + esc(r.eventDate) : '')}</td><td class="num">${money(r.amount)}</td><td>${r.manual ? `<button type="button" class="btn sm danger inc-del" data-id="${esc(r.id)}">מחיקה</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : '<p class="hint">עדיין אין הכנסות בשנה הזו. כל הסכם שהלקוח חותם נכנס לכאן לבד.</p>';
        $('ex-list').innerHTML = exp.length ? `<table class="mini-t"><thead><tr><th>תאריך</th><th>תיאור</th><th>קטגוריה</th><th>סכום</th><th></th></tr></thead><tbody>${exp.map(r =>
            `<tr><td>${C.Core.fmtDate(r.date)}</td><td>${esc(r.label)}</td><td>${esc(r.category || '')}</td><td class="num">${money(r.amount)}</td><td><button type="button" class="btn sm danger ex-del" data-id="${esc(r.id)}">מחיקה</button></td></tr>`).join('')}</tbody></table>`
            : '<p class="hint">עדיין אין הוצאות בשנה הזו.</p>';
        C.loadChartJs().then(() => drawBooks(Y, inc, exp)).catch(() => {});
    }
    function drawBooks(Y, inc, exp){
        if (!window.Chart) return;
        const labels = HE_MONTHS.map(m => m.slice(0, 3)), I = new Array(12).fill(0), E = new Array(12).fill(0);
        inc.forEach(r => { I[+r.date.slice(5, 7) - 1] += r.amount; });
        exp.forEach(r => { E[+String(r.date).slice(5, 7) - 1] += Number(r.amount) || 0; });
        const font = { family: 'Assistant', weight: 700 };
        if (booksChart) booksChart.destroy();
        booksChart = new Chart($('booksChart'), {
            data: { labels, datasets: [
                { type: 'bar', label: 'הכנסות', data: I, backgroundColor: '#0F766E', borderRadius: 6, maxBarThickness: 28 },
                { type: 'bar', label: 'הוצאות', data: E, backgroundColor: '#E2A33B', borderRadius: 6, maxBarThickness: 28 },
                { type: 'line', label: 'רווח', data: I.map((v, i) => v - E[i]), borderColor: '#1F2937', backgroundColor: '#1F2937', tension: .3, pointRadius: 3 } ] },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { font, usePointStyle: true } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
                scales: { x: { ticks: { font }, grid: { display: false } }, y: { ticks: { font, callback: v => '₪' + Number(v).toLocaleString() }, grid: { color: 'rgba(15,35,33,.08)' } } } } });
    }
    function downloadCsv(){
        const Y = $('bk-year').value, q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
        const rows = [['סוג', 'תאריך', 'תיאור', 'קטגוריה', 'סכום']];
        incomeRows().filter(r => String(r.date).startsWith(Y)).forEach(r => rows.push(['הכנסה', r.date, r.label, r.manual ? (r.category || 'ייבוא') : 'חוזה חתום', r.amount]));
        EXP.filter(r => String(r.date).startsWith(Y)).forEach(r => rows.push(['הוצאה', r.date, r.label, r.category || '', r.amount]));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        a.download = `income-expenses-${Y}.csv`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }

    /* =================== הסבר חד-פעמי =================== */
    const STEPS = [
        ['👋', 'ברוכים הבאים!', 'בדקה אחת תבינו איך המערכת עובדת. אפשר לחזור להסבר הזה בכל רגע מהכפתור "איך זה עובד?".'],
        ['📝', 'הצעה חדשה', 'ממלאים את פרטי האירוע ובוחרים חבילה — המחיר מחושב לבד. לוחצים "יצירת הצעה" ומקבלים קישור עם תמונה לשליחה ללקוח בוואטסאפ.'],
        ['✍️', 'הלקוח חותם', 'הלקוח פותח את הקישור, קורא וחותם מהטלפון. ההסכם החתום מגיע אליכם למייל (בפעם הראשונה מאשרים במייל "Activate").'],
        ['📅', 'יומן', 'כל הסכם חתום נכנס לבד ליומן לפי תאריך האירוע, עם כל הפרטים — ואפשר להוסיף אותו ליומן Google בלחיצה.'],
        ['💰', 'הכנסות והוצאות', 'כל חתימה נרשמת לבד כהכנסה. מוסיפים הוצאות (דלק, ציוד, פרסום…) ורואים גרף של הכנסות, הוצאות ורווח.'],
        ['📊', 'לוח בקרה', 'כל ההצעות וסטטוס החתימה, ו"החבילות שלי" — שם משנים מחירים וחבילות בכל רגע.'],
        ['💬', 'צריכים עזרה?', 'כפתור "תמיכה בוואטסאפ" נמצא בתחתית כל דף. בהצלחה!']
    ];
    let step = 0;
    function welcomeRender(){
        const [ic, h, p] = STEPS[step];
        $('wl-ic').textContent = ic; $('wl-h').textContent = h; $('wl-p').textContent = p;
        $('wl-dots').innerHTML = STEPS.map((_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('');
        $('wl-prev').classList.toggle('hidden', step === 0);
        $('wl-next').textContent = step === STEPS.length - 1 ? 'מתחילים!' : 'הבא ←';
        $('wl-skip').classList.toggle('hidden', step === STEPS.length - 1);
    }
    const seenKey = () => 'sb.welcome.' + C.slug + '.' + String(C.user.email || '').toLowerCase();
    async function markSeen(){
        try { localStorage.setItem(seenKey(), '1'); } catch(e) {}
        if (C.isOwnerView) return;
        const fs = C.fb.fs;
        try { await fs.setDoc(fs.doc(C.fb.db, 'tenants', C.slug, 'prefs', String(C.user.email || '').toLowerCase()), { welcomeSeen: true, updatedAt: fs.serverTimestamp() }); } catch(e) {}
    }
    function openWelcome(){ step = 0; welcomeRender(); if (!$('wl-dlg').open) $('wl-dlg').showModal(); }
    async function maybeWelcome(){
        if (C.isOwnerView || (window.__EMU__ && window.__EMU__.noWelcome)) return;   // בבדיקות: בלי ההסבר (חוץ מהבדיקה שלו)
        try { if (localStorage.getItem(seenKey()) === '1') return; } catch(e) {}
        const fs = C.fb.fs;
        try {
            const s = await fs.getDoc(fs.doc(C.fb.db, 'tenants', C.slug, 'prefs', String(C.user.email || '').toLowerCase()));
            if (s.exists() && s.data().welcomeSeen) { try { localStorage.setItem(seenKey(), '1'); } catch(e) {} return; }
        } catch(e) { /* אם אין הרשאה (כללים ישנים) — מציגים, ושומרים במכשיר */ }
        openWelcome();
    }
    function initWelcome(){
        $('wl-next').addEventListener('click', () => { if (step < STEPS.length - 1) { step++; welcomeRender(); } else { $('wl-dlg').close(); } });
        $('wl-prev').addEventListener('click', () => { if (step > 0) { step--; welcomeRender(); } });
        $('wl-skip').addEventListener('click', () => $('wl-dlg').close());
        $('wl-dlg').addEventListener('close', markSeen);
        $('help-btn').addEventListener('click', openWelcome);
    }

    window.AppExtras = {
        init(ctx){ C = ctx; initWelcome(); },
        show(tab){ if (tab === 'cal') startCal(); if (tab === 'books') startBooks(); },
        maybeWelcome
    };
})();
