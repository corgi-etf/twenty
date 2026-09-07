export const chunkRecords = <T>(records: readonly T[], size = 100): T[][] => {
  if (!Number.isInteger(size) || size < 1 || size > 100) {
    throw new Error('Twenty batch size must be an integer from 1 through 100');
  }

  const batches: T[][] = [];

  for (let index = 0; index < records.length; index += size) {
    batches.push(records.slice(index, index + size));
  }

  return batches;
};
