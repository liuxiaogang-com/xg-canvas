import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { Modal, Select, toast } from '../../ui';
import { assetApi } from '../../api/asset';
import { PlaybackRegistryProvider } from '../../components/media-player';
import { projectApi, type ProjectListItem } from '../../api/project';
import { taskApi, type TaskRecord } from '../../api/task';
import { useReadinessStore } from '../../readiness/store';
import CommandBar from './command-bar/CommandBar';
import ConversationPanel from './ConversationPanel';
import FeedItem from './FeedItem';
import FeedDetailModal from './FeedDetailModal';
import { useCommandBarState } from './hooks/useCommandBarState';
import { useGenerationFeed } from './hooks/useGenerationFeed';
import { useConversations } from './useConversations';
import type { QuickGenSubmission } from './command-bar/submission';
import './quick-gen.css';
import './quick-gen-media.css';

interface HomeHandoffState {
  homeSubmission?: QuickGenSubmission;
  newConversation?: boolean;
  handoffId?: string;
}

interface PendingHomeSubmit {
  conversationId: string;
  submission: QuickGenSubmission;
}

const quickGenPath = (conversationId: string) =>
  conversationId === 'default' ? '/generate' : `/generate/${conversationId}`;

export default function QuickGenPage() {
  const cmd = useCommandBarState('image');
  const feed = useGenerationFeed();
  const conv = useConversations();
  const location = useLocation();
  const nav = useNavigate();
  const { conversationId: routeConversationId } = useParams<{ conversationId?: string }>();
  const [pendingHomeSubmit, setPendingHomeSubmit] = useState<PendingHomeSubmit | null>(null);
  const [renamingConv, setRenamingConv] = useState<{ id: string; title: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const setGenMode = useReadinessStore((s) => s.setGenMode);

  useEffect(() => {
    setGenMode(cmd.state.mode);
    return () => setGenMode(null);
  }, [cmd.state.mode, setGenMode]);

  // Handoff from the home page: open a fresh conversation and submit immediately.
  useEffect(() => {
    const handoff = location.state as HomeHandoffState | null;
    const submission = handoff?.homeSubmission;
    if (!submission) return;
    const handoffId = handoff.handoffId ?? `${submission.model_id}:${Date.now()}`;
    const seenKey = `xgcanvas-home-handoff:${handoffId}`;
    if (sessionStorage.getItem(seenKey)) {
      nav('.', { replace: true, state: null });
      return;
    }
    sessionStorage.setItem(seenKey, '1');
    const conversationId = handoff.newConversation !== false ? conv.create() : conv.activeId;
    setPendingHomeSubmit({ conversationId, submission });
    nav(quickGenPath(conversationId), { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (routeConversationId === 'default') {
      if (conv.activeId !== 'default') conv.setActiveId('default');
      nav('/generate', { replace: true });
      return;
    }
    const targetId = routeConversationId ?? 'default';
    if (!conv.list.some((c) => c.id === targetId)) {
      conv.setActiveId('default');
      if (routeConversationId) nav('/generate', { replace: true });
      return;
    }
    if (conv.activeId !== targetId) conv.setActiveId(targetId);
  }, [conv, nav, routeConversationId]);
  const [savingTask, setSavingTask] = useState<TaskRecord | null>(null);
  const [detail, setDetail] = useState<{ task: TaskRecord; index: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // 即梦 feed: newest at the BOTTOM (useGenerationFeed returns newest-first).
  const items = conv.filterTasks(feed.tasks).slice().reverse();

  const scrollToBottom = () => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useEffect(scrollToBottom, [items.length]);

  useEffect(() => {
    if (!pendingHomeSubmit || submitting) return;
    const targetConversationId = pendingHomeSubmit.conversationId;
    const submission = pendingHomeSubmit.submission;
    setPendingHomeSubmit(null);
    setSubmitting(true);
    feed
      .submit(submission)
      .then((created) => {
        conv.tagTask(created.id, targetConversationId);
        cmd.reset();
        setTimeout(scrollToBottom, 60);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setSubmitting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHomeSubmit, submitting]);

  // keep the open detail modal in sync with feed polling (so new assets appear)
  const liveDetail = detail ? feed.tasks.find((t) => t.id === detail.task.id) ?? detail.task : null;

  const retry = (t: TaskRecord) => async () => {
    try {
      feed.replace(await taskApi.retry(t.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const cancel = (t: TaskRecord) => async () => {
    try {
      feed.replace(await taskApi.cancel(t.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <PlaybackRegistryProvider>
    <div className="qg-root">
      <ConversationPanel
        list={conv.list}
        activeId={conv.activeId}
        onSelect={(id) => {
          conv.setActiveId(id);
          nav(quickGenPath(id));
        }}
        onCreate={() => {
          const id = conv.create();
          nav(quickGenPath(id));
          cmd.reset();
        }}
        onRemove={(id) => {
          conv.remove(id);
          if (conv.activeId === id) nav('/generate');
        }}
        onRename={(c) => {
          setRenamingConv(c);
          setRenameTitle(c.title);
        }}
      />

      <div className="qg-main">
        <div className="qg-feed" ref={feedRef}>
          {items.length === 0 ? (
            <div className="qg-empty">还没有生成记录，下方输入提示词开始创作</div>
          ) : (
            <div className="qg-feed__inner">
              {items.map((t) => (
                <FeedItem
                  key={t.id}
                  task={t}
                  onOpen={(task, index) => setDetail({ task, index })}
                  onRetry={retry(t)}
                  onCancel={cancel(t)}
                  onSaveToProject={() => setSavingTask(t)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="qg-inputbar">
          <CommandBar
            state={cmd.state}
            specs={cmd.specs}
            inputContract={cmd.inputContract}
            schemaReady={cmd.schemaReady}
            onModeChange={cmd.switchMode}
            onModelChange={cmd.setModel}
            onInputModeChange={cmd.setInputMode}
            onPromptChange={cmd.setPrompt}
            onParamChange={cmd.setParam}
            onReferencesChange={cmd.setReferences}
            loading={submitting}
            onSubmit={async (sub) => {
              setSubmitting(true);
              try {
                const created = await feed.submit(sub);
                conv.tagTask(created.id);
                cmd.reset();
                setTimeout(scrollToBottom, 60);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </div>
      </div>

      {liveDetail && detail ? (
        <FeedDetailModal
          task={liveDetail}
          initialIndex={detail.index}
          onClose={() => setDetail(null)}
          onRetry={retry(liveDetail)}
          onSaveToProject={() => setSavingTask(liveDetail)}
        />
      ) : null}

      <SaveToProjectModal task={savingTask} onClose={() => setSavingTask(null)} onSaved={feed.reload} />
      <RenameConversationModal
        value={renameTitle}
        open={Boolean(renamingConv)}
        onChange={setRenameTitle}
        onClose={() => setRenamingConv(null)}
        onSave={() => {
          if (!renamingConv) return;
          conv.rename(renamingConv.id, renameTitle);
          setRenamingConv(null);
        }}
      />
    </div>
    </PlaybackRegistryProvider>
  );
}

function RenameConversationModal({
  open,
  value,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  value: string;
  onChange(value: string): void;
  onClose(): void;
  onSave(): void;
}) {
  if (!open) return null;
  const trimmed = value.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title="重命名对话"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn--primary" disabled={!trimmed} onClick={onSave}>
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="quick-gen-conv-name">
          对话名称
        </label>
        <input
          id="quick-gen-conv-name"
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed) onSave();
          }}
        />
      </div>
    </Modal>
  );
}

function SaveToProjectModal({
  task,
  onClose,
  onSaved,
}: {
  task: TaskRecord | null;
  onClose(): void;
  onSaved(): void;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [target, setTarget] = useState<string | undefined>();

  if (task && projects.length === 0) {
    projectApi.list().then(setProjects).catch(() => undefined);
  }
  if (!task) return null;

  const handleClose = () => {
    onClose();
    setTarget(undefined);
  };
  const handleOk = async () => {
    if (!target || !task) return;
    try {
      for (const id of task.output_asset_ids) await assetApi.copyToProject(id, target);
      toast.success('已保存到项目');
      handleClose();
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title="保存生成结果到项目"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={handleClose}>
            取消
          </button>
          <button type="button" className="btn btn--primary gradient-btn !border-0" disabled={!target} onClick={handleOk}>
            确定
          </button>
        </>
      }
    >
      <Select<string>
        value={target}
        onChange={(v) => setTarget(v)}
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        placeholder="选择项目"
      />
    </Modal>
  );
}
