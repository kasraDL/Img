export type Lang = "en" | "fa";

/**
 * Only the bot's OWN chat messages are translated here. Generated motivation
 * letters and emails are deliberately always drafted in English by
 * src/services/workersAI.ts, regardless of UI language — that's what
 * international applications actually need, translating those would hurt
 * the student, not help them.
 */
const STRINGS: Record<string, Record<Lang, string>> = {
  welcome: {
    en:
      "👋 Welcome! I help students find Bachelor/Master/PhD positions that match their " +
      "background, and draft the motivation letters and emails to apply.\n\n" +
      "Send me your CV as a *PDF file* to get started.\n\n" +
      "Type /help any time to see everything I can do.",
    fa:
      "👋 خوش اومدی! من کمکت می‌کنم موقعیت‌های کارشناسی/ارشد/دکتری مناسب پیشینه‌ت رو پیدا کنم، " +
      "و ایمیل و انگیزه‌نامه برای اپلای کردن برات بنویسم.\n\n" +
      "برای شروع، رزومه‌ت رو به‌صورت فایل *PDF* بفرست.\n\n" +
      "هر وقت خواستی همه‌ی امکانات رو ببینی، /help رو بزن.",
  },
  ask_cv_first: {
    en: "Please send your CV as a PDF file to get started.",
    fa: "لطفاً برای شروع، رزومه‌ت رو به‌صورت فایل PDF بفرست.",
  },
  cv_not_pdf: {
    en: "Please send your CV as a *PDF* file.",
    fa: "لطفاً رزومه‌ت رو به‌صورت فایل *PDF* بفرست.",
  },
  cv_reading: {
    en: "📄 Got it — reading your CV...",
    fa: "📄 دریافت شد — دارم رزومه‌ت رو می‌خونم...",
  },
  cv_unreadable: {
    en:
      "I couldn't read text from that PDF (it may be a scanned image). " +
      "Please export your CV as a text-based PDF and resend it.",
    fa:
      "نتونستم متن این PDF رو بخونم (شاید اسکن‌شده باشه). " +
      "لطفاً رزومه رو به‌صورت PDF متنی خروجی بگیر و دوباره بفرست.",
  },
  cv_summary_prefix: {
    en: "✅ Here's what I found in your CV:",
    fa: "✅ این چیزیه که از رزومه‌ت فهمیدم:",
  },
  ask_degree: {
    en: "What level are you searching for?",
    fa: "دنبال کدوم مقطع می‌گردی؟",
  },
  ask_field: {
    en:
      "Great. What field or research area should I focus on? " +
      '(e.g. "structural engineering, machine learning for optimization")',
    fa:
      "عالی. روی چه رشته یا حوزه‌ی پژوهشی تمرکز کنم؟ " +
      '(مثلاً «مهندسی سازه، یادگیری ماشین برای بهینه‌سازی»)',
  },
  ask_country: {
    en: "Any preferred country or region? Reply with one, or send \"skip\" for no preference.",
    fa: "کشور یا منطقه‌ی خاصی مدنظرته؟ اسمشو بنویس، یا اگه فرقی نمی‌کنه بنویس «skip».",
  },
  searching: {
    en: "🔎 Searching for matching positions, this can take a moment...",
    fa: "🔎 دارم دنبال موقعیت‌های مناسب می‌گردم، یکم طول می‌کشه...",
  },
  no_results_fallback: {
    en:
      "The free search didn't return anything usable this time (the search source may be " +
      "rate-limiting or its page layout changed). Here are direct search links for your field " +
      "instead:",
    fa:
      "این‌بار جستجوی رایگان نتیجه‌ی قابل‌استفاده‌ای نداد (ممکنه منبع جستجو موقتاً محدودیت گذاشته " +
      "یا ساختار صفحه‌ش عوض شده باشه). به‌جاش این لینک‌های جستجوی مستقیم برای رشته‌ت رو دارم:",
  },
  paste_hint: {
    en:
      "\n\nOnce you find a position you like, paste its title and description here and I'll " +
      "draft a tailored motivation letter or email for it.",
    fa:
      "\n\nهر موقع موقعیت خوبی پیدا کردی، عنوان و توضیحاتشو همینجا بفرست تا " +
      "انگیزه‌نامه یا ایمیل مخصوصش رو برات بنویسم.",
  },
  results_header: {
    en: "🎯 Found {{count}} matching position(s):",
    fa: "🎯 {{count}} موقعیت مرتبط پیدا شد:",
  },
  results_footer: {
    en: "Tap the buttons under each card below to draft a letter/email, save, or dismiss it.",
    fa: "برای نوشتن انگیزه‌نامه/ایمیل، ذخیره، یا رد کردن هر مورد، روی دکمه‌های زیر کارتش بزن.",
  },
  no_saved_positions: {
    en: "No saved positions yet. Send /start or /newsearch to run a search.",
    fa: "هنوز موقعیتی ذخیره نشده. با /start یا /newsearch یه جستجو انجام بده.",
  },
  linkedin_reminder_header: {
    en: "📌 Also, don't forget to check your saved LinkedIn page(s) manually — I can't auto-check those:",
    fa: "📌 ضمناً یادت نره صفحه‌ی لینکدین ذخیره‌شده‌تو دستی چک کنی — من نمی‌تونم اونا رو خودکار بررسی کنم:",
  },
  linkedin_reminder_footer: {
    en: "Found something there? Paste the post text here and I'll score it and draft a letter/email.",
    fa: "چیز خوبی پیدا کردی؟ متن پستشو همینجا بفرست تا امتیازدهی کنم و انگیزه‌نامه/ایمیل بنویسم.",
  },
  generating: {
    en: "✍️ Drafting that now...",
    fa: "✍️ دارم می‌نویسمش...",
  },
  saved_confirmation: {
    en: "⭐ Saved to your shortlist.",
    fa: "⭐ به لیست ذخیره‌شده‌ها اضافه شد.",
  },
  dismissed_confirmation: {
    en: "🚫 Dismissed.",
    fa: "🚫 رد شد.",
  },
  applied_confirmation: {
    en: "✅ Marked as applied. Good luck!",
    fa: "✅ به‌عنوان اپلای‌شده ثبت شد. موفق باشی!",
  },
  language_prompt: {
    en: "Choose your language:",
    fa: "زبان رو انتخاب کن:",
  },
  language_set: {
    en: "Language set to English.",
    fa: "زبان روی فارسی تنظیم شد.",
  },
  source_added_channel: {
    en: "✅ Added Telegram channel @{{name}} to your sources.",
    fa: "✅ کانال تلگرام @{{name}} به منابعت اضافه شد.",
  },
  source_added_linkedin: {
    en:
      "Saved {{name}} as a source to remember.\n\n" +
      "Heads up: I can't automatically check LinkedIn pages for new posts — there's no free, " +
      "official way to do that. I'll remind you to check it manually whenever you run a search. " +
      "If you see a relevant post there, just paste its text here and I'll score it and draft a " +
      "letter/email for it, same as any other listing.",
    fa:
      "{{name}} به‌عنوان منبع ذخیره شد.\n\n" +
      "توجه: نمی‌تونم صفحات لینکدین رو خودکار برای پست جدید چک کنم — راه رایگان و رسمی‌ای برای " +
      "این کار وجود نداره. هر بار جستجو کنی، یادت می‌ندازم که خودت دستی چکش کنی. اگه پست " +
      "مرتبطی دیدی، متنشو همینجا بفرست تا مثل هر موقعیت دیگه امتیازدهی و براش نامه/ایمیل بنویسم.",
  },
  sources_empty: {
    en:
      "No extra sources yet. Add one with:\n" +
      "`/addchannel channelusername` (auto-checked, free)\n" +
      "`/addlinkedin page-name-or-url` (manual reminder only)",
    fa:
      "هنوز منبع اضافه‌ای نداری. با این‌ها اضافه کن:\n" +
      "`/addchannel channelusername` (خودکار چک می‌شه، رایگان)\n" +
      "`/addlinkedin page-name-or-url` (فقط یادآوری دستی)",
  },
  source_removed: {
    en: "Removed.",
    fa: "حذف شد.",
  },
  source_not_found: {
    en: "Couldn't find that source ID.",
    fa: "همچین شناسه‌ای پیدا نشد.",
  },
  help: {
    en:
      "*What I can do:*\n\n" +
      "📄 /start — begin / upload a new CV\n" +
      "🔍 /newsearch — search again with your CV already on file\n" +
      "📋 /positions — show your latest results again\n" +
      "⭐ /saved — positions you've shortlisted\n" +
      "✅ /applied — positions you've marked as applied\n" +
      "📊 /report — download your applications tracker as an Excel file\n" +
      "📡 /addchannel — auto-check a public Telegram channel\n" +
      "💼 /addlinkedin — save a LinkedIn page as a manual-check reminder\n" +
      "🗂 /sources — list your extra sources\n" +
      "🌐 /language — switch between English and Persian\n\n" +
      "You can also just *paste any position's text* (from LinkedIn or anywhere) any time, " +
      "and I'll score it against your CV and offer to draft a letter/email for it.\n\n" +
      "When you generate an email for a position, I'll also check the listing page for the " +
      "professor's contact info, prepare a one-tap send link (opens your own mail app), and " +
      "follow up automatically with a reminder draft if there's no reply after 10 days.",
    fa:
      "*کارهایی که می‌تونم انجام بدم:*\n\n" +
      "📄 /start — شروع / آپلود رزومه‌ی جدید\n" +
      "🔍 /newsearch — جستجوی دوباره با رزومه‌ی موجود\n" +
      "📋 /positions — نمایش دوباره‌ی آخرین نتایج\n" +
      "⭐ /saved — موقعیت‌هایی که ذخیره کردی\n" +
      "✅ /applied — موقعیت‌هایی که اپلای کردی\n" +
      "📊 /report — دانلود فایل اکسل پیگیری اپلای‌هات\n" +
      "📡 /addchannel — چک خودکار یک کانال عمومی تلگرام\n" +
      "💼 /addlinkedin — ذخیره‌ی یک صفحه‌ی لینکدین برای یادآوری دستی\n" +
      "🗂 /sources — لیست منابع اضافه‌ت\n" +
      "🌐 /language — تغییر زبان بین انگلیسی و فارسی\n\n" +
      "همچنین هر وقت خواستی می‌تونی *متن یک موقعیت* (از لینکدین یا هرجای دیگه) رو بفرستی تا " +
      "نسبت به رزومه‌ت امتیازدهی کنم و پیشنهاد نامه/ایمیل بدم.\n\n" +
      "وقتی برای یه موقعیت ایمیل می‌سازم، اطلاعات تماس استاد رو هم از صفحه‌ی آگهی چک می‌کنم، " +
      "یه لینک ارسال یک‌تیکی آماده می‌کنم (اپ ایمیل خودتو باز می‌کنه)، و اگه تا ۱۰ روز جواب نیاد " +
      "خودم یه پیش‌نویس پیگیری برات می‌فرستم.",
  },
  degree_bachelor: { en: "🎓 Bachelor", fa: "🎓 کارشناسی" },
  degree_master: { en: "🎓 Master", fa: "🎓 کارشناسی ارشد" },
  degree_phd: { en: "🎓 PhD", fa: "🎓 دکتری" },
  btn_letter: { en: "📄 Letter", fa: "📄 انگیزه‌نامه" },
  btn_email: { en: "✉️ Email", fa: "✉️ ایمیل" },
  btn_save: { en: "⭐ Save", fa: "⭐ ذخیره" },
  btn_applied: { en: "✅ Applied", fa: "✅ اپلای شد" },
  btn_dismiss: { en: "🚫 Dismiss", fa: "🚫 رد کردن" },
  letter_draft_prefix: { en: "*📄 Motivation letter draft:*", fa: "*📄 پیش‌نویس انگیزه‌نامه:*" },
  email_draft_prefix: { en: "*✉️ Email draft:*", fa: "*✉️ پیش‌نویس ایمیل:*" },
  saved_list_header: { en: "⭐ Your shortlisted positions:", fa: "⭐ موقعیت‌های ذخیره‌شده‌ت:" },
  applied_list_header: { en: "✅ Positions you've applied to:", fa: "✅ موقعیتی‌هایی که اپلای کردی:" },
  saved_list_empty: { en: "Nothing shortlisted yet — tap ⭐ Save on any result.", fa: "هنوز چیزی ذخیره نکردی — روی هر نتیجه دکمه‌ی ⭐ ذخیره رو بزن." },
  applied_list_empty: { en: "No applications marked yet — tap ✅ Applied once you apply.", fa: "هنوز هیچ اپلایی ثبت نکردی — بعد از اپلای، دکمه‌ی ✅ اپلای شد رو بزن." },
  extracting_details: {
    en: "🔎 Looking up contact details from the listing...",
    fa: "🔎 دارم اطلاعات تماس رو از صفحه‌ی آگهی پیدا می‌کنم...",
  },
  ask_professor_email: {
    en:
      "I couldn't find a direct professor email on this listing (many positions are apply-via-portal " +
      "only). If you have one, send it now — otherwise reply \"skip\" and I'll prepare the draft " +
      "without it, and you can apply via the listing link.",
    fa:
      "روی این آگهی ایمیل مستقیم استاد پیدا نکردم (خیلی از موقعیت‌ها فقط از طریق پورتال اپلای می‌شن). " +
      "اگه ایمیلی داری همین‌الان بفرست — وگرنه بنویس «skip» تا پیش‌نویس رو بدون اون آماده کنم و از طریق لینک آگهی اپلای کنی.",
  },
  application_prepared: {
    en: "✅ Draft ready below. Review it, then tap Send when you're happy with it.",
    fa: "✅ پیش‌نویس آماده‌ست. بازبینی‌ش کن و وقتی راضی بودی، دکمه‌ی ارسال رو بزن.",
  },
  btn_send_email: { en: "📤 Open to Send", fa: "📤 باز کردن برای ارسال" },
  btn_mark_sent: { en: "✔️ Mark as Sent", fa: "✔️ ثبت به‌عنوان ارسال‌شده" },
  marked_sent_confirmation: {
    en: "✅ Marked as sent. I'll check in with a follow-up draft if there's no reply after 10 days.",
    fa: "✅ به‌عنوان ارسال‌شده ثبت شد. اگه تا ۱۰ روز جواب نیاد، یه پیش‌نویس پیگیری برات آماده می‌کنم.",
  },
  report_building: {
    en: "📊 Building your applications tracker...",
    fa: "📊 دارم فایل پیگیری اپلای‌هاتو می‌سازم...",
  },
  report_empty: {
    en: "No applications yet — generate a 📄 Letter or ✉️ Email for a position first.",
    fa: "هنوز اپلایی ثبت نشده — اول برای یه موقعیت 📄 انگیزه‌نامه یا ✉️ ایمیل بساز.",
  },
  report_caption: {
    en: "📊 Your applications tracker ({{count}} total)",
    fa: "📊 فایل پیگیری اپلای‌هات ({{count}} مورد)",
  },
  reminder_notification: {
    en: "🔔 It's been 10+ days since you applied to *{{title}}* with no reply yet. Here's a follow-up draft:",
    fa: "🔔 بیش از ۱۰ روزه که برای *{{title}}* اپلای کردی و هنوز جوابی نیومده. این یه پیش‌نویس پیگیریه:",
  },
};

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = STRINGS[key]?.[lang] ?? STRINGS[key]?.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return s;
}

export function detectLanguage(telegramLanguageCode?: string): Lang {
  return telegramLanguageCode?.toLowerCase().startsWith("fa") ? "fa" : "en";
}
