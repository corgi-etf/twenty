const APPLICATION_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const REGISTRATION_NAME = 'Corgi 13F Library';
const VERSION = '0.1.0';

const classifyDeploymentState = ({ applications, registration }) => {
  const matches = (applications ?? []).filter(
    ({ universalIdentifier }) => universalIdentifier === APPLICATION_ID,
  );

  if (matches.length > 1) {
    throw new Error(`Found ${matches.length} installed Corgi 13F applications`);
  }

  if (registration) {
    if (
      registration.universalIdentifier !== APPLICATION_ID ||
      registration.ownerWorkspaceId !== WORKSPACE_ID ||
      registration.name !== REGISTRATION_NAME ||
      registration.sourceType !== 'TARBALL' ||
      registration.latestAvailableVersion !== VERSION ||
      registration.isListed !== false
    ) {
      throw new Error(
        'Corgi 13F registration owner, source, privacy, or version conflicts with the release',
      );
    }
  }

  const application = matches[0];

  if (application) {
    if (
      !registration ||
      application.applicationRegistrationId !== registration.id ||
      application.version !== VERSION ||
      application.state !== 'INSTALLED'
    ) {
      throw new Error(
        'Corgi 13F installed application is not the exact stable registered release',
      );
    }

    return {
      mode: 'installed',
      publish: false,
      install: false,
      freshInstall: false,
      registrationPreexisting: true,
    };
  }

  if (registration) {
    return {
      mode: 'registered',
      publish: false,
      install: true,
      freshInstall: true,
      registrationPreexisting: true,
    };
  }

  return {
    mode: 'absent',
    publish: true,
    install: true,
    freshInstall: true,
    registrationPreexisting: false,
  };
};

export { APPLICATION_ID, VERSION, WORKSPACE_ID, classifyDeploymentState };
