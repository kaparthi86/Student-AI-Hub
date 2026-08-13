/** Ask-tab image attach (VQA / multimodal). Set `true` to show UI and send images; keep `false` to mute. */
const LEARN_VISION_ENABLED = false;

const authCard = document.getElementById("authCard");
const hubCard = document.getElementById("hubCard");
const appCard = document.getElementById("appCard");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const authStatus = document.getElementById("authStatus");
const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const prefRestoreSessions = document.getElementById("prefRestoreSessions");
const prefUiLanguage = document.getElementById("prefUiLanguage");
const toastStack = document.getElementById("toastStack");

const panelChat = document.getElementById("panelChat");
const panelCode = document.getElementById("panelCode");
const panelNotebook = document.getElementById("panelNotebook");
const panelPractice = document.getElementById("panelPractice");

const chatSearchShell = document.getElementById("chatSearchShell");
const chatFollowupChips = document.getElementById("chatFollowupChips");
const chatAnswerShell = document.getElementById("chatAnswerShell");
const chatSearchInput = document.getElementById("chatSearchInput");
const chatSearchSubmit = document.getElementById("chatSearchSubmit");
const chatThread = document.getElementById("chatThread");
const chatFollowupInput = document.getElementById("chatFollowupInput");
const chatFollowupSubmit = document.getElementById("chatFollowupSubmit");
const apiStatus = document.getElementById("apiStatus");
const learnChatImageInput = document.getElementById("learnChatImageInput");
const chatHeroAttachBtn = document.getElementById("chatHeroAttachBtn");
const chatFollowupAttachBtn = document.getElementById("chatFollowupAttachBtn");
const chatHeroAttachPreview = document.getElementById("chatHeroAttachPreview");
const chatFollowupAttachPreview = document.getElementById("chatFollowupAttachPreview");
const chatFollowupMicBtn = document.getElementById("chatFollowupMicBtn");

const codeSearchShell = document.getElementById("codeSearchShell");
const codeAnswerShell = document.getElementById("codeAnswerShell");
const codeSearchInput = document.getElementById("codeSearchInput");
const codeSearchSubmit = document.getElementById("codeSearchSubmit");
const codeThread = document.getElementById("codeThread");
const codeFollowupInput = document.getElementById("codeFollowupInput");
const codeFollowupSubmit = document.getElementById("codeFollowupSubmit");
const codeStatus = document.getElementById("codeStatus");
const chatCopyThreadBtn = document.getElementById("chatCopyThreadBtn");
const codeCopyThreadBtn = document.getElementById("codeCopyThreadBtn");
const chatHeroMicBtn = document.getElementById("chatHeroMicBtn");

const docFileInput = document.getElementById("docFileInput");
const docAnalyzeBtn = document.getElementById("docAnalyzeBtn");
const docFileMeta = document.getElementById("docFileMeta");
const notebookThread = document.getElementById("notebookThread");
const notebookStatus = document.getElementById("notebookStatus");
const notebookEmptyState = document.getElementById("notebookEmptyState");
const notebookEmptyPrompts = document.getElementById("notebookEmptyPrompts");
const notebookAnswerShell = document.getElementById("notebookAnswerShell");
const notebookSourcesEl = document.getElementById("notebookSources");
const notebookActiveSources = document.getElementById("notebookActiveSources");
const notebookFollowupChips = document.getElementById("notebookFollowupChips");
const notebookFollowupInput = document.getElementById("notebookFollowupInput");
const notebookFollowupSubmit = document.getElementById("notebookFollowupSubmit");
const notebookCopyThreadBtn = document.getElementById("notebookCopyThreadBtn");
const NOTEBOOK_MAX_FILES = 5;

let mainTab = "chat";
let supabaseClient = null;

/** Learn Ask hero + follow-up: Web Speech with silence auto-stop and tap-to-stop. */
const LEARN_VOICE_SILENCE_MS = 2000;
let learnVoiceGlobalStop = null;
let learnVoiceEpoch = 0;

/** JWT `exp` in ms (0 if unknown). Used to refresh before API calls. */
function accessTokenExpiresAtMs(accessToken) {
  try {
    const parts = String(accessToken).split(".");
    if (parts.length < 2) return 0;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = JSON.parse(atob(b64));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Headers for `/api/*` including `Authorization: Bearer <access_token>`.
 * Proactively calls `refreshSession` when the access token is expired or near expiry.
 */
async function authHeaders(base = {}) {
  const h = { ...base };
  try {
    if (!supabaseClient) return h;
    let { data: { session } = {} } = await supabaseClient.auth.getSession();
    let token = session?.access_token;
    if (!token) return h;
    const exp = accessTokenExpiresAtMs(token);
    const refreshIfBeforeMs = 120_000;
    if (!exp || Date.now() > exp - refreshIfBeforeMs) {
      const { data: ref, error } = await supabaseClient.auth.refreshSession();
      if (!error && ref?.session?.access_token) {
        session = ref.session;
        token = session.access_token;
      }
    }
    if (token) h.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return h;
}

/**
 * `fetch` with auth headers; on 401 runs `refreshSession` once and retries (handles stale tokens after idle tabs).
 * Pass `headers` as a plain object only (same as existing callers).
 */
async function fetchAuthed(url, init = {}) {
  const { headers: extra, ...rest } = init;
  const ext = typeof extra === "object" && extra && !(extra instanceof Headers) ? extra : {};
  const run = async () => {
    const headers = await authHeaders(ext);
    return fetch(url, { ...rest, headers });
  };
  let res = await run();
  if (res.status === 401 && supabaseClient) {
    await supabaseClient.auth.refreshSession().catch(() => {});
    res = await run();
  }
  return res;
}

const chatHistory = [];
const codeHistory = [];
const notebookHistory = [];
const FEEDBACK_REASONS = ["too_vague", "incorrect", "too_long", "not_my_level", "other"];
const USER_PREFS_KEY = "student_ai_user_prefs_v1";
const CHAT_SESSION_KEY = "student_ai_sessions_v1";
const DEFAULT_PAGE_HINT_DISMISSED_KEY = "student_ai_default_page_hint_dismissed_v1";
const PWA_INSTALL_BAR_DISMISSED_KEY = "student_ai_pwa_install_bar_dismissed_v1";
const LANGUAGE_HINT_DISMISSED_KEY = "student_ai_lang_hint_dismissed_v1";
const HONOR_CODE_ACK_KEY = "ai_hub_student_honor_ack_v1";
const HUB_WAITLIST_KEY = "ai_hub_waitlist_v1";
/** Session fallback when localStorage is unavailable. */
let honorCodeAckThisSession = false;
/** @type {"hub" | "student" | null} */
let activeSurface = null;
/** @type {"health" | "finance" | null} */
let soonVertical = null;

let deferredInstallPrompt = null;
let chatSessionOpen = false;
let codeSessionOpen = false;
let notebookSessionOpen = false;
/** @type {File[]} */
let notebookFiles = [];
/** Combined extracted text used for grounded notebook follow-ups. */
let notebookDocumentContext = "";
/** @type {{ name: string, chars?: number }[]} */
let notebookSourceMeta = [];
let defaultPageHintOfferedThisLoad = false;
let activeUiLanguage = "en";

const SUPPORTED_UI_LANGS = ["en", "es", "hi", "te"];
const UI_LANG_LABELS = {
  en: "English",
  es: "Espanol",
  hi: "Hindi",
  te: "Telugu",
};

const I18N = {
  en: {
    signin_title: "Student AI for learning and practice",
    signin_tagline: "Free Ask, Code, and Notebook - study help that stays on your side of the honor code.",
    free_for_students: "Free for students",
    brand_kicker: "Ask, learn, code & notebook in one place",
    live_web_label: "Live web",
    live_web_hint: "Use current web sources when relevant",
    live_web_hint_off: "Answers use the model only (no live web)",
    sources_label: "Sources",
    status_searching_web: "Searching the web...",
    tile_student_badge: "Available now",
    tile_soon_badge: "Soon",
    hub_hint: "Choose a workspace to get started",
    resume_student: "Resume Student AI",
    live_web_unavailable: "Live web needs a search key on the server",
    auth_brand_kicker: "Learning, health, and money - in one Hub",
    hub_brand: "AI Hub",
    hub_tagline: "Focused AI for learning, health, and money",
    hub_welcome: "Welcome back, {name}",
    tile_student_title: "Student AI",
    tile_student_sub: "Ask, code, and study in one place",
    tile_student_cta: "Open ->",
    tile_health_title: "Health AI",
    tile_health_sub: "Understand wellness in plain language",
    tile_health_cta: "Coming soon",
    tile_finance_title: "Finance AI",
    tile_finance_sub: "Plan budgets and goals with clarity",
    tile_finance_cta: "Coming soon",
    soon_health_title: "Health AI",
    soon_health_body: "We're building a calm wellness guide - plain-language answers, habits, and clear limits.",
    soon_health_note: "Not medical advice. Never for emergencies.",
    soon_finance_title: "Finance AI",
    soon_finance_body: "We're building a clear money-planning space - budgets, goals, and practical explanations.",
    soon_finance_note: "Educational only. Not financial advice.",
    soon_notify: "Notify me",
    soon_back: "Back to Hub",
    soon_signin_notify: "Sign in to get notified",
    soon_close: "Close",
    toast_waitlist_health: "You're on the list for Health AI.",
    toast_waitlist_finance: "You're on the list for Finance AI.",
    toast_waitlist_already: "You're already on the list for {vertical}.",
    nav_hub: "AI Hub",
    nav_back_hub: "Back to AI Hub",
    nav_student: "Student AI",
    disclaimer_base: "AI Hub can make mistakes. Check important facts.",
    disclaimer_hub: "For learning, wellness, and money planning help - not a substitute for professional medical, legal, or financial advice.",
    disclaimer_nonprofit: "AI Hub is non-profit work - built to help people learn and plan, not to sell your data or push ads.",
    disclaimer_student: "In Student AI: for study help and practice only - follow your honor code; don't submit AI output when your course forbids it.",
    honor_title: "Study with integrity",
    honor_lead: "Student AI is for learning and practice - not for handing in AI work as your own.",
    honor_body: "Follow your school's honor code. Don't submit AI output when your course forbids it. Check important facts - AI can be wrong.",
    honor_ack: "I understand",
    honor_back: "Back to Hub",
    continue_google: "Join with Google",
    settings: "Settings",
    logout: "Logout",
    welcome: "Welcome",
    app_tagline: "Ask a question, get an answer, keep the conversation going.",
    tab_ask: "Ask",
    send: "Send",
    tab_code: "Code",
    tab_notebook: "Notebook",
    tab_practice: "Practice",
    chip_practice: "Practice",
    practice_title: "Practice",
    practice_lead: "A short check, then one clear next step - for learning, not shortcuts.",
    practice_from_notes: "Practice from my notes",
    practice_from_ask: "Or practice from last Ask",
    practice_topic_placeholder: "Or type a topic...",
    practice_start: "Start",
    practice_check: "Check",
    practice_skip: "Skip",
    practice_again: "Practice again",
    practice_back_notebook: "Back to Notebook",
    practice_summary_title: "Practice complete",
    practice_next_label: "Next best step",
    practice_entry_btn: "Practice from these notes",
    practice_entry_hint: "Short quiz, mistake review, then one next step.",
    practice_answer_placeholder: "Answer in your own words...",
    practice_progress: "Question {n} of {total}",
    practice_score: "You got {correct} of {total} right.",
    practice_need_notes: "Analyze notes in Notebook first.",
    practice_need_ask: "Ask a question first, then practice that topic.",
    practice_need_topic: "Enter a topic to practice.",
    practice_building: "Building your practice set...",
    practice_checking: "Checking your answer...",
    practice_wrapping: "Building your next step...",
    practice_correct: "Nice - you got the idea.",
    practice_miss: "Not quite - here is the key point.",
    practice_key_point: "Key point: {point}",
    practice_no_mistakes: "No major misses - solid practice.",
    practice_mistake_relearn: "Relearn: {tip}",
    chat_title: "What do you want to learn today?",
    chat_placeholder: "Ask anything... (e.g. Explain gradient descent like I am 15)",
    chat_hint: "Press Enter to search. Shift+Enter for a new line.",
    chat_followup: "Ask a follow-up...",
    code_title: "Debug or learn code",
    code_placeholder: "Paste code or describe the bug...",
    code_hint: "Tip: include error messages and what you expected.",
    code_followup: "Follow-up...",
    notebook_hint:
      "Upload notes (.txt, .md, .csv, .json, .pdf). You will get summary, key concepts, quiz questions, and a study plan - similar to a lightweight notebook assistant.",
    analyze_doc: "Analyze notes",
    notebook_drop_title: "Drop notes or choose files",
    notebook_drop_hint: "Up to 5 files - .txt, .md, .csv, .json, .pdf - summary, key ideas, quiz, and a study plan",
    notebook_followup: "Ask a follow-up about your notes...",
    notebook_sources_aria: "Selected notebook sources",
    notebook_remove_source: "Remove {name}",
    notebook_active_sources: "Studying: {names}",
    notebook_files_selected: "{count} files selected ({kb} KB)",
    choose_files_first: "Choose at least one notes file first",
    notebook_max_files: "You can analyze up to {max} files at a time.",
    toast_analyze_first: "Analyze your notes before asking follow-ups.",
    chip_study_plan: "Study plan",
    starter_prompt_study_plan:
      "Using only my uploaded notes, give a focused revision plan for the next 3 days with concrete tasks.\n\n",
    starter_prompt_notebook_summarize:
      "Using only my uploaded notes, summarize the most important ideas in short bullet points I should remember.\n\n",
    starter_prompt_notebook_quiz:
      "Using only my uploaded notes, quiz me with short questions and answer keys. If something is not in the notes, say Not in document.\n\n",
    starter_prompt_notebook_steps:
      "Using only my uploaded notes, explain the hardest idea step-by-step with a simple example.\n\n",
    status_ready: "Ready",
    status_generating: "Generating...",
    status_streaming: "Streaming...",
    status_failed: "Failed",
    settings_title: "Preferences",
    settings_close: "Close",
    settings_language: "Display language",
    settings_restore_sessions: "Restore previous chat sessions on load",
    settings_save: "Save preferences",
    settings_saved_toast: "Preferences saved",
    opening_google_login: "Opening Google login...",
    choose_file_first: "Choose a file first",
    reading_summarizing: "Reading and summarizing your notes...",
    language_hint: "Switch interface language to {lang}?",
    language_hint_desc: "You can always change this later in Settings.",
    keep_english: "Keep English",
    switch_lang: "Switch",
    you: "You",
    assistant: "Assistant",
    copy: "Copy",
    attached_image: "Attached image",
    show_steps: "Yes, show me how",
    hide_steps: "Hide steps",
    pwa_install_title: "Install AI Hub",
    pwa_install_btn: "Install",
    pwa_ios_help_btn: "iPhone / iPad",
    pwa_not_now: "Not now",
    default_title: "Make this your start page?",
    default_lead:
      "Browsers do not let websites change your startup page automatically. You can still set Student AI Hub as your start page in a few steps.",
    default_copy_address: "Copy this address:",
    default_step_chrome:
      "Chrome / Edge: Settings > On startup > Open a specific page > Add a new page, then paste this address.",
    default_step_safari: "Safari (Mac): Safari > Settings > General > Homepage, then paste this address.",
    default_step_ios: "iPhone / iPad: Share > Add to Home Screen for a quick icon.",
    default_extension_note:
      "Using our Chrome extension? After install, new tabs can open this site automatically.",
    copied: "Copied!",
    toast_no_assistant_reply: "No assistant reply to read yet.",
    toast_nothing_to_read: "Nothing to read.",
    toast_mic_permission_denied: "Microphone permission denied.",
    toast_no_speech: "No speech heard.",
    toast_voice_failed: "Voice input failed.",
    toast_voice_start_failed: "Could not start voice input.",
    voice_not_supported: "Voice input is not supported in this browser",
    remove_image: "Remove image",
    copy_assistant_aria: "Copy assistant response",
    toast_read_aloud_not_supported: "Read aloud is not supported in this browser.",
    toast_stopped: "Stopped",
    toast_speech_playback_failed: "Speech playback failed.",
    toast_image_attached: "Image attached. Add your question, then Ask.",
    toast_address_copied: "Address copied",
    toast_select_copy: "Select the field and copy (Cmd/Ctrl+C)",
    feedback_prompt: "Was this helpful?",
    feedback_helpful: "Helpful",
    feedback_not_helpful: "Not helpful",
    feedback_select_reason: "Select a reason",
    feedback_thanks: "Thanks!",
    feedback_thanks_reason: "Thanks for the feedback",
    reason_too_vague: "Too vague",
    reason_incorrect: "Incorrect",
    reason_too_long: "Too long",
    reason_not_my_level: "Not my level",
    reason_other: "Other",
    no_response: "No response.",
    error_prefix: "Error",
    stream_empty_fallback:
      "No assistant text arrived in the stream. This usually means empty model output or an SSE shape we could not parse. Check HF_API_TOKEN, HF_MODEL, and HF_CHAT_URL in your env.",
    pwa_sub_install:
      "Tap Install to add Student AI Hub with our icon. It opens fullscreen like an app from your home screen or taskbar.",
    pwa_sub_ios: "Use Add to Home Screen for our branded icon. Safari does not show an Install button on websites.",
    pwa_sub_desktop:
      "On Chrome or Edge, use the install icon in the address bar (or browser menu) when it appears to add our icon on desktop or home screen.",
    pwa_ios_steps:
      "Safari on iPhone or iPad: tap Share, then Add to Home Screen, then Add to place the branded icon on your home screen.",
    pwa_help_btn: "How to install",
    pwa_help_steps:
      "Desktop Chrome / Edge: use the install icon in the address bar, or the menu (three dots) and choose Install Student AI Hub or Install app.\n\nAndroid Chrome: open the menu and tap Add to Home screen or Install app.\n\nFirefox or Safari on Mac usually do not offer a website Install button; bookmark this page or use Add to Home Screen on iPhone / iPad.\n\nIf no install icon appears, the page may need HTTPS (not http://) or the browser may show it after you use the site a little longer.",
    empty_try_ask: "Try asking:",
    empty_try_code: "Try pasting or asking:",
    empty_try_notebook: "Works well with:",
    empty_chat_1: "Photosynthesis, simply",
    empty_chat_1_send: "Explain photosynthesis in simple terms, as if I am in high school.",
    empty_chat_2: "Gradient descent",
    empty_chat_2_send: "Explain gradient descent like I am 15, with a simple example.",
    empty_chat_3: "Study plan for an exam",
    empty_chat_3_send: "Help me make a one-week study plan for a biology midterm.",
    empty_code_1: "Fix my Python loop",
    empty_code_1_send:
      "My Python for loop runs forever. Here is the code:\n\nwhile True:\n    print('hi')\n\nWhy does it not stop and how do I fix it?",
    empty_code_2: "Explain this error",
    empty_code_2_send:
      "I get TypeError: cannot read property 'map' of undefined in JavaScript. What does it mean and how do I debug it?",
    empty_code_3: "Big-O of binary search",
    empty_code_3_send: "What is the time complexity of binary search and why? Keep it beginner-friendly.",
    empty_nb_1: "PDF lecture notes",
    empty_nb_1_hint: "Upload a PDF of lecture notes to get a summary, key concepts, and quiz questions.",
    empty_nb_2: "Markdown study guide",
    empty_nb_2_hint: "Upload a .md or .txt study guide for a structured recap and study plan.",
    empty_nb_3: "CSV data table",
    empty_nb_3_hint: "Upload a .csv file to summarize columns, patterns, and practice questions.",
    chip_summarize: "Shorter",
    chip_quiz: "Quiz me",
    chip_steps: "Step-by-step",
    chip_listen: "Listen",
    chip_simpler: "Simpler",
    chip_example: "Example",
    chip_study_next: "What next?",
    chips_followup_aria: "Quick follow-ups and read aloud",
    starter_prompt_summarize:
      "Make your last answer shorter: keep only the key points in tight bullets I can remember.\n\n",
    starter_prompt_quiz:
      "Based on our conversation so far, give me a short quiz: questions, answer choices, and correct answers with brief explanations.\n\n",
    starter_prompt_steps:
      "Explain that again as a clear numbered step-by-step list (1. 2. 3.). Keep each step short. Do not use ** bold asterisks. Add a simple example if it helps.\n\n",
    starter_prompt_simpler:
      "Explain the same idea more simply, like I am 15. Keep the answer-first style. Use a short everyday analogy.\n\n",
    starter_prompt_example:
      "Give one clear worked example for your last answer. Show the steps briefly, then state what to notice.\n\n",
    starter_prompt_study_next:
      "Based on what we just covered, tell me what I should practice next in 3 short steps. Keep it concrete.\n\n",
    copy_thread: "Copy conversation",
    copy_thread_aria: "Copy entire conversation",
    toast_thread_copied: "Conversation copied",
    toast_thread_empty: "Nothing to copy yet",
    copy_code: "Copy code",
    copy_code_aria: "Copy code block",
    attach_image_aria: "Attach image",
    attach_image_title: "Attach image",
    voice_search_aria: "Voice search",
    voice_search_title: "Tap to speak; pauses end listening, or tap again to search",
    voice_input_aria: "Voice input",
    voice_input_title: "Tap to speak; pauses end listening, or tap again to Ask",
    disclaimer_mistakes:
      "Student AI Hub can make mistakes. Check important facts and follow your instructor's policies on using AI.",
    disclaimer_honor:
      "For study help and practice only  follow your honor code; don't submit AI output when your course forbids it.",
    disclaimer_aria: "Disclaimer",
    doc_selected: "Selected: {name} ({kb} KB)",
    docs_selected: "Selected: {count} files ({kb} KB)",
    toast_image_read_fail: "Could not read image",
    toast_doc_analysis_failed: "Document analysis failed",
    pwa_install_sub_default:
      "Add our icon to your home screen or desktop for quick access until the mobile app ships.",
  },
  es: {
    signin_title: "Student AI para aprender y practicar",
    signin_tagline: "Ask, Code y Notebook gratis - ayuda de estudio con integridad academica.",
    free_for_students: "Gratis para estudiantes",
    brand_kicker: "Ask, learn, code y notebook en un solo lugar",
    live_web_label: "Web en vivo",
    live_web_hint: "Usa fuentes web actuales cuando ayude",
    live_web_hint_off: "Respuestas solo del modelo (sin web en vivo)",
    sources_label: "Fuentes",
    status_searching_web: "Buscando en la web...",
    tile_student_badge: "Disponible ahora",
    tile_soon_badge: "Pronto",
    hub_hint: "Elige un espacio para empezar",
    resume_student: "Reanudar Student AI",
    live_web_unavailable: "Web en vivo necesita una clave de busqueda en el servidor",
    auth_brand_kicker: "Aprendizaje, salud y dinero - en un Hub",
    hub_brand: "AI Hub",
    hub_tagline: "IA enfocada en aprendizaje, salud y dinero",
    hub_welcome: "Bienvenido de nuevo, {name}",
    tile_student_title: "Student AI",
    tile_student_sub: "Pregunta, programa y estudia en un solo lugar",
    tile_student_cta: "Abrir ->",
    tile_health_title: "Health AI",
    tile_health_sub: "Entiende el bienestar en lenguaje claro",
    tile_health_cta: "Proximamente",
    tile_finance_title: "Finance AI",
    tile_finance_sub: "Planifica presupuestos y metas con claridad",
    tile_finance_cta: "Proximamente",
    soon_health_title: "Health AI",
    soon_health_body: "Estamos creando una guia de bienestar calmada: respuestas claras, habitos y limites evidentes.",
    soon_health_note: "No es consejo medico. Nunca para emergencias.",
    soon_finance_title: "Finance AI",
    soon_finance_body: "Estamos creando un espacio claro para planificar tu dinero: presupuestos, metas y explicaciones practicas.",
    soon_finance_note: "Solo educativo. No es consejo financiero.",
    soon_notify: "Avisame",
    soon_back: "Volver al Hub",
    soon_signin_notify: "Inicia sesion para que te avisemos",
    soon_close: "Cerrar",
    toast_waitlist_health: "Estas en la lista de Health AI.",
    toast_waitlist_finance: "Estas en la lista de Finance AI.",
    toast_waitlist_already: "Ya estas en la lista de {vertical}.",
    nav_hub: "AI Hub",
    nav_back_hub: "Volver al Hub",
    nav_student: "Student AI",
    disclaimer_base: "AI Hub puede equivocarse. Verifica datos importantes.",
    disclaimer_hub: "Ayuda para aprendizaje, bienestar y planificacion financiera - no sustituye consejo medico, legal o financiero profesional.",
    disclaimer_nonprofit: "AI Hub es un proyecto sin fines de lucro: para ayudar a aprender y planificar, no para vender tus datos ni mostrar anuncios.",
    disclaimer_student: "En Student AI: solo para estudio y practica; sigue tu codigo de honor; no entregues salida de IA si tu curso lo prohibe.",
    honor_title: "Estudia con integridad",
    honor_lead: "Student AI es para aprender y practicar - no para entregar trabajo de IA como propio.",
    honor_body: "Sigue el codigo de honor de tu escuela. No entregues salida de IA si tu curso lo prohibe. Verifica datos importantes - la IA puede equivocarse.",
    honor_ack: "Entiendo",
    honor_back: "Volver al Hub",
    continue_google: "Unirse con Google",
    settings: "Configuracin",
    logout: "Cerrar sesin",
    welcome: "Bienvenido",
    app_tagline: "Haz una pregunta, obtn una respuesta y sigue la conversacin.",
    tab_ask: "Preguntar",
    send: "Enviar",
    tab_code: "Cdigo",
    tab_notebook: "Cuaderno",
    chat_title: "Qu quieres aprender hoy?",
    chat_placeholder: "Pregunta lo que sea... (p. ej., explica descenso de gradiente como si tuviera 15)",
    chat_hint: "Pulsa Enter para buscar. Shift+Enter para nueva lnea.",
    chat_followup: "Haz una pregunta de seguimiento...",
    code_title: "Depura o aprende cdigo",
    code_placeholder: "Pega cdigo o describe el error...",
    code_hint: "Consejo: incluye mensajes de error y lo que esperabas.",
    code_followup: "Seguimiento...",
    notebook_hint:
      "Sube apuntes (.txt, .md, .csv, .json, .pdf). Obtendrs resumen, conceptos clave, preguntas tipo quiz y un plan de estudio.",
    analyze_doc: "Analizar apuntes",
    notebook_drop_title: "Suelta apuntes o elige archivos",
    notebook_drop_hint: "Hasta 5 archivos - .txt, .md, .csv, .json, .pdf",
    notebook_followup: "Haz una pregunta sobre tus apuntes...",
    notebook_sources_aria: "Fuentes del cuaderno seleccionadas",
    notebook_remove_source: "Quitar {name}",
    notebook_active_sources: "Estudiando: {names}",
    notebook_files_selected: "{count} archivos seleccionados ({kb} KB)",
    choose_files_first: "Elige al menos un archivo primero",
    notebook_max_files: "Puedes analizar hasta {max} archivos a la vez.",
    toast_analyze_first: "Analiza tus apuntes antes de hacer preguntas de seguimiento.",
    chip_study_plan: "Plan de estudio",
    starter_prompt_study_plan:
      "Usando solo mis apuntes, dame un plan de repaso de 3 dias con tareas concretas.\n\n",
    starter_prompt_notebook_summarize:
      "Usando solo mis apuntes, resume las ideas mas importantes en viñetas.\n\n",
    starter_prompt_notebook_quiz:
      "Usando solo mis apuntes, hazme un quiz breve con respuestas. Si no esta en los apuntes, di Not in document.\n\n",
    starter_prompt_notebook_steps:
      "Usando solo mis apuntes, explica la idea mas dificil paso a paso con un ejemplo simple.\n\n",
    status_ready: "Listo",
    status_generating: "Generando...",
    status_streaming: "Transmitiendo...",
    status_failed: "Error",
    settings_title: "Preferencias",
    settings_close: "Cerrar",
    settings_language: "Idioma de la interfaz",
    settings_restore_sessions: "Restaurar sesiones anteriores al cargar",
    settings_save: "Guardar preferencias",
    settings_saved_toast: "Preferencias guardadas",
    language_hint: "Cambiar el idioma de la interfaz a {lang}?",
    language_hint_desc: "Siempre puedes cambiarlo despus en Configuracin.",
    keep_english: "Seguir en ingls",
    switch_lang: "Cambiar",
    you: "T",
    assistant: "Asistente",
    copy: "Copiar",
    attached_image: "Imagen adjunta",
    show_steps: "Si, mostrar pasos",
    hide_steps: "Ocultar pasos",
    pwa_install_title: "Instalar Student AI Hub",
    pwa_install_btn: "Instalar",
    pwa_ios_help_btn: "iPhone / iPad",
    pwa_not_now: "Ahora no",
    default_title: "Hacer esta tu pagina de inicio?",
    default_lead:
      "Los navegadores no permiten cambiar la pagina de inicio automaticamente. Aun asi puedes configurarlo en pocos pasos.",
    default_copy_address: "Copia esta direccion:",
    default_step_chrome:
      "Chrome / Edge: Configuracion > Al iniciar > Abrir una pagina especifica > Agregar una pagina nueva y pegar la direccion.",
    default_step_safari: "Safari (Mac): Safari > Configuracion > General > Pagina de inicio y pega la direccion.",
    default_step_ios: "iPhone / iPad: Compartir > Agregar a pantalla de inicio para un acceso rapido.",
    default_extension_note:
      "Usas nuestra extension de Chrome? Despues de instalarla, las nuevas pestanas pueden abrir este sitio automaticamente.",
    copied: "Copiado!",
    toast_no_assistant_reply: "Aun no hay respuesta del asistente para leer.",
    toast_nothing_to_read: "No hay nada para leer.",
    toast_mic_permission_denied: "Permiso del microfono denegado.",
    toast_no_speech: "No se detecto voz.",
    toast_voice_failed: "Fallo la entrada de voz.",
    toast_voice_start_failed: "No se pudo iniciar la entrada de voz.",
    voice_not_supported: "La entrada de voz no es compatible con este navegador",
    remove_image: "Quitar imagen",
    copy_assistant_aria: "Copiar respuesta del asistente",
    toast_read_aloud_not_supported: "La lectura en voz alta no es compatible con este navegador.",
    toast_stopped: "Detenido",
    toast_speech_playback_failed: "Fallo la reproduccion de voz.",
    toast_image_attached: "Imagen adjunta. Agrega tu pregunta y luego pulsa Preguntar.",
    toast_address_copied: "Direccion copiada",
    toast_select_copy: "Selecciona el campo y copia (Cmd/Ctrl+C)",
    feedback_prompt: "Te fue util?",
    feedback_helpful: "Util",
    feedback_not_helpful: "No util",
    feedback_select_reason: "Selecciona un motivo",
    feedback_thanks: "Gracias!",
    feedback_thanks_reason: "Gracias por tu comentario",
    reason_too_vague: "Muy vago",
    reason_incorrect: "Incorrecto",
    reason_too_long: "Muy largo",
    reason_not_my_level: "No es mi nivel",
    reason_other: "Otro",
    no_response: "Sin respuesta.",
    error_prefix: "Error",
    stream_empty_fallback:
      "No llego texto del asistente durante el stream. Suele ser salida vacia del modelo o un formato SSE no reconocido.",
    pwa_sub_install:
      "Pulsa Instalar para agregar Student AI Hub con nuestro icono. Se abrira en pantalla completa como una app.",
    pwa_sub_ios: "Usa Agregar a pantalla de inicio para obtener nuestro icono. Safari no muestra boton Instalar en sitios web.",
    pwa_sub_desktop:
      "En Chrome o Edge, usa el icono de instalar en la barra de direcciones (o menu) para agregar el acceso.",
    pwa_ios_steps:
      "Safari en iPhone o iPad: pulsa Compartir, luego Agregar a pantalla de inicio y despues Agregar para tener el icono.",
    pwa_help_btn: "Como instalar",
    pwa_help_steps:
      "Chrome / Edge (escritorio): busca el icono de instalar en la barra de direcciones, o el menu (tres puntos) > Instalar aplicacion / Instalar Student AI Hub.\n\nAndroid Chrome: menu > Agregar a pantalla de inicio o Instalar aplicacion.\n\nFirefox o Safari en Mac a menudo no muestran Instalar en sitios web; guarda un marcador o usa Agregar a pantalla de inicio en iPhone / iPad.\n\nSi no ves el icono, puede hacer falta HTTPS o mas uso del sitio.",
    empty_try_ask: "Prueba preguntando:",
    empty_try_code: "Prueba pegando o preguntando:",
    empty_try_notebook: "Funciona bien con:",
    empty_chat_1: "Fotosintesis, simple",
    empty_chat_1_send: "Explica la fotosintesis en terminos simples, como si estuviera en secundaria.",
    empty_chat_2: "Descenso de gradiente",
    empty_chat_2_send: "Explica el descenso de gradiente como si tuviera 15 anos, con un ejemplo simple.",
    empty_chat_3: "Plan de estudio",
    empty_chat_3_send: "Ayudame a hacer un plan de estudio de una semana para un parcial de biologia.",
    empty_code_1: "Arreglar bucle Python",
    empty_code_1_send:
      "Mi bucle for en Python corre para siempre:\n\nwhile True:\n    print('hola')\n\nPor que no para y como lo arreglo?",
    empty_code_2: "Explicar este error",
    empty_code_2_send:
      "Tengo TypeError: cannot read property 'map' of undefined en JavaScript. Que significa y como depurarlo?",
    empty_code_3: "Big-O de busqueda binaria",
    empty_code_3_send: "Cual es la complejidad temporal de la busqueda binaria y por que? Explicacion para principiantes.",
    empty_nb_1: "Apuntes PDF",
    empty_nb_1_hint: "Sube un PDF de apuntes para resumen, conceptos clave y preguntas tipo quiz.",
    empty_nb_2: "Guia en Markdown",
    empty_nb_2_hint: "Sube un .md o .txt para un repaso estructurado y plan de estudio.",
    empty_nb_3: "Tabla CSV",
    empty_nb_3_hint: "Sube un .csv para resumir columnas, patrones y preguntas de practica.",
    chip_summarize: "Mas corto",
    chip_quiz: "Quiz",
    chip_steps: "Paso a paso",
    chip_listen: "Modo escuchar",
    chip_simpler: "Mas simple",
    chip_example: "Ejemplo",
    chip_study_next: "Que sigue?",
    chips_followup_aria: "Seguimientos rapidos y lectura en voz alta",
    starter_prompt_summarize:
      "Resume tu ultima respuesta en vietas cortas. Destaca los terminos clave que debo recordar.\n\n",
    starter_prompt_quiz:
      "Segun nuestra conversacion, dame un quiz corto: preguntas, opciones y respuestas correctas con explicacion breve.\n\n",
    starter_prompt_steps: "Explica de nuevo paso a paso, con pasos mas pequeos y un ejemplo simple si ayuda.\n\n",
    starter_prompt_simpler:
      "Explica la misma idea de forma mas simple, como si tuviera 15 anos. Empieza con la respuesta directa.\n\n",
    starter_prompt_example:
      "Dame un ejemplo trabajado claro de tu ultima respuesta. Muestra pasos breves y que debo notar.\n\n",
    starter_prompt_study_next:
      "Segun lo que acabamos de ver, dime que practicar despues en 3 pasos concretos.\n\n",
    copy_thread: "Copiar conversacion",
    copy_thread_aria: "Copiar toda la conversacion",
    toast_thread_copied: "Conversacion copiada",
    toast_thread_empty: "Aun no hay nada que copiar",
    copy_code: "Copiar codigo",
    copy_code_aria: "Copiar bloque de codigo",
    attach_image_aria: "Adjuntar imagen",
    attach_image_title: "Adjuntar imagen",
    voice_search_aria: "Busqueda por voz",
    voice_search_title: "Toca para hablar; pausas terminan la escucha, o toca de nuevo para buscar",
    voice_input_aria: "Entrada por voz",
    voice_input_title: "Toca para hablar; pausas terminan la escucha, o toca de nuevo para Preguntar",
    disclaimer_mistakes:
      "Student AI Hub puede equivocarse. Verifica datos importantes y sigue las politicas de tu instructor sobre IA.",
    disclaimer_honor:
      "Solo para estudiar y practicar  respeta tu codigo de honor; no entregues salida de IA si tu curso lo prohibe.",
    disclaimer_aria: "Aviso legal",
    doc_selected: "Seleccionado: {name} ({kb} KB)",
    docs_selected: "Seleccionados: {count} archivos ({kb} KB)",
    toast_image_read_fail: "No se pudo leer la imagen",
    toast_doc_analysis_failed: "Fallo el analisis del documento",
    pwa_install_sub_default:
      "Agrega nuestro icono a la pantalla de inicio o escritorio para acceso rapido hasta la app movil.",
  },
  hi: {
    signin_title: "Student AI - seekhne aur practice ke liye",
    signin_tagline: "Free Ask, Code, aur Notebook - honor code ke saath study help.",
    free_for_students: "Students ke liye free",
    brand_kicker: "Ask, learn, code aur notebook ek jagah",
    live_web_label: "Live web",
    live_web_hint: "Zarurat ho to current web sources use karein",
    live_web_hint_off: "Sirf model se jawab (live web off)",
    sources_label: "Sources",
    status_searching_web: "Web search ho rahi hai...",
    tile_student_badge: "Ab available",
    tile_soon_badge: "Soon",
    hub_hint: "Shuru karne ke liye workspace chunen",
    resume_student: "Student AI resume karein",
    live_web_unavailable: "Live web ke liye server par search key chahiye",
    auth_brand_kicker: "Learning, health aur money - ek Hub mein",
    hub_brand: "AI Hub",
    hub_tagline: "Learning, health aur money ke liye focused AI",
    hub_welcome: "Welcome back, {name}",
    tile_student_title: "Student AI",
    tile_student_sub: "Ask, code aur study ek jagah",
    tile_student_cta: "Open ->",
    tile_health_title: "Health AI",
    tile_health_sub: "Wellness ko simple language mein samjhein",
    tile_health_cta: "Coming soon",
    tile_finance_title: "Finance AI",
    tile_finance_sub: "Budget aur goals clear planning ke saath",
    tile_finance_cta: "Coming soon",
    soon_health_title: "Health AI",
    soon_health_body: "Hum ek calm wellness guide bana rahe hain - simple answers, habits, aur clear limits.",
    soon_health_note: "Medical advice nahi. Emergency ke liye nahi.",
    soon_finance_title: "Finance AI",
    soon_finance_body: "Hum clear money-planning space bana rahe hain - budgets, goals, practical explanations.",
    soon_finance_note: "Sirf education. Financial advice nahi.",
    soon_notify: "Notify me",
    soon_back: "Hub par wapas",
    soon_signin_notify: "Notify ke liye sign in karein",
    soon_close: "Close",
    toast_waitlist_health: "Aap Health AI list mein ho.",
    toast_waitlist_finance: "Aap Finance AI list mein ho.",
    toast_waitlist_already: "Aap pehle se {vertical} list mein ho.",
    nav_hub: "AI Hub",
    nav_back_hub: "Hub par wapas",
    nav_student: "Student AI",
    disclaimer_base: "AI Hub galti kar sakta hai. Important facts check karein.",
    disclaimer_hub: "Learning, wellness aur money planning help ke liye - ye professional medical, legal ya financial advice nahi hai.",
    disclaimer_nonprofit: "AI Hub non-profit kaam hai - seekhne aur plan karne mein madad ke liye, data bechne ya ads dikhane ke liye nahi.",
    disclaimer_student: "Student AI mein: sirf study help ke liye - honor code follow karein; course forbid kare to AI output submit na karein.",
    honor_title: "Imaandari se padhein",
    honor_lead: "Student AI seekhne aur practice ke liye hai - AI ka kaam apna dikha kar submit karne ke liye nahi.",
    honor_body: "Apne school ka honor code follow karein. Course mana kare to AI output submit na karein. Important facts check karein - AI galat ho sakta hai.",
    honor_ack: "Samajh gaya",
    honor_back: "Hub par wapas",
    continue_google: "Google se join karein",
    settings: "Settings",
    logout: "Logout",
    welcome: "Swagat hai",
    app_tagline: "Sawal poochen, jawab paayen, aur conversation continue karein.",
    tab_ask: "Ask",
    send: "Bhejen",
    tab_code: "Code",
    tab_notebook: "Notebook",
    chat_title: "Aaj aap kya seekhna chahte hain?",
    chat_placeholder: "Kuch bhi poochiye... (jaise gradient descent ko simple terms mein samjhao)",
    chat_hint: "Search ke liye Enter dabayen. Nayi line ke liye Shift+Enter.",
    chat_followup: "Follow-up poochiye...",
    code_title: "Code debug karein ya seekhein",
    code_placeholder: "Code paste karein ya bug describe karein...",
    code_hint: "Tip: error message aur expected result zarur likhein.",
    code_followup: "Follow-up...",
    notebook_hint:
      "Notes upload karein (.txt, .md, .csv, .json, .pdf). Aapko summary, key concepts, quiz aur study plan milega.",
    analyze_doc: "Notes analyze karein",
    notebook_drop_title: "Notes drop karein ya files chunein",
    notebook_drop_hint: "5 files tak - .txt, .md, .csv, .json, .pdf",
    notebook_followup: "Apne notes par follow-up poochhein...",
    notebook_sources_aria: "Chune gaye notebook sources",
    notebook_remove_source: "{name} hataein",
    notebook_active_sources: "Padh rahe hain: {names}",
    notebook_files_selected: "{count} files selected ({kb} KB)",
    choose_files_first: "Pehle kam se kam ek notes file chunein",
    notebook_max_files: "Ek saath {max} files tak analyze kar sakte hain.",
    toast_analyze_first: "Follow-up se pehle notes analyze karein.",
    chip_study_plan: "Study plan",
    starter_prompt_study_plan:
      "Sirf mere uploaded notes se, agle 3 din ka focused revision plan do.\n\n",
    starter_prompt_notebook_summarize:
      "Sirf mere uploaded notes se, important ideas short bullets mein summarize karo.\n\n",
    starter_prompt_notebook_quiz:
      "Sirf mere uploaded notes se quiz do with answers. Agar notes mein nahi hai to Not in document kaho.\n\n",
    starter_prompt_notebook_steps:
      "Sirf mere uploaded notes se sabse mushkil idea step-by-step explain karo.\n\n",
    status_ready: "Ready",
    status_generating: "Generate ho raha hai...",
    status_streaming: "Streaming...",
    status_failed: "Failed",
    settings_title: "Preferences",
    settings_close: "Close",
    settings_language: "Display language",
    settings_restore_sessions: "Load par purane chat sessions restore karein",
    settings_save: "Preferences save karein",
    settings_saved_toast: "Preferences save ho gayi",
    opening_google_login: "Google login khul raha hai...",
    choose_file_first: "Pehle file chunen",
    reading_summarizing: "Padhkar summarize kiya ja raha hai...",
    language_hint: "Interface language ko {lang} mein switch karein?",
    language_hint_desc: "Aap ise baad mein Settings mein badal sakte hain.",
    keep_english: "English rakhein",
    switch_lang: "Switch",
    you: "Aap",
    assistant: "Assistant",
    copy: "Copy",
    attached_image: "Attached image",
    show_steps: "Haan, steps dikhaiye",
    hide_steps: "Steps chhupaye",
    pwa_install_title: "Student AI Hub install karein",
    pwa_install_btn: "Install",
    pwa_ios_help_btn: "iPhone / iPad",
    pwa_not_now: "Abhi nahi",
    default_title: "Kya ise aapka start page banayen?",
    default_lead:
      "Browser website ko startup page automatic badalne nahi dete. Aap kuch steps mein ise set kar sakte hain.",
    default_copy_address: "Yeh address copy karein:",
    default_step_chrome:
      "Chrome / Edge: Settings > On startup > Open a specific page > Add a new page, phir address paste karein.",
    default_step_safari: "Safari (Mac): Safari > Settings > General > Homepage, phir address paste karein.",
    default_step_ios: "iPhone / iPad: Share > Add to Home Screen se quick icon payen.",
    default_extension_note:
      "Chrome extension use kar rahe hain? Install ke baad new tabs is site ko automatic khol sakte hain.",
    copied: "Copy ho gaya!",
    toast_no_assistant_reply: "Padhne ke liye assistant ka reply abhi nahi mila.",
    toast_nothing_to_read: "Padhne ke liye kuch nahi hai.",
    toast_mic_permission_denied: "Microphone permission mana ki gayi.",
    toast_no_speech: "Koi awaaz sunai nahi di.",
    toast_voice_failed: "Voice input fail ho gaya.",
    toast_voice_start_failed: "Voice input start nahi ho saka.",
    voice_not_supported: "Is browser mein voice input supported nahi hai",
    remove_image: "Image hataen",
    copy_assistant_aria: "Assistant response copy karein",
    toast_read_aloud_not_supported: "Is browser mein read aloud supported nahi hai.",
    toast_stopped: "Rok diya gaya",
    toast_speech_playback_failed: "Speech playback fail ho gaya.",
    toast_image_attached: "Image attach ho gayi. Ab apna sawal likhkar Ask dabayen.",
    toast_address_copied: "Address copy ho gaya",
    toast_select_copy: "Field select karke copy karein (Cmd/Ctrl+C)",
    feedback_prompt: "Kya yeh helpful tha?",
    feedback_helpful: "Helpful",
    feedback_not_helpful: "Not helpful",
    feedback_select_reason: "Ek reason chunen",
    feedback_thanks: "Dhanyavaad!",
    feedback_thanks_reason: "Feedback ke liye dhanyavaad",
    reason_too_vague: "Bahut vague",
    reason_incorrect: "Galat",
    reason_too_long: "Bahut lamba",
    reason_not_my_level: "Mere level ka nahi",
    reason_other: "Anya",
    no_response: "Koi response nahi.",
    error_prefix: "Error",
    stream_empty_fallback:
      "Stream mein assistant text nahi aaya. Aksar iska matlab empty model output ya unknown SSE format hota hai.",
    pwa_sub_install:
      "Install dabakar Student AI Hub icon add karein. Ye app jaisa fullscreen open hoga.",
    pwa_sub_ios: "Add to Home Screen use karein. Safari websites par Install button nahi dikhata.",
    pwa_sub_desktop: "Chrome ya Edge mein address bar ka install icon use karke shortcut add karein.",
    pwa_ios_steps:
      "iPhone/iPad Safari: Share dabayein, phir Add to Home Screen, phir Add dabayein taki icon home screen par aaye.",
    pwa_help_btn: "Install kaise karein",
    pwa_help_steps:
      "Desktop Chrome / Edge: address bar mein install icon dekhein, ya menu (teen dot) se Install app / Student AI Hub install chunen.\n\nAndroid Chrome: menu se Add to Home screen ya Install app.\n\nMac par Firefox / Safari aksar website Install button nahi dete; bookmark karein ya iPhone / iPad par Add to Home Screen.\n\nAgar icon nahi dikhe, HTTPS zaroori ho sakta hai ya thodi der site use karke phir dekhein.",
    empty_try_ask: "Aise poochiye:",
    empty_try_code: "Paste karein ya poochiye:",
    empty_try_notebook: "Inke saath achha kaam karta hai:",
    empty_chat_1: "Photosynthesis, simple",
    empty_chat_1_send: "Photosynthesis ko simple terms mein samjhao, jaise main high school mein hoon.",
    empty_chat_2: "Gradient descent",
    empty_chat_2_send: "Gradient descent ko 15 saal ke level par example ke saath samjhao.",
    empty_chat_3: "Exam study plan",
    empty_chat_3_send: "Biology midterm ke liye ek hafte ka study plan banane mein madad karo.",
    empty_code_1: "Python loop fix",
    empty_code_1_send:
      "Mera Python loop hamesha chalta rehta hai:\n\nwhile True:\n    print('hi')\n\nKyun aur kaise theek karun?",
    empty_code_2: "Error samjhao",
    empty_code_2_send:
      "JavaScript mein TypeError: cannot read property 'map' of undefined aa raha hai. Iska matlab aur debug kaise karun?",
    empty_code_3: "Binary search Big-O",
    empty_code_3_send: "Binary search ki time complexity kya hai aur kyun? Beginner-friendly.",
    empty_nb_1: "PDF lecture notes",
    empty_nb_1_hint: "Lecture notes PDF upload karein  summary, key concepts aur quiz milega.",
    empty_nb_2: "Markdown guide",
    empty_nb_2_hint: ".md ya .txt study guide upload karein structured recap ke liye.",
    empty_nb_3: "CSV table",
    empty_nb_3_hint: ".csv upload karein columns aur patterns summarize karne ke liye.",
    chip_summarize: "Shorter",
    chip_quiz: "Quiz",
    chip_steps: "Step-by-step",
    chip_listen: "Listen",
    chip_simpler: "Simple",
    chip_example: "Example",
    chip_study_next: "Aage kya?",
    chips_followup_aria: "Quick follow-ups aur read aloud",
    starter_prompt_summarize:
      "Apne last answer ko short bullets mein summarize karo. Key terms highlight karo.\n\n",
    starter_prompt_quiz:
      "Ab tak ki conversation se chhota quiz do: questions, choices, sahi jawab aur short explanation.\n\n",
    starter_prompt_steps: "Dobara step-by-step samjhao, chhote steps aur simple example ke saath.\n\n",
    starter_prompt_simpler:
      "Wahi idea simple bhasha mein samjhao, 15 saal ke level par. Pehle seedha jawab do.\n\n",
    starter_prompt_example:
      "Last answer ka ek clear worked example do. Short steps, phir kya notice karna hai.\n\n",
    starter_prompt_study_next:
      "Abhi jo cover kiya uske baad main kya practice karun - 3 concrete steps.\n\n",
    copy_thread: "Conversation copy",
    copy_thread_aria: "Poori conversation copy karein",
    toast_thread_copied: "Conversation copy ho gayi",
    toast_thread_empty: "Abhi copy karne ke liye kuch nahi",
    copy_code: "Code copy",
    copy_code_aria: "Code block copy karein",
    attach_image_aria: "Image attach",
    attach_image_title: "Image attach",
    voice_search_aria: "Voice search",
    voice_search_title: "Bolne ke liye tap karein; pause par band, ya dubara search",
    voice_input_aria: "Voice input",
    voice_input_title: "Bolne ke liye tap karein; pause par band, ya dubara Ask",
    disclaimer_mistakes:
      "Student AI Hub galti kar sakta hai. Important facts check karein aur instructor ki AI policy follow karein.",
    disclaimer_honor:
      "Sirf study aur practice ke liye  honor code follow karein; course mana kare to AI output submit na karein.",
    disclaimer_aria: "Disclaimer",
    doc_selected: "Chuna gaya: {name} ({kb} KB)",
    docs_selected: "Chuni gayi: {count} files ({kb} KB)",
    toast_image_read_fail: "Image read nahi ho saki",
    toast_doc_analysis_failed: "Document analysis fail",
    pwa_install_sub_default: "Mobile app aane tak home screen ya desktop par quick access ke liye icon add karein.",
  },
  te: {
    signin_title: "Student AI - learning mariyu practice kosam",
    signin_tagline: "Free Ask, Code, Notebook - honor code tho study help.",
    free_for_students: "Students ki free",
    brand_kicker: "Ask, learn, code mariyu notebook oka chota",
    live_web_label: "Live web",
    live_web_hint: "Need aithe current web sources use cheyyandi",
    live_web_hint_off: "Model matrame (live web off)",
    sources_label: "Sources",
    status_searching_web: "Web search avuthundi...",
    tile_student_badge: "Ippudu available",
    tile_soon_badge: "Soon",
    hub_hint: "Start cheyadaniki workspace select cheyyandi",
    resume_student: "Student AI resume cheyyandi",
    live_web_unavailable: "Live web kosam server lo search key kavali",
    auth_brand_kicker: "Learning, health, money - oka Hub lo",
    hub_brand: "AI Hub",
    hub_tagline: "Learning, health, money kosam focused AI",
    hub_welcome: "Welcome back, {name}",
    tile_student_title: "Student AI",
    tile_student_sub: "Ask, code, study oka chota",
    tile_student_cta: "Open ->",
    tile_health_title: "Health AI",
    tile_health_sub: "Wellness ni simple language lo understand cheyyandi",
    tile_health_cta: "Coming soon",
    tile_finance_title: "Finance AI",
    tile_finance_sub: "Budgets, goals clear ga plan cheyyandi",
    tile_finance_cta: "Coming soon",
    soon_health_title: "Health AI",
    soon_health_body: "Calm wellness guide build chestunnam - simple answers, habits, clear limits.",
    soon_health_note: "Medical advice kadu. Emergencies ki kadu.",
    soon_finance_title: "Finance AI",
    soon_finance_body: "Clear money-planning space build chestunnam - budgets, goals, practical explanations.",
    soon_finance_note: "Education only. Financial advice kadu.",
    soon_notify: "Notify me",
    soon_back: "Hub ki back",
    soon_signin_notify: "Notify kosam sign in cheyyandi",
    soon_close: "Close",
    toast_waitlist_health: "Meeru Health AI list lo unnaru.",
    toast_waitlist_finance: "Meeru Finance AI list lo unnaru.",
    toast_waitlist_already: "Meeru already {vertical} list lo unnaru.",
    nav_hub: "AI Hub",
    nav_back_hub: "Hub ki back",
    nav_student: "Student AI",
    disclaimer_base: "AI Hub tappu cheyagaladu. Important facts verify cheyyandi.",
    disclaimer_hub: "Learning, wellness, money planning help kosam - idi professional medical, legal leda financial advice kadu.",
    disclaimer_nonprofit: "AI Hub non-profit work - learn cheyadaniki mariyu plan cheyadaniki, data ammakundaniki leda ads kosam kadu.",
    disclaimer_student: "Student AI lo: study help only - honor code follow avvandi; course forbid chesthe AI output submit cheyyakandi.",
    honor_title: "Niti tho chadavandi",
    honor_lead: "Student AI learn cheyadaniki mariyu practice kosame - AI output ni meekadi laaga submit cheyadaniki kadu.",
    honor_body: "Me school honor code follow avvandi. Course mana chesthe AI output submit cheyyakandi. Important facts check cheyyandi - AI tappu cheyavachu.",
    honor_ack: "Artham ayindi",
    honor_back: "Hub ki back",
    continue_google: "Google tho join avandi",
    settings: "Settings",
    logout: "Logout",
    welcome: "Swagatam",
    app_tagline: "Question adagandi, answer pondandi, conversation continue cheyyandi.",
    tab_ask: "Ask",
    send: "Pampu",
    tab_code: "Code",
    tab_notebook: "Notebook",
    chat_title: "I roju meeru emi nerchukovalani anukuntunnaru?",
    chat_placeholder: "Edaina adagandi... (udaharan: gradient descent ni simple ga explain cheyyi)",
    chat_hint: "Search kosam Enter nokkandi. Kotha line kosam Shift+Enter.",
    chat_followup: "Follow-up adagandi...",
    code_title: "Code debug cheyyandi leda nerchukondi",
    code_placeholder: "Code paste cheyyandi leda bug describe cheyyandi...",
    code_hint: "Tip: error messages mariyu expected result include cheyyandi.",
    code_followup: "Follow-up...",
    notebook_hint:
      "Notes upload cheyyandi (.txt, .md, .csv, .json, .pdf). Summary, key concepts, quiz mariyu study plan vastayi.",
    analyze_doc: "Notes analyze cheyyandi",
    notebook_drop_title: "Notes drop cheyyandi leda files select cheyyandi",
    notebook_drop_hint: "5 files varaku - .txt, .md, .csv, .json, .pdf",
    notebook_followup: "Mee notes gurinchi follow-up adagandi...",
    notebook_sources_aria: "Select chesina notebook sources",
    notebook_remove_source: "{name} remove cheyyandi",
    notebook_active_sources: "Chaduvutunnam: {names}",
    notebook_files_selected: "{count} files select chesaru ({kb} KB)",
    choose_files_first: "Mungata okka notes file aina select cheyyandi",
    notebook_max_files: "Okasari {max} files varaku analyze cheyavachu.",
    toast_analyze_first: "Follow-ups mundu notes analyze cheyyandi.",
    chip_study_plan: "Study plan",
    starter_prompt_study_plan:
      "Nenu upload chesina notes matrame use chesi, next 3 days focused revision plan ivvandi.\n\n",
    starter_prompt_notebook_summarize:
      "Nenu upload chesina notes matrame use chesi, important ideas short bullets lo summarize cheyyandi.\n\n",
    starter_prompt_notebook_quiz:
      "Nenu upload chesina notes matrame use chesi quiz ivvandi. Notes lo lekapothe Not in document ani cheppandi.\n\n",
    starter_prompt_notebook_steps:
      "Nenu upload chesina notes matrame use chesi, kastamaina idea ni step-by-step explain cheyyandi.\n\n",
    status_ready: "Ready",
    status_generating: "Generate avutondi...",
    status_streaming: "Streaming...",
    status_failed: "Failed",
    settings_title: "Preferences",
    settings_close: "Close",
    settings_language: "Display language",
    settings_restore_sessions: "Load appudu previous chat sessions restore cheyyandi",
    settings_save: "Preferences save cheyyandi",
    settings_saved_toast: "Preferences save ayyayi",
    opening_google_login: "Google login open avutondi...",
    choose_file_first: "Munduga file select cheyyandi",
    reading_summarizing: "Chadivi summarize chestunnam...",
    language_hint: "Interface language ni {lang} ki marchala?",
    language_hint_desc: "Idi taruvata Settings lo eppudaina marchavachu.",
    keep_english: "English continue",
    switch_lang: "Switch",
    you: "Meeru",
    assistant: "Assistant",
    copy: "Copy",
    attached_image: "Attached image",
    show_steps: "Avunu, steps chupinchandi",
    hide_steps: "Steps dachandi",
    pwa_install_title: "Student AI Hub install cheyyandi",
    pwa_install_btn: "Install",
    pwa_ios_help_btn: "iPhone / iPad",
    pwa_not_now: "Ippudu vaddu",
    default_title: "Idi mee start page ga set cheyyala?",
    default_lead:
      "Browsers websites ki startup page ni automatic marchadaniki allow cheyyavu. Konni steps lo meeru set cheyyachu.",
    default_copy_address: "Ee address ni copy cheyyandi:",
    default_step_chrome:
      "Chrome / Edge: Settings > On startup > Open a specific page > Add a new page, taruvata address paste cheyyandi.",
    default_step_safari: "Safari (Mac): Safari > Settings > General > Homepage lo address paste cheyyandi.",
    default_step_ios: "iPhone / iPad: Share > Add to Home Screen dwara quick icon pondandi.",
    default_extension_note:
      "Chrome extension vadutunnara? Install tarvata kotha tabs ee site ni automatic ga open cheyyagalavu.",
    copied: "Copy ayyindi!",
    toast_no_assistant_reply: "Chadavadaniki assistant reply inka raledu.",
    toast_nothing_to_read: "Chadavadaniki emi ledu.",
    toast_mic_permission_denied: "Microphone permission deny ayyindi.",
    toast_no_speech: "Voice vinipinchaledu.",
    toast_voice_failed: "Voice input fail ayyindi.",
    toast_voice_start_failed: "Voice input start cheyyalekapoyam.",
    voice_not_supported: "Ee browser lo voice input support ledu",
    remove_image: "Image remove cheyyandi",
    copy_assistant_aria: "Assistant response copy cheyyandi",
    toast_read_aloud_not_supported: "Ee browser lo read aloud support ledu.",
    toast_stopped: "Aapesaru",
    toast_speech_playback_failed: "Speech playback fail ayyindi.",
    toast_image_attached: "Image attach ayyindi. Ippudu mee prashna raasi Ask nokkandi.",
    toast_address_copied: "Address copy ayyindi",
    toast_select_copy: "Field select chesi copy cheyyandi (Cmd/Ctrl+C)",
    feedback_prompt: "Idi upayogapadina?",
    feedback_helpful: "Helpful",
    feedback_not_helpful: "Not helpful",
    feedback_select_reason: "Oka reason select cheyyandi",
    feedback_thanks: "Dhanyavadalu!",
    feedback_thanks_reason: "Mee feedback ki dhanyavadalu",
    reason_too_vague: "Spashtanga ledu",
    reason_incorrect: "Tappu",
    reason_too_long: "Chala pedda ga undi",
    reason_not_my_level: "Na level ki taggadu",
    reason_other: "Itara",
    no_response: "Response ledu.",
    error_prefix: "Error",
    stream_empty_fallback:
      "Stream lo assistant text raledu. Idi mostly empty model output leka unknown SSE format valla jarugutundi.",
    pwa_sub_install: "Install nokki Student AI Hub icon add cheyyandi. Idi app la fullscreen lo open avutundi.",
    pwa_sub_ios: "Add to Home Screen vadandi. Safari websites ki Install button chupinchadu.",
    pwa_sub_desktop: "Chrome/Edge address bar lo install icon tho shortcut add cheyyandi.",
    pwa_ios_steps:
      "iPhone/iPad Safari lo Share nokki, Add to Home Screen > Add nokkandi. App icon home screen lo vastundi.",
    pwa_help_btn: "Ela install cheyyali",
    pwa_help_steps:
      "Desktop Chrome / Edge: address bar lo install icon vadandi, leka menu (three dots) nunchi Install app / Student AI Hub install.\n\nAndroid Chrome: menu nunchi Add to Home screen leka Install app.\n\nMac Firefox / Safari lo website Install button chala sarlu undadu; bookmark cheyyandi leka iPhone / iPad lo Add to Home Screen.\n\nInstall icon kanipinchakapothe HTTPS avasaram leka konchem site use chesaka malli chudandi.",
    empty_try_ask: "Ila adagandi:",
    empty_try_code: "Paste cheyyandi leda adagandi:",
    empty_try_notebook: "Ivi manchiga pani chestayi:",
    empty_chat_1: "Photosynthesis, simple ga",
    empty_chat_1_send: "Photosynthesis ni simple ga explain cheyyi, nenu high school student la.",
    empty_chat_2: "Gradient descent",
    empty_chat_2_send: "Gradient descent ni 15 years vayassu student ki example tho explain cheyyi.",
    empty_chat_3: "Exam study plan",
    empty_chat_3_send: "Biology midterm kosam oka week study plan cheyyadaniki help cheyyi.",
    empty_code_1: "Python loop fix",
    empty_code_1_send:
      "Na Python loop appudu aagadu:\n\nwhile True:\n    print('hi')\n\nEnduku mari ela fix cheyyali?",
    empty_code_2: "Ee error explain",
    empty_code_2_send:
      "JavaScript lo TypeError: cannot read property 'map' of undefined vastundi. Ardham enti mari debug ela?",
    empty_code_3: "Binary search Big-O",
    empty_code_3_send: "Binary search time complexity enti mari enduku? Beginner ki simple ga.",
    empty_nb_1: "PDF lecture notes",
    empty_nb_1_hint: "Lecture notes PDF upload cheste summary, key concepts mariyu quiz vastundi.",
    empty_nb_2: "Markdown guide",
    empty_nb_2_hint: ".md leda .txt study guide upload cheste structured recap vastundi.",
    empty_nb_3: "CSV table",
    empty_nb_3_hint: ".csv upload cheste columns, patterns summarize avutayi.",
    chip_summarize: "Shorter",
    chip_quiz: "Quiz",
    chip_steps: "Step-by-step",
    chip_listen: "Listen",
    chip_simpler: "Simple",
    chip_example: "Example",
    chip_study_next: "Tarvata enti?",
    chips_followup_aria: "Quick follow-ups mariyu read aloud",
    starter_prompt_summarize:
      "Mee last answer ni short bullets lo summarize cheyyandi. Gurtupettukovalasina key terms highlight cheyyandi.\n\n",
    starter_prompt_quiz:
      "Mana conversation nunchi chinna quiz ivvandi: questions, choices, correct answers mariyu short explanation.\n\n",
    starter_prompt_steps: "Malli step-by-step explain cheyyandi, chinna steps mariyu simple example tho.\n\n",
    starter_prompt_simpler:
      "Ade idea ni simple ga explain cheyyandi, 15 years level. Mundu direct answer ivvandi.\n\n",
    starter_prompt_example:
      "Last answer ki oka clear worked example ivvandi. Short steps, tarvata emi notice cheyalo.\n\n",
    starter_prompt_study_next:
      "Ippudu cover chesindanni batti nenu tarvata emi practice cheyyali - 3 concrete steps.\n\n",
    copy_thread: "Conversation copy",
    copy_thread_aria: "Mottam conversation copy cheyyandi",
    toast_thread_copied: "Conversation copy ayyindi",
    toast_thread_empty: "Copy cheyyadaniki inka emi ledu",
    copy_code: "Code copy",
    copy_code_aria: "Code block copy cheyyandi",
    attach_image_aria: "Image attach",
    attach_image_title: "Image attach",
    voice_search_aria: "Voice search",
    voice_search_title: "Matladadaniki tap; pause aite aaputundi, leda malli search",
    voice_input_aria: "Voice input",
    voice_input_title: "Matladadaniki tap; pause aite aaputundi, leda malli Ask",
    disclaimer_mistakes:
      "Student AI Hub tappu cheyagaladu. Important facts verify cheyyandi mariyu instructor AI policy follow avvandi.",
    disclaimer_honor:
      "Study mariyu practice kosame  honor code follow avvandi; course mana cheste AI output submit cheyyakandi.",
    disclaimer_aria: "Disclaimer",
    doc_selected: "Select chesaru: {name} ({kb} KB)",
    docs_selected: "Select chesina files: {count} ({kb} KB)",
    toast_image_read_fail: "Image read avvaledu",
    toast_doc_analysis_failed: "Document analysis fail ayyindi",
    pwa_install_sub_default: "Mobile app varaku home screen leda desktop lo quick access kosam icon add cheyyandi.",
  },
};

function normalizeUiLanguage(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return SUPPORTED_UI_LANGS.includes(v) ? v : "en";
}

function t(key, vars = {}) {
  const dict = I18N[activeUiLanguage] || I18N.en;
  let out = dict[key] || I18N.en[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    out = out.replaceAll(`{${k}}`, String(v));
  });
  return out;
}

function setUiLanguage(nextLang) {
  activeUiLanguage = normalizeUiLanguage(nextLang);
  document.documentElement.lang = activeUiLanguage;
  applyTranslations();
  renderThreadFromHistory(chatThread, chatHistory, "learn", "explain");
  renderThreadFromHistory(codeThread, codeHistory, "code", "explain");
  refreshPwaInstallSubText();
}

function applyTranslations() {
  const byIdText = {
    authSigninTitle: "signin_title",
    authSigninTagline: "signin_tagline",
    authBrandKicker: "auth_brand_kicker",
    hubBrandTitle: "hub_brand",
    hubTagline: "hub_tagline",
    hubResumeStudent: "resume_student",
    tileStudentBadge: "tile_student_badge",
    tileHealthBadge: "tile_soon_badge",
    tileFinanceBadge: "tile_soon_badge",
    liveWebToggleLabel: "live_web_label",
    liveWebHint: "live_web_hint",
    tileStudentTitle: "tile_student_title",
    tileStudentSub: "tile_student_sub",
    tileStudentCta: "tile_student_cta",
    tileHealthTitle: "tile_health_title",
    tileHealthSub: "tile_health_sub",
    tileHealthCta: "tile_health_cta",
    tileFinanceTitle: "tile_finance_title",
    tileFinanceSub: "tile_finance_sub",
    tileFinanceCta: "tile_finance_cta",
    soonNotifyBtn: "soon_notify",
    soonBackBtn: "soon_back",
    soonModalCloseBtn: "soon_close",
    backToHubBtn: "nav_back_hub",
    crumbStudent: "nav_student",
    googleLoginBtn: "continue_google",
    openSettingsBtn: "settings",
    logoutBtn: "logout",
    welcomePrefix: "welcome",
    appTaglineMain: "app_tagline",
    tabChat: "tab_ask",
    tabCode: "tab_code",
    tabNotebook: "tab_notebook",
    tabPractice: "tab_practice",
    practiceTitle: "practice_title",
    practiceLead: "practice_lead",
    practiceFromNotesBtn: "practice_from_notes",
    practiceFromAskBtn: "practice_from_ask",
    practiceTopicStartBtn: "practice_start",
    practiceSubmitAnswer: "practice_check",
    practiceSkipBtn: "practice_skip",
    practiceAgainBtn: "practice_again",
    practiceBackNotebookBtn: "practice_back_notebook",
    practiceSummaryTitle: "practice_summary_title",
    practiceNextLabel: "practice_next_label",

    chatSearchTitle: "chat_title",
    chatSearchHint: "chat_hint",
    codeSearchTitle: "code_title",
    codeSearchHint: "code_hint",
    notebookHint: "notebook_hint",
    chatSearchSubmit: "tab_ask",
    chatFollowupSubmit: "tab_ask",
    codeSearchSubmit: "tab_ask",
    codeFollowupSubmit: "send",
    docAnalyzeBtn: "analyze_doc",
    settingsTitle: "settings_title",
    closeSettingsBtn: "settings_close",
    prefUiLanguageLabel: "settings_language",
    prefRestoreSessionsLabel: "settings_restore_sessions",
    saveSettingsBtn: "settings_save",
    pwaInstallTitle: "pwa_install_title",
    pwaInstallBtn: "pwa_install_btn",
    pwaIosHelpBtn: "pwa_ios_help_btn",
    pwaInstallHelpBtn: "pwa_help_btn",
    pwaInstallDismiss: "pwa_not_now",
    honorCodeTitle: "honor_title",
    honorCodeLead: "honor_lead",
    honorCodeBody: "honor_body",
    honorCodeAckBtn: "honor_ack",
    honorCodeBackBtn: "honor_back",
    defaultPageHintTitle: "default_title",
    closeDefaultPageHintBtn: "settings_close",
    defaultPageHintLead: "default_lead",
    defaultPageHintUrlLabel: "default_copy_address",
    copyDefaultPageUrlBtn: "copy",
    defaultPageHintExtensionNote: "default_extension_note",
    showDefaultPageStepsBtn: "show_steps",
    dismissDefaultPageHintBtn: "pwa_not_now",
    chatCopyThreadBtn: "copy_thread",
    codeCopyThreadBtn: "copy_thread",
    notebookCopyThreadBtn: "copy_thread",
    chatEmptyPromptsLabel: "empty_try_ask",
    codeEmptyPromptsLabel: "empty_try_code",
    notebookEmptyPromptsLabel: "empty_try_notebook",
    notebookDropTitle: "notebook_drop_title",
    notebookHint: "notebook_drop_hint",
  };
  Object.entries(byIdText).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "googleLoginBtn") {
      const label = el.querySelector("span:last-child") || el.querySelector("span");
      if (label) label.textContent = t(key);
      else el.textContent = t(key);
      return;
    }
    el.textContent = t(key);
  });
  if (chatSearchInput) chatSearchInput.placeholder = t("chat_placeholder");
  if (chatFollowupInput) chatFollowupInput.placeholder = t("chat_followup");
  if (codeSearchInput) codeSearchInput.placeholder = t("code_placeholder");
  if (codeFollowupInput) codeFollowupInput.placeholder = t("code_followup");
  if (notebookFollowupInput) notebookFollowupInput.placeholder = t("notebook_followup");
  const practiceTopicInputEl = document.getElementById("practiceTopicInput");
  if (practiceTopicInputEl) practiceTopicInputEl.placeholder = t("practice_topic_placeholder");
  const practiceAnswerInputEl = document.getElementById("practiceAnswerInput");
  if (practiceAnswerInputEl) practiceAnswerInputEl.placeholder = t("practice_answer_placeholder");
  const pwaIosSteps = document.getElementById("pwaIosSteps");
  if (pwaIosSteps) pwaIosSteps.textContent = t("pwa_ios_steps");
  const pwaInstallHelpSteps = document.getElementById("pwaInstallHelpSteps");
  if (pwaInstallHelpSteps) pwaInstallHelpSteps.textContent = t("pwa_help_steps");
  const hintList = document.getElementById("defaultPageHintList");
  if (hintList) {
    hintList.innerHTML = "";
    [t("default_step_chrome"), t("default_step_safari"), t("default_step_ios")].forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      hintList.appendChild(li);
    });
  }
  document.querySelectorAll(".fine-print-line[data-i18n], .brand-kicker[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll(".open-settings-btn").forEach((el) => {
    el.textContent = t("settings");
  });
  document.querySelectorAll(".logout-btn").forEach((el) => {
    el.textContent = t("logout");
  });
  syncHubWelcome();
  syncLiveWebToggleUi();
  syncHubResumeButton();
  if (soonVertical) fillSoonModal(soonVertical);
  ["authDisclaimerFooter", "appDisclaimerFooter", "hubDisclaimerFooter"].forEach((id) => {
    const footer = document.getElementById(id);
    if (footer) footer.setAttribute("aria-label", t("disclaimer_aria"));
  });
  if (chatFollowupChips) chatFollowupChips.setAttribute("aria-label", t("chips_followup_aria"));
  if (notebookFollowupChips) notebookFollowupChips.setAttribute("aria-label", t("chips_followup_aria"));
  if (notebookSourcesEl) notebookSourcesEl.setAttribute("aria-label", t("notebook_sources_aria"));
  refreshAllSmartFollowupChips();
  document.querySelectorAll(".starter-chip[data-starter]").forEach((chip) => {
    const starter = chip.getAttribute("data-starter");
    const labelKey = STARTER_CHIP_LABEL_KEYS[starter];
    if (labelKey) chip.textContent = t(labelKey);
  });
  document.querySelectorAll(".empty-prompt-chip[data-empty-scope]").forEach((chip) => {
    const scope = chip.getAttribute("data-empty-scope");
    const idx = Number(chip.getAttribute("data-empty-idx"));
    const spec = EMPTY_PROMPT_SPECS[scope]?.[idx];
    if (spec?.label) chip.textContent = t(spec.label);
  });
  [chatHeroAttachBtn, chatFollowupAttachBtn].forEach((btn) => {
    if (!btn) return;
    btn.setAttribute("aria-label", t("attach_image_aria"));
    btn.setAttribute("title", t("attach_image_title"));
  });
  if (chatHeroMicBtn) {
    chatHeroMicBtn.setAttribute("aria-label", t("voice_search_aria"));
    chatHeroMicBtn.setAttribute("title", t("voice_search_title"));
  }
  if (chatFollowupMicBtn) {
    chatFollowupMicBtn.setAttribute("aria-label", t("voice_input_aria"));
    chatFollowupMicBtn.setAttribute("title", t("voice_input_title"));
  }
  const closeDefaultPageHintBtn = document.getElementById("closeDefaultPageHintBtn");
  if (closeDefaultPageHintBtn) closeDefaultPageHintBtn.setAttribute("aria-label", t("settings_close"));
  const backToHubBtn = document.getElementById("backToHubBtn");
  if (backToHubBtn) {
    const hubLabel = t("nav_back_hub");
    backToHubBtn.setAttribute("aria-label", hubLabel);
    backToHubBtn.setAttribute("title", hubLabel);
  }
  document.querySelectorAll(".copy-thread-btn").forEach((btn) => {
    btn.setAttribute("aria-label", t("copy_thread_aria"));
  });
  [apiStatus, codeStatus, notebookStatus].forEach((el) => {
    if (!el) return;
    const key = el.dataset.i18nStatus || "status_ready";
    setStatus(el, key);
  });
}

function setStatus(el, key) {
  if (!el) return;
  el.dataset.i18nStatus = key;
  const idle = key === "status_ready";
  el.textContent = idle ? "" : t(key);
  el.classList.toggle("is-busy", !idle);
  el.hidden = idle;
}

/** @type {{ mime: string, base64: string, dataUrl: string } | null} */
let learnChatVisionAttachment = null;

function clearLearnChatVisionAttachment() {
  learnChatVisionAttachment = null;
  [chatHeroAttachPreview, chatFollowupAttachPreview].forEach((el) => {
    if (!el) return;
    el.replaceChildren();
    el.classList.add("hidden");
  });
}

function updateLearnChatAttachPreview() {
  [chatHeroAttachPreview, chatFollowupAttachPreview].forEach((el) => {
    if (!el) return;
    el.replaceChildren();
    if (!learnChatVisionAttachment) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const wrap = document.createElement("span");
    wrap.className = "learn-chat-attach-thumb-wrap";
    const img = document.createElement("img");
    img.className = "learn-chat-attach-thumb";
    img.src = learnChatVisionAttachment.dataUrl;
    img.alt = "Attached preview";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "learn-chat-attach-remove";
    rm.setAttribute("aria-label", t("remove_image"));
    rm.textContent = "\u00d7";
    rm.addEventListener("click", (e) => {
      e.preventDefault();
      clearLearnChatVisionAttachment();
    });
    wrap.appendChild(img);
    wrap.appendChild(rm);
    el.appendChild(wrap);
  });
}

/**
 * Resize to max side ~1280px and JPEG re-encode to keep JSON payloads reasonable.
 * @returns {Promise<{ mime: string, base64: string, dataUrl: string }>}
 */
function prepareImageForLearnChat(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Choose an image file (JPEG, PNG, GIF, or WebP)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const url = reader.result;
      if (typeof url !== "string") {
        reject(new Error("Could not read the file."));
        return;
      }
      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        let { width, height } = image;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxSide) / width));
            width = maxSide;
          } else {
            width = Math.max(1, Math.round((width * maxSide) / height));
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not process image."));
              return;
            }
            const fr = new FileReader();
            fr.onload = () => {
              const dataUrl = fr.result;
              if (typeof dataUrl !== "string") {
                reject(new Error("Could not process image."));
                return;
              }
              const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
              if (!m) {
                reject(new Error("Could not process image."));
                return;
              }
              resolve({ mime: m[1], base64: m[2], dataUrl });
            };
            fr.onerror = () => reject(new Error("Could not process image."));
            fr.readAsDataURL(blob);
          },
          "image/jpeg",
          0.88,
        );
      };
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}

function formatChatErrorForUi(err) {
  const msg = err && err.message ? String(err.message) : "Request failed";
  if (/did not match the expected pattern/i.test(msg)) {
    return (
      `${msg}\n\n` +
      "If this persists in Safari, try Chrome or Firefox. Also confirm the app is opened from your dev server (http://localhost:port), not a file:// page. " +
      "Otherwise check server `.env`: HF_MODEL (valid Hub id), HF_CHAT_URL, and HF_API_TOKEN (Inference Providers)."
    );
  }
  return msg;
}

const STARTER_CHIP_LABEL_KEYS = {
  summarize: "chip_summarize",
  quiz: "chip_quiz",
  practice: "chip_practice",
  steps: "chip_steps",
  readAloud: "chip_listen",
  studyPlan: "chip_study_plan",
  simpler: "chip_simpler",
  example: "chip_example",
  studyNext: "chip_study_next",
};

const STARTER_PROMPT_KEYS = {
  summarize: "starter_prompt_summarize",
  quiz: "starter_prompt_quiz",
  steps: "starter_prompt_steps",
  studyPlan: "starter_prompt_study_plan",
  simpler: "starter_prompt_simpler",
  example: "starter_prompt_example",
  studyNext: "starter_prompt_study_next",
};

const NOTEBOOK_STARTER_PROMPT_KEYS = {
  summarize: "starter_prompt_notebook_summarize",
  quiz: "starter_prompt_notebook_quiz",
  steps: "starter_prompt_notebook_steps",
  studyPlan: "starter_prompt_study_plan",
  simpler: "starter_prompt_simpler",
  example: "starter_prompt_example",
};

function analyzeAssistantForFollowups(raw) {
  const text = String(raw || "");
  return {
    hasSteps: /^\s*\d+\.\s/m.test(text),
    isLong: text.length > 900,
    hasCode: /```/.test(text),
    isShort: text.length > 0 && text.length < 280,
  };
}

/**
 * Pick a small set of follow-ups based on the last assistant answer.
 * Always ends with Listen when speech is available in the UI.
 */
function pickSmartFollowupKeys(analysis, scope) {
  const a = analysis || analyzeAssistantForFollowups("");
  const keys = ["simpler", "example", "practice"];
  if (!a.hasSteps) keys.push("steps");
  else if (scope === "notebook") keys.push("studyPlan");
  else keys.push("studyNext");
  if (a.isLong || a.hasCode) keys.push("summarize");
  // Cap content chips, then Listen.
  const content = [];
  for (const key of keys) {
    if (content.includes(key)) continue;
    content.push(key);
    if (content.length >= 4) break;
  }
  content.push("readAloud");
  return content;
}

function renderSmartFollowupChips(container, history, scope) {
  if (!container) return;
  const last = getLastAssistantMarkdownFromHistory(history);
  const analysis = analyzeAssistantForFollowups(last);
  const keys = pickSmartFollowupKeys(analysis, scope);
  const prev = Array.from(container.querySelectorAll(".starter-chip[data-starter]"))
    .map((el) => el.getAttribute("data-starter"))
    .join(",");
  if (prev === keys.join(",") && container.querySelector(".starter-chip")) {
    // Labels may still need i18n refresh.
    container.querySelectorAll(".starter-chip[data-starter]").forEach((chip) => {
      const key = chip.getAttribute("data-starter");
      const labelKey = STARTER_CHIP_LABEL_KEYS[key];
      if (labelKey) chip.textContent = t(labelKey);
    });
    return;
  }
  container.replaceChildren();
  keys.forEach((key) => {
    const labelKey = STARTER_CHIP_LABEL_KEYS[key];
    if (!labelKey) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "starter-chip";
    btn.dataset.starter = key;
    btn.textContent = t(labelKey);
    container.appendChild(btn);
  });
}

function refreshAllSmartFollowupChips() {
  renderSmartFollowupChips(chatFollowupChips, chatHistory, "learn");
  renderSmartFollowupChips(notebookFollowupChips, notebookHistory, "notebook");
}

const EMPTY_PROMPT_SPECS = {
  chat: [
    { label: "empty_chat_1", send: "empty_chat_1_send" },
    { label: "empty_chat_2", send: "empty_chat_2_send" },
    { label: "empty_chat_3", send: "empty_chat_3_send" },
  ],
  code: [
    { label: "empty_code_1", send: "empty_code_1_send" },
    { label: "empty_code_2", send: "empty_code_2_send" },
    { label: "empty_code_3", send: "empty_code_3_send" },
  ],
  notebook: [
    { label: "empty_nb_1", hint: "empty_nb_1_hint" },
    { label: "empty_nb_2", hint: "empty_nb_2_hint" },
    { label: "empty_nb_3", hint: "empty_nb_3_hint" },
  ],
};

/**
 * Starter chips send the prompt immediately (same path as Ask / Send).
 * Optional `customStarters`: map of data-starter key -> handler (runs instead of sending a prompt).
 */
function wireStarterChipsAsSend(container, sendFn, busyButton, customStarters = null, promptKeyMap = null) {
  if (!container || typeof sendFn !== "function") return;
  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".starter-chip[data-starter]");
    if (!chip || !container.contains(chip)) return;
    if (busyButton?.disabled) return;
    const key = chip.getAttribute("data-starter");
    if (customStarters && typeof customStarters[key] === "function") {
      customStarters[key]();
      return;
    }
    const map = promptKeyMap || STARTER_PROMPT_KEYS;
    const promptKey = map[key];
    if (!promptKey) return;
    sendFn(t(promptKey));
  });
}

function stopReadAloud() {
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

function getLastAssistantMarkdownFromHistory(history) {
  if (!Array.isArray(history)) return "";
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m && m.role === "assistant" && typeof m.content === "string") {
      const t = m.content.trim();
      if (t) return m.content;
    }
  }
  return "";
}

/** Read-aloud chip: Web Speech API, last assistant reply only. Tap again while playing to stop. */
function readLastAssistantAloud(history = chatHistory) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    showToast(t("toast_read_aloud_not_supported"));
    return;
  }
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    stopReadAloud();
    showToast(t("toast_stopped"));
    return;
  }
  const raw = getLastAssistantMarkdownFromHistory(history);
  if (!String(raw).trim()) {
    showToast(t("toast_no_assistant_reply"));
    return;
  }
  const { plain } = getAssistantCopyFormats(raw);
  const spoken = String(plain || "").trim();
  if (!spoken) {
    showToast(t("toast_nothing_to_read"));
    return;
  }
  const maxChars = 32000;
  const toSpeak = spoken.length > maxChars ? `${spoken.slice(0, maxChars)}\n\n(Truncated for speech.)` : spoken;
  const u = new SpeechSynthesisUtterance(toSpeak);
  u.rate = 1;
  u.onerror = () => showToast(t("toast_speech_playback_failed"));
  window.speechSynthesis.speak(u);
}

function normalizeStudyMode(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "quiz" ? v : "explain";
}

function defaultPrefs() {
  return {
    restoreSessions: true,
    uiLanguage: "en",
    liveWeb: true,
  };
}

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_PREFS_KEY) || "{}");
    return {
      restoreSessions: parsed.restoreSessions !== false,
      uiLanguage: normalizeUiLanguage(parsed.uiLanguage),
      liveWeb: parsed.liveWeb !== false,
    };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(prefs) {
  localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
}

function guessUiLanguageFromBrowser() {
  const langs = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language || "en"];
  for (const raw of langs) {
    const lower = String(raw || "").toLowerCase();
    const base = lower.split("-")[0];
    if (SUPPORTED_UI_LANGS.includes(base)) return base;
  }
  return "en";
}

function maybeOfferLanguageSuggestion() {
  const dismissed = localStorage.getItem(LANGUAGE_HINT_DISMISSED_KEY) === "1";
  const prefs = loadPrefs();
  if (dismissed || prefs.uiLanguage !== "en") return;
  const guess = guessUiLanguageFromBrowser();
  if (guess === "en") return;
  const ask = `${t("language_hint", { lang: UI_LANG_LABELS[guess] || guess })}\n${t("language_hint_desc")}`;
  const accept = window.confirm(ask);
  if (accept) {
    const next = { ...prefs, uiLanguage: guess };
    savePrefs(next);
    setUiLanguage(guess);
    if (prefUiLanguage) prefUiLanguage.value = guess;
    saveSessionState();
  } else {
    localStorage.setItem(LANGUAGE_HINT_DISMISSED_KEY, "1");
  }
}

function showToast(msg) {
  if (!toastStack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = String(msg || "");
  toastStack.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2600);
}

function beginLearnVoiceSession(stopFn) {
  const prev = learnVoiceGlobalStop;
  learnVoiceGlobalStop = stopFn;
  prev?.();
}

function endLearnVoiceSessionIfCurrent(stopFn) {
  if (learnVoiceGlobalStop === stopFn) learnVoiceGlobalStop = null;
}

function stopAllLearnVoice() {
  const cur = learnVoiceGlobalStop;
  learnVoiceGlobalStop = null;
  cur?.();
}

/**
 * Wire a Learn (Ask) mic: tap to start, tap again or pause after speech to stop; then auto-submit like the primary button when non-empty.
 * @param {{ micBtn: HTMLElement | null, inputEl: HTMLTextAreaElement | null, submitBtn: HTMLElement | null }} p
 */
function wireLearnVoiceMic({ micBtn, inputEl, submitBtn } = {}) {
  if (!micBtn || !inputEl || !submitBtn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    micBtn.disabled = true;
    micBtn.title = t("voice_not_supported");
    return;
  }

  let rec = null;
  let listening = false;
  let savedInput = "";
  let abandon = false;
  let silenceTimer = null;
  let myEpoch = 0;

  const clearSilence = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const armSilenceAfterSpeech = (transcriptSoFar) => {
    if (!String(transcriptSoFar || "").trim()) return;
    clearSilence();
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
    }, LEARN_VOICE_SILENCE_MS);
  };

  const setMicUi = (on) => {
    micBtn.classList.toggle("learn-hero-mic-btn--active", !!on);
    micBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      submitBtn.dataset.learnVoiceHold = submitBtn.disabled ? "1" : "";
      if (!submitBtn.disabled) submitBtn.disabled = true;
    } else {
      if (submitBtn.dataset.learnVoiceHold !== "1") submitBtn.disabled = false;
      delete submitBtn.dataset.learnVoiceHold;
    }
  };

  const stopSelf = () => {
    if (!listening) return;
    abandon = true;
    clearSilence();
    try {
      rec?.stop();
    } catch {
      /* ignore */
    }
  };

  const onRecognitionEnd = () => {
    clearSilence();
    rec = null;
    const wasListening = listening;
    listening = false;
    if (!wasListening) return;

    const epochStale = myEpoch !== learnVoiceEpoch;
    if (epochStale) {
      if (abandon && inputEl) inputEl.value = savedInput;
      abandon = false;
      setMicUi(false);
      endLearnVoiceSessionIfCurrent(stopSelf);
      return;
    }

    setMicUi(false);
    endLearnVoiceSessionIfCurrent(stopSelf);

    if (abandon) {
      abandon = false;
      if (inputEl) inputEl.value = savedInput;
      return;
    }

    const text = (inputEl.value || "").trim();
    if (text) {
      submitBtn.click();
    } else {
      if (inputEl) inputEl.value = savedInput;
      showToast(t("toast_no_speech"));
    }
  };

  micBtn.addEventListener("click", () => {
    if (!listening) {
      beginLearnVoiceSession(stopSelf);
      savedInput = inputEl.value || "";
      abandon = false;
      const r = new SR();
      rec = r;
      r.continuous = true;
      r.interimResults = true;
      r.lang = document.documentElement.lang || "en-US";

      r.onresult = (ev) => {
        let t = "";
        for (let i = 0; i < ev.results.length; i++) {
          t += ev.results[i][0]?.transcript || "";
        }
        inputEl.value = t.replace(/^\s+/, "");
        armSilenceAfterSpeech(inputEl.value);
      };

      r.onerror = (ev) => {
        const err = ev.error || "";
        if (err === "aborted") return;
        if (err === "not-allowed") {
          showToast(t("toast_mic_permission_denied"));
        } else if (err === "no-speech") {
          showToast(t("toast_no_speech"));
        } else {
          showToast(t("toast_voice_failed"));
        }
        abandon = true;
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      };

      r.onend = () => {
        onRecognitionEnd();
      };

      try {
        listening = true;
        setMicUi(true);
        r.start();
        learnVoiceEpoch += 1;
        myEpoch = learnVoiceEpoch;
      } catch {
        listening = false;
        rec = null;
        setMicUi(false);
        endLearnVoiceSessionIfCurrent(stopSelf);
        showToast(t("toast_voice_start_failed"));
      }
    } else {
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
    }
  });
}

function saveSessionState() {
  try {
    const chatOut = LEARN_VISION_ENABLED
      ? chatHistory
      : chatHistory.map((m) => {
          if (!m || typeof m !== "object") return m;
          const { imageBase64, imageMime, ...rest } = m;
          return rest;
        });
    const payload = {
      chatHistory: chatOut,
      codeHistory,
      notebookHistory,
      chatSessionOpen,
      codeSessionOpen,
      notebookSessionOpen,
      notebookDocumentContext,
      notebookSourceMeta,
    };
    localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota issues */
  }
  syncHubResumeButton();
}

function renderThreadFromHistory(container, history, mode, studyMode) {
  if (!container) return;
  container.innerHTML = "";
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    const content = String(item.content || "");
    let imageDataUrl;
    if (LEARN_VISION_ENABLED && role === "user" && item.imageMime && item.imageBase64) {
      imageDataUrl = `data:${item.imageMime};base64,${item.imageBase64}`;
    }
    const row = appendBubble(container, role, content, { mode, studyMode, imageDataUrl });
    if (role === "assistant" && item.sources) mountBubbleSources(row.bubble, item.sources);
  }
}

function restoreSessionStateIfEnabled() {
  const prefs = loadPrefs();
  if (!prefs.restoreSessions) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_SESSION_KEY) || "{}");
    if (Array.isArray(parsed.chatHistory)) {
      chatHistory.splice(
        0,
        chatHistory.length,
        ...parsed.chatHistory.filter(
          (x) =>
            x &&
            typeof x.content === "string" &&
            (x.content.trim().length > 0 || (typeof x.imageBase64 === "string" && x.imageBase64.length > 40 && x.imageMime)),
        ),
      );
      if (!LEARN_VISION_ENABLED) {
        chatHistory.forEach((m) => {
          if (!m || typeof m !== "object") return;
          delete m.imageBase64;
          delete m.imageMime;
        });
      }
    }
    if (Array.isArray(parsed.codeHistory)) {
      codeHistory.splice(0, codeHistory.length, ...parsed.codeHistory.filter((x) => x && typeof x.content === "string"));
    }
    if (Array.isArray(parsed.notebookHistory)) {
      notebookHistory.splice(
        0,
        notebookHistory.length,
        ...parsed.notebookHistory.filter((x) => x && typeof x.content === "string"),
      );
    }
    notebookDocumentContext =
      typeof parsed.notebookDocumentContext === "string" ? parsed.notebookDocumentContext : "";
    notebookSourceMeta = Array.isArray(parsed.notebookSourceMeta)
      ? parsed.notebookSourceMeta
          .filter((s) => s && typeof s.name === "string")
          .map((s) => ({ name: s.name, chars: Number(s.chars) || 0 }))
      : [];
    chatSessionOpen = parsed.chatSessionOpen === true || chatHistory.length > 0;
    codeSessionOpen = parsed.codeSessionOpen === true || codeHistory.length > 0;
    notebookSessionOpen =
      parsed.notebookSessionOpen === true ||
      notebookHistory.length > 0 ||
      Boolean(notebookDocumentContext);
    renderThreadFromHistory(chatThread, chatHistory, "learn", "explain");
    renderThreadFromHistory(codeThread, codeHistory, "code", "explain");
    renderThreadFromHistory(notebookThread, notebookHistory, "notebook", "explain");
  } catch {
    /* ignore malformed storage */
  }
}

function initMarkdown() {
  if (typeof marked === "undefined") return;
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
  });
}

/**
 * Polish model Markdown for a Perplexity-like reading experience.
 * Keep structural Markdown for marked (headings/lists/code), strip decorative clutter.
 */
function polishModelMarkdown(text) {
  let s = String(text ?? "").replace(/\r\n/g, "\n");
  if (!s.trim()) return "";

  const fences = [];
  s = s.replace(/```[\s\S]*?```/g, (block) => {
    const key = `@@CODEFENCE${fences.length}@@`;
    fences.push(block);
    return key;
  });

  s = s.replace(
    /(^|\n)\s*\*\*\s*(?:step\s*)?(\d{1,2})\s*[:.)\-]\s*(.+?)\s*\*\*(?=\s|$)/gim,
    "$1$2. $3",
  );
  s = s.replace(/(^|\n)\s*\*\*\s*step\s*(\d{1,2})\s*\*\*\s*:?\s*/gim, "$1$2. ");
  s = s.replace(/(^|\n)\s*step\s*(\d{1,2})\s*[:.)\-]\s*/gim, "$1$2. ");
  s = s.replace(/(^|\n)(#{1,6})\s*\*\*(.+?)\*\*\s*(?=\n|$)/g, "$1$2 $3");

  s = s.replace(/\*\*\*([^*\n]+?)\*\*\*/g, "$1");
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  s = s.replace(/__([^_\n]+?)__/g, "$1");
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/\*{2,}/g, "");
  s = s.replace(/#{4,}/g, "##");

  s = s.replace(/(^|\n)\s*[\u2022\u00b7]\s+/g, "$1- ");
  s = s.replace(/(^|\n)\s*[*+]\s+/g, "$1- ");
  s = s.replace(/(^|\n)\s*-{3,}\s*(?=\n|$)/g, "$1");
  s = s.replace(/<\/?[^>]+>/g, "");

  fences.forEach((block, i) => {
    s = s.replace(`@@CODEFENCE${i}@@`, block);
  });

  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeAssistantMarkdown(text) {
  return polishModelMarkdown(text);
}

/**
 * Streaming display: never show raw # or * markdown chrome.
 * Keep ASCII-only list markers so encoding issues never show "?" for bullets.
 */
function streamingPlainFromMarkdown(text) {
  let s = polishModelMarkdown(text);
  if (!s) return "";
  // Drop replacement chars from bad encodings / partial UTF-8.
  s = s.replace(/\uFFFD/g, "");

  const fences = [];
  s = s.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trim();
    const key = `@@CODEFENCE${fences.length}@@`;
    fences.push(inner);
    return key;
  });
  // Hide an unfinished fence while tokens are still arriving.
  s = s.replace(/```[\s\S]*$/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, "").trim();
    return inner ? `\n${inner}` : "";
  });

  s = s.replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1");
  s = s.replace(/(^|\n)\s*[-*+]\s+/g, "$1- ");
  // Only strip leftover emphasis runs, not math like 2 * 3.
  s = s.replace(/\*{2,}/g, "");
  s = s.replace(/(^|\n)\s*#+\s*/g, "$1");
  // Lone emphasis markers left by partial tokens.
  s = s.replace(/(^|[\s(])[*_]{1,2}(?=[\s).,!?:;]|$)/g, "$1");

  fences.forEach((block, i) => {
    s = s.replace(`@@CODEFENCE${i}@@`, block);
  });

  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeCopyPlain(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Readable plain text from sanitized HTML (no markdown #, *, etc.). */
function htmlToCleanPlain(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return normalizeCopyPlain(div.innerText || div.textContent || "");
}

/**
 * Plain text + optional HTML for clipboard. Plain is always clean for pasting into notes/email.
 * @returns {{ plain: string, html?: string }}
 */
function getAssistantCopyFormats(markdownRaw) {
  const rendered = renderAssistantHtml(markdownRaw);
  if ("html" in rendered) {
    return { plain: htmlToCleanPlain(rendered.html), html: rendered.html };
  }
  if (typeof marked !== "undefined") {
    try {
      const html = marked.parse(String(rendered.plain));
      const safe =
        typeof DOMPurify !== "undefined"
          ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
          : html;
      return { plain: htmlToCleanPlain(safe), html: safe };
    } catch {
      /* fall through */
    }
  }
  return { plain: normalizeCopyPlain(rendered.plain) };
}

async function copyPlainText(text) {
  const value = String(text);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatThreadPlainText(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  const blocks = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    const label = role === "assistant" ? t("assistant") : t("you");
    let body = String(item.content || "").trim();
    if (role === "assistant" && body) {
      body = getAssistantCopyFormats(body).plain;
    } else if (role === "user" && !body && item.imageBase64) {
      body = t("attached_image");
    }
    if (!body) continue;
    blocks.push(`${label}:\n${body}`);
  }
  return blocks.join("\n\n");
}

async function copyThreadHistory(history) {
  const text = formatThreadPlainText(history);
  if (!text.trim()) {
    showToast(t("toast_thread_empty"));
    return false;
  }
  const ok = await copyPlainText(text);
  showToast(ok ? t("toast_thread_copied") : t("status_failed"));
  return ok;
}

function enhanceMarkdownCodeBlocks(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll(".bubble-md pre").forEach((pre) => {
    if (pre.closest(".code-block-wrap")) return;
    const codeEl = pre.querySelector("code");
    const text = (codeEl || pre).innerText || "";
    if (!String(text).trim()) return;

    const wrap = document.createElement("div");
    wrap.className = "code-block-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-block-copy";
    btn.textContent = t("copy_code");
    btn.setAttribute("aria-label", t("copy_code_aria"));
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ok = await copyPlainText(text);
      const prev = btn.textContent;
      btn.textContent = ok ? t("copied") : t("status_failed");
      setTimeout(() => {
        btn.textContent = prev;
      }, 2000);
    });
    wrap.appendChild(btn);
  });
}

/** Copy assistant reply: clean plain text; rich HTML too when the browser supports it. */
async function copyAssistantOutput(markdownRaw) {
  const { plain, html } = getAssistantCopyFormats(markdownRaw);
  try {
    if (html && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      const htmlDoc = `<!DOCTYPE html><html><body>${html}</body></html>`;
      // WebKit (Safari) often expects Promise<Blob> entries; bare Blobs can throw
      // "The string did not match the expected pattern."
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": Promise.resolve(new Blob([plain], { type: "text/plain;charset=utf-8" })),
          "text/html": Promise.resolve(new Blob([htmlDoc], { type: "text/html;charset=utf-8" })),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through */
  }
  return copyPlainText(plain);
}

/** @returns {{ html: string } | { plain: string }} */
function renderAssistantHtml(text) {
  const raw = polishModelMarkdown(text);
  if (!raw) return { plain: "" };
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    return { plain: streamingPlainFromMarkdown(raw) };
  }
  try {
    const html = marked.parse(raw);
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    if (!String(clean || "").trim()) {
      return { plain: streamingPlainFromMarkdown(raw) };
    }
    return { html: clean };
  } catch {
    return { plain: streamingPlainFromMarkdown(raw) };
  }
}

function setMainTab(next) {
  mainTab =
    next === "code"
      ? "code"
      : next === "notebook"
        ? "notebook"
        : next === "practice"
          ? "practice"
          : "chat";
  if (mainTab !== "chat") stopAllLearnVoice();
  if (mainTab !== "chat") stopReadAloud();
  if (LEARN_VISION_ENABLED && mainTab !== "chat") clearLearnChatVisionAttachment();
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === mainTab);
  });
  panelChat.classList.toggle("hidden", mainTab !== "chat");
  panelCode.classList.toggle("hidden", mainTab !== "code");
  panelNotebook.classList.toggle("hidden", mainTab !== "notebook");
  panelPractice?.classList.toggle("hidden", mainTab !== "practice");
  if (mainTab === "notebook") {
    syncNotebookAnalyzeVisibility();
    syncNotebookLayout();
  }
  if (mainTab === "practice") {
    syncPracticeEmptyActions();
  }
}

function syncLearnLayout() {
  const showThread = chatSessionOpen || chatHistory.length > 0;
  chatSearchShell.classList.toggle("hidden", showThread);
  chatAnswerShell.classList.toggle("hidden", !showThread);
  chatCopyThreadBtn?.classList.toggle("hidden", chatHistory.length === 0);
  if (showThread) renderSmartFollowupChips(chatFollowupChips, chatHistory, "learn");
}

function syncCodeLayout() {
  const showThread = codeSessionOpen || codeHistory.length > 0;
  codeSearchShell.classList.toggle("hidden", showThread);
  codeAnswerShell.classList.toggle("hidden", !showThread);
  codeCopyThreadBtn?.classList.toggle("hidden", codeHistory.length === 0);
}

function syncNotebookLayout() {
  const showThread = notebookSessionOpen || notebookHistory.length > 0;
  notebookEmptyPrompts?.classList.toggle("hidden", showThread);
  notebookAnswerShell?.classList.toggle("hidden", !showThread);
  notebookCopyThreadBtn?.classList.toggle("hidden", notebookHistory.length === 0);
  if (notebookActiveSources) {
    const names = notebookSourceMeta.map((s) => s.name).filter(Boolean);
    notebookActiveSources.textContent = names.length
      ? t("notebook_active_sources", { names: names.join(", ") })
      : "";
  }
  // Keep dropzone available so students can add/replace sources after a session starts.
  if (notebookEmptyState) notebookEmptyState.classList.toggle("notebook-empty--compact", showThread);
  if (showThread) renderSmartFollowupChips(notebookFollowupChips, notebookHistory, "notebook");
}

function wireAssistantCopy(bubble, rawText) {
  const btn = bubble.querySelector(".bubble-copy");
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  /* Streaming UI leaves Copy disabled; cloneNode copies that, which blocks clicks. */
  fresh.disabled = false;
  fresh.removeAttribute("disabled");
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyAssistantOutput(rawText);
    const prev = fresh.textContent;
    fresh.textContent = ok ? t("copied") : t("status_failed");
    setTimeout(() => {
      fresh.textContent = prev;
    }, 2000);
  });
}

async function submitAssistantFeedback(payload) {
  const res = await fetchAuthed("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || "Could not submit feedback.");
  }
  return data || { ok: true };
}

function mountAssistantFeedback(bubble, rawText) {
  bubble.querySelectorAll(".assistant-feedback").forEach((el) => el.remove());
  const mode = bubble.dataset.mode || "learn";
  const studyMode = bubble.dataset.studyMode || "explain";

  const wrap = document.createElement("div");
  wrap.className = "assistant-feedback";
  const prompt = document.createElement("span");
  prompt.className = "assistant-feedback-label";
  prompt.textContent = t("feedback_prompt");
  const up = document.createElement("button");
  up.type = "button";
  up.className = "assistant-feedback-btn";
  up.textContent = t("feedback_helpful");
  const down = document.createElement("button");
  down.type = "button";
  down.className = "assistant-feedback-btn";
  down.textContent = t("feedback_not_helpful");
  const status = document.createElement("span");
  status.className = "assistant-feedback-status";
  wrap.appendChild(prompt);
  wrap.appendChild(up);
  wrap.appendChild(down);
  wrap.appendChild(status);

  const reasons = document.createElement("div");
  reasons.className = "assistant-feedback-reasons hidden";
  reasons.innerHTML = FEEDBACK_REASONS.map((r) => {
    const label = t(`reason_${r}`) || r.replace(/_/g, " ");
    return `<button type="button" class="assistant-feedback-reason" data-reason="${r}">${label}</button>`;
  }).join("");
  wrap.appendChild(reasons);
  bubble.appendChild(wrap);

  const lock = (txt) => {
    up.disabled = true;
    down.disabled = true;
    reasons.querySelectorAll("button").forEach((b) => (b.disabled = true));
    status.textContent = txt;
  };

  up.addEventListener("click", async () => {
    up.disabled = true;
    down.disabled = true;
    try {
      const result = await submitAssistantFeedback({
        type: "message_feedback",
        rating: 1,
        reason: "helpful",
        mode,
        studyMode,
        assistantMessage: String(rawText || "").slice(0, 8000),
        createdAt: new Date().toISOString(),
      });
      if (result?.stored === "supabase") {
        lock(t("feedback_thanks"));
      } else {
        lock(`${t("feedback_thanks")} (${result?.stored || "file"})`);
        if (result?.warning) {
          try {
            console.warn("[feedback]", result.warning);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      status.textContent = e.message || t("status_failed");
      up.disabled = false;
      down.disabled = false;
    }
  });

  down.addEventListener("click", () => {
    reasons.classList.remove("hidden");
    status.textContent = t("feedback_select_reason");
  });

  reasons.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-reason]");
    if (!btn || !reasons.contains(btn)) return;
    const reason = btn.getAttribute("data-reason") || "other";
    try {
      const result = await submitAssistantFeedback({
        type: "message_feedback",
        rating: -1,
        reason,
        mode,
        studyMode,
        assistantMessage: String(rawText || "").slice(0, 8000),
        createdAt: new Date().toISOString(),
      });
      if (result?.stored === "supabase") {
        lock(t("feedback_thanks_reason"));
      } else {
        lock(`${t("feedback_thanks_reason")} (${result?.stored || "file"})`);
        if (result?.warning) {
          try {
            console.warn("[feedback]", result.warning);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e2) {
      status.textContent = e2.message || t("status_failed");
    }
  });
}

function fillAssistantBubbleBody(bubble, text) {
  bubble.querySelectorAll(".bubble-text").forEach((el) => el.remove());
  const rendered = renderAssistantHtml(text);
  if ("plain" in rendered) {
    const pre = document.createElement("pre");
    pre.className = "bubble-text";
    pre.textContent = rendered.plain;
    bubble.appendChild(pre);
  } else {
    const body = document.createElement("div");
    body.className = "bubble-text bubble-md";
    body.innerHTML = rendered.html;
    bubble.appendChild(body);
    enhanceMarkdownCodeBlocks(body);
  }
  wireAssistantCopy(bubble, text);
  mountAssistantFeedback(bubble, text);
}

/** @returns {{ wrap: HTMLDivElement, bubble: HTMLDivElement }} */
function appendBubble(container, role, text, meta = {}) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (meta && typeof meta === "object") {
    if (meta.mode) bubble.dataset.mode = String(meta.mode);
    if (meta.studyMode) bubble.dataset.studyMode = String(meta.studyMode);
  }

  if (role === "user") {
    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = t("you");
    bubble.appendChild(label);
    if (meta.imageDataUrl) {
      const fig = document.createElement("div");
      fig.className = "bubble-user-image";
      const img = document.createElement("img");
      img.src = meta.imageDataUrl;
      img.alt = "Attached";
      img.loading = "lazy";
      img.decoding = "async";
      fig.appendChild(img);
      bubble.appendChild(fig);
    }
    const trimmed = String(text || "").trim();
    if (trimmed) {
      const pre = document.createElement("pre");
      pre.className = "bubble-text";
      pre.textContent = text;
      bubble.appendChild(pre);
    } else if (meta.imageDataUrl) {
      const cap = document.createElement("p");
      cap.className = "bubble-text muted";
      cap.style.margin = "0";
      cap.style.fontSize = "13px";
      cap.textContent = t("attached_image");
      bubble.appendChild(cap);
    }
  } else {
    const head = document.createElement("div");
    head.className = "bubble-head";
    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = t("assistant");
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "bubble-copy";
    copyBtn.setAttribute("aria-label", t("copy_assistant_aria"));
    copyBtn.textContent = t("copy");
    head.appendChild(label);
    head.appendChild(copyBtn);
    bubble.appendChild(head);
    fillAssistantBubbleBody(bubble, text);
  }

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return { wrap, bubble };
}

/**
 * Assistant row while streaming: incremental markdown (Perplexity-style readable text),
 * then the same pipeline on finalize plus copy + feedback.
 */
function startStreamingAssistantBubble(container) {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble bubble--streaming";

  const head = document.createElement("div");
  head.className = "bubble-head";
  const label = document.createElement("div");
  label.className = "bubble-label";
  label.textContent = t("assistant");
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "bubble-copy";
  copyBtn.setAttribute("aria-label", t("copy_assistant_aria"));
  copyBtn.textContent = t("copy");
  copyBtn.disabled = true;
  head.appendChild(label);
  head.appendChild(copyBtn);
  bubble.appendChild(head);

  const body = document.createElement("div");
  body.className = "bubble-text bubble-md bubble-md--streaming";
  body.setAttribute("aria-busy", "true");
  bubble.appendChild(body);
  wrap.appendChild(bubble);
  container.appendChild(wrap);

  const scroll = () => {
    container.scrollTop = container.scrollHeight;
  };

  return {
    /**
     * @param {string} text
     * @param {{ plain?: boolean }} opts  use plain: true for non-markdown system messages only
     */
    setStreamingText(text, { plain = false } = {}) {
      const raw = String(text ?? "");
      if (plain || typeof marked === "undefined" || typeof DOMPurify === "undefined") {
        // Caller already runs streamingPlainFromMarkdown when plain streaming;
        // only re-strip if raw markdown markers are still present.
        body.textContent = /[*#`]/.test(raw) ? streamingPlainFromMarkdown(raw) : raw.replace(/\uFFFD/g, "");
        scroll();
        return;
      }
      const rendered = renderAssistantHtml(raw);
      if ("plain" in rendered) {
        body.textContent = rendered.plain;
      } else {
        body.innerHTML = rendered.html;
      }
      scroll();
    },
    finalize(markdownRaw) {
      body.remove();
      fillAssistantBubbleBody(bubble, markdownRaw);
      scroll();
    },
    showError(markdownRaw) {
      body.remove();
      fillAssistantBubbleBody(bubble, markdownRaw);
      scroll();
    },
    remove() {
      wrap.remove();
    },
    wrap,
    bubble,
  };
}

/**
 * OpenAI-compatible `choices[].delta`: `content` string or parts; some HF / reasoning models use
 * `reasoning_content`, `text`, or `input_text` instead of (or before) `content`.
 */
function extractChatDeltaText(delta) {
  if (!delta || typeof delta !== "object") return "";
  const bits = [];
  const reasoning = delta.reasoning_content;
  if (typeof reasoning === "string" && reasoning.length) bits.push(reasoning);
  const c = delta.content;
  if (typeof c === "string" && c.length) bits.push(c);
  else if (Array.isArray(c)) {
    for (const part of c) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string") bits.push(part.text);
      if (part.type === "input_text" && typeof part.text === "string") bits.push(part.text);
    }
  }
  const legacy = delta.text;
  if (typeof legacy === "string" && legacy.length) bits.push(legacy);
  const inputText = delta.input_text;
  if (typeof inputText === "string" && inputText.length) bits.push(inputText);
  return bits.join("");
}

/** Some proxies put assistant text on `choices[].text` or `choices[].message` instead of `delta`. */
function extractStreamChoiceText(choice) {
  if (!choice || typeof choice !== "object") return "";
  const fromDelta = extractChatDeltaText(choice.delta);
  if (fromDelta.length) return fromDelta;
  if (typeof choice.text === "string" && choice.text.length) return choice.text;
  const msg = choice.message;
  if (msg && typeof msg.content === "string" && msg.content.length) return msg.content;
  return "";
}

function applyStreamDelta(json, full, onDelta) {
  const err = json.error;
  if (err) {
    const msg = typeof err === "string" ? err : err.message || JSON.stringify(err);
    throw new Error(msg);
  }
  const piece = extractStreamChoiceText(json.choices?.[0]);
  if (piece.length === 0) return full;
  const next = full + piece;
  onDelta(next);
  return next;
}


let liveWebServerConfigured = null;

async function refreshLiveWebCapability() {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    if (!res.ok) return;
    const data = await res.json();
    liveWebServerConfigured = Boolean(data?.liveWebConfigured);
    syncLiveWebToggleUi();
  } catch {
    /* ignore */
  }
}

function setLiveWebSearching(on) {
  const btn = document.getElementById("liveWebToggle");
  if (!btn) return;
  btn.classList.toggle("is-searching", Boolean(on) && isLiveWebEnabled());
}

function syncHubResumeButton() {
  const btn = document.getElementById("hubResumeStudent");
  if (!btn) return;
  const hasHistory = Array.isArray(chatHistory) && chatHistory.length > 0;
  btn.classList.toggle("hidden", !hasHistory);
  btn.textContent = t("resume_student");
}

function isLiveWebEnabled() {
  return loadPrefs().liveWeb !== false;
}

function syncLiveWebToggleUi() {
  const btn = document.getElementById("liveWebToggle");
  const hint = document.getElementById("liveWebHint");
  const label = document.getElementById("liveWebToggleLabel");
  const follow = document.getElementById("liveWebFollowHint");
  const on = isLiveWebEnabled();
  if (btn) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-unavailable", liveWebServerConfigured === false);
    btn.title =
      liveWebServerConfigured === false
        ? t("live_web_unavailable")
        : t(on ? "live_web_hint" : "live_web_hint_off");
  }
  if (label) label.textContent = t("live_web_label");
  if (hint) {
    hint.textContent =
      liveWebServerConfigured === false
        ? t("live_web_unavailable")
        : t(on ? "live_web_hint" : "live_web_hint_off");
  }
  if (follow) {
    follow.textContent = on ? t("live_web_label") : "";
    follow.hidden = !on;
  }
}

function setLiveWebEnabled(next) {
  const prefs = loadPrefs();
  prefs.liveWeb = Boolean(next);
  savePrefs(prefs);
  syncLiveWebToggleUi();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeSources(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, i) => {
      if (!s || typeof s !== "object") return null;
      const url = String(s.url || "").trim();
      if (!url) return null;
      return {
        title: String(s.title || url).trim().slice(0, 160),
        url,
        snippet: String(s.snippet || "").trim().slice(0, 420),
        index: i + 1,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function mountBubbleSources(bubble, sources) {
  if (!bubble) return;
  bubble.querySelectorAll(".bubble-sources").forEach((el) => el.remove());
  const list = normalizeSources(sources);
  if (!list.length) return;
  const wrap = document.createElement("div");
  wrap.className = "bubble-sources";
  const label = document.createElement("p");
  label.className = "bubble-sources-label";
  label.textContent = t("sources_label");
  const ul = document.createElement("ul");
  ul.className = "bubble-sources-list";
  list.forEach((s) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "bubble-source-link";
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const num = document.createElement("span");
    num.className = "bubble-source-num";
    num.textContent = `[${s.index}]`;
    const copy = document.createElement("span");
    copy.className = "bubble-source-copy";
    const title = document.createElement("span");
    title.className = "bubble-source-title";
    title.textContent = s.title;
    const host = document.createElement("span");
    host.className = "bubble-source-host";
    host.textContent = hostFromUrl(s.url) || s.url;
    copy.appendChild(title);
    copy.appendChild(host);
    a.appendChild(num);
    a.appendChild(copy);
    li.appendChild(a);
    ul.appendChild(li);
  });
  wrap.appendChild(label);
  wrap.appendChild(ul);
  bubble.appendChild(wrap);
}

/**
 * Reads OpenAI-style SSE from /api/chat (stream: true). Invokes onDelta with the full text so far.
 * @returns {Promise<{ text: string, sources: Array }>}
 */
async function consumeChatSseStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let lineBuf = "";
  let full = "";
  let sources = [];
  const handlePayload = (json) => {
    if (json && json.studentAiMeta && Array.isArray(json.studentAiMeta.sources)) {
      sources = normalizeSources(json.studentAiMeta.sources);
      return;
    }
    full = applyStreamDelta(json, full, onDelta);
  };
  const consumeLines = () => {
    let nl;
    while ((nl = lineBuf.indexOf("\n")) >= 0) {
      const rawLine = lineBuf.slice(0, nl);
      lineBuf = lineBuf.slice(nl + 1);
      const line = rawLine.replace(/\r$/, "");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).replace(/^\s*/, "");
      if (!payload || payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      handlePayload(json);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
    consumeLines();
  }
  // Flush any buffered multibyte UTF-8 sequence at end of stream.
  lineBuf += decoder.decode();
  consumeLines();
  if (lineBuf.trim()) {
    const line = lineBuf.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      const payload = line.slice(5).replace(/^\s*/, "");
      if (payload && payload !== "[DONE]") {
        try {
          handlePayload(JSON.parse(payload));
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    }
  }
  return { text: full, sources };
}



/** @returns {Promise<boolean>} true if the exchange completed without a client-side failure. */
async function sendChatMessage(mode, message, history, threadEl, statusEl, sendBtn, studyMode = "explain", visionAttachment = null) {
  stopReadAloud();
  const attach = LEARN_VISION_ENABLED ? visionAttachment : null;
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed && !attach) return false;
  if (mode === "notebook" && !notebookDocumentContext) {
    showToast(t("toast_analyze_first"));
    return false;
  }

  appendBubble(threadEl, "user", trimmed, { imageDataUrl: attach?.dataUrl });

  const historyForApi =
    mode === "learn" && LEARN_VISION_ENABLED
      ? history.map((m) => {
          if (!m || typeof m !== "object") return { role: "user", content: "" };
          const o = { role: m.role, content: typeof m.content === "string" ? m.content : "" };
          if (m.role === "user" && m.imageMime && m.imageBase64) {
            o.imageMime = m.imageMime;
            o.imageBase64 = m.imageBase64;
          }
          return o;
        })
      : history.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "",
        }));

  const chatBody = {
    mode,
    message: trimmed,
    history: historyForApi,
    studyMode: normalizeStudyMode(studyMode),
    uiLanguage: activeUiLanguage,
    stream: true,
  };
  if (mode === "learn" && isLiveWebEnabled()) {
    chatBody.liveWeb = true;
  }
  if (mode === "learn" && attach) {
    chatBody.imageBase64 = attach.base64;
    chatBody.imageMime = attach.mime;
  }
  if (mode === "notebook") {
    if (!notebookDocumentContext) {
      showToast(t("toast_analyze_first"));
      return false;
    }
    chatBody.documentContext = notebookDocumentContext;
  }

  sendBtn.disabled = true;
  setStatus(statusEl, "status_generating");

  const streamUi = startStreamingAssistantBubble(threadEl);
  streamUi.bubble.dataset.mode = mode;
  streamUi.bubble.dataset.studyMode = normalizeStudyMode(studyMode);
  /** Stream as clean plain text (no raw **), then finalize to HTML. Avoids half-bold asterisk flicker. */
  const safariStream = isSafariWebKit();
  const STREAM_MD_MIN_MS = safariStream ? 180 : 70;
  const streamPlainWhileTyping = true;
  let rafId = 0;
  let throttleTimer = 0;
  let pendingFull = "";
  let sawFirstDelta = false;
  let lastStreamPaintAt = 0;

  const cancelStreamPaintTimers = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = 0;
    }
  };

  const paintPendingMarkdown = () => {
    const visible = streamPlainWhileTyping ? streamingPlainFromMarkdown(pendingFull) : pendingFull;
    streamUi.setStreamingText(visible, { plain: streamPlainWhileTyping });
    lastStreamPaintAt = Date.now();
  };

  const runScheduledPaint = () => {
    rafId = 0;
    const now = Date.now();
    if (now - lastStreamPaintAt >= STREAM_MD_MIN_MS) {
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = 0;
      }
      paintPendingMarkdown();
      return;
    }
    if (!throttleTimer) {
      throttleTimer = window.setTimeout(() => {
        throttleTimer = 0;
        paintPendingMarkdown();
      }, STREAM_MD_MIN_MS - (now - lastStreamPaintAt));
    }
  };

  const scheduleDelta = (full) => {
    pendingFull = full;
    if (!sawFirstDelta && String(full || "").length > 0) {
      sawFirstDelta = true;
      setStatus(statusEl, "status_streaming");
      paintPendingMarkdown();
      return;
    }
    if (rafId || throttleTimer) return;
    rafId = requestAnimationFrame(runScheduledPaint);
  };

  try {
    if (mode === "learn" && isLiveWebEnabled()) {
      setLiveWebSearching(true);
      setStatus(statusEl, "status_searching_web");
    }
    const response = await fetchAuthed("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatBody),
    });

    const ct = (response.headers.get("content-type") || "").toLowerCase();

    if (!response.ok) {
      streamUi.remove();
      if (ct.includes("application/json")) {
        const data = await response.json();
        throw new Error(data.error || "Request failed");
      }
      throw new Error(`Request failed (${response.status})`);
    }

    if (!response.body || !ct.includes("text/event-stream")) {
      streamUi.remove();
      let output = t("no_response");
      let jsonSources = [];
      try {
        const data = await response.json();
        output = typeof data.output === "string" && data.output.trim() ? data.output.trim() : output;
        jsonSources = normalizeSources(data.sources);
      } catch {
        try {
          const rawText = await response.text();
          if (rawText.trim()) output = rawText.trim().slice(0, 2000);
        } catch {
          /* keep default */
        }
      }
      const assistantBubble = appendBubble(threadEl, "assistant", output, { mode, studyMode: normalizeStudyMode(studyMode) });
      if (jsonSources.length) mountBubbleSources(assistantBubble.bubble, jsonSources);
      const userRow = { role: "user", content: trimmed };
      if (attach) {
        userRow.imageMime = attach.mime;
        userRow.imageBase64 = attach.base64;
      }
      history.push(userRow);
      const assistantRow = { role: "assistant", content: output };
      if (jsonSources.length) assistantRow.sources = jsonSources;
      history.push(assistantRow);
      saveSessionState();
      if (mode === "learn") syncLearnLayout();
      else if (mode === "code") syncCodeLayout();
      else if (mode === "notebook") syncNotebookLayout();
      setStatus(statusEl, "status_ready");
      if (mode === "learn") renderSmartFollowupChips(chatFollowupChips, history, "learn");
      if (mode === "notebook") renderSmartFollowupChips(notebookFollowupChips, history, "notebook");
      return true;
    }

    const streamResult = await consumeChatSseStream(response, scheduleDelta);
    const fullOut = streamResult?.text || "";
    const streamSources = normalizeSources(streamResult?.sources);
    setLiveWebSearching(false);

    cancelStreamPaintTimers();

    const finalText =
      String(fullOut || "").trim() ||
      t("stream_empty_fallback");
    const streamPlainOnly = !String(fullOut || "").trim();
    streamUi.setStreamingText(finalText, { plain: streamPlainOnly });
    streamUi.finalize(finalText);
    if (streamSources.length) mountBubbleSources(streamUi.bubble, streamSources);

    const userRow = { role: "user", content: trimmed };
    if (attach) {
      userRow.imageMime = attach.mime;
      userRow.imageBase64 = attach.base64;
    }
    history.push(userRow);
    const assistantRow = { role: "assistant", content: finalText };
    if (streamSources.length) assistantRow.sources = streamSources;
    history.push(assistantRow);
    saveSessionState();
    if (mode === "learn") syncLearnLayout();
    else if (mode === "code") syncCodeLayout();
    else if (mode === "notebook") syncNotebookLayout();
    setStatus(statusEl, "status_ready");
    if (mode === "learn") renderSmartFollowupChips(chatFollowupChips, history, "learn");
    if (mode === "notebook") renderSmartFollowupChips(notebookFollowupChips, history, "notebook");
    return true;
  } catch (error) {
    setLiveWebSearching(false);
    cancelStreamPaintTimers();
    if (streamUi.bubble.isConnected) {
      streamUi.showError(`${t("error_prefix")}: ${formatChatErrorForUi(error)}`);
    } else {
      appendBubble(threadEl, "assistant", `${t("error_prefix")}: ${formatChatErrorForUi(error)}`, {
        mode,
        studyMode: normalizeStudyMode(studyMode),
      });
    }
    setStatus(statusEl, "status_failed");
    return false;
  } finally {
    sendBtn.disabled = false;
  }
}

function isStandaloneWebAppDisplay() {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* ignore */
  }
  return window.navigator.standalone === true;
}

function isLikelyIOSBrowser() {
  try {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Safari / WebKit (desktop + iOS). Used for lighter streaming paints and CSS hooks. */
function isSafariWebKit() {
  try {
    const ua = navigator.userAgent || "";
    const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/i.test(ua);
    const isIOSWebKit = isLikelyIOSBrowser() && /AppleWebKit/i.test(ua);
    return isSafari || isIOSWebKit;
  } catch {
    return false;
  }
}

function applySafariPerfClass() {
  if (!isSafariWebKit()) return;
  try {
    document.documentElement.classList.add("is-safari");
  } catch {
    /* ignore */
  }
}

function shouldOfferPwaInstallBar() {
  if (window.location.protocol === "file:") return false;
  if (isStandaloneWebAppDisplay()) return false;
  if (localStorage.getItem(PWA_INSTALL_BAR_DISMISSED_KEY) === "1") return false;
  return true;
}

function refreshPwaInstallSubText() {
  const sub = document.getElementById("pwaInstallSub");
  const bar = document.getElementById("pwaInstallBar");
  if (!sub || !bar || bar.classList.contains("hidden")) return;
  if (deferredInstallPrompt) {
    sub.textContent = t("pwa_sub_install");
  } else if (isLikelyIOSBrowser()) {
    sub.textContent = t("pwa_sub_ios");
  } else {
    sub.textContent = t("pwa_sub_desktop");
  }
}

function refreshPwaInstallBarUi() {
  const bar = document.getElementById("pwaInstallBar");
  const installBtn = document.getElementById("pwaInstallBtn");
  const iosBtn = document.getElementById("pwaIosHelpBtn");
  const helpBtn = document.getElementById("pwaInstallHelpBtn");
  if (!bar || bar.classList.contains("hidden")) return;
  installBtn?.classList.toggle("hidden", !deferredInstallPrompt);
  const ios = isLikelyIOSBrowser();
  iosBtn?.classList.toggle("hidden", !ios);
  const showHelp = !deferredInstallPrompt && !ios;
  helpBtn?.classList.toggle("hidden", !showHelp);
}

async function registerServiceWorkerIfEligible() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;
  const host = window.location.hostname;
  if (window.location.protocol !== "https:" && host !== "localhost" && host !== "127.0.0.1") return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    /* ignore registration failures */
  }
}

function wirePwaInstallBar() {
  const bar = document.getElementById("pwaInstallBar");
  const dismiss = document.getElementById("pwaInstallDismiss");
  const installBtn = document.getElementById("pwaInstallBtn");
  const iosBtn = document.getElementById("pwaIosHelpBtn");
  const iosSteps = document.getElementById("pwaIosSteps");
  const helpBtn = document.getElementById("pwaInstallHelpBtn");
  const helpSteps = document.getElementById("pwaInstallHelpSteps");

  dismiss?.addEventListener("click", () => {
    localStorage.setItem(PWA_INSTALL_BAR_DISMISSED_KEY, "1");
    bar?.classList.add("hidden");
    iosSteps?.classList.add("hidden");
    helpSteps?.classList.add("hidden");
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {
      /* user dismissed native prompt */
    }
    deferredInstallPrompt = null;
    installBtn.classList.add("hidden");
    helpSteps?.classList.add("hidden");
    refreshPwaInstallBarUi();
  });

  iosBtn?.addEventListener("click", () => {
    if (!iosSteps) return;
    helpSteps?.classList.add("hidden");
    iosSteps.classList.toggle("hidden");
  });

  helpBtn?.addEventListener("click", () => {
    if (!helpSteps) return;
    iosSteps?.classList.add("hidden");
    helpSteps.classList.toggle("hidden");
  });
}

function initPwaInstallSupport() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const bar = document.getElementById("pwaInstallBar");
    const sub = document.getElementById("pwaInstallSub");
    if (bar && !bar.classList.contains("hidden") && sub) {
      sub.textContent = t("pwa_sub_install");
    }
    refreshPwaInstallBarUi();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.getElementById("pwaInstallBar")?.classList.add("hidden");
  });
  // Defer SW registration so first paint/auth are not competing with SW install on Safari.
  window.setTimeout(() => {
    void registerServiceWorkerIfEligible();
  }, 1800);
  wirePwaInstallBar();
}

function maybeOfferPwaInstallBar() {
  const bar = document.getElementById("pwaInstallBar");
  const sub = document.getElementById("pwaInstallSub");
  if (!bar || !shouldOfferPwaInstallBar()) return;

  bar.classList.remove("hidden");

  if (sub) {
    const ios = isLikelyIOSBrowser();
    if (deferredInstallPrompt) {
      sub.textContent = t("pwa_sub_install");
    } else if (ios) {
      sub.textContent = t("pwa_sub_ios");
    } else {
      sub.textContent = t("pwa_sub_desktop");
    }
  }

  refreshPwaInstallBarUi();
}

function hubPageUrlForBookmark() {
  try {
    if (window.location.protocol === "file:") return "";
    return `${window.location.origin}${window.location.pathname || "/"}`;
  } catch {
    return "";
  }
}

function hasAcknowledgedHonorCode() {
  if (honorCodeAckThisSession) return true;
  try {
    return localStorage.getItem(HONOR_CODE_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function isHonorCodeModalOpen() {
  const modal = document.getElementById("honorCodeModal");
  return Boolean(modal && !modal.classList.contains("hidden"));
}

function hideHonorCodeModal() {
  document.getElementById("honorCodeModal")?.classList.add("hidden");
}

function acknowledgeHonorCode() {
  honorCodeAckThisSession = true;
  try {
    localStorage.setItem(HONOR_CODE_ACK_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
  hideHonorCodeModal();
  maybeOfferDefaultPageHint();
}

function maybeOfferHonorCodeModal() {
  const modal = document.getElementById("honorCodeModal");
  if (!modal || !appCard || appCard.classList.contains("hidden")) return false;
  if (hasAcknowledgedHonorCode()) return false;
  modal.classList.remove("hidden");
  window.setTimeout(() => {
    document.getElementById("honorCodeAckBtn")?.focus();
  }, 40);
  return true;
}

function wireHonorCodeModal() {
  const modal = document.getElementById("honorCodeModal");
  const ackBtn = document.getElementById("honorCodeAckBtn");
  const backBtn = document.getElementById("honorCodeBackBtn");

  ackBtn?.addEventListener("click", () => acknowledgeHonorCode());
  backBtn?.addEventListener("click", () => {
    hideHonorCodeModal();
    showHubHome();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!isHonorCodeModalOpen()) return;
    e.preventDefault();
    hideHonorCodeModal();
    showHubHome();
  });

  // Require an explicit choice; backdrop click does not dismiss.
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.getElementById("honorCodeAckBtn")?.focus();
    }
  });
}

function maybeOfferDefaultPageHint() {
  if (defaultPageHintOfferedThisLoad) return;
  if (isHonorCodeModalOpen() || !hasAcknowledgedHonorCode()) return;
  const modal = document.getElementById("defaultPageHintModal");
  if (!modal || !appCard || appCard.classList.contains("hidden")) return;
  if (localStorage.getItem(DEFAULT_PAGE_HINT_DISMISSED_KEY) === "1") return;
  if (isStandaloneWebAppDisplay()) return;
  if (window.location.protocol === "file:") return;

  defaultPageHintOfferedThisLoad = true;
  const urlField = document.getElementById("defaultPageHintUrlField");
  const steps = document.getElementById("defaultPageHintSteps");
  const showStepsBtn = document.getElementById("showDefaultPageStepsBtn");
  if (urlField) urlField.value = hubPageUrlForBookmark();

  window.setTimeout(() => {
    if (!modal.classList.contains("hidden")) return;
    if (isHonorCodeModalOpen()) return;
    modal.classList.remove("hidden");
    showStepsBtn?.focus();
  }, 700);
}

function hideDefaultPageHintModal(saveDismiss) {
  const modal = document.getElementById("defaultPageHintModal");
  const steps = document.getElementById("defaultPageHintSteps");
  if (saveDismiss) localStorage.setItem(DEFAULT_PAGE_HINT_DISMISSED_KEY, "1");
  modal?.classList.add("hidden");
  steps?.classList.add("hidden");
  const showStepsBtn = document.getElementById("showDefaultPageStepsBtn");
  if (showStepsBtn) showStepsBtn.textContent = t("show_steps");
}

function wireDefaultPageHintModal() {
  const modal = document.getElementById("defaultPageHintModal");
  const steps = document.getElementById("defaultPageHintSteps");
  const showStepsBtn = document.getElementById("showDefaultPageStepsBtn");
  const dismissBtn = document.getElementById("dismissDefaultPageHintBtn");
  const closeBtn = document.getElementById("closeDefaultPageHintBtn");
  const copyBtn = document.getElementById("copyDefaultPageUrlBtn");
  const urlField = document.getElementById("defaultPageHintUrlField");

  showStepsBtn?.addEventListener("click", () => {
    if (!steps) return;
    const opening = steps.classList.contains("hidden");
    if (opening) {
      steps.classList.remove("hidden");
      showStepsBtn.textContent = t("hide_steps");
      urlField?.select();
    } else {
      steps.classList.add("hidden");
      showStepsBtn.textContent = t("show_steps");
    }
  });

  dismissBtn?.addEventListener("click", () => hideDefaultPageHintModal(true));
  closeBtn?.addEventListener("click", () => hideDefaultPageHintModal(true));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hideDefaultPageHintModal(true);
  });

  copyBtn?.addEventListener("click", async () => {
    const t = urlField?.value || hubPageUrlForBookmark();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      showToast(t("toast_address_copied"));
    } catch {
      urlField?.select();
      showToast(t("toast_select_copy"));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal || modal.classList.contains("hidden")) return;
    hideDefaultPageHintModal(true);
  });
}

function getSessionDisplayName(session) {
  const metadata = session?.user?.user_metadata || {};
  const email = session?.user?.email || "";
  return metadata.full_name || metadata.name || email.split("@")[0] || "there";
}

function syncHubWelcome(session) {
  const el = document.getElementById("hubWelcome");
  if (!el) return;
  const name = userName?.textContent?.trim() || "there";
  if (!name || name === "Student") {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = t("hub_welcome").replace("{name}", name);
  el.classList.remove("hidden");
}

function readWaitlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HUB_WAITLIST_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeWaitlist(next) {
  localStorage.setItem(HUB_WAITLIST_KEY, JSON.stringify(next || {}));
}

function hideSoonModal() {
  const modal = document.getElementById("soonModal");
  modal?.classList.add("hidden");
  soonVertical = null;
}

function fillSoonModal(vertical) {
  const title = document.getElementById("soonModalTitle");
  const body = document.getElementById("soonModalBody");
  const note = document.getElementById("soonModalNote");
  if (!title || !body || !note) return;
  if (vertical === "finance") {
    title.textContent = t("soon_finance_title");
    body.textContent = t("soon_finance_body");
    note.textContent = t("soon_finance_note");
  } else {
    title.textContent = t("soon_health_title");
    body.textContent = t("soon_health_body");
    note.textContent = t("soon_health_note");
  }
}

function openSoonModal(vertical) {
  soonVertical = vertical === "finance" ? "finance" : "health";
  fillSoonModal(soonVertical);
  const modal = document.getElementById("soonModal");
  modal?.classList.remove("hidden");
  window.setTimeout(() => document.getElementById("soonNotifyBtn")?.focus(), 30);
}

function desiredVerticalFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = (params.get("vertical") || params.get("v") || "").toLowerCase();
    if (raw === "student" || raw === "health" || raw === "finance") return raw;
    const hash = (window.location.hash || "").replace(/^#/, "").toLowerCase();
    if (hash === "student" || hash === "health" || hash === "finance") return hash;
  } catch {
    /* ignore */
  }
  return null;
}

function showHubHome() {
  hideSoonModal();
  closeAccountMenu();
  authCard?.classList.add("hidden");
  appCard?.classList.add("hidden");
  hubCard?.classList.remove("hidden");
  activeSurface = "hub";
  syncHubWelcome();
  syncHubResumeButton();
  document.title = "AI Hub";
}

function showStudentWorkspace() {
  hideSoonModal();
  closeAccountMenu();
  authCard?.classList.add("hidden");
  hubCard?.classList.add("hidden");
  appCard?.classList.remove("hidden");
  activeSurface = "student";
  document.title = "Student AI - AI Hub";
  window.setTimeout(() => {
    maybeOfferPwaInstallBar();
  }, 850);
  if (!maybeOfferHonorCodeModal()) {
    maybeOfferDefaultPageHint();
  }
}

function showApp(session) {
  const display = getSessionDisplayName(session);
  if (userName) userName.textContent = display;
  syncHubWelcome(session);
  const desired = desiredVerticalFromUrl();
  if (desired === "student") {
    showStudentWorkspace();
    return;
  }
  showHubHome();
  if (desired === "health" || desired === "finance") {
    openSoonModal(desired);
  }
}

function showAuth(message = "") {
  document.getElementById("pwaInstallBar")?.classList.add("hidden");
  document.getElementById("pwaIosSteps")?.classList.add("hidden");
  document.getElementById("pwaInstallHelpSteps")?.classList.add("hidden");
  hideSoonModal();
  closeAccountMenu();
  authCard?.classList.remove("hidden");
  hubCard?.classList.add("hidden");
  appCard?.classList.add("hidden");
  activeSurface = null;
  if (authStatus) authStatus.textContent = message;
  document.title = "AI Hub";
}

/** OAuth return URL without a #fragment (Supabase redirect allowlists match origin/path/query). */
function getOAuthRedirectTo() {
  if (window.location.protocol === "file:") return null;
  const path = window.location.pathname || "/";
  return `${window.location.origin}${path}${window.location.search}`;
}

function describeAuthFailure(err) {
  const msg = err && err.message ? String(err.message) : String(err || "");
  if (/did not match the expected pattern/i.test(msg)) {
    const allowed = getOAuthRedirectTo() || window.location.origin || "(your app URL)";
    return (
      "Sign-in blocked (URL pattern). In Supabase: Authentication ? URL Configuration ? Redirect URLs, add exactly: " +
      allowed +
      " (include the correct port and path). Or use a wildcard like http://localhost:3001/** for local dev."
    );
  }
  return msg || "Unknown error";
}

async function initAuth() {
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG || {};
  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    showAuth("Set Supabase URL and anon key in public/config.js to enable Google login.");
    googleLoginBtn.disabled = true;
    return;
  }

  try {
    new URL(String(supabaseUrl).trim());
  } catch {
    showAuth("Invalid supabaseUrl in public/config.js (must look like https://xxxx.supabase.co).");
    googleLoginBtn.disabled = true;
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    showAuth(`Could not start auth: ${describeAuthFailure(err)}`);
    googleLoginBtn.disabled = true;
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) showAuth(`Auth error: ${describeAuthFailure(error)}`);
    else if (data.session) showApp(data.session);
  } catch (err) {
    showAuth(describeAuthFailure(err));
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
    else showAuth();
  });
}

googleLoginBtn.addEventListener("click", async () => {
  if (!supabaseClient) return;
  const redirectTo = getOAuthRedirectTo();
  if (!redirectTo) {
    authStatus.textContent =
      "Sign-in needs http:// or https:// (open the app from your dev server, not a file:// page).";
    return;
  }
  authStatus.textContent = t("opening_google_login");
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) authStatus.textContent = `Login failed: ${describeAuthFailure(error)}`;
  } catch (err) {
    authStatus.textContent = describeAuthFailure(err);
  }
});


function closeAccountMenu() {
  document.querySelectorAll(".account-menu").forEach((menu) => {
    const panel = menu.querySelector(".account-menu-panel");
    const btn = menu.querySelector(".account-menu-btn");
    panel?.classList.add("hidden");
    btn?.setAttribute("aria-expanded", "false");
  });
}
function toggleAccountMenu(menu) {
  if (!menu) return;
  const panel = menu.querySelector(".account-menu-panel");
  const btn = menu.querySelector(".account-menu-btn");
  if (!panel || !btn) return;
  const willOpen = panel.classList.contains("hidden");
  closeAccountMenu();
  if (willOpen) {
    panel.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }
}
document.querySelectorAll(".account-menu").forEach((menu) => {
  const btn = menu.querySelector(".account-menu-btn");
  const panel = menu.querySelector(".account-menu-panel");
  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAccountMenu(menu);
  });
  panel?.addEventListener("click", (e) => {
    e.stopPropagation();
  });
});
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest?.(".account-menu")) return;
  closeAccountMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAccountMenu();
    hideSoonModal();
  }
});

document.getElementById("backToHubBtn")?.addEventListener("click", () => {
  showHubHome();
});

document.querySelectorAll(".hub-tile").forEach((tile) => {
  tile.addEventListener("click", () => {
    const vertical = tile.getAttribute("data-vertical");
    if (vertical === "student") showStudentWorkspace();
    else if (vertical === "health" || vertical === "finance") openSoonModal(vertical);
  });
});

document.getElementById("soonModalCloseBtn")?.addEventListener("click", hideSoonModal);
document.getElementById("soonBackBtn")?.addEventListener("click", () => {
  hideSoonModal();
  showHubHome();
});
document.getElementById("soonNotifyBtn")?.addEventListener("click", () => {
  if (!soonVertical) return;
  const list = readWaitlist();
  const label = soonVertical === "finance" ? t("tile_finance_title") : t("tile_health_title");
  if (list[soonVertical]) {
    showToast(t("toast_waitlist_already").replace("{vertical}", label));
    return;
  }
  list[soonVertical] = { at: new Date().toISOString() };
  writeWaitlist(list);
  showToast(soonVertical === "finance" ? t("toast_waitlist_finance") : t("toast_waitlist_health"));
  hideSoonModal();
});
document.getElementById("soonModal")?.addEventListener("click", (e) => {
  if (e.target?.id === "soonModal") hideSoonModal();
});

const notebookDropzone = document.getElementById("notebookDropzone");

function notebookFileKey(file) {
  return `${file?.name || "file"}:${file?.size || 0}:${file?.lastModified || 0}`;
}

function getNotebookSelectedFiles() {
  return notebookFiles.slice();
}

function updateNotebookFileMeta() {
  if (!docFileMeta) return;
  const files = getNotebookSelectedFiles();
  if (!files.length) {
    docFileMeta.textContent = "";
    return;
  }
  const kb = String(Math.round(files.reduce((sum, f) => sum + (f.size || 0), 0) / 1024));
  if (files.length === 1) {
    docFileMeta.textContent = t("doc_selected", { name: files[0].name, kb });
    return;
  }
  docFileMeta.textContent = t("docs_selected", { count: String(files.length), kb });
}

function renderNotebookSourceChips() {
  if (!notebookSourcesEl) return;
  notebookSourcesEl.innerHTML = "";
  getNotebookSelectedFiles().forEach((file, idx) => {
    const chip = document.createElement("div");
    chip.className = "notebook-source-chip";
    const label = document.createElement("span");
    label.textContent = file.name;
    label.title = file.name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "notebook-source-remove";
    removeBtn.setAttribute("aria-label", t("notebook_remove_source", { name: file.name }));
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      notebookFiles.splice(idx, 1);
      notebookDocumentContext = "";
      notebookSourceMeta = notebookFiles.map((f) => ({ name: f.name, chars: 0 }));
      syncNotebookAnalyzeVisibility();
      syncNotebookLayout();
    });
    chip.appendChild(label);
    chip.appendChild(removeBtn);
    notebookSourcesEl.appendChild(chip);
  });
}

function syncNotebookAnalyzeVisibility() {
  const files = getNotebookSelectedFiles();
  const hasFiles = files.length > 0;
  if (docAnalyzeBtn) {
    docAnalyzeBtn.classList.remove("hidden");
    docAnalyzeBtn.disabled = !hasFiles;
    docAnalyzeBtn.setAttribute("aria-disabled", hasFiles ? "false" : "true");
    docAnalyzeBtn.title = hasFiles ? "" : t("choose_files_first");
  }
  if (notebookDropzone) notebookDropzone.classList.toggle("has-file", hasFiles);
  renderNotebookSourceChips();
  updateNotebookFileMeta();
}

function addNotebookFiles(fileList) {
  const incoming = Array.from(fileList || []).filter(Boolean);
  if (!incoming.length) return;
  const existing = new Set(notebookFiles.map(notebookFileKey));
  let skipped = 0;
  for (const file of incoming) {
    if (notebookFiles.length >= NOTEBOOK_MAX_FILES) {
      skipped += 1;
      continue;
    }
    const key = notebookFileKey(file);
    if (existing.has(key)) continue;
    existing.add(key);
    notebookFiles.push(file);
  }
  if (skipped > 0) {
    showToast(t("notebook_max_files", { max: String(NOTEBOOK_MAX_FILES) }));
  }
  notebookDocumentContext = "";
  notebookSourceMeta = notebookFiles.map((f) => ({ name: f.name, chars: 0 }));
  syncNotebookAnalyzeVisibility();
  syncNotebookLayout();
}

notebookDropzone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  notebookDropzone.classList.add("is-dragover");
});
notebookDropzone?.addEventListener("dragleave", () => {
  notebookDropzone.classList.remove("is-dragover");
});
notebookDropzone?.addEventListener("drop", (e) => {
  e.preventDefault();
  notebookDropzone.classList.remove("is-dragover");
  addNotebookFiles(e.dataTransfer?.files);
});
notebookDropzone?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    docFileInput?.click();
  }
});

async function handleLogout() {
  closeAccountMenu();
  if (!supabaseClient) {
    showAuth("Signed out.");
    return;
  }
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (err) {
    showAuth(describeAuthFailure(err));
    return;
  }
  showAuth();
}
document.querySelectorAll(".logout-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAccountMenu();
    void handleLogout();
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setMainTab(tab.dataset.tab));
});

function wireSearchFlow({
  searchInput,
  searchSubmit,
  followupInput,
  followupSubmit,
  mode,
  history,
  threadEl,
  statusEl,
  onFirstSend,
  getVisionAttachment,
  clearVisionAttachment,
} = {}) {
  const run = (raw, activeBtn) => {
    if (isHonorCodeModalOpen() || !hasAcknowledgedHonorCode()) {
      maybeOfferHonorCodeModal();
      return;
    }
    const attach = typeof getVisionAttachment === "function" ? getVisionAttachment() : null;
    const msg = typeof raw === "string" ? raw : "";
    const trimmed = msg.trim();
    if (!trimmed && !attach) return;
    if (typeof clearVisionAttachment === "function") clearVisionAttachment();
    if (!history.length) onFirstSend();
    void sendChatMessage(mode, trimmed, history, threadEl, statusEl, activeBtn, "explain", attach);
    followupInput.value = "";
    followupInput.focus();
  };

  searchSubmit.addEventListener("click", () => {
    const msg = searchInput.value;
    searchInput.value = "";
    run(msg, searchSubmit);
  });

  followupSubmit.addEventListener("click", () => {
    run(followupInput.value, followupSubmit);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      searchSubmit.click();
    }
  });

  followupInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      followupSubmit.click();
    }
  });

  return {
    sendFromFollowup: (raw) => {
      if (typeof clearVisionAttachment === "function") clearVisionAttachment();
      followupInput.value = "";
      run(raw, followupSubmit);
    },
  };
}

const chatSearchFlow = wireSearchFlow({
  searchInput: chatSearchInput,
  searchSubmit: chatSearchSubmit,
  followupInput: chatFollowupInput,
  followupSubmit: chatFollowupSubmit,
  mode: "learn",
  history: chatHistory,
  threadEl: chatThread,
  statusEl: apiStatus,
  onFirstSend: () => {
    chatSessionOpen = true;
    syncLearnLayout();
  },
  getVisionAttachment: LEARN_VISION_ENABLED ? () => learnChatVisionAttachment : undefined,
  clearVisionAttachment: LEARN_VISION_ENABLED ? clearLearnChatVisionAttachment : undefined,
});

wireStarterChipsAsSend(chatFollowupChips, chatSearchFlow.sendFromFollowup, chatFollowupSubmit, {
  readAloud: () => readLastAssistantAloud(chatHistory),
  practice: () => {
    const topic = lastAskTopicGuess();
    if (!topic) {
      showToast(t("practice_need_ask"));
      return;
    }
    startPracticeSession({ source: "ask", topic });
  },
});
renderSmartFollowupChips(chatFollowupChips, chatHistory, "learn");

function wireEmptyStatePrompts() {
  document.querySelectorAll(".empty-prompt-chip[data-empty-scope]").forEach((chip) => {
    if (chip.dataset.emptyWired === "1") return;
    chip.dataset.emptyWired = "1";
    chip.addEventListener("click", () => {
      const scope = chip.getAttribute("data-empty-scope");
      const idx = Number(chip.getAttribute("data-empty-idx"));
      const spec = EMPTY_PROMPT_SPECS[scope]?.[idx];
      if (!spec) return;
      if (scope === "chat") {
        chatSearchInput.value = t(spec.send);
        chatSearchSubmit.click();
        return;
      }
      if (scope === "code") {
        codeSearchInput.value = t(spec.send);
        codeSearchSubmit.click();
        return;
      }
      if (scope === "notebook" && spec.hint) {
        showToast(t(spec.hint));
        docFileInput?.click();
      }
    });
  });
}

function wireCopyThreadButtons() {
  chatCopyThreadBtn?.addEventListener("click", () => {
    void copyThreadHistory(chatHistory);
  });
  codeCopyThreadBtn?.addEventListener("click", () => {
    void copyThreadHistory(codeHistory);
  });
  notebookCopyThreadBtn?.addEventListener("click", () => {
    void copyThreadHistory(notebookHistory);
  });
}

wireLearnVoiceMic({ micBtn: chatHeroMicBtn, inputEl: chatSearchInput, submitBtn: chatSearchSubmit });
wireLearnVoiceMic({ micBtn: chatFollowupMicBtn, inputEl: chatFollowupInput, submitBtn: chatFollowupSubmit });

wireSearchFlow({
  searchInput: codeSearchInput,
  searchSubmit: codeSearchSubmit,
  followupInput: codeFollowupInput,
  followupSubmit: codeFollowupSubmit,
  mode: "code",
  history: codeHistory,
  threadEl: codeThread,
  statusEl: codeStatus,
  onFirstSend: () => {
    codeSessionOpen = true;
    syncCodeLayout();
  },
});

function wireLearnChatImageAttach() {
  const openPicker = () => learnChatImageInput?.click();
  chatHeroAttachBtn?.addEventListener("click", () => openPicker());
  chatFollowupAttachBtn?.addEventListener("click", () => openPicker());
  learnChatImageInput?.addEventListener("change", async () => {
    const f = learnChatImageInput?.files?.[0];
    if (learnChatImageInput) learnChatImageInput.value = "";
    if (!f) return;
    try {
      learnChatVisionAttachment = await prepareImageForLearnChat(f);
      updateLearnChatAttachPreview();
      showToast(t("toast_image_attached"));
      chatFollowupInput?.focus();
    } catch (err) {
      showToast(err.message || t("toast_image_read_fail"));
    }
  });
}

/** Hide attach UI and single-row layout when VQA is muted (see LEARN_VISION_ENABLED). */
function applyLearnVisionMuted() {
  if (LEARN_VISION_ENABLED) return;
  document.querySelectorAll(".learn-vision-ui").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".search-bar--learn").forEach((el) => el.classList.remove("search-bar--learn"));
}

applyLearnVisionMuted();
if (LEARN_VISION_ENABLED) {
  wireLearnChatImageAttach();
}

docFileInput?.addEventListener("change", () => {
  addNotebookFiles(docFileInput.files);
  try {
    docFileInput.value = "";
  } catch {
    /* ignore */
  }
});

function sendNotebookFollowup(raw, activeBtn = notebookFollowupSubmit) {
  if (isHonorCodeModalOpen() || !hasAcknowledgedHonorCode()) {
    maybeOfferHonorCodeModal();
    return;
  }
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return;
  if (!notebookDocumentContext) {
    showToast(t("toast_analyze_first"));
    return;
  }
  notebookSessionOpen = true;
  syncNotebookLayout();
  void sendChatMessage(
    "notebook",
    trimmed,
    notebookHistory,
    notebookThread,
    notebookStatus,
    activeBtn || notebookFollowupSubmit,
    "explain",
  );
  if (notebookFollowupInput) {
    notebookFollowupInput.value = "";
    notebookFollowupInput.focus();
  }
}

notebookFollowupSubmit?.addEventListener("click", () => {
  sendNotebookFollowup(notebookFollowupInput?.value || "", notebookFollowupSubmit);
});
notebookFollowupInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendNotebookFollowup(notebookFollowupInput.value, notebookFollowupSubmit);
  }
});

wireStarterChipsAsSend(
  notebookFollowupChips,
  (prompt) => sendNotebookFollowup(prompt, notebookFollowupSubmit),
  notebookFollowupSubmit,
  {
    readAloud: () => readLastAssistantAloud(notebookHistory),
    practice: () => {
      if (!notebookDocumentContext) {
        showToast(t("practice_need_notes"));
        return;
      }
      startPracticeSession({ source: "notebook", topic: "My notes" });
    },
  },
  NOTEBOOK_STARTER_PROMPT_KEYS,
);
renderSmartFollowupChips(notebookFollowupChips, notebookHistory, "notebook");

syncNotebookAnalyzeVisibility();
docAnalyzeBtn?.addEventListener("click", async () => {
  if (isHonorCodeModalOpen() || !hasAcknowledgedHonorCode()) {
    maybeOfferHonorCodeModal();
    return;
  }
  const files = getNotebookSelectedFiles();
  if (!files.length) {
    setStatus(notebookStatus, "choose_files_first");
    syncNotebookAnalyzeVisibility();
    return;
  }

  notebookHistory.splice(0, notebookHistory.length);
  notebookThread.innerHTML = "";
  const names = files.map((f) => f.name).join(", ");
  const userLine =
    files.length === 1
      ? `Analyze uploaded file: ${names}`
      : `Analyze uploaded files (${files.length}): ${names}`;
  appendBubble(notebookThread, "user", userLine);

  docAnalyzeBtn.disabled = true;
  if (notebookFollowupSubmit) notebookFollowupSubmit.disabled = true;
  setStatus(notebookStatus, "reading_summarizing");

  try {
    const form = new FormData();
    files.forEach((file) => form.append("documents", file));
    const response = await fetchAuthed("/api/doc-insights", {
      method: "POST",
      headers: {},
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");

    notebookDocumentContext = typeof data.documentContext === "string" ? data.documentContext : "";
    notebookSourceMeta = Array.isArray(data.sources)
      ? data.sources.map((s) => ({ name: s.name || "document", chars: Number(s.chars) || 0 }))
      : Array.isArray(data.docNames)
        ? data.docNames.map((name) => ({ name, chars: 0 }))
        : files.map((f) => ({ name: f.name, chars: 0 }));

    if (!notebookDocumentContext) {
      throw new Error("Analysis succeeded but no document context was returned for follow-ups.");
    }

    const note = data.output || "No response.";
    const meta =
      data.charsUsed != null
        ? `\n\n_(Used up to ${data.charsUsed} characters from ${files.length} document${files.length > 1 ? "s" : ""}.)_`
        : "";
    const assistantText = `${note}${meta}`;
    appendBubble(notebookThread, "assistant", assistantText, { mode: "notebook", studyMode: "explain" });
    notebookHistory.push({ role: "user", content: userLine });
    notebookHistory.push({ role: "assistant", content: assistantText });
    notebookSessionOpen = true;
    saveSessionState();
    syncNotebookLayout();
    syncPracticeEmptyActions();
    setStatus(notebookStatus, "status_ready");
    if (Array.isArray(data.failures) && data.failures.length) {
      const failedNames = data.failures.map((f) => f.name).filter(Boolean).join(", ");
      if (failedNames) showToast(`${t("error_prefix")}: ${failedNames}`);
    }
  } catch (error) {
    appendBubble(notebookThread, "assistant", `${t("error_prefix")}: ${error.message}`, {
      mode: "notebook",
      studyMode: "explain",
    });
    setStatus(notebookStatus, "status_failed");
    showToast(error.message || t("toast_doc_analysis_failed"));
  } finally {
    if (notebookFollowupSubmit) notebookFollowupSubmit.disabled = false;
    syncNotebookAnalyzeVisibility();
  }
});


/* ---- Practice loop (quiz -> mistakes -> next best step) ---- */
const practiceEmpty = document.getElementById("practiceEmpty");
const practiceActive = document.getElementById("practiceActive");
const practiceSummary = document.getElementById("practiceSummary");
const practiceFromNotesBtn = document.getElementById("practiceFromNotesBtn");
const practiceFromAskBtn = document.getElementById("practiceFromAskBtn");
const practiceTopicInput = document.getElementById("practiceTopicInput");
const practiceTopicStartBtn = document.getElementById("practiceTopicStartBtn");
const practiceEmptyStatus = document.getElementById("practiceEmptyStatus");
const practiceProgress = document.getElementById("practiceProgress");
const practiceTopicLabel = document.getElementById("practiceTopicLabel");
const practiceQuestion = document.getElementById("practiceQuestion");
const practiceAnswerInput = document.getElementById("practiceAnswerInput");
const practiceSubmitAnswer = document.getElementById("practiceSubmitAnswer");
const practiceSkipBtn = document.getElementById("practiceSkipBtn");
const practiceFeedback = document.getElementById("practiceFeedback");
const practiceActiveStatus = document.getElementById("practiceActiveStatus");
const practiceEncouragement = document.getElementById("practiceEncouragement");
const practiceScore = document.getElementById("practiceScore");
const practiceMistakes = document.getElementById("practiceMistakes");
const practiceNextStep = document.getElementById("practiceNextStep");
const practiceAgainBtn = document.getElementById("practiceAgainBtn");
const practiceBackNotebookBtn = document.getElementById("practiceBackNotebookBtn");

let practiceState = {
  topic: "",
  source: "",
  documentContext: "",
  questions: [],
  index: 0,
  results: [],
  busy: false,
  lastStartOpts: null,
};

function syncPracticeEmptyActions() {
  if (practiceFromNotesBtn) {
    const ready = Boolean(notebookDocumentContext);
    practiceFromNotesBtn.disabled = !ready;
    practiceFromNotesBtn.title = ready ? "" : t("practice_need_notes");
  }
}

function showPracticeView(which) {
  practiceEmpty?.classList.toggle("hidden", which !== "empty");
  practiceActive?.classList.toggle("hidden", which !== "active");
  practiceSummary?.classList.toggle("hidden", which !== "summary");
}

function lastAskTopicGuess() {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const row = chatHistory[i];
    if (row && row.role === "user" && typeof row.content === "string" && row.content.trim()) {
      return row.content.trim().slice(0, 160);
    }
  }
  return "";
}

async function practiceApi(body) {
  const res = await fetchAuthed("/api/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, uiLanguage: activeUiLanguage }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error || "Practice request failed.");
  return data || {};
}

function renderPracticeQuestion() {
  const q = practiceState.questions[practiceState.index];
  if (!q) return;
  if (practiceProgress) {
    practiceProgress.textContent = t("practice_progress", {
      n: String(practiceState.index + 1),
      total: String(practiceState.questions.length),
    });
  }
  if (practiceTopicLabel) practiceTopicLabel.textContent = practiceState.topic || "";
  if (practiceQuestion) {
    practiceQuestion.textContent = q.prompt;
    practiceQuestion.style.animation = "none";
    // retrigger enter motion
    void practiceQuestion.offsetWidth;
    practiceQuestion.style.animation = "";
  }
  if (practiceAnswerInput) {
    practiceAnswerInput.value = "";
    practiceAnswerInput.focus();
  }
  practiceFeedback?.classList.add("hidden");
  practiceFeedback?.classList.remove("is-correct", "is-miss");
  if (practiceFeedback) practiceFeedback.innerHTML = "";
  if (practiceActiveStatus) practiceActiveStatus.textContent = "";
  if (practiceSubmitAnswer) practiceSubmitAnswer.disabled = false;
  if (practiceSkipBtn) practiceSkipBtn.disabled = false;
}

async function startPracticeSession(opts) {
  if (isHonorCodeModalOpen() || !hasAcknowledgedHonorCode()) {
    maybeOfferHonorCodeModal();
    return;
  }
  const source = opts?.source || "topic";
  const documentContext = source === "notebook" ? String(notebookDocumentContext || "") : "";
  const topic = String(opts?.topic || "").trim();
  if (source === "notebook" && !documentContext) {
    showToast(t("practice_need_notes"));
    setMainTab("notebook");
    return;
  }
  if (source === "ask" && !topic) {
    showToast(t("practice_need_ask"));
    setMainTab("chat");
    return;
  }
  if (source === "topic" && !topic) {
    showToast(t("practice_need_topic"));
    return;
  }

  practiceState.busy = true;
  practiceState.lastStartOpts = { source, topic, documentContext };
  setMainTab("practice");
  showPracticeView("empty");
  if (practiceEmptyStatus) setStatus(practiceEmptyStatus, "practice_building");
  if (practiceFromNotesBtn) practiceFromNotesBtn.disabled = true;
  if (practiceFromAskBtn) practiceFromAskBtn.disabled = true;
  if (practiceTopicStartBtn) practiceTopicStartBtn.disabled = true;

  try {
    const data = await practiceApi({
      action: "start",
      documentContext: documentContext || undefined,
      topic: topic || undefined,
    });
    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (questions.length < 3) throw new Error("Could not build a practice set.");
    practiceState = {
      ...practiceState,
      topic: String(data.topic || topic || "Practice"),
      source,
      documentContext,
      questions,
      index: 0,
      results: [],
      busy: false,
    };
    showPracticeView("active");
    renderPracticeQuestion();
    if (practiceEmptyStatus) setStatus(practiceEmptyStatus, "status_ready");
  } catch (e) {
    practiceState.busy = false;
    showToast(e.message || t("status_failed"));
    if (practiceEmptyStatus) {
      practiceEmptyStatus.textContent = e.message || t("status_failed");
    }
  } finally {
    syncPracticeEmptyActions();
    if (practiceFromAskBtn) practiceFromAskBtn.disabled = false;
    if (practiceTopicStartBtn) practiceTopicStartBtn.disabled = false;
  }
}

function showInlinePracticeFeedback(check) {
  if (!practiceFeedback) return;
  const ok = Boolean(check?.correct);
  practiceFeedback.classList.remove("hidden", "is-correct", "is-miss");
  practiceFeedback.classList.add(ok ? "is-correct" : "is-miss");
  const title = ok ? t("practice_correct") : t("practice_miss");
  const feedback = String(check?.feedback || "").trim();
  const key = String(check?.key_point || "").trim();
  practiceFeedback.innerHTML = "";
  const p1 = document.createElement("p");
  p1.textContent = feedback ? (title + " " + feedback) : title;
  practiceFeedback.appendChild(p1);
  if (key) {
    const p2 = document.createElement("p");
    p2.textContent = t("practice_key_point", { point: key });
    practiceFeedback.appendChild(p2);
  }
}

async function advancePracticeAfterCheck(check, answer) {
  const q = practiceState.questions[practiceState.index];
  practiceState.results.push({
    question: q?.prompt || "",
    prompt: q?.prompt || "",
    answer,
    correct: Boolean(check?.correct),
    feedback: String(check?.feedback || ""),
    key_point: String(check?.key_point || ""),
  });
  showInlinePracticeFeedback(check);
  if (practiceSubmitAnswer) practiceSubmitAnswer.disabled = true;
  if (practiceSkipBtn) practiceSkipBtn.disabled = true;
  await new Promise((r) => setTimeout(r, 700));
  practiceState.index += 1;
  if (practiceState.index >= practiceState.questions.length) {
    await finishPracticeSession();
  } else {
    renderPracticeQuestion();
  }
}

async function submitPracticeAnswer(opts) {
  const skip = Boolean(opts && opts.skip);
  if (practiceState.busy) return;
  const q = practiceState.questions[practiceState.index];
  if (!q) return;
  const answer = skip ? "(skipped)" : String(practiceAnswerInput?.value || "").trim();
  if (!skip && !answer) {
    showToast(t("practice_answer_placeholder"));
    return;
  }
  practiceState.busy = true;
  if (practiceActiveStatus) setStatus(practiceActiveStatus, "practice_checking");
  if (practiceSubmitAnswer) practiceSubmitAnswer.disabled = true;
  if (practiceSkipBtn) practiceSkipBtn.disabled = true;
  try {
    let check;
    if (skip) {
      check = {
        correct: false,
        feedback: "Skipped - come back to this idea after a quick review.",
        key_point: q.rubric || "",
      };
    } else {
      check = await practiceApi({
        action: "check",
        question: { prompt: q.prompt, rubric: q.rubric || "" },
        answer,
      });
    }
    practiceState.busy = false;
    await advancePracticeAfterCheck(check, answer);
  } catch (e) {
    practiceState.busy = false;
    showToast(e.message || t("status_failed"));
    if (practiceSubmitAnswer) practiceSubmitAnswer.disabled = false;
    if (practiceSkipBtn) practiceSkipBtn.disabled = false;
    if (practiceActiveStatus) practiceActiveStatus.textContent = e.message || "";
  }
}

async function finishPracticeSession() {
  practiceState.busy = true;
  if (practiceActiveStatus) setStatus(practiceActiveStatus, "practice_wrapping");
  try {
    const data = await practiceApi({
      action: "wrapup",
      results: practiceState.results,
    });
    const correct = practiceState.results.filter((r) => r.correct).length;
    const total = practiceState.results.length;
    if (practiceScore) {
      practiceScore.textContent = t("practice_score", {
        correct: String(correct),
        total: String(total),
      });
    }
    if (practiceEncouragement) {
      practiceEncouragement.textContent = String(data.encouragement || "").trim();
    }
    if (practiceNextStep) {
      practiceNextStep.textContent = String(data.next_best_step || "").trim();
    }
    const nextWrap = document.querySelector(".practice-next-step");
    if (nextWrap) {
      nextWrap.style.animation = "none";
      void nextWrap.offsetWidth;
      nextWrap.style.animation = "";
    }
    if (practiceMistakes) {
      practiceMistakes.innerHTML = "";
      const mistakes = Array.isArray(data.mistakes) ? data.mistakes : [];
      if (!mistakes.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = t("practice_no_mistakes");
        practiceMistakes.appendChild(p);
      } else {
        mistakes.forEach((m) => {
          const wrap = document.createElement("div");
          wrap.className = "practice-mistake";
          const strong = document.createElement("strong");
          strong.textContent = String(m.question || "").trim() || "Missed question";
          wrap.appendChild(strong);
          if (m.what_went_wrong) {
            const pp = document.createElement("p");
            pp.textContent = String(m.what_went_wrong);
            wrap.appendChild(pp);
          }
          if (m.relearn) {
            const p2 = document.createElement("p");
            p2.textContent = t("practice_mistake_relearn", { tip: String(m.relearn) });
            wrap.appendChild(p2);
          }
          practiceMistakes.appendChild(wrap);
        });
      }
    }
    showPracticeView("summary");
  } catch (e) {
    showToast(e.message || t("status_failed"));
  } finally {
    practiceState.busy = false;
    if (practiceActiveStatus) practiceActiveStatus.textContent = "";
  }
}

practiceFromNotesBtn?.addEventListener("click", () => {
  startPracticeSession({ source: "notebook", topic: "My notes" });
});
practiceFromAskBtn?.addEventListener("click", () => {
  const topic = lastAskTopicGuess();
  startPracticeSession({ source: "ask", topic });
});
practiceTopicStartBtn?.addEventListener("click", () => {
  startPracticeSession({ source: "topic", topic: practiceTopicInput?.value || "" });
});
practiceTopicInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    startPracticeSession({ source: "topic", topic: practiceTopicInput?.value || "" });
  }
});
practiceSubmitAnswer?.addEventListener("click", () => submitPracticeAnswer());
practiceSkipBtn?.addEventListener("click", () => submitPracticeAnswer({ skip: true }));
practiceAnswerInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submitPracticeAnswer();
  }
});
practiceAgainBtn?.addEventListener("click", () => {
  const opts = practiceState.lastStartOpts;
  if (opts) startPracticeSession(opts);
  else showPracticeView("empty");
});
practiceBackNotebookBtn?.addEventListener("click", () => setMainTab("notebook"));
syncPracticeEmptyActions();


async function initBetaBanner() {
  const el = document.getElementById("betaBanner");
  if (!el) return;
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    const msg = typeof h.betaMessage === "string" ? h.betaMessage.trim() : "";
    if (!msg) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  } catch {
    /* ignore */
  }
}

/**
 * Accept external deep-links like `/?q=...` from browser extensions and prefill Ask.
 * Keeps behavior explicit: user still clicks Ask to send.
 */
function hydratePromptFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const q = String(params.get("q") || "").trim();
    if (!q) return;
    setMainTab("chat");
    chatSearchInput.value = q.slice(0, 4000);
    chatSearchInput.focus();
    params.delete("q");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore malformed URL state */
  }
}

function wireSettingsUi() {
  const syncForm = () => {
    const prefs = loadPrefs();
    if (prefRestoreSessions) prefRestoreSessions.checked = prefs.restoreSessions !== false;
    if (prefUiLanguage) prefUiLanguage.value = normalizeUiLanguage(prefs.uiLanguage);
  };
  syncForm();

  document.querySelectorAll(".open-settings-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeAccountMenu();
      syncForm();
      settingsModal?.classList.remove("hidden");
    });
  });
  closeSettingsBtn?.addEventListener("click", () => settingsModal?.classList.add("hidden"));
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });
  saveSettingsBtn?.addEventListener("click", () => {
    const prefs = {
      restoreSessions: prefRestoreSessions?.checked !== false,
      uiLanguage: normalizeUiLanguage(prefUiLanguage?.value || "en"),
      liveWeb: loadPrefs().liveWeb !== false,
    };
    savePrefs(prefs);
    setUiLanguage(prefs.uiLanguage);
    saveSessionState();
    settingsModal?.classList.add("hidden");
    showToast(t("settings_saved_toast"));
  });
}

const prefsAtBoot = loadPrefs();
applySafariPerfClass();
setUiLanguage(prefsAtBoot.uiLanguage);
syncLiveWebToggleUi();
syncHubResumeButton();
void refreshLiveWebCapability();
document.getElementById("liveWebToggle")?.addEventListener("click", () => {
  setLiveWebEnabled(!isLiveWebEnabled());
});
document.getElementById("hubResumeStudent")?.addEventListener("click", () => {
  showStudentWorkspace();
});

initMarkdown();
initPwaInstallSupport();
setMainTab("chat");
wireSettingsUi();
wireHonorCodeModal();
wireDefaultPageHintModal();
wireEmptyStatePrompts();
wireCopyThreadButtons();
maybeOfferLanguageSuggestion();
hydratePromptFromUrl();
initAuth();
initBetaBanner();

// Restore threads after first paint so Safari is not parsing Markdown during boot.
const restoreAfterPaint = () => {
  restoreSessionStateIfEnabled();
  syncLearnLayout();
  syncCodeLayout();
  syncNotebookLayout();
  syncNotebookAnalyzeVisibility();
};
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(restoreAfterPaint));
} else {
  window.setTimeout(restoreAfterPaint, 0);
}
