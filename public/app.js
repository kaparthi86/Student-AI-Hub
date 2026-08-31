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
const practiceDock = document.getElementById("practiceDock");

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
const codeFollowupChips = document.getElementById("codeFollowupChips");
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
const financeCard = document.getElementById("financeCard");
const panelFinanceAsk = document.getElementById("panelFinanceAsk");
const panelFinanceBudget = document.getElementById("panelFinanceBudget");
const panelFinanceGoals = document.getElementById("panelFinanceGoals");
const financeSearchShell = document.getElementById("financeSearchShell");
const financeAnswerShell = document.getElementById("financeAnswerShell");
const financeSearchInput = document.getElementById("financeSearchInput");
const financeSearchSubmit = document.getElementById("financeSearchSubmit");
const financeThread = document.getElementById("financeThread");
const financeFollowupInput = document.getElementById("financeFollowupInput");
const financeFollowupSubmit = document.getElementById("financeFollowupSubmit");
const financeFollowupChips = document.getElementById("financeFollowupChips");
const financeStatus = document.getElementById("financeStatus");
const financeCopyThreadBtn = document.getElementById("financeCopyThreadBtn");
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
const FINANCE_DISCLAIMER_ACK_KEY = "ai_hub_finance_disclaimer_ack_v1";
const FINANCE_SESSION_KEY = "ai_hub_finance_v1";
const HUB_WAITLIST_KEY = "ai_hub_waitlist_v1";
/** Session fallback when localStorage is unavailable. */
let honorCodeAckThisSession = false;
/** @type {"hub" | "student" | "finance" | null} */
let activeSurface = null;
/** @type {"health" | "finance" | null} */
let soonVertical = null;

let deferredInstallPrompt = null;
let chatSessionOpen = false;
let codeSessionOpen = false;
let notebookSessionOpen = false;
const financeHistory = [];
let financeSessionOpen = false;
let financeTab = "ask";
let financeBudget = {
  income: "",
  categories: [
    { id: "housing", nameKey: "finance_cat_housing", name: "Housing", amount: "" },
    { id: "food", nameKey: "finance_cat_food", name: "Food", amount: "" },
    { id: "transport", nameKey: "finance_cat_transport", name: "Transport", amount: "" },
    { id: "school", nameKey: "finance_cat_school", name: "School", amount: "" },
    { id: "fun", nameKey: "finance_cat_fun", name: "Fun", amount: "" },
    { id: "other", nameKey: "finance_cat_other", name: "Other", amount: "" },
  ],
};
let financeGoals = [];
let pendingFinanceChart = null;
let financeDisclaimerAckThisSession = false;
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
    resume_finance: "Resume Finance AI",
    live_web_unavailable: "Live web needs a search key on the server",
    visual_kicker: "Visual",
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
    tile_finance_cta: "Open ->",
    hub_privacy_note: "AI Hub does not sell your data or show ads from your chats.",
    disclaimer_privacy:
      "AI Hub does not sell your personal data or show advertising based on your chats.",
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
    disclaimer_nonprofit: "AI Hub is mission-driven - built to help people learn and plan, not to sell your data or push ads.",
    disclaimer_student: "In Student AI: for study help and practice only - follow your honor code; don't submit AI output when your course forbids it.",
    disclaimer_finance:
      "Finance AI is educational only - not financial, tax, or investment advice. Do not share account numbers or passwords.",
    mission_title: "Our mission",
    mission_lead: "AI Hub helps people learn and plan with focused AI.",
    mission_sub: "Starting with Student AI - learning and practice, not shortcuts.",
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
    chip_practice: "Practice",
    practice_this_topic: "Practice this topic",
    practice_check: "Check",
    practice_skip: "Skip",
    practice_again: "Practice again",
    practice_done: "Done",
    practice_summary_title: "Practice complete",
    practice_next_label: "Next best step",
    practice_answer_placeholder: "Answer in your own words...",
    practice_progress: "Question {n} of {total}",
    practice_score: "You got {correct} of {total} right.",
    practice_need_notes: "Analyze notes in Notebook first.",
    practice_need_ask: "Ask a question first, then practice that topic.",
    practice_need_code: "Get Code help first, then practice that topic.",
    practice_building: "Building your practice set...",
    practice_checking: "Checking your answer...",
    practice_wrapping: "Building your next step...",
    practice_correct: "Nice - you got the idea.",
    practice_miss: "Not quite - here is the key point.",
    practice_key_point: "Key point: {point}",
    practice_no_mistakes: "No major misses - solid practice.",
    practice_mistake_relearn: "Relearn: {tip}",
    tab_finance_ask: "Ask",
    tab_finance_budget: "Budget",
    tab_finance_goals: "Goals",
    finance_title: "What money question is on your mind?",
    finance_placeholder: "Ask about budgets, saving, or a money tradeoff...",
    finance_followup: "Ask a follow-up...",
    finance_ask_hint: "Educational only. Not financial advice.",
    finance_budget_title: "This month, in one view",
    finance_budget_lead:
      "Enter take-home pay and what you spend. Numbers stay on this device until you ask Finance AI to explain the plan.",
    finance_income_label: "Monthly take-home",
    finance_leftover_kicker: "Left after this plan",
    finance_leftover_empty: "Add income and categories to see what remains.",
    finance_leftover_ok: "A buffer you can save or use on purpose.",
    finance_leftover_tight: "Little room left - trim a category or lower a want.",
    finance_leftover_over: "This plan spends more than take-home. Cut something before the month starts.",
    finance_categories_label: "Categories",
    finance_add_category: "Add category",
    finance_explain_budget: "Explain this plan",
    finance_split_needs: "Needs",
    finance_split_wants: "Wants",
    finance_split_aside: "Set aside",
    finance_split_over: "Over spend",
    finance_chart_month: "This month",
    finance_chart_kicker: "Your plan",
    finance_chart_share: "Share of take-home",
    finance_chart_goal: "Savings goal",
    finance_goal_monthly_short: "Per month",
    finance_goal_vs_left: "Monthly save vs leftover",
    finance_goal_fits: "This monthly amount fits in leftover.",
    finance_goal_tight_fit: "This monthly amount uses most of leftover.",
    finance_goal_needs_room: "Leftover is smaller than this monthly amount.",
    finance_cat_housing: "Housing",
    finance_cat_food: "Food",
    finance_cat_transport: "Transport",
    finance_cat_school: "School",
    finance_cat_fun: "Fun",
    finance_cat_other: "Other",
    finance_goals_title: "Save toward something real",
    finance_goals_lead: "Name a target and a timeline. We will show the monthly amount, then you can ask for a calm plan.",
    finance_goal_name: "Goal",
    finance_goal_target: "Target amount",
    finance_goal_months: "Months",
    finance_add_goal: "Add goal",
    finance_goals_empty: "No goals yet. Start with one number you can actually save toward.",
    finance_goal_monthly: "{amount} / month",
    finance_goal_meta: "{target} in {months} months",
    finance_plan_goal: "Plan this goal",
    finance_remove: "Remove",
    finance_need_income: "Add a monthly take-home amount first.",
    finance_need_goal: "Add a goal name, target, and months.",
    finance_disclaimer_title: "Plan with clear limits",
    finance_disclaimer_lead: "Finance AI is for learning and planning - not financial, tax, or investment advice.",
    finance_disclaimer_body:
      "Do not share bank logins, card numbers, or passwords. Check important facts. For high-stakes decisions, talk to a qualified professional.",
    empty_finance_1: "Start a simple budget",
    empty_finance_1_send: "How do I start a simple monthly budget with take-home pay, needs, wants, and a small amount to set aside?",
    empty_finance_2: "Emergency fund, simply",
    empty_finance_2_send: "Explain an emergency fund in plain language. How much is a reasonable starting target for a student or early-career person?",
    empty_finance_3: "Save vs pay loans",
    empty_finance_3_send: "How should I think about saving a little versus paying extra on student loans? Keep it educational, not personalized advice.",
    chat_title: "What do you want to learn today?",
    chat_placeholder: "Ask anything... (e.g. Explain gradient descent like I am 15)",
    chat_hint: "Press Enter to search. Shift+Enter for a new line.",
    chat_followup: "Ask a follow-up...",
    code_title: "Debug or learn code",
    code_placeholder: "Paste code or describe the bug...",
    code_hint: "Tip: include error messages and what you expected.",
    code_followup: "Follow-up...",
    notebook_hint:
      "Upload notes (.txt, .md, .csv, .json, .pdf). You will get summary, key concepts, practice checks, and a study plan - similar to a lightweight notebook assistant.",
    analyze_doc: "Analyze notes",
    notebook_drop_title: "Drop notes or choose files",
    notebook_drop_hint: "Up to 5 files - .txt, .md, .csv, .json, .pdf - summary, key ideas, practice checks, and a study plan",
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
    empty_nb_1_hint: "Upload a PDF of lecture notes to get a summary, key concepts, and practice checks.",
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
    tile_finance_cta: "Abrir ->",
    hub_privacy_note: "AI Hub no vende tus datos ni muestra anuncios a partir de tus chats.",
    disclaimer_privacy:
      "AI Hub no vende tus datos personales ni muestra publicidad basada en tus chats.",
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
    disclaimer_nonprofit: "AI Hub es un proyecto con mision: ayudar a aprender y planificar, no vender tus datos ni mostrar anuncios.",
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
    tile_finance_cta: "Open ->",
    hub_privacy_note: "AI Hub aapka data nahi bechta aur chats se ads nahi dikhata.",
    disclaimer_privacy:
      "AI Hub personal data nahi bechta aur chats par ads nahi dikhata.",
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
    disclaimer_nonprofit: "AI Hub mission-driven hai - seekhne aur plan karne mein madad ke liye, data bechne ya ads dikhane ke liye nahi.",
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
    tile_finance_cta: "Open ->",
    hub_privacy_note: "AI Hub mee data ammukodu, chats nundi ads chupinchadu.",
    disclaimer_privacy:
      "AI Hub personal data ammukodu, chats meeda ads chupinchadu.",
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
    disclaimer_nonprofit: "AI Hub mission-driven - learn cheyadaniki mariyu plan cheyadaniki, data ammakundaniki leda ads kosam kadu.",
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
  renderThreadFromHistory(financeThread, financeHistory, "finance", "explain");
  renderFinanceBudget();
  renderFinanceGoals();
  refreshPwaInstallSubText();
}

function applyTranslations() {
  const byIdText = {
    authSigninTitle: "signin_title",
    authSigninTagline: "signin_tagline",
    landingMissionTitle: "mission_title",
    landingMissionLead: "mission_lead",
    landingMissionSub: "mission_sub",
    authBrandKicker: "auth_brand_kicker",
    hubBrandTitle: "hub_brand",
    hubTagline: "hub_tagline",
    hubResumeStudent: "resume_student",
    hubResumeFinance: "resume_finance",
    tileStudentBadge: "tile_student_badge",
    tileHealthBadge: "tile_soon_badge",
    tileFinanceBadge: "tile_student_badge",
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
    tileFinanceCta: "tile_student_cta",
    soonNotifyBtn: "soon_notify",
    soonBackBtn: "soon_back",
    soonModalCloseBtn: "soon_close",
    backToHubBtn: "nav_back_hub",
    backToHubFromFinanceBtn: "nav_back_hub",
    crumbStudent: "nav_student",
    crumbFinance: "tile_finance_title",
    googleLoginBtn: "continue_google",
    openSettingsBtn: "settings",
    logoutBtn: "logout",
    welcomePrefix: "welcome",
    appTaglineMain: "app_tagline",
    tabChat: "tab_ask",
    tabCode: "tab_code",
    tabNotebook: "tab_notebook",
    tabFinanceAsk: "tab_finance_ask",
    tabFinanceBudget: "tab_finance_budget",
    tabFinanceGoals: "tab_finance_goals",
    practiceSubmitAnswer: "practice_check",
    practiceSkipBtn: "practice_skip",
    practiceAgainBtn: "practice_again",
    practiceDoneBtn: "practice_done",
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
    financeSearchTitle: "finance_title",
    financeSearchSubmit: "tab_ask",
    financeFollowupSubmit: "tab_ask",
    financeAskHint: "finance_ask_hint",
    financeEmptyPromptsLabel: "empty_try_ask",
    financeBudgetTitle: "finance_budget_title",
    financeBudgetLead: "finance_budget_lead",
    financeIncomeLabel: "finance_income_label",
    financeLeftoverKicker: "finance_leftover_kicker",
    financeCategoriesLabel: "finance_categories_label",
    financeAddCategoryBtn: "finance_add_category",
    financeExplainBudgetBtn: "finance_explain_budget",
    financeGoalsTitle: "finance_goals_title",
    financeGoalsLead: "finance_goals_lead",
    financeGoalNameLabel: "finance_goal_name",
    financeGoalTargetLabel: "finance_goal_target",
    financeGoalMonthsLabel: "finance_goal_months",
    financeAddGoalBtn: "finance_add_goal",
    financeGoalsEmpty: "finance_goals_empty",
    financeDisclaimerTitle: "finance_disclaimer_title",
    financeDisclaimerLead: "finance_disclaimer_lead",
    financeDisclaimerBody: "finance_disclaimer_body",
    financeDisclaimerAckBtn: "honor_ack",
    financeDisclaimerBackBtn: "honor_back",
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
    financeCopyThreadBtn: "copy_thread",
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
  if (financeSearchInput) financeSearchInput.placeholder = t("finance_placeholder");
  if (financeFollowupInput) financeFollowupInput.placeholder = t("finance_followup");
  if (notebookFollowupInput) notebookFollowupInput.placeholder = t("notebook_followup");
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
  document.querySelectorAll(".fine-print-line[data-i18n], .brand-kicker[data-i18n], [data-i18n='hub_privacy_note']").forEach((el) => {
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
  ["authDisclaimerFooter", "appDisclaimerFooter", "hubDisclaimerFooter", "financeDisclaimerFooter"].forEach((id) => {
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
  document.querySelectorAll(".workspace-hub-link").forEach((btn) => {
    const hubLabel = t("nav_back_hub");
    btn.setAttribute("aria-label", hubLabel);
    btn.setAttribute("title", hubLabel);
  });
  document.querySelectorAll(".copy-thread-btn").forEach((btn) => {
    btn.setAttribute("aria-label", t("copy_thread_aria"));
  });
  [apiStatus, codeStatus, notebookStatus, financeStatus].forEach((el) => {
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
  steps: "starter_prompt_steps",
  studyPlan: "starter_prompt_study_plan",
  simpler: "starter_prompt_simpler",
  example: "starter_prompt_example",
  studyNext: "starter_prompt_study_next",
};

const NOTEBOOK_STARTER_PROMPT_KEYS = {
  summarize: "starter_prompt_notebook_summarize",
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
  const keys = scope === "finance" ? ["simpler", "example"] : ["simpler", "example", "practice"];
  if (!a.hasSteps) keys.push("steps");
  else if (scope === "notebook") keys.push("studyPlan");
  else if (scope === "finance") keys.push("summarize");
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
  renderSmartFollowupChips(codeFollowupChips, codeHistory, "code");
  renderSmartFollowupChips(notebookFollowupChips, notebookHistory, "notebook");
  renderSmartFollowupChips(financeFollowupChips, financeHistory, "finance");
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
  finance: [
    { label: "empty_finance_1", send: "empty_finance_1_send" },
    { label: "empty_finance_2", send: "empty_finance_2_send" },
    { label: "empty_finance_3", send: "empty_finance_3_send" },
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

/** Cache voices; Chrome often returns [] until voiceschanged. */
let cachedSpeechVoices = [];
function refreshSpeechVoices() {
  try {
    cachedSpeechVoices = window.speechSynthesis?.getVoices?.() || [];
  } catch {
    cachedSpeechVoices = [];
  }
  return cachedSpeechVoices;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  refreshSpeechVoices();
  try {
    window.speechSynthesis.addEventListener("voiceschanged", refreshSpeechVoices);
  } catch {
    window.speechSynthesis.onvoiceschanged = refreshSpeechVoices;
  }
}

function speechLangForUi() {
  const ui = typeof activeUiLanguage === "string" ? activeUiLanguage : "en";
  if (ui === "es") return "es";
  if (ui === "hi") return "hi";
  if (ui === "te") return "te";
  return "en";
}

/**
 * Prefer calm, soft natural voices for a sober study-coach tone.
 * Score by locale match + soft/neural voice names; demote bright or novelty voices.
 */
function pickPreferredSpeechVoice(langPrefix) {
  const voices = refreshSpeechVoices();
  if (!voices.length) return null;
  const want = String(langPrefix || "en").toLowerCase();
  // Soft / sober first (calm female + neural), then solid neutrals.
  const softNameHints = [
    "microsoft aria",
    "microsoft jenny",
    "microsoft ana",
    "microsoft sabina",
    "google uk english female",
    "samantha",
    "karen",
    "moira",
    "tessa",
    "fiona",
    "victoria",
    "serena",
    "natural",
    "neural",
    "enhanced",
    "premium",
  ];
  const okNameHints = [
    "google us english",
    "microsoft catherine",
    "microsoft zira",
  ];
  const brightOrHarsh = /guy|daniel|david|mark|fred|ralph|alex|jorge|pablo|male|whisper|zarvox|bad news|good news|bells|organ|cellos|junior|trinoids|zarvox|bubbles/i;
  const scored = voices.map((v) => {
    const lang = String(v.lang || "").toLowerCase();
    const name = String(v.name || "").toLowerCase();
    let score = 0;
    if (lang === want || lang.startsWith(want + "-")) score += 40;
    else if (lang.startsWith(want)) score += 25;
    else if (want === "en" && lang.startsWith("en")) score += 20;
    else score -= 50;
    for (const hint of softNameHints) {
      if (name.includes(hint)) {
        score += 38;
        break;
      }
    }
    for (const hint of okNameHints) {
      if (name.includes(hint)) {
        score += 18;
        break;
      }
    }
    if (brightOrHarsh.test(name)) score -= 28;
    // Mild preference for local voices (stable pacing).
    if (v.localService) score += 2;
    return { v, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score > 0 ? scored[0].v : voices.find((v) => String(v.lang || "").toLowerCase().startsWith(want)) || null;
}

/** Make assistant text sound natural when spoken. */
function prepareTextForSpeech(rawPlain) {
  let s = String(rawPlain || "");
  // Drop fenced code; speaking code is usually noise.
  s = s.replace(/```[\s\S]*?```/g, " Code example omitted. ");
  s = s.replace(/`([^`]+)`/g, "$1");
  // Links: keep label, drop URL noise.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
  s = s.replace(/https?:\/\/\S+/g, " link ");
  // Markdown leftovers.
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_{1,2}([^_]+)_{1,2}/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function chunkTextForSpeech(text, maxLen = 320) {
  const src = String(text || "").trim();
  if (!src) return [];
  if (src.length <= maxLen) return [src];
  const parts = [];
  // Avoid lookbehind for broader Safari support: keep punctuation with the sentence.
  const sentences = src.replace(/([.!?])\s+/g, "$1\n").split("\n");
  let buf = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((buf + " " + sentence).trim().length <= maxLen) {
      buf = (buf ? buf + " " : "") + sentence;
      continue;
    }
    if (buf) parts.push(buf);
    if (sentence.length <= maxLen) {
      buf = sentence;
    } else {
      for (let i = 0; i < sentence.length; i += maxLen) {
        parts.push(sentence.slice(i, i + maxLen));
      }
      buf = "";
    }
  }
  if (buf) parts.push(buf);
  return parts.length ? parts : [src.slice(0, maxLen)];
}

function speakTextChunks(chunks, voice, langTag) {
  const list = Array.isArray(chunks) ? chunks.filter(Boolean) : [];
  if (!list.length) return;
  let i = 0;
  const speakNext = () => {
    if (i >= list.length) return;
    const u = new SpeechSynthesisUtterance(list[i]);
    i += 1;
    if (voice) u.voice = voice;
    u.lang = langTag || voice?.lang || "en-US";
    // Soft + sober study-coach delivery: slower, slightly lower pitch, gentler volume.
    u.rate = 0.84;
    u.pitch = 0.92;
    u.volume = 0.88;
    u.onend = () => {
      // Brief pause between chunks keeps pacing calm rather than rushed.
      setTimeout(speakNext, 160);
    };
    u.onerror = () => {
      if (i === 1) showToast(t("toast_speech_playback_failed"));
    };
    window.speechSynthesis.speak(u);
  };
  // Chrome sometimes needs a cancel + tiny delay before a fresh queue.
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  setTimeout(speakNext, 40);
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
  const spoken = prepareTextForSpeech(plain);
  if (!spoken) {
    showToast(t("toast_nothing_to_read"));
    return;
  }
  const maxChars = 12000;
  const clipped =
    spoken.length > maxChars ? spoken.slice(0, maxChars) + " Truncated for speech." : spoken;
  const langPrefix = speechLangForUi();
  const voice = pickPreferredSpeechVoice(langPrefix);
  const langTag =
    voice?.lang ||
    (langPrefix === "es"
      ? "es-ES"
      : langPrefix === "hi"
        ? "hi-IN"
        : langPrefix === "te"
          ? "te-IN"
          : "en-US");
  speakTextChunks(chunkTextForSpeech(clipped), voice, langTag);
}

function normalizeStudyMode(raw) {
  return "explain";
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
  saveFinanceState();
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
    const row = appendBubble(container, role, content, { mode, studyMode, imageDataUrl, charts: item.charts });
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
    restoreFinanceState();
    renderThreadFromHistory(financeThread, financeHistory, "finance", "explain");
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
    if (/^```(?:hub-chart|hubchart)\b/i.test(String(block).trim())) {
      return "\n";
    }
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
  mainTab = next === "code" ? "code" : next === "notebook" ? "notebook" : "chat";
  if (mainTab !== "chat") stopAllLearnVoice();
  if (mainTab !== "chat") stopReadAloud();
  if (LEARN_VISION_ENABLED && mainTab !== "chat") clearLearnChatVisionAttachment();
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === mainTab);
  });
  panelChat.classList.toggle("hidden", mainTab !== "chat");
  panelCode.classList.toggle("hidden", mainTab !== "code");
  panelNotebook.classList.toggle("hidden", mainTab !== "notebook");
  if (mainTab === "notebook") {
    syncNotebookAnalyzeVisibility();
    syncNotebookLayout();
  }
  if (practiceDock && !practiceDock.classList.contains("hidden")) {
    placePracticeDock();
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

const HUB_CHART_TONES = new Set(["ok", "tight", "over", "neutral", "need", "want", "save"]);

function clampChartMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1e9, Math.min(1e9, x));
}

function cleanChartLabel(raw, max = 40) {
  return String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function leftoverTone(income, leftover) {
  if (!income) return "neutral";
  if (leftover < 0) return "over";
  if (leftover / income < 0.08) return "tight";
  return "ok";
}

function sanitizeHubChartItem(row) {
  if (!row || typeof row !== "object") return null;
  const label = cleanChartLabel(row.label);
  if (!label) return null;
  let tone = String(row.tone || "neutral").toLowerCase();
  if (!HUB_CHART_TONES.has(tone)) tone = "neutral";
  return { label, value: clampChartMoney(row.value), tone };
}

function sanitizeHubTextItem(row, textMax = 140) {
  if (!row || typeof row !== "object") return null;
  const label = cleanChartLabel(row.label, 40);
  const text = cleanChartLabel(row.text || row.detail || row.body, textMax);
  if (!label && !text) return null;
  return { label: label || text.slice(0, 28), text: text || label };
}

function sanitizeHubChartSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = cleanChartLabel(raw.title, 80);
  const kicker = cleanChartLabel(raw.kicker, 48);
  const note = cleanChartLabel(raw.note, 180);
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((row) => sanitizeHubTextItem(row, 140)).filter(Boolean).slice(0, 6)
    : [];
  const compare = Array.isArray(raw.compare)
    ? raw.compare.map((row) => sanitizeHubTextItem(row, 120)).filter(Boolean).slice(0, 3)
    : [];
  if (steps.length) return { kind: "steps", title, kicker: kicker || t("visual_kicker"), note, steps };
  if (compare.length >= 2) return { kind: "compare", title, kicker: kicker || t("visual_kicker"), note, compare };
  let hero = null;
  if (raw.hero && typeof raw.hero === "object") {
    const label = cleanChartLabel(raw.hero.label, 48);
    let tone = String(raw.hero.tone || "neutral").toLowerCase();
    if (!HUB_CHART_TONES.has(tone)) tone = "neutral";
    if (label) hero = { label, value: clampChartMoney(raw.hero.value), tone };
  }
  const mix = Array.isArray(raw.mix)
    ? raw.mix.map(sanitizeHubChartItem).filter(Boolean).slice(0, 5)
    : [];
  const bars = Array.isArray(raw.bars)
    ? raw.bars.map(sanitizeHubChartItem).filter(Boolean).slice(0, 8)
    : [];
  if (!hero && !mix.length && !bars.length) return null;
  return { kind: "chart", title, kicker, note, hero, mix, bars };
}

function parseJsonObjectLoose(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function extractHubCharts(text) {
  const charts = [];
  const markdown = String(text ?? "").replace(/```(?:hub-chart|hubchart)\s*([\s\S]*?)```/gi, (_, body) => {
    const spec = sanitizeHubChartSpec(parseJsonObjectLoose(body));
    if (spec) charts.push(spec);
    return "\n";
  });
  return { markdown, charts };
}

function takePendingFinanceChart() {
  const spec = pendingFinanceChart;
  pendingFinanceChart = null;
  return spec;
}

function pctOf(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, (Math.abs(part) / Math.abs(whole)) * 100));
}

function appendChartMix(parent, mix) {
  const sum = mix.reduce((n, row) => n + Math.abs(row.value), 0);
  if (!mix.length || sum <= 0) return;
  const track = document.createElement("div");
  track.className = "hub-chart-track";
  track.setAttribute("role", "img");
  track.setAttribute("aria-label", mix.map((row) => `${row.label} ${formatMoney(row.value)}`).join(", "));
  mix.forEach((row) => {
    const width = pctOf(row.value, sum);
    if (width < 0.4) return;
    const seg = document.createElement("span");
    seg.className = `hub-chart-seg is-${row.tone || "neutral"}`;
    seg.style.width = `${width}%`;
    track.appendChild(seg);
  });
  parent.appendChild(track);
  const legend = document.createElement("ul");
  legend.className = "hub-chart-legend";
  mix.forEach((row) => {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `hub-chart-swatch hub-chart-seg is-${row.tone || "neutral"}`;
    const name = document.createElement("span");
    name.textContent = `${row.label} (${Math.round(pctOf(row.value, sum))}%)`;
    const val = document.createElement("span");
    val.className = "hub-chart-legend-value";
    val.textContent = formatMoney(row.value);
    li.appendChild(swatch);
    li.appendChild(name);
    li.appendChild(val);
    legend.appendChild(li);
  });
  parent.appendChild(legend);
}

function appendChartBars(parent, bars) {
  if (!bars.length) return;
  const scale = Math.max(...bars.map((row) => Math.abs(row.value)), 1);
  const list = document.createElement("div");
  list.className = "hub-chart-bars";
  bars.forEach((row) => {
    const item = document.createElement("div");
    item.className = "hub-chart-row";
    const lab = document.createElement("span");
    lab.className = "hub-chart-row-label";
    lab.textContent = row.label;
    const val = document.createElement("span");
    val.className = "hub-chart-row-value";
    val.textContent = formatMoney(row.value);
    const track = document.createElement("div");
    track.className = "hub-chart-bar-track";
    const fill = document.createElement("span");
    fill.className = `hub-chart-bar-fill is-${row.tone || "neutral"}`;
    fill.style.width = `${pctOf(row.value, scale)}%`;
    track.appendChild(fill);
    item.appendChild(lab);
    item.appendChild(val);
    item.appendChild(track);
    list.appendChild(item);
  });
  parent.appendChild(list);
}

function appendVisualSteps(parent, steps) {
  if (!steps.length) return;
  const list = document.createElement("ol");
  list.className = "hub-visual-steps";
  steps.forEach((row, i) => {
    const item = document.createElement("li");
    const num = document.createElement("span");
    num.className = "hub-visual-step-n";
    num.textContent = String(i + 1);
    const body = document.createElement("div");
    body.className = "hub-visual-step-body";
    const lab = document.createElement("strong");
    lab.textContent = row.label;
    body.appendChild(lab);
    if (row.text && row.text !== row.label) {
      const p = document.createElement("p");
      p.textContent = row.text;
      body.appendChild(p);
    }
    item.appendChild(num);
    item.appendChild(body);
    list.appendChild(item);
  });
  parent.appendChild(list);
}

function appendVisualCompare(parent, compare) {
  if (compare.length < 2) return;
  const grid = document.createElement("div");
  grid.className = "hub-visual-compare";
  compare.forEach((row) => {
    const card = document.createElement("article");
    const lab = document.createElement("h4");
    lab.textContent = row.label;
    card.appendChild(lab);
    if (row.text && row.text !== row.label) {
      const p = document.createElement("p");
      p.textContent = row.text;
      card.appendChild(p);
    }
    grid.appendChild(card);
  });
  parent.appendChild(grid);
}

function buildHubChartElement(spec) {
  const card = document.createElement("article");
  card.className = spec.kind === "chart" ? "hub-chart" : `hub-chart hub-chart--${spec.kind || "study"}`;
  if (spec.kicker) {
    const kicker = document.createElement("p");
    kicker.className = "hub-chart-kicker";
    kicker.textContent = spec.kicker;
    card.appendChild(kicker);
  }
  if (spec.title) {
    const title = document.createElement("h3");
    title.className = "hub-chart-title";
    title.textContent = spec.title;
    card.appendChild(title);
  }
  if (spec.kind === "steps") {
    appendVisualSteps(card, spec.steps || []);
    if (spec.note) {
      const note = document.createElement("p");
      note.className = "hub-chart-note";
      note.textContent = spec.note;
      card.appendChild(note);
    }
    return card;
  }
  if (spec.kind === "compare") {
    appendVisualCompare(card, spec.compare || []);
    if (spec.note) {
      const note = document.createElement("p");
      note.className = "hub-chart-note";
      note.textContent = spec.note;
      card.appendChild(note);
    }
    return card;
  }
  if (spec.hero) {
    const hero = document.createElement("div");
    hero.className = "hub-chart-hero";
    const lab = document.createElement("span");
    lab.className = "hub-chart-hero-label";
    lab.textContent = spec.hero.label;
    const val = document.createElement("span");
    val.className = `hub-chart-hero-value is-${spec.hero.tone || "neutral"}`;
    val.textContent = formatMoney(spec.hero.value);
    hero.appendChild(lab);
    hero.appendChild(val);
    card.appendChild(hero);
  }
  appendChartMix(card, spec.mix || []);
  appendChartBars(card, spec.bars || []);
  if (spec.note) {
    const note = document.createElement("p");
    note.className = "hub-chart-note";
    note.textContent = spec.note;
    card.appendChild(note);
  }
  return card;
}

function snapshotBudgetChart() {
  const { income, leftover, needs, wants, aside } = budgetTotals();
  if (!income) return null;
  const bars = (financeBudget.categories || [])
    .map((cat) => ({ label: categoryLabel(cat), value: parseMoney(cat.amount), tone: "need" }))
    .filter((row) => row.value > 0)
    .slice(0, 8);
  const tone = leftoverTone(income, leftover);
  const mix = [
    { label: t("finance_split_needs"), value: needs, tone: "need" },
    { label: t("finance_split_wants"), value: wants, tone: "want" },
    leftover < 0
      ? { label: t("finance_split_over"), value: Math.abs(leftover), tone: "over" }
      : { label: t("finance_split_aside"), value: aside, tone: "save" },
  ].filter((row) => row.value > 0);
  return sanitizeHubChartSpec({
    title: t("finance_chart_month"),
    kicker: t("finance_chart_kicker"),
    hero: { label: t("finance_leftover_kicker"), value: leftover, tone },
    mix,
    bars,
    note:
      tone === "over"
        ? t("finance_leftover_over")
        : tone === "tight"
          ? t("finance_leftover_tight")
          : t("finance_leftover_ok"),
  });
}

function snapshotGoalChart(goal) {
  if (!goal) return null;
  const monthly = goal.months ? goal.target / goal.months : goal.target;
  const { leftover, income } = budgetTotals();
  const bars = [{ label: t("finance_goal_monthly_short"), value: monthly, tone: "save" }];
  let note = "";
  if (income) {
    bars.unshift({
      label: t("finance_leftover_kicker"),
      value: leftover,
      tone: leftover < monthly ? "over" : "save",
    });
    if (leftover < 0) note = t("finance_leftover_over");
    else if (leftover < monthly) note = t("finance_goal_needs_room");
    else if (monthly / leftover > 0.7) note = t("finance_goal_tight_fit");
    else note = t("finance_goal_fits");
  }
  return sanitizeHubChartSpec({
    title: goal.name,
    kicker: t("finance_chart_goal"),
    hero: { label: t("finance_goal_monthly_short"), value: monthly, tone: "save" },
    bars,
    note,
  });
}

function fillAssistantBubbleBody(bubble, text, extra = {}) {
  bubble.querySelectorAll(".bubble-text, .hub-chart").forEach((el) => el.remove());
  const extracted = extractHubCharts(text);
  const pendingCharts = [];
  const pending = extra && extra.charts;
  if (Array.isArray(pending)) {
    pending.forEach((spec) => {
      const clean = sanitizeHubChartSpec(spec);
      if (clean) pendingCharts.push(clean);
    });
  }
  const extractedCharts = extracted.charts;
  const usePending = pendingCharts.length > 0;
  const visuals = usePending ? pendingCharts : extractedCharts;
  if (usePending) {
    visuals.forEach((spec) => bubble.appendChild(buildHubChartElement(spec)));
  }
  const rendered = renderAssistantHtml(extracted.markdown);
  if ("plain" in rendered) {
    if (rendered.plain) {
      const pre = document.createElement("pre");
      pre.className = "bubble-text";
      pre.textContent = rendered.plain;
      bubble.appendChild(pre);
    }
  } else if (String(rendered.html || "").trim()) {
    const body = document.createElement("div");
    body.className = "bubble-text bubble-md";
    body.innerHTML = rendered.html;
    bubble.appendChild(body);
    enhanceMarkdownCodeBlocks(body);
  }
  if (!usePending) {
    visuals.forEach((spec) => bubble.appendChild(buildHubChartElement(spec)));
  }
  wireAssistantCopy(bubble, extracted.markdown);
  mountAssistantFeedback(bubble, extracted.markdown);
  mountAssistantPractice(bubble, extracted.markdown);
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
    fillAssistantBubbleBody(bubble, text, meta);
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
    finalize(markdownRaw, extra = {}) {
      body.remove();
      fillAssistantBubbleBody(bubble, markdownRaw, extra);
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
  const studentBtn = document.getElementById("hubResumeStudent");
  const financeBtn = document.getElementById("hubResumeFinance");
  const hasStudent = Array.isArray(chatHistory) && chatHistory.length > 0;
  const hasFinance = Array.isArray(financeHistory) && financeHistory.length > 0;
  if (studentBtn) {
    studentBtn.classList.toggle("hidden", !hasStudent);
    studentBtn.textContent = t("resume_student");
  }
  if (financeBtn) {
    financeBtn.classList.toggle("hidden", !hasFinance);
    financeBtn.textContent = t("resume_finance");
  }
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
  const financeCharts = mode === "finance" && pendingFinanceChart ? [pendingFinanceChart] : [];

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
      const assistantBubble = appendBubble(threadEl, "assistant", output, {
        mode,
        studyMode: normalizeStudyMode(studyMode),
        charts: financeCharts,
      });
      if (jsonSources.length) mountBubbleSources(assistantBubble.bubble, jsonSources);
      const userRow = { role: "user", content: trimmed };
      if (attach) {
        userRow.imageMime = attach.mime;
        userRow.imageBase64 = attach.base64;
      }
      history.push(userRow);
      const assistantRow = { role: "assistant", content: output };
      if (jsonSources.length) assistantRow.sources = jsonSources;
      if (financeCharts.length) {
        takePendingFinanceChart();
        assistantRow.charts = financeCharts;
      }
      history.push(assistantRow);
      saveSessionState();
      if (mode === "learn") syncLearnLayout();
      else if (mode === "code") syncCodeLayout();
      else if (mode === "notebook") syncNotebookLayout();
      else if (mode === "finance") syncFinanceLayout();
      setStatus(statusEl, "status_ready");
      if (mode === "learn") renderSmartFollowupChips(chatFollowupChips, history, "learn");
      if (mode === "notebook") renderSmartFollowupChips(notebookFollowupChips, history, "notebook");
      if (mode === "finance") renderSmartFollowupChips(financeFollowupChips, history, "finance");
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
    streamUi.finalize(finalText, { charts: financeCharts });
    if (streamSources.length) mountBubbleSources(streamUi.bubble, streamSources);

    const userRow = { role: "user", content: trimmed };
    if (attach) {
      userRow.imageMime = attach.mime;
      userRow.imageBase64 = attach.base64;
    }
    history.push(userRow);
    const assistantRow = { role: "assistant", content: finalText };
    if (streamSources.length) assistantRow.sources = streamSources;
    if (financeCharts.length) {
      takePendingFinanceChart();
      assistantRow.charts = financeCharts;
    }
    history.push(assistantRow);
    saveSessionState();
    if (mode === "learn") syncLearnLayout();
    else if (mode === "code") syncCodeLayout();
    else if (mode === "notebook") syncNotebookLayout();
    else if (mode === "finance") syncFinanceLayout();
    setStatus(statusEl, "status_ready");
    if (mode === "learn") renderSmartFollowupChips(chatFollowupChips, history, "learn");
    if (mode === "notebook") renderSmartFollowupChips(notebookFollowupChips, history, "notebook");
    if (mode === "finance") renderSmartFollowupChips(financeFollowupChips, history, "finance");
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
    pendingFinanceChart = null;
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
  hideFinanceDisclaimerModal();
  closeAccountMenu();
  authCard?.classList.add("hidden");
  appCard?.classList.add("hidden");
  financeCard?.classList.add("hidden");
  hubCard?.classList.remove("hidden");
  activeSurface = "hub";
  syncHubWelcome();
  syncHubResumeButton();
  document.title = "AI Hub";
}

function showStudentWorkspace() {
  hideSoonModal();
  hideFinanceDisclaimerModal();
  closeAccountMenu();
  authCard?.classList.add("hidden");
  hubCard?.classList.add("hidden");
  financeCard?.classList.add("hidden");
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

function showFinanceWorkspace() {
  hideSoonModal();
  hideHonorCodeModal();
  closeAccountMenu();
  authCard?.classList.add("hidden");
  hubCard?.classList.add("hidden");
  appCard?.classList.add("hidden");
  financeCard?.classList.remove("hidden");
  activeSurface = "finance";
  document.title = "Finance AI - AI Hub";
  setFinanceTab(financeTab || "ask");
  syncFinanceLayout();
  renderFinanceBudget();
  renderFinanceGoals();
  window.setTimeout(() => {
    maybeOfferPwaInstallBar();
  }, 850);
  maybeOfferFinanceDisclaimer();
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
  if (desired === "finance") {
    showFinanceWorkspace();
    return;
  }
  showHubHome();
  if (desired === "health") {
    openSoonModal(desired);
  }
}

function showAuth(message = "") {
  document.getElementById("pwaInstallBar")?.classList.add("hidden");
  document.getElementById("pwaIosSteps")?.classList.add("hidden");
  document.getElementById("pwaInstallHelpSteps")?.classList.add("hidden");
  hideSoonModal();
  hideFinanceDisclaimerModal();
  closeAccountMenu();
  authCard?.classList.remove("hidden");
  hubCard?.classList.add("hidden");
  appCard?.classList.add("hidden");
  financeCard?.classList.add("hidden");
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

document.querySelectorAll(".workspace-hub-link").forEach((btn) => {
  btn.addEventListener("click", () => showHubHome());
});

document.querySelectorAll(".hub-tile").forEach((tile) => {
  tile.addEventListener("click", () => {
    const vertical = tile.getAttribute("data-vertical");
    if (vertical === "student") showStudentWorkspace();
    else if (vertical === "finance") showFinanceWorkspace();
    else if (vertical === "health") openSoonModal(vertical);
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

document.querySelectorAll("#appCard .tab").forEach((tab) => {
  tab.addEventListener("click", () => setMainTab(tab.dataset.tab));
});
document.querySelectorAll("#financeTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => setFinanceTab(tab.getAttribute("data-finance-tab")));
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
  requireHonorCode = true,
  gate,
} = {}) {
  const run = (raw, activeBtn) => {
    if (requireHonorCode !== false) {
      if (isHonorCodeModalOpen() || !hasAcknowledgedHonorCode()) {
        maybeOfferHonorCodeModal();
        return;
      }
    }
    if (typeof gate === "function" && !gate()) return;
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
      if (scope === "finance") {
        financeSearchInput.value = t(spec.send);
        financeSearchSubmit.click();
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
  financeCopyThreadBtn?.addEventListener("click", () => {
    void copyThreadHistory(financeHistory);
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


/* ---- Practice loop under topic (no separate tab) ---- */
function mountAssistantPractice(bubble, rawText) {
  bubble.querySelectorAll(".assistant-practice").forEach((el) => el.remove());
  const mode = bubble.dataset.mode || "learn";
  if (mode !== "learn" && mode !== "notebook" && mode !== "code") return;
  const wrap = document.createElement("div");
  wrap.className = "assistant-practice";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "text-link-btn assistant-practice-btn";
  btn.textContent = t("practice_this_topic");
  btn.addEventListener("click", () => {
    if (mode === "notebook") {
      startPracticeSession({ source: "notebook", topic: "My notes" });
      return;
    }
    if (mode === "code") {
      startPracticeSession({ source: "code", topic: topicFromCodeContext(bubble, rawText) });
      return;
    }
    startPracticeSession({ source: "ask", topic: topicFromAskContext(bubble, rawText) });
  });
  wrap.appendChild(btn);
  bubble.appendChild(wrap);
}

function topicFromAskContext(bubble, rawText) {
  const msg = bubble.closest(".msg");
  const thread = msg && msg.parentElement;
  if (thread) {
    const rows = Array.from(thread.querySelectorAll(".msg"));
    const idx = rows.indexOf(msg);
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (!rows[i].classList.contains("user")) continue;
      const plain = rows[i].querySelector(".bubble-text");
      const t0 = plain ? plain.textContent.trim() : "";
      if (t0) return t0.slice(0, 160);
    }
  }
  const guess = lastAskTopicGuess();
  if (guess) return guess;
  const line = String(rawText || "").trim().split(/\n/)[0] || "";
  return line.replace(/^#+\s*/, "").slice(0, 160) || "This topic";
}

const practiceActive = document.getElementById("practiceActive");
const practiceSummary = document.getElementById("practiceSummary");
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
const practiceDoneBtn = document.getElementById("practiceDoneBtn");

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

function placePracticeDock() {
  if (!practiceDock) return;
  const host =
    mainTab === "notebook"
      ? notebookAnswerShell
      : mainTab === "code"
        ? codeAnswerShell
        : chatAnswerShell;
  if (!host) return;
  const followup = host.querySelector(".followup-bar");
  if (followup) host.insertBefore(practiceDock, followup);
  else host.appendChild(practiceDock);
  practiceDock.classList.remove("hidden");
  document.querySelectorAll(".answer-shell > .followup-bar").forEach((bar) => {
    bar.classList.toggle("hidden", bar.parentElement === host);
  });
}

function closePracticeDock() {
  if (!practiceDock) return;
  practiceDock.classList.add("hidden");
  practiceActive?.classList.add("hidden");
  practiceSummary?.classList.add("hidden");
  practiceEmptyStatus?.classList.add("hidden");
  document.querySelectorAll(".answer-shell > .followup-bar").forEach((bar) => {
    bar.classList.remove("hidden");
  });
  practiceState.busy = false;
}

function showPracticeView(which) {
  practiceActive?.classList.toggle("hidden", which !== "active" && which !== "loading");
  practiceSummary?.classList.toggle("hidden", which !== "summary");
  if (practiceEmptyStatus) practiceEmptyStatus.classList.toggle("hidden", which !== "loading");
}

function topicFromCodeContext(bubble, rawText) {
  const msg = bubble.closest(".msg");
  const thread = msg && msg.parentElement;
  if (thread) {
    const rows = Array.from(thread.querySelectorAll(".msg"));
    const idx = rows.indexOf(msg);
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (!rows[i].classList.contains("user")) continue;
      const plain = rows[i].querySelector(".bubble-text");
      const t0 = plain ? plain.textContent.trim() : "";
      if (t0) return t0.slice(0, 160);
    }
  }
  const guess = lastCodeTopicGuess();
  if (guess) return guess;
  const line = String(rawText || "").trim().split(/\n/)[0] || "";
  return line.replace(/^#+\s*/, "").slice(0, 160) || "This code topic";
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

function lastCodeTopicGuess() {
  for (let i = codeHistory.length - 1; i >= 0; i -= 1) {
    const row = codeHistory[i];
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
  try { data = await res.json(); } catch { data = null; }
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
  const source = opts?.source || "ask";
  const documentContext = source === "notebook" ? String(notebookDocumentContext || "") : "";
  const topic = String(opts?.topic || "").trim();
  if (source === "notebook" && !documentContext) {
    showToast(t("practice_need_notes"));
    setMainTab("notebook");
    return;
  }
  if (source !== "notebook" && !topic) {
    showToast(source === "code" ? t("practice_need_code") : t("practice_need_ask"));
    setMainTab(source === "code" ? "code" : "chat");
    return;
  }

  practiceState.busy = true;
  practiceState.lastStartOpts = { source, topic, documentContext };
  if (source === "notebook") setMainTab("notebook");
  else if (source === "code") setMainTab("code");
  else setMainTab("chat");
  placePracticeDock();
  showPracticeView("loading");
  if (practiceEmptyStatus) {
    practiceEmptyStatus.classList.remove("hidden");
    setStatus(practiceEmptyStatus, "practice_building");
  }

  try {
    const data = await practiceApi({
      action: "start",
      documentContext: documentContext || undefined,
      topic: topic || undefined,
      source,
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
    if (practiceEmptyStatus) {
      setStatus(practiceEmptyStatus, "status_ready");
      practiceEmptyStatus.classList.add("hidden");
    }
  } catch (e) {
    practiceState.busy = false;
    showToast(e.message || t("status_failed"));
    closePracticeDock();
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
  p1.textContent = feedback ? title + " " + feedback : title;
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
  if (practiceState.index >= practiceState.questions.length) await finishPracticeSession();
  else renderPracticeQuestion();
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
    const data = await practiceApi({ action: "wrapup", results: practiceState.results });
    const correct = practiceState.results.filter((r) => r.correct).length;
    const total = practiceState.results.length;
    if (practiceScore) {
      practiceScore.textContent = t("practice_score", { correct: String(correct), total: String(total) });
    }
    if (practiceEncouragement) practiceEncouragement.textContent = String(data.encouragement || "").trim();
    if (practiceNextStep) practiceNextStep.textContent = String(data.next_best_step || "").trim();
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
});
practiceDoneBtn?.addEventListener("click", () => closePracticeDock());

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
document.getElementById("hubResumeFinance")?.addEventListener("click", () => {
  showFinanceWorkspace();
});

/* ---- Finance AI workspace ---- */
function parseMoney(raw) {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString(undefined, { maximumFractionDigits: x % 1 ? 2 : 0 });
}

function defaultFinanceCategories() {
  return [
    { id: "housing", nameKey: "finance_cat_housing", amount: "" },
    { id: "food", nameKey: "finance_cat_food", amount: "" },
    { id: "transport", nameKey: "finance_cat_transport", amount: "" },
    { id: "school", nameKey: "finance_cat_school", amount: "" },
    { id: "fun", nameKey: "finance_cat_fun", amount: "" },
    { id: "other", nameKey: "finance_cat_other", amount: "" },
  ];
}

function categoryLabel(cat) {
  if (cat?.nameKey && I18N.en[cat.nameKey]) return t(cat.nameKey);
  return String(cat?.name || cat?.nameKey || "Category");
}

function saveFinanceState() {
  try {
    localStorage.setItem(
      FINANCE_SESSION_KEY,
      JSON.stringify({
        financeHistory,
        financeSessionOpen,
        financeTab,
        financeBudget,
        financeGoals,
      }),
    );
  } catch {
    /* ignore */
  }
}

function restoreFinanceState() {
  const prefs = loadPrefs();
  if (!prefs.restoreSessions) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(FINANCE_SESSION_KEY) || "{}");
    if (Array.isArray(parsed.financeHistory)) {
      financeHistory.splice(
        0,
        financeHistory.length,
        ...parsed.financeHistory.filter((x) => x && typeof x.content === "string"),
      );
    }
    financeSessionOpen = parsed.financeSessionOpen === true || financeHistory.length > 0;
    if (parsed.financeTab === "budget" || parsed.financeTab === "goals" || parsed.financeTab === "ask") {
      financeTab = parsed.financeTab;
    }
    if (parsed.financeBudget && typeof parsed.financeBudget === "object") {
      const cats = Array.isArray(parsed.financeBudget.categories)
        ? parsed.financeBudget.categories
            .filter((c) => c && typeof c === "object")
            .slice(0, 12)
            .map((c, i) => ({
              id: String(c.id || `cat-${i}`),
              nameKey: typeof c.nameKey === "string" ? c.nameKey : "",
              name: String(c.name || "").slice(0, 40),
              amount: String(c.amount ?? "").slice(0, 16),
            }))
        : defaultFinanceCategories();
      financeBudget = {
        income: String(parsed.financeBudget.income ?? "").slice(0, 16),
        categories: cats.length ? cats : defaultFinanceCategories(),
      };
    }
    if (Array.isArray(parsed.financeGoals)) {
      financeGoals = parsed.financeGoals
        .filter((g) => g && typeof g === "object")
        .slice(0, 12)
        .map((g, i) => ({
          id: String(g.id || `goal-${i}`),
          name: String(g.name || "").slice(0, 80),
          target: Number(g.target) || 0,
          months: Math.max(1, Math.min(120, Number(g.months) || 1)),
        }));
    }
  } catch {
    /* ignore */
  }
}

function hasAcknowledgedFinanceDisclaimer() {
  if (financeDisclaimerAckThisSession) return true;
  try {
    return localStorage.getItem(FINANCE_DISCLAIMER_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function isFinanceDisclaimerOpen() {
  const modal = document.getElementById("financeDisclaimerModal");
  return Boolean(modal && !modal.classList.contains("hidden"));
}

function hideFinanceDisclaimerModal() {
  document.getElementById("financeDisclaimerModal")?.classList.add("hidden");
}

function acknowledgeFinanceDisclaimer() {
  financeDisclaimerAckThisSession = true;
  try {
    localStorage.setItem(FINANCE_DISCLAIMER_ACK_KEY, "1");
  } catch {
    /* ignore */
  }
  hideFinanceDisclaimerModal();
}

function maybeOfferFinanceDisclaimer() {
  const modal = document.getElementById("financeDisclaimerModal");
  if (!modal || !financeCard || financeCard.classList.contains("hidden")) return false;
  if (hasAcknowledgedFinanceDisclaimer()) return false;
  modal.classList.remove("hidden");
  window.setTimeout(() => {
    document.getElementById("financeDisclaimerAckBtn")?.focus();
  }, 40);
  return true;
}

function wireFinanceDisclaimerModal() {
  const modal = document.getElementById("financeDisclaimerModal");
  const ackBtn = document.getElementById("financeDisclaimerAckBtn");
  const backBtn = document.getElementById("financeDisclaimerBackBtn");
  ackBtn?.addEventListener("click", () => acknowledgeFinanceDisclaimer());
  backBtn?.addEventListener("click", () => {
    hideFinanceDisclaimerModal();
    showHubHome();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!isFinanceDisclaimerOpen()) return;
    e.preventDefault();
    hideFinanceDisclaimerModal();
    showHubHome();
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.getElementById("financeDisclaimerAckBtn")?.focus();
    }
  });
}

function gateFinanceSend() {
  if (isFinanceDisclaimerOpen() || !hasAcknowledgedFinanceDisclaimer()) {
    maybeOfferFinanceDisclaimer();
    return false;
  }
  return true;
}

function setFinanceTab(next) {
  financeTab = next === "budget" ? "budget" : next === "goals" ? "goals" : "ask";
  document.querySelectorAll("#financeTabs .tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-finance-tab") === financeTab);
  });
  panelFinanceAsk?.classList.toggle("hidden", financeTab !== "ask");
  panelFinanceBudget?.classList.toggle("hidden", financeTab !== "budget");
  panelFinanceGoals?.classList.toggle("hidden", financeTab !== "goals");
  saveFinanceState();
}

function syncFinanceLayout() {
  const showThread = financeSessionOpen || financeHistory.length > 0;
  financeSearchShell?.classList.toggle("hidden", showThread);
  financeAnswerShell?.classList.toggle("hidden", !showThread);
  financeCopyThreadBtn?.classList.toggle("hidden", financeHistory.length === 0);
  if (showThread) renderSmartFollowupChips(financeFollowupChips, financeHistory, "finance");
}

function budgetTotals() {
  const income = parseMoney(financeBudget.income);
  const spent = (financeBudget.categories || []).reduce((sum, cat) => sum + parseMoney(cat.amount), 0);
  const leftover = income - spent;
  const needsIds = new Set(["housing", "food", "transport", "school"]);
  const wantsIds = new Set(["fun"]);
  let needs = 0;
  let wants = 0;
  (financeBudget.categories || []).forEach((cat) => {
    const amt = parseMoney(cat.amount);
    if (needsIds.has(cat.id)) needs += amt;
    else wants += amt;
  });
  void wantsIds;
  return { income, spent, leftover, needs, wants, aside: leftover };
}

function renderFinanceBudget() {
  const incomeEl = document.getElementById("financeIncomeInput");
  if (incomeEl && document.activeElement !== incomeEl) incomeEl.value = financeBudget.income || "";
  const list = document.getElementById("financeCategoryList");
  if (list) {
    list.innerHTML = "";
    (financeBudget.categories || []).forEach((cat) => {
      const row = document.createElement("div");
      row.className = "finance-cat-row";
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = categoryLabel(cat);
      name.setAttribute("aria-label", t("finance_categories_label"));
      name.addEventListener("input", () => {
        cat.name = name.value;
        cat.nameKey = "";
        saveFinanceState();
      });
      const amount = document.createElement("input");
      amount.type = "number";
      amount.min = "0";
      amount.inputMode = "decimal";
      amount.placeholder = "0";
      amount.value = cat.amount || "";
      amount.setAttribute("aria-label", categoryLabel(cat));
      amount.addEventListener("input", () => {
        cat.amount = amount.value;
        updateFinanceLeftover();
        saveFinanceState();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "finance-icon-btn";
      remove.setAttribute("aria-label", t("finance_remove"));
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        financeBudget.categories = financeBudget.categories.filter((c) => c !== cat);
        renderFinanceBudget();
        saveFinanceState();
      });
      row.appendChild(name);
      row.appendChild(amount);
      row.appendChild(remove);
      const bar = document.createElement("div");
      bar.className = "finance-cat-bar";
      const fill = document.createElement("span");
      const income = parseMoney(financeBudget.income);
      const amt = parseMoney(cat.amount);
      fill.style.width = `${income ? pctOf(amt, income) : 0}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      list.appendChild(row);
    });
  }
  updateFinanceLeftover();
}

function updateFinanceLeftover() {
  const { income, leftover } = budgetTotals();
  const valueEl = document.getElementById("financeLeftoverValue");
  const noteEl = document.getElementById("financeLeftoverNote");
  const splitEl = document.getElementById("financeSplit");
  if (valueEl) {
    valueEl.textContent = formatMoney(leftover);
    valueEl.classList.remove("is-ok", "is-tight", "is-over");
    if (income) {
      if (leftover < 0) valueEl.classList.add("is-over");
      else if (leftover / income < 0.08) valueEl.classList.add("is-tight");
      else valueEl.classList.add("is-ok");
    }
  }
  if (noteEl) {
    if (!income) noteEl.textContent = t("finance_leftover_empty");
    else if (leftover < 0) noteEl.textContent = t("finance_leftover_over");
    else if (leftover / income < 0.08) noteEl.textContent = t("finance_leftover_tight");
    else noteEl.textContent = t("finance_leftover_ok");
  }
  const mixEl = document.getElementById("financeMixPanel");
  if (mixEl) {
    mixEl.innerHTML = "";
    if (income > 0) {
      mixEl.hidden = false;
      const spec = snapshotBudgetChart();
      if (spec?.mix?.length) appendChartMix(mixEl, spec.mix);
    } else {
      mixEl.hidden = true;
    }
  }
  if (splitEl) {
    splitEl.innerHTML = "";
  }
}

function budgetExplainPrompt() {
  const { income, spent, leftover, needs, wants } = budgetTotals();
  const lines = (financeBudget.categories || [])
    .map((c) => `- ${categoryLabel(c)}: ${formatMoney(parseMoney(c.amount))}`)
    .join("\n");
  return [
    "Please explain this monthly plan in plain language. Educational only, not financial advice.",
    `Monthly take-home: ${formatMoney(income)}`,
    `Categories:\n${lines || "(none)"}`,
    `Spent: ${formatMoney(spent)}`,
    `Left: ${formatMoney(leftover)}`,
    `Needs total: ${formatMoney(needs)}. Wants total: ${formatMoney(wants)}.`,
    "Tell me what looks healthy, what looks tight, and one small next step.",
  ].join("\n");
}

function renderFinanceGoals() {
  const list = document.getElementById("financeGoalList");
  const empty = document.getElementById("financeGoalsEmpty");
  if (!list) return;
  list.innerHTML = "";
  if (empty) empty.classList.toggle("hidden", financeGoals.length > 0);
  financeGoals.forEach((goal) => {
    const monthly = goal.months ? goal.target / goal.months : goal.target;
    const card = document.createElement("article");
    card.className = "finance-goal-card";
    const title = document.createElement("h3");
    title.textContent = goal.name;
    const meta = document.createElement("p");
    meta.className = "finance-goal-meta";
    meta.textContent = t("finance_goal_meta", {
      target: formatMoney(goal.target),
      months: String(goal.months),
    });
    const monthlyEl = document.createElement("p");
    monthlyEl.className = "finance-goal-monthly";
    monthlyEl.textContent = t("finance_goal_monthly", { amount: formatMoney(monthly) });
    const compare = document.createElement("div");
    compare.className = "finance-goal-compare";
    const goalChart = snapshotGoalChart(goal);
    if (goalChart?.bars?.length) appendChartBars(compare, goalChart.bars);
    const actions = document.createElement("div");
    actions.className = "finance-goal-actions";
    const plan = document.createElement("button");
    plan.type = "button";
    plan.className = "primary-btn";
    plan.textContent = t("finance_plan_goal");
    plan.addEventListener("click", () => {
      sendFinancePrompt(
        [
          `Help me plan this savings goal. Educational only, not financial advice.`,
          `Goal: ${goal.name}`,
          `Target: ${formatMoney(goal.target)} in ${goal.months} months`,
          `That is about ${formatMoney(monthly)} per month.`,
          "Give a calm plan: where the monthly amount could come from, what to watch, and one first step.",
        ].join("\n"),
        snapshotGoalChart(goal),
      );
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-btn";
    remove.textContent = t("finance_remove");
    remove.addEventListener("click", () => {
      financeGoals = financeGoals.filter((g) => g.id !== goal.id);
      renderFinanceGoals();
      saveFinanceState();
    });
    actions.appendChild(plan);
    actions.appendChild(remove);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(monthlyEl);
    if (compare.childNodes.length) card.appendChild(compare);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function sendFinancePrompt(raw, chartSpec) {
  if (!gateFinanceSend()) return;
  const trimmed = String(raw || "").trim();
  if (!trimmed) return;
  pendingFinanceChart = sanitizeHubChartSpec(chartSpec) || pendingFinanceChart;
  setFinanceTab("ask");
  financeSessionOpen = true;
  syncFinanceLayout();
  void sendChatMessage("finance", trimmed, financeHistory, financeThread, financeStatus, financeFollowupSubmit);
}

function wireFinanceWorkspace() {
  const financeSearchFlow = wireSearchFlow({
    searchInput: financeSearchInput,
    searchSubmit: financeSearchSubmit,
    followupInput: financeFollowupInput,
    followupSubmit: financeFollowupSubmit,
    mode: "finance",
    history: financeHistory,
    threadEl: financeThread,
    statusEl: financeStatus,
    requireHonorCode: false,
    gate: gateFinanceSend,
    onFirstSend: () => {
      financeSessionOpen = true;
      syncFinanceLayout();
    },
  });
  wireStarterChipsAsSend(financeFollowupChips, financeSearchFlow.sendFromFollowup, financeFollowupSubmit, {
    readAloud: () => readLastAssistantAloud(financeHistory),
  });
  renderSmartFollowupChips(financeFollowupChips, financeHistory, "finance");

  document.getElementById("financeIncomeInput")?.addEventListener("input", (e) => {
    financeBudget.income = e.target.value;
    updateFinanceLeftover();
    saveFinanceState();
  });
  document.getElementById("financeAddCategoryBtn")?.addEventListener("click", () => {
    financeBudget.categories.push({
      id: `cat-${Date.now()}`,
      name: t("finance_cat_other"),
      amount: "",
    });
    renderFinanceBudget();
    saveFinanceState();
  });
  document.getElementById("financeExplainBudgetBtn")?.addEventListener("click", () => {
    if (!parseMoney(financeBudget.income)) {
      showToast(t("finance_need_income"));
      return;
    }
    sendFinancePrompt(budgetExplainPrompt(), snapshotBudgetChart());
  });
  document.getElementById("financeGoalForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = String(document.getElementById("financeGoalName")?.value || "").trim();
    const target = parseMoney(document.getElementById("financeGoalTarget")?.value);
    const months = Math.max(1, Math.min(120, Number(document.getElementById("financeGoalMonths")?.value) || 0));
    if (!name || !target || !months) {
      showToast(t("finance_need_goal"));
      return;
    }
    financeGoals.push({ id: `goal-${Date.now()}`, name, target, months });
    const nameEl = document.getElementById("financeGoalName");
    const targetEl = document.getElementById("financeGoalTarget");
    const monthsEl = document.getElementById("financeGoalMonths");
    if (nameEl) nameEl.value = "";
    if (targetEl) targetEl.value = "";
    if (monthsEl) monthsEl.value = "";
    renderFinanceGoals();
    saveFinanceState();
  });
}

initMarkdown();
initPwaInstallSupport();
setMainTab("chat");
wireSettingsUi();
wireHonorCodeModal();
wireFinanceDisclaimerModal();
wireDefaultPageHintModal();
wireEmptyStatePrompts();
wireCopyThreadButtons();
wireFinanceWorkspace();
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
  syncFinanceLayout();
  renderFinanceBudget();
  renderFinanceGoals();
};
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(restoreAfterPaint));
} else {
  window.setTimeout(restoreAfterPaint, 0);
}
