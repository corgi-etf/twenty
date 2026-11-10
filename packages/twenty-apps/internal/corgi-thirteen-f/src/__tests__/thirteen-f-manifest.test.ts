import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NavigationMenuItemType } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import application from 'src/application.config';
import companyHoldingsCommand from 'src/command-menu-items/view-thirteen-f-holdings.command-menu-item';
import companyFirmIdField from 'src/fields/company-thirteen-f-firm-id.field';
import navigationItem from 'src/navigation-menu-items/thirteen-f.navigation-menu-item';
import pageLayout from 'src/page-layouts/thirteen-f.page-layout';
import defaultRole from 'src/roles/default-role';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('13F CRM manifest', () => {
  it('exposes exactly one native 13F sidebar workspace', () => {
    const navigationFiles = readdirSync(join(sourceRoot, 'navigation-menu-items'))
      .filter((name) => name.endsWith('.navigation-menu-item.ts'));

    expect(navigationFiles).toEqual(['thirteen-f.navigation-menu-item.ts']);
    expect(navigationItem.success).toBe(true);
    expect(navigationItem.config).toMatchObject({
      name: '13F',
      type: NavigationMenuItemType.PAGE_LAYOUT,
      pageLayoutUniversalIdentifier: pageLayout.config.universalIdentifier,
    });
    expect(pageLayout.config).toMatchObject({
      name: '13F',
      type: 'STANDALONE_PAGE',
    });
    const tabs = pageLayout.config.tabs ?? [];
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.widgets).toEqual([
      expect.objectContaining({
        type: 'FRONT_COMPONENT',
        configuration: expect.objectContaining({
          configurationType: 'FRONT_COMPONENT',
        }),
      }),
    ]);
  });

  it('keeps canonical holdings and documents out of CRM storage', () => {
    const objectFiles = readdirSync(join(sourceRoot, 'objects'), {
      withFileTypes: true,
    }).filter((entry) => entry.isFile() && entry.name.endsWith('.object.ts'));

    expect(objectFiles).toEqual([]);
    expect(defaultRole.config.objectPermissions).toEqual([]);
    expect(defaultRole.config.permissionFlagUniversalIdentifiers).toEqual([]);
  });

  it('keeps the website read credential server-side', () => {
    const variables = application.config.applicationVariables;

    expect(variables?.CORGI_THIRTEEN_F_API_READ_TOKEN).toMatchObject({
      isSecret: true,
    });
    expect(variables?.CORGI_THIRTEEN_F_API_BASE_URL).toMatchObject({
      isSecret: false,
    });
    expect(variables?.CORGI_THIRTEEN_F_WORKSPACE_ID).toMatchObject({
      isSecret: false,
    });
  });

  it('shows the company action only when lightweight link metadata exists', () => {
    expect(companyFirmIdField.config).toMatchObject({
      name: 'thirteenFFirmId',
      isNullable: true,
      isUIEditable: false,
    });
    expect(companyHoldingsCommand.config).toMatchObject({
      label: 'View 13F holdings',
      isPinned: true,
      availabilityType: 'GLOBAL_OBJECT_CONTEXT',
    });
    expect(companyHoldingsCommand.config.conditionalAvailabilityExpression).toContain(
      'someDefined(selectedRecords, "thirteenFFirmId")',
    );
  });
});
