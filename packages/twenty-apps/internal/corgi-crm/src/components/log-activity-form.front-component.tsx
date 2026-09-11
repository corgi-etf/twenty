import { useCallback, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  closeSidePanel,
  enqueueSnackbar,
  unmountFrontComponent,
  useRecordId,
} from 'twenty-sdk/front-component';

import { LOG_ACTIVITY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants';
import {
  QUICK_LOG_ACTIVITY_LABELS,
  QUICK_LOG_ACTIVITY_TYPES,
  QUICK_LOG_OUTCOME_LABELS,
  QUICK_LOG_OUTCOMES,
} from 'src/modules/outreach/quick-log-taxonomy';

const STYLES = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
  },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 },
  control: { padding: '6px 8px', fontSize: 13 },
  notes: { padding: '6px 8px', fontSize: 13, minHeight: 72 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  button: { padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
} as const;

export const LogActivityForm = () => {
  const companyId = useRecordId();
  const [activityType, setActivityType] = useState<string>(
    QUICK_LOG_ACTIVITY_TYPES[0],
  );
  const [outcome, setOutcome] = useState<string>(QUICK_LOG_OUTCOMES[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!companyId || submitting) return;
    setSubmitting(true);
    try {
      const apiBaseUrl = process.env.TWENTY_API_URL;
      const token =
        process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
      if (!apiBaseUrl || !token) throw new Error('API configuration missing');
      const response = await fetch(`${apiBaseUrl}/s/outreach/log-from-company`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          activityId: crypto.randomUUID(),
          companyId,
          activityType,
          outcome,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!response.ok) {
        // 409 is the one refusal a user can act on themselves.
        enqueueSnackbar(
          response.status === 409
            ? 'Your user is not linked to a wholesaler, so the activity would have no owner.'
            : 'Could not log the activity.',
          { variant: 'error' },
        );
        return;
      }
      enqueueSnackbar('Activity logged.', { variant: 'success' });
      closeSidePanel();
      unmountFrontComponent();
    } catch {
      enqueueSnackbar('Could not log the activity.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [activityType, companyId, notes, outcome, submitting]);

  if (!companyId) {
    return <div style={STYLES.form}>Open a company to log an activity.</div>;
  }

  return (
    <div style={STYLES.form}>
      <label style={STYLES.label}>
        Activity type
        <select
          style={STYLES.control}
          value={activityType}
          onChange={(event) => setActivityType(event.target.value)}
        >
          {/* Options come from the shared taxonomy, so the form can only ever
              offer values the server already accepts. */}
          {QUICK_LOG_ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {QUICK_LOG_ACTIVITY_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label style={STYLES.label}>
        Outcome
        <select
          style={STYLES.control}
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        >
          {QUICK_LOG_OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {QUICK_LOG_OUTCOME_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label style={STYLES.label}>
        Notes
        <textarea
          style={STYLES.notes}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div style={STYLES.actions}>
        <button
          type="button"
          style={STYLES.button}
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? 'Logging…' : 'Log activity'}
        </button>
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: LOG_ACTIVITY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'log-activity-form',
  description:
    'Logs one outreach activity against the company currently open, without leaving the record.',
  component: LogActivityForm,
});
