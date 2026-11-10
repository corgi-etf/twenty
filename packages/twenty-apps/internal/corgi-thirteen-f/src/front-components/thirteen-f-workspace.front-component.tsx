import { defineFrontComponent } from 'twenty-sdk/define';

import { THIRTEEN_F_WORKSPACE_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { ThirteenFWorkspace } from 'src/front-components/thirteen-f-workspace/workspace';

export default defineFrontComponent({
  universalIdentifier: THIRTEEN_F_WORKSPACE_FRONT_COMPONENT_ID,
  name: '13F workspace',
  description:
    'Firm-first 13F holdings review with security reverse lookup and dated filing context.',
  component: ThirteenFWorkspace,
});
