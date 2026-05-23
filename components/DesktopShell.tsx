

import React, { useState } from 'react';
import PhoneShell from './PhoneShell';

type DesktopTab = 'home' | 'phone';

const DesktopShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DesktopTab>('home');

  return (
    <div className="w-full h-full bg-slate-950 text-slate-900 overflow-hidden">
      <div className="h-full grid grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:flex flex-col border-r border-white/10 bg-slate-900/95 text-white">
          <div className="p-5 border-b border-white/10">
            <div className="text-xl font-black tracking-tight">SullyOS</div>
            <div className="text-xs text-slate-400 mt-1">Desktop Mode</div>
          </div>

          <div className="p-4 space-y-2 text-sm">
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full text-left rounded-2xl px-4 py-3 font-bold transition ${
                activeTab === 'home' ? 'bg-white/15' : 'hover:bg-white/10'
              }`}
            >
              首页
            </button>

            <button
              onClick={() => setActiveTab('phone')}
              className={`w-full text-left rounded-2xl px-4 py-3 font-bold transition ${
                activeTab === 'phone' ? 'bg-white/15' : 'hover:bg-white/10'
              }`}
            >
              手机模式
            </button>
          </div>

          <div className="mt-auto p-4 text-xs text-slate-500">
            手机端仍使用原本 PhoneShell
          </div>
        </aside>

        <main className="relative min-w-0 h-full bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100">
          {activeTab === 'home' && (
            <div className="h-full p-8 overflow-y-auto">
              <div className="max-w-5xl mx-auto">
                <div className="rounded-[2rem] bg-white/70 backdrop-blur-xl shadow-sm border border-white/60 p-8">
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                    Desktop Home
                  </div>
                  <h1 className="mt-3 text-4xl font-black text-slate-900">
                    SullyOS 电脑端
                  </h1>
                  <p className="mt-4 text-slate-500 leading-7">
                    这里会逐步改成真正适合电脑使用的工作台。旧功能不会删除，
                    需要完整功能时可以进入左侧的「手机模式」。
                  </p>

                  <div className="mt-8 grid grid-cols-3 gap-4">
                    <div className="rounded-3xl bg-white p-5 shadow-sm">
                      <div className="text-lg font-bold">聊天</div>
                      <div className="mt-2 text-sm text-slate-400">之后接入电脑聊天页</div>
                    </div>

                    <div className="rounded-3xl bg-white p-5 shadow-sm">
                      <div className="text-lg font-bold">角色</div>
                      <div className="mt-2 text-sm text-slate-400">之后接入角色管理</div>
                    </div>

                    <div className="rounded-3xl bg-white p-5 shadow-sm">
                      <div className="text-lg font-bold">设置</div>
                      <div className="mt-2 text-sm text-slate-400">之后接入 API / 备份</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'phone' && <PhoneShell />}
        </main>
      </div>
    </div>
  );
};

export default DesktopShell;