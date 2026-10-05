const sessionPreferences = new Map<string, boolean>();

export const getCorgiCelebrationPreferenceKey = (
  workspaceId: string,
  memberId: string,
) => `corgi-celebrations:${workspaceId}:${memberId}`;

export const getCorgiCelebrationsEnabled = (key: string) => {
  try {
    return localStorage.getItem(key) !== 'disabled';
  } catch {
    return sessionPreferences.get(key) ?? true;
  }
};

export const setCorgiCelebrationsEnabled = (key: string, enabled: boolean) => {
  sessionPreferences.set(key, enabled);
  try {
    localStorage.setItem(key, enabled ? 'enabled' : 'disabled');
  } catch {
    // Retain the opt-out for this session when storage is unavailable.
  }
};
