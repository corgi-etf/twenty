import {
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
  isInputObjectType,
  isObjectType,
  printSchema,
  validateSchema,
} from 'graphql';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { GqlInputTypeDefinitionKind } from 'src/engine/api/graphql/workspace-schema-builder/enums/gql-input-type-definition-kind.enum';
import { ObjectTypeDefinitionKind } from 'src/engine/api/graphql/workspace-schema-builder/enums/object-type-definition-kind.enum';
import { ArgsTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/args-type/args-type.generator';
import { ObjectMetadataCreateGqlInputTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/input-types/create-input/object-metadata-create-gql-input-type.generator';
import { RelationFieldMetadataGqlInputTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/input-types/relation-field-metadata-gql-type.generator';
import { ObjectMetadataUpdateGqlInputTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/input-types/update-input/object-metadata-update-gql-input-type.generator';
import { ObjectMetadataWithRelationsGqlObjectTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/object-types/object-metadata-with-relations-gql-object-type.generator';
import { RelationFieldMetadataGqlObjectTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/object-types/relation-field-metadata-gql-object-type.generator';
import { TypeMapperService } from 'src/engine/api/graphql/workspace-schema-builder/services/type-mapper.service';
import { GqlTypesStorage } from 'src/engine/api/graphql/workspace-schema-builder/storages/gql-types.storage';
import { type SchemaGenerationContext } from 'src/engine/api/graphql/workspace-schema-builder/types/schema-generation-context.type';
import { computeObjectMetadataInputTypeKey } from 'src/engine/api/graphql/workspace-schema-builder/utils/compute-stored-gql-type-key-utils/compute-object-metadata-input-type.util';
import { computeObjectMetadataObjectTypeKey } from 'src/engine/api/graphql/workspace-schema-builder/utils/compute-stored-gql-type-key-utils/compute-object-metadata-object-type-key.util';
import { computeRelationConnectInputTypeKey } from 'src/engine/api/graphql/workspace-schema-builder/utils/compute-stored-gql-type-key-utils/compute-relation-connect-input-type-key.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const sourceObject = {
  id: 'source-object',
  nameSingular: 'sourceRecord',
} as FlatObjectMetadata;
const targetObject = {
  id: 'target-object',
  nameSingular: 'targetRecord',
} as FlatObjectMetadata;
const relationField = {
  id: 'relation-field',
  name: 'targetRecord',
  type: FieldMetadataType.RELATION,
  isNullable: true,
  relationTargetObjectMetadataId: targetObject.id,
  settings: { relationType: RelationType.MANY_TO_ONE },
} as FlatFieldMetadata<FieldMetadataType.RELATION>;

const emptyMaps = {
  byUniversalIdentifier: {},
  universalIdentifierById: {},
  universalIdentifiersByApplicationId: {},
};

const createContext = (
  includeTarget: boolean,
  excludedObjectMetadataIds?: ReadonlySet<string>,
): SchemaGenerationContext => ({
  flatObjectMetadataMaps: {
    ...emptyMaps,
    byUniversalIdentifier: includeTarget
      ? { 'target-universal-id': targetObject }
      : {},
    universalIdentifierById: includeTarget
      ? { [targetObject.id]: 'target-universal-id' }
      : {},
  },
  flatFieldMetadataMaps: emptyMaps,
  flatIndexMaps: emptyMaps,
  excludedObjectMetadataIds,
});

describe('application relation schema boundaries', () => {
  let storage: GqlTypesStorage;
  let typeMapper: TypeMapperService;
  let relationInputGenerator: RelationFieldMetadataGqlInputTypeGenerator;

  beforeEach(() => {
    storage = new GqlTypesStorage();
    typeMapper = new TypeMapperService();
    relationInputGenerator = new RelationFieldMetadataGqlInputTypeGenerator(
      typeMapper,
      storage,
    );
  });

  const buildOutput = (
    context: SchemaGenerationContext,
    field = relationField,
  ) => {
    const scalarFields = new RelationFieldMetadataGqlObjectTypeGenerator(
      typeMapper,
    ).generateRelationFieldObjectType({
      fieldMetadata: field,
      typeOptions: { nullable: true },
    });
    const key = computeObjectMetadataObjectTypeKey(
      sourceObject.nameSingular,
      ObjectTypeDefinitionKind.Plain,
    );

    storage.addGqlType(
      key,
      new GraphQLObjectType({
        name: 'SourceRecord',
        fields: { id: { type: GraphQLID }, ...scalarFields },
      }),
    );
    new ObjectMetadataWithRelationsGqlObjectTypeGenerator(
      new ArgsTypeGenerator(storage),
      storage,
    ).buildAndStore(sourceObject, [field], context);

    const result = storage.getGqlTypeByKey(key);

    if (!isObjectType(result)) throw new Error('Expected output type');

    return result;
  };

  const buildInputs = (context: SchemaGenerationContext) => {
    new ObjectMetadataCreateGqlInputTypeGenerator(
      storage,
      relationInputGenerator,
      typeMapper,
    ).buildAndStore(sourceObject, [relationField], context);
    new ObjectMetadataUpdateGqlInputTypeGenerator(
      storage,
      relationInputGenerator,
      typeMapper,
    ).buildAndStore(sourceObject, [relationField], context);

    return [
      GqlInputTypeDefinitionKind.Create,
      GqlInputTypeDefinitionKind.Update,
    ].map((kind) => {
      const type = storage.getGqlTypeByKey(
        computeObjectMetadataInputTypeKey(sourceObject.nameSingular, kind),
      );

      if (!isInputObjectType(type)) throw new Error('Expected input type');

      return type;
    });
  };

  const addTargetTypes = () => {
    storage.addGqlType(
      computeObjectMetadataObjectTypeKey(
        targetObject.nameSingular,
        ObjectTypeDefinitionKind.Plain,
      ),
      new GraphQLObjectType({
        name: 'TargetRecord',
        fields: { id: { type: GraphQLID } },
      }),
    );
    storage.addGqlType(
      computeRelationConnectInputTypeKey(targetObject.id),
      new GraphQLInputObjectType({
        name: 'TargetRecordConnectInput',
        fields: { id: { type: GraphQLID } },
      }),
    );
  };

  it('prints a valid partial schema with scalar foreign keys but no excluded nested output or connect inputs', () => {
    const context = createContext(false, new Set([targetObject.id]));
    const output = buildOutput(context);
    const inputs = buildInputs(context);
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { sourceRecord: { type: output } },
      }),
      types: inputs,
    });

    expect(validateSchema(schema)).toEqual([]);
    expect(Object.keys(output.getFields())).toEqual(['id', 'targetRecordId']);
    for (const input of inputs) {
      expect(Object.keys(input.getFields())).toEqual(['targetRecordId']);
    }
    expect(printSchema(schema)).toContain('targetRecordId: ID');
    expect(schema.getType('TargetRecord')).toBeUndefined();
    expect(schema.getType('TargetRecordConnectInput')).toBeUndefined();
  });

  it('retains scalar foreign-key filter and order inputs without nested target inputs', () => {
    const context = createContext(false, new Set([targetObject.id]));

    expect(
      Object.keys(
        relationInputGenerator.generateSimpleRelationFieldFilterInputType({
          fieldMetadata: relationField,
          typeOptions: {},
          context,
        }),
      ),
    ).toEqual(['targetRecordId']);
    expect(
      Object.keys(
        relationInputGenerator.generateSimpleRelationFieldOrderByInputType({
          fieldMetadata: relationField,
          context,
        }),
      ),
    ).toEqual(['targetRecordId']);
    expect(
      relationInputGenerator.generateSimpleRelationFieldGroupByInputType(
        relationField,
        context,
      ),
    ).toEqual({});
  });

  it('omits an excluded one-to-many output without inventing a scalar foreign key', () => {
    const output = buildOutput(
      createContext(false, new Set([targetObject.id])),
      {
        ...relationField,
        settings: { relationType: RelationType.ONE_TO_MANY },
      },
    );

    expect(Object.keys(output.getFields())).toEqual(['id']);
  });

  it.each([undefined, new Set<string>(), new Set(['another-object'])])(
    'still rejects genuinely absent target metadata with exclusion context %s',
    (excludedIds) => {
      const context = createContext(false, excludedIds);

      expect(() => buildOutput(context).getFields()).toThrow(
        'has no relation target object metadata',
      );
      for (const input of buildInputs(context)) {
        expect(() => input.getFields()).toThrow('Input type');
      }
    },
  );

  it.each([undefined, new Set<string>(), new Set([targetObject.id])])(
    'preserves nested fields for a retained target with exclusion context %s',
    (excludedIds) => {
      addTargetTypes();
      const context = createContext(true, excludedIds);

      expect(Object.keys(buildOutput(context).getFields())).toEqual([
        'id',
        'targetRecordId',
        'targetRecord',
      ]);
      for (const input of buildInputs(context)) {
        expect(Object.keys(input.getFields())).toEqual([
          'targetRecordId',
          'targetRecord',
        ]);
      }
    },
  );

  it('still rejects missing target GraphQL types when target metadata is retained', () => {
    const context = createContext(true, new Set([targetObject.id]));

    expect(() => buildOutput(context).getFields()).toThrow(
      'Could not find a relation type',
    );
    for (const input of buildInputs(context)) {
      expect(() => input.getFields()).toThrow('Input type');
    }
  });

  it('still rejects missing relation target IDs', () => {
    const context = createContext(false, new Set([targetObject.id]));
    const field = {
      ...relationField,
      relationTargetObjectMetadataId: null,
    } as unknown as FlatFieldMetadata<FieldMetadataType.RELATION>;

    expect(() => buildOutput(context, field).getFields()).toThrow(
      'has no relation target object metadata id',
    );
    expect(() =>
      relationInputGenerator.generateConnectRelationFieldInputType({
        fieldMetadata: field,
        typeOptions: {},
        context,
      }),
    ).toThrow('Target object metadata not found');
  });
});
