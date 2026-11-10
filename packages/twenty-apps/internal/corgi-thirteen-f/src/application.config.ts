import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  API_BASE_URL_VARIABLE_ID,
  API_READ_TOKEN_VARIABLE_ID,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  WORKSPACE_ID_VARIABLE_ID,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationVariables: {
    CORGI_THIRTEEN_F_API_BASE_URL: {
      universalIdentifier: API_BASE_URL_VARIABLE_ID,
      description:
        'Approved website origin serving the internal 13F read API. The server function accepts only https://admin.corgiinvest.com.',
      isSecret: false,
    },
    CORGI_THIRTEEN_F_API_READ_TOKEN: {
      universalIdentifier: API_READ_TOKEN_VARIABLE_ID,
      description:
        'Bearer credential for the website 13F read API. It is available only to the authenticated server function and must never be sent to a browser.',
      isSecret: true,
    },
    CORGI_THIRTEEN_F_WORKSPACE_ID: {
      universalIdentifier: WORKSPACE_ID_VARIABLE_ID,
      description:
        'Twenty workspace allowed to use the 13F server proxy. Requests from every other workspace fail closed.',
      isSecret: false,
    },
  },
});
