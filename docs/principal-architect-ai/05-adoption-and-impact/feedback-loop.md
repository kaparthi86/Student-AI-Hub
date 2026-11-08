# Customer Feedback Loop

## System

1. User taps Helpful / Not helpful on assistant replies.  
2. Server writes Supabase `assistant_feedback` **or** `feedback.ndjson`.  
3. Weekly: review top `(reason, mode)` pairs.  
4. Ship **one** contract or UX fix.  
5. Record impact in adoption pack.

## Operating cadence

| Day | Action |
|-----|--------|
| Mon | Pull 7-day summary |
| Tue | Reproduce top failure in Ask/Code/Notebook |
| Wed–Thu | Prompt/UX PR |
| Fri | Note thumbs delta; update release notes |

## Example closed loops (evidence)

| Period | Signal | Change | PR |
|--------|--------|--------|-----|
| 2026-11 | Markdown `**` noise | Strip / polish replies | #72 |
| 2026-11 | Learn/Profile dead | Menu panel wiring | #71 |
| 2026-11 | Safari abort crash | Declare abort vars | #75 |
| 2026-11 | Voice felt turn-based | Conversational loop | #74 |

## Testimonial capture

See `testimonials-template.md`. Prefer written permission + role (student / parent / teacher) without grades PII.
