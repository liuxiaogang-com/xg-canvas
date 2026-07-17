import { describe, expect, it } from 'vitest';
import {
  assertCatalogAuthoringFileSize,
  MAX_CATALOG_AUTHORING_FILE_LINES,
} from './authoring-loader';

describe('Catalog authoring file size', () => {
  it('accepts the limit and rejects a file above it', () => {
    expect(() => assertCatalogAuthoringFileSize(
      'models.yaml',
      Array.from({ length: MAX_CATALOG_AUTHORING_FILE_LINES }, () => 'x').join('\n'),
    )).not.toThrow();
    expect(() => assertCatalogAuthoringFileSize(
      'models.yaml',
      Array.from({ length: MAX_CATALOG_AUTHORING_FILE_LINES + 1 }, () => 'x').join('\n'),
    )).toThrow('split it by model family or input mode');
  });
});
