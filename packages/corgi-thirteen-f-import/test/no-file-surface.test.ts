import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const sourceDirectory = new URL('../src/', import.meta.url);
const workflowUrl = new URL(
  '../../../.github/workflows/corgi-thirteen-f-import.yml',
  import.meta.url,
);

test('production importer contains no CRM or fileserver upload/download surface', async () => {
  const sources = (
    await Promise.all(
      (
        await readdir(sourceDirectory)
      )
        .filter((name) => name.endsWith('.ts'))
        .map(
          async (name) =>
            [
              name,
              await readFile(new URL(name, sourceDirectory), 'utf8'),
            ] as const,
        ),
    )
  )
    .map(([name, contents]) => `// ${name}\n${contents}`)
    .join('\n');
  const workflow = await readFile(workflowUrl, 'utf8');
  const combined = `${sources}\n${workflow}`;

  for (const forbidden of [
    'UPLOAD_FILE',
    'createFileUpload',
    'completeFileUpload',
    'attachFile',
    'downloadAttachedFile',
    '/file/FilesField',
    'THIRTEEN_F_FILE_FIELD',
    'sourceDriveId',
    'signed_url',
    'upload-artifact',
  ]) {
    assert.doesNotMatch(combined, new RegExp(forbidden, 'i'), forbidden);
  }
});
