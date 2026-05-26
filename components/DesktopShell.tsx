
import React, { useState } from 'react';
import PhoneShell from './PhoneShell';

import Chat from '../apps/Chat';
import Character from '../apps/Character';
import GroupChat from '../apps/GroupChat';
import ClipNotesApp from '../apps/ClipNotesApp';
import DiscussionApp from '../apps/DiscussionApp';
import FanficApp from '../apps/FanficApp';
import MurderMysteryApp from '../apps/MurderMysteryApp';
import MusicApp from '../apps/MusicApp';
import MemoryPalaceApp from '../apps/MemoryPalaceApp';
import WorldbookApp from '../apps/WorldbookApp';
import Settings from '../apps/Settings';

type DesktopTab =
  | 'home'
  | 'chat'
  | 'character'
  | 'group'
  | 'discussion'
  | 'fanfic'
  | 'murder'
  | 'clip'
  | 'music'
  | 'memory'
  | 'worldbook'
  | 'settings'
  | 'phone';

const navGroups: Array<{
  title: string;
  items: Array<{
    id: DesktopTab;
    label: string;
    desc: string;
  }>;
}> = [
  {
    title: '主要',
    items: [
      { id: 'home', label: '首页', desc: '电脑端工作台' },
      { id: 'chat', label: '私聊', desc: '角色对话' },
      { id: 'character', label: '角色', desc: '设定 / 模型 / 记忆' },
      { id: 'group', label: '群聊', desc: '多角色互动' },
      { id: 'discussion', label: '讨论', desc: '议题 / 长段观点' },
      { id: 'fanfic', label: '片场', desc: '同人片段 / 共写' },
      { id: 'murder', label: '剧本杀', desc: 'DM / 玩家 / 搜证' },
      { id: 'clip', label: '夹页', desc: '没说完 / 不确定 / 留给你' },
    ],
  },
  {
    title: '内容',
    items: [
      { id: 'music', label: '音乐', desc: '音乐人格 / 歌单' },
      { id: 'memory', label: '记忆宫殿', desc: '记忆整理' },
      { id: 'worldbook', label: '世界书', desc: '世界观资料' },
    ],
  },
  {
    title: '系统',
    items: [
      { id: 'settings', label: '设置', desc: 'API / 备份 / 系统' },
      { id: 'phone', label: '手机模式', desc: '原始 SullyOS' },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

const DesktopShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DesktopTab>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activeItem = allNavItems.find((item) => item.id === activeTab);

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <Chat />;
      case 'character':
        return <Character />;
      case 'group':
        return <GroupChat />;
      case 'discussion':
        return <DiscussionApp />;
      case 'fanfic':
        return <FanficApp />;
      case 'murder':
        return <MurderMysteryApp />;
      case 'clip':
        return <ClipNotesApp />;
      case 'music':
        return <MusicApp />;
      case 'memory':
        return <MemoryPalaceApp />;
      case 'worldbook':
        return <WorldbookApp />;
      case 'settings':
        return <Settings />;
      case 'phone':
        return <PhoneShell />;
      default:
        return (
          <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto max-w-6xl space-y-6">
              <section className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-sm backdrop-blur-xl">
                <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
                  SullyOS Desktop
                </div>

                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">
                  电脑端工作台
                </h1>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">
                  这里是专门给电脑使用的新界面。手机端仍然保留原来的 PhoneShell。
                  没有接入电脑端的功能，可以从「手机模式」进入。
                </p>
              </section>

              <section className="grid grid-cols-3 gap-4">
                {allNavItems
                  .filter((item) => item.id !== 'home')
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className="group rounded-[1.75rem] border border-white/70 bg-white/70 p-6 text-left shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white"
                    >
                      <div className="text-lg font-black text-slate-900">
                        {item.label}
                      </div>

                      <div className="mt-2 text-sm text-slate-400">
                        {item.desc}
                      </div>

                      <div className="mt-6 text-xs font-bold text-violet-400 opacity-0 transition group-hover:opacity-100">
                        打开
                      </div>
                    </button>
                  ))}
              </section>

              <section className="rounded-[2rem] border border-white/70 bg-white/60 p-6 shadow-sm backdrop-blur-xl">
                <div className="text-sm font-black text-slate-700">
                  当前改造策略
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <div className="rounded-3xl bg-white/80 p-5">
                    <div className="font-bold text-slate-900">手机端不动</div>
                    <p className="mt-2 leading-6 text-slate-400">
                      小屏幕继续使用原来的界面，避免影响 iOS / 手机体验。
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/80 p-5">
                    <div className="font-bold text-slate-900">电脑端独立</div>
                    <p className="mt-2 leading-6 text-slate-400">
                      大屏幕进入 DesktopShell，适合鼠标、键盘和多页面操作。
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/80 p-5">
                    <div className="font-bold text-slate-900">功能按需保留</div>
                    <p className="mt-2 leading-6 text-slate-400">
                      保留核心功能，减少不再使用的模块负担。
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-full w-full overflow-hidden bg-slate-950 text-slate-900">
      <style>{`
        .desktop-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .desktop-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .desktop-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.16);
          border-radius: 999px;
        }

        .desktop-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.3);
        }

        .desktop-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.16) transparent;
        }
      `}</style>

      <div
        className={`grid h-full transition-[grid-template-columns] duration-300 ${
          sidebarCollapsed
            ? 'grid-cols-[72px_minmax(0,1fr)]'
            : 'grid-cols-[280px_minmax(0,1fr)]'
        }`}
      >
        <aside className="flex h-full min-h-0 flex-col border-r border-white/10 bg-slate-950 text-white transition-all duration-300">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between gap-2">
              {!sidebarCollapsed && (
                <div>
                  <div className="text-2xl font-black tracking-tight">SullyOS</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    Desktop Mode
                  </div>
                </div>
              )}

              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/20 hover:text-white"
                title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              >
                {sidebarCollapsed ? '>' : '<'}
              </button>
            </div>
          </div>

          <nav className="desktop-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-3">
            {navGroups.map((group) => (
              <div key={group.title}>
                {!sidebarCollapsed && (
                  <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-600">
                    {group.title}
                  </div>
                )}

                <div className="space-y-2">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        activeTab === item.id
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                      title={sidebarCollapsed ? `${item.label}: ${item.desc}` : item.label}
                    >
                      <div className="text-sm font-black">
                        {sidebarCollapsed ? item.label.slice(0, 1) : item.label}
                      </div>

                      {!sidebarCollapsed && (
                        <div className="mt-1 text-xs text-slate-500">
                          {item.desc}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {!sidebarCollapsed && (
            <div className="border-t border-white/10 p-4 text-xs leading-6 text-slate-500">
              电脑端正在独立改造中。
              <br />
              手机端仍使用原本 PhoneShell。
            </div>
          )}
        </aside>

        <main className="relative h-full min-w-0 overflow-hidden bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100">
          <div className="flex h-16 items-center justify-between border-b border-white/50 bg-white/45 px-6 backdrop-blur-xl">
            <div>
              <div className="text-sm font-black text-slate-900">
                {activeItem?.label || '首页'}
              </div>
              <div className="text-xs text-slate-400">
                {activeItem?.desc || '电脑端工作台'}
              </div>
            </div>

            <div className="rounded-full bg-white/70 px-4 py-2 text-xs font-bold text-slate-500 shadow-sm">
              Desktop
            </div>
          </div>

          <div className="h-[calc(100%-4rem)] overflow-hidden">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DesktopShell;
