import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import NodePorts from '../_shared/NodePorts';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { toShellStatus, type CanvasNodeData } from '../types';
import { audioTranscribeSchema, type AudioTranscribeData } from './schema';

export default function AudioTranscribeNode({ id, selected, data }: NodeProps) {
  const d = data as AudioTranscribeData & CanvasNodeData;
  const status = d.status ?? 'idle';
  return (
    <NodeShell
      width={280}
      title={d.title ?? audioTranscribeSchema.title}
      icon={<NodeIcon type="audio_transcribe" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={d.language === 'zh' ? '中文' : d.language}
      status={toShellStatus(status)}
      statusLabel={status === 'idle' ? '空闲' : status}
      selected={!!selected}
      ports={<NodePorts />}
    >
      <div className="p-3 text-xs" style={{ minHeight: 72, maxHeight: 220, overflow: 'auto' }}>
        {d.output_text ? (
          <pre className="whitespace-pre-wrap text-[12px] m-0">{d.output_text}</pre>
        ) : (
          <span style={{ color: 'var(--c-text-on-dark-3)' }}>
            {status === 'running' ? '识别中…' : '等待音频输入...'}
          </span>
        )}
      </div>
    </NodeShell>
  );
}
