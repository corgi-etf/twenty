const APPLICATION_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const REGISTRATION_NAME = 'Corgi 13F';
const LEGACY_VERSION = '0.1.0';
const INTERMEDIATE_VERSION = '0.2.0';
const PREVIOUS_VERSION = '0.2.1';
const PUBLISHED_VERSION = '0.3.0';
const PREVIOUS_STABLE_VERSION = '0.3.1';
const CURRENT_STABLE_VERSION = '0.3.2';
const VERSION = '0.3.3';
const APPROVED_REGISTRATION_VERSIONS = [
  LEGACY_VERSION,
  INTERMEDIATE_VERSION,
  PREVIOUS_VERSION,
  PUBLISHED_VERSION,
  PREVIOUS_STABLE_VERSION,
  CURRENT_STABLE_VERSION,
  VERSION,
];
const APPROVED_INSTALLED_VERSIONS = [
  LEGACY_VERSION,
  INTERMEDIATE_VERSION,
  PREVIOUS_VERSION,
  PREVIOUS_STABLE_VERSION,
  CURRENT_STABLE_VERSION,
  VERSION,
];

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
      !APPROVED_REGISTRATION_VERSIONS.includes(
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
      application.state !== 'INSTALLED'
    ) {
      throw new Error(
        'Corgi 13F installed application is not an approved stable release',
      );
    }

    const isPublishedVersionRecovery =
      application.version === PUBLISHED_VERSION &&
      [
        PUBLISHED_VERSION,
        PREVIOUS_STABLE_VERSION,
        CURRENT_STABLE_VERSION,
        VERSION,
      ].includes(registration.latestAvailableVersion);

    if (
      !isPublishedVersionRecovery &&
      !APPROVED_INSTALLED_VERSIONS.includes(application.version)
    ) {
      throw new Error(
        'Corgi 13F installed application is not an approved stable release',
      );
    }

    if (isPublishedVersionRecovery) {
      return {
        mode: 'upgrade-required',
        publish: registration.latestAvailableVersion !== VERSION,
        install: false,
        upgrade: true,
        freshInstall: false,
        registrationPreexisting: true,
      };
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
      publish: registration.latestAvailableVersion !== VERSION,
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
      publish: registration.latestAvailableVersion !== VERSION,
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
  CURRENT_STABLE_VERSION,
  INTERMEDIATE_VERSION,
  LEGACY_VERSION,
  PREVIOUS_VERSION,
  PREVIOUS_STABLE_VERSION,
  PUBLISHED_VERSION,
  VERSION,
  WORKSPACE_ID,
  classifyDeploymentState,
};
