#!/usr/bin/env bash
# Rebuild the single-file HTML + PDF evidence packet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

python3 <<'PY'
from pathlib import Path
import re
import html as html_lib
import markdown

root = Path('.').resolve()
out_html = root / 'My-Student-Coach-Principal-Architect-Evidence-Packet.html'

files = [
    root / 'README.md',
    root / 'MANIFEST.md',
    root / '01-product-ownership' / 'PRD-my-student-coach.md',
    root / '01-product-ownership' / 'product-roadmap.md',
    root / '01-product-ownership' / 'tickets-backlog.md',
    root / '01-product-ownership' / 'launch-plan.md',
    root / '01-product-ownership' / 'decision-records' / 'ADR-001-hf-inference-router.md',
    root / '01-product-ownership' / 'decision-records' / 'ADR-002-student-ai-only-wedge.md',
    root / '01-product-ownership' / 'decision-records' / 'ADR-003-response-and-prompt-cache.md',
    root / '01-product-ownership' / 'decision-records' / 'ADR-004-pwa-before-native.md',
    root / '01-product-ownership' / 'decision-records' / 'ADR-005-voice-conversational-loop.md',
    root / '02-technical-originality' / 'architecture-overview.md',
    root / '02-technical-originality' / 'ai-workflow-designs.md',
    root / '02-technical-originality' / 'prompt-library-export.md',
    root / '02-technical-originality' / 'model-provider-choices.md',
    root / '02-technical-originality' / 'repository-map.md',
    root / '03-product-history' / 'version-history.md',
    root / '03-product-history' / 'release-notes.md',
    root / '03-product-history' / 'demo-script.md',
    root / '03-product-history' / 'screenshots' / 'README.md',
    root / '04-ai-cost-claims' / 'cost-methodology.md',
    root / '04-ai-cost-claims' / 'cache-savings-model.md',
    root / '04-ai-cost-claims' / 'before-after-comparison.md',
    root / '04-ai-cost-claims' / 'invoice-checklist.md',
    root / '05-adoption-and-impact' / 'metrics-framework.md',
    root / '05-adoption-and-impact' / 'analytics-queries.md',
    root / '05-adoption-and-impact' / 'feedback-loop.md',
    root / '05-adoption-and-impact' / 'testimonials-template.md',
    root / '06-independent-validation' / 'validation-plan.md',
    root / '06-independent-validation' / 'letter-templates.md',
    root / '06-independent-validation' / 'conference-talk-outline.md',
]
csv_files = [
    root / '04-ai-cost-claims' / 'usage-export-template.csv',
    root / '04-ai-cost-claims' / 'cost-model.csv',
]
md_ext = ['tables', 'fenced_code', 'toc', 'nl2br', 'sane_lists']

def extract_mermaid_blocks(text):
    pattern = re.compile(r'```mermaid\n(.*?)```', re.DOTALL)
    return pattern.sub(lambda m: f'\n<div class="mermaid">\n{m.group(1).strip()}\n</div>\n', text)

sections, toc_items = [], []
for i, path in enumerate(files):
    raw = path.read_text(encoding='utf-8')
    rel = path.relative_to(root).as_posix()
    title_m = re.search(r'^#\s+(.+)$', raw, re.M)
    title = title_m.group(1).strip() if title_m else rel
    anchor = f'doc-{i}'
    toc_items.append((anchor, title, rel))
    body_html = markdown.markdown(extract_mermaid_blocks(raw), extensions=md_ext)
    sections.append(f'<section class="doc" id="{anchor}">\n<p class="path">{html_lib.escape(rel)}</p>\n{body_html}\n</section>')

for path in csv_files:
    rel = path.relative_to(root).as_posix()
    i = len(toc_items)
    anchor = f'doc-{i}'
    toc_items.append((anchor, path.name, rel))
    csv_text = path.read_text(encoding='utf-8')
    sections.append(
        f'<section class="doc" id="{anchor}">\n<p class="path">{html_lib.escape(rel)}</p>\n'
        f'<h1>{html_lib.escape(path.name)}</h1>\n<pre class="csv">{html_lib.escape(csv_text)}</pre>\n</section>'
    )

toc_html = '<ol class="toc">' + ''.join(
    f'<li><a href="#{a}">{html_lib.escape(t)}</a> <span class="toc-path">{html_lib.escape(r)}</span></li>'
    for a, t, r in toc_items
) + '</ol>'

# Keep styles in sync with the generated packet used for interviews.
css = Path('packet-print.css')
css_text = css.read_text(encoding='utf-8') if css.exists() else ''

# Minimal fallback if css file missing (first-run safety)
if not css_text:
    css_text = 'body{font-family:Georgia,serif} .doc{page-break-before:always}'

doc = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>My Student Coach — Principal Architect AI Evidence Packet</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({{ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' }});
  mermaid.run().finally(() => {{ window.__packetReady = true; }});
</script>
<style>{css_text}</style>
</head>
<body>
<header class="cover">
  <p class="kicker">Advanced Engineering · Principal Architect · AI</p>
  <h1>My Student Coach Evidence Packet</h1>
  <p class="sub">Product ownership, technical originality, product history, AI cost claims, adoption &amp; impact, and independent validation — assembled from the Student AI Hub repository.</p>
  <div class="meta">
    <div><strong>Product:</strong> My Student Coach (Student AI Hub)</div>
    <div><strong>Repository:</strong> kaparthi86/Student-AI-Hub</div>
    <div><strong>Packet date:</strong> November 8, 2026 (America/Los_Angeles)</div>
    <div><strong>Source folder:</strong> docs/principal-architect-ai/</div>
  </div>
</header>
<section class="toc-page">
  <h1>Table of contents</h1>
  {toc_html}
  <p class="footer-note">Placeholders marked [[LIKE_THIS]] require production exports before external quantified claims.</p>
</section>
{''.join(sections)}
</body>
</html>
'''
out_html.write_text(doc, encoding='utf-8')
print('Wrote', out_html)
PY

PDF="$ROOT/My-Student-Coach-Principal-Architect-Evidence-Packet.pdf"
PORT="${PACKET_PORT:-8765}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/packet-http.log 2>&1 &
HTTP_PID=$!
cleanup() { kill "$HTTP_PID" 2>/dev/null || true; }
trap cleanup EXIT
sleep 0.5

timeout 120 google-chrome \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --no-pdf-header-footer \
  --user-data-dir=/tmp/chrome-packet-profile \
  --virtual-time-budget=20000 \
  --run-all-compositor-stages-before-draw \
  --print-to-pdf="$PDF" \
  "http://127.0.0.1:${PORT}/My-Student-Coach-Principal-Architect-Evidence-Packet.html"

ls -la "$PDF"
echo "Done: $PDF"
