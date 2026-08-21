import type {
  Env,
  DegreeLevel,
  FundingPreference,
  PositionType,
  SearchFilters,
  PositionListing,
  PositionDetails,
  SessionState,
} from "../types";

import {
  TelegramClient,
  InlineButton,
} from "../services/telegramApi";

import { extractTextFromPdf } from "../services/pdf";

import {
  extractProfileFromCV,
  matchPositionsToProfile,
  generateMotivationLetter,
  generateApplicationEmail,
} from "../services/workersAI";

import {
  searchPositions,
  fallbackSearchLinks,
} from "../services/search";

import { fetchChannelPosts } from "../services/telegramChannels";
import { normalizeLinkedInIdentifier } from "../services/linkedin";
import { extractPositionDetails } from "../services/positionDetails";
import { buildMailtoLink } from "../services/mailto";
import { buildApplicationsWorkbook } from "../services/excel";
import { getSession, setSession } from "../services/session";
import {
  t,
  detectLanguage,
  Lang,
} from "../services/i18n";

import {
  upsertStudent,
  getStudentLanguage,
  setStudentLanguage,
  insertCvHistory,
  getCvHistory,
  getLatestCvHistoryId,
  insertSearchRequest,
  insertMatchedPositions,
  getLatestMatchedPositions,
  getPositionsByStatus,
  updateMatchedPositionStatus,
  getMatchedPositionWithContext,
  saveGeneratedDocument,
  addMonitoredSource,
  listMonitoredSources,
  removeMonitoredSource,
  getOrCreateApplication,
  getApplicationById,
  updateApplicationDetails,
  setApplicationDraft,
  setApplicationStatus,
  incrementReminderCount,
  listApplicationsForChat,
  StoredMatchedPosition,
} from "../db/queries";

// =============================================================================
// TELEGRAM UPDATE TYPES
// =============================================================================

interface TelegramUpdate {
  message?: {
    chat: {
      id: number;
    };

    from?: {
      username?: string;
      first_name?: string;
      language_code?: string;
    };

    text?: string;

    document?: {
      file_id: string;
      mime_type?: string;
      file_name?: string;
    };
  };

  callback_query?: {
    id: string;

    data?: string;

    message?: {
      chat: {
        id: number;
      };

      message_id: number;
    };
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_RESULTS_TO_SHOW = 8;
const MAX_CARDS = 5;
const MAX_SAVED_CARDS = 10;

// =============================================================================
// DEGREE
// =============================================================================

function normalizeDegree(
  text: string
): DegreeLevel | null {
  const value = text
    .trim()
    .toLowerCase();

  if (
    value.startsWith("bach") ||
    (
      value.includes("کارشناسی") &&
      !value.includes("ارشد")
    )
  ) {
    return "bachelor";
  }

  if (
    value.startsWith("mast") ||
    value.startsWith("msc") ||
    value.includes("ارشد")
  ) {
    return "master";
  }

  if (
    value.startsWith("phd") ||
    value.startsWith("doctor") ||
    value.startsWith("doct") ||
    value.includes("دکتری") ||
    value.includes("دکترا")
  ) {
    return "phd";
  }

  return null;
}

function degreeKeyboard(
  lang: Lang
): InlineButton[][] {
  return [
    [
      {
        text: t(
          lang,
          "degree_bachelor"
        ),
        callback_data: "deg:bachelor",
      },
      {
        text: t(
          lang,
          "degree_master"
        ),
        callback_data: "deg:master",
      },
      {
        text: t(
          lang,
          "degree_phd"
        ),
        callback_data: "deg:phd",
      },
    ],
  ];
}

// =============================================================================
// SEARCH FILTERS
// =============================================================================

function searchFiltersKeyboard(
  lang: Lang,
  filters?: SearchFilters
): InlineButton[][] {
  const countries =
    filters?.countries?.length
      ? `🌍 Country (${filters.countries.length})`
      : "🌍 Country";

  const funding =
    filters?.funding === "funded"
      ? "💰 Funding: Funded"
      : filters?.funding === "self_funded"
        ? "💰 Funding: Self-funded"
        : filters?.funding === "both"
          ? "💰 Funding: Both"
          : "💰 Funding";

  const field =
    filters?.field
      ? `🏗 Field: ${filters.field}`
      : "🏗 Field";

  const researchArea =
    filters?.research_area
      ? `🔬 Research Area: ${filters.research_area}`
      : "🔬 Research Area";

  const positionTypes =
    filters?.position_types?.length
      ? `🎓 Position Type (${filters.position_types.length})`
      : "🎓 Position Type";

  const keywords =
    filters?.keywords
      ? `🔎 Keywords: ${filters.keywords.slice(0, 25)}`
      : "🔎 Keywords";

  const minimumMatch =
    filters?.minimum_match_percentage !==
    undefined
      ? `📊 Minimum Match: ${filters.minimum_match_percentage}%`
      : "📊 Minimum Match";

  const deadline =
    filters?.deadline_required
      ? "📅 Deadline: Required"
      : "📅 Deadline";

  return [
    [
      {
        text: countries,
        callback_data: "filter:country",
      },
    ],
    [
      {
        text: funding,
        callback_data: "filter:funding",
      },
    ],
    [
      {
        text: field,
        callback_data: "filter:field",
      },
    ],
    [
      {
        text: researchArea,
        callback_data: "filter:research_area",
      },
    ],
    [
      {
        text: positionTypes,
        callback_data: "filter:position_type",
      },
    ],
    [
      {
        text: keywords,
        callback_data: "filter:keywords",
      },
    ],
    [
      {
        text: minimumMatch,
        callback_data: "filter:min_match",
      },
    ],
    [
      {
        text: deadline,
        callback_data: "filter:deadline",
      },
    ],
    [
      {
        text: "🔍 Search",
        callback_data: "filter:search",
      },
    ],
  ];
}

// =============================================================================
// COUNTRY
// =============================================================================

function countryKeyboard(
  selected: string[] = []
): InlineButton[][] {
  const countries = [
    "Canada",
    "USA",
    "UK",
    "Germany",
    "France",
    "Netherlands",
    "Switzerland",
    "Sweden",
    "Norway",
    "Finland",
    "Denmark",
    "Australia",
    "New Zealand",
    "Austria",
    "Belgium",
    "Ireland",
    "Italy",
    "Spain",
    "Japan",
    "South Korea",
  ];

  const buttons: InlineButton[][] = [];

  for (
    let i = 0;
    i < countries.length;
    i += 2
  ) {
    const row: InlineButton[] = [];

    for (
      const country of countries.slice(i, i + 2)
    ) {
      const selectedCountry =
        selected.includes(country);

      row.push({
        text: selectedCountry
          ? `✅ ${country}`
          : country,

        callback_data:
          `country:${country}`,
      });
    }

    buttons.push(row);
  }

  buttons.push([
    {
      text: "🌍 All Countries",
      callback_data: "country:all",
    },
  ]);

  buttons.push([
    {
      text: "⬅️ Back",
      callback_data: "filter:main",
    },
  ]);

  return buttons;
}

// =============================================================================
// FUNDING
// =============================================================================

function fundingKeyboard(
  selected?: FundingPreference
): InlineButton[][] {
  return [
    [
      {
        text:
          selected === "funded"
            ? "✅ 💰 Funded"
            : "💰 Funded",

        callback_data:
          "funding:funded",
      },
    ],
    [
      {
        text:
          selected === "self_funded"
            ? "✅ 💳 Self-funded"
            : "💳 Self-funded",

        callback_data:
          "funding:self_funded",
      },
    ],
    [
      {
        text:
          selected === "both"
            ? "✅ 🔄 Both"
            : "🔄 Both",

        callback_data:
          "funding:both",
      },
    ],
    [
      {
        text: "⬅️ Back",
        callback_data: "filter:main",
      },
    ],
  ];
}

// =============================================================================
// FIELD
// =============================================================================

function fieldKeyboard(
  selected?: string
): InlineButton[][] {
  const fields = [
    "Engineering",
    "Computer Science",
    "Environmental Science",
    "Architecture",
    "Business",
    "Economics",
    "Medicine",
    "Other",
  ];

  return [
    ...fields.map((field) => [
      {
        text:
          selected === field
            ? `✅ ${field}`
            : field,

        callback_data:
          `field:${field}`,
      },
    ]),

    [
      {
        text: "⬅️ Back",
        callback_data: "filter:main",
      },
    ],
  ];
}

// =============================================================================
// RESEARCH AREA
// =============================================================================

function researchAreaKeyboard(
  field?: string,
  selected?: string
): InlineButton[][] {
  let areas: string[];

  switch (field) {
    case "Engineering":
      areas = [
        "Civil Engineering",
        "Structural Engineering",
        "Mechanical Engineering",
        "Electrical Engineering",
        "Chemical Engineering",
        "Transportation Engineering",
        "Water Resources",
      ];
      break;

    case "Computer Science":
      areas = [
        "Artificial Intelligence",
        "Machine Learning",
        "Computer Vision",
        "Data Science",
        "Software Engineering",
        "Robotics",
      ];
      break;

    case "Environmental Science":
      areas = [
        "Environmental Engineering",
        "Water Treatment",
        "Wastewater",
        "Climate Science",
        "Sustainability",
      ];
      break;

    default:
      areas = ["Other"];
      break;
  }

  return [
    ...areas.map((area) => [
      {
        text:
          selected === area
            ? `✅ ${area}`
            : area,

        callback_data:
          `research:${area}`,
      },
    ]),

    [
      {
        text: "⬅️ Back",
        callback_data: "filter:main",
      },
    ],
  ];
}

// =============================================================================
// POSITION TYPE
// =============================================================================

function positionTypeKeyboard(
  selected: PositionType[] = []
): InlineButton[][] {
  const types: Array<{
    value: PositionType;
    label: string;
  }> = [
    {
      value: "phd",
      label: "🎓 PhD",
    },
    {
      value: "research_assistant",
      label: "🔬 Research Assistant",
    },
    {
      value: "research_fellow",
      label: "🧑‍🔬 Research Fellow",
    },
    {
      value: "masters",
      label: "🎓 Master's",
    },
    {
      value: "bachelor",
      label: "🎓 Bachelor's",
    },
    {
      value: "internship",
      label: "💼 Internship",
    },
    {
      value: "other",
      label: "📌 Other",
    },
  ];

  return [
    ...types.map((type) => [
      {
        text:
          selected.includes(type.value)
            ? `✅ ${type.label}`
            : type.label,

        callback_data:
          `ptype:${type.value}`,
      },
    ]),

    [
      {
        text: "⬅️ Back",
        callback_data: "filter:main",
      },
    ],
  ];
}

// =============================================================================
// LANGUAGE
// =============================================================================

function languageKeyboard(): InlineButton[][] {
  return [
    [
      {
        text: "🇬🇧 English",
        callback_data: "lang:en",
      },
      {
        text: "🇮🇷 فارسی",
        callback_data: "lang:fa",
      },
    ],
  ];
}

// =============================================================================
// POSITION CARD
// =============================================================================

function positionCardKeyboard(
  lang: Lang,
  id: number
): InlineButton[][] {
  return [
    [
      {
        text: t(
          lang,
          "btn_letter"
        ),
        callback_data:
          `letter:${id}`,
      },
      {
        text: t(
          lang,
          "btn_email"
        ),
        callback_data:
          `email:${id}`,
      },
    ],
    [
      {
        text: t(
          lang,
          "btn_save"
        ),
        callback_data:
          `save:${id}`,
      },
      {
        text: t(
          lang,
          "btn_applied"
        ),
        callback_data:
          `applied:${id}`,
      },
    ],
    [
      {
        text: t(
          lang,
          "btn_dismiss"
        ),
        callback_data:
          `dismiss:${id}`,
      },
    ],
  ];
}

// =============================================================================
// SAFE FILTER BUILDER
// =============================================================================

function buildFilters(
  session: SessionState,
  overrides?: Partial<SearchFilters>
): SearchFilters {
  return {
    ...(session.search_filters ?? {}),

    degree_level:
      overrides?.degree_level ??
      session.search_filters?.degree_level ??
      session.degree_level ??
      "phd",

    countries:
      overrides?.countries ??
      session.search_filters?.countries ??
      [],

    ...overrides,
  };
}

// =============================================================================
// MAIN UPDATE HANDLER
// =============================================================================

export async function handleUpdate(
  update: TelegramUpdate,
  env: Env
): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(
      update.callback_query,
      env
    );

    return;
  }

  const msg = update.message;

  if (!msg) {
    return;
  }

  const chatId =
    msg.chat.id;

  const tg =
    new TelegramClient(
      env.TELEGRAM_BOT_TOKEN
    );

  await upsertStudent(
    env.DB,
    chatId,
    msg.from?.username,
    msg.from?.first_name,
    detectLanguage(
      msg.from?.language_code
    )
  );

  const lang =
    await getStudentLanguage(
      env.DB,
      chatId
    );

  const session =
    await getSession(
      env.SESSIONS,
      chatId
    );

  const text =
    msg.text?.trim();

  // ===========================================================================
  // GLOBAL COMMANDS
  // ===========================================================================

  if (text === "/start") {
    await setSession(
      env.SESSIONS,
      chatId,
      {
        step: "awaiting_cv",
      }
    );

    await tg.sendMessage(
      chatId,
      t(lang, "welcome")
    );

    return;
  }

  if (text === "/help") {
    await tg.sendMessage(
      chatId,
      t(lang, "help")
    );

    return;
  }

  if (text === "/language") {
    await tg.sendMessage(
      chatId,
      t(
        lang,
        "language_prompt"
      ),
      {
        inlineKeyboard:
          languageKeyboard(),
      }
    );

    return;
  }

  if (text === "/positions") {
    const positions =
      await getLatestMatchedPositions(
        env.DB,
        chatId
      );

    await replyWithPositionsList(
      tg,
      lang,
      chatId,
      positions,
      t(
        lang,
        "no_saved_positions"
      )
    );

    return;
  }

  if (text === "/saved") {
    const positions =
      await getPositionsByStatus(
        env.DB,
        chatId,
        "shortlisted"
      );

    await replyWithPositionCards(
      tg,
      lang,
      chatId,
      positions,
      t(
        lang,
        "saved_list_header"
      ),
      t(
        lang,
        "saved_list_empty"
      )
    );

    return;
  }

  if (text === "/applied") {
    const positions =
      await getPositionsByStatus(
        env.DB,
        chatId,
        "applied"
      );

    await replyWithPositionCards(
      tg,
      lang,
      chatId,
      positions,
      t(
        lang,
        "applied_list_header"
      ),
      t(
        lang,
        "applied_list_empty"
      )
    );

    return;
  }

  if (text === "/report") {
    const applications =
      await listApplicationsForChat(
        env.DB,
        chatId
      );

    if (
      applications.length === 0
    ) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "report_empty"
        )
      );

      return;
    }

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "report_building"
      )
    );

    const workbook =
      buildApplicationsWorkbook(
        applications
      );

    await tg.sendDocument(
      chatId,
      `applications-${chatId}.xlsx`,
      workbook,
      t(
        lang,
        "report_caption",
        {
          count:
            applications.length,
        }
      )
    );

    return;
  }

  // ===========================================================================
  // NEW SEARCH
  // ===========================================================================

  if (text === "/newsearch") {
    const cvHistoryId =
      await getLatestCvHistoryId(
        env.DB,
        chatId
      );

    if (!cvHistoryId) {
      await setSession(
        env.SESSIONS,
        chatId,
        {
          step: "awaiting_cv",
        }
      );

      await tg.sendMessage(
        chatId,
        t(
          lang,
          "ask_cv_first"
        )
      );

      return;
    }

    const filters: SearchFilters = {
      degree_level: "phd",
      countries: [],
    };

    await setSession(
      env.SESSIONS,
      chatId,
      {
        step:
          "awaiting_degree_level",

        cv_history_id:
          cvHistoryId,

        search_filters:
          filters,
      }
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "ask_degree"
      ),
      {
        inlineKeyboard:
          degreeKeyboard(lang),
      }
    );

    return;
  }

  // ===========================================================================
  // MONITORED TELEGRAM CHANNEL
  // ===========================================================================

  if (
    text?.startsWith(
      "/addchannel"
    )
  ) {
    const username =
      text
        .replace(
          "/addchannel",
          ""
        )
        .trim();

    if (!username) {
      await tg.sendMessage(
        chatId,
        "Usage: `/addchannel channelusername` — the channel must be public."
      );

      return;
    }

    const clean =
      username.replace(
        /^@/,
        ""
      );

    await addMonitoredSource(
      env.DB,
      chatId,
      "telegram_channel",
      clean
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "source_added_channel",
        {
          name: clean,
        }
      )
    );

    return;
  }

  // ===========================================================================
  // MONITORED LINKEDIN
  // ===========================================================================

  if (
    text?.startsWith(
      "/addlinkedin"
    )
  ) {
    const value =
      text
        .replace(
          "/addlinkedin",
          ""
        )
        .trim();

    if (!value) {
      await tg.sendMessage(
        chatId,
        "Usage: `/addlinkedin company-page-name-or-url`"
      );

      return;
    }

    const identifier =
      normalizeLinkedInIdentifier(
        value
      );

    await addMonitoredSource(
      env.DB,
      chatId,
      "linkedin_page",
      identifier
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "source_added_linkedin",
        {
          name: identifier,
        }
      )
    );

    return;
  }

  // ===========================================================================
  // SOURCES
  // ===========================================================================

  if (text === "/sources") {
    const sources =
      await listMonitoredSources(
        env.DB,
        chatId
      );

    if (
      sources.length === 0
    ) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "sources_empty"
        )
      );

      return;
    }

    const lines =
      sources.map(
        (source) =>
          `${source.id}. [${
            source.source_type ===
            "telegram_channel"
              ? "Telegram"
              : "LinkedIn"
          }] ${source.identifier}`
      );

    await tg.sendMessage(
      chatId,
      lines.join("\n") +
        "\n\n`/removesource ID`"
    );

    return;
  }

  // ===========================================================================
  // REMOVE SOURCE
  // ===========================================================================

  if (
    text?.startsWith(
      "/removesource"
    )
  ) {
    const idString =
      text
        .replace(
          "/removesource",
          ""
        )
        .trim();

    const id =
      Number.parseInt(
        idString,
        10
      );

    if (
      Number.isNaN(id) ||
      id <= 0
    ) {
      await tg.sendMessage(
        chatId,
        "Usage: `/removesource ID` — see the ID with /sources."
      );

      return;
    }

    const removed =
      await removeMonitoredSource(
        env.DB,
        chatId,
        id
      );

    await tg.sendMessage(
      chatId,
      removed
        ? t(
            lang,
            "source_removed"
          )
        : t(
            lang,
            "source_not_found"
          )
    );

    return;
  }

  // ===========================================================================
  // CV DOCUMENT
  // ===========================================================================

  if (msg.document) {
    const isPdf =
      msg.document.mime_type ===
        "application/pdf" ||
      msg.document.file_name
        ?.toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "cv_not_pdf"
        )
      );

      return;
    }

    await handleCvUpload(
      tg,
      env,
      lang,
      chatId,
      msg.document.file_id,
      msg.document.file_name ??
        "cv.pdf"
    );

    return;
  }

  if (!text) {
    return;
  }

  // ===========================================================================
  // STATE MACHINE
  // ===========================================================================

  switch (session.step) {
    case "awaiting_degree_level": {
      const degree =
        normalizeDegree(text);

      if (!degree) {
        await tg.sendMessage(
          chatId,
          t(
            lang,
            "ask_degree"
          ),
          {
            inlineKeyboard:
              degreeKeyboard(lang),
          }
        );

        return;
      }

      const filters =
        buildFilters(
          session,
          {
            degree_level:
              degree,
          }
        );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "awaiting_search_filters",

          degree_level:
            degree,

          search_filters:
            filters,
        }
      );

      await tg.sendMessage(
        chatId,
        "⚙️ Set your search filters:",
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );

      return;
    }

    case "awaiting_field_hint": {
      const filters =
        buildFilters(
          session,
          {
            field: text,
          }
        );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "awaiting_search_filters",

          field_hint:
            text,

          search_filters:
            filters,
        }
      );

      await tg.sendMessage(
        chatId,
        "⚙️ Continue setting your search filters:",
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );

      return;
    }

    case "awaiting_country_hint": {
      const filters =
        buildFilters(
          session,
          {
            countries:
              text
                .toLowerCase() ===
              "skip"
                ? []
                : [text],
          }
        );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "awaiting_search_filters",

          search_filters:
            filters,
        }
      );

      await tg.sendMessage(
        chatId,
        "⚙️ Continue setting your search filters:",
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );

      return;
    }

    // -------------------------------------------------------------------------
    // SEARCH KEYWORDS
    // -------------------------------------------------------------------------

    case "awaiting_search_keywords": {
      const keywords =
        text
          .split(",")
          .map(
            (item) =>
              item.trim()
          )
          .filter(Boolean)
          .join(", ");

      const filters =
        buildFilters(
          session,
          {
            keywords:
              keywords ||
              undefined,
          }
        );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "awaiting_search_filters",

          search_filters:
            filters,
        }
      );

      await tg.sendMessage(
        chatId,
        "⚙️ Search filters updated.",
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );

      return;
    }

    // -------------------------------------------------------------------------
    // MINIMUM MATCH
    // -------------------------------------------------------------------------

    case "awaiting_minimum_match": {
      const value =
        Number.parseInt(
          text,
          10
        );

      if (
        Number.isNaN(value) ||
        value < 0 ||
        value > 100
      ) {
        await tg.sendMessage(
          chatId,
          "❌ Please enter a number between 0 and 100.\n\nExample: 70"
        );

        return;
      }

      const filters =
        buildFilters(
          session,
          {
            minimum_match_percentage:
              value,
          }
        );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "awaiting_search_filters",

          search_filters:
            filters,
        }
      );

      await tg.sendMessage(
        chatId,
        "⚙️ Search filters updated.",
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );

      return;
    }

    // -------------------------------------------------------------------------
    // REVIEWING
    // -------------------------------------------------------------------------

    case "reviewing_results": {
      await handleReviewCommand(
        tg,
        env,
        lang,
        chatId,
        text,
        session
      );

      return;
    }

    // -------------------------------------------------------------------------
    // APPLICATION FIELD
    // -------------------------------------------------------------------------

    case "awaiting_application_field": {
      await handlePendingApplicationField(
        tg,
        env,
        lang,
        chatId,
        text,
        session
      );

      return;
    }

    default: {
      if (
        session.step ===
        "awaiting_cv"
      ) {
        await tg.sendMessage(
          chatId,
          t(
            lang,
            "ask_cv_first"
          )
        );

        return;
      }

      if (text.length > 60) {
        await handleManualListingPaste(
          tg,
          env,
          lang,
          chatId,
          text,
          session
        );

        return;
      }

      await tg.sendMessage(
        chatId,
        t(lang, "help")
      );

      return;
    }
  }
}

// =============================================================================
// CV UPLOAD
// =============================================================================

async function handleCvUpload(
  tg: TelegramClient,
  env: Env,
  lang: Lang,
  chatId: number,
  fileId: string,
  fileName: string
): Promise<void> {
  try {
    await tg.sendChatAction(
      chatId,
      "typing"
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "cv_reading"
      )
    );

    const fileUrl =
      await tg.getFileUrl(
        fileId
      );

    const response =
      await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download Telegram file: ${response.status}`
      );
    }

    const bytes =
      await response.arrayBuffer();

    if (bytes.byteLength === 0) {
      throw new Error(
        "Downloaded CV is empty."
      );
    }

    const safeFileName =
      fileName.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    const r2Key =
      `cvs/${chatId}/${Date.now()}-${safeFileName}`;

    await env.CV_BUCKET.put(
      r2Key,
      bytes,
      {
        httpMetadata: {
          contentType:
            "application/pdf",
        },
      }
    );

    const rawText =
      await extractTextFromPdf(
        bytes
      );

    if (
      !rawText ||
      rawText.trim().length < 40
    ) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "cv_unreadable"
        )
      );

      return;
    }

    const profile =
      await extractProfileFromCV(
        env.AI,
        rawText
      );

    const cvHistoryId =
      await insertCvHistory(
        env.DB,
        chatId,
        r2Key,
        rawText,
        profile
      );

    const filters: SearchFilters = {
      degree_level: "phd",
      countries: [],
    };

    await setSession(
      env.SESSIONS,
      chatId,
      {
        step:
          "awaiting_degree_level",

        cv_history_id:
          cvHistoryId,

        search_filters:
          filters,
      }
    );

    const summary =
      profile.summary ??
      "Background extracted.";

    await tg.sendMessage(
      chatId,
      `${t(
        lang,
        "cv_summary_prefix"
      )}\n_${summary}_`
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "ask_degree"
      ),
      {
        inlineKeyboard:
          degreeKeyboard(lang),
      }
    );
  } catch (error) {
    console.error(
      "CV upload failed:",
      error
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "cv_unreadable"
      )
    );
  }
}

// =============================================================================
// SEARCH
// =============================================================================

async function runSearch(
  tg: TelegramClient,
  env: Env,
  lang: Lang,
  chatId: number,
  session: SessionState,
  filtersInput?: SearchFilters
): Promise<void> {
  if (
    !session.cv_history_id
  ) {
    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,
        step:
          "awaiting_cv",
      }
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "ask_cv_first"
      )
    );

    return;
  }

  const filters =
    filtersInput ??
    session.search_filters ??
    {
      degree_level:
        session.degree_level ??
        "phd",

      countries: [],
    };

  const degreeLevel =
    filters.degree_level ??
    session.degree_level ??
    "phd";

  const fieldHint =
    filters.research_area ??
    filters.field ??
    session.field_hint ??
    "";

  const countryHint =
    filters.countries?.length
      ? filters.countries.join(
          ", "
        )
      : undefined;

  try {
    await tg.sendChatAction(
      chatId,
      "typing"
    );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "searching"
      )
    );

    const cvData =
      await getCvHistory(
        env.DB,
        session.cv_history_id
      );

    if (!cvData) {
      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,
          step:
            "awaiting_cv",
        }
      );

      await tg.sendMessage(
        chatId,
        t(
          lang,
          "ask_cv_first"
        )
      );

      return;
    }

    // -------------------------------------------------------------------------
    // WEBSITE SEARCH
    // -------------------------------------------------------------------------

    const siteListings =
      await searchPositions(
        degreeLevel,
        fieldHint,
        countryHint,
        env.BRAVE_SEARCH_API_KEY
      );

    // -------------------------------------------------------------------------
    // MONITORED SOURCES
    // -------------------------------------------------------------------------

    const sources =
      await listMonitoredSources(
        env.DB,
        chatId
      );

    const channelSources =
      sources.filter(
        (source) =>
          source.source_type ===
          "telegram_channel"
      );

    const linkedinSources =
      sources.filter(
        (source) =>
          source.source_type ===
          "linkedin_page"
      );

    const channelListingsNested =
      await Promise.all(
        channelSources.map(
          async (source) => {
            try {
              return await fetchChannelPosts(
                source.identifier
              );
            } catch (error) {
              console.error(
                `Failed to fetch Telegram channel ${source.identifier}:`,
                error
              );

              return [];
            }
          }
        )
      );

    let listings: PositionListing[] = [
      ...siteListings,
      ...channelListingsNested.flat(),
    ];

    // -------------------------------------------------------------------------
    // COUNTRY FILTER
    // -------------------------------------------------------------------------

    if (
      filters.countries?.length
    ) {
      const selectedCountries =
        filters.countries.map(
          (country) =>
            country
              .trim()
              .toLowerCase()
        );

      const filtered =
        listings.filter(
          (listing) => {
            if (
              !listing.country
            ) {
              return true;
            }

            const listingCountry =
              listing.country
                .toLowerCase();

            return selectedCountries.some(
              (country) =>
                listingCountry.includes(
                  country
                ) ||
                country.includes(
                  listingCountry
                )
            );
          }
        );

      listings =
        filtered;
    }

    // -------------------------------------------------------------------------
    // FUNDING FILTER
    // -------------------------------------------------------------------------

    if (
      filters.funding &&
      filters.funding !== "both"
    ) {
      const filtered =
        listings.filter(
          (listing) => {
            const text =
              [
                listing.title,
                listing.snippet,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const funded =
              [
                "funded",
                "fully funded",
                "scholarship",
                "stipend",
                "studentship",
                "tuition waiver",
                "financial support",
                "salary",
                "paid",
              ].some(
                (keyword) =>
                  text.includes(
                    keyword
                  )
              );

            if (
              filters.funding ===
              "funded"
            ) {
              return funded;
            }

            if (
              filters.funding ===
              "self_funded"
            ) {
              return !funded;
            }

            return true;
          }
        );

      listings =
        filtered;
    }

    // -------------------------------------------------------------------------
    // KEYWORD FILTER
    // -------------------------------------------------------------------------

    if (
      filters.keywords?.trim()
    ) {
      const keywords =
        filters.keywords
          .split(",")
          .map(
            (keyword) =>
              keyword
                .trim()
                .toLowerCase()
          )
          .filter(Boolean);

      if (
        keywords.length > 0
      ) {
        listings =
          listings.filter(
            (listing) => {
              const haystack =
                [
                  listing.title,
                  listing.snippet,
                  listing.institution,
                  listing.country,
                  listing.source_site,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();

              return keywords.some(
                (keyword) =>
                  haystack.includes(
                    keyword
                  )
              );
            }
          );
      }
    }

    // -------------------------------------------------------------------------
    // DEADLINE FILTER
    // -------------------------------------------------------------------------

    if (
      filters.deadline_required
    ) {
      listings =
        listings.filter(
          (listing) => {
            const text =
              [
                listing.title,
                listing.snippet,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (
              text.includes(
                "deadline"
              ) ||
              text.includes(
                "apply by"
              ) ||
              text.includes(
                "application closes"
              ) ||
              text.includes(
                "closing date"
              ) ||
              /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/.test(
                text
              )
            );
          }
        );
    }

    // -------------------------------------------------------------------------
    // NO LISTINGS
    // -------------------------------------------------------------------------

    if (
      listings.length === 0
    ) {
      const links =
        fallbackSearchLinks(
          degreeLevel,
          fieldHint
        );

      await tg.sendMessage(
        chatId,
        t(
          lang,
          "no_results_fallback"
        ) +
          "\n\n" +
          links
            .map(
              (link) =>
                `• ${link}`
            )
            .join("\n") +
          t(
            lang,
            "paste_hint"
          )
      );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step: "idle",

          search_filters:
            filters,
        }
      );

      return;
    }

    // -------------------------------------------------------------------------
    // AI MATCHING
    // -------------------------------------------------------------------------

    let matched =
      await matchPositionsToProfile(
        env.AI,
        cvData.profile,
        degreeLevel,
        listings
      );

    // -------------------------------------------------------------------------
    // MINIMUM MATCH
    // -------------------------------------------------------------------------

    if (
      filters.minimum_match_percentage !==
      undefined
    ) {
      matched =
        matched.filter(
          (item) =>
            item.match_percentage >=
            (
              filters.minimum_match_percentage ??
              0
            )
        );
    }

    // -------------------------------------------------------------------------
    // POSITION TYPE
    // -------------------------------------------------------------------------

    if (
      filters.position_types?.length
    ) {
      const selectedTypes =
        filters.position_types;

      matched =
        matched.filter(
          (item) => {
            const text =
              [
                item.title,
                item.snippet,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return selectedTypes.some(
              (type) =>
                positionTypeMatches(
                  text,
                  type
                )
            );
          }
        );
    }

    // -------------------------------------------------------------------------
    // SORT BY MATCH SCORE
    // -------------------------------------------------------------------------

    matched.sort(
      (a, b) =>
        b.match_percentage -
        a.match_percentage
    );

    const top =
      matched.slice(
        0,
        MAX_RESULTS_TO_SHOW
      );

    if (
      top.length === 0
    ) {
      await tg.sendMessage(
        chatId,
        "No positions met your selected filters."
      );

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "reviewing_results",

          search_filters:
            filters,
        }
      );

      return;
    }

    // -------------------------------------------------------------------------
    // SAVE SEARCH
    // -------------------------------------------------------------------------

    const searchRequestId =
      await insertSearchRequest(
        env.DB,
        chatId,
        session.cv_history_id,
        degreeLevel,
        fieldHint,
        countryHint
      );

    await insertMatchedPositions(
      env.DB,
      searchRequestId,
      top
    );

    const positions =
      await getLatestMatchedPositions(
        env.DB,
        chatId
      );

    await tg.sendMessage(
      chatId,
      t(
        lang,
        "results_header",
        {
          count:
            positions.length,
        }
      )
    );

    await replyWithPositionsList(
      tg,
      lang,
      chatId,
      positions,
      t(
        lang,
        "no_saved_positions"
      ),
      false
    );

    for (
      const position of positions.slice(
        0,
        MAX_CARDS
      )
    ) {
      await sendPositionCard(
        tg,
        lang,
        chatId,
        position
      );
    }

    if (
      positions.length > 0
    ) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "results_footer"
        )
      );
    }

    // -------------------------------------------------------------------------
    // LINKEDIN REMINDER
    // -------------------------------------------------------------------------

    if (
      linkedinSources.length > 0
    ) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "linkedin_reminder_header"
        ) +
          "\n" +
          linkedinSources
            .map(
              (source) =>
                `• ${source.identifier}`
            )
            .join("\n") +
          "\n\n" +
          t(
            lang,
            "linkedin_reminder_footer"
          )
      );
    }

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "reviewing_results",

        degree_level:
          degreeLevel,

        search_filters:
          filters,
      }
    );
  } catch (error) {
    console.error(
      "Search failed:",
      error
    );

    await tg.sendMessage(
      chatId,
      "❌ An error occurred while searching for positions. Please try again."
    );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,
        step:
          "reviewing_results",
      }
    );
  }
}

// =============================================================================
// POSITION TYPE MATCHER
// =============================================================================

function positionTypeMatches(
  text: string,
  type: PositionType
): boolean {
  switch (type) {
    case "phd":
      return (
        text.includes("phd") ||
        text.includes("doctoral") ||
        text.includes("doctorate") ||
        text.includes("doctor of philosophy")
      );

    case "masters":
      return (
        text.includes("master") ||
        text.includes("msc") ||
        text.includes("m.sc") ||
        text.includes("graduate")
      );

    case "bachelor":
      return (
        text.includes("bachelor") ||
        text.includes("bsc") ||
        text.includes("b.sc")
      );

    case "research_assistant":
      return text.includes(
        "research assistant"
      );

    case "research_fellow":
      return text.includes(
        "research fellow"
      );

    case "internship":
      return (
        text.includes(
          "internship"
        ) ||
        text.includes("intern")
      );

    case "other":
      return true;

    default:
      return true;
  }
}

// =============================================================================
// POSITION LIST
// =============================================================================

async function replyWithPositionsList(
  tg: TelegramClient,
  lang: Lang,
  chatId: number,
  positions: StoredMatchedPosition[],
  emptyMessage: string,
  sendIfEmpty = true
): Promise<void> {
  if (
    positions.length === 0
  ) {
    if (sendIfEmpty) {
      await tg.sendMessage(
        chatId,
        emptyMessage
      );
    }

    return;
  }

  const lines =
    positions.map(
      (position, index) =>
        `${index + 1}. *${
          position.match_percentage
        }%* — ${position.title}` +
        (
          position.institution
            ? ` (${position.institution})`
            : ""
        ) +
        `\n${position.url}`
    );

  await tg.sendMessage(
    chatId,
    lines.join(
      "\n\n"
    )
  );
}

// =============================================================================
// POSITION CARD
// =============================================================================

async function sendPositionCard(
  tg: TelegramClient,
  lang: Lang,
  chatId: number,
  position: StoredMatchedPosition
): Promise<void> {
  const metadata =
    [
      position.institution,
      position.country,
    ]
      .filter(Boolean)
      .join(", ");

  const text =
    `*${position.match_percentage}% match* — ${position.title}` +
    (
      metadata
        ? `\n${metadata}`
        : ""
    ) +
    (
      position.match_reasoning
        ? `\n_${position.match_reasoning}_`
        : ""
    ) +
    `\n${position.url}`;

  await tg.sendMessage(
    chatId,
    text,
    {
      inlineKeyboard:
        positionCardKeyboard(
          lang,
          position.id
        ),
    }
  );
}

// =============================================================================
// POSITION CARD LIST
// =============================================================================

async function replyWithPositionCards(
  tg: TelegramClient,
  lang: Lang,
  chatId: number,
  positions: StoredMatchedPosition[],
  header: string,
  emptyMessage: string
): Promise<void> {
  if (
    positions.length === 0
  ) {
    await tg.sendMessage(
      chatId,
      emptyMessage
    );

    return;
  }

  await tg.sendMessage(
    chatId,
    header
  );

  for (
    const position of positions.slice(
      0,
      MAX_SAVED_CARDS
    )
  ) {
    await sendPositionCard(
      tg,
      lang,
      chatId,
      position
    );
  }
}

// =============================================================================
// REVIEW COMMAND
// =============================================================================

async function handleReviewCommand(
  tg: TelegramClient,
  env: Env,
  lang: Lang,
  chatId: number,
  text: string,
  session: SessionState
): Promise<void> {
  const match =
    text.match(
      /^(letter|email)\s+(\d+)$/i
    );

  if (!match) {
    if (
      text
        .trim()
        .toLowerCase() ===
      "/newsearch"
    ) {
      const cvHistoryId =
        await getLatestCvHistoryId(
          env.DB,
          chatId
        );

      const filters: SearchFilters = {
        degree_level:
          session.degree_level ??
          "phd",

        countries: [],
      };

      await setSession(
        env.SESSIONS,
        chatId,
        {
          ...session,

          step:
            "awaiting_degree_level",

          cv_history_id:
            cvHistoryId ??
            undefined,

          search_filters:
            filters,
        }
      );

      await tg.sendMessage(
        chatId,
        t(
          lang,
          "ask_degree"
        ),
        {
          inlineKeyboard:
            degreeKeyboard(lang),
        }
      );

      return;
    }

    if (
      text.length > 60
    ) {
      await handleManualListingPaste(
        tg,
        env,
        lang,
        chatId,
        text,
        session
      );

      return;
    }

    await tg.sendMessage(
      chatId,
      t(lang, "help")
    );

    return;
  }

  const docKind =
    match[1].toLowerCase() as
      | "letter"
      | "email";

  const index =
    Number.parseInt(
      match[2],
      10
    ) - 1;

  if (
    Number.isNaN(index) ||
    index < 0
  ) {
    await tg.sendMessage(
      chatId,
      "❌ Invalid position number."
    );

    return;
  }

  const positions =
    await getLatestMatchedPositions(
      env.DB,
      chatId
    );

  const position =
    positions[index];

  if (!position) {
    await tg.sendMessage(
      chatId,
      "❌ Position not found."
    );

    return;
  }

  await generateAndSendDocument(
    tg,
    env,
    lang,
    chatId,
    position.id,
    docKind
  );
}

// =============================================================================
// MANUAL LISTING PASTE
// =============================================================================

async function handleManualListingPaste(
  tg: TelegramClient,
  env: Env,
  lang: Lang,
  chatId: number,
  text: string,
  session: SessionState
): Promise<void> {
  const cvHistoryId =
    session.cv_history_id ??
    (
      await getLatestCvHistoryId(
        env.DB,
        chatId
      )
    );

  if (!cvHistoryId) {
    await tg.sendMessage(
      chatId,
      t(
        lang,
        "ask_cv_first"
      )
    );

    return;
  }

  const cvData =
    await getCvHistory(
      env.DB,
      cvHistoryId
    );

  if (!cvData) {
    await tg.sendMessage(
      chatId,
      t(
        lang,
        "ask_cv_first"
      )
    );

    return;
  }

  const degreeLevel =
    session.degree_level ??
    "phd";

  const firstLine =
    text
      .split("\n")
      .map(
        (line) =>
          line.trim()
      )
      .find(Boolean) ??
    "Pasted position";

  const listing: PositionListing = {
    title:
      firstLine.slice(
        0,
        120
      ),

    snippet:
      text.slice(
        0,
        8000
      ),

    url:
      "manual-paste",

    source_site:
      "pasted by student",
  };

  try {
    await tg.sendChatAction(
      chatId,
      "typing"
    );

    const scoredResults =
      await matchPositionsToProfile(
        env.AI,
        cvData.profile,
        degreeLevel,
        [listing]
      );

    const scored =
      scoredResults[0];

    if (!scored) {
      await tg.sendMessage(
        chatId,
        "❌ Could not analyze this position."
      );

      return;
    }

    const searchRequestId =
      await insertSearchRequest(
        env.DB,
        chatId,
        cvHistoryId,
        degreeLevel,
        "manual paste"
      );

    const inserted =
      await insertMatchedPositions(
        env.DB,
        searchRequestId,
        [scored]
      );

    const newId =
      Array.isArray(inserted)
        ? inserted[0]
        : inserted;

    if (
      typeof newId !== "number"
    ) {
      throw new Error(
        "insertMatchedPositions did not return a valid position ID."
      );
    }

    await sendPositionCard(
      tg,
      lang,
      chatId,
      {
        id: newId,

        title:
          scored.title,

        institution:
          scored.institution ??
          null,

        country:
          scored.country ??
          null,

        url:
          scored.url,

        source_site:
          scored.source_site ??
          null,

        match_percentage:
          scored.match_percentage,

        match_reasoning:
          scored.match_reasoning,

        status: "new",
      }
    );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "reviewing_results",
      }
    );
  } catch (error) {
    console.error(
      "Manual listing analysis failed:",
      error
    );

    await tg.sendMessage(
      chatId,
      "❌ Could not analyze the pasted position."
    );
  }
}

// =============================================================================
// PENDING APPLICATION FIELD
// =============================================================================

async function handlePendingApplicationField(
  tg: TelegramClient,
  env: Env,
  lang: Lang,
  chatId: number,
  text: string,
  session: SessionState
): Promise<void> {
  const applicationId =
    session.pending_application_id;

  const kind =
    session.pending_doc_kind ??
    "email";

  if (!applicationId) {
    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "reviewing_results",
      }
    );

    return;
  }

  const value =
    text.trim();

  if (
    value.toLowerCase() ===
    "skip"
  ) {
    await updateApplicationDetails(
      env.DB,
      applicationId,
      {
        professor_email:
          "",
      },
      "student"
    );
  } else if (
    isValidEmail(value)
  ) {
    await updateApplicationDetails(
      env.DB,
      applicationId,
      {
        professor_email:
          value,
      },
      "student"
    );
  } else {
    await tg.sendMessage(
      chatId,
      t(
        lang,
        "ask_professor_email"
      )
    );

    return;
  }

  const application =
    await getApplicationById(
      env.DB,
      applicationId
    );

  if (!application) {
    return;
  }

  await setSession(
    env.SESSIONS,
    chatId,
    {
      ...session,

      step:
        "reviewing_results",

      pending_application_id:
        undefined,

      pending_application_field:
        undefined,

      pending_doc_kind:
        undefined,
    }
  );

  await generateAndSendDocument(
    tg,
    env,
    lang,
    chatId,
    application.matched_position_id,
    kind
  );
}

// =============================================================================
// EMAIL VALIDATION
// =============================================================================

function isValidEmail(
  email: string
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

// =============================================================================
// GENERATE DOCUMENT
// =============================================================================

async function generateAndSendDocument(
  tg: TelegramClient,
  env: Env,
  lang: Lang,
  chatId: number,
  matchedPositionId: number,
  kind:
    | "letter"
    | "email"
): Promise<void> {
  try {
    const context =
      await getMatchedPositionWithContext(
        env.DB,
        matchedPositionId
      );

    if (!context) {
      await tg.sendMessage(
        chatId,
        "❌ Position context could not be found."
      );

      return;
    }

    const cvData =
      await getCvHistory(
        env.DB,
        context.cv_history_id
      );

    if (!cvData) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "ask_cv_first"
        )
      );

      return;
    }

    const applicationId =
      await getOrCreateApplication(
        env.DB,
        matchedPositionId,
        context.chat_id
      );

    let application =
      await getApplicationById(
        env.DB,
        applicationId
      );

    if (!application) {
      return;
    }

    // -------------------------------------------------------------------------
    // EXTRACT POSITION DETAILS
    // -------------------------------------------------------------------------

    if (
      application.details_source ===
      null
    ) {
      await tg.sendMessage(
        chatId,
        t(
          lang,
          "extracting_details"
        )
      );

      const fallbackText =
        [
          context.title,
          context.institution,
          context.country,
        ]
          .filter(Boolean)
          .join(" — ");

      const result =
        await extractPositionDetails(
          env.AI,
          context.url,
          fallbackText
        );

      // result.source is "page" only when we actually fetched and read the
      // real listing page; it's null when the fetch failed or we only had a
      // weak fallback snippet to work with. Writing null (instead of always
      // "page") means a genuinely failed extraction gets retried the next
      // time the student generates a document for this position, rather than
      // being locked in forever.
      await updateApplicationDetails(
        env.DB,
        applicationId,
        result.details,
        result.source
      );

      application =
        await getApplicationById(
          env.DB,
          applicationId
        );

      if (!application) {
        return;
      }
    }

    // -------------------------------------------------------------------------
    // PROFESSOR EMAIL
    // -------------------------------------------------------------------------

    if (
      application.professor_email ===
      null
    ) {
      await setSession(
        env.SESSIONS,
        chatId,
        {
          step:
            "awaiting_application_field",

          pending_application_id:
            applicationId,

          pending_application_field:
            "professor_email",

          pending_doc_kind:
            kind,

          cv_history_id:
            context.cv_history_id,

          degree_level:
            context.degree_level,
        }
      );

      await tg.sendMessage(
        chatId,
        t(
          lang,
          "ask_professor_email"
        )
      );

      return;
    }

    await tg.sendChatAction(
      chatId,
      "typing"
    );

    const positionForDocument:
      PositionListing = {
      title:
        context.title,

      institution:
        application.university ??
        context.institution ??
        undefined,

      country:
        application.country ??
        context.country ??
        undefined,

      url:
        context.url,
    };

    const details:
      PositionDetails = {
      professor_name:
        application.professor_name ??
        undefined,

      professor_email:
        application.professor_email ||
        undefined,

      funding_info:
        application.funding_info ??
        undefined,

      university:
        application.university ??
        undefined,

      country:
        application.country ??
        undefined,
    };

    // -------------------------------------------------------------------------
    // MOTIVATION LETTER
    // -------------------------------------------------------------------------

    if (
      kind === "letter"
    ) {
      const letter =
        await generateMotivationLetter(
          env.AI,
          cvData.profile,
          context.degree_level,
          positionForDocument,
          details
        );

      await setApplicationDraft(
        env.DB,
        applicationId,
        "cover_letter",
        letter
      );

      await saveGeneratedDocument(
        env.DB,
        matchedPositionId,
        "motivation_letter",
        letter
      );

      await tg.sendMessage(
        chatId,
        `${t(
          lang,
          "letter_draft_prefix"
        )}\n\n${letter}`
      );

      return;
    }

    // -------------------------------------------------------------------------
    // APPLICATION EMAIL
    // -------------------------------------------------------------------------

    const email =
      await generateApplicationEmail(
        env.AI,
        cvData.profile,
        context.degree_level,
        positionForDocument,
        details
      );

    await setApplicationDraft(
      env.DB,
      applicationId,
      "email_draft",
      email
    );

    await saveGeneratedDocument(
      env.DB,
      matchedPositionId,
      "email",
      email
    );

    if (
      application.application_status ===
      "draft"
    ) {
      await setApplicationStatus(
        env.DB,
        applicationId,
        "ready"
      );
    }

    const mailto =
      buildMailtoLink(
        application.professor_email ||
          null,
        email
      );

    await tg.sendMessage(
      chatId,
      `${t(
        lang,
        "email_draft_prefix"
      )}\n\n${email}\n\n${t(
        lang,
        "application_prepared"
      )}`,
      {
        inlineKeyboard: [
          [
            {
              text: t(
                lang,
                "btn_send_email"
              ),

              url: mailto,
            },
          ],

          [
            {
              text: t(
                lang,
                "btn_mark_sent"
              ),

              callback_data:
                `marksent:${applicationId}`,
            },
          ],
        ],
      }
    );
  } catch (error) {
    console.error(
      "Document generation failed:",
      error
    );

    await tg.sendMessage(
      chatId,
      "❌ An error occurred while generating the document. Please try again."
    );
  }
}

// =============================================================================
// CALLBACK QUERY
// =============================================================================

/**
 * Thin wrapper around the real handler: none of the ~30 branches below have
 * their own try/catch, so a single DB/AI/network error partway through used
 * to leave the tapped button spinning forever (Telegram only clears that
 * spinner once answerCallbackQuery is called) with no feedback to the
 * student. This makes sure every code path answers the callback, even the
 * unexpected-error one.
 */
export async function handleCallbackQuery(
  cb: NonNullable<TelegramUpdate["callback_query"]>,
  env: Env
): Promise<void> {
  try {
    await handleCallbackQueryInner(cb, env);
  } catch (error) {
    console.error("handleCallbackQuery failed:", error);
    try {
      const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      await tg.answerCallbackQuery(
        cb.id,
        "⚠️ Something went wrong - please try again.",
        true
      );
    } catch (ackError) {
      console.error("Failed to acknowledge callback after error:", ackError);
    }
  }
}

async function handleCallbackQueryInner(
  cb: NonNullable<
    TelegramUpdate["callback_query"]
  >,
  env: Env
): Promise<void> {
  const tg =
    new TelegramClient(
      env.TELEGRAM_BOT_TOKEN
    );

  const data =
    cb.data;

  const chatId =
    cb.message?.chat.id;

  const messageId =
    cb.message?.message_id;

  if (
    !data ||
    !chatId
  ) {
    return;
  }

  // ===========================================================================
  // LANGUAGE
  // ===========================================================================

  if (
    data.startsWith("lang:")
  ) {
    const requested =
      data
        .substring(
          "lang:".length
        )
        .trim();

    if (
      requested !== "en" &&
      requested !== "fa"
    ) {
      await tg.answerCallbackQuery(
        cb.id,
        "Invalid language."
      );

      return;
    }

    const newLang =
      requested as Lang;

    await setStudentLanguage(
      env.DB,
      chatId,
      newLang
    );

    await tg.answerCallbackQuery(
      cb.id,
      t(
        newLang,
        "language_set"
      )
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        null
      );
    }

    return;
  }

  const lang =
    await getStudentLanguage(
      env.DB,
      chatId
    );

  // ===========================================================================
  // DEGREE
  // ===========================================================================

  if (
    data.startsWith("deg:")
  ) {
    const value =
      data.substring(
        "deg:".length
      );

    if (
      value !== "phd" &&
      value !== "master" &&
      value !== "bachelor"
    ) {
      await tg.answerCallbackQuery(
        cb.id,
        "Invalid degree."
      );

      return;
    }

    const degree =
      value as DegreeLevel;

    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session,
        {
          degree_level:
            degree,
        }
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        degree_level:
          degree,

        search_filters:
          filters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // COUNTRY MENU
  // ===========================================================================

  if (
    data ===
    "filter:country"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            countryKeyboard(
              filters.countries ??
                []
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // COUNTRY SELECTION
  // ===========================================================================

  if (
    data.startsWith(
      "country:"
    )
  ) {
    const country =
      data.substring(
        "country:".length
      );

    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    let countries =
      [
        ...(filters.countries ??
          []),
      ];

    if (
      country === "all"
    ) {
      countries = [];
    } else if (
      countries.includes(
        country
      )
    ) {
      countries =
        countries.filter(
          (item) =>
            item !== country
        );
    } else {
      countries.push(
        country
      );
    }

    const updatedFilters:
      SearchFilters = {
      ...filters,
      countries,
    };

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          updatedFilters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            countryKeyboard(
              countries
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // FUNDING MENU
  // ===========================================================================

  if (
    data ===
    "filter:funding"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            fundingKeyboard(
              filters.funding
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // FUNDING SELECTION
  // ===========================================================================

  if (
    data.startsWith(
      "funding:"
    )
  ) {
    const value =
      data.substring(
        "funding:".length
      );

    if (
      value !== "funded" &&
      value !== "self_funded" &&
      value !== "both"
    ) {
      await tg.answerCallbackQuery(
        cb.id,
        "Invalid funding option."
      );

      return;
    }

    const funding =
      value as FundingPreference;

    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session,
        {
          funding,
        }
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          filters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            fundingKeyboard(
              funding
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // FIELD MENU
  // ===========================================================================

  if (
    data ===
    "filter:field"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            fieldKeyboard(
              filters.field
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // FIELD SELECTION
  // ===========================================================================

  if (
    data.startsWith(
      "field:"
    )
  ) {
    const field =
      data.substring(
        "field:".length
      );

    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session,
        {
          field,
          research_area:
            undefined,
        }
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          filters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            researchAreaKeyboard(
              field
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // RESEARCH AREA MENU
  // ===========================================================================

  if (
    data ===
    "filter:research_area"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            researchAreaKeyboard(
              filters.field,
              filters.research_area
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // RESEARCH AREA SELECTION
  // ===========================================================================

  if (
    data.startsWith(
      "research:"
    )
  ) {
    const researchArea =
      data.substring(
        "research:".length
      );

    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session,
        {
          research_area:
            researchArea,
        }
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          filters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // POSITION TYPE MENU
  // ===========================================================================

  if (
    data ===
    "filter:position_type"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            positionTypeKeyboard(
              filters.position_types ??
                []
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // POSITION TYPE SELECTION
  // ===========================================================================

  if (
    data.startsWith(
      "ptype:"
    )
  ) {
    const value =
      data.substring(
        "ptype:".length
      ) as PositionType;

    const validTypes:
      PositionType[] = [
      "phd",
      "research_assistant",
      "research_fellow",
      "masters",
      "bachelor",
      "internship",
      "other",
    ];

    if (
      !validTypes.includes(
        value
      )
    ) {
      await tg.answerCallbackQuery(
        cb.id,
        "Invalid position type."
      );

      return;
    }

    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    let positionTypes =
      [
        ...(filters.position_types ??
          []),
      ];

    if (
      positionTypes.includes(
        value
      )
    ) {
      positionTypes =
        positionTypes.filter(
          (item) =>
            item !== value
        );
    } else {
      positionTypes.push(
        value
      );
    }

    const updatedFilters:
      SearchFilters = {
      ...filters,

      position_types:
        positionTypes,
    };

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          updatedFilters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            positionTypeKeyboard(
              positionTypes
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // KEYWORDS
  // ===========================================================================

  if (
    data ===
    "filter:keywords"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_keywords",
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        null
      );
    }

    await tg.sendMessage(
      chatId,
      "🔎 Enter keywords separated by commas.\n\nExample:\nStructural Engineering, Machine Learning, Surrogate Models"
    );

    return;
  }

  // ===========================================================================
  // MINIMUM MATCH
  // ===========================================================================

  if (
    data ===
    "filter:min_match"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_minimum_match",
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        null
      );
    }

    await tg.sendMessage(
      chatId,
      "📊 Enter the minimum match percentage.\n\nExample: 70\n\nEnter a value between 0 and 100."
    );

    return;
  }

  // ===========================================================================
  // DEADLINE
  // ===========================================================================

  if (
    data ===
    "filter:deadline"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    const updatedFilters:
      SearchFilters = {
      ...filters,

      deadline_required:
        !filters.deadline_required,
    };

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          updatedFilters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              updatedFilters
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // FILTER MAIN
  // ===========================================================================

  if (
    data ===
      "filter:main" ||
    data ===
      "filter:back"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "awaiting_search_filters",

        search_filters:
          filters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        {
          inlineKeyboard:
            searchFiltersKeyboard(
              lang,
              filters
            ),
        }
      );
    }

    return;
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  if (
    data ===
    "filter:search"
  ) {
    const session =
      await getSession(
        env.SESSIONS,
        chatId
      );

    const filters =
      buildFilters(
        session
      );

    await setSession(
      env.SESSIONS,
      chatId,
      {
        ...session,

        step:
          "searching",

        search_filters:
          filters,
      }
    );

    await tg.answerCallbackQuery(
      cb.id,
      "🔍 Searching..."
    );

    if (
      messageId !== undefined
    ) {
      await tg.editMessageReplyMarkup(
        chatId,
        messageId,
        null
      );
    }

    await runSearch(
      tg,
      env,
      lang,
      chatId,
      {
        ...session,

        step:
          "searching",

        degree_level:
          filters.degree_level ??
          session.degree_level,

        search_filters:
          filters,
      },
      filters
    );

    return;
  }

  // ===========================================================================
  // APPLICATION ACTIONS
  // ===========================================================================

  const actionMatch =
    data.match(
      /^(letter|email|save|dismiss|applied|marksent|followupsent):(\d+)$/
    );

  if (!actionMatch) {
    await tg.answerCallbackQuery(
      cb.id
    );

    return;
  }

  const action =
    actionMatch[1];

  const id =
    Number.parseInt(
      actionMatch[2],
      10
    );

  if (
    Number.isNaN(id) ||
    id <= 0
  ) {
    await tg.answerCallbackQuery(
      cb.id,
      "Invalid ID."
    );

    return;
  }

  switch (action) {
    // -------------------------------------------------------------------------
    // LETTER
    // -------------------------------------------------------------------------

    case "letter":
      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "generating"
        )
      );

      await generateAndSendDocument(
        tg,
        env,
        lang,
        chatId,
        id,
        "letter"
      );

      return;

    // -------------------------------------------------------------------------
    // EMAIL
    // -------------------------------------------------------------------------

    case "email":
      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "generating"
        )
      );

      await generateAndSendDocument(
        tg,
        env,
        lang,
        chatId,
        id,
        "email"
      );

      return;

    // -------------------------------------------------------------------------
    // SAVE
    // -------------------------------------------------------------------------

    case "save":
      await updateMatchedPositionStatus(
        env.DB,
        id,
        "shortlisted"
      );

      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "saved_confirmation"
        )
      );

      return;

    // -------------------------------------------------------------------------
    // APPLIED
    // -------------------------------------------------------------------------

    case "applied":
      await updateMatchedPositionStatus(
        env.DB,
        id,
        "applied"
      );

      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "applied_confirmation"
        )
      );

      return;

    // -------------------------------------------------------------------------
    // DISMISS
    // -------------------------------------------------------------------------

    case "dismiss":
      await updateMatchedPositionStatus(
        env.DB,
        id,
        "dismissed"
      );

      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "dismissed_confirmation"
        )
      );

      if (
        messageId !== undefined
      ) {
        await tg.editMessageReplyMarkup(
          chatId,
          messageId,
          null
        );
      }

      return;

    // -------------------------------------------------------------------------
    // MARK SENT
    // -------------------------------------------------------------------------

    case "marksent":
      await setApplicationStatus(
        env.DB,
        id,
        "sent"
      );

      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "marked_sent_confirmation"
        )
      );

      return;

    // -------------------------------------------------------------------------
    // FOLLOW-UP SENT
    // -------------------------------------------------------------------------

    case "followupsent":
      await incrementReminderCount(
        env.DB,
        id
      );

      await tg.answerCallbackQuery(
        cb.id,
        t(
          lang,
          "marked_sent_confirmation"
        )
      );

      return;

    default:
      await tg.answerCallbackQuery(
        cb.id
      );

      return;
  }
}