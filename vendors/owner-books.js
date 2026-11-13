/* לוח הניהול → "הכנסות והוצאות" של Snap Box: הכנסות (ירוק) = הצעות חתומות של ספקים + הכנסות שהבעלים מוסיף,
   הוצאות (אדום) = מה שהבעלים מוסיף. נשמר ב-ownerBooks/{id} = {type:'in'|'out', date, amount, label, category, createdAt} (רק הבעלים). */
window.OwnerBooks = (function(){
    const $ = id => document.getElementById(id), esc = Core.esc, money = Core.money;
    const CATS = { out: ['פרסום', 'שרתים ותוכנה', 'דומיין', 'ציוד', 'רואה חשבון', 'אחר'], in: ['מנוי שנתי', 'תמיכה טכנית', 'הקמה', 'אחר'] };
    const HE_M = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
    const TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"/></svg>';
    let fb, getOffers, ROWS = [], started = false, year = new Date().getFullYear(), kind = 'out';

    function rows(){
        const offers = (getOffers() || []).filter(o => o.status === 'signed' && o.signedAt && o.signedAt.toDate).map(o => ({
            id: 'o:' + o.id, type: 'in', auto: true, date: Core.toISO(o.signedAt.toDate()), amount: Number(o.total) || 0,
            label: o.vendorName || 'ספק', category: 'הצעה חתומה' + (o.planLabel ? ' · ' + o.planLabel : '') }));
        return offers.concat(ROWS).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }
    function render(){
        if (!started) return;
        const all = rows(), ys = new Set([new Date().getFullYear()]); all.forEach(r => ys.add(+String(r.date).slice(0, 4)));
        $('ob-year').innerHTML = [...ys].filter(Boolean).sort((a, b) => b - a).map(y => `<option${y === year ? ' selected' : ''}>${y}</option>`).join('');
        const inY = all.filter(r => String(r.date).startsWith(year + '-'));
        const sum = t => inY.filter(r => r.type === t).reduce((s, r) => s + r.amount, 0);
        const inc = sum('in'), exp = sum('out'), pr = inc - exp;
        $('ob-kpis').innerHTML = `<div class="card bk-kpi inc"><div class="l">הכנסות ${year}</div><div class="n">${money(inc)}</div></div>
            <div class="card bk-kpi exp"><div class="l">הוצאות ${year}</div><div class="n">${money(exp)}</div></div>
            <div class="card bk-kpi pr ${pr >= 0 ? 'up' : 'down'}"><div class="l">${pr >= 0 ? 'רווח' : 'הפסד'}</div><div class="n">${money(Math.abs(pr))}</div></div>`;
        // גרף עמודות לפי חודש (בלי ספרייה)
        const m = Array.from({ length: 12 }, () => ({ i: 0, o: 0 }));
        inY.forEach(r => { const k = +String(r.date).slice(5, 7) - 1; if (k >= 0 && k < 12) m[k][r.type === 'in' ? 'i' : 'o'] += r.amount; });
        const max = Math.max(1, ...m.map(x => Math.max(x.i, x.o)));
        $('ob-chart').innerHTML = m.map((x, k) => `<div class="ob-col" title="${HE_M[k]}: הכנסות ${money(x.i)} · הוצאות ${money(x.o)}">
            <div class="ob-bars"><span class="ob-b in" style="height:${(x.i / max * 100).toFixed(1)}%"></span><span class="ob-b out" style="height:${(x.o / max * 100).toFixed(1)}%"></span></div><small>${HE_M[k]}</small></div>`).join('');
        $('ob-list').innerHTML = inY.length ? `<ul class="tx-list">${inY.map(r => `<li class="tx ${r.type === 'in' ? 'inc' : 'exp'}"><span class="tx-dot" aria-hidden="true"></span>
            <div class="tx-main"><div class="tx-l">${esc(r.label)}</div><div class="tx-s">${esc(Core.fmtDate(r.date))} · ${esc(r.category || '')}</div></div>
            <div class="tx-a">${r.type === 'in' ? '+' : '−'}${money(r.amount)}</div>
            ${r.auto ? '<span class="tx-del-sp" aria-hidden="true"></span>' : `<button type="button" class="tx-del" data-id="${esc(r.id)}" aria-label="מחיקה: ${esc(r.label)}">${TRASH}</button>`}</li>`).join('')}</ul>`
            : '<p class="hint">אין תנועות בשנה הזאת.</p>';
    }
    function setKind(k){
        kind = k;
        document.querySelectorAll('#ob-kind button').forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        $('ob-cat').innerHTML = CATS[k].map(c => `<option>${c}</option>`).join('');
        $('ob-add').textContent = k === 'in' ? 'הוספת הכנסה' : 'הוספת הוצאה';
        $('ob-add').classList.toggle('inc', k === 'in'); $('ob-add').classList.toggle('exp', k === 'out');
    }
    function start(opts){
        if (started) { render(); return; }
        started = true; fb = opts.fb; getOffers = opts.getOffers;
        const { fs, db } = fb;
        $('ob-date').value = Core.toISO(new Date()); setKind('out');
        $('ob-kind').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setKind(b.dataset.k); });
        $('ob-year').addEventListener('change', e => { year = +e.target.value; render(); });
        $('ob-form').addEventListener('submit', async e => {
            e.preventDefault();
            const amount = Math.round((Number($('ob-amount').value) || 0) * 100) / 100, label = $('ob-label').value.trim().replace(/[<>]/g, '').slice(0, 120);
            if (!(amount > 0)) { $('ob-msg').textContent = 'נא להזין סכום.'; $('ob-amount').focus(); return; }
            if (!label) { $('ob-msg').textContent = 'נא להזין תיאור.'; $('ob-label').focus(); return; }
            const date = /^\d{4}-\d{2}-\d{2}$/.test($('ob-date').value) ? $('ob-date').value : Core.toISO(new Date());
            $('ob-add').disabled = true;
            try {
                await fs.addDoc(fs.collection(db, 'ownerBooks'), { type: kind, date, amount, label, category: $('ob-cat').value, createdAt: fs.serverTimestamp() });
                $('ob-amount').value = ''; $('ob-label').value = ''; $('ob-msg').textContent = kind === 'in' ? '✓ ההכנסה נשמרה' : '✓ ההוצאה נשמרה';
                year = +date.slice(0, 4);
            } catch (err) { console.error(err); $('ob-msg').textContent = Core.isQuota(err) ? Core.QUOTA_MSG : 'השמירה נכשלה (הרשאות). יש להדביק את firestore.rules מחדש.'; }
            $('ob-add').disabled = false;
        });
        $('ob-list').addEventListener('click', async e => {
            const b = e.target.closest('.tx-del'); if (!b) return;
            const r = ROWS.find(x => x.id === b.dataset.id); if (!r || !confirm(`למחוק את "${r.label}"?`)) return;
            try { await fs.deleteDoc(fs.doc(db, 'ownerBooks', r.id)); } catch (err) { alert('המחיקה נכשלה.'); }
        });
        fs.onSnapshot(fs.collection(db, 'ownerBooks'), snap => {
            ROWS = snap.docs.map(d => ({ id: d.id, ...d.data() })).map(r => ({ ...r, amount: Number(r.amount) || 0, type: r.type === 'in' ? 'in' : 'out' }));
            render();
        }, err => { console.error(err); $('ob-msg').textContent = 'לא ניתן לטעון הוצאות (הרשאות) — יש להדביק את firestore.rules מחדש. ההכנסות מהצעות חתומות מוצגות.'; render(); });
        render();
    }
    return { start, render };
})();
