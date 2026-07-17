import { useEffect, useState } from 'react';

import { LazyVideoPlayer } from '../../components/media-player';
import { toast } from '../../ui';
import type { TaskRecord } from '../../api/task';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface Props {
  task: TaskRecord;
  initialIndex: number;
  onClose(): void;
  onRetry(): void;
  onSaveToProject(): void;
}

function Thumb({ assetId, video, active, onClick }: { assetId: string; video?: boolean; active: boolean; onClick(): void }) {
  const thumb = useAssetUrl(assetId, 3600, 'thumb');
  const full = useAssetUrl(!video && !thumb ? assetId : null, 3600, 'full');
  const url = thumb ?? full;
  return (
    <button type="button" className={`qg-detail__thumb${active ? ' qg-detail__thumb--active' : ''}`} onClick={onClick}>
      {url ? <img src={url} alt="" /> : null}
    </button>
  );
}

function RefThumb({ assetId }: { assetId: string }) {
  const thumb = useAssetUrl(assetId, 3600, 'thumb');
  const full = useAssetUrl(!thumb ? assetId : null, 3600, 'full');
  const url = thumb ?? full;
  return <div className="qg-detail__ref">{url ? <img src={url} alt="" /> : null}</div>;
}

export default function FeedDetailModal({ task, initialIndex, onClose, onRetry, onSaveToProject }: Props) {
  const [idx, setIdx] = useState(initialIndex);
  const assets = task.output_asset_ids;
  const isVideo = task.type === 'gen.video';
  const isText = task.type === 'gen.text';
  const isAudio = task.type === 'gen.audio';
  const assetId = assets[idx] ?? null;
  const bigUrl = useAssetUrl(isVideo ? null : assetId, 3600, 'full');
  const prompt = (task.inputs as { prompt?: string }).prompt ?? '';
  const refs = ((task.inputs as { references?: { asset_id?: string; type: string }[] }).references ?? []).filter(
    (ref) => ref.asset_id && (ref.type === 'image' || ref.type === 'image_list'),
  );
  const params = task.params as { aspect_ratio?: string; resolution?: string; duration_sec?: number };
  const aspect = params.aspect_ratio?.includes(':')
    ? params.aspect_ratio.replace(':', ' / ')
    : params.aspect_ratio ?? '16 / 9';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (idx >= assets.length) setIdx(0);
  }, [assets.length, idx]);

  const soon = () => toast.info('该操作在 demo 中暂未开放');

  return (
    <div className="qg-detail-overlay" onClick={onClose}>
      <div className="qg-detail" onClick={(event) => event.stopPropagation()}>
        <div className="qg-detail__stage">
          <div className="qg-detail__big">
            {isText ? (
              <div className="qg-detail__text-output">{task.text_output || '（无输出）'}</div>
            ) : isVideo && assetId ? (
              <LazyVideoPlayer
                assetId={assetId}
                playerId={`qg-detail:${task.id}:${assetId}`}
                aspectRatio={aspect}
                objectFit="contain"
                expandable={false}
              />
            ) : bigUrl ? (
              isAudio ? (
                <audio src={bigUrl} controls />
              ) : (
                <img src={bigUrl} alt="" />
              )
            ) : (
              <div className="qg-detail__loading">加载中...</div>
            )}
          </div>
          {assets.length > 1 ? (
            <div className="qg-detail__thumbs">
              {assets.map((id, index) => (
                <Thumb key={id} assetId={id} video={isVideo} active={index === idx} onClick={() => setIdx(index)} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="qg-detail__info">
          <div className="qg-detail__stage-head">
            <button type="button" className="qg-detail__close" onClick={onClose} aria-label="关闭">
              关闭
            </button>
          </div>
          <div>
            <div className="qg-detail__label">提示词</div>
            <div className="qg-detail__prompt">{prompt || '（无提示词）'}</div>
          </div>
          {refs.length > 0 ? (
            <div>
              <div className="qg-detail__label">参考图</div>
              <div className="qg-detail__refs">
                {refs.map((ref) => (
                  <RefThumb key={ref.asset_id} assetId={ref.asset_id as string} />
                ))}
              </div>
            </div>
          ) : null}
          <div className="qg-detail__metarow">
            <span>{task.model_id}</span>
            {params.aspect_ratio ? <span>{params.aspect_ratio}</span> : null}
            {params.resolution ? <span>{params.resolution.toUpperCase()}</span> : null}
            {params.duration_sec ? <span>{params.duration_sec}s</span> : null}
          </div>
          <div className="qg-detail__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={onRetry}>
              再次生成
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onSaveToProject}>
              保存到项目
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={soon}>
              超清
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={soon}>
              扩图
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={soon}>
              局部重绘
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={soon}>
              去画布编辑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
