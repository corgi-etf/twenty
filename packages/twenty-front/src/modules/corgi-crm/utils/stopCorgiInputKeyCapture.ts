import { type KeyboardEvent } from 'react';

// Global hotkeys bind on document, and useGlobalHotkeys defaults both
// enableOnFormTags and preventDefault to true. They are only held back for
// fields registered on the focus stack, which these plain inputs are not, so
// '/', '@', '?' and Enter were consumed before reaching the field -- an email
// address could not be typed. Keep key events inside the editor instead.
export const stopCorgiInputKeyCapture = (
  event: KeyboardEvent<HTMLElement>,
): void => {
  event.stopPropagation();
};
