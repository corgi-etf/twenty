import { expect, test } from '@playwright/test';

import { requireProductionEnvironment } from './requireProductionEnvironment';

type MetadataResponse<T> = {
  data?: T;
  errors?: unknown;
};

const EXPECTED_ACCESS_DOMAINS = ['corgi.com', 'corgi.insure'] as const;

test.beforeAll(() => {
  requireProductionEnvironment();
});

test('allows fresh Corgi-domain emails to discover the production workspace', async ({
  page,
  playwright,
}) => {
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  const frontendOrigin = new URL(FRONTEND_BASE_URL).origin;
  const metadataUrl = new URL('/metadata', BACKEND_BASE_URL).toString();

  const configurationResponse = await page.request.post(metadataUrl, {
    headers: {
      Origin: frontendOrigin,
    },
    data: {
      operationName: 'ProductionDomainAccessConfiguration',
      query: `query ProductionDomainAccessConfiguration {
        currentUser {
          currentWorkspace {
            id
          }
        }
        getApprovedAccessDomains {
          domain
          isValidated
        }
      }`,
    },
  });

  expect(configurationResponse.ok()).toBe(true);

  const configurationBody =
    (await configurationResponse.json()) as MetadataResponse<{
      currentUser?: {
        currentWorkspace?: {
          id: string;
        };
      };
      getApprovedAccessDomains?: Array<{
        domain: string;
        isValidated: boolean;
      }>;
    }>;

  expect(configurationBody.errors).toBeUndefined();

  const currentWorkspaceId =
    configurationBody.data?.currentUser?.currentWorkspace?.id;

  expect(currentWorkspaceId).toBeTruthy();

  const approvedAccessDomains = new Map(
    configurationBody.data?.getApprovedAccessDomains?.map(
      ({ domain, isValidated }) => [domain, isValidated],
    ),
  );

  for (const domain of EXPECTED_ACCESS_DOMAINS) {
    expect(approvedAccessDomains.get(domain)).toBe(true);
  }

  const anonymousRequest = await playwright.request.newContext({
    extraHTTPHeaders: {
      Origin: frontendOrigin,
    },
    storageState: {
      cookies: [],
      origins: [],
    },
  });

  try {
    expect((await anonymousRequest.storageState()).cookies).toEqual([]);

    const publicWorkspaceResponse = await anonymousRequest.post(metadataUrl, {
      data: {
        operationName: 'ProductionPublicWorkspace',
        query: `query ProductionPublicWorkspace($origin: String!) {
          getPublicWorkspaceDataByDomain(origin: $origin) {
            id
            workspaceUrls {
              subdomainUrl
              customUrl
            }
          }
        }`,
        variables: {
          origin: frontendOrigin,
        },
      },
    });

    expect(publicWorkspaceResponse.ok()).toBe(true);

    const publicWorkspaceBody =
      (await publicWorkspaceResponse.json()) as MetadataResponse<{
        getPublicWorkspaceDataByDomain?: {
          id: string;
          workspaceUrls: {
            subdomainUrl: string;
            customUrl?: string | null;
          };
        };
      }>;

    expect(publicWorkspaceBody.errors).toBeUndefined();

    const publicWorkspace =
      publicWorkspaceBody.data?.getPublicWorkspaceDataByDomain;

    expect(publicWorkspace?.id).toBe(currentWorkspaceId);
    expect(
      [
        publicWorkspace?.workspaceUrls.subdomainUrl,
        publicWorkspace?.workspaceUrls.customUrl,
      ]
        .filter((url): url is string => Boolean(url))
        .map((url) => new URL(url).origin),
    ).toContain(frontendOrigin);

    const emailSuffix = `${Date.now()}-${test.info().retry}`;

    for (const domain of EXPECTED_ACCESS_DOMAINS) {
      const checkUserResponse = await anonymousRequest.post(metadataUrl, {
        data: {
          operationName: 'CheckUserExists',
          query: `query CheckUserExists(
            $email: String!
            $captchaToken: String
          ) {
            checkUserExists(
              email: $email
              captchaToken: $captchaToken
            ) {
              exists
              availableWorkspacesCount
              isEmailVerified
            }
          }`,
          variables: {
            email: `crm-domain-canary-${emailSuffix}@${domain}`,
            captchaToken: null,
          },
        },
      });

      expect(checkUserResponse.ok()).toBe(true);

      const checkUserBody =
        (await checkUserResponse.json()) as MetadataResponse<{
          checkUserExists?: {
            exists: boolean;
            availableWorkspacesCount: number;
            isEmailVerified: boolean;
          };
        }>;

      expect(checkUserBody.errors).toBeUndefined();
      expect(checkUserBody.data?.checkUserExists).toEqual({
        exists: false,
        availableWorkspacesCount: 1,
        isEmailVerified: false,
      });
    }

    expect((await anonymousRequest.storageState()).cookies).toEqual([]);
  } finally {
    await anonymousRequest.dispose();
  }
});
