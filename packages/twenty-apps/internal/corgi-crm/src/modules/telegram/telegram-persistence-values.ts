export const TELEGRAM_DELIVERY_STATUS_VALUES = {
  ready: 'READY',
  retry_approved: 'RETRY_APPROVED',
  intent: 'INTENT',
  unknown: 'UNKNOWN',
  complete: 'COMPLETE',
} as const;

export const TELEGRAM_DELIVERY_REASON_VALUES = {
  provider_ambiguous: 'PROVIDER_AMBIGUOUS',
  checkpoint_ambiguous: 'CHECKPOINT_AMBIGUOUS',
} as const;
