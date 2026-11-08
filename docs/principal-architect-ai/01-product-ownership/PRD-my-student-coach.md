# PRD — My Student Coach (Student AI)

| Field | Value |
|-------|-------|
| Document ID | PRD-MSC-2026-01 |
| Owner | Product / Principal Architect (AI) |
| Status | Living — aligned to shipped main as of 2026-11-08 |
| Primary users | Middle school → college / exam prep students |
| Success definition | Students complete a study turn (ask → understand → practice) without leaving the product |

## 1. Problem

General-purpose AI chat is abundant and often harmful for schoolwork: long unfocused answers, brand confusion, submission-ready solutions, and weak grounding in the student’s own notes. Students need a **study coach** that answers first, teaches the smallest useful next step, respects honor code, and works on phone and laptop.

## 2. Goals

| Priority | Goal | Measurable signal |
|----------|------|-------------------|
| P0 | Fast authenticated access to Ask / Code / Notebook | Time-to-first-answer after Google login |
| P0 | Clear, non-markdown-noisy answers with brand identity | Thumbs-up rate; “**” strip failures = 0 |
| P0 | Mobile-simple shell (Home / Tutor / Learning / Profile) | Mobile session completion |
| P1 | Learning labs (Voice, Flashcards, Math, Focus, Gaps) | Lab weekly active use |
| P1 | Conversational Voice Tutor | Turns per voice session ≥ 3 |
| P2 | Play-ready Android (TWA/PWA path) | Install / add-to-home rate |

## 3. Non-goals

- Replacing a school LMS or gradebook  
- Native Kotlin app before PWA/TWA product-market fit  
- General consumer search engine  
- Finance / Budget AI (removed — Student AI wedge only)  
- Claiming to be ChatGPT / Claude / Perplexity / Google

## 4. Personas

1. **Exam-focused high schooler** — needs short explanations, quiz mode, flashcards.  
2. **College CS student** — needs Code tutor + Practice loop without full homework dumps.  
3. **Note-heavy learner** — uploads PDFs/notes; needs Notebook grounded answers.  
4. **Voice learner** — wants talk-back study while commuting (Chrome/Edge).

## 5. Product surface (shipped)

| Surface | Job to be done |
|---------|----------------|
| Home | Orient, resume last study path |
| Ask (Tutor) | Explain / Guide / Quiz with live-web optional grounding |
| Code | Patient coding tutor + practice |
| Notebook | Multi-file analyze + grounded follow-ups |
| Voice Tutor | Stream → speak-early → auto-listen → barge-in |
| Flashcards / Math / Focus / Gaps | P1 labs under Learning |
| Profile | Learner personalization (grade, subjects, explain style) |
| Login gateway | One-screen Google join + honor / nonprofit disclaimer |

## 6. Constraints

- Open-source / cost-aware inference via Hugging Face Inference Providers  
- Supabase Google OAuth; no custom password store  
- Honor code: Guide/Quiz must not hand over submittable work  
- Privacy: feedback may go to Supabase or local `feedback.ndjson`  
- Browser voice APIs only for v1 conversational voice (no realtime native yet)

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Model hallucination on homework | Notebook “Not in document”; live-web source chips; honor modes |
| Inference cost | Response cache TTL, prompt-cache params, voiceMode max tokens |
| Auth fragility (Safari) | Redirect URL checklist; declared abort controllers; hard-refresh cache bust |
| Scope creep (hub of hubs) | Wedge: Student AI only; kill Finance / Neo Clouds / Privacy from primary path |

## 8. Launch criteria (public)

- [x] Google login on production URL  
- [x] Ask / Code / Notebook streaming paths  
- [x] Privacy + Terms pages  
- [x] Feedback path (`/api/feedback` + weekly review SQL)  
- [x] Mobile bottom nav + Voice conversational loop  
- [ ] Production HF usage dashboard linked in cost pack  
- [ ] Android Play listing (TWA) after install metrics

## 9. Open questions

1. Default study mode for new users: Explain vs Guide?  
2. Should live web be on by default for Ask?  
3. When to move Voice Tutor to a realtime STT/TTS provider?
