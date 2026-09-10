import {
  buildDailySummaries,
  formatDailySummary,
  formatEmptyDailySummary,
} from 'src/modules/outreach/services/daily-summary.service';
import { getZonedDayWindow } from 'src/modules/outreach/services/day-window.service';
import { logOutreach } from 'src/modules/outreach/services/log-outreach.service';
import { type OutreachRepository } from 'src/modules/outreach/types';
import {
  getValidatedTelegramLink,
  linkTelegramAccount,
  parseTelegramLinkBindings,
  type TelegramIdentitySource,
} from 'src/modules/telegram/services/telegram-link.service';
import { type KeyValueStore, type ParsedTelegramUpdate } from 'src/modules/telegram/types';
import { parseTelegramLogCommand } from 'src/modules/telegram/services/parse-telegram-log-command.service';
import { splitTelegramMessage } from 'src/modules/telegram/services/split-telegram-message.service';
import { getTelegramActivityId } from 'src/modules/telegram/services/telegram-identifiers.service';

const HELP = [
  'Corgi CRM outreach bot',
  '/link CODE — securely link your CRM identity',
  '/log call | Company | outcome | notes',
  '/log type=meeting; company=Company; contact=Name; outcome=follow_up_scheduled; notes=Next step; followup=YYYY-MM-DD',
  '/today — your activity breakdown for the current local day',
  '/help — show this guide',
].join('\n');

type CommandDependencies = {
  repository: OutreachRepository;
  store: KeyValueStore;
  timeZone: string;
  linkCodesJson: string | undefined;
  identity: TelegramIdentitySource;
  send(chatId: string, text: string): Promise<void>;
  answerCallback?(callbackQueryId: string): Promise<void>;
  onCrmCommitted?(activityId: string): Promise<void>;
  now(): Date;
};

const sendParts = async (
  send: CommandDependencies['send'],
  chatId: string,
  text: string,
) => {
  for (const part of splitTelegramMessage(text)) await send(chatId, part);
};

const commandName = (text: string) =>
  text.trim().split(/\s+/, 1)[0]!.replace(/@\w+$/i, '').toLowerCase();

export const processTelegramCommand = async (
  update: ParsedTelegramUpdate,
  dependencies: CommandDependencies,
  resume?: { status: 'crm_committed'; activityId: string },
) => {
  if (update.callbackQueryId && dependencies.answerCallback) {
    await dependencies.answerCallback(update.callbackQueryId);
  }
  const command = commandName(update.text);
  if (command === '/help' || command === '/start') {
    await sendParts(dependencies.send, update.chatId, HELP);
    return { status: 'help' } as const;
  }
  if (command === '/link') {
    const code = update.text.replace(/^\/link(?:@\w+)?\s*/i, '').trim();
    try {
      const link = await linkTelegramAccount({
        code,
        userId: update.userId,
        chatId: update.chatId,
        configuredBindings: parseTelegramLinkBindings(dependencies.linkCodesJson),
        identity: dependencies.identity,
        store: dependencies.store,
      });
      await dependencies.send(
        update.chatId,
        `Linked to ${link.wholesalerName}. Use /log or /today.`,
      );
      return { status: 'linked' } as const;
    } catch {
      await dependencies.send(
        update.chatId,
        'Could not link that code. Ask an administrator for a new one-time code.',
      );
      return { status: 'link_failed' } as const;
    }
  }

  const link = await getValidatedTelegramLink({
    store: dependencies.store,
    userId: update.userId,
    identity: dependencies.identity,
  });
  if (!link || link.chatId !== update.chatId) {
    await dependencies.send(
      update.chatId,
      'Link your CRM identity first with /link CODE.',
    );
    return { status: 'not_linked' } as const;
  }

  if (command === '/log') {
    let input;
    try {
      input = parseTelegramLogCommand(
        update.text,
        getTelegramActivityId(update.updateId),
      );
    } catch {
      await dependencies.send(update.chatId, `Could not parse that entry.\n${HELP}`);
      return { status: 'invalid_log' } as const;
    }
    if (resume?.status === 'crm_committed') {
      await dependencies.send(
        update.chatId,
        `Logged ${input.companyQuery}. Use /today to review your day.`,
      );
      return {
        status: 'logged',
        activityId: resume.activityId,
        companyName: input.companyQuery,
      } as const;
    }
    const result = await logOutreach({
      input,
      wholesalerId: link.wholesalerId,
      now: new Date(update.messageTimestamp),
      repository: dependencies.repository,
    });
    if (result.status === 'logged') {
      await dependencies.onCrmCommitted?.(result.activityId);
      await dependencies.send(
        update.chatId,
        `Logged ${result.companyName}. Use /today to review your day.`,
      );
    } else if (result.status === 'ambiguous_company' || result.status === 'ambiguous_contact') {
      await dependencies.send(
        update.chatId,
        `More than one match: ${result.matches.map(({ name }) => name).join(', ')}. Use the exact name and try again.`,
      );
    } else {
      await dependencies.send(
        update.chatId,
        result.status === 'company_not_found'
          ? 'Company not found. Check the CRM name and try again.'
          : 'Contact not found at that company. Check the CRM name and try again.',
      );
    }
    return result;
  }

  if (command === '/today' || command === '/summary' || update.text === 'today') {
    const window = getZonedDayWindow({
      now: dependencies.now(),
      timeZone: dependencies.timeZone,
    });
    const activities = await dependencies.repository.listActivities({
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      wholesalerId: link.wholesalerId,
    });
    const summary = buildDailySummaries(activities, window.localDate)[0];
    await sendParts(
      dependencies.send,
      update.chatId,
      summary
        ? formatDailySummary(summary)
        : formatEmptyDailySummary(link.wholesalerName, window.localDate),
    );
    return { status: 'summary' } as const;
  }

  await sendParts(dependencies.send, update.chatId, HELP);
  return { status: 'help' } as const;
};
