export type LoadMoreRequestGate = {
  nextRequestId: number;
  activeRequestId: number | null;
};

export const createLoadMoreRequestGate = (): LoadMoreRequestGate => ({
  nextRequestId: 0,
  activeRequestId: null,
});

export const beginLoadMoreRequest = (gate: LoadMoreRequestGate) => {
  gate.nextRequestId += 1;
  gate.activeRequestId = gate.nextRequestId;
  return gate.activeRequestId;
};

export const hasActiveLoadMoreRequest = (gate: LoadMoreRequestGate) =>
  gate.activeRequestId !== null;

export const isActiveLoadMoreRequest = (
  gate: LoadMoreRequestGate,
  requestId: number,
) => gate.activeRequestId === requestId;

export const invalidateLoadMoreRequest = (gate: LoadMoreRequestGate) => {
  gate.activeRequestId = null;
};

export const finishLoadMoreRequest = (
  gate: LoadMoreRequestGate,
  requestId: number,
) => {
  if (!isActiveLoadMoreRequest(gate, requestId)) return false;
  gate.activeRequestId = null;
  return true;
};
