import type { NodeProps } from '@xyflow/react';

import { EntityNodeShell } from '../_shared/EntityNodeShell';
import { entitySceneSchema } from '../_shared/entity-schemas';

export default function EntitySceneNode(props: NodeProps) {
  return <EntityNodeShell {...props} title={entitySceneSchema.title} entityKind="scene" />;
}

export { entitySceneSchema };
