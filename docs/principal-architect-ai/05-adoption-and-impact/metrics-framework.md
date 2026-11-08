# Adoption & Impact — Metrics Framework

## North-star

**Study turns completed per week** — a user sends a learning request and receives a usable coach reply (Ask / Code / Notebook / Voice).

## Metric tree

| Level | Metric | Source |
|-------|--------|--------|
| Acquisition | Sign-ups / week | Supabase Auth users |
| Activation | First successful Ask within 24h of signup | App analytics or server logs |
| Engagement | WAU, study turns / WAU | Auth + `/api/chat` logs |
| Quality | Thumbs-up rate; top negative reasons | `assistant_feedback` |
| Retention | D1 / D7 / D30 return | Auth last_sign_in / events |
| Mobile | Bottom-nav sessions; Voice sessions ≥3 turns | Client events (to instrument) |
| Cost | $ / study turn | HF export ÷ turns |

## Current instrumentation in product

| Already available | Gap to close |
|-------------------|--------------|
| Supabase Auth user list | Funnel dashboard |
| `/api/feedback` + weekly SQL | Automated weekly email |
| `/api/health` model config | Public status page |
| Client local histories | Server-side anonymized event table |

## Portfolio numbers

Until production exports are attached, present **methodology + qualitative impact** (PRs shipped, demo, feedback loop design). Fill:

| Metric | Value | As-of date | Export |
|--------|-------|------------|--------|
| Registered users | [[N]] | [[DATE]] | Supabase |
| WAU | [[N]] | [[DATE]] | [[ ]] |
| Study turns / week | [[N]] | [[DATE]] | [[ ]] |
| Thumbs-up % | [[N]] | [[DATE]] | feedback summary |
| D7 retention | [[N]] | [[DATE]] | [[ ]] |
