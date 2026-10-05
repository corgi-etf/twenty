import { useCorgiHomeEnabled } from '@/corgi-crm/home/hooks/useCorgiHomeEnabled';
import { type CorgiHomeQuery } from '@/corgi-crm/types/CorgiHome';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

const CORGI_HOME_QUERY = gql`
  query CorgiHome($path: String!) {
    corgiHome @rest(type: "CorgiHomeResponse", path: $path) {
      data
    }
  }
`;

export const useCorgiHomeResource = <TData>(query: CorgiHomeQuery = {}) => {
  const enabled = useCorgiHomeEnabled();
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value);
  });
  const { data, loading, error, refetch } = useQuery<{
    corgiHome: { data: TData };
  }>(CORGI_HOME_QUERY, {
    variables: { path: `/corgi-crm/home?${params.toString()}` },
    skip: !enabled,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });
  return { data: data?.corgiHome?.data, loading, error, refetch };
};
