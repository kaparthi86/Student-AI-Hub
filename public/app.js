/** Ask-tab image attach (VQA / multimodal). Set `true` to show UI and send images; keep `false` to mute. */
const LEARN_VISION_ENABLED = false;

const authCard = document.getElementById("authCard");
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

const docFileInput = document.getElementById("docFileInput");
const docAnalyzeBtn = document.getElementById("docAnalyzeBtn");
const docFileMeta = document.getElementById("docFileMeta");
const notebookThread = document.getElementById("notebookThread");
const notebookStatus = document.getElementById("notebookStatus");

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
const FEEDBACK_REASONS = ["too_vague", "incorrect", "too_long", "not_my_level", "other"];
const USER_PREFS_KEY = "student_ai_user_prefs_v1";
const CHAT_SESSION_KEY = "student_ai_sessions_v1";
const DEFAULT_PAGE_HINT_DISMISSED_KEY = "student_ai_default_page_hint_dismissed_v1";
const PWA_INSTALL_BAR_DISMISSED_KEY = "student_ai_pwa_install_bar_dismissed_v1";
const LANGUAGE_HINT_DISMISSED_KEY = "student_ai_lang_hint_dismissed_v1";

let deferredInstallPrompt = null;
let chatSessionOpen = false;
let codeSessionOpen = false;
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
    signin_title: "Sign in",
    signin_tagline: "Continue with Google to use Ask, Code, and Notebook. Free for students - learn faster, code smarter.",
    free_for_students: "Free for students",
    continue_google: "Continue with Google",
    settings: "Settings",
    logout: "Logout",
    welcome: "Welcome",
    app_tagline: "Ask a question, get an answer, keep the conversation going.",
    tab_ask: "Ask",
    send: "Send",
    tab_code: "Code",
    tab_notebook: "Notebook",
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
    analyze_doc: "Analyze document",
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
    reading_summarizing: "Reading and summarizing...",
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
    pwa_install_title: "Install Student AI Hub",
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
  },
  es: {
    signin_title: "Iniciar sesiùn",
    signin_tagline: "Continùa con Google para usar Ask, Code y Notebook. Gratis para estudiantes: aprende mùs rùpido y programa mejor.",
    free_for_students: "Gratis para estudiantes",
    continue_google: "Continuar con Google",
    settings: "Configuraciùn",
    logout: "Cerrar sesiùn",
    welcome: "Bienvenido",
    app_tagline: "Haz una pregunta, obtùn una respuesta y sigue la conversaciùn.",
    tab_ask: "Preguntar",
    send: "Enviar",
    tab_code: "Cùdigo",
    tab_notebook: "Cuaderno",
    chat_title: "ùQuù quieres aprender hoy?",
    chat_placeholder: "Pregunta lo que sea... (p. ej., explica descenso de gradiente como si tuviera 15)",
    chat_hint: "Pulsa Enter para buscar. Shift+Enter para nueva lùnea.",
    chat_followup: "Haz una pregunta de seguimiento...",
    code_title: "Depura o aprende cùdigo",
    code_placeholder: "Pega cùdigo o describe el error...",
    code_hint: "Consejo: incluye mensajes de error y lo que esperabas.",
    code_followup: "Seguimiento...",
    notebook_hint:
      "Sube apuntes (.txt, .md, .csv, .json, .pdf). Obtendrùs resumen, conceptos clave, preguntas tipo quiz y un plan de estudio.",
    analyze_doc: "Analizar documento",
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
    language_hint: "ùCambiar el idioma de la interfaz a {lang}?",
    language_hint_desc: "Siempre puedes cambiarlo despuùs en Configuraciùn.",
    keep_english: "Seguir en inglùs",
    switch_lang: "Cambiar",
    you: "Tù",
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
  },
  hi: {
    signin_title: "Sign in karein",
    signin_tagline: "Google ke saath continue karke Ask, Code aur Notebook use karein. Students ke liye free.",
    free_for_students: "Students ke liye free",
    continue_google: "Google ke saath jari rakhen",
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
    analyze_doc: "Document analyze karein",
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
  },
  te: {
    signin_title: "Sign in cheyyandi",
    signin_tagline: "Google tho continue ayi Ask, Code mariyu Notebook use cheyyandi. Students ki free.",
    free_for_students: "Students ki free",
    continue_google: "Google to continue cheyyandi",
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
    analyze_doc: "Document analyze cheyyandi",
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
}

function applyTranslations() {
  const byIdText = {
    authSigninTitle: "signin_title",
    authSigninTagline: "signin_tagline",
    authEyebrow: "free_for_students",
    googleLoginBtn: "continue_google",
    openSettingsBtn: "settings",
    logoutBtn: "logout",
    welcomePrefix: "welcome",
    appTaglineMain: "app_tagline",
    tabChat: "tab_ask",
    tabCode: "tab_code",
    tabNotebook: "tab_notebook",
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
    pwaInstallDismiss: "pwa_not_now",
    defaultPageHintTitle: "default_title",
    closeDefaultPageHintBtn: "settings_close",
    defaultPageHintLead: "default_lead",
    defaultPageHintUrlLabel: "default_copy_address",
    copyDefaultPageUrlBtn: "copy",
    defaultPageHintExtensionNote: "default_extension_note",
    showDefaultPageStepsBtn: "show_steps",
    dismissDefaultPageHintBtn: "pwa_not_now",
  };
  Object.entries(byIdText).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  });
  if (chatSearchInput) chatSearchInput.placeholder = t("chat_placeholder");
  if (chatFollowupInput) chatFollowupInput.placeholder = t("chat_followup");
  if (codeSearchInput) codeSearchInput.placeholder = t("code_placeholder");
  if (codeFollowupInput) codeFollowupInput.placeholder = t("code_followup");
  const pwaIosSteps = document.getElementById("pwaIosSteps");
  if (pwaIosSteps) pwaIosSteps.textContent = t("pwa_ios_steps");
  const hintList = document.getElementById("defaultPageHintList");
  if (hintList) {
    hintList.innerHTML = "";
    [t("default_step_chrome"), t("default_step_safari"), t("default_step_ios")].forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      hintList.appendChild(li);
    });
  }
  [apiStatus, codeStatus, notebookStatus].forEach((el) => {
    if (!el) return;
    const key = el.dataset.i18nStatus || "status_ready";
    el.textContent = t(key);
  });
}

function setStatus(el, key) {
  if (!el) return;
  el.dataset.i18nStatus = key;
  el.textContent = t(key);
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

/** Starter prompts for in-chat follow-up chips (uses chat history). */
const CHAT_FOLLOWUP_STARTER_PROMPTS = {
  summarize:
    "Summarize your last answer in short bullet points. Highlight the key terms I should remember.\n\n",
  quiz:
    "Based on our conversation so far, give me a short quiz: questions, answer choices, and correct answers with brief explanations.\n\n",
  steps:
    "Explain that again step-by-step, with smaller steps and a simple example where it helps.\n\n",
};

/**
 * Starter chips send the prompt immediately (same path as Ask / Send).
 * Optional `customStarters`: map of data-starter key -> handler (runs instead of sending a prompt).
 */
function wireStarterChipsAsSend(container, promptMap, sendFn, busyButton, customStarters = null) {
  if (!container || !promptMap || typeof sendFn !== "function") return;
  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".starter-chip[data-starter]");
    if (!chip || !container.contains(chip)) return;
    if (busyButton?.disabled) return;
    const key = chip.getAttribute("data-starter");
    if (customStarters && typeof customStarters[key] === "function") {
      customStarters[key]();
      return;
    }
    const prompt = promptMap[key];
    if (typeof prompt !== "string") return;
    sendFn(prompt);
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
function readLastAssistantAloud() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    showToast(t("toast_read_aloud_not_supported"));
    return;
  }
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    stopReadAloud();
    showToast(t("toast_stopped"));
    return;
  }
  const raw = getLastAssistantMarkdownFromHistory(chatHistory);
  if (!String(raw).trim()) {
    showToast(t("toast_no_assistant_reply"));
    return;
  }
  const { plain } = getAssistantCopyFormats(raw);
  const text = String(plain || "").trim();
  if (!text) {
    showToast(t("toast_nothing_to_read"));
    return;
  }
  const maxChars = 32000;
  const toSpeak = text.length > maxChars ? `${text.slice(0, maxChars)}\n\n(Truncated for speech.)` : text;
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
  };
}

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_PREFS_KEY) || "{}");
    return {
      restoreSessions: parsed.restoreSessions !== false,
      uiLanguage: normalizeUiLanguage(parsed.uiLanguage),
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
      chatSessionOpen,
      codeSessionOpen,
    };
    localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota issues */
  }
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
    appendBubble(container, role, content, { mode, studyMode, imageDataUrl });
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
    chatSessionOpen = parsed.chatSessionOpen === true || chatHistory.length > 0;
    codeSessionOpen = parsed.codeSessionOpen === true || codeHistory.length > 0;
    renderThreadFromHistory(chatThread, chatHistory, "learn", "explain");
    renderThreadFromHistory(codeThread, codeHistory, "code", "explain");
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
  const raw = String(text);
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    return { plain: raw };
  }
  try {
    const html = marked.parse(raw);
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    return { html: clean };
  } catch {
    return { plain: raw };
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
}

function syncLearnLayout() {
  const showThread = chatSessionOpen || chatHistory.length > 0;
  chatSearchShell.classList.toggle("hidden", showThread);
  chatAnswerShell.classList.toggle("hidden", !showThread);
}

function syncCodeLayout() {
  const showThread = codeSessionOpen || codeHistory.length > 0;
  codeSearchShell.classList.toggle("hidden", showThread);
  codeAnswerShell.classList.toggle("hidden", !showThread);
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
  if (!res.ok) {
    let msg = "Could not submit feedback.";
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
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
      await submitAssistantFeedback({
        type: "message_feedback",
        rating: 1,
        reason: "helpful",
        mode,
        studyMode,
        assistantMessage: String(rawText || "").slice(0, 8000),
        createdAt: new Date().toISOString(),
      });
      lock(t("feedback_thanks"));
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
      await submitAssistantFeedback({
        type: "message_feedback",
        rating: -1,
        reason,
        mode,
        studyMode,
        assistantMessage: String(rawText || "").slice(0, 8000),
        createdAt: new Date().toISOString(),
      });
      lock(t("feedback_thanks_reason"));
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
     * @param {{ plain?: boolean }} opts ù use plain: true for non-markdown system messages only
     */
    setStreamingText(text, { plain = false } = {}) {
      const raw = String(text ?? "");
      if (plain || typeof marked === "undefined" || typeof DOMPurify === "undefined") {
        body.textContent = raw;
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

/**
 * Reads OpenAI-style SSE from /api/chat (stream: true). Invokes onDelta with the full text so far.
 * @returns {Promise<string>} final concatenated assistant text
 */
async function consumeChatSseStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
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
      full = applyStreamDelta(json, full, onDelta);
    }
  }
  if (lineBuf.trim()) {
    const line = lineBuf.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      const payload = line.slice(5).replace(/^\s*/, "");
      if (payload && payload !== "[DONE]") {
        try {
          const json = JSON.parse(payload);
          full = applyStreamDelta(json, full, onDelta);
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    }
  }
  return full;
}

/** @returns {Promise<boolean>} true if the exchange completed without a client-side failure. */
async function sendChatMessage(mode, message, history, threadEl, statusEl, sendBtn, studyMode = "explain", visionAttachment = null) {
  stopReadAloud();
  const attach = LEARN_VISION_ENABLED ? visionAttachment : null;
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed && !attach) return false;

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
  if (mode === "learn" && attach) {
    chatBody.imageBase64 = attach.base64;
    chatBody.imageMime = attach.mime;
  }

  sendBtn.disabled = true;
  setStatus(statusEl, "status_generating");

  const streamUi = startStreamingAssistantBubble(threadEl);
  streamUi.bubble.dataset.mode = mode;
  streamUi.bubble.dataset.studyMode = normalizeStudyMode(studyMode);
  /** Cap markdown re-renders during stream (~20/s) to keep long replies smooth on slow devices. */
  const STREAM_MD_MIN_MS = 50;
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
    streamUi.setStreamingText(pendingFull);
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
      try {
        const data = await response.json();
        output = typeof data.output === "string" && data.output.trim() ? data.output.trim() : output;
      } catch {
        try {
          const t = await response.text();
          if (t.trim()) output = t.trim().slice(0, 2000);
        } catch {
          /* keep default */
        }
      }
      appendBubble(threadEl, "assistant", output, { mode, studyMode: normalizeStudyMode(studyMode) });
      const userRow = { role: "user", content: trimmed };
      if (attach) {
        userRow.imageMime = attach.mime;
        userRow.imageBase64 = attach.base64;
      }
      history.push(userRow);
      history.push({ role: "assistant", content: output });
      saveSessionState();
      setStatus(statusEl, "status_ready");
      return true;
    }

    const fullOut = await consumeChatSseStream(response, scheduleDelta);

    cancelStreamPaintTimers();

    const finalText =
      String(fullOut || "").trim() ||
      t("stream_empty_fallback");
    const streamPlainOnly = !String(fullOut || "").trim();
    streamUi.setStreamingText(finalText, { plain: streamPlainOnly });
    streamUi.finalize(finalText);

    const userRow = { role: "user", content: trimmed };
    if (attach) {
      userRow.imageMime = attach.mime;
      userRow.imageBase64 = attach.base64;
    }
    history.push(userRow);
    history.push({ role: "assistant", content: finalText });
    saveSessionState();
    setStatus(statusEl, "status_ready");
    return true;
  } catch (error) {
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

function shouldOfferPwaInstallBar() {
  if (window.location.protocol === "file:") return false;
  if (isStandaloneWebAppDisplay()) return false;
  if (localStorage.getItem(PWA_INSTALL_BAR_DISMISSED_KEY) === "1") return false;
  return true;
}

function refreshPwaInstallBarUi() {
  const bar = document.getElementById("pwaInstallBar");
  const installBtn = document.getElementById("pwaInstallBtn");
  const iosBtn = document.getElementById("pwaIosHelpBtn");
  if (!bar || bar.classList.contains("hidden")) return;
  installBtn?.classList.toggle("hidden", !deferredInstallPrompt);
  iosBtn?.classList.toggle("hidden", !isLikelyIOSBrowser());
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

  dismiss?.addEventListener("click", () => {
    localStorage.setItem(PWA_INSTALL_BAR_DISMISSED_KEY, "1");
    bar?.classList.add("hidden");
    iosSteps?.classList.add("hidden");
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
  });

  iosBtn?.addEventListener("click", () => {
    if (!iosSteps) return;
    iosSteps.classList.toggle("hidden");
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
  void registerServiceWorkerIfEligible();
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

function maybeOfferDefaultPageHint() {
  if (defaultPageHintOfferedThisLoad) return;
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

function showApp(session) {
  const metadata = session?.user?.user_metadata || {};
  const email = session?.user?.email || "";
  const display = metadata.full_name || metadata.name || email.split("@")[0] || "Student";
  userName.textContent = display;
  authCard.classList.add("hidden");
  appCard.classList.remove("hidden");
  window.setTimeout(() => {
    maybeOfferPwaInstallBar();
  }, 850);
  maybeOfferDefaultPageHint();
}

function showAuth(message = "") {
  document.getElementById("pwaInstallBar")?.classList.add("hidden");
  document.getElementById("pwaIosSteps")?.classList.add("hidden");
  authCard.classList.remove("hidden");
  appCard.classList.add("hidden");
  authStatus.textContent = message;
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

logoutBtn.addEventListener("click", async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
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

wireStarterChipsAsSend(
  chatFollowupChips,
  CHAT_FOLLOWUP_STARTER_PROMPTS,
  chatSearchFlow.sendFromFollowup,
  chatFollowupSubmit,
  { readAloud: readLastAssistantAloud },
);

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
      showToast(err.message || "Could not read image");
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

docFileInput.addEventListener("change", () => {
  const f = docFileInput.files?.[0];
  docFileMeta.textContent = f ? `Selected: ${f.name} (${Math.round(f.size / 1024)} KB)` : "";
});

docAnalyzeBtn.addEventListener("click", async () => {
  const file = docFileInput.files?.[0];
  if (!file) {
    setStatus(notebookStatus, "choose_file_first");
    return;
  }

  notebookThread.innerHTML = "";
  appendBubble(notebookThread, "user", `Analyze uploaded file: ${file.name}`);

  docAnalyzeBtn.disabled = true;
  setStatus(notebookStatus, "reading_summarizing");

  try {
    const form = new FormData();
    form.append("document", file);
    const response = await fetchAuthed("/api/doc-insights", {
      method: "POST",
      headers: {},
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    const note = data.output || "No response.";
    const meta = data.charsUsed != null ? `\n\n_(Used up to ${data.charsUsed} characters from the document.)_` : "";
    appendBubble(notebookThread, "assistant", `${note}${meta}`, { mode: "notebook", studyMode: "explain" });
    setStatus(notebookStatus, "status_ready");
  } catch (error) {
    appendBubble(notebookThread, "assistant", `${t("error_prefix")}: ${error.message}`, { mode: "notebook", studyMode: "explain" });
    setStatus(notebookStatus, "status_failed");
    showToast(error.message || "Document analysis failed");
  } finally {
    docAnalyzeBtn.disabled = false;
  }
});

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

  openSettingsBtn?.addEventListener("click", () => {
    syncForm();
    settingsModal?.classList.remove("hidden");
  });
  closeSettingsBtn?.addEventListener("click", () => settingsModal?.classList.add("hidden"));
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });
  saveSettingsBtn?.addEventListener("click", () => {
    const prefs = {
      restoreSessions: prefRestoreSessions?.checked !== false,
      uiLanguage: normalizeUiLanguage(prefUiLanguage?.value || "en"),
    };
    savePrefs(prefs);
    setUiLanguage(prefs.uiLanguage);
    saveSessionState();
    settingsModal?.classList.add("hidden");
    showToast(t("settings_saved_toast"));
  });
}

const prefsAtBoot = loadPrefs();
setUiLanguage(prefsAtBoot.uiLanguage);

initMarkdown();
initPwaInstallSupport();
setMainTab("chat");
restoreSessionStateIfEnabled();
syncLearnLayout();
syncCodeLayout();
wireSettingsUi();
wireDefaultPageHintModal();
maybeOfferLanguageSuggestion();
hydratePromptFromUrl();
initAuth();
initBetaBanner();
