/* מדידה באתר המכירה.
   1) מונה כניסות ופעולות אנונימי — בלי עוגיות ובלי מידע אישי. מסמך אחד ליום ב-Firestore: stats/d<יום> = { v, t, w, l }
      v = כניסות (מכשיר אחד נספר פעם אחת ביום) · t = כניסות מטיקטוק (?utm_source=tiktok) · w = לחיצות על וואטסאפ · l = לחיצות על "כניסת ספקים".
      הכללים מאפשרים רק +1 לשדה אחד בכל פעם, ורק במסמך של היום. בעלים בלבד קורא (לוח הניהול).
   2) הפיקסל של טיקטוק — נטען רק אם הוגדר מזהה (window.MARKETING.tiktokPixel) ורק אחרי שהגולש אישר בהודעת העוגיות. */
(function(){
    var EMU = window.__EMU__;
    var BASE = EMU ? 'http://127.0.0.1:' + EMU.firestore + '/v1' : 'https://firestore.googleapis.com/v1';
    var DOC = 'projects/check-b2a66/databases/default/documents/stats/';
    var day = 'd' + Math.floor(Date.now() / 86400000);   // יום לפי UTC (כך גם בכללים)

    function bump(field, leaving){
        var url = BASE + '/' + DOC.split('/documents/')[0] + '/documents:commit';
        var opt = { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ writes: [{ transform: { document: DOC + day, fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }] } }] }) };
        // keepalive רק כשהדף עומד לעבור לעמוד אחר (כדי שהספירה תישלח גם אז). אם לא נתמך — שליחה רגילה
        try { fetch(url, leaving ? Object.assign({ keepalive: true }, opt) : opt).catch(function(){ if (leaving) fetch(url, opt).catch(function(){}); }); }
        catch(e) { try { fetch(url, opt).catch(function(){}); } catch(e2) {} }
    }
    function once(field){
        var k = 'sb.st.' + day + '.' + field;
        try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch(e) {}
        bump(field);
    }

    /* ---- הפיקסל של טיקטוק (רק אחרי הסכמה) ---- */
    var PIXEL = ((window.MARKETING || {}).tiktokPixel || '').trim();
    var pixelOn = false;
    function loadPixel(){
        if (pixelOn || !/^[A-Z0-9]{10,40}$/i.test(PIXEL)) return;
        pixelOn = true;
        /* הקוד הרשמי של טיקטוק */
        !function (w, d, t) {
            w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
            ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];
            ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
            for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
            ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; };
            ttq.load = function (e, n) {
                var r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
                ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; ttq._o = ttq._o || {}; ttq._o[e] = n || {};
                var s = d.createElement('script'); s.type = 'text/javascript'; s.async = true; s.src = r + '?sdkid=' + e + '&lib=' + t;
                var f = d.getElementsByTagName('script')[0]; f.parentNode.insertBefore(s, f);
            };
            ttq.load(PIXEL); ttq.page();
        }(window, document, 'ttq');
    }
    function pixel(ev){ if (pixelOn && window.ttq) try { window.ttq.track(ev); } catch(e) {} }

    window.SBMarketing = {
        configured: function(){ return /^[A-Z0-9]{10,40}$/i.test(PIXEL); },
        on: loadPixel
    };

    /* ---- מה נספר ---- */
    function init(){
        once('v');
        if (/[?&]utm_source=tiktok\b/i.test(location.search)) once('t');
        document.addEventListener('click', function(e){
            var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
            var h = a.getAttribute('href') || '';
            if (/wa\.me\//.test(h)) { bump('w'); pixel('Contact'); }
            else if (/(^|\/)vendors\/?$/.test(h)) { bump('l', true); pixel('ClickButton'); }
        }, true);
        var c = null; try { c = localStorage.getItem('sb_mkt_v1'); } catch(e) {}
        if (c === 'yes') loadPixel();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
