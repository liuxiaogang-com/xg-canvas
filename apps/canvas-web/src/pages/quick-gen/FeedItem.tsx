import type { TaskRecord } from '../../api/task';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface Props {
  task: TaskRecord;
  onOpen(task: TaskRecord, index: number): void;
  onRetry(): void;
  onSaveToProject(): void;
  onCancel(): void;
}

const STATUS: Record<TaskRecord['status'], string> = {
  pending: '排队中',
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

type MediaKind = 'image' | 'video' | 'audio';

function MediaCell({ assetId, kind, onClick }: { assetId: string; kind: MediaKind; onClick(): void }) {
  // Videos: poster only (thumb). Images: batch-style thumb-or-full via thumb variant when available.
  const url = useAssetUrl(assetId, 3600, kind === 'audio' ? 'full' : 'thumb');
  // Images without a dedicated thumb still 404 on variant=thumb — fall back to full.
  const imageFallback = useAssetUrl(kind === 'image' && !url ? assetId : null, 3600, 'full');
  const display = kind === 'image' ? url ?? imageFallback : url;

  if (kind === 'audio') {
    return (
      <div className="qg-item__cell qg-item__cell--audio">
        {display ? <audio src={display} controls aria-label="音频预览" /> : <div className="qg-item__cell--ph">加载中...</div>}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`qg-item__cell qg-item__cell--${kind}`}
      aria-label={kind === 'video' ? '查看视频详情' : '查看图片详情'}
      onClick={onClick}
    >
      {display ? (
        <img src={display} alt="" />
      ) : (
        <div className="qg-item__cell--ph">{kind === 'video' ? '暂无封面，点击查看' : '加载中...'}</div>
      )}
    </button>
  );
}

function EmptyCell({ inFlight }: { inFlight: boolean }) {
  return <div className="qg-item__cell qg-item__cell--ph">{inFlight ? '生成中...' : '无结果'}</div>;
}

export default function FeedItem({ task, onOpen, onRetry, onSaveToProject, onCancel }: Props) {
  const prompt = (task.inputs as { prompt?: string }).prompt ?? '';
  const params = task.params as { aspect_ratio?: string; resolution?: string; duration_sec?: number };
  const inFlight = task.status === 'pending' || task.status === 'queued' || task.status === 'running';
  const assets = task.output_asset_ids;
  const isText = task.type === 'gen.text';
  const mediaKind: MediaKind = task.type === 'gen.video' ? 'video' : task.type === 'gen.audio' ? 'audio' : 'image';
  const placeholderCount = mediaKind === 'video' || mediaKind === 'audio' ? 1 : Math.max(1, Number((task.params as { batch?: number }).batch) || 1);
  const gridCls = [
    'qg-item__grid',
    assets.length <= 1 ? 'qg-item__grid--single' : assets.length >= 3 ? 'qg-item__grid--g4' : 'qg-item__grid--g2',
  ].join(' ');

  return (
    <div className={`qg-item${isText ? ' qg-item--text' : ''}`}>
      {prompt ? <p className="qg-item__prompt">{prompt}</p> : null}
      <div className="qg-item__meta">
        <b>{task.model_id}</b>
        {params.aspect_ratio ? <span>{params.aspect_ratio}</span> : null}
        {params.resolution ? <span>{params.resolution.toUpperCase()}</span> : null}
        {params.duration_sec ? <span>{params.duration_sec}s</span> : null}
        <span>{STATUS[task.status]}</span>
        {assets.length > 0 ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOpen(task, 0)}>
            详细信息
          </button>
        ) : null}
      </div>

      <div className="qg-item__media">
        {isText ? (
          <div className="qg-item__text">{task.text_output || (inFlight ? '生成中...' : '（无输出）')}</div>
        ) : (
          <div className={gridCls}>
            {assets.map((id, index) => (
              <MediaCell key={id} assetId={id} kind={mediaKind} onClick={() => onOpen(task, index)} />
            ))}
            {assets.length === 0
              ? Array.from({ length: placeholderCount }).map((_, index) => <EmptyCell key={index} inFlight={inFlight} />)
              : null}
          </div>
        )}
      </div>

      {task.error ? (
        <p className="qg-item__error">
          {task.error.code}: {task.error.message}
        </p>
      ) : null}

      <div className="qg-item__actions">
        {task.status === 'succeeded' ? (
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
              再次生成
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onSaveToProject}>
              保存到项目
            </button>
          </>
        ) : null}
        {task.status === 'failed' ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            重试
          </button>
        ) : null}
        {inFlight ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>
            取消
          </button>
        ) : null}
      </div>
    </div>
  );
}
