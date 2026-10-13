/* ייבוא הכנסות / הוצאות מקובץ אקסל (xlsx) או CSV — הכול בדפדפן, הקובץ לא נשלח לשום מקום.
   בלי ספרייה חיצונית: xlsx = קובץ zip עם XML, נפתח עם DecompressionStream.
   SheetImport.parse(file) → { items:[{date:'YYYY-MM-DD', amount, label, category}], skipped, total }
   העמודות מזוהות לפי הכותרת (עברית/אנגלית), ואם אין כותרת — לפי התוכן (עמודת תאריכים, עמודת סכומים, עמודת טקסט). */
(function(){
    const MAX_ROWS = 2000;

    /* ---------- zip (xlsx) ---------- */
    async function inflateRaw(bytes){
        const ds = new DecompressionStream('deflate-raw');
        const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
        return new Uint8Array(await out.arrayBuffer());
    }
    async function unzip(buf, wanted){
        const u8 = new Uint8Array(buf), dv = new DataView(buf), files = {};
        let eocd = -1;
        for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        if (eocd < 0) throw new Error('not-zip');
        let p = dv.getUint32(eocd + 16, true);
        const n = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
        for (let k = 0; k < n; k++) {
            if (dv.getUint32(p, true) !== 0x02014b50) break;
            const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
            const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
            const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
            p += 46 + nl + el + cl;
            if (!wanted(name)) continue;
            const ln = dv.getUint16(off + 26, true), le = dv.getUint16(off + 28, true), start = off + 30 + ln + le;
            const data = u8.subarray(start, start + csize);
            files[name] = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
        }
        return files;
    }
    const xml = bytes => new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    const colIndex = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    async function readXlsx(buf){
        const files = await unzip(buf, n => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
        if (!files['xl/workbook.xml']) throw new Error('not-xlsx');
        // הגיליון הראשון בחוברת
        let target = null;
        const wb = xml(files['xl/workbook.xml']), sh = wb.getElementsByTagName('sheet')[0];
        if (sh && files['xl/_rels/workbook.xml.rels']) {
            const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
            const rel = [...xml(files['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
            if (rel) { const t = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, ''); target = 'xl/' + t; }
        }
        const sheetName = target && files[target] ? target : Object.keys(files).filter(n => n.startsWith('xl/worksheets/')).sort()[0];
        if (!sheetName) throw new Error('no-sheet');
        const shared = files['xl/sharedStrings.xml'] ? [...xml(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
        const rows = [];
        for (const r of xml(files[sheetName]).getElementsByTagName('row')) {
            const row = [];
            for (const c of r.getElementsByTagName('c')) {
                const i = colIndex(c.getAttribute('r')), t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
                let val = '';
                if (t === 's') val = shared[+(v && v.textContent)] || '';
                else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
                else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
                else if (t === 'b') val = v ? v.textContent === '1' : '';
                else val = v ? Number(v.textContent) : '';
                row[i >= 0 ? i : row.length] = val;
            }
            rows.push(row);
            if (rows.length > MAX_ROWS + 20) break;
        }
        return rows;
    }

    /* ---------- CSV ---------- */
    function decodeText(buf){
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch(e) { return new TextDecoder('windows-1255').decode(buf); }   // CSV של אקסל בעברית
    }
    function readCsv(text){
        text = text.replace(/^﻿/, '');
        const first = text.split(/\r?\n/)[0] || '';
        const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
        const rows = []; let row = [], cur = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
            else if (ch === '"') q = true;
            else if (ch === delim) { row.push(cur); cur = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; if (rows.length > MAX_ROWS + 20) break; }
            else cur += ch;
        }
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
        return rows;
    }

    /* ---------- ערכים ---------- */
    const pad = n => String(n).padStart(2, '0');
    const okDate = (y, m, d) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
    function toDate(v){
        if (typeof v === 'number' && v > 20000 && v < 80000) {      // מספר תאריך של אקסל
            const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
            return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
        }
        const s = String(v == null ? '' : v).trim();
        let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
        if (m && okDate(+m[1], +m[2], +m[3])) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
        m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);          // בישראל: יום/חודש/שנה
        if (m) { let y = +m[3]; if (y < 100) y += 2000; if (okDate(y, +m[2], +m[1])) return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
        return null;
    }
    function toAmount(v){
        if (typeof v === 'number') return isFinite(v) && v !== 0 ? Math.round(Math.abs(v) * 100) / 100 : null;
        let s = String(v == null ? '' : v).replace(/[₪\s‎‏]|ש"ח|ש״ח|NIS|ILS/gi, '');
        const neg = /^-|-$|^\(.*\)$/.test(s);
        s = s.replace(/[()\-+]/g, '');
        if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,50
        else s = s.replace(/,/g, '');
        if (!/^\d+(\.\d+)?$/.test(s)) return null;
        const n = Number(s); void neg;
        return n > 0 ? Math.round(n * 100) / 100 : null;
    }
    const clean = s => String(s == null ? '' : s).replace(/[<>|^~]/g, ' ').replace(/\s+/g, ' ').trim();

    /* ---------- זיהוי עמודות ---------- */
    const HEAD = {
        date: /תאריך|date|יום|מועד/i,
        amount: /סכום|amount|סה"?כ|סה״כ|total|מחיר|price|חובה|זכות|תשלום|הכנסה|הוצאה|sum|₪/i,
        label: /תיאור|פירוט|description|שם|לקוח|ספק|פרטים|הערה|details|name|עבור|memo/i,
        category: /קטגוריה|category|סוג|type|סיווג/i
    };
    function detect(rows){
        // כותרת: אחת מ-5 השורות הראשונות שיש בה גם "תאריך" וגם "סכום" (או לפחות שתי כותרות מוכרות)
        for (let r = 0; r < Math.min(5, rows.length); r++) {
            const row = rows[r] || [], map = {};
            row.forEach((h, i) => { const t = String(h == null ? '' : h).trim(); if (!t || toAmount(t) || toDate(t)) return;
                for (const k of ['date', 'category', 'label', 'amount']) if (map[k] == null && HEAD[k].test(t)) { map[k] = i; break; } });
            if (map.date != null && map.amount != null) return { start: r + 1, map };
        }
        // בלי כותרת — לפי התוכן
        const sample = rows.slice(0, 40), width = Math.max(0, ...sample.map(r => (r || []).length));
        const score = f => [...Array(width).keys()].map(i => sample.filter(r => r && f(r[i])).length);
        const ds = score(v => toDate(v)), as = score(v => typeof v !== 'string' || !toDate(v) ? toAmount(v) : null), ts = score(v => typeof v === 'string' && v.trim() && !toDate(v) && !toAmount(v));
        const best = arr => arr.indexOf(Math.max(...arr));
        const date = best(ds), map = { date };
        const as2 = as.map((x, i) => i === date ? -1 : x); map.amount = best(as2);
        const ts2 = ts.map((x, i) => i === date || i === map.amount ? -1 : x); if (Math.max(...ts2) > 0) map.label = best(ts2);
        return { start: 0, map };
    }

    async function parse(file, kind){
        if (!file) throw new Error('no-file');
        if (file.size > 8 * 1024 * 1024) throw new Error('too-big');
        const buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 4));
        let rows;
        if (head[0] === 0x50 && head[1] === 0x4b) rows = await readXlsx(buf);              // PK = xlsx
        else if (head[0] === 0xD0 && head[1] === 0xCF) throw new Error('old-xls');          // xls ישן (97-2003)
        else rows = readCsv(decodeText(buf));
        rows = rows.filter(r => r && r.some(v => String(v == null ? '' : v).trim() !== ''));
        if (!rows.length) throw new Error('empty');
        const { start, map } = detect(rows);
        const items = []; let skipped = 0;
        for (const r of rows.slice(start)) {
            if (items.length >= MAX_ROWS) { skipped++; continue; }
            const date = toDate(r[map.date]), amount = toAmount(r[map.amount]);
            if (!date || !amount) { skipped++; continue; }
            const label = clean(map.label != null ? r[map.label] : '').slice(0, 120) || (kind === 'income' ? 'הכנסה מיובאת' : 'הוצאה מיובאת');
            const category = clean(map.category != null ? r[map.category] : '').slice(0, 40) || (kind === 'income' ? 'ייבוא' : 'אחר');
            items.push({ date, amount, label, category });
        }
        return { items, skipped, total: Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100 };
    }
    const MESSAGES = { 'old-xls': 'זה קובץ אקסל ישן (xls). פתחו אותו באקסל ← "שמירה בשם" ← "חוברת עבודה של Excel (xlsx)" ונסו שוב.', 'too-big': 'הקובץ גדול מדי (עד 8MB).',
        'empty': 'הקובץ ריק.', 'not-zip': 'לא הצלחתי לקרוא את הקובץ. שמרו אותו כ-xlsx או CSV ונסו שוב.', 'not-xlsx': 'לא הצלחתי לקרוא את הקובץ. שמרו אותו כ-xlsx או CSV ונסו שוב.', 'no-sheet': 'לא נמצא גיליון בקובץ.' };
    const message = e => MESSAGES[e && e.message] || 'לא הצלחתי לקרוא את הקובץ (' + ((e && e.message) || e) + ').';
    // קובץ דוגמה (CSV שנפתח באקסל)
    function sample(kind){
        const rows = kind === 'income'
            ? [['תאריך', 'תיאור', 'סכום', 'קטגוריה'], ['01/10/2026', 'אירוע — משפחת כהן', '2500', 'אירועים'], ['05/10/2026', 'בר מצווה — לוי', '3200', 'אירועים']]
            : [['תאריך', 'תיאור', 'סכום', 'קטגוריה'], ['02/10/2026', 'נייר הדפסה', '180', 'ציוד'], ['03/10/2026', 'דלק', '250', 'נסיעות ודלק']];
        return new Blob(['﻿' + rows.map(r => r.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    }
    const key = x => x.date + '|' + Number(x.amount) + '|' + String(x.label || '').trim();
    window.SheetImport = { parse, message, sample, key, toDate, toAmount };
})();
