import type { ReactNode } from 'react';

export type RequestState<TData> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TData }
  | { status: 'error'; message: string };

export const idleRequest = <TData,>(): RequestState<TData> => ({
  status: 'idle',
});

export const loadingRequest = <TData,>(): RequestState<TData> => ({
  status: 'loading',
});

export const successfulRequest = <TData,>(
  data: TData,
): RequestState<TData> => ({ status: 'success', data });

export const failedRequest = <TData,>(
  message: string,
): RequestState<TData> => ({ status: 'error', message });

type RequestStateContentProps<TData> = {
  state: RequestState<TData>;
  loadingLabel: string;
  children(data: TData): ReactNode;
};

const STATUS_STYLE = {
  border: '1px dashed #D0D5DD',
  borderRadius: 10,
  padding: 24,
  color: '#667085',
  textAlign: 'center',
} as const;

const ERROR_STYLE = {
  border: '1px solid #FDA29B',
  borderRadius: 10,
  padding: 14,
  background: '#FEF3F2',
  color: '#B42318',
  fontSize: 13,
} as const;

export const RequestStateContent = <TData,>({
  state,
  loadingLabel,
  children,
}: RequestStateContentProps<TData>) => {
  if (state.status === 'error') {
    return (
      <div style={ERROR_STYLE} role="alert">
        {state.message}
      </div>
    );
  }
  if (state.status !== 'success') {
    return (
      <div style={STATUS_STYLE} role="status" aria-live="polite">
        {loadingLabel}
      </div>
    );
  }
  return children(state.data);
};
