import type {
  FieldDefinition,
  MigrationSchema,
  ObjectDefinition,
} from './schema.ts';

export type MetadataField = {
  id: string;
  name: string;
  type: string;
  isUnique?: boolean;
  options?: Array<Record<string, unknown>> | null;
  settings?: { relationType?: string } | null;
  relationTargetObjectMetadataId?: string | null;
};
export type MetadataObject = {
  id: string;
  nameSingular: string;
  namePlural: string;
  fields?: MetadataField[];
};

export type MetadataApi = {
  listMetadataObjects(): Promise<MetadataObject[]>;
  createMetadataObject(definition: ObjectDefinition): Promise<void>;
  createMetadataField(
    definition: FieldDefinition,
    objectId: string,
    targetObjectId?: string,
  ): Promise<void>;
};

const normalizedOptions = (
  options: Array<Record<string, unknown>> | null | undefined,
): Array<Record<string, unknown>> =>
  (options ?? [])
    .map(({ id, value, label, position, color }) => ({
      ...(id !== undefined ? { id } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(color !== undefined ? { color } : {}),
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

const assertFieldCompatible = (
  definition: FieldDefinition,
  existing: MetadataField,
  objectsByName: ReadonlyMap<string, MetadataObject>,
): void => {
  const fieldName = `${definition.objectName}.${definition.name}`;

  if (existing.type !== definition.type) {
    throw new Error(
      `Metadata collision: ${fieldName} is ${existing.type}, expected ${definition.type}`,
    );
  }

  if (Boolean(existing.isUnique) !== Boolean(definition.isUnique)) {
    throw new Error(
      `Metadata collision: ${fieldName} isUnique=${Boolean(existing.isUnique)}, expected ${Boolean(definition.isUnique)}`,
    );
  }

  if (
    JSON.stringify(normalizedOptions(existing.options)) !==
    JSON.stringify(normalizedOptions(definition.options))
  ) {
    throw new Error(`Metadata collision: ${fieldName} options differ`);
  }

  if (!definition.relation) return;

  if (existing.settings?.relationType !== definition.relation.type) {
    throw new Error(
      `Metadata collision: ${fieldName} cardinality is ${existing.settings?.relationType ?? 'unknown'}, expected ${definition.relation.type}`,
    );
  }

  const targetObject = objectsByName.get(definition.relation.targetObjectName);
  if (!targetObject) {
    throw new Error(
      `Metadata relation target ${definition.relation.targetObjectName} does not exist`,
    );
  }
  if (existing.relationTargetObjectMetadataId !== targetObject.id) {
    throw new Error(
      `Metadata collision: ${fieldName} target is ${existing.relationTargetObjectMetadataId ?? 'unknown'}, expected ${targetObject.id}`,
    );
  }
};

export const bootstrapSchema = async (
  schema: MigrationSchema,
  api: MetadataApi,
): Promise<{ objectsCreated: number; fieldsCreated: number }> => {
  let objects = await api.listMetadataObjects();
  const objectByName = () =>
    new Map(objects.map((item) => [item.nameSingular, item]));

  // Validate every existing definition before creating any metadata.
  for (const definition of schema.objects) {
    const existing = objectByName().get(definition.nameSingular);
    if (existing && existing.namePlural !== definition.namePlural) {
      throw new Error(
        `Metadata collision: ${definition.nameSingular} has plural ${existing.namePlural}`,
      );
    }
  }
  for (const definition of schema.fields) {
    const existingObject = objectByName().get(definition.objectName);
    const existingField = existingObject?.fields?.find(
      ({ name }) => name === definition.name,
    );
    if (existingField) {
      assertFieldCompatible(definition, existingField, objectByName());
    }
  }

  let objectsCreated = 0;
  for (const definition of schema.objects) {
    if (!objectByName().has(definition.nameSingular)) {
      await api.createMetadataObject(definition);
      objectsCreated += 1;
    }
  }
  if (objectsCreated) objects = await api.listMetadataObjects();

  let fieldsCreated = 0;
  const orderedFields = [...schema.fields].sort(
    (left, right) =>
      Number(Boolean(left.relation)) - Number(Boolean(right.relation)),
  );
  for (const definition of orderedFields) {
    const sourceObject = objectByName().get(definition.objectName);
    if (!sourceObject) {
      throw new Error(
        `Metadata object ${definition.objectName} does not exist`,
      );
    }
    if (sourceObject.fields?.some(({ name }) => name === definition.name))
      continue;

    const targetObjectId = definition.relation
      ? objectByName().get(definition.relation.targetObjectName)?.id
      : undefined;
    if (definition.relation && !targetObjectId) {
      throw new Error(
        `Metadata relation target ${definition.relation.targetObjectName} does not exist`,
      );
    }

    await api.createMetadataField(definition, sourceObject.id, targetObjectId);
    sourceObject.fields = [
      ...(sourceObject.fields ?? []),
      {
        id: `created:${definition.name}`,
        name: definition.name,
        type: definition.type,
        isUnique: definition.isUnique ?? false,
        options: definition.options ?? null,
        settings: definition.relation
          ? { relationType: definition.relation.type }
          : null,
        relationTargetObjectMetadataId: targetObjectId ?? null,
      },
    ];
    fieldsCreated += 1;
  }

  return { objectsCreated, fieldsCreated };
};
