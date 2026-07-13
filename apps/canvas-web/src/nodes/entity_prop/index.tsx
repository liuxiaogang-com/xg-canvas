import type { NodeProps } from '@xyflow/react';

import { EntityNodeShell } from '../_shared/EntityNodeShell';
import { entityPropSchema } from '../_shared/entity-schemas';

export default function EntityPropNode(props: NodeProps) {
  return <EntityNodeShell {...props} title={entityPropSchema.title} entityKind="prop" />;
}

export { entityPropSchema };
