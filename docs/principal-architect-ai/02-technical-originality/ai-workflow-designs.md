# AI Workflow Designs

## 1. Ask / Learn — teach the smallest useful next step

```mermaid
sequenceDiagram
  participant S as Student
  participant UI as Coach UI
  participant API as server.js
  participant HF as HF Router
  participant W as Live Web optional

  S->>UI: Question + studyMode
  UI->>API: POST /api/chat stream
  alt liveWeb on
    API->>W: search snippets
    W-->>API: sources
  end
  API->>HF: messages + max_tokens
  HF-->>API: SSE deltas
  API-->>UI: SSE deltas
  UI-->>S: Answer-first + steps
  S->>UI: Thumbs / follow-up controls
```

**Design choices:** Answer-first contract; Explain/Guide/Quiz styles; optional live web; regenerate and “explain simply” controls without new page.

## 2. Notebook — grounded multi-file study

```mermaid
flowchart LR
  Upload[Upload txt/md/csv/json/pdf] --> Corpus[buildNotebookCorpus]
  Corpus --> Analyze[Static NOTEBOOK_SYSTEM_STATIC]
  Analyze --> Sections[Exec summary → concepts → formulas → checks → 7-day plan]
  Sections --> Follow[NOTEBOOK_FOLLOWUP_SYSTEM + SOURCE MATERIALS]
  Follow --> Guard{Supported?}
  Guard -->|no| NID[Not in document]
  Guard -->|yes| Ans[Cited synthesis]
```

**Design choices:** Static system prefix for cache friendliness; document-only truth; structured analyze sections; follow-ups cannot invent facts.

## 3. Code tutor + practice

- System: patient coding tutor + code fences only for code.  
- Practice loop: check / skip under replies (shipped under Code; Ask parity).  
- Guide mode blocks full submittable solutions.

## 4. Voice Tutor — almost conversational

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Listening: tap mic
  Listening --> Thinking: utterance final
  Thinking --> Speaking: first sentence boundary
  Speaking --> Speaking: more sentences
  Speaking --> Listening: auto-continue on
  Speaking --> Idle: auto-continue off
  Thinking --> Listening: barge-in
  Speaking --> Listening: barge-in
  Listening --> Idle: stop/pause
```

**Design choices:** `voiceMode` short replies; speak-early; barge-in aborts fetch + TTS session id; Chrome/Edge preferred.

## 5. Quality / cost control loop

```mermaid
flowchart TB
  Use[Student usage] --> FB[Thumbs + reasons]
  FB --> Weekly[Weekly review SQL / API]
  Weekly --> Contract[Tighten response contract]
  Use --> Cache[Completion cache hits]
  Cache --> Cost[Lower HF spend]
  Contract --> Use
```
