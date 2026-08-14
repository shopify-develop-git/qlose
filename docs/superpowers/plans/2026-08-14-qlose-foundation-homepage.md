# QLOSE Foundation + Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Побудувати фундамент теми QLOSE (токени, шрифти, шапка, футер, спільні секції) і головну сторінку на гілці `main`, щоб усі наступні гілки сторінок відгалужувались від готової бази.

**Architecture:** Чотири шари поверх стокової Horizon 4.1.4: вендорське ядро не редагуємо; `assets/qlose.css` дає токени й примітиви; кастомні секції `qlose-*` несуть власний `{% stylesheet %}` у конвенції Horizon; `templates/index.json` збирає головну з цих секцій. Інтерактив — на web-компонентах Horizon (`cart-icon`, `header-drawer`), нових JS-компонентів пишемо мінімум.

**Tech Stack:** Shopify Horizon 4.1.4, Liquid, Shopify CLI 4.6.1 на Node 22.23.2, self-hosted woff2, Python 3 для верифікаційного харнесу.

**Spec:** `docs/superpowers/specs/2026-08-14-qlose-shopify-migration-design.md`

## Global Constraints

- Node 22 + Shopify CLI 4.x обовʼязкові. Кожна shell-сесія починається з `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`. На Node 20 (CLI 3.93.2) тема не заливається взагалі.
- Стор `getqlose.myshopify.com`, dev-тема `199943618907`, локалка `http://127.0.0.1:9292`.
- Жоден файл поза `qlose-*`, `templates/`, `config/`, `layout/theme.liquid` не редагується. Вендорські файли Horizon недоторканні.
- Усі нові секції, снипети та ассети мають префікс `qlose-`.
- `--muted` = `#666666`. Ніколи не `#888` — це провал WCAG AA на обох тлах теми.
- Стор порожній (0 товарів, 0 сторінок, немає блогу). Кожна секція мусить рендеритись без даних.
- Базовий рівень `shopify theme check` на стоковій темі під CLI 4 — **нуль зауважень**. Тобто будь-яка помилка чи попередження у виводі належить нам і має бути виправлена, а не списана на вендора. (Раніші 6 errors / 2 warnings були виміряні на CLI 3.93.2 і до цієї роботи не стосуються — набір правил у CLI 4 інший.)
- Виняток — попередження `OrphanedSnippet` на снипетах, які ще не має хто використовувати: воно зникає, щойно перша секція їх викликає. Якщо снипет лишився осиротілим після Task 13 — він зайвий і має бути видалений.
- Тексти переносяться з джерела дослівно. Юридичні формулювання не редагуються.
- Кожна задача завершується комітом у `main`.

---

### Task 1: Верифікаційний харнес і брендові ассети

Тема не має тестового фреймворку, тож спершу будуємо те, що дасть циклу
«червоне → зелене» сенс: скрипт, який стукає в локалку й перевіряє контракт
розмітки. Без нього кожна наступна задача перевірялась би очима.

**Files:**
- Create: `bin/qlose-verify.py`
- Create: `bin/checks.json`
- Create: `assets/qlose-logo.png`, `assets/qlose-logo-mega.png`, `assets/qlose-kit-case-closed.png`, `assets/qlose-kit-case-open.png`, `assets/qlose-tool-floss-pick.png`, `assets/qlose-tool-toothbrush.png`, `assets/qlose-tool-tuft-brush.png`, `assets/qlose-tool-tongue-brush.png`, `assets/qlose-tool-tongue-scraper.png`
- Already vendored: `docs/design-source/*.html`, `docs/design-source/img/*.png`

**Interfaces:**
- Produces: `python3 bin/qlose-verify.py` — читає `bin/checks.json`, повертає код 0 при повному проходженні, 1 при будь-якому провалі. Формат запису в `checks.json`: `{"name": str, "path": str, "contains": [str], "absent": [str]}`.
- Produces: девʼять брендових зображень як **ассети теми**, доступні через `{{ 'qlose-tool-floss-pick.png' | asset_url }}`. Це свідоме рішення: секції отримають `image_picker`, але з фолбеком на вбудований ассет, тож тема виглядає правильно на порожньому сторі без жодної дії в адмінці.

- [ ] **Step 1: Написати верифікаційний скрипт**

```python
#!/usr/bin/env python3
"""QLOSE theme verification harness.

Checks that the local dev server renders each page with the markup contract
its section is supposed to produce. Run with the dev server up.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("QLOSE_BASE", "http://127.0.0.1:9292")
CHECKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks.json")


def fetch(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "qlose-verify"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, "{}: {}".format(type(e).__name__, e)


def run(check):
    status, body = fetch(check["path"])
    failures = []
    if status != 200:
        failures.append("HTTP {}".format(status))
        if status == 0:
            failures.append(body[:200])
        return failures
    for needle in check.get("contains", []):
        if needle not in body:
            failures.append("missing: {!r}".format(needle))
    for needle in check.get("absent", []):
        if needle in body:
            failures.append("unexpected: {!r}".format(needle))
    return failures


def main():
    with open(CHECKS, encoding="utf-8") as fh:
        checks = json.load(fh)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    failed = 0
    for check in checks:
        if only and check["name"] != only:
            continue
        failures = run(check)
        if failures:
            failed += 1
            print("FAIL  {}  ({})".format(check["name"], check["path"]))
            for f in failures:
                print("        " + f)
        else:
            print("ok    {}  ({})".format(check["name"], check["path"]))
    if failed:
        print("\n{} check(s) failed".format(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Створити початковий набір перевірок**

Перша перевірка описує ще не існуючу розмітку — вона мусить провалитись.

```json
[
  {
    "name": "homepage-renders",
    "path": "/",
    "contains": ["<!doctype html>"],
    "absent": []
  },
  {
    "name": "qlose-css-loaded",
    "path": "/",
    "contains": ["qlose.css"],
    "absent": []
  }
]
```

- [ ] **Step 3: Запустити харнес і переконатись, що друга перевірка падає**

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
python3 bin/qlose-verify.py
```

Очікується: `ok homepage-renders`, `FAIL qlose-css-loaded` з `missing: 'qlose.css'`.
Це підтверджує, що харнес реально перевіряє, а не завжди зелений.

- [ ] **Step 4: Скопіювати брендові зображення в ассети теми**

```bash
cp docs/design-source/img/logo-qlose-small.png       assets/qlose-logo.png
cp docs/design-source/img/logo-qlose-large.png       assets/qlose-logo-mega.png
cp docs/design-source/img/kit-case-closed.png        assets/qlose-kit-case-closed.png
cp docs/design-source/img/kit-case-open.png          assets/qlose-kit-case-open.png
cp docs/design-source/img/tool-floss-pick.png        assets/qlose-tool-floss-pick.png
cp docs/design-source/img/tool-toothbrush.png        assets/qlose-tool-toothbrush.png
cp docs/design-source/img/tool-tuft-brush.png        assets/qlose-tool-tuft-brush.png
cp docs/design-source/img/tool-tongue-brush.png      assets/qlose-tool-tongue-brush.png
cp docs/design-source/img/tool-tongue-scraper.png    assets/qlose-tool-tongue-scraper.png
```

- [ ] **Step 5: Перевірити, що всі девʼять ассетів на місці й валідні**

```bash
test "$(ls assets/qlose-*.png | wc -l | tr -d ' ')" = "9" && echo "count ok" || echo "COUNT WRONG"
file assets/qlose-*.png | grep -cv 'PNG image data' | grep -q '^0$' && echo "all valid PNG" || echo "INVALID FILE PRESENT"
```

Очікується: `count ok` і `all valid PNG`. Локалка підхопить ассети після
перезапуску синхронізації; їхні реальні URL зʼявляться в розмітці з Task 3,
тоді ж їх і перевірить харнес.

- [ ] **Step 6: Коміт**

```bash
git add bin/ assets/qlose-*.png docs/design-source/
git commit -m "chore: verification harness, vendored design source, brand assets"
```

---

### Task 2: Self-hosted шрифти

**Files:**
- Create: `assets/qlose-archivo.woff2`, `assets/qlose-instrument-serif.woff2`, `assets/qlose-instrument-serif-italic.woff2`, `assets/qlose-jetbrains-mono.woff2`
- Create: `snippets/qlose-fonts.liquid`

**Interfaces:**
- Produces: `{% render 'qlose-fonts' %}` — виводить `@font-face` для трьох родин плюс `preload` для Archivo. Родини називаються `QLOSE Archivo`, `QLOSE Instrument Serif`, `QLOSE JetBrains Mono` і споживаються через змінні `--qlose-font-sans`, `--qlose-font-serif`, `--qlose-font-mono` з Task 3.

- [ ] **Step 1: Завантажити woff2 з Google Fonts**

Запит із десктопним User-Agent повертає CSS саме з `woff2`, а не з legacy-форматами.

Блок потрібного subset-у вибирається **за `unicode-range`, а не за позицією**.
Порядок блоків у відповіді залежить від родини: для Archivo це vietnamese,
latin-ext, latin — тобто потрібний нам latin іде третім, а не першим. Для
Instrument Serif ще й треба розрізнити roman та italic за `font-style`.

```bash
python3 - <<'PY'
import re, urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

def css(family):
    url = "https://fonts.googleapis.com/css2?family=%s&display=swap" % family
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=60).read().decode()

def pick(text, style="normal"):
    """Return the src URL of the latin @font-face block for the given style."""
    for block in re.findall(r"@font-face\s*\{(.*?)\}", text, re.S):
        if "font-style: %s;" % style not in block:
            continue
        ur = re.search(r"unicode-range:\s*([^;]+);", block)
        if not ur or "U+0000-00FF" not in ur.group(1):
            continue
        src = re.search(r"src:\s*url\((https://[^)]+\.woff2)\)", block)
        if src:
            return src.group(1)
    return None

jobs = [
    ("Archivo:wght@100..900",        "normal", "assets/qlose-archivo.woff2"),
    ("Instrument+Serif:ital@0;1",    "normal", "assets/qlose-instrument-serif.woff2"),
    ("Instrument+Serif:ital@0;1",    "italic", "assets/qlose-instrument-serif-italic.woff2"),
    ("JetBrains+Mono:wght@300..500", "normal", "assets/qlose-jetbrains-mono.woff2"),
]

cache = {}
for family, style, dest in jobs:
    if family not in cache:
        cache[family] = css(family)
    url = pick(cache[family], style)
    if not url:
        print("NO URL for", family, style)
        continue
    data = urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()
    open(dest, "wb").write(data)
    print("%-46s %6d bytes" % (dest, len(data)))
PY
```

- [ ] **Step 2: Перевірити, що завантажились справжні woff2, а не HTML-помилка**

```bash
file assets/qlose-*.woff2
ls -la assets/qlose-*.woff2
```

Очікується: чотири файли, кожен визначається як `Web Open Font Format (Version 2)`,
розмір кожного більший за 10 KB. Якщо скрипт надрукував `NO URL` — структура
відповіді Google змінилась, перевірити вручну вивід
`curl -s -H "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=Archivo:wght@100..900&display=swap"`.

Далі підтвердити, що Archivo і JetBrains Mono приїхали змінними — від цього
залежить уся типографіка дизайну, яка тримається на вагах 500–900:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -s -H "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=Archivo:wght@100..900&display=swap" | grep 'font-weight' | sort -u
curl -s -H "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300..500&display=swap" | grep 'font-weight' | sort -u
```

Очікується `font-weight: 100 900` і `font-weight: 300 500`. Google віддає
діапазон рівно тоді, коли файл змінний; одиничне значення означало б статичний
накреслення і зламану типографіку. Остаточне візуальне підтвердження — у Task 14.

- [ ] **Step 3: Написати снипет підключення шрифтів**

```liquid
{%- comment -%}
  Self-hosted brand fonts. All three families are SIL OFL licensed.
  Replaces the Google Fonts CDN link used by the source HTML: one less
  third-party request per page, and no EU/UK data-transfer question.
{%- endcomment -%}

<link
  rel="preload"
  href="{{ 'qlose-archivo.woff2' | asset_url }}"
  as="font"
  type="font/woff2"
  crossorigin
>

{% style %}
  @font-face {
    font-family: 'QLOSE Archivo';
    src: url({{ 'qlose-archivo.woff2' | asset_url }}) format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'QLOSE Instrument Serif';
    src: url({{ 'qlose-instrument-serif.woff2' | asset_url }}) format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'QLOSE Instrument Serif';
    src: url({{ 'qlose-instrument-serif-italic.woff2' | asset_url }}) format('woff2');
    font-weight: 400;
    font-style: italic;
    font-display: swap;
  }

  @font-face {
    font-family: 'QLOSE JetBrains Mono';
    src: url({{ 'qlose-jetbrains-mono.woff2' | asset_url }}) format('woff2-variations');
    font-weight: 300 500;
    font-style: normal;
    font-display: swap;
  }
{% endstyle %}
```

- [ ] **Step 4: Коміт**

```bash
git add assets/qlose-*.woff2 snippets/qlose-fonts.liquid
git commit -m "feat: self-hosted brand fonts (Archivo, Instrument Serif, JetBrains Mono)"
```

Підключення в `theme.liquid` — у Task 3, разом із CSS, щоб уникнути коміту з
підключеним снипетом, який ще нікому не потрібен.

---

### Task 3: Токени і примітиви

**Files:**
- Create: `assets/qlose.css`
- Create: `snippets/qlose-eyebrow.liquid`
- Create: `snippets/qlose-button.liquid`
- Modify: `layout/theme.liquid` (додати два рендери після `{%- render 'stylesheets' -%}`)
- Modify: `bin/checks.json`

**Interfaces:**
- Produces: CSS-змінні на `:root` — `--qlose-white`, `--qlose-off-white`, `--qlose-bone`, `--qlose-black`, `--qlose-ink`, `--qlose-graphite`, `--qlose-muted`, `--qlose-divider`, `--qlose-accent`, `--qlose-accent-soft`, `--qlose-accent-deep`, `--qlose-font-sans`, `--qlose-font-serif`, `--qlose-font-mono`, `--qlose-gutter`.
- Produces: класи `.qlose-serif-italic`, `.qlose-stroke`, `.qlose-mono`, `.qlose-btn` з модифікаторами `.qlose-btn--primary`, `.qlose-btn--ghost`, `.qlose-btn--underline`, `.qlose-section`, `.qlose-eyebrow`.
- Produces: `{% render 'qlose-button', label: string, url: string, style: 'primary'|'ghost'|'underline' %}`.
- Produces: `{% render 'qlose-eyebrow', index: string, text: string %}` → `<div class="qlose-eyebrow"><strong>01 /</strong> THE METHOD</div>`.

- [ ] **Step 1: Додати перевірки, які зараз падають**

Дописати в `bin/checks.json` (замінити весь файл):

```json
[
  {
    "name": "homepage-renders",
    "path": "/",
    "contains": ["<!doctype html>"],
    "absent": []
  },
  {
    "name": "qlose-css-loaded",
    "path": "/",
    "contains": ["qlose.css"],
    "absent": []
  },
  {
    "name": "qlose-fonts-loaded",
    "path": "/",
    "contains": ["qlose-archivo.woff2", "QLOSE Archivo"],
    "absent": []
  },
  {
    "name": "no-google-fonts",
    "path": "/",
    "contains": [],
    "absent": ["fonts.googleapis.com"]
  }
]
```

- [ ] **Step 2: Запустити харнес і побачити три провали**

```bash
python3 bin/qlose-verify.py
```

Очікується: `ok homepage-renders`, `ok no-google-fonts`, `FAIL qlose-css-loaded`,
`FAIL qlose-fonts-loaded`.

- [ ] **Step 3: Написати `assets/qlose.css`**

Токени беруться з `docs/design-source/index.html:11-23`, з єдиною зміною —
`--muted` стає `#666666` (обґрунтування в спеці, розділ 8). Примітиви кнопок
портуються з `docs/design-source/index.html:178-207`, `.qlose-eyebrow` — з
`:315-323`.

```css
/* QLOSE design tokens and primitives.
   Ported from docs/design-source/index.html. The one intentional deviation
   from the source is --qlose-muted: #888 fails WCAG AA on both theme
   backgrounds (3.22:1 on off-white, 2.86:1 on bone). #666 passes both
   (5.22:1 and 4.64:1). */

:root {
  --qlose-white: #ffffff;
  --qlose-off-white: #f5f4f0;
  --qlose-bone: #eae7de;
  --qlose-black: #0a0a0a;
  --qlose-ink: #1a1a1a;
  --qlose-graphite: #2a2a2a;
  --qlose-muted: #666666;
  --qlose-divider: rgba(10, 10, 10, 0.12);
  --qlose-accent: #c65a3d;
  --qlose-accent-soft: #f0dcd0;
  --qlose-accent-deep: #a04627;

  --qlose-font-sans: 'QLOSE Archivo', 'Archivo', sans-serif;
  --qlose-font-serif: 'QLOSE Instrument Serif', 'Instrument Serif', serif;
  --qlose-font-mono: 'QLOSE JetBrains Mono', 'JetBrains Mono', monospace;

  --qlose-gutter: 40px;
  --qlose-max: 1500px;
}

@media (max-width: 900px) {
  :root {
    --qlose-gutter: 20px;
  }
}

body {
  font-family: var(--qlose-font-sans);
  background: var(--qlose-off-white);
  color: var(--qlose-ink);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.qlose-serif-italic {
  font-family: var(--qlose-font-serif);
  font-style: italic;
  font-weight: 400;
  text-transform: lowercase;
  letter-spacing: -0.02em;
  color: var(--qlose-accent);
}

.qlose-stroke {
  -webkit-text-stroke: 1.5px var(--qlose-accent);
  color: transparent;
}

.qlose-mono {
  font-family: var(--qlose-font-mono);
}

.qlose-section {
  max-width: var(--qlose-max);
  margin-inline: auto;
  padding: 120px var(--qlose-gutter);
}

@media (max-width: 900px) {
  .qlose-section {
    padding-block: 60px;
  }
}

.qlose-eyebrow {
  font-family: var(--qlose-font-mono);
  font-size: 11px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--qlose-muted);
  margin-bottom: 24px;
}

.qlose-eyebrow strong {
  color: var(--qlose-black);
  font-weight: 500;
}

.qlose-btn {
  padding: 18px 32px;
  font-family: var(--qlose-font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  text-decoration: none;
  display: inline-block;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s, color 0.2s;
}

.qlose-btn--primary {
  background: var(--qlose-black);
  color: var(--qlose-white);
}

.qlose-btn--primary:hover {
  background: var(--qlose-graphite);
}

.qlose-btn--ghost {
  background: transparent;
  color: var(--qlose-black);
  border: 1px solid var(--qlose-black);
}

.qlose-btn--ghost:hover {
  background: var(--qlose-black);
  color: var(--qlose-white);
}

.qlose-btn--underline {
  color: var(--qlose-black);
  padding: 0 0 4px;
  border-bottom: 1px solid var(--qlose-black);
}

/* The source defines no focus styling at all, which makes keyboard
   navigation invisible. */
.qlose-btn:focus-visible,
a:focus-visible,
button:focus-visible,
summary:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--qlose-accent);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .qlose-marquee__inner {
    animation: none !important;
  }
}
```

- [ ] **Step 4: Написати снипети примітивів**

`snippets/qlose-eyebrow.liquid`:

```liquid
{%- doc -%}
  @param [index] - {string} Leading counter, e.g. "01 /". Optional.
  @param {string} text - Label text, e.g. "THE METHOD".
{%- enddoc -%}

<div class="qlose-eyebrow">
  {%- if index != blank -%}<strong>{{ index }}</strong> {% endif -%}
  {{- text -}}
</div>
```

`snippets/qlose-button.liquid`:

```liquid
{%- doc -%}
  @param {string} label - Button text.
  @param [url] - {string} Destination. Renders a <span> when blank.
  @param [style] - {string} One of primary, ghost, underline. Defaults to primary.
{%- enddoc -%}

{%- liquid
  assign variant = style | default: 'primary'
-%}

{%- if url != blank -%}
  <a href="{{ url }}" class="qlose-btn qlose-btn--{{ variant }}">{{ label }}</a>
{%- else -%}
  <span class="qlose-btn qlose-btn--{{ variant }}">{{ label }}</span>
{%- endif -%}
```

- [ ] **Step 5: Підключити CSS і шрифти в layout**

У `layout/theme.liquid` знайти рядок `{%- render 'stylesheets' -%}` і додати
одразу після нього два рядки. Порядок важливий: `qlose.css` має йти після
`base.css`, щоб перекривати вендорські стилі.

```liquid
    {%- render 'stylesheets' -%}
    {{ 'qlose.css' | asset_url | stylesheet_tag: preload: true }}
    {%- render 'qlose-fonts' -%}
```

- [ ] **Step 6: Запустити харнес — усі перевірки мають пройти**

```bash
python3 bin/qlose-verify.py
```

Очікується: чотири рядки `ok`, код виходу 0.

- [ ] **Step 7: Перевірити theme check без приросту помилок**

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
shopify theme check 2>&1 | tail -6
```

Очікується: `6 errors`, `2 warnings` — рівно базовий рівень із Global Constraints.

- [ ] **Step 8: Коміт**

```bash
git add assets/qlose.css snippets/qlose-eyebrow.liquid snippets/qlose-button.liquid layout/theme.liquid bin/checks.json
git commit -m "feat: QLOSE design tokens, primitives and font wiring"
```

---

### Task 4: Секція `qlose-announcement-bar`

**Files:**
- Create: `sections/qlose-announcement-bar.liquid`
- Modify: `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-announcement-bar`, клас кореня `.qlose-announce`.
- Produces: блок типу `message` з налаштуванням `text`.

- [ ] **Step 1: Додати перевірку в `bin/checks.json`**

Дописати в кінець масиву:

```json
  {
    "name": "announcement-bar",
    "path": "/",
    "contains": ["qlose-announce", "FREE UK SHIPPING ON SUBSCRIPTIONS"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py announcement-bar
```

Очікується: `FAIL announcement-bar` з `missing: 'qlose-announce'`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:57-69`. Розмітка — з `:931-933`.
Розділювач `—` між повідомленнями генерується CSS-псевдоелементом, а не
захардкодженим `<span>`, щоб кількість повідомлень була вільною.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:57-69, 931-933 {%- endcomment -%}

<div class="qlose-announce">
  {%- for block in section.blocks -%}
    <span class="qlose-announce__item" {{ block.shopify_attributes }}>
      {{- block.settings.text -}}
    </span>
  {%- endfor -%}
</div>

{% stylesheet %}
  .qlose-announce {
    background: var(--qlose-black);
    color: var(--qlose-white);
    text-align: center;
    padding: 10px 20px;
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-weight: 400;
  }

  .qlose-announce__item + .qlose-announce__item::before {
    content: '—';
    opacity: 0.4;
    margin: 0 16px;
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE announcement",
  "tag": "div",
  "blocks": [
    {
      "type": "message",
      "name": "Message",
      "settings": [
        {
          "type": "text",
          "id": "text",
          "label": "Text",
          "default": "Free UK shipping on subscriptions"
        }
      ]
    }
  ],
  "presets": [
    {
      "name": "QLOSE announcement",
      "blocks": [
        { "type": "message", "settings": { "text": "FREE UK SHIPPING ON SUBSCRIPTIONS" } },
        { "type": "message", "settings": { "text": "SKIP OR CANCEL ANYTIME" } },
        { "type": "message", "settings": { "text": "UK DELIVERY" } }
      ]
    }
  ],
  "enabled_on": { "groups": ["header"] }
}
{% endschema %}
```

- [ ] **Step 4: Підключити в `sections/header-group.json`**

Відкрити `sections/header-group.json`, додати запис у обʼєкт `sections` і
поставити його першим у масиві `order`:

```json
    "qlose_announce": {
      "type": "qlose-announcement-bar",
      "blocks": {
        "m1": { "type": "message", "settings": { "text": "FREE UK SHIPPING ON SUBSCRIPTIONS" } },
        "m2": { "type": "message", "settings": { "text": "SKIP OR CANCEL ANYTIME" } },
        "m3": { "type": "message", "settings": { "text": "UK DELIVERY" } }
      },
      "block_order": ["m1", "m2", "m3"],
      "settings": {}
    }
```

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі перевірки `ok`, включно з `announcement-bar`.

- [ ] **Step 6: Коміт**

```bash
git add sections/qlose-announcement-bar.liquid sections/header-group.json bin/checks.json
git commit -m "feat: QLOSE announcement bar section"
```

---

### Task 5: Секція `qlose-header`

Найтонша задача фундаменту: треба отримати дизайнерську шапку, не втративши
живий кошик Horizon.

**Files:**
- Create: `sections/qlose-header.liquid`
- Modify: `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-header`, класи `.qlose-header`, `.qlose-header__menu`, `.qlose-header__toggle`, `.qlose-header__actions`.
- Consumes: `{% render 'cart-bubble', limit: 100 %}` і `assets/cart-icon.js` з Horizon — обидва вендорські, не редагуються.

- [ ] **Step 1: Додати перевірки**

Дописати в `bin/checks.json`:

```json
  {
    "name": "header-nav",
    "path": "/",
    "contains": ["qlose-header", "qlose-header__menu", "<cart-icon", "cart-bubble"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py header-nav
```

Очікується: `FAIL header-nav` з `missing: 'qlose-header'`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:71-112` (десктоп) і `:895-926`
(мобільна навігація). Три відхилення від джерела, кожне свідоме:

1. Лічильник кошика — компонент Horizon `<cart-icon>`, а не статичний текст.
   Horizon лишає значення `0` у DOM і ховає його класами `visually-hidden` /
   `hidden`; два правила CSS повертають його у потік, і дизайнерське «Cart / 0»
   відтворюється без форку вендорського JS.
2. Мобільне меню отримує `aria-controls` / `aria-expanded` і закривається по
   `Escape`.
3. Лого — `settings.logo` з фолбеком на вбудований ассет, щоб шапка була
   правильною на порожньому сторі.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:71-112, 895-926, 935-950 {%- endcomment -%}

<script src="{{ 'cart-icon.js' | asset_url }}" type="module" fetchpriority="low"></script>

<nav class="qlose-header" id="QloseHeader">
  <a href="{{ routes.root_url }}" class="qlose-header__logo">
    {%- if settings.logo != blank -%}
      {{ settings.logo | image_url: width: 400 | image_tag:
         widths: '200,400', alt: shop.name, class: 'qlose-header__logo-img' }}
    {%- else -%}
      <img
        src="{{ 'qlose-logo.png' | asset_url }}"
        alt="{{ shop.name }}"
        width="400"
        height="47"
        class="qlose-header__logo-img"
      >
    {%- endif -%}
  </a>

  <ul class="qlose-header__menu" id="QloseHeaderMenu">
    {%- for link in section.settings.menu.links -%}
      <li><a href="{{ link.url }}">{{ link.title }}</a></li>
    {%- endfor -%}
  </ul>

  <button
    class="qlose-header__toggle"
    type="button"
    aria-expanded="false"
    aria-controls="QloseHeaderMenu"
  >
    Menu
  </button>

  <div class="qlose-header__actions">
    <a href="{{ routes.account_url }}">Account</a>
    <a href="{{ routes.cart_url }}" class="qlose-header__cart">
      <cart-icon class="qlose-header__cart-icon">
        <span>Cart</span>
        <span aria-hidden="true">/</span>
        {% render 'cart-bubble', limit: 100 %}
      </cart-icon>
    </a>
  </div>
</nav>

<script>
  (function () {
    var nav = document.getElementById('QloseHeader');
    if (!nav) return;
    var btn = nav.querySelector('.qlose-header__toggle');
    var menu = document.getElementById('QloseHeaderMenu');
    if (!btn || !menu) return;

    function setOpen(open) {
      menu.classList.toggle('qlose-header__menu--open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
    }

    btn.addEventListener('click', function () {
      setOpen(!menu.classList.contains('qlose-header__menu--open'));
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('qlose-header__menu--open')) {
        setOpen(false);
        btn.focus();
      }
    });
  })();
</script>

{% stylesheet %}
  .qlose-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px var(--qlose-gutter);
    background: var(--qlose-off-white);
    border-bottom: 1px solid var(--qlose-divider);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .qlose-header__logo-img {
    height: 22px;
    width: auto;
    display: block;
  }

  .qlose-header__menu {
    display: flex;
    gap: 40px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .qlose-header__menu a,
  .qlose-header__actions a {
    color: var(--qlose-black);
    text-decoration: none;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-family: var(--qlose-font-sans);
  }

  .qlose-header__actions {
    display: flex;
    gap: 24px;
    align-items: center;
  }

  .qlose-header__cart-icon {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  /* Horizon hides the count when the cart is empty, but keeps the value "0"
     in the DOM. The design calls for a permanently visible "Cart / 0", so we
     put it back in flow instead of forking cart-icon.js. */
  .qlose-header__cart-icon .cart-bubble.visually-hidden {
    position: static;
    clip: auto;
    clip-path: none;
    width: auto;
    height: auto;
    overflow: visible;
    margin: 0;
  }

  .qlose-header__cart-icon .cart-bubble__text-count.hidden {
    display: inline;
  }

  .qlose-header__cart-icon .cart-bubble {
    width: auto;
    aspect-ratio: auto;
    padding: 0;
    color: var(--qlose-black);
  }

  .qlose-header__cart-icon .cart-bubble__background {
    display: none;
  }

  .qlose-header__cart-icon .cart-bubble__text {
    font-family: var(--qlose-font-sans);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
  }

  .qlose-header__toggle {
    display: none;
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--qlose-black);
  }

  @media (max-width: 900px) {
    .qlose-header {
      flex-wrap: wrap;
    }

    .qlose-header__toggle {
      display: block;
      order: 3;
    }

    .qlose-header__menu {
      display: none;
      order: 4;
      width: 100%;
      flex-direction: column;
      gap: 0;
      padding-top: 16px;
    }

    .qlose-header__menu--open {
      display: flex;
    }

    .qlose-header__menu li {
      border-top: 1px solid var(--qlose-divider);
      padding: 14px 0;
    }

    .qlose-header__menu a {
      font-size: 14px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE header",
  "tag": "header",
  "settings": [
    {
      "type": "link_list",
      "id": "menu",
      "label": "Menu",
      "default": "main-menu"
    }
  ],
  "presets": [{ "name": "QLOSE header" }],
  "enabled_on": { "groups": ["header"] }
}
{% endschema %}
```

- [ ] **Step 4: Замінити стокову шапку в `sections/header-group.json`**

У `sections/header-group.json` видалити запис секції типу `header` з обʼєкта
`sections` і з масиву `order`, натомість додати:

```json
    "qlose_header": {
      "type": "qlose-header",
      "settings": { "menu": "main-menu" }
    }
```

Порядок у `order`: `["qlose_announce", "qlose_header"]`.

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`, включно з `header-nav`.

- [ ] **Step 6: Перевірити кошик у Chrome**

Через розширення Claude in Chrome відкрити `http://127.0.0.1:9292/`, зробити
скріншот на ширині 1440 і 375. Переконатись, що: шапка липка, у ній видно
«Cart / 0», на 375px зʼявляється кнопка «Menu» і меню розкривається кліком.
Консоль без помилок.

- [ ] **Step 7: Коміт**

```bash
git add sections/qlose-header.liquid sections/header-group.json bin/checks.json
git commit -m "feat: QLOSE header with live Horizon cart count"
```

---

### Task 6: Секція `qlose-footer`

**Files:**
- Create: `sections/qlose-footer.liquid`
- Modify: `sections/footer-group.json`
- Modify: `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-footer`, класи `.qlose-footer`, `.qlose-footer__mega`, `.qlose-footer__col`, `.qlose-footer__legal`.
- Produces: блок типу `column` з налаштуваннями `heading` і `menu`.

- [ ] **Step 1: Додати перевірку**

```json
  {
    "name": "footer",
    "path": "/",
    "contains": ["qlose-footer", "qlose-footer__mega", "QLOSE LTD"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py footer
```

Очікується: `FAIL footer`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:795-864` і `:876-893`. Розмітка
— з `:1141-1196`. Колонки посилань стають блоками з `link_list`, юридичні рядки
й соцмережі — налаштуваннями секції.

Мега-лого рендериться як зображення з фолбеком на `qlose-logo-mega.png` і має
явні `width`/`height`, щоб не давати CLS — у джерелі атрибутів немає.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:795-893, 1141-1196 {%- endcomment -%}

<footer class="qlose-footer">
  <div class="qlose-footer__inner">
    <div class="qlose-footer__mega">
      <img
        src="{{ 'qlose-logo-mega.png' | asset_url }}"
        alt="{{ shop.name }}"
        width="1200"
        height="142"
        loading="lazy"
        class="qlose-footer__mega-img"
      >
    </div>

    <div class="qlose-footer__top">
      <div>
        <p class="qlose-footer__tagline">{{ section.settings.tagline }}</p>
      </div>

      {%- for block in section.blocks -%}
        <div class="qlose-footer__col" {{ block.shopify_attributes }}>
          <h2 class="qlose-footer__col-heading">{{ block.settings.heading }}</h2>
          <ul>
            {%- for link in block.settings.menu.links -%}
              <li><a href="{{ link.url }}">{{ link.title }}</a></li>
            {%- endfor -%}
          </ul>
        </div>
      {%- endfor -%}
    </div>

    {%- if section.settings.legal != blank -%}
      <div class="qlose-footer__legal">{{ section.settings.legal }}</div>
    {%- endif -%}

    <div class="qlose-footer__bottom">
      <div>{{ section.settings.copyright }}</div>
      <div class="qlose-footer__policies">
        {%- for link in section.settings.policy_menu.links -%}
          <a href="{{ link.url }}">{{ link.title }}</a>
        {%- endfor -%}
      </div>
      <div class="qlose-footer__social">
        {%- for link in section.settings.social_menu.links -%}
          <a href="{{ link.url }}">{{ link.title }}</a>
        {%- endfor -%}
      </div>
    </div>
  </div>
</footer>

{% stylesheet %}
  .qlose-footer {
    background: var(--qlose-black);
    color: var(--qlose-white);
    padding: 80px var(--qlose-gutter) 32px;
  }

  .qlose-footer__inner {
    max-width: var(--qlose-max);
    margin: 0 auto;
  }

  .qlose-footer__mega {
    margin-bottom: 60px;
    overflow: hidden;
  }

  .qlose-footer__mega-img {
    width: 100%;
    height: auto;
    display: block;
  }

  .qlose-footer__top {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 40px;
    padding-bottom: 60px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  .qlose-footer__tagline {
    font-size: 14px;
    opacity: 0.7;
    max-width: 300px;
    line-height: 1.6;
  }

  .qlose-footer__col-heading {
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-bottom: 24px;
    opacity: 0.5;
    font-weight: 400;
  }

  .qlose-footer__col ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .qlose-footer__col li {
    margin-bottom: 12px;
  }

  .qlose-footer__col a,
  .qlose-footer__policies a,
  .qlose-footer__social a,
  .qlose-footer__legal a {
    color: var(--qlose-white);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .qlose-footer__col a:hover,
  .qlose-footer__policies a:hover,
  .qlose-footer__social a:hover {
    opacity: 0.6;
  }

  .qlose-footer__legal {
    padding-top: 32px;
    font-family: var(--qlose-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.55;
    line-height: 1.9;
  }

  .qlose-footer__bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 32px;
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    opacity: 0.6;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    flex-wrap: wrap;
    gap: 16px;
  }

  .qlose-footer__policies,
  .qlose-footer__social {
    display: flex;
    gap: 18px;
  }

  @media (max-width: 900px) {
    .qlose-footer__top {
      grid-template-columns: 1fr 1fr;
    }

    .qlose-footer__bottom {
      flex-direction: column;
      align-items: flex-start;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE footer",
  "tag": "div",
  "settings": [
    {
      "type": "text",
      "id": "tagline",
      "label": "Tagline",
      "default": "A better routine, delivered. Made for people who take the small rituals seriously."
    },
    {
      "type": "richtext",
      "id": "legal",
      "label": "Legal lines",
      "default": "<p>QLOSE LTD — REGISTERED IN ENGLAND & WALES, COMPANY NO. 17311111</p><p>REGISTERED OFFICE: 8 SHEPHERD MARKET, NO. 613, LONDON W1J 7JY</p>"
    },
    {
      "type": "text",
      "id": "copyright",
      "label": "Copyright line",
      "default": "© 2026 QLOSE LTD / ALL RIGHTS RESERVED"
    },
    { "type": "link_list", "id": "policy_menu", "label": "Policy links" },
    { "type": "link_list", "id": "social_menu", "label": "Social links" }
  ],
  "blocks": [
    {
      "type": "column",
      "name": "Link column",
      "settings": [
        { "type": "text", "id": "heading", "label": "Heading", "default": "Shop" },
        { "type": "link_list", "id": "menu", "label": "Menu" }
      ]
    }
  ],
  "presets": [
    {
      "name": "QLOSE footer",
      "blocks": [
        { "type": "column", "settings": { "heading": "Shop" } },
        { "type": "column", "settings": { "heading": "Learn" } },
        { "type": "column", "settings": { "heading": "Help" } }
      ]
    }
  ],
  "enabled_on": { "groups": ["footer"] }
}
{% endschema %}
```

Заголовок колонки — `<h2>`, а не `<h4>` як у джерелі: у джерелі рівні заголовків
перестрибують з `h2` одразу на `h4`, що ламає структуру документа для
скрінрідера. Візуально нічого не змінюється, розмір задає клас.

- [ ] **Step 4: Підключити в `sections/footer-group.json`**

Видалити стокові секції `footer` і `footer-utilities` з `sections` та `order`,
додати:

```json
    "qlose_footer": {
      "type": "qlose-footer",
      "blocks": {
        "c1": { "type": "column", "settings": { "heading": "Shop" } },
        "c2": { "type": "column", "settings": { "heading": "Learn" } },
        "c3": { "type": "column", "settings": { "heading": "Help" } }
      },
      "block_order": ["c1", "c2", "c3"],
      "settings": {
        "tagline": "A better routine, delivered. Made for people who take the small rituals seriously.",
        "copyright": "© 2026 QLOSE LTD / ALL RIGHTS RESERVED"
      }
    }
```

`order` стає `["qlose_footer"]`.

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`.

- [ ] **Step 6: Коміт**

```bash
git add sections/qlose-footer.liquid sections/footer-group.json bin/checks.json
git commit -m "feat: QLOSE footer section"
```

---

### Task 7: Секція `qlose-hero`

**Files:**
- Create: `sections/qlose-hero.liquid`
- Modify: `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-hero`, класи `.qlose-hero`, `.qlose-hero__headline`, `.qlose-hero__visual`.
- Produces: блок типу `cta` з налаштуваннями `label`, `url`, `style`.

- [ ] **Step 1: Додати перевірку**

```json
  {
    "name": "hero",
    "path": "/",
    "contains": ["qlose-hero__headline", "qlose-hero__visual", "THE COMPLETE MOUTH ROUTINE"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py hero
```

Очікується: `FAIL hero`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:114-257`, розмітка — з
`:952-977`. Заголовок задається `richtext`-налаштуванням, щоб клієнт міг
керувати переносами та вставляти `.qlose-serif-italic` / `.qlose-stroke`.

Зображення героя отримує `image_picker` з фолбеком на `qlose-kit-case-closed.png`,
явні `width`/`height` і `fetchpriority="high"` — це LCP-елемент сторінки.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:114-257, 952-977 {%- endcomment -%}

<section class="qlose-hero">
  <div class="qlose-hero__meta">
    <span><strong>{{ section.settings.meta_left }}</strong></span>
    <span>{{ section.settings.meta_right }}</span>
  </div>

  <div class="qlose-hero__main">
    <div>
      <h1 class="qlose-hero__headline">{{ section.settings.headline }}</h1>
      <div class="qlose-hero__sub">{{ section.settings.subtext }}</div>
      <div class="qlose-hero__cta">
        {%- for block in section.blocks -%}
          <span {{ block.shopify_attributes }}>
            {%- render 'qlose-button',
                label: block.settings.label,
                url: block.settings.url,
                style: block.settings.style -%}
          </span>
        {%- endfor -%}
      </div>
    </div>

    <div class="qlose-hero__visual">
      {%- if section.settings.tag != blank -%}
        <div class="qlose-hero__tag">{{ section.settings.tag }}</div>
      {%- endif -%}
      {%- if section.settings.image != blank -%}
        {{ section.settings.image | image_url: width: 1200 | image_tag:
           widths: '400,600,900,1200',
           sizes: '(max-width: 900px) 90vw, 40vw',
           fetchpriority: 'high',
           class: 'qlose-hero__img',
           alt: section.settings.image.alt | default: shop.name }}
      {%- else -%}
        <img
          src="{{ 'qlose-kit-case-closed.png' | asset_url }}"
          alt="QLOSE kit case"
          width="800"
          height="278"
          fetchpriority="high"
          class="qlose-hero__img"
        >
      {%- endif -%}
    </div>
  </div>
</section>

{% stylesheet %}
  .qlose-hero {
    padding: 60px var(--qlose-gutter) 100px;
    max-width: var(--qlose-max);
    margin-inline: auto;
    position: relative;
  }

  .qlose-hero__meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--qlose-divider);
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--qlose-muted);
  }

  .qlose-hero__meta strong {
    color: var(--qlose-black);
    font-weight: 500;
  }

  .qlose-hero__main {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 80px;
    align-items: center;
  }

  .qlose-hero__headline {
    font-family: var(--qlose-font-sans);
    font-size: clamp(56px, 12vw, 180px);
    font-weight: 900;
    line-height: 0.85;
    letter-spacing: -0.05em;
    color: var(--qlose-black);
    text-transform: uppercase;
    margin-bottom: 40px;
    overflow-wrap: break-word;
  }

  .qlose-hero__sub {
    max-width: 400px;
    font-size: 15px;
    color: var(--qlose-graphite);
    margin-bottom: 40px;
    line-height: 1.6;
  }

  .qlose-hero__cta {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .qlose-hero__visual {
    aspect-ratio: 4 / 5;
    background: linear-gradient(180deg, var(--qlose-accent-soft) 0%, var(--qlose-bone) 100%);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qlose-hero__img {
    max-width: 88%;
    max-height: 60%;
    width: auto;
    height: auto;
    object-fit: contain;
    transform: rotate(-8deg);
    filter: drop-shadow(0 40px 60px rgba(0, 0, 0, 0.35));
  }

  .qlose-hero__tag {
    position: absolute;
    top: 30px;
    right: 30px;
    background: var(--qlose-accent);
    color: var(--qlose-white);
    padding: 10px 16px;
    font-family: var(--qlose-font-mono);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  @media (max-width: 1100px) {
    .qlose-hero__main {
      gap: 40px;
    }
  }

  @media (max-width: 900px) {
    .qlose-hero {
      padding-block: 40px 60px;
    }

    .qlose-hero__main {
      grid-template-columns: 1fr;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE hero",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "meta_left", "label": "Meta left", "default": "THE COMPLETE MOUTH ROUTINE" },
    { "type": "text", "id": "meta_right", "label": "Meta right", "default": "LONDON" },
    {
      "type": "richtext",
      "id": "headline",
      "label": "Headline",
      "default": "<p>EVERY TOOL. THE RIGHT ORDER.</p>"
    },
    {
      "type": "richtext",
      "id": "subtext",
      "label": "Subtext",
      "default": "<p>A five-piece oral care system, in two versions — manual or electric.</p>"
    },
    { "type": "image_picker", "id": "image", "label": "Hero image" },
    { "type": "text", "id": "tag", "label": "Corner tag", "default": "THE KITS" }
  ],
  "blocks": [
    {
      "type": "cta",
      "name": "Button",
      "limit": 3,
      "settings": [
        { "type": "text", "id": "label", "label": "Label", "default": "Shop" },
        { "type": "url", "id": "url", "label": "Link" },
        {
          "type": "select",
          "id": "style",
          "label": "Style",
          "options": [
            { "value": "primary", "label": "Primary" },
            { "value": "ghost", "label": "Ghost" },
            { "value": "underline", "label": "Underline" }
          ],
          "default": "primary"
        }
      ]
    }
  ],
  "presets": [{ "name": "QLOSE hero" }]
}
{% endschema %}
```

Мінімум `clamp` знижено з 72px до 56px: на 320px-екрані «EVERY» у 72px виходить
за вʼюпорт і дає горизонтальний скрол усій сторінці.

- [ ] **Step 4: Перевірити після додавання секції на головну**

Тимчасово додати секцію в `templates/index.json` (повна збірка головної — у
Task 12), замінивши вміст файлу на:

```json
{
  "sections": {
    "hero": {
      "type": "qlose-hero",
      "blocks": {
        "b1": { "type": "cta", "settings": { "label": "Electric Kit / £59", "url": "/products/electric-kit", "style": "primary" } },
        "b2": { "type": "cta", "settings": { "label": "Manual Kit / £29", "url": "/products/manual-kit", "style": "ghost" } },
        "b3": { "type": "cta", "settings": { "label": "See how it works →", "url": "/pages/routine", "style": "underline" } }
      },
      "block_order": ["b1", "b2", "b3"],
      "settings": {
        "headline": "<p>EVERY <span class=\"qlose-stroke\">TOOL</span>.<br>THE RIGHT <span class=\"qlose-serif-italic\">order</span>.</p>",
        "subtext": "<p>A five-piece oral care system, in two versions — manual or electric. Precision tools designed to work in sequence. Made for people who take the small rituals seriously.</p>"
      }
    }
  },
  "order": ["hero"]
}
```

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`, включно з `hero`.

- [ ] **Step 5: Коміт**

```bash
git add sections/qlose-hero.liquid templates/index.json bin/checks.json
git commit -m "feat: QLOSE hero section"
```

---

### Task 8: Секція `qlose-marquee`

**Files:**
- Create: `sections/qlose-marquee.liquid`
- Modify: `templates/index.json`, `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-marquee`, класи `.qlose-marquee`, `.qlose-marquee__inner` (останній уже має правило `prefers-reduced-motion` у `qlose.css` з Task 3).
- Produces: блок типу `word` з налаштуванням `text`.

- [ ] **Step 1: Додати перевірку**

```json
  {
    "name": "marquee",
    "path": "/",
    "contains": ["qlose-marquee__inner", "qlose-marquee__set", "SCRAPE"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py marquee
```

Очікується: `FAIL marquee`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:259-298`. Анімація лишається
чисто CSS-ною — вендорський `marquee.js` Horizon сюди не підходить, бо він
розрахований на theme blocks і власну розмітку.

Два відхилення: список слів дублюється в розмітці (анімація `translateX(-50%)`
вимагає рівно двох копій, у джерелі це зроблено вручну), і копія позначається
`aria-hidden="true"`, щоб скрінрідер не читав слова двічі.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:259-298, 979-992 {%- endcomment -%}

<div class="qlose-marquee">
  <div class="qlose-marquee__inner" style="--qlose-marquee-duration: {{ section.settings.duration }}s;">
    {%- for i in (1..2) -%}
      <div class="qlose-marquee__set" {% if i == 2 %}aria-hidden="true"{% endif %}>
        {%- for block in section.blocks -%}
          <span class="qlose-marquee__word" {{ block.shopify_attributes }}>{{ block.settings.text }}</span>
          <span class="qlose-marquee__dot"></span>
        {%- endfor -%}
      </div>
    {%- endfor -%}
  </div>
</div>

{% stylesheet %}
  .qlose-marquee {
    background: var(--qlose-black);
    color: var(--qlose-white);
    padding: 24px 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .qlose-marquee__inner {
    display: flex;
    width: max-content;
    animation: qlose-marquee-scroll var(--qlose-marquee-duration, 35s) linear infinite;
    font-family: var(--qlose-font-sans);
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }

  .qlose-marquee__set {
    display: flex;
    align-items: center;
  }

  .qlose-marquee__word {
    padding: 0 40px;
  }

  .qlose-marquee__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--qlose-white);
    flex: none;
  }

  @keyframes qlose-marquee-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }

  @media (max-width: 900px) {
    .qlose-marquee__inner {
      font-size: 32px;
    }

    .qlose-marquee__word {
      padding: 0 24px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE marquee",
  "tag": "div",
  "settings": [
    {
      "type": "range",
      "id": "duration",
      "label": "Scroll duration",
      "min": 10,
      "max": 90,
      "step": 5,
      "unit": "s",
      "default": 35
    }
  ],
  "blocks": [
    {
      "type": "word",
      "name": "Word",
      "settings": [
        { "type": "text", "id": "text", "label": "Word", "default": "PICK" }
      ]
    }
  ],
  "presets": [
    {
      "name": "QLOSE marquee",
      "blocks": [
        { "type": "word", "settings": { "text": "PICK" } },
        { "type": "word", "settings": { "text": "BRUSH" } },
        { "type": "word", "settings": { "text": "TUFT" } },
        { "type": "word", "settings": { "text": "TONGUE" } },
        { "type": "word", "settings": { "text": "SCRAPE" } }
      ]
    }
  ]
}
{% endschema %}
```

- [ ] **Step 4: Додати секцію в `templates/index.json`**

У обʼєкт `sections` додати запис і поставити `"marquee"` другим у `order`:

```json
    "marquee": {
      "type": "qlose-marquee",
      "blocks": {
        "w1": { "type": "word", "settings": { "text": "PICK" } },
        "w2": { "type": "word", "settings": { "text": "BRUSH" } },
        "w3": { "type": "word", "settings": { "text": "TUFT" } },
        "w4": { "type": "word", "settings": { "text": "TONGUE" } },
        "w5": { "type": "word", "settings": { "text": "SCRAPE" } }
      },
      "block_order": ["w1", "w2", "w3", "w4", "w5"],
      "settings": { "duration": 35 }
    }
```

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`.

- [ ] **Step 6: Коміт**

```bash
git add sections/qlose-marquee.liquid templates/index.json bin/checks.json
git commit -m "feat: QLOSE marquee section with reduced-motion support"
```

---

### Task 9: Секція `qlose-routine-steps`

Тут виправляється найпомітніший дефект адаптиву джерела.

**Files:**
- Create: `sections/qlose-routine-steps.liquid`
- Modify: `templates/index.json`, `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-routine-steps`, класи `.qlose-steps`, `.qlose-step`.
- Produces: блок типу `step` з налаштуваннями `index`, `image`, `fallback_asset`, `title`, `description`, `duration`.

- [ ] **Step 1: Додати перевірку**

```json
  {
    "name": "routine-steps",
    "path": "/",
    "contains": ["qlose-steps", "Angled Floss Pick", "Tongue Scraper"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py routine-steps
```

Очікується: `FAIL routine-steps`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:300-467`, розмітка — з
`:994-1062`. Важливо: у джерелі блок `.step` визначено двічі — спершу на
`:357-368`, потім перевизначено на `:414-422` з `!important`. Портуємо **лише
кінцевий стан**, без дублювання і без `!important`.

Адаптив джерела дає п'ять карток по 480px одна під одною на телефоні. Замість
цього: чотири колонки на 1400px, три на 1100px, дві на 800px і горизонтальна
scroll-snap стрічка на 600px.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:300-467, 994-1062 {%- endcomment -%}

<section class="qlose-routine qlose-section">
  <div class="qlose-routine__header">
    <div>
      {%- render 'qlose-eyebrow', index: section.settings.eyebrow_index, text: section.settings.eyebrow_text -%}
      <h2 class="qlose-routine__heading">{{ section.settings.heading }}</h2>
    </div>
    <div class="qlose-routine__intro">{{ section.settings.intro }}</div>
  </div>

  <div class="qlose-steps">
    {%- for block in section.blocks -%}
      <article class="qlose-step" {{ block.shopify_attributes }}>
        <div class="qlose-step__media">
          <div class="qlose-step__index">{{ block.settings.index }}</div>
          {%- if block.settings.image != blank -%}
            {{ block.settings.image | image_url: width: 600 | image_tag:
               widths: '200,400,600',
               sizes: '(max-width: 600px) 70vw, 20vw',
               loading: 'lazy',
               class: 'qlose-step__img',
               alt: block.settings.title }}
          {%- elsif block.settings.fallback_asset != blank -%}
            <img
              src="{{ block.settings.fallback_asset | asset_url }}"
              alt="{{ block.settings.title }}"
              loading="lazy"
              width="400"
              height="800"
              class="qlose-step__img"
            >
          {%- endif -%}
        </div>
        <div class="qlose-step__body">
          <h3 class="qlose-step__title">{{ block.settings.title }}</h3>
          <p class="qlose-step__desc">{{ block.settings.description }}</p>
          <div class="qlose-step__time">{{ block.settings.duration }}</div>
        </div>
      </article>
    {%- endfor -%}
  </div>
</section>

{% stylesheet %}
  .qlose-routine__header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 80px;
    margin-bottom: 80px;
    align-items: end;
    padding-bottom: 40px;
    border-bottom: 1px solid var(--qlose-divider);
  }

  .qlose-routine__heading {
    font-family: var(--qlose-font-sans);
    font-size: clamp(40px, 6vw, 96px);
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: var(--qlose-black);
    font-weight: 900;
    text-transform: uppercase;
  }

  .qlose-routine__intro {
    font-size: 15px;
    color: var(--qlose-graphite);
    line-height: 1.6;
    padding-bottom: 8px;
  }

  .qlose-steps {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    border-top: 1px solid var(--qlose-black);
    border-left: 1px solid var(--qlose-black);
  }

  .qlose-step {
    border-right: 1px solid var(--qlose-black);
    border-bottom: 1px solid var(--qlose-black);
    background: var(--qlose-off-white);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 480px;
    overflow: hidden;
  }

  .qlose-step__media {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 20px 20px;
    background: linear-gradient(180deg, var(--qlose-bone) 0%, var(--qlose-off-white) 100%);
    border-bottom: 1px solid var(--qlose-divider);
    position: relative;
    min-height: 240px;
  }

  .qlose-step__img {
    max-height: 200px;
    max-width: 90%;
    width: auto;
    height: auto;
    object-fit: contain;
    filter: drop-shadow(0 20px 30px rgba(0, 0, 0, 0.25));
    transition: transform 0.4s ease;
  }

  .qlose-step:hover .qlose-step__img {
    transform: translateY(-6px) scale(1.03);
  }

  @media (prefers-reduced-motion: reduce) {
    .qlose-step__img {
      transition: none;
    }

    .qlose-step:hover .qlose-step__img {
      transform: none;
    }
  }

  .qlose-step__index {
    position: absolute;
    top: 16px;
    left: 20px;
    font-family: var(--qlose-font-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--qlose-muted);
    z-index: 2;
  }

  .qlose-step__body {
    padding: 24px 24px 32px;
  }

  .qlose-step__title {
    font-family: var(--qlose-font-sans);
    font-size: 16px;
    color: var(--qlose-black);
    margin-bottom: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .qlose-step__desc {
    font-size: 13px;
    color: var(--qlose-graphite);
    line-height: 1.5;
  }

  .qlose-step__time {
    font-family: var(--qlose-font-mono);
    font-size: 10px;
    letter-spacing: 0.15em;
    color: var(--qlose-accent);
    margin-top: 12px;
    text-transform: uppercase;
  }

  /* The source jumps straight from five columns to one at 900px, which
     produces five 480px-tall cards stacked on a phone. */
  @media (max-width: 1400px) {
    .qlose-steps { grid-template-columns: repeat(4, 1fr); }
  }

  @media (max-width: 1100px) {
    .qlose-steps { grid-template-columns: repeat(3, 1fr); }
    .qlose-routine__header { gap: 40px; }
  }

  @media (max-width: 900px) {
    .qlose-routine__header {
      grid-template-columns: 1fr;
      margin-bottom: 40px;
    }
  }

  @media (max-width: 800px) {
    .qlose-steps { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 600px) {
    .qlose-steps {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      border-left: none;
      -webkit-overflow-scrolling: touch;
    }

    .qlose-step {
      flex: 0 0 78%;
      scroll-snap-align: start;
      border-left: 1px solid var(--qlose-black);
      min-height: 420px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE routine steps",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "eyebrow_index", "label": "Eyebrow index", "default": "02 /" },
    { "type": "text", "id": "eyebrow_text", "label": "Eyebrow text", "default": "THE METHOD" },
    {
      "type": "richtext",
      "id": "heading",
      "label": "Heading",
      "default": "<p>FIVE STEPS. ONE SYSTEM.</p>"
    },
    {
      "type": "richtext",
      "id": "intro",
      "label": "Intro",
      "default": "<p>It's a sequence built around how each tool actually works.</p>"
    }
  ],
  "blocks": [
    {
      "type": "step",
      "name": "Step",
      "settings": [
        { "type": "text", "id": "index", "label": "Index", "default": "— 01 / FLOSS" },
        { "type": "image_picker", "id": "image", "label": "Image" },
        { "type": "text", "id": "fallback_asset", "label": "Bundled asset filename", "default": "qlose-tool-floss-pick.png" },
        { "type": "text", "id": "title", "label": "Title", "default": "Angled Floss Pick" },
        { "type": "textarea", "id": "description", "label": "Description", "default": "Start between the teeth." },
        { "type": "text", "id": "duration", "label": "Duration", "default": "30 SEC" }
      ]
    }
  ],
  "presets": [{ "name": "QLOSE routine steps" }]
}
{% endschema %}
```

- [ ] **Step 4: Додати секцію в `templates/index.json`**

Додати в `sections` і третім у `order`. Тексти беруться дослівно з
`docs/design-source/index.html:1006-1060`:

```json
    "routine": {
      "type": "qlose-routine-steps",
      "blocks": {
        "s1": { "type": "step", "settings": { "index": "— 01 / FLOSS", "fallback_asset": "qlose-tool-floss-pick.png", "title": "Angled Floss Pick", "description": "Start between the teeth. Reach every gap — even the back molars.", "duration": "30 SEC" } },
        "s2": { "type": "step", "settings": { "index": "— 02 / BRUSH", "fallback_asset": "qlose-tool-toothbrush.png", "title": "Brush Teeth", "description": "Every surface. 45° angle. No missed corners.", "duration": "90 SEC" } },
        "s3": { "type": "step", "settings": { "index": "— 03 / DETAIL", "fallback_asset": "qlose-tool-tuft-brush.png", "title": "Tuft Brush", "description": "Precision finish. Behind the back teeth and around tight spots.", "duration": "30 SEC" } },
        "s4": { "type": "step", "settings": { "index": "— 04 / TONGUE", "fallback_asset": "qlose-tool-tongue-brush.png", "title": "Tongue Brush", "description": "Loosen the coating. Bristles work into the crevices.", "duration": "15 SEC" } },
        "s5": { "type": "step", "settings": { "index": "— 05 / SCRAPE", "fallback_asset": "qlose-tool-tongue-scraper.png", "title": "Tongue Scraper", "description": "One smooth pull lifts everything you loosened.", "duration": "15 SEC" } }
      },
      "block_order": ["s1", "s2", "s3", "s4", "s5"],
      "settings": {
        "heading": "<p>FIVE STEPS.<br>ONE <span class=\"qlose-serif-italic\">system</span>.</p>",
        "intro": "<p>This isn't a generic checklist. It's a sequence built around how each tool actually works — floss to disrupt, brush to clean, then a two-step finish on the tongue. Loosen first, then lift it all off.</p>"
      }
    }
```

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`.

- [ ] **Step 6: Перевірити адаптив у Chrome**

Через Claude in Chrome відкрити головну і зробити скріншоти на 1440, 768 і 375.
Переконатись: на 1440 — пʼять колонок, на 768 — дві, на 375 — горизонтальна
стрічка з привʼязкою прокрутки, сторінка не має горизонтального скролу.

- [ ] **Step 7: Коміт**

```bash
git add sections/qlose-routine-steps.liquid templates/index.json bin/checks.json
git commit -m "feat: QLOSE routine steps with responsive grid and mobile carousel"
```

---

### Task 10: Секція `qlose-statement`

**Files:**
- Create: `sections/qlose-statement.liquid`
- Modify: `templates/index.json`, `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-statement`, класи `.qlose-statement`, `.qlose-statement__heading`.

- [ ] **Step 1: Додати перевірку**

```json
  {
    "name": "statement",
    "path": "/",
    "contains": ["qlose-statement__heading", "QLOSE / MANIFESTO"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py statement
```

Очікується: `FAIL statement`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:469-518`, розмітка — з
`:1064-1074`.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:469-518, 1064-1074 {%- endcomment -%}

<section class="qlose-statement">
  <div class="qlose-statement__inner">
    {%- if section.settings.eyebrow != blank -%}
      <div class="qlose-statement__eyebrow">{{ section.settings.eyebrow }}</div>
    {%- endif -%}
    <h2 class="qlose-statement__heading">{{ section.settings.heading }}</h2>
    {%- if section.settings.attribution != blank -%}
      <p class="qlose-statement__attribution">{{ section.settings.attribution }}</p>
    {%- endif -%}
  </div>
</section>

{% stylesheet %}
  .qlose-statement {
    background: var(--qlose-black);
    color: var(--qlose-white);
    padding: 160px var(--qlose-gutter);
    overflow: hidden;
  }

  .qlose-statement__inner {
    max-width: 1200px;
    margin: 0 auto;
  }

  .qlose-statement__eyebrow,
  .qlose-statement__attribution {
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #9a9a9a;
  }

  .qlose-statement__eyebrow {
    margin-bottom: 40px;
  }

  .qlose-statement__attribution {
    margin-top: 60px;
  }

  .qlose-statement__heading {
    font-family: var(--qlose-font-sans);
    font-size: clamp(44px, 8vw, 140px);
    line-height: 0.9;
    letter-spacing: -0.05em;
    font-weight: 900;
    text-transform: uppercase;
    max-width: 1100px;
    overflow-wrap: break-word;
  }

  @media (max-width: 900px) {
    .qlose-statement {
      padding-block: 80px;
    }

    .qlose-statement__attribution {
      margin-top: 40px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE statement",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "— 03 / THE PHILOSOPHY" },
    {
      "type": "richtext",
      "id": "heading",
      "label": "Heading",
      "default": "<p>ORAL CARE ISN'T A CHORE. IT'S A RITUAL.</p>"
    },
    { "type": "text", "id": "attribution", "label": "Attribution", "default": "— QLOSE / MANIFESTO" }
  ],
  "presets": [{ "name": "QLOSE statement" }]
}
{% endschema %}
```

Приглушений колір на чорному тлі — `#9a9a9a`, а не `--qlose-muted`: `#666` на
`#0a0a0a` дає лише 3.6:1. `#9a9a9a` дає 7.5:1.

- [ ] **Step 4: Додати секцію в `templates/index.json`**

Додати в `sections` і четвертим у `order`:

```json
    "statement": {
      "type": "qlose-statement",
      "settings": {
        "eyebrow": "— 03 / THE PHILOSOPHY",
        "heading": "<p>ORAL CARE<br>ISN'T A <span class=\"qlose-stroke\">CHORE</span>.<br>IT'S A <span class=\"qlose-serif-italic\">ritual</span>.</p>",
        "attribution": "— QLOSE / MANIFESTO"
      }
    }
```

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`.

- [ ] **Step 6: Коміт**

```bash
git add sections/qlose-statement.liquid templates/index.json bin/checks.json
git commit -m "feat: QLOSE statement section"
```

---

### Task 11: Секція `qlose-faq`

**Files:**
- Create: `sections/qlose-faq.liquid`
- Modify: `templates/index.json`, `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-faq`, класи `.qlose-faq`, `.qlose-faq__item`, `.qlose-faq__q`, `.qlose-faq__a`.
- Produces: блок типу `question` з налаштуваннями `question`, `answer`, `open`.

- [ ] **Step 1: Додати перевірку**

Перевіряємо саме `<details>` — це і є суть виправлення.

```json
  {
    "name": "faq-accessible",
    "path": "/",
    "contains": ["qlose-faq__item", "<details", "<summary"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py faq-accessible
```

Очікується: `FAIL faq-accessible`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:737-793`, розмітка — з
`:1115-1139`. Два виправлення:

1. `<div>` з обробником кліку замінюється на `<details>`/`<summary>` — клавіатура
   і скрінрідер працюють без жодного JS.
2. `max-height: 300px` замінюється анімацією `grid-template-rows` — довгі
   відповіді більше не обрізаються.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:737-793, 1115-1139 {%- endcomment -%}

<section class="qlose-faq qlose-section">
  {%- if section.settings.eyebrow_text != blank -%}
    {%- render 'qlose-eyebrow', index: section.settings.eyebrow_index, text: section.settings.eyebrow_text -%}
  {%- endif -%}

  <h2 class="qlose-faq__heading">{{ section.settings.heading }}</h2>

  {%- for block in section.blocks -%}
    <details
      class="qlose-faq__item"
      {% if block.settings.open %}open{% endif %}
      {{ block.shopify_attributes }}
    >
      <summary class="qlose-faq__q">{{ block.settings.question }}</summary>
      <div class="qlose-faq__a"><div>{{ block.settings.answer }}</div></div>
    </details>
  {%- endfor -%}
</section>

{% stylesheet %}
  /* Two classes, not one: .qlose-section in qlose.css sets max-width with the
     same specificity, and Shopify's bundle order between the two files is not
     guaranteed. */
  .qlose-faq.qlose-section {
    max-width: 1100px;
  }

  .qlose-faq__heading {
    font-family: var(--qlose-font-sans);
    font-size: clamp(40px, 6vw, 96px);
    line-height: 0.9;
    color: var(--qlose-black);
    margin-bottom: 60px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: -0.04em;
  }

  .qlose-faq__item {
    border-top: 1px solid var(--qlose-black);
  }

  .qlose-faq__item:last-of-type {
    border-bottom: 1px solid var(--qlose-black);
  }

  .qlose-faq__q {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 28px 0;
    cursor: pointer;
    font-family: var(--qlose-font-sans);
    font-size: 20px;
    color: var(--qlose-black);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    list-style: none;
  }

  .qlose-faq__q::-webkit-details-marker {
    display: none;
  }

  .qlose-faq__q::after {
    content: '+';
    font-size: 28px;
    font-weight: 300;
    flex: none;
    transition: transform 0.3s;
  }

  .qlose-faq__item[open] .qlose-faq__q::after {
    transform: rotate(45deg);
  }

  /* The source caps the answer at max-height: 300px, which silently clips
     the longer answers. A grid row from 0fr to 1fr animates to content
     height with no cap. */
  .qlose-faq__a {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.35s ease;
    color: var(--qlose-graphite);
    font-size: 15px;
    line-height: 1.7;
  }

  .qlose-faq__a > div {
    overflow: hidden;
  }

  .qlose-faq__item[open] .qlose-faq__a {
    grid-template-rows: 1fr;
    padding-bottom: 28px;
  }

  @media (prefers-reduced-motion: reduce) {
    .qlose-faq__a,
    .qlose-faq__q::after {
      transition: none;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE FAQ",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "eyebrow_index", "label": "Eyebrow index", "default": "05 /" },
    { "type": "text", "id": "eyebrow_text", "label": "Eyebrow text", "default": "THE DETAILS" },
    {
      "type": "richtext",
      "id": "heading",
      "label": "Heading",
      "default": "<p>QUESTIONS, ANSWERED.</p>"
    }
  ],
  "blocks": [
    {
      "type": "question",
      "name": "Question",
      "settings": [
        { "type": "text", "id": "question", "label": "Question", "default": "What comes in the starter kit?" },
        { "type": "richtext", "id": "answer", "label": "Answer", "default": "<p>The full five-tool system.</p>" },
        { "type": "checkbox", "id": "open", "label": "Open by default", "default": false }
      ]
    }
  ],
  "presets": [{ "name": "QLOSE FAQ" }]
}
{% endschema %}
```

- [ ] **Step 4: Додати секцію в `templates/index.json`**

Тексти беруться дослівно з `docs/design-source/index.html:1119-1138`. Секція йде
останньою в `order`:

```json
    "faq": {
      "type": "qlose-faq",
      "blocks": {
        "q1": { "type": "question", "settings": { "open": true, "question": "What comes in the starter kit?", "answer": "<p>The full five-tool system: angled floss pick, toothbrush, tuft brush, tongue brush, and stainless steel tongue scraper — all housed in a zippered travel case. Choose the Electric Kit for a USB-C rechargeable brush, or the Manual Kit for a soft-bristle manual one.</p>" } },
        "q2": { "type": "question", "settings": { "question": "How does the subscription work?", "answer": "<p>You get the full kit once. After that, we send a refill every 90 days for £18, containing the parts that wear out. Your case and tongue scraper stay with you.</p>" } },
        "q3": { "type": "question", "settings": { "question": "Do you ship internationally?", "answer": "<p>Not yet. We're UK-only for now while we build the brand at home. International shipping is on the roadmap — join our newsletter to be the first to know when we cross borders.</p>" } },
        "q4": { "type": "question", "settings": { "question": "Do I need to use all five tools?", "answer": "<p>Yes — that's the point. Each tool plays a specific role, and the routine only works as a system. Every step is short (under 90 seconds), and together they add up to a genuinely complete clean.</p>" } },
        "q5": { "type": "question", "settings": { "question": "Can I pause or cancel my subscription?", "answer": "<p>Anytime. Log into your account and pause, skip a delivery, change your refill frequency, or cancel entirely. No calls, no forms, no friction.</p>" } }
      },
      "block_order": ["q1", "q2", "q3", "q4", "q5"],
      "settings": {
        "eyebrow_index": "05 /",
        "eyebrow_text": "THE DETAILS",
        "heading": "<p>QUESTIONS,<br><span class=\"qlose-serif-italic\">answered</span>.</p>"
      }
    }
```

- [ ] **Step 5: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі `ok`.

- [ ] **Step 6: Перевірити клавіатурну доступність**

Через Claude in Chrome відкрити головну, дійти табом до першого питання FAQ,
натиснути Enter. Акордеон має розкритись, фокус має бути видимим (теракотова
рамка з Task 3), довга відповідь має показатись повністю без обрізання.

- [ ] **Step 7: Коміт**

```bash
git add sections/qlose-faq.liquid templates/index.json bin/checks.json
git commit -m "feat: QLOSE FAQ on native details/summary with uncapped answers"
```

---

### Task 12: Секція `qlose-plan-teaser` і збірка головної

**Files:**
- Create: `sections/qlose-plan-teaser.liquid`
- Modify: `templates/index.json`, `config/settings_data.json`, `bin/checks.json`

**Interfaces:**
- Produces: тип секції `qlose-plan-teaser`, класи `.qlose-plans`, `.qlose-plan`.
- Produces: блок типу `plan` з налаштуваннями `number`, `label`, `badge`, `sub`, `price`, `price_note`.

- [ ] **Step 1: Додати перевірку**

```json
  {
    "name": "plan-teaser",
    "path": "/",
    "contains": ["qlose-plans", "The Electric Kit", "THEN £18 / 90 DAYS"],
    "absent": []
  },
  {
    "name": "homepage-section-order",
    "path": "/",
    "contains": ["qlose-hero", "qlose-marquee", "qlose-steps", "qlose-statement", "qlose-plans", "qlose-faq"],
    "absent": []
  }
```

- [ ] **Step 2: Запустити і побачити провал**

```bash
python3 bin/qlose-verify.py
```

Очікується: `FAIL plan-teaser`, `FAIL homepage-section-order`.

- [ ] **Step 3: Написати секцію**

CSS портується з `docs/design-source/index.html:520-661`, розмітка — з
`:1076-1110`. На головній це вітрина, а не форма: клас `.qlose-plan--active` —
чисто візуальний акцент, без JS. Інтерактивний селектор планів зʼявиться на
сторінці товару окремою гілкою.

Велика цифра «90» з джерела виноситься в налаштування, бо це число дублює
періодичність із тексту і має змінюватись разом із ним.

```liquid
{%- comment -%} Ported from docs/design-source/index.html:520-661, 1076-1110 {%- endcomment -%}

<section class="qlose-subscribe qlose-section">
  <div class="qlose-subscribe__visual">
    <div class="qlose-subscribe__numeral">{{ section.settings.numeral }}</div>
  </div>

  <div>
    {%- render 'qlose-eyebrow', index: section.settings.eyebrow_index, text: section.settings.eyebrow_text -%}
    <h2 class="qlose-subscribe__heading">{{ section.settings.heading }}</h2>
    <div class="qlose-subscribe__desc">{{ section.settings.description }}</div>

    <div class="qlose-plans">
      {%- for block in section.blocks -%}
        <div
          class="qlose-plan{% if block.settings.highlight %} qlose-plan--active{% endif %}"
          {{ block.shopify_attributes }}
        >
          <div class="qlose-plan__info">
            <div class="qlose-plan__number">{{ block.settings.number }}</div>
            <div>
              <div class="qlose-plan__label">
                {{ block.settings.label }}
                {%- if block.settings.badge != blank -%}
                  <span class="qlose-plan__badge">{{ block.settings.badge }}</span>
                {%- endif -%}
              </div>
              <div class="qlose-plan__sub">{{ block.settings.sub }}</div>
            </div>
          </div>
          <div class="qlose-plan__price">
            {{ block.settings.price }}
            <small>{{ block.settings.price_note }}</small>
          </div>
        </div>
      {%- endfor -%}
    </div>

    {%- render 'qlose-button',
        label: section.settings.cta_label,
        url: section.settings.cta_url,
        style: 'primary' -%}
  </div>
</section>

{% stylesheet %}
  .qlose-subscribe {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 100px;
    align-items: center;
  }

  .qlose-subscribe__visual {
    aspect-ratio: 1;
    background: var(--qlose-accent-soft);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qlose-subscribe__numeral {
    font-family: var(--qlose-font-sans);
    font-size: clamp(160px, 26vw, 400px);
    font-weight: 900;
    color: var(--qlose-black);
    line-height: 0.8;
    letter-spacing: -0.05em;
  }

  .qlose-subscribe__heading {
    font-family: var(--qlose-font-sans);
    font-size: clamp(36px, 5vw, 84px);
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: var(--qlose-black);
    margin-bottom: 32px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .qlose-subscribe__desc {
    font-size: 15px;
    color: var(--qlose-graphite);
    line-height: 1.6;
    margin-bottom: 40px;
    max-width: 480px;
  }

  .qlose-plans {
    display: flex;
    flex-direction: column;
    margin-bottom: 40px;
    border-top: 1px solid var(--qlose-black);
  }

  .qlose-plan {
    border-bottom: 1px solid var(--qlose-black);
    padding: 24px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .qlose-plan--active {
    padding-inline: 20px;
    background: var(--qlose-bone);
  }

  .qlose-plan__info {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .qlose-plan__number,
  .qlose-plan__price {
    font-family: var(--qlose-font-sans);
    font-size: 32px;
    font-weight: 900;
    color: var(--qlose-black);
    letter-spacing: -0.02em;
  }

  .qlose-plan__label {
    font-family: var(--qlose-font-sans);
    font-size: 14px;
    font-weight: 600;
    color: var(--qlose-black);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .qlose-plan__sub {
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    color: var(--qlose-muted);
    letter-spacing: 0.1em;
    margin-top: 4px;
    text-transform: uppercase;
  }

  .qlose-plan__price small {
    font-size: 11px;
    color: var(--qlose-muted);
    font-family: var(--qlose-font-mono);
    font-weight: 400;
    letter-spacing: 0.1em;
    display: block;
    text-align: right;
    margin-top: 4px;
    text-transform: uppercase;
  }

  .qlose-plan__badge {
    display: inline-block;
    background: var(--qlose-accent);
    color: var(--qlose-white);
    font-family: var(--qlose-font-mono);
    font-size: 9px;
    letter-spacing: 0.15em;
    padding: 3px 8px;
    margin-left: 10px;
    text-transform: uppercase;
    vertical-align: middle;
  }

  @media (max-width: 900px) {
    .qlose-subscribe {
      grid-template-columns: 1fr;
      gap: 40px;
    }
  }

  @media (max-width: 520px) {
    .qlose-plan {
      flex-direction: column;
      align-items: flex-start;
    }

    .qlose-plan__price small {
      text-align: left;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE plan teaser",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "numeral", "label": "Large numeral", "default": "90" },
    { "type": "text", "id": "eyebrow_index", "label": "Eyebrow index", "default": "04 /" },
    { "type": "text", "id": "eyebrow_text", "label": "Eyebrow text", "default": "THE SUBSCRIPTION" },
    { "type": "richtext", "id": "heading", "label": "Heading", "default": "<p>TWO KITS. ONE SYSTEM.</p>" },
    { "type": "richtext", "id": "description", "label": "Description", "default": "<p>Same five-step routine, your choice of brush.</p>" },
    { "type": "text", "id": "cta_label", "label": "Button label", "default": "Choose your kit →" },
    { "type": "url", "id": "cta_url", "label": "Button link" }
  ],
  "blocks": [
    {
      "type": "plan",
      "name": "Plan",
      "settings": [
        { "type": "text", "id": "number", "label": "Number", "default": "01" },
        { "type": "text", "id": "label", "label": "Label", "default": "The Electric Kit" },
        { "type": "text", "id": "badge", "label": "Badge" },
        { "type": "text", "id": "sub", "label": "Subtitle" },
        { "type": "text", "id": "price", "label": "Price", "default": "£59" },
        { "type": "text", "id": "price_note", "label": "Price note" },
        { "type": "checkbox", "id": "highlight", "label": "Highlight", "default": false }
      ]
    }
  ],
  "presets": [{ "name": "QLOSE plan teaser" }]
}
{% endschema %}
```

- [ ] **Step 4: Дописати секцію в `templates/index.json`**

Додати в `sections` і поставити `order` у фінальний вигляд:
`["hero", "marquee", "routine", "statement", "subscribe", "faq"]`.

```json
    "subscribe": {
      "type": "qlose-plan-teaser",
      "blocks": {
        "p1": { "type": "plan", "settings": { "number": "01", "label": "The Electric Kit", "badge": "Popular", "sub": "Five tools, USB-C rechargeable brush", "price": "£59", "price_note": "THEN £18 / 90 DAYS", "highlight": true } },
        "p2": { "type": "plan", "settings": { "number": "02", "label": "The Manual Kit", "sub": "Five tools, soft-bristle manual brush", "price": "£29", "price_note": "THEN £18 / 90 DAYS", "highlight": false } }
      },
      "block_order": ["p1", "p2"],
      "settings": {
        "numeral": "90",
        "eyebrow_index": "04 /",
        "eyebrow_text": "THE SUBSCRIPTION",
        "heading": "<p>TWO KITS.<br><span class=\"qlose-serif-italic\">one</span> SYSTEM.</p>",
        "description": "<p>Same five-step routine, your choice of brush. Bristles wear out and floss runs low, so your subscription sends a fresh refill every 90 days for £18 — the same cadence dentists recommend for replacing a brush head.</p>",
        "cta_label": "Choose your kit →",
        "cta_url": "/products/electric-kit"
      }
    }
```

- [ ] **Step 5: Виставити лого теми в `config/settings_data.json`**

У обʼєкті `current` встановити `"logo": "shopify://shop_images/qlose-logo.png"`
лише якщо файл уже завантажено в Files. Якщо ні — лишити порожнім: секції мають
фолбек на вбудований ассет, і це не помилка.

- [ ] **Step 6: Перевірити**

```bash
python3 bin/qlose-verify.py
```

Очікується: усі перевірки `ok`, включно з `homepage-section-order`.

- [ ] **Step 7: Коміт**

```bash
git add sections/qlose-plan-teaser.liquid templates/index.json config/settings_data.json bin/checks.json
git commit -m "feat: QLOSE plan teaser, assemble homepage template"
```

---

### Task 13: Спільні примітиви сторінок

Три секції, які сама головна не використовує, але без яких жодна наступна гілка
не стартує. Живуть на `main` саме тому (обґрунтування — спека, розділ 4).

**Files:**
- Create: `sections/qlose-page-hero.liquid`
- Create: `sections/qlose-cta-band.liquid`
- Create: `sections/qlose-rich-text.liquid`

**Interfaces:**
- Produces: `qlose-page-hero` з налаштуванням `variant` (`simple` | `legal` | `editorial`), класи `.qlose-page-hero`, `.qlose-page-hero--{variant}`.
- Produces: `qlose-cta-band`, класи `.qlose-cta-band`, `.qlose-cta-band__heading`.
- Produces: `qlose-rich-text`, класи `.qlose-rich-text`; рендерить `page.content`, коли `section.settings.use_page_content` увімкнено.

- [ ] **Step 1: Написати `qlose-page-hero`**

Три варіанти зводяться до одного шаблону. Джерела: `simple` —
`docs/design-source/faq.html`, `legal` — `docs/design-source/privacy.html`,
`editorial` — `docs/design-source/journal.html`.

```liquid
<section class="qlose-page-hero qlose-page-hero--{{ section.settings.variant }}">
  <div class="qlose-page-hero__inner">
    {%- if section.settings.meta_left != blank or section.settings.meta_right != blank -%}
      <div class="qlose-page-hero__meta">
        <span><strong>{{ section.settings.meta_left }}</strong></span>
        <span>{{ section.settings.meta_right }}</span>
      </div>
    {%- endif -%}

    <h1 class="qlose-page-hero__heading">
      {%- if section.settings.heading != blank -%}
        {{ section.settings.heading }}
      {%- else -%}
        {{ page.title | default: shop.name }}
      {%- endif -%}
    </h1>

    {%- if section.settings.subtext != blank -%}
      <div class="qlose-page-hero__sub">{{ section.settings.subtext }}</div>
    {%- endif -%}
  </div>
</section>

{% stylesheet %}
  .qlose-page-hero {
    max-width: var(--qlose-max);
    margin-inline: auto;
    padding: 80px var(--qlose-gutter) 60px;
  }

  .qlose-page-hero__meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--qlose-divider);
    font-family: var(--qlose-font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--qlose-muted);
  }

  .qlose-page-hero__meta strong {
    color: var(--qlose-black);
    font-weight: 500;
  }

  .qlose-page-hero__heading {
    font-family: var(--qlose-font-sans);
    font-weight: 900;
    text-transform: uppercase;
    color: var(--qlose-black);
    line-height: 0.9;
    letter-spacing: -0.04em;
    font-size: clamp(40px, 7vw, 110px);
    overflow-wrap: break-word;
  }

  .qlose-page-hero--legal .qlose-page-hero__heading {
    font-size: clamp(36px, 5vw, 72px);
  }

  .qlose-page-hero__sub {
    margin-top: 24px;
    max-width: 560px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--qlose-graphite);
  }

  .qlose-page-hero--legal {
    border-bottom: 1px solid var(--qlose-divider);
  }

  @media (max-width: 900px) {
    .qlose-page-hero {
      padding-block: 40px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE page hero",
  "tag": "section",
  "settings": [
    {
      "type": "select",
      "id": "variant",
      "label": "Variant",
      "options": [
        { "value": "simple", "label": "Simple" },
        { "value": "legal", "label": "Legal" },
        { "value": "editorial", "label": "Editorial" }
      ],
      "default": "simple"
    },
    { "type": "text", "id": "meta_left", "label": "Meta left" },
    { "type": "text", "id": "meta_right", "label": "Meta right" },
    { "type": "richtext", "id": "heading", "label": "Heading (falls back to page title)" },
    { "type": "richtext", "id": "subtext", "label": "Subtext" }
  ],
  "presets": [{ "name": "QLOSE page hero" }]
}
{% endschema %}
```

- [ ] **Step 2: Написати `qlose-cta-band`**

Джерело: `docs/design-source/about.html`, секція `.bottom-cta`.

```liquid
<section class="qlose-cta-band">
  <div class="qlose-cta-band__inner">
    <h2 class="qlose-cta-band__heading">{{ section.settings.heading }}</h2>
    {%- if section.settings.text != blank -%}
      <div class="qlose-cta-band__text">{{ section.settings.text }}</div>
    {%- endif -%}
    <div class="qlose-cta-band__actions">
      {%- for block in section.blocks -%}
        <span {{ block.shopify_attributes }}>
          {%- render 'qlose-button',
              label: block.settings.label,
              url: block.settings.url,
              style: block.settings.style -%}
        </span>
      {%- endfor -%}
    </div>
  </div>
</section>

{% stylesheet %}
  .qlose-cta-band {
    background: var(--qlose-bone);
    padding: 120px var(--qlose-gutter);
    border-top: 1px solid var(--qlose-divider);
  }

  .qlose-cta-band__inner {
    max-width: 900px;
    margin: 0 auto;
    text-align: center;
  }

  .qlose-cta-band__heading {
    font-family: var(--qlose-font-sans);
    font-size: clamp(36px, 5vw, 80px);
    line-height: 0.9;
    letter-spacing: -0.04em;
    font-weight: 900;
    text-transform: uppercase;
    color: var(--qlose-black);
    margin-bottom: 24px;
  }

  .qlose-cta-band__text {
    font-size: 15px;
    line-height: 1.6;
    color: var(--qlose-graphite);
    margin-bottom: 40px;
  }

  .qlose-cta-band__actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  @media (max-width: 900px) {
    .qlose-cta-band {
      padding-block: 60px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE CTA band",
  "tag": "section",
  "settings": [
    { "type": "richtext", "id": "heading", "label": "Heading", "default": "<p>READY TO START YOUR ROUTINE.</p>" },
    { "type": "richtext", "id": "text", "label": "Text" }
  ],
  "blocks": [
    {
      "type": "cta",
      "name": "Button",
      "limit": 2,
      "settings": [
        { "type": "text", "id": "label", "label": "Label", "default": "Shop the kits" },
        { "type": "url", "id": "url", "label": "Link" },
        {
          "type": "select",
          "id": "style",
          "label": "Style",
          "options": [
            { "value": "primary", "label": "Primary" },
            { "value": "ghost", "label": "Ghost" },
            { "value": "underline", "label": "Underline" }
          ],
          "default": "primary"
        }
      ]
    }
  ],
  "presets": [{ "name": "QLOSE CTA band" }]
}
{% endschema %}
```

- [ ] **Step 3: Написати `qlose-rich-text`**

Носій юридичного тексту. Стилі заголовків і абзаців портуються з
`docs/design-source/privacy.html`, блок `.legal-hero`.

```liquid
<section class="qlose-rich-text">
  <div class="qlose-rich-text__inner">
    {%- if section.settings.use_page_content and page.content != blank -%}
      {{ page.content }}
    {%- else -%}
      {{ section.settings.content }}
    {%- endif -%}
  </div>
</section>

{% stylesheet %}
  .qlose-rich-text {
    max-width: 900px;
    margin-inline: auto;
    padding: 60px var(--qlose-gutter) 120px;
  }

  .qlose-rich-text__inner :is(h2, h3) {
    font-family: var(--qlose-font-sans);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    color: var(--qlose-black);
    margin-top: 48px;
    margin-bottom: 16px;
  }

  .qlose-rich-text__inner h2 {
    font-size: 22px;
  }

  .qlose-rich-text__inner h3 {
    font-size: 17px;
  }

  .qlose-rich-text__inner :is(p, li) {
    font-size: 15px;
    line-height: 1.75;
    color: var(--qlose-graphite);
  }

  .qlose-rich-text__inner p {
    margin-bottom: 16px;
  }

  .qlose-rich-text__inner ul,
  .qlose-rich-text__inner ol {
    margin: 0 0 16px 20px;
  }

  .qlose-rich-text__inner li {
    margin-bottom: 8px;
  }

  .qlose-rich-text__inner a {
    color: var(--qlose-accent-deep);
  }

  @media (max-width: 900px) {
    .qlose-rich-text {
      padding-bottom: 60px;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "QLOSE rich text",
  "tag": "section",
  "settings": [
    {
      "type": "checkbox",
      "id": "use_page_content",
      "label": "Use page content",
      "default": true,
      "info": "When on, renders the page body from the admin. When off, uses the text below."
    },
    { "type": "richtext", "id": "content", "label": "Content" }
  ],
  "presets": [{ "name": "QLOSE rich text" }]
}
{% endschema %}
```

- [ ] **Step 4: Перевірити, що theme check не додав помилок**

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
shopify theme check 2>&1 | tail -6
python3 bin/qlose-verify.py
```

Очікується: `6 errors`, `2 warnings` — базовий рівень. Усі перевірки харнесу `ok`.

- [ ] **Step 5: Коміт**

```bash
git add sections/qlose-page-hero.liquid sections/qlose-cta-band.liquid sections/qlose-rich-text.liquid
git commit -m "feat: shared page primitives (page hero, CTA band, rich text)"
```

---

### Task 14: Фінальна верифікація фундаменту

**Files:**
- Modify: `bin/checks.json` (за потреби)

- [ ] **Step 1: Повний прогін харнесу**

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
python3 bin/qlose-verify.py
echo "exit=$?"
```

Очікується: усі перевірки `ok`, `exit=0`.

- [ ] **Step 2: Theme check без приросту**

```bash
shopify theme check 2>&1 | tail -6
```

Очікується: рівно `6 errors`, `2 warnings`. Будь-яка нова помилка — блокер,
виправляти до продовження.

- [ ] **Step 3: Візуальна перевірка на трьох ширинах**

Через Claude in Chrome відкрити `http://127.0.0.1:9292/` і зняти скріншоти на
1440, 768 і 375. Перевірити по кожній ширині:

- горизонтального скролу немає на жодній;
- шапка липка, «Cart / 0» видно;
- на 375 працює кнопка «Menu», кроки рутини — горизонтальна стрічка;
- мега-лого у футері не обрізане;
- порядок секцій: hero → marquee → steps → statement → plans → faq.

- [ ] **Step 4: Перевірити консоль і мережу**

Через Claude in Chrome прочитати консоль і список запитів. Очікується: нуль
помилок у консолі, нуль 404 на ассетах, жодного запиту до `fonts.googleapis.com`
чи `fonts.gstatic.com`.

- [ ] **Step 5: Перевірити рух і контраст**

Увімкнути в системі «Зменшити рух» і перезавантажити сторінку: marquee має
стояти. Перевірити піпеткою, що mono-текст eyebrow має колір `#666666`, а не
`#888888`.

- [ ] **Step 6: Фінальний коміт**

```bash
git add -A
git commit -m "chore: foundation and homepage verified across breakpoints"
```

---

## Наступні плани

Після мерджу цієї гілки кожна сторінка отримує власний план і власну гілку за
маршрутною таблицею спеки (розділ 5). Перед гілками товарів треба закрити
передумову зі спеки, розділ 9: стор порожній, тож `product.*.json` немає на
чому перевіряти, доки не створено три товари, блог `journal` і девʼять
сторінок.
