"""
PRIVACY.md ו-TERMS.md → site/privacy.html ו-site/terms.html.

‏Google דורשת שמדיניות הפרטיות תשב על הדומיין של האפליקציה (לא על
github.com), ולכן הדפים נבנים מאותו מקור ומתפרסמים עם האתר. ה-md הוא
המקור היחיד; אחרי כל שינוי בו — להריץ שוב:

    python tools/legal-pages.py
"""
import os
import re

import markdown

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REPO = 'https://github.com/5645hm-a11y/omniflux-player/blob/main/'
PAGES = {'PRIVACY.md': ('privacy.html', 'Privacy Policy'), 'TERMS.md': ('terms.html', 'Terms of Use')}

TEMPLATE = '''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} — OmniFlux Player</title>
  <link rel="icon" href="assets/favicon.png" />
  <style>
    :root {{ --canvas: #08090c; --surf: #0f1115; --ink: #f2f3f5; --ink-2: #b3b8c2; --ink-3: #868c99; --violet: #a594ff; --line: rgba(255,255,255,.08); }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: var(--canvas); color: var(--ink-2); font: 16px/1.7 'Segoe UI', system-ui, sans-serif; }}
    main {{ max-width: 760px; margin: 0 auto; padding: 48px 16px 80px; }}
    nav {{ max-width: 760px; margin: 0 auto; padding: 22px 16px 0; display: flex; gap: 18px; font-size: 14px; }}
    a {{ color: var(--violet); }}
    h1 {{ color: var(--ink); font-size: 36px; line-height: 1.15; margin: 0 0 8px; }}
    h2 {{ color: var(--ink); font-size: 21px; margin: 36px 0 10px; }}
    strong {{ color: var(--ink); }}
    code {{ background: var(--surf); border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; font-size: 13.5px; word-break: break-all; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14.5px; display: block; overflow-x: auto; }}
    th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }}
    th {{ color: var(--ink); }}
    li {{ margin: 6px 0; }}
  </style>
</head>
<body>
  <nav><a href="./">← OmniFlux Player</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></nav>
  <main>
{body}
  </main>
</body>
</html>
'''

for source, (target, title) in PAGES.items():
    text = open(os.path.join(ROOT, source), encoding='utf-8').read()
    html = markdown.markdown(text, extensions=['tables'])
    # קישורים בין המסמכים נשארים באתר; LICENSE וקבצים אחרים — לריפו
    html = html.replace('href="PRIVACY.md"', 'href="privacy.html"').replace('href="TERMS.md"', 'href="terms.html"')
    html = re.sub(r'href="(?!https?://|#|privacy\.html|terms\.html)([^"]+)"', lambda m: f'href="{REPO}{m.group(1)}"', html)
    open(os.path.join(ROOT, 'site', target), 'w', encoding='utf-8').write(TEMPLATE.format(title=title, body=html))
    print('·', target)
