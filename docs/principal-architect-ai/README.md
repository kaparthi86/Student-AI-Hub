# Principal Architect / Advanced Engineering (AI) — Evidence Pack

**One-file packet (recommended for interviews):**  
[`My-Student-Coach-Principal-Architect-Evidence-Packet.pdf`](./My-Student-Coach-Principal-Architect-Evidence-Packet.pdf) · rebuild with `./build-pdf-packet.sh`

**Product:** My Student Coach (Student AI Hub)  
**Role package:** Advanced Engineering · Principal Architect · AI Product Ownership  
**Repository:** `kaparthi86/Student-AI-Hub`  
**Pack date:** 2026-11-08 (America/Los_Angeles)  
**Repo created:** 2026-05-02 · Active through 2026-11-08

This folder is an interview / promotion / portfolio evidence kit. Each category maps to a common hiring bar for senior AI product-and-platform leaders.

| Category | Folder | What you will find |
|----------|--------|--------------------|
| Product ownership | [`01-product-ownership/`](01-product-ownership/) | PRD, roadmap, tickets, launch plan, ADRs |
| Technical originality | [`02-technical-originality/`](02-technical-originality/) | Architecture, AI workflows, prompts, model choices, repo map |
| Product history | [`03-product-history/`](03-product-history/) | Version history, release notes, demo script, screenshot placeholders |
| AI cost claims | [`04-ai-cost-claims/`](04-ai-cost-claims/) | Cost methodology, cache savings model, CSV templates, before/after |
| Adoption and impact | [`05-adoption-and-impact/`](05-adoption-and-impact/) | Metrics framework, SQL/analytics, feedback loop, testimonials |
| Independent validation | [`06-independent-validation/`](06-independent-validation/) | Validation plan, letter templates, talk outline |

## How to use this pack

1. **Technical originality + product ownership** are ready to present as written; they are grounded in the live codebase and merged PRs.
2. **Cost / adoption / validation** include executable frameworks plus **clearly marked placeholders** for production exports (HF invoices, Supabase auth counts, letters). Replace `[[PLACEHOLDER]]` fields before external sharing.
3. Keep secrets out of this folder. Never paste API tokens, invoices with account numbers, or PII into git.

## One-line thesis

Built and shipped a student-first AI coach end-to-end: product wedge, response contracts, Hugging Face Inference routing with response/prompt caching, honor-code study modes, PWA/Android-simple shell, and a conversational Voice Tutor — with measurable cost and quality loops.

## Suggested interview narrative (10 minutes)

1. Problem → students need focused study AI, not another general chatbot (PRD + roadmap).  
2. Architecture → Express + Supabase Auth + HF Router + SSE + cache (architecture diagram).  
3. Originality → response contracts, honor code modes, notebook grounding, voice loop (workflows + prompts).  
4. Ownership → ADR trail, launch plan, weekly feedback tickets.  
5. Economics → cache + voiceMode token caps + before/after model (cost claims).  
6. Proof → release history, demos, then live metrics/letters once filled.
