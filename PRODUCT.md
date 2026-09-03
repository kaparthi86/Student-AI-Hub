# Neo Clouds — separate product

**Neo Clouds Marketplace** is **not** part of Student AI Hub.

| | Student AI Hub | Neo Clouds |
|---|---|---|
| Domain | Your AI Hub URL | **neocloudsmarketplace.com** |
| Product | Student + Finance AI tutoring | GPU marketplace + inference API |
| Users | Students, learners | GPU providers + ML customers |
| Deploy | Root `render.yaml` → `student-ai-hub` | **`neo-clouds/render.yaml`** → `neo-clouds-marketplace` |
| Repo (recommended) | `Student-AI-Hub` | **`neo-clouds-marketplace`** (standalone; private OK) |

Run **two Render web services**, two domains, two codebases. Do not point `neocloudsmarketplace.com` at the AI Hub service.

Optional future integration: usage from Neo Clouds can feed **Easy Billing** for invoicing — that is an API integration, not a shared deploy.
