/* לוח ניהול לבעלים: סנכרון רשימת הספקים (registry.js) ל-Firebase, סטטיסטיקות, השהיה/הפעלה וכניסה לכל חשבון. */
(async () => {
    const $ = id => document.getElementById(id), esc = Core.esc;
    let fb;
    $('signout').addEventListener('click', () => Core.signOut());
    try { fb = await Core.fb(); } catch(e) { $('loading').textContent = 'טעינת המערכת נכשלה. רעננו את הדף.'; return; }
    const { fs, db } = fb;

    let started = false;
    Core.onAuth(async user => {
        if (!user) { location.replace('./'); return; }
        if (started) return; started = true;
        $('user-email').textContent = user.email;
        if (!Core.isOwner(user)) { $('loading').classList.add('hidden'); $('blocked').classList.remove('hidden'); return; }
        $('loading').classList.add('hidden'); $('main').classList.remove('hidden');
        await sync();
        await renderAll();
    });

    // registry.js → Firebase: כרטיס לכל ספק + אינדקס מיילים (ומחיקת מיילים שהוסרו)
    async function sync(){
        const st = $('sync-status'); st.textContent = 'מסנכרן…';
        try {
            const wanted = {};
            for (const r of (window.REGISTRY || [])) {
                const slug = String(r.slug || '').toLowerCase();
                if (!/^[a-z0-9-]{2,40}$/.test(slug)) continue;
                const admins = (r.admins || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
                const ref = fs.doc(db, 'tenants', slug), snap = await fs.getDoc(ref);
                if (snap.exists()) await fs.updateDoc(ref, { name: r.name || slug, admins });
                else await fs.setDoc(ref, { slug, name: r.name || slug, admins, active: true, createdAt: fs.serverTimestamp() });
                admins.forEach(e => { wanted[e] = slug; });
            }
            const idx = await fs.getDocs(fs.collection(db, 'vendorIndex'));
            for (const d of idx.docs) if (wanted[d.id] !== d.data().tenant) await fs.deleteDoc(d.ref);
            for (const [email, slug] of Object.entries(wanted)) await fs.setDoc(fs.doc(db, 'vendorIndex', email), { tenant: slug });
            st.textContent = 'מסונכרן ✓';
        } catch(e) { console.error(e); st.textContent = 'הסנכרון נכשל: ' + (e.code || e.message); }
    }

    async function renderAll(){
        const snap = await fs.getDocs(fs.collection(db, 'tenants'));
        const inReg = new Set((window.REGISTRY || []).map(r => r.slug));
        const rows = await Promise.all(snap.docs.map(async d => {
            const t = { id: d.id, ...d.data() }, col = fs.collection(db, 'tenants', d.id, 'quotes');
            try {
                const [all, signed] = await Promise.all([ fs.getCountFromServer(col), fs.getCountFromServer(fs.query(col, fs.where('status', '==', 'signed'))) ]);
                t.total = all.data().count; t.signed = signed.data().count;
            } catch(e) { t.total = t.signed = '—'; }
            t.inRegistry = inReg.has(d.id);
            return t;
        }));
        rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
        const sum = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
        const kpi = (n, l, hl) => `<div class="card kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><div class="n">${n}</div></div>`;
        $('kpis').innerHTML = kpi(rows.length, 'ספקים') + kpi(rows.filter(r => r.active).length, 'פעילים') + kpi(rows.filter(r => !r.active).length, 'מושהים') +
            kpi(sum('total'), 'הצעות בסך הכל') + kpi(sum('signed'), 'הסכמים חתומים', true);
        $('tbody').innerHTML = rows.length ? rows.map(t => `<tr>
            <td class="name">${esc(t.name)}${t.inRegistry ? '' : '<div class="sub">לא ברשימת הספקים</div>'}</td>
            <td><a class="ltr" href="${esc(Core.PF.customerBase + '/' + t.id + '/')}" target="_blank" rel="noopener">/${esc(t.id)}</a></td>
            <td>${(t.admins || []).map(esc).join('<br>') || '<span class="sub">רק אתה</span>'}</td>
            <td class="num">${t.total}</td><td class="num">${t.signed}</td>
            <td>${t.active ? '<span class="pill signed">פעיל</span>' : '<span class="pill off">מושהה</span>'}</td>
            <td><div class="acts"><a class="btn sm primary" href="app.html?t=${encodeURIComponent(t.id)}">כניסה לחשבון</a>
                <button type="button" class="btn sm ${t.active ? 'danger' : ''} toggle" data-id="${esc(t.id)}" data-active="${t.active ? 1 : 0}">${t.active ? 'השהיה' : 'הפעלה'}</button></div></td>
        </tr>`).join('') : '<tr><td colspan="7" class="loading">אין עדיין ספקים</td></tr>';
    }

    $('tbody').addEventListener('click', async e => {
        const b = e.target.closest('button.toggle'); if (!b) return;
        const on = b.dataset.active === '1';
        if (on && !confirm('להשהות את הספק? הוא לא יוכל להיכנס לחשבון עד שתפעיל אותו מחדש.')) return;
        b.disabled = true;
        try { await fs.updateDoc(fs.doc(db, 'tenants', b.dataset.id), { active: !on }); await renderAll(); }
        catch(err) { alert('הפעולה נכשלה: ' + (err.code || err.message)); b.disabled = false; }
    });
})();
