import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import { useCorgiHomeResource } from '@/corgi-crm/home/hooks/useCorgiHomeResource';
import {
  type CorgiHomeQuery,
  type CorgiPage,
} from '@/corgi-crm/types/CorgiHome';
import { useEffect, useState } from 'react';

export const useCorgiPagedResource = <TRecord>(query: CorgiHomeQuery) => {
  const [cursors, setCursors] = useState<string[]>([]);
  const { revision } = useCorgiHome();
  const resource = useCorgiHomeResource<CorgiPage<TRecord>>({
    ...query,
    cursor: cursors.at(-1),
  });
  const { refetch } = resource;
  useEffect(() => {
    if (revision > 0) void refetch().catch(() => undefined);
  }, [revision, refetch]);
  return {
    ...resource,
    pageNumber: cursors.length + 1,
    nextPage: () => {
      const cursor = resource.data?.nextCursor;
      if (cursor) setCursors((previous) => [...previous, cursor]);
    },
    previousPage: () => setCursors((previous) => previous.slice(0, -1)),
    resetPage: () => setCursors([]),
  };
};
