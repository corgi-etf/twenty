import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NavigationMenuItemType } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import application from 'src/application.config';
import companyFirmIdField from 'src/fields/company-thirteen-f-firm-id.field';
import navigationItem from 'src/navigation-menu-items/thirteen-f.navigation-menu-item';
import pageLayout from 'src/page-layouts/thirteen-f.page-layout';
import defaultRole from 'src/roles/default-role';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_V021_NAVIGATION_ID = '7cb2d1fc-c0eb-407a-9a4b-a519fbb70f9a';
const V031_NAVIGATION_ID = '9c000341-d6f3-48b8-9731-73c5c295eba3';

describe('13F CRM manifest', () => {
  it('exposes exactly one native 13F sidebar workspace', () => {
    const navigationFiles = readdirSync(join(sourceRoot, 'navigation-menu-items'))
      .filter((name) => name.endsWith('.navigation-menu-item.ts'));

    expect(navigationFiles).toEqual(['thirteen-f.navigation-menu-item.ts']);
    expect(navigationItem.success).toBe(true);
    expect(navigationItem.config).toMatchObject({
      universalIdentifier: V031_NAVIGATION_ID,
      name: '13F',
      type: NavigationMenuItemType.PAGE_LAYOUT,
      pageLayoutUniversalIdentifier: pageLayout.config.universalIdentifier,
    });
    expect(navigationItem.config.universalIdentifier).not.toBe(
      LEGACY_V021_NAVIGATION_ID,
    );
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
    const objectsDirectory = join(sourceRoot, 'objects');
    const objectFiles = existsSync(objectsDirectory)
      ? readdirSync(objectsDirectory, { withFileTypes: true }).filter(
          (entry) => entry.isFile() && entry.name.endsWith('.object.ts'),
        )
      : [];

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
    const commandSource = readFileSync(
      join(
        sourceRoot,
        'command-menu-items/view-thirteen-f-holdings.command-menu-item.ts',
      ),
      'utf8',
    );
    expect(companyFirmIdField.config).toMatchObject({
      name: 'thirteenFFirmId',
      isNullable: true,
      isUIEditable: false,
    });
    expect(commandSource).toContain("label: 'View 13F holdings'");
    expect(commandSource).toContain("availabilityType: 'GLOBAL_OBJECT_CONTEXT'");
    expect(commandSource).toMatch(
      /conditionalAvailabilityExpression:\s*someDefined\(\s*selectedRecords,\s*'thirteenFFirmId'/,
    );
  });
});
