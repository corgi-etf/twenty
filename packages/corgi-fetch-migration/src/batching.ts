export const TWENTY_SAFE_BATCH_BODY_BYTES = 8 * 1024 * 1024;

const recordIdentifier = (record: unknown, index: number): string => {
  if (
    record !== null &&
    typeof record === 'object' &&
    'id' in record &&
    typeof record.id === 'string'
  ) {
    return record.id;
  }

  return `index-${index}`;
};

export const chunkRecords = <T>(
  records: readonly T[],
  size = 100,
  maxBodyBytes = TWENTY_SAFE_BATCH_BODY_BYTES,
  objectPlural = 'records',
): T[][] => {
  if (!Number.isInteger(size) || size < 1 || size > 100) {
    throw new Error('Twenty batch size must be an integer from 1 through 100');
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 2) {
    throw new Error(
      'Twenty batch body byte limit must be an integer of at least 2',
    );
  }

  const batches: T[][] = [];
  let batch: T[] = [];
  let batchBodyBytes = 2;

  for (const [index, record] of records.entries()) {
    const serializedRecord = JSON.stringify([record]).slice(1, -1);
    const recordBytes = Buffer.byteLength(serializedRecord, 'utf8');
    const singleRecordBodyBytes = recordBytes + 2;

    if (singleRecordBodyBytes > maxBodyBytes) {
      throw new Error(
        `Twenty ${objectPlural}/${recordIdentifier(record, index)} single record request body is ${singleRecordBodyBytes} bytes and exceeds the ${maxBodyBytes} byte limit`,
      );
    }

    const nextBodyBytes =
      batchBodyBytes + recordBytes + (batch.length > 0 ? 1 : 0);
    if (batch.length >= size || nextBodyBytes > maxBodyBytes) {
      batches.push(batch);
      batch = [record];
      batchBodyBytes = singleRecordBodyBytes;
    } else {
      batch.push(record);
      batchBodyBytes = nextBodyBytes;
    }
  }

  if (batch.length > 0) batches.push(batch);

  return batches;
};
