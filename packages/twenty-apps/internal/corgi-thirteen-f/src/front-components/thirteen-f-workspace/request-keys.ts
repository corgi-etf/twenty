import { periodOptionValue } from 'src/front-components/thirteen-f-workspace/periods';
import type {
  HoldingsOrder,
  PeriodOption,
} from 'src/front-components/thirteen-f-workspace/types';

export const firmMetadataRequestKey = (firmId: string | undefined) =>
  firmId ?? null;

export const firmHoldingsRequestKey = (
  firmId: string | undefined,
  period: PeriodOption | undefined,
  order: HoldingsOrder,
) =>
  firmId && period
    ? `${firmId}:${periodOptionValue(period)}:${order}`
    : null;
