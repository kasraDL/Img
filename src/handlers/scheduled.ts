import type { Env, PositionListing, PositionDetails } from "../types";
import { TelegramClient } from "../services/telegramApi";
import { generateFollowUpEmail } from "../services/workersAI";
import { buildMailtoLink } from "../services/mailto";
import { t } from "../services/i18n";
import {
  listApplicationsDueForReminder,
  getMatchedPositionWithContext,
  getCvHistory,
  getStudentLanguage,
  markReminderNotified,
} from "../db/queries";

function daysSince(isoDate: string): number {
  // D1's datetime('now') stores "YYYY-MM-DD HH:MM:SS" (UTC, no 'Z') - normalize for Date parsing.
  const from = new Date(isoDate.replace(" ", "T") + "Z").getTime();
  return Math.max(1, Math.round((Date.now() - from) / (1000 * 60 * 60 * 24)));
}

/**
 * Runs on the daily Cron Trigger (see wrangler.toml). Fully independent of
 * any chat session - reads straight from D1 across every student, so it
 * works even if the student hasn't opened the bot in weeks.
 */
export async function runReminderSweep(env: Env): Promise<void> {
  const due = await listApplicationsDueForReminder(env.DB);
  if (due.length === 0) return;

  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  for (const app of due) {
    try {
      const context = await getMatchedPositionWithContext(env.DB, app.matched_position_id);
      if (!context) continue;
      const cvData = await getCvHistory(env.DB, context.cv_history_id);
      if (!cvData) continue;

      const lang = await getStudentLanguage(env.DB, app.chat_id);
      const days = daysSince(app.sent_at ?? app.created_at);

      const positionForDoc: PositionListing = {
        title: app.position_title ?? context.title,
        institution: app.university ?? context.institution ?? undefined,
        country: app.country ?? context.country ?? undefined,
        url: app.position_url ?? context.url,
      };
      const details: PositionDetails = {
        professor_name: app.professor_name ?? undefined,
        professor_email: app.professor_email || undefined,
      };

      const followUp = await generateFollowUpEmail(
        env.AI,
        cvData.profile,
        context.degree_level,
        positionForDoc,
        details,
        days
      );

      const mailto = buildMailtoLink(app.professor_email || null, followUp);
      await tg.sendMessage(
        app.chat_id,
        t(lang, "reminder_notification", { title: app.position_title ?? positionForDoc.title }) +
          `\n\n${followUp}`,
        {
          inlineKeyboard: [
            [{ text: t(lang, "btn_send_email"), url: mailto }],
            [{ text: t(lang, "btn_mark_sent"), callback_data: `followupsent:${app.id}` }],
          ],
        }
      );

      await markReminderNotified(env.DB, app.id);
    } catch (err) {
      // One bad row shouldn't stop the rest of the sweep.
      console.error("reminder sweep failed for application", app.id, err);
    }
  }
}
