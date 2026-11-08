# Repository Map / Export Index

Repo: `kaparthi86/Student-AI-Hub` · Language: JavaScript · Created 2026-05-02

## Core runtime

| Path | Responsibility |
|------|----------------|
| `server.js` | Express API, prompts, cache, HF proxy, notebook, feedback |
| `public/app.js` | Coach SPA: auth, Ask/Code/Notebook, speech, tabs, personalization |
| `public/index.html` | Shell markup, panels, login gateway |
| `public/coach-labs.js` | Voice / Flashcards / Math / Focus / Gaps |
| `public/coach-labs.css` | Lab styles + voice states |
| `public/android-shell.css` | Bottom nav / mobile shell |
| `public/simplify-coach.css` | Coach brand simplification |
| `public/sw.js` + `manifest.webmanifest` | PWA |
| `public/config.js` | Supabase anon config (no secrets) |
| `.env.example` | Server secret template |
| `render.yaml` | Deploy blueprint |
| `supabase/*.sql` | Feedback schema + weekly review |
| `pitch/` | Investor deck |

## Evidence pack (this tree)

`docs/principal-architect-ai/**`

## How to export a code snapshot for reviewers

```bash
git archive --format=zip --output=student-ai-hub-src-$(date +%Y%m%d).zip HEAD \
  server.js public supabase pitch README.md package.json render.yaml \
  docs/principal-architect-ai
```

Exclude `.env`, `node_modules`, and any invoice PDFs with account numbers.
