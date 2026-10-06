/* הודעת עוגיות. הכללה: <script src="cookie-consent.js"></script> לפני </body>. */
(function(){
    var KEY = 'q_cookie_ack_v1';

    function acked(){ try { return localStorage.getItem(KEY) === '1'; } catch(e){ return false; } }
    function ack(){
        try { localStorage.setItem(KEY, '1'); } catch(e){}
        var bar = document.getElementById('cookie-bar');
        if (bar) bar.remove();
        document.documentElement.classList.remove('has-cookie-bar');
    }

    function injectStyles(){
        var css =
            '#cookie-bar{ position:fixed; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom)); z-index:980;' +
                'max-width:640px; margin:0 auto; background:#1B1B1F; color:#F5F5F5; border:0; border-radius:16px;' +
                'box-shadow:0 12px 30px -10px rgba(0,0,0,.5); display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;' +
                'padding:13px 16px; font-family:Heebo,system-ui,sans-serif; font-size:13px; }' +
            '#cookie-bar p{ margin:0; flex:1 1 260px; line-height:1.6; }' +
            '#cookie-bar a{ color:#fff; font-weight:700; text-decoration:underline; }' +
            '#cookie-bar button{ flex:none; border:2px solid #F3EEE4; border-radius:999px; padding:8px 18px; font-weight:800;' +
                'font-family:Heebo,sans-serif; font-size:13px; cursor:pointer; color:#16120E; background:#fff; }';
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function show(){
        var bar = document.createElement('div');
        bar.id = 'cookie-bar';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'הודעת עוגיות');
        bar.innerHTML =
            '<p>האתר שומר במכשיר רק מידע טכני הכרחי לתפעולו — בלי מעקב שיווקי או פרסומי. ' +
            'פרטים ב<a href="' + (window.PRIVACY_URL || 'privacy.html') + '">מדיניות הפרטיות</a>.</p>' +
            '<button type="button" id="cookie-ok">סגור</button>';
        document.body.appendChild(bar);
        document.documentElement.classList.add('has-cookie-bar');
        document.getElementById('cookie-ok').addEventListener('click', ack);
    }

    function init(){ injectStyles(); if (!acked()) show(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
