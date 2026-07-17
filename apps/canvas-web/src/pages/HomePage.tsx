import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { projectApi, type ProjectListItem } from '../api/project';
import { createClientId } from '../lib/id';
import { useAuthStore } from '../store/auth';
import { toast } from '../ui';
import CommandBar from './quick-gen/command-bar/CommandBar';
import type { QuickGenSubmission } from './quick-gen/command-bar/submission';
import { useCommandBarState } from './quick-gen/hooks/useCommandBarState';
import './quick-gen/quick-gen.css';
import './HomePage.css';

/** Landing page: a quick-gen prompt box (hands off to /generate as a new
 *  conversation) + the most-recently-updated projects with a "new project" card. */
export default function HomePage() {
  const nav = useNavigate();
  const me = useAuthStore((s) => s.me);
  const cmd = useCommandBarState('image');
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    projectApi
      .list()
      .then((ps) =>
        setProjects(
          [...ps]
            .filter((p) => !p.archived)
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
            .slice(0, 5),
        ),
      )
      .catch(() => undefined);
  }, []);

  const submit = async (submission: QuickGenSubmission) => {
    nav('/generate', {
      state: {
        homeSubmission: submission,
        newConversation: true,
        handoffId: createClientId(),
      },
    });
  };

  const createProject = async () => {
    if (!me || creating) return;
    setCreating(true);
    try {
      const p = await projectApi.create(me.workspace_id, '未命名项目');
      nav(`/projects/${p.id}/canvas`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="home">
      <section className="home__hero">
        <h1 className="home__title">想创作点什么？</h1>
        <p className="home__subtitle">输入提示词，立即开始一段快速生成</p>
        <div className="home__inputwrap">
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
            onSubmit={submit}
          />
        </div>
      </section>

      <section className="home__section">
        <div className="home__section-title">最近项目</div>
        <div className="home__grid">
          <button type="button" className="home__card home__card--new" onClick={createProject} disabled={creating}>
            <span className="home__card-plus">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="home__card-newlabel">{creating ? '创建中…' : '新建项目'}</span>
          </button>
          {projects.map((p) => (
            <button key={p.id} type="button" className="home__card" onClick={() => nav(`/projects/${p.id}/canvas`)}>
              <span className="home__card-cover">
                {p.cover_url ? <img src={p.cover_url} alt="" /> : <span className="home__card-cover-empty" />}
              </span>
              <span className="home__card-name">{p.name}</span>
              <span className="home__card-meta">
                {p.node_count} 节点 · {p.asset_count} 资产
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
