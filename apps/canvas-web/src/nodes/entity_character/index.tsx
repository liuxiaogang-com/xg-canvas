import type { NodeProps } from '@xyflow/react';

import { EntityNodeShell } from '../_shared/EntityNodeShell';
import { entityCharacterSchema } from '../_shared/entity-schemas';

export default function EntityCharacterNode(props: NodeProps) {
  return <EntityNodeShell {...props} title={entityCharacterSchema.title} entityKind="character" />;
}

export { entityCharacterSchema };
