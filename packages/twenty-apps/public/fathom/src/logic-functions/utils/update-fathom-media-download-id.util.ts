import { setTimeout } from 'node:timers/promises';

import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type FathomMediaWriteContext } from 'src/logic-functions/types/fathom-media-write-context.type';
import { updateCallRecordingMedia } from 'src/logic-functions/utils/update-call-recording-media.util';

const MAX_DOWNLOAD_ID_SAVE_ATTEMPTS = 3;
const DOWNLOAD_ID_SAVE_RETRY_DELAY_MILLISECONDS = 500;

export const updateFathomMediaDownloadId = async ({
  coreApiClient,
  callRecordingId,
  downloadId,
  writeContext,
}: {
  coreApiClient: Pick<CoreApiClient, 'mutation'>;
  callRecordingId: string;
  downloadId: string | null;
  writeContext: FathomMediaWriteContext;
}): Promise<boolean> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await updateCallRecordingMedia({
        coreApiClient,
        callRecordingId,
        writeContext,
        fields: {
          fathomMediaDownloadId: downloadId,
          fathomMediaUploadCheckpoint: null,
        },
      });
    } catch (error) {
      if (attempt >= MAX_DOWNLOAD_ID_SAVE_ATTEMPTS) {
        throw error;
      }

      await setTimeout(DOWNLOAD_ID_SAVE_RETRY_DELAY_MILLISECONDS * attempt);
    }
  }
};
