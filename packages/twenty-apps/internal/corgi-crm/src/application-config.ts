import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Corgi CRM',
  description: 'Corgi CRM territory and wholesaler automation.',
  applicationVariables: {
    CORGI_CRM_WORKSPACE_ID: {
      universalIdentifier: '2878690b-7830-4702-b78f-03822b77c12c',
      description:
        'Workspace ID allowed to run Corgi CRM automation. The member-created trigger fails closed for every other workspace.',
      isSecret: false,
    },
  },
});
