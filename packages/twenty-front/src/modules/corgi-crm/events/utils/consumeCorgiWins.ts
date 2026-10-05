import { type CorgiWin } from '@/corgi-crm/types/CorgiHome';

export const consumeCorgiWins = ({
  wins,
  seenIds,
  initialized,
  startedAt,
}: {
  wins: CorgiWin[];
  seenIds: string[];
  initialized: boolean;
  startedAt?: string;
}) => {
  const seen = new Set(seenIds);
  const freshWins: CorgiWin[] = [];
  for (const win of wins) {
    if (seen.has(win.id)) continue;
    seen.add(win.id);
    if (
      initialized &&
      (!startedAt ||
        new Date(win.recordedAt).getTime() >= new Date(startedAt).getTime())
    )
      freshWins.push(win);
  }
  return { freshWins, seenIds: [...seen].slice(-500) };
};
