import React from 'react';
import { AppConfig, AppID } from './types';
import {
  UserCircle,
  IdentificationCard,
  ChatTeardrop,
  UsersThree,
  GearSix,
  Images,
  PaintBrush,
  Palette,
  Fire,
  Books,
  Question,
  Globe,
  PenNib,
  Compass,
  Camera,
  GlobeSimple,
  MusicNotes,
  Crosshair,
  Brain,
  Notebook,
  Plugs,
  Newspaper,
} from '@phosphor-icons/react';

// SVG 图标库 - Phosphor Icons
export const Icons: Record<string, React.FC<{ className?: string }>> = {
  Character: ({ className }) => <UserCircle className={className} weight="bold" />,
  User: ({ className }) => <IdentificationCard className={className} weight="bold" />,
  Chat: ({ className }) => <ChatTeardrop className={className} weight="bold" />,
  GroupChat: ({ className }) => <UsersThree className={className} weight="bold" />,
  Settings: ({ className }) => <GearSix className={className} weight="bold" />,
  Gallery: ({ className }) => <Images className={className} weight="bold" />,
  ThemeMaker: ({ className }) => <PaintBrush className={className} weight="bold" />,
  Appearance: ({ className }) => <Palette className={className} weight="bold" />,
  Social: ({ className }) => <Fire className={className} weight="bold" />,
  Study: ({ className }) => <Books className={className} weight="bold" />,
  FAQ: ({ className }) => <Question className={className} weight="bold" />,
  Worldbook: ({ className }) => <Globe className={className} weight="bold" />,
  Novel: ({ className }) => <PenNib className={className} weight="bold" />,
  XhsFreeRoam: ({ className }) => <Compass className={className} weight="bold" />,
  XhsStock: ({ className }) => <Camera className={className} weight="bold" />,
  Browser: ({ className }) => <GlobeSimple className={className} weight="bold" />,
  Songwriting: ({ className }) => <MusicNotes className={className} weight="bold" />,
  Music: ({ className }) => <MusicNotes className={className} weight="fill" />,
  Guidebook: ({ className }) => <Crosshair className={className} weight="bold" />,
  MemoryPalace: ({ className }) => <Brain className={className} weight="bold" />,
  Handbook: ({ className }) => <Notebook className={className} weight="bold" />,
  QQBridge: ({ className }) => <Plugs className={className} weight="bold" />,
  HotNews: ({ className }) => <Newspaper className={className} weight="fill" />,
};

export const INSTALLED_APPS: AppConfig[] = [
  { id: AppID.Character, name: '神经链接', icon: 'Character', color: 'indigo' },
  { id: AppID.MemoryPalace, name: '记忆宫殿', icon: 'MemoryPalace', color: 'violet' },
  { id: AppID.Chat, name: 'Message', icon: 'Chat', color: 'green' },
  { id: AppID.GroupChat, name: '群聊', icon: 'GroupChat', color: 'violet' },
  // { id: AppID.Browser, name: '浏览器', icon: 'Browser', color: 'blue' }, // Hidden
  { id: AppID.User, name: '档案', icon: 'User', color: 'blue' },
  // { id: AppID.Handbook, name: '手账', icon: 'Handbook', color: 'fuchsia' }, // Hidden temporarily, pending update
  { id: AppID.Social, name: 'Spark', icon: 'Social', color: 'red' },
  { id: AppID.Study, name: '自习室', icon: 'Study', color: 'emerald' },
  { id: AppID.Novel, name: '笔友会', icon: 'Novel', color: 'amber' },
  { id: AppID.Songwriting, name: '写歌', icon: 'Songwriting', color: 'fuchsia' },
  { id: AppID.Music, name: '音乐', icon: 'Music', color: 'rose' },
  { id: AppID.Worldbook, name: '世界书', icon: 'Worldbook', color: 'indigo' },
  { id: AppID.HotNews, name: '热点', icon: 'HotNews', color: 'red' },
  { id: AppID.FAQ, name: '使用帮助', icon: 'FAQ', color: 'indigo' },
  { id: AppID.Gallery, name: '相册', icon: 'Gallery', color: 'orange' },
  { id: AppID.XhsFreeRoam, name: '自由活动', icon: 'XhsFreeRoam', color: 'rose' },
  { id: AppID.XhsStock, name: '小红书图库', icon: 'XhsStock', color: 'red' },
  { id: AppID.ThemeMaker, name: '气泡工坊', icon: 'ThemeMaker', color: 'purple' },
  { id: AppID.Appearance, name: '外观', icon: 'Appearance', color: 'slate' },
  { id: AppID.Settings, name: '设置', icon: 'Settings', color: 'slate' },
  { id: AppID.Guidebook, name: '攻略本', icon: 'Guidebook', color: 'slate' },
  // { id: AppID.QQBridge, name: 'QQ 桥', icon: 'QQBridge', color: 'sky' }, // Hidden temporarily
];

export const DOCK_APPS = [AppID.Chat, AppID.GroupChat, AppID.Social, AppID.Settings];
