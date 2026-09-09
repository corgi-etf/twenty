export const splitTelegramMessage = (
  text: string,
  maximumLength = 3900,
): string[] => {
  if (!Number.isSafeInteger(maximumLength) || maximumLength < 1) {
    throw new Error('Telegram message length must be a positive integer');
  }
  if (!text) return [''];

  const output: string[] = [];
  let current = '';
  for (const sourceLine of text.split('\n')) {
    let line = sourceLine;
    while (line.length > maximumLength) {
      if (current) {
        output.push(current);
        current = '';
      }
      output.push(line.slice(0, maximumLength));
      line = line.slice(maximumLength);
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maximumLength) current = candidate;
    else {
      if (current) output.push(current);
      current = line;
    }
  }
  if (current || output.length === 0) output.push(current);
  return output;
};
