import type {
  FieldDefinition,
  MigrationSchema,
  ObjectDefinition,
} from './schema.ts';

export type MetadataField = { id: string; name: string; type: string };
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
    if (existingField && existingField.type !== definition.type) {
      throw new Error(
        `Metadata collision: ${definition.objectName}.${definition.name} is ${existingField.type}, expected ${definition.type}`,
      );
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
      },
    ];
    fieldsCreated += 1;
  }

  return { objectsCreated, fieldsCreated };
};
