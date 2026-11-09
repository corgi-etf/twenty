const APPLICATION_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const REGISTRATION_NAME = 'Corgi 13F Library';
const PREVIOUS_VERSION = '0.1.0';
const VERSION = '0.2.0';

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
      ![PREVIOUS_VERSION, VERSION].includes(
        registration.latestAvailableVersion,
      ) ||
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
      application.state !== 'INSTALLED' ||
      ![PREVIOUS_VERSION, VERSION].includes(application.version)
    ) {
      throw new Error(
        'Corgi 13F installed application is not an approved stable release',
      );
    }

    if (application.version === VERSION) {
      if (registration.latestAvailableVersion !== VERSION) {
        throw new Error(
          'Corgi 13F installed release is newer than its registration',
        );
      }

      return {
        mode: 'installed',
        publish: false,
        install: false,
        upgrade: false,
        freshInstall: false,
        registrationPreexisting: true,
      };
    }

    return {
      mode: 'upgrade-required',
      publish: registration.latestAvailableVersion === PREVIOUS_VERSION,
      install: false,
      upgrade: true,
      freshInstall: false,
      registrationPreexisting: true,
    };
  }

  if (registration) {
    return {
      mode:
        registration.latestAvailableVersion === VERSION
          ? 'registered'
          : 'registered-previous',
      publish: registration.latestAvailableVersion === PREVIOUS_VERSION,
      install: true,
      upgrade: false,
      freshInstall: true,
      registrationPreexisting: true,
    };
  }

  return {
    mode: 'absent',
    publish: true,
    install: true,
    upgrade: false,
    freshInstall: true,
    registrationPreexisting: false,
  };
};

export {
  APPLICATION_ID,
  PREVIOUS_VERSION,
  VERSION,
  WORKSPACE_ID,
  classifyDeploymentState,
};
