import { defineIndex } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
export default defineIndex({
  universalIdentifier: '8d41be96-12fd-5cdd-890a-6d64537eb266',
  objectUniversalIdentifier: ids.COMPANYOWNERSHIP_OBJECT_ID,
  isUnique: true,
  fields: [
    {
      universalIdentifier: 'd52731a9-bb58-5ebd-bfaa-fdea91fc3237',
      fieldUniversalIdentifier: ids.COMPANYOWNERSHIP_COMPANY_ID,
    },
    {
      universalIdentifier: 'fa454a64-11c1-51f6-9342-75537b735ff9',
      fieldUniversalIdentifier: ids.COMPANYOWNERSHIP_WHOLESALER_ID,
    },
  ],
});
