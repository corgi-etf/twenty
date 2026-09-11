import { useCallback, useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  closeSidePanel,
  enqueueSnackbar,
  unmountFrontComponent,
  useRecordId,
} from 'twenty-sdk/front-component';

import { CHANGE_BOOKED_BY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants';

type Member = { id: string; label: string };

const STYLES = {
  form: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 },
  control: { padding: '6px 8px', fontSize: 13 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  button: { padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
} as const;

const credentials = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
  if (!apiBaseUrl || !token) throw new Error('API configuration missing');
  return { apiBaseUrl, token };
};

export const ChangeBookedByForm = () => {
  const meetingId = useRecordId();
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { apiBaseUrl, token } = credentials();
        const response = await fetch(`${apiBaseUrl}/graphql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query:
              'query CorgiChangeBookedByMembers { workspaceMembers(first: 200) { edges { node { id name { firstName lastName } } } } }',
          }),
        });
        const payload = await response.json();
        const edges = payload?.data?.workspaceMembers?.edges ?? [];
        const rows: Member[] = [];
        for (const edge of edges) {
          const id = edge?.node?.id;
          if (typeof id !== 'string' || !id) continue;
          const label = [
            edge?.node?.name?.firstName,
            edge?.node?.name?.lastName,
          ]
            .filter(Boolean)
            .join(' ')
            .trim();
          rows.push({ id, label: label || id });
        }
        if (cancelled) return;
        // Sorted by the name people actually read, not insertion order.
        rows.sort((left, right) => left.label.localeCompare(right.label));
        setMembers(rows);
        setSelected(rows[0]?.id ?? '');
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!meetingId || !selected || submitting) return;
    setSubmitting(true);
    try {
      const { apiBaseUrl, token } = credentials();
      const response = await fetch(`${apiBaseUrl}/s/meeting/set-booked-by`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ meetingId, bookedById: selected }),
      });
      if (!response.ok) {
        enqueueSnackbar('Could not change who booked this meeting.', {
          variant: 'error',
        });
        return;
      }
      enqueueSnackbar('Booked by updated.', { variant: 'success' });
      closeSidePanel();
      unmountFrontComponent();
    } catch {
      enqueueSnackbar('Could not change who booked this meeting.', {
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [meetingId, selected, submitting]);

  if (!meetingId) {
    return (
      <div style={STYLES.form}>Open a meeting to change its attribution.</div>
    );
  }
  if (loadFailed) {
    return <div style={STYLES.form}>Could not load workspace members.</div>;
  }

  return (
    <div style={STYLES.form}>
      <label style={STYLES.label}>
        Booked by
        <select
          style={STYLES.control}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
      </label>
      <div style={STYLES.actions}>
        <button
          type="button"
          style={STYLES.button}
          disabled={submitting || !selected}
          onClick={handleSubmit}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier:
    CHANGE_BOOKED_BY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'change-booked-by-form',
  description:
    'Reattributes the open meeting to another workspace member, for bookings logged on someone else behalf.',
  component: ChangeBookedByForm,
});
