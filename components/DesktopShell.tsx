

import React, { useState } from 'react';
import PhoneShell from './PhoneShell';

import Character from '../apps/Character';
import GroupChat from '../apps/GroupChat';
import MusicApp from '../apps/MusicApp';
import Settings from '../apps/Settings';

type DesktopTab =
  | 'home'
  | 'character'
  | 'group'
  | 'music'
  | 'settings'
  | 'phone';

const navItems: Array<{
  id: DesktopTab;
  label: string;
  desc: string;
}> = [
  { id: 'home', label: '首页', desc: '电脑端工作台' },
  { id: 'character', label: '角色', desc: '设定 / 模型 / 记忆' },
  { id: 'group', label: '群聊', desc: '多角色互动' },
  { id: 'music', label: '音乐', desc: '音乐人格 / 歌单' },
  { id: 'settings', label: '设置', desc: 'API / 备份 / 系统' },
  { id: 'phone', label: '手机模式', desc: '原始 SullyOS' },
];

const DesktopShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DesktopTab>('home');

  const renderContent = () => {
    if (activeTab === 'character') {
      return <Character />;
    }

    if (activeTab === 'group') {
      return <GroupChat />;
    }

    if (activeTab === 'music') {
      return <MusicApp />;
    }

    if (activeTab === 'settings') {
      return <Settings />;
    }

    if (activeTab === 'phone') {
      return <PhoneShell />;
    }

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
              这里是专门给电脑使用的新界面。手机端仍然保留原来的 PhoneShell，
              旧功能不会删除；不常用的功能可以暂时从「手机模式」进入。
            </p>
          </section>

          <section className="grid grid-cols-3 gap-4">
            {navItems
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
                    打开 →
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
                <div className="font-bold text-slate-900">旧功能保留</div>
                <p className="mt-2 leading-6 text-slate-400">
                  没接入电脑端的功能，可以先从手机模式继续使用。
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-hidden bg-slate-950 text-slate-900">
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-r border-white/10 bg-slate-950 text-white">
          <div className="border-b border-white/10 p-6">
            <div className="text-2xl font-black tracking-tight">SullyOS</div>
            <div className="mt-1 text-xs font-medium text-slate-500">
              Desktop Mode
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto p-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  activeTab === item.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="text-sm font-black">{item.label}</div>
                <div
                  className={`mt-1 text-xs ${
                    activeTab === item.id ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  {item.desc}
                </div>
              </button>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4 text-xs leading-6 text-slate-500">
            电脑端正在独立改造中。
            <br />
            手机端仍使用原本 PhoneShell。
          </div>
        </aside>

        <main className="relative h-full min-w-0 overflow-hidden bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100">
          <div className="flex h-16 items-center justify-between border-b border-white/50 bg-white/45 px-6 backdrop-blur-xl">
            <div>
              <div className="text-sm font-black text-slate-900">
                {navItems.find((item) => item.id === activeTab)?.label}
              </div>
              <div className="text-xs text-slate-400">
                {navItems.find((item) => item.id === activeTab)?.desc}
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