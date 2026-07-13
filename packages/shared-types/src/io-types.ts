/**
 * Canonical IO types for ports on canvas nodes and edges.
 * Spec: docs/node-spec.md §1.
 */
export const IO_TYPES = [
  'text',
  'image',
  'image_list',
  'grid',
  'video',
  'audio',
  'json',
  'reference',
  'mask',
  'style_token',
  'entity_ref',
  'library_ref',
] as const;

export type IOType = (typeof IO_TYPES)[number];

/**
 * Subtypes valid for `entity_ref`. Stored as `entity_ref:<kind>` on edges.
 */
export const ENTITY_REF_KINDS = ['character', 'scene', 'prop', 'storyboard'] as const;
export type EntityRefKind = (typeof ENTITY_REF_KINDS)[number];

/**
 * Subtypes valid for `library_ref`. Stored as `library_ref:<kind>` on edges.
 * Mirrors LIBRARY_KINDS in library.ts (kept literal to avoid a cycle).
 */
export const LIBRARY_REF_KINDS = ['character', 'voice', 'style'] as const;
export type LibraryRefKind = (typeof LIBRARY_REF_KINDS)[number];

/**
 * Edge data_type. For entity_ref values it is `entity_ref:<kind>`;
 * for library_ref values it is `library_ref:<kind>`.
 */
export type EdgeDataType = IOType | `entity_ref:${EntityRefKind}` | `library_ref:${LibraryRefKind}`;

export function parseEdgeDataType(
  v: string,
): { io: IOType; entityKind?: EntityRefKind; libraryKind?: LibraryRefKind } | null {
  if ((IO_TYPES as readonly string[]).includes(v)) {
    return { io: v as IOType };
  }
  if (v.startsWith('entity_ref:')) {
    const kind = v.slice('entity_ref:'.length);
    if ((ENTITY_REF_KINDS as readonly string[]).includes(kind)) {
      return { io: 'entity_ref', entityKind: kind as EntityRefKind };
    }
  }
  if (v.startsWith('library_ref:')) {
    const kind = v.slice('library_ref:'.length);
    if ((LIBRARY_REF_KINDS as readonly string[]).includes(kind)) {
      return { io: 'library_ref', libraryKind: kind as LibraryRefKind };
    }
  }
  return null;
}
