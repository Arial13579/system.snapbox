"""יוצר את index.html של כל ספק מתוך config.js שלו (תגי התצוגה המקדימה בוואטסאפ חייבים להיות סטטיים).
הרצה: python3 tools/make_pages.py   (מתוך תיקיית השורש של האתר)"""
import json, pathlib, re, html

BASE = 'https://arial13579.github.io/hatzaa'   # הכתובת הציבורית של האתר (תוחלף בדומיין כשיהיה)

TEMPLATE = '''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#F5F4F1">
<meta name="robots" content="noindex, nofollow">
<title>{name} | הצעת מחיר והסכם</title>
<meta name="description" content="הצעת המחיר וההסכם שלך מ-{name} — כל הפרטים וחתימה דיגיטלית.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{name}">
<meta property="og:title" content="{name} · הצעת המחיר שלך מוכנה">
<meta property="og:description" content="לחצו לצפייה בכל הפרטים ולחתימה דיגיטלית.">
<meta property="og:image" content="{og}">
<meta property="og:locale" content="he_IL">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{icon}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="../assets/quote.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
</head>
<body>
<div id="app"></div>
<script>window.PRIVACY_URL = '../legal/privacy.html?t={slug}';</script>
<script src="config.js"></script>
<script src="../assets/platform.js"></script>
<script src="../assets/icons.js"></script>
<script src="../assets/brand.js"></script>
<script src="../assets/quote.js"></script>
<script src="../assets/cookie.js"></script>
<script src="../assets/a11y.js"></script>
</body>
</html>
'''

def field(src, key):
    m = re.search(key + r"\s*:\s*'([^']*)'", src)
    return m.group(1) if m else ''

root = pathlib.Path(__file__).resolve().parent.parent
for cfg in sorted(root.glob('*/config.js')):
    d = cfg.parent
    src = cfg.read_text(encoding='utf-8')
    slug, name, logo = field(src, 'slug'), field(src, 'name'), field(src, 'logo')
    og = f"{BASE}/{slug}/og.jpg" if (d / 'og.jpg').exists() else f"{BASE}/assets/og-default.jpg"
    icon = logo if logo else '../assets/favicon.svg'
    (d / 'index.html').write_text(TEMPLATE.format(name=html.escape(name), slug=slug, og=og, icon=icon), encoding='utf-8')
    print('wrote', d.name + '/index.html')
