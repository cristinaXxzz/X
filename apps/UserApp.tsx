import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { processImage } from '../utils/file';

const UserApp: React.FC = () => {
    const { closeApp, userProfile, updateUserProfile, addToast } = useOS();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [avatarFailed, setAvatarFailed] = useState(false);

    useEffect(() => {
        setAvatarFailed(false);
    }, [userProfile.avatar]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const base64 = await processImage(file);
            updateUserProfile({ avatar: base64 });
            addToast('头像已更新', 'success');
        } catch (err: any) {
            addToast(err.message || '头像更新失败', 'error');
        } finally {
            e.target.value = '';
        }
    };

    const displayName = userProfile.name?.trim() || 'User';

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col animate-fade-in">
            <div className="h-20 bg-white/75 backdrop-blur-md flex items-end pb-3 px-4 border-b border-slate-200/70 shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-2 w-full">
                    <button
                        onClick={closeApp}
                        className="tap-target -ml-2 rounded-full hover:bg-black/5 active:scale-95 transition-transform"
                        aria-label="返回桌面"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="text-xl font-semibold text-slate-800 tracking-wide">个人档案</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 ios-scroll">
                <div className="flex flex-col items-center gap-4">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-32 h-32 rounded-full bg-white shadow-lg p-1 cursor-pointer group relative active:scale-95 transition-transform"
                        aria-label="更换头像"
                    >
                        {userProfile.avatar && !avatarFailed ? (
                            <img
                                src={userProfile.avatar}
                                className="w-full h-full rounded-full object-cover group-hover:opacity-80 transition-opacity"
                                alt={displayName}
                                onError={() => setAvatarFailed(true)}
                            />
                        ) : (
                            <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-100 to-pink-100 flex items-center justify-center text-4xl font-black text-slate-500">
                                {displayName.slice(0, 1).toUpperCase()}
                            </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold text-slate-700 bg-white/85 px-3 py-1 rounded-full shadow-sm">更换</span>
                        </div>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">你的名字</label>
                        <input
                            value={userProfile.name}
                            onChange={(e) => updateUserProfile({ name: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-700 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">关于你 / 设定</label>
                        <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                            这些信息会进入角色上下文，用来帮助模型理解你是谁、你喜欢什么、以及哪些设定需要被长期记住。
                        </p>
                        <textarea
                            value={userProfile.bio}
                            onChange={(e) => updateUserProfile({ bio: e.target.value })}
                            className="w-full h-48 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed resize-none focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                            placeholder="写一点关于你的长期设定..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserApp;
