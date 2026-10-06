/* תפריט נגישות: כפתור צף שפותח לוח קטן — ניגודיות גבוהה, הגדלת טקסט,
   הדגשת קישורים ומקטעים, ואיפוס. ההעדפות נשמרות במכשיר בלבד.
   הכללה: <script src="a11y.js"></script> לפני </body>. */
(function(){
    var STORE_KEY = 'q_a11y_v1';
    var FONT_STEPS = [1, 1.12, 1.25, 1.4];
    var prefs = { contrast:false, font:0, highlight:false };
    try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch(e){}
    function save(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch(e){} }

    function injectStyles(){
        var css =
            '#a11y-wrap{ position:fixed; z-index:950; right:16px; bottom:calc(env(safe-area-inset-bottom) + 18px); font-family:Heebo,system-ui,sans-serif; }' +
            'html.has-cookie-bar #a11y-wrap{ bottom:calc(env(safe-area-inset-bottom) + 96px); }' +
            '#a11y-fab{ width:52px; height:52px; border-radius:50%; border:0; cursor:pointer; display:grid; place-items:center;' +
                'background:var(--brand,#2B59FF); color:var(--brand-ink,#fff); box-shadow:0 10px 24px -10px rgba(0,0,0,.45); padding:0; transition:transform .12s, box-shadow .12s; }' +
            '#a11y-fab:active{ transform:translate(3px,3px); box-shadow:none; }' +
            '#a11y-fab svg{ width:28px; height:28px; }' +
            '#a11y-panel{ position:absolute; right:0; bottom:64px; width:230px; background:#fff; color:#16161A; border:1px solid #E2E2E2;' +
                'border-radius:16px; box-shadow:0 20px 40px -16px rgba(0,0,0,.35); padding:12px; display:none; flex-direction:column; gap:8px; }' +
            '#a11y-wrap.open #a11y-panel{ display:flex; }' +
            '#a11y-panel h3{ margin:0 2px 2px; font:800 14px Heebo,sans-serif; }' +
            '.a11y-opt{ display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; cursor:pointer; text-align:right;' +
                'border:1px solid #DDDDDD; border-radius:11px; background:#fff; padding:9px 11px; font:700 13.5px Heebo,system-ui,sans-serif; color:#16161A; }' +
            '.a11y-opt[aria-pressed="true"]{ background:var(--brand-soft,#EEF2FF); border-color:var(--brand,#2B59FF); }' +
            '.a11y-opt .st{ font-size:11px; font-weight:800; opacity:.7; }' +
            '.a11y-reset{ background:none; border:0; cursor:pointer; font:700 12.5px Heebo,sans-serif; color:#D63A0A; text-decoration:underline; padding:4px; }' +
            '#a11y-fab:focus-visible, .a11y-opt:focus-visible, .a11y-reset:focus-visible{ outline:3px solid #4D7CFE; outline-offset:2px; }' +

            /* ניגודיות גבוהה — דורס את משתני הצבע של האתר */
            'html.a11y-contrast{ --bg:#fff; --card:#fff; --ink:#000; --muted:#000; --faint:#222; --line:#000; }' +
            'html.a11y-contrast body{ background:#fff !important; }' +
            'html.a11y-contrast .card, html.a11y-contrast .incl li{ border:2px solid #000 !important; box-shadow:none !important; }' +
            'html.a11y-contrast a{ text-decoration:underline !important; }' +

            /* הדגשת קישורים ומקטעים */
            'html.a11y-highlight a{ background:#FFF200 !important; color:#000 !important; text-decoration:underline !important; outline:2px solid #000; }' +
            'html.a11y-highlight section, html.a11y-highlight .card{ outline:3px dashed #4D7CFE !important; outline-offset:4px; }' +
            '@media (prefers-reduced-motion:reduce){ #a11y-fab{ transition:none } }';
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function injectWidget(){
        var wrap = document.createElement('div');
        wrap.id = 'a11y-wrap';
        wrap.innerHTML =
            '<div id="a11y-panel" role="dialog" aria-label="הגדרות נגישות">' +
                '<h3>נגישות</h3>' +
                '<button type="button" class="a11y-opt" data-act="contrast" aria-pressed="false">ניגודיות גבוהה <span class="st"></span></button>' +
                '<button type="button" class="a11y-opt" data-act="font" aria-pressed="false">הגדלת טקסט <span class="st"></span></button>' +
                '<button type="button" class="a11y-opt" data-act="highlight" aria-pressed="false">הדגשת קישורים ומקטעים <span class="st"></span></button>' +
                '<button type="button" class="a11y-reset">איפוס הכל</button>' +
            '</div>' +
            '<button type="button" id="a11y-fab" aria-expanded="false" aria-controls="a11y-panel" aria-label="פתיחת תפריט נגישות">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="3.8" r="2.1" fill="currentColor"/><path d="M4.5 8.2s4 1 7.5 1 7.5-1 7.5-1M12 9.4V14M8.5 20.5 12 13.2l3.5 7.3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>';
        document.body.appendChild(wrap);
        var fab = wrap.querySelector('#a11y-fab');

        function setOpen(v){ wrap.classList.toggle('open', v); fab.setAttribute('aria-expanded', String(v)); }
        function mark(act, on, txt){
            var b = wrap.querySelector('[data-act="' + act + '"]');
            if (!b) return;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.querySelector('.st').textContent = txt != null ? txt : (on ? 'פעיל' : '');
        }
        function applyAll(){
            var root = document.documentElement;
            root.classList.toggle('a11y-contrast', !!prefs.contrast);
            root.classList.toggle('a11y-highlight', !!prefs.highlight);
            root.style.fontSize = prefs.font > 0 ? (FONT_STEPS[prefs.font] * 100) + '%' : '';
            mark('contrast', !!prefs.contrast);
            mark('highlight', !!prefs.highlight);
            mark('font', prefs.font > 0, prefs.font > 0 ? Math.round(FONT_STEPS[prefs.font] * 100) + '%' : '');
        }

        fab.addEventListener('click', function(e){ e.stopPropagation(); setOpen(!wrap.classList.contains('open')); });
        document.addEventListener('click', function(e){ if (!wrap.contains(e.target)) setOpen(false); });
        document.addEventListener('keydown', function(e){ if (e.key === 'Escape') setOpen(false); });
        Array.prototype.forEach.call(wrap.querySelectorAll('.a11y-opt'), function(btn){
            btn.addEventListener('click', function(){
                var a = btn.getAttribute('data-act');
                if (a === 'contrast') prefs.contrast = !prefs.contrast;
                else if (a === 'highlight') prefs.highlight = !prefs.highlight;
                else if (a === 'font') prefs.font = (prefs.font + 1) % FONT_STEPS.length;
                save(); applyAll();
            });
        });
        wrap.querySelector('.a11y-reset').addEventListener('click', function(){
            prefs = { contrast:false, font:0, highlight:false }; save(); applyAll();
        });
        applyAll();
    }

    function init(){ injectStyles(); injectWidget(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
