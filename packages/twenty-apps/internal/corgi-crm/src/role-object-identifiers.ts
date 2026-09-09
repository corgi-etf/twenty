const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredObjectUniversalIdentifier = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be resolved to a metadata object UUID before packaging`);
  }
  return value;
};

export const CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER =
  requiredObjectUniversalIdentifier(
    'CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER',
  );

export const CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER =
  requiredObjectUniversalIdentifier(
    'CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER',
  );
