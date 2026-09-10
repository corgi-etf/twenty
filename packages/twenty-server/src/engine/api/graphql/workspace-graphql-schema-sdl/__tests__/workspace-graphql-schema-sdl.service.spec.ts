import { GraphQLID, GraphQLObjectType, GraphQLSchema } from 'graphql';

import { type ScalarsExplorerService } from 'src/engine/api/graphql/services/scalars-explorer.service';
import { SCHEMA_SDL_CACHE_DEPENDENCIES } from 'src/engine/api/graphql/workspace-graphql-schema-sdl/constants/schema-sdl-cache-dependencies.constant';
import { WorkspaceGraphqlSchemaSDLService } from 'src/engine/api/graphql/workspace-graphql-schema-sdl/workspace-graphql-schema-sdl.service';
import { type SchemaGenerationContext } from 'src/engine/api/graphql/workspace-schema-builder/types/schema-generation-context.type';
import { type WorkspaceGraphQLSchemaGenerator } from 'src/engine/api/graphql/workspace-schema-builder/workspace-graphql-schema.factory';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { combineCacheHashes } from 'src/engine/workspace-cache/utils/combine-cache-hashes.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

const toMaps = <T extends SyncableFlatEntity>(
  entities: T[],
): FlatEntityMaps<T> => {
  const maps: FlatEntityMaps<T> = {
    byUniversalIdentifier: {},
    universalIdentifierById: {},
    universalIdentifiersByApplicationId: {},
  };

  for (const entity of entities) {
    maps.byUniversalIdentifier[entity.universalIdentifier] = entity;
    maps.universalIdentifierById[entity.id] = entity.universalIdentifier;
    maps.universalIdentifiersByApplicationId[entity.applicationId] = [
      ...(maps.universalIdentifiersByApplicationId[entity.applicationId] ?? []),
      entity.universalIdentifier,
    ];
  }

  return maps;
};

const makeObject = (id: string, applicationId: string) =>
  ({
    id,
    universalIdentifier: `${id}-universal`,
    applicationId,
    fieldIds: [],
  }) as unknown as FlatObjectMetadata;

describe('WorkspaceGraphqlSchemaSDLService application relation boundaries', () => {
  const workspace = {
    id: 'workspace',
    databaseSchema: 'workspace_schema',
  } as FlatWorkspace;
  const appObject = {
    ...makeObject('app-object', 'app'),
    fieldIds: ['app-field'],
  };
  const standardObject = makeObject('standard-object', 'standard');
  const externalObject = makeObject('external-object', 'external');
  const appRelation = {
    id: 'app-field',
    universalIdentifier: 'app-field-universal',
    applicationId: 'app',
    relationTargetObjectMetadataId: externalObject.id,
  } as FlatFieldMetadata;

  const createService = () => {
    const cacheData = {
      flatObjectMetadataMaps: toMaps([
        appObject,
        standardObject,
        externalObject,
      ]),
      flatFieldMetadataMaps: toMaps([appRelation]),
      flatIndexMaps: toMaps([]),
      flatApplicationMaps: {
        idByUniversalIdentifier: {
          [TWENTY_STANDARD_APPLICATION.universalIdentifier]: 'standard',
        },
      },
    };
    const hashes = {
      flatObjectMetadataMaps: 'objects-v1',
      flatFieldMetadataMaps: 'fields-v1',
      flatIndexMaps: 'indexes-v1',
      flatApplicationMaps: 'applications-v1',
    };
    const generateSchema = jest.fn(
      async (_context: SchemaGenerationContext) =>
        new GraphQLSchema({
          query: new GraphQLObjectType({
            name: 'Query',
            fields: { id: { type: GraphQLID } },
          }),
        }),
    );
    const getOrRecomputeManyOrAllFlatEntityMapsWithHashes = jest.fn(
      async () => ({
        data: cacheData,
        hashes,
      }),
    );
    const getGraphQLTypeDefs = jest.fn(
      async (
        _workspaceId: string,
        _metadataCacheHash: string,
        _applicationId?: string,
      ) => undefined,
    );
    const getGraphQLUsedScalarNames = jest.fn(async () => undefined);
    const setGraphQLTypeDefs = jest.fn(
      async (
        _workspaceId: string,
        _metadataCacheHash: string,
        _sdl: string,
        _applicationId?: string,
      ) => undefined,
    );
    const setGraphQLUsedScalarNames = jest.fn(async () => undefined);
    const service = new WorkspaceGraphqlSchemaSDLService(
      { getUsedScalarNames: () => ['ID'] } as unknown as ScalarsExplorerService,
      { generateSchema } as unknown as WorkspaceGraphQLSchemaGenerator,
      {
        getGraphQLTypeDefs,
        getGraphQLUsedScalarNames,
        setGraphQLTypeDefs,
        setGraphQLUsedScalarNames,
      } as unknown as WorkspaceCacheStorageService,
      {
        getOrRecomputeManyOrAllFlatEntityMapsWithHashes,
      } as unknown as WorkspaceManyOrAllFlatEntityMapsCacheService,
    );

    return {
      service,
      generateSchema,
      cacheData,
      hashes,
      getGraphQLTypeDefs,
      setGraphQLTypeDefs,
      getOrRecomputeManyOrAllFlatEntityMapsWithHashes,
    };
  };

  it('marks only known objects excluded by ownership while retaining app relations and standard objects', async () => {
    const { service, generateSchema } = createService();
    const result = await service.getOrComputeSchemaSDL(workspace, 'app');
    const context = generateSchema.mock.calls[0][0];

    expect(context.excludedObjectMetadataIds).toEqual(
      new Set([externalObject.id]),
    );
    expect(
      Object.keys(context.flatObjectMetadataMaps.universalIdentifierById),
    ).toEqual(['standard-object', 'app-object']);
    expect(
      context.flatFieldMetadataMaps.byUniversalIdentifier[
        appRelation.universalIdentifier
      ],
    ).toEqual(appRelation);
    expect(
      context.flatObjectMetadataMaps.byUniversalIdentifier[
        appObject.universalIdentifier
      ]?.fieldIds,
    ).toEqual(['app-field']);
    expect(result?.flatObjectMetadataMaps).toBe(context.flatObjectMetadataMaps);
  });

  it('does not relax missing-target validation for a full workspace schema', async () => {
    const { service, generateSchema, cacheData } = createService();

    await service.getOrComputeSchemaSDL(workspace);

    expect(
      generateSchema.mock.calls[0][0].excludedObjectMetadataIds,
    ).toBeUndefined();
    expect(generateSchema.mock.calls[0][0].flatObjectMetadataMaps).toBe(
      cacheData.flatObjectMetadataMaps,
    );
  });

  it('does not exempt an allowed target omitted by a corrupt application index', async () => {
    const { service, generateSchema, cacheData } = createService();

    cacheData.flatObjectMetadataMaps = toMaps([
      appObject,
      standardObject,
      { ...externalObject, applicationId: 'app' },
    ]);
    cacheData.flatObjectMetadataMaps.universalIdentifiersByApplicationId.app = [
      appObject.universalIdentifier,
    ];

    await service.getOrComputeSchemaSDL(workspace, 'app');

    const context = generateSchema.mock.calls[0][0];

    expect(context.excludedObjectMetadataIds).toEqual(new Set());
    expect(
      context.flatObjectMetadataMaps.universalIdentifierById[externalObject.id],
    ).toBeUndefined();
  });

  it('recomputes exclusions when object ownership changes under the existing full-map cache hash', async () => {
    const {
      service,
      generateSchema,
      cacheData,
      hashes,
      getGraphQLTypeDefs,
      setGraphQLTypeDefs,
      getOrRecomputeManyOrAllFlatEntityMapsWithHashes,
    } = createService();
    const firstHash = combineCacheHashes(hashes, SCHEMA_SDL_CACHE_DEPENDENCIES);

    await service.getOrComputeSchemaSDL(workspace, 'app');
    cacheData.flatObjectMetadataMaps = toMaps([
      appObject,
      standardObject,
      { ...externalObject, applicationId: 'app' },
    ]);
    hashes.flatObjectMetadataMaps = 'objects-v2';
    const secondHash = combineCacheHashes(
      hashes,
      SCHEMA_SDL_CACHE_DEPENDENCIES,
    );

    await service.getOrComputeSchemaSDL(workspace, 'app');

    expect(generateSchema.mock.calls[0][0].excludedObjectMetadataIds).toEqual(
      new Set([externalObject.id]),
    );
    expect(generateSchema.mock.calls[1][0].excludedObjectMetadataIds).toEqual(
      new Set(),
    );
    expect(getGraphQLTypeDefs.mock.calls).toEqual([
      [workspace.id, firstHash, 'app'],
      [workspace.id, secondHash, 'app'],
    ]);
    expect(
      setGraphQLTypeDefs.mock.calls.map((args) => [args[0], args[1], args[3]]),
    ).toEqual([
      [workspace.id, firstHash, 'app'],
      [workspace.id, secondHash, 'app'],
    ]);
    expect(
      getOrRecomputeManyOrAllFlatEntityMapsWithHashes,
    ).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      flatMapsKeys: [...SCHEMA_SDL_CACHE_DEPENDENCIES],
    });
  });
});
