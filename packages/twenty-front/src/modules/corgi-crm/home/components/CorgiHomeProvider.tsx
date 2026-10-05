import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useListenToObjectRecordOperationBrowserEvent } from '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent';
import { CorgiLiveEvents } from '@/corgi-crm/events/components/CorgiLiveEvents';
import { useCorgiHomeEnabled } from '@/corgi-crm/home/hooks/useCorgiHomeEnabled';
import { useCorgiHomeResource } from '@/corgi-crm/home/hooks/useCorgiHomeResource';
import { type CorgiHomeSummary } from '@/corgi-crm/types/CorgiHome';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useListenToEventsForQuery } from '@/sse-db-event/hooks/useListenToEventsForQuery';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useDebouncedCallback } from 'use-debounce';

const BUSINESS_OBJECTS = [
  'outreachActivity',
  'meetingBooking',
  'companyAllocation',
  'company',
  'person',
  'wholesaler',
  'leadAssignment',
  'task',
  'note',
  'outreachFollowUp',
];

type CorgiHomeContextValue = {
  summary?: CorgiHomeSummary;
  loading: boolean;
  error?: unknown;
  enabled: boolean;
  refresh: () => void;
  revision: number;
};

const CorgiHomeContext = createContext<CorgiHomeContextValue>({
  loading: false,
  enabled: false,
  refresh: () => undefined,
  revision: 0,
});

export const useCorgiHome = () => useContext(CorgiHomeContext);

const CorgiObjectSubscriptionEffect = ({
  objectNameSingular,
  refresh,
}: {
  objectNameSingular: string;
  refresh: () => void;
}) => {
  const operationSignature = useMemo(
    () => ({ objectNameSingular, variables: { filter: {} } }),
    [objectNameSingular],
  );
  useListenToEventsForQuery({
    queryId: `corgi-home-${objectNameSingular}`,
    operationSignature,
    onSseReconnected: refresh,
  });
  return null;
};

export const CorgiHomeProvider = ({ children }: { children: ReactNode }) => {
  const enabled = useCorgiHomeEnabled();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const {
    data: summary,
    loading,
    error,
    refetch,
  } = useCorgiHomeResource<CorgiHomeSummary>();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const [revision, setRevision] = useState(0);
  const refresh = useDebouncedCallback(() => {
    if (!enabled) return;
    setRevision((value) => value + 1);
    void refetch().catch(() => undefined);
  }, 500);
  const handleOperation = useCallback(() => refresh(), [refresh]);
  useListenToObjectRecordOperationBrowserEvent({
    onObjectRecordOperationBrowserEvent: handleOperation,
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      refresh.cancel();
    };
  }, [enabled, refresh]);

  const value = useMemo(
    () => ({ summary, loading, error, enabled, refresh, revision }),
    [summary, loading, error, enabled, refresh, revision],
  );
  return (
    <CorgiHomeContext.Provider value={value}>
      {enabled &&
        objectMetadataItems
          .filter(
            (object) =>
              BUSINESS_OBJECTS.includes(object.nameSingular) &&
              objectPermissionsByObjectMetadataId[object.id]
                ?.canReadObjectRecords,
          )
          .map((object) => (
            <CorgiObjectSubscriptionEffect
              key={object.id}
              objectNameSingular={object.nameSingular}
              refresh={refresh}
            />
          ))}
      {enabled && currentWorkspace && currentWorkspaceMember && (
        <CorgiLiveEvents
          key={`${currentWorkspace.id}:${currentWorkspaceMember.id}`}
          wins={summary?.liveWins.records ?? []}
          ready={Boolean(summary)}
          serverTime={summary?.generatedAt}
          workspaceId={currentWorkspace.id}
          workspaceMemberId={currentWorkspaceMember.id}
        />
      )}
      {children}
    </CorgiHomeContext.Provider>
  );
};
