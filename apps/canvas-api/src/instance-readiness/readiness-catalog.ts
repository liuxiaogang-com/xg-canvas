/** Declarative instance-readiness catalog — backend authority for status computation. */

export type ReadinessItemId =
  | 'object_storage'
  | 'mail'
  | 'modality_text'
  | 'modality_image'
  | 'modality_video'
  | 'modality_audio'
  | 'capability_tools'
  | 'feature_agent';

export type ReadinessKind = 'infra' | 'modality' | 'feature';
export type ReadinessCompletion = 'verified_integration' | 'available_models' | 'planned';
export type ReadinessSurface =
  | 'canvas'
  | 'generate'
  | 'assets'
  | 'chat'
  | 'agent'
  | 'auth_email';

export type ReadinessStatus = 'ready' | 'missing' | 'unverified' | 'planned';

export interface ReadinessCatalogEntry {
  id: ReadinessItemId;
  kind: ReadinessKind;
  completion: ReadinessCompletion;
  surfaces: ReadinessSurface[];
  /** When true, always report status planned and skip probes. */
  planned?: boolean;
  taskType?: string;
}

export const READINESS_CATALOG: ReadinessCatalogEntry[] = [
  {
    id: 'object_storage',
    kind: 'infra',
    completion: 'verified_integration',
    surfaces: ['canvas', 'generate', 'assets'],
  },
  {
    id: 'mail',
    kind: 'infra',
    completion: 'verified_integration',
    surfaces: ['auth_email'],
  },
  {
    id: 'modality_text',
    kind: 'modality',
    completion: 'available_models',
    surfaces: ['chat', 'agent'],
    taskType: 'gen.text',
  },
  {
    id: 'modality_image',
    kind: 'modality',
    completion: 'available_models',
    surfaces: ['canvas', 'generate'],
    taskType: 'gen.image',
  },
  {
    id: 'modality_video',
    kind: 'modality',
    completion: 'available_models',
    surfaces: ['canvas', 'generate'],
    taskType: 'gen.video',
  },
  {
    id: 'modality_audio',
    kind: 'modality',
    completion: 'planned',
    surfaces: ['canvas', 'generate'],
    taskType: 'gen.audio',
    planned: true,
  },
  {
    id: 'capability_tools',
    kind: 'feature',
    completion: 'planned',
    surfaces: ['canvas'],
    planned: true,
  },
  {
    id: 'feature_agent',
    kind: 'feature',
    completion: 'planned',
    surfaces: ['agent'],
    planned: true,
  },
];
