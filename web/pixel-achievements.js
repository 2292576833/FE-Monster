(function () {
  'use strict';

  const STORAGE_KEY = 'fe-monster-achievements-v2';
  const LEGACY_STORAGE_KEY = 'fe-monster-achievements-v1';
  const ACTIVE_PROVIDER_STORAGE_KEY = 'fe-monster-active-provider-v1';
  const COMMUNITY_IDENTITY_STORAGE_KEY = 'fe-monster-achievement-community-identity-v1';
  const ACCOUNT_MIGRATION_STORAGE_KEY = 'fe-monster-achievements-v2-account-migrated';
  const STORAGE_VERSION = 2;
  const STATE_API = '/api/app/achievements';
  const COMMUNITY_ACHIEVEMENTS_API = '/api/community/achievements';
  const CHALLENGE_EVIDENCE_STORAGE_KEY = 'fe-monster-achievement-evidence-outbox-v1';
  const CHALLENGE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const CHALLENGE_EVIDENCE_LIMIT = 3000;
  const CHALLENGE_EVIDENCE_BATCH_SIZE = 8;
  const CHALLENGE_EVIDENCE_RETRY_DELAYS = Object.freeze([1200, 3000, 10000, 30000]);
  const ACHIEVEMENT_SOUND_URL = 'audio/achievement-unlock.wav?v=20260729-trimmed-1';
  const TOAST_HOLD_MS = 3000;
  const TOAST_EXIT_MS = 560;
  const THEMES = Object.freeze(['classic', 'forge', 'void', 'frost']);
  const HYDRATE_RETRY_DELAYS = Object.freeze([0, 180, 650, 1800]);
  const PERSIST_RETRY_DELAYS = Object.freeze([180, 650, 1800]);
  const ACHIEVEMENT_PATHS = Object.freeze([
    Object.freeze({ id: 'adventure', label: '冒险' }),
    Object.freeze({ id: 'music', label: '听歌' }),
    Object.freeze({ id: 'lyrics', label: '歌词' }),
    Object.freeze({ id: 'visual', label: '视觉' }),
    Object.freeze({ id: 'community', label: '社区' }),
    Object.freeze({ id: 'legend', label: '史诗' })
  ]);
  const COMPLETIONIST_PREREQUISITE_IDS = Object.freeze([
    'first-block',
    'gap-runner',
    'monster-stomp',
    'all-platforms',
    'world-peace',
    'first-play',
    'track-finished',
    'first-favorite',
    'local-import',
    'lyric-council',
    'manual-sync',
    'visual-first',
    'scene-smith',
    'bio-written',
    'first-friend',
    'listen-together',
    'first-danmaku',
    'secret-left'
  ]);
  const COMPLETIONIST_FINAL_TASK = Object.freeze({
    id: 'claim-all-prerequisite-ornaments',
    label: '领取全部前置成就的专属头像挂饰'
  });

  const catalog = Object.freeze([
    Object.freeze({
      id: 'first-block',
      name: '初次碰面',
      tagline: '鼠标还在找入口，你的脑袋已经替它打卡了。',
      path: 'adventure'
    }),
    Object.freeze({
      id: 'gap-runner',
      name: '纵身一跃',
      tagline: '脚下是空白，勇气是临时加载出来的。',
      path: 'adventure'
    }),
    Object.freeze({
      id: 'monster-stomp',
      name: '小怪退散',
      tagline: '这一脚很有节拍，小怪则有一点私人意见。',
      path: 'adventure'
    }),
    Object.freeze({
      id: 'all-platforms',
      name: '四方来客',
      tagline: '四个平台都听见了敲门声，门铃今天算加班。',
      path: 'adventure'
    }),
    Object.freeze({
      id: 'world-peace',
      name: '世界和平',
      tagline: '愿歌声越过边界，愿天下没有战争。',
      path: 'music'
    }),
    Object.freeze({
      id: 'first-play',
      name: '终于响了',
      tagline: '刚才不是卡住，是播放器在深呼吸。',
      path: 'music'
    }),
    Object.freeze({
      id: 'track-finished',
      name: '一滴不剩',
      tagline: '进度条走完了。你居然没有在副歌前切歌。',
      path: 'music'
    }),
    Object.freeze({
      id: 'first-favorite',
      name: '先放兜里',
      tagline: '收藏等于会再听——至少收藏夹是这么认为的。',
      path: 'music'
    }),
    Object.freeze({
      id: 'local-import',
      name: '自带干粮',
      tagline: '平台没有也没关系，硬盘说它认识这首。',
      path: 'music'
    }),
    Object.freeze({
      id: 'lyric-council',
      name: '歌词开会',
      tagline: '一行负责唱，另外几行负责提前剧透。',
      path: 'lyrics'
    }),
    Object.freeze({
      id: 'manual-sync',
      name: '人肉校时器',
      tagline: '早了调晚，晚了调早，最后发现是自己抢拍。',
      path: 'lyrics'
    }),
    Object.freeze({
      id: 'visual-first',
      name: '耳朵开始看东西',
      tagline: '听歌还得用眼睛，显卡先替耳朵表示感谢。',
      path: 'visual'
    }),
    Object.freeze({
      id: 'scene-smith',
      name: '顺手造了个宇宙',
      tagline: '本来只想换背景，结果给显卡安排了夜班。',
      path: 'visual'
    }),
    Object.freeze({
      id: 'bio-written',
      name: '简介比本人先到',
      tagline: '一百八十个字装下人格，剩下的等下次更新。',
      path: 'community'
    }),
    Object.freeze({
      id: 'first-friend',
      name: '社交加载完成',
      tagline: '成功添加一位好友，社恐进度条前进了 1%。',
      path: 'community'
    }),
    Object.freeze({
      id: 'listen-together',
      name: '耳机分你一半',
      tagline: '两个人听同一首歌，延迟也能算和声。',
      path: 'community'
    }),
    Object.freeze({
      id: 'first-danmaku',
      name: '我也说两句',
      tagline: '歌手负责唱，我负责在旁边碎碎念。',
      path: 'community'
    }),
    Object.freeze({
      id: 'completionist',
      name: '??????',
      tagline: '完成全部前置任务并领取全部前置成就挂饰，缺一不可。',
      path: 'legend',
      prerequisiteIds: COMPLETIONIST_PREREQUISITE_IDS,
      finalTask: COMPLETIONIST_FINAL_TASK
    }),
    Object.freeze({
      id: 'secret-left',
      name: '这都被你发现了？',
      tagline: '地图说这里没路。你说地图懂什么。',
      path: 'secret'
    })
  ]);

  const catalogById = new Map(catalog.map((achievement) => [achievement.id, achievement]));

  const ICON_PALETTES = Object.freeze({
    'first-block': Object.freeze({
      outline: '#33210d', shadow: '#9b5d18', main: '#e59b2f', light: '#ffe29a', accent: '#fff3c8'
    }),
    'gap-runner': Object.freeze({
      outline: '#102933', shadow: '#17616e', main: '#29b9c8', light: '#b8fbff', accent: '#f6d266'
    }),
    'monster-stomp': Object.freeze({
      outline: '#2a1531', shadow: '#653377', main: '#b85bca', light: '#f0b8fa', accent: '#f4b84d'
    }),
    'all-platforms': Object.freeze({
      outline: '#17212b', shadow: '#466170', main: '#dbe9ee', light: '#ffffff',
      accent: '#e75d55', accent2: '#4f8ee8', accent3: '#55bd72', accent4: '#e7b84f'
    }),
    'secret-left': Object.freeze({
      outline: '#171124', shadow: '#3d275f', main: '#7650ad', light: '#c4a4ef', accent: '#72e0b4'
    }),
    'world-peace': Object.freeze({
      outline: '#102b31', shadow: '#287a82', main: '#6fd0c0', light: '#d5fff5', accent: '#f3d66f', accent2: '#75a9e8'
    }),
    'first-play': Object.freeze({
      outline: '#18263a', shadow: '#315b86', main: '#68a9df', light: '#d8f3ff', accent: '#f4d36d'
    }),
    'track-finished': Object.freeze({
      outline: '#2c2414', shadow: '#816729', main: '#d5ae43', light: '#fff2a8', accent: '#79d79a'
    }),
    'first-favorite': Object.freeze({
      outline: '#361527', shadow: '#8d315b', main: '#dd5d8f', light: '#ffc5dc', accent: '#f4d56b'
    }),
    'local-import': Object.freeze({
      outline: '#1d2830', shadow: '#425d69', main: '#7e9ca8', light: '#d9edf2', accent: '#67d6a1'
    }),
    'lyric-council': Object.freeze({
      outline: '#20193a', shadow: '#554592', main: '#8e7adb', light: '#ddd5ff', accent: '#67d9c4'
    }),
    'manual-sync': Object.freeze({
      outline: '#172d35', shadow: '#347583', main: '#62bdc9', light: '#d2fbff', accent: '#f1c965'
    }),
    'visual-first': Object.freeze({
      outline: '#25173b', shadow: '#69419a', main: '#aa6fe0', light: '#eed6ff', accent: '#64d8e8'
    }),
    'scene-smith': Object.freeze({
      outline: '#302012', shadow: '#805127', main: '#d1873d', light: '#ffd6a0', accent: '#67d7c1'
    }),
    'bio-written': Object.freeze({
      outline: '#2d261a', shadow: '#7d6a3c', main: '#c9ab66', light: '#fff0bd', accent: '#6ba8dc'
    }),
    'first-friend': Object.freeze({
      outline: '#183124', shadow: '#3f7959', main: '#69bc86', light: '#d5f6df', accent: '#f2c968'
    }),
    'listen-together': Object.freeze({
      outline: '#1b2437', shadow: '#405d8e', main: '#6f91d0', light: '#d9e5ff', accent: '#ef7e9f'
    }),
    'first-danmaku': Object.freeze({
      outline: '#291b35', shadow: '#68447f', main: '#a86cc2', light: '#efd2fa', accent: '#72d6bf'
    }),
    'completionist': Object.freeze({
      outline: '#30220b', shadow: '#8f651c', main: '#e4ad35', light: '#fff0a6', accent: '#73e0c3', accent2: '#ef6f9c'
    })
  });

  const ORNAMENT_CATALOG = Object.freeze(catalog.map((achievement) => {
    const palette = ICON_PALETTES[achievement.id];
    return Object.freeze({
      id: `achievement-ornament-${achievement.id}`,
      achievementId: achievement.id,
      name: `${achievement.name}挂饰`,
      slot: 'avatar',
      iconId: achievement.id,
      accent: palette?.accent || palette?.main || '#ffffff'
    });
  }));
  const ornamentByAchievementId = new Map(
    ORNAMENT_CATALOG.map((ornament) => [ornament.achievementId, ornament])
  );

  const LOCKED_PALETTE = Object.freeze({
    outline: '#101417',
    shadow: '#20272c',
    main: '#323b41',
    light: '#59656c',
    accent: '#414b51',
    accent2: '#384248',
    accent3: '#4a555b',
    accent4: '#2b3338'
  });

  const ICON_COMMANDS = Object.freeze({
    'first-block': Object.freeze([
      ['outline', 3, 4, 26, 24],
      ['shadow', 5, 6, 22, 20],
      ['main', 5, 6, 20, 18],
      ['light', 7, 8, 16, 4],
      ['accent', 7, 8, 3, 3],
      ['outline', 23, 8, 3, 3],
      ['outline', 7, 21, 3, 3],
      ['outline', 23, 21, 3, 3],
      ['outline', 13, 11, 6, 4],
      ['outline', 11, 15, 10, 4],
      ['outline', 14, 19, 4, 5]
    ]),
    'gap-runner': Object.freeze([
      ['outline', 1, 23, 12, 7],
      ['shadow', 3, 25, 8, 5],
      ['outline', 22, 20, 10, 10],
      ['shadow', 24, 22, 8, 8],
      ['accent', 4, 25, 3, 2],
      ['accent', 25, 22, 3, 2],
      ['outline', 13, 6, 7, 7],
      ['light', 15, 7, 4, 4],
      ['outline', 10, 12, 10, 8],
      ['main', 12, 12, 7, 6],
      ['outline', 7, 17, 8, 5],
      ['main', 9, 17, 5, 3],
      ['outline', 18, 16, 7, 5],
      ['main', 18, 16, 5, 3],
      ['light', 7, 9, 2, 2],
      ['light', 9, 6, 2, 2]
    ]),
    'monster-stomp': Object.freeze([
      ['outline', 7, 20, 19, 10],
      ['outline', 5, 17, 5, 6],
      ['outline', 23, 17, 5, 6],
      ['shadow', 9, 21, 15, 7],
      ['main', 10, 20, 13, 6],
      ['light', 11, 22, 3, 3],
      ['light', 19, 22, 3, 3],
      ['outline', 12, 23, 2, 2],
      ['outline', 19, 23, 2, 2],
      ['outline', 12, 3, 10, 14],
      ['accent', 14, 4, 6, 10],
      ['light', 14, 4, 5, 3],
      ['outline', 9, 13, 13, 6],
      ['accent', 11, 13, 10, 4],
      ['light', 5, 12, 3, 3],
      ['light', 25, 12, 3, 3]
    ]),
    'all-platforms': Object.freeze([
      ['outline', 13, 13, 7, 7],
      ['main', 15, 15, 3, 3],
      ['shadow', 8, 8, 7, 3],
      ['shadow', 18, 8, 7, 3],
      ['shadow', 8, 22, 7, 3],
      ['shadow', 18, 22, 7, 3],
      ['outline', 2, 2, 9, 9],
      ['accent', 4, 4, 5, 5],
      ['outline', 22, 2, 9, 9],
      ['accent2', 24, 4, 5, 5],
      ['outline', 2, 22, 9, 9],
      ['accent3', 4, 24, 5, 5],
      ['outline', 22, 22, 9, 9],
      ['accent4', 24, 24, 5, 5],
      ['light', 16, 12, 2, 2],
      ['light', 16, 20, 2, 2]
    ]),
    'secret-left': Object.freeze([
      ['outline', 5, 3, 23, 27],
      ['shadow', 7, 5, 19, 23],
      ['main', 9, 7, 15, 19],
      ['outline', 10, 11, 14, 11],
      ['light', 12, 13, 10, 7],
      ['accent', 14, 14, 6, 5],
      ['outline', 16, 15, 3, 3],
      ['outline', 1, 14, 12, 6],
      ['accent', 3, 16, 10, 2],
      ['accent', 3, 13, 3, 8],
      ['light', 8, 8, 2, 2],
      ['light', 22, 23, 2, 2]
    ]),
    'world-peace': Object.freeze([
      ['outline', 10, 2, 12, 2],
      ['outline', 6, 4, 20, 3],
      ['outline', 4, 7, 24, 18],
      ['outline', 6, 25, 20, 3],
      ['outline', 10, 28, 12, 2],
      ['shadow', 7, 6, 18, 21],
      ['main', 6, 9, 20, 14],
      ['main', 9, 5, 14, 22],
      ['accent2', 8, 9, 16, 3],
      ['accent2', 6, 15, 20, 2],
      ['accent2', 8, 21, 16, 3],
      ['light', 11, 6, 3, 20],
      ['light', 19, 6, 3, 20],
      ['accent', 9, 10, 5, 4],
      ['accent', 13, 13, 4, 5],
      ['accent', 18, 18, 6, 4],
      ['light', 23, 7, 2, 2]
    ]),
    'first-play': Object.freeze([
      ['outline', 4, 9, 12, 15],
      ['shadow', 6, 11, 8, 11],
      ['main', 7, 12, 6, 9],
      ['outline', 15, 12, 5, 9],
      ['light', 16, 14, 2, 5],
      ['accent', 21, 11, 3, 3],
      ['accent', 24, 8, 3, 3],
      ['accent', 24, 21, 3, 3],
      ['accent', 27, 13, 3, 7]
    ]),
    'track-finished': Object.freeze([
      ['outline', 3, 21, 26, 8],
      ['shadow', 5, 23, 22, 4],
      ['main', 6, 24, 18, 2],
      ['light', 6, 23, 15, 1],
      ['outline', 22, 5, 3, 17],
      ['accent', 24, 6, 6, 7],
      ['light', 24, 6, 4, 2],
      ['accent', 24, 13, 4, 3]
    ]),
    'first-favorite': Object.freeze([
      ['outline', 5, 16, 23, 13],
      ['shadow', 7, 18, 19, 9],
      ['main', 9, 20, 15, 7],
      ['outline', 8, 6, 6, 6],
      ['outline', 18, 6, 6, 6],
      ['main', 6, 9, 20, 7],
      ['light', 9, 9, 5, 3],
      ['accent', 10, 11, 12, 11],
      ['light', 12, 12, 3, 3]
    ]),
    'local-import': Object.freeze([
      ['outline', 4, 4, 24, 24],
      ['shadow', 6, 6, 20, 20],
      ['main', 7, 7, 18, 18],
      ['outline', 9, 8, 14, 7],
      ['light', 11, 9, 8, 4],
      ['outline', 9, 19, 14, 5],
      ['accent', 12, 18, 8, 4],
      ['accent', 21, 4, 3, 12],
      ['accent', 17, 13, 6, 3],
      ['light', 17, 12, 3, 3]
    ]),
    'lyric-council': Object.freeze([
      ['outline', 3, 5, 26, 5],
      ['shadow', 5, 7, 18, 2],
      ['outline', 3, 13, 26, 7],
      ['main', 5, 15, 22, 3],
      ['accent', 8, 15, 12, 3],
      ['outline', 3, 23, 26, 5],
      ['shadow', 10, 25, 17, 2],
      ['light', 5, 6, 3, 2],
      ['light', 22, 15, 3, 3]
    ]),
    'manual-sync': Object.freeze([
      ['outline', 8, 4, 16, 3],
      ['outline', 5, 7, 22, 18],
      ['outline', 8, 25, 16, 3],
      ['shadow', 7, 8, 18, 16],
      ['main', 9, 9, 14, 14],
      ['outline', 15, 10, 3, 8],
      ['outline', 16, 16, 6, 3],
      ['accent', 1, 14, 8, 3],
      ['accent', 2, 11, 3, 9],
      ['accent', 23, 14, 8, 3],
      ['accent', 28, 11, 3, 9],
      ['light', 11, 10, 3, 3]
    ]),
    'visual-first': Object.freeze([
      ['outline', 2, 13, 5, 6],
      ['outline', 7, 9, 18, 14],
      ['outline', 25, 13, 5, 6],
      ['shadow', 8, 11, 16, 10],
      ['main', 10, 12, 12, 8],
      ['accent', 13, 12, 7, 8],
      ['outline', 15, 14, 4, 4],
      ['light', 11, 12, 3, 3],
      ['accent', 21, 4, 3, 7],
      ['accent', 18, 4, 6, 3]
    ]),
    'scene-smith': Object.freeze([
      ['outline', 4, 13, 14, 14],
      ['shadow', 6, 15, 10, 10],
      ['main', 8, 12, 10, 11],
      ['light', 9, 13, 4, 4],
      ['outline', 20, 4, 7, 7],
      ['main', 21, 5, 5, 5],
      ['outline', 23, 9, 4, 17],
      ['accent', 21, 14, 8, 5],
      ['light', 22, 14, 4, 2]
    ]),
    'bio-written': Object.freeze([
      ['outline', 5, 4, 20, 24],
      ['shadow', 7, 6, 16, 20],
      ['main', 8, 7, 14, 18],
      ['light', 10, 9, 9, 2],
      ['light', 10, 13, 8, 2],
      ['light', 10, 17, 6, 2],
      ['outline', 20, 15, 8, 4],
      ['accent', 17, 20, 9, 4],
      ['outline', 15, 24, 4, 4]
    ]),
    'first-friend': Object.freeze([
      ['outline', 4, 6, 9, 9],
      ['main', 6, 8, 5, 5],
      ['outline', 3, 17, 12, 10],
      ['shadow', 5, 19, 8, 6],
      ['outline', 19, 6, 9, 9],
      ['main', 21, 8, 5, 5],
      ['outline', 17, 17, 12, 10],
      ['shadow', 19, 19, 8, 6],
      ['accent', 14, 13, 4, 13],
      ['accent', 9, 18, 14, 4],
      ['light', 15, 14, 2, 5]
    ]),
    'listen-together': Object.freeze([
      ['outline', 7, 5, 18, 5],
      ['outline', 4, 9, 5, 16],
      ['outline', 23, 9, 5, 16],
      ['shadow', 6, 11, 4, 12],
      ['shadow', 22, 11, 4, 12],
      ['main', 7, 13, 4, 8],
      ['main', 21, 13, 4, 8],
      ['accent', 12, 17, 8, 3],
      ['light', 8, 12, 2, 4],
      ['light', 22, 12, 2, 4]
    ]),
    'first-danmaku': Object.freeze([
      ['outline', 3, 5, 26, 20],
      ['outline', 8, 25, 7, 4],
      ['shadow', 5, 7, 22, 16],
      ['main', 7, 8, 18, 13],
      ['accent', 9, 13, 3, 3],
      ['accent', 15, 13, 3, 3],
      ['accent', 21, 13, 3, 3],
      ['light', 8, 9, 10, 2]
    ]),
    'completionist': Object.freeze([
      ['outline', 4, 9, 6, 15],
      ['outline', 13, 5, 6, 19],
      ['outline', 22, 9, 6, 15],
      ['outline', 4, 20, 24, 8],
      ['shadow', 6, 12, 4, 10],
      ['main', 7, 13, 4, 8],
      ['shadow', 22, 12, 4, 10],
      ['main', 21, 13, 4, 8],
      ['shadow', 15, 8, 4, 14],
      ['main', 14, 9, 4, 12],
      ['main', 6, 21, 20, 4],
      ['light', 7, 22, 14, 2],
      ['accent', 9, 18, 3, 3],
      ['accent2', 20, 18, 3, 3]
    ])
  });

  let localThemePreferencePresent = false;
  let localSoundPreferencePresent = false;
  let localStatePresent = false;
  let activeScope = '';
  let activeStorageKey = STORAGE_KEY;
  let activeProvider = loadActiveProvider();
  let achievementState = loadState();
  let hydrationFinished = false;
  let serverHydrated = false;
  let hydrationRetryTimer = 0;
  let persistQueuedDuringHydration = false;
  let persistRequestedRevision = 0;
  let persistCompletedRevision = 0;
  let persistDrainActive = false;
  let persistRetryAfterDrain = false;
  let persistRetryAttempt = 0;
  let persistRetryTimer = 0;
  let syncGeneration = 0;
  const toastQueue = [];
  let toastActive = false;
  let toastEntryTimer = 0;
  let toastHoldTimer = 0;
  let toastExitTimer = 0;
  let audioContext = null;
  let achievementSoundAudio = null;
  let worldPeaceSequenceActive = false;
  let lastWorldPeaceSongSignature = '';
  let challengeCatalog = [];
  let challengeRewards = new Map();
  let challengeLoading = false;
  let challengeLoadGeneration = 0;
  let challengeLoadError = '';
  let challengeEvidenceOutbox = [];
  let challengeEvidenceDeadLetters = [];
  let challengeEvidenceActiveStorageKey = '';
  const challengeEvidenceFlushes = new Map();
  const challengeEvidenceRetryTimers = new Map();
  const challengeEvidenceRetryAttempts = new Map();
  let challengeEvidenceSequence = 0;
  let rememberedCommunityIdentities = loadRememberedCommunityIdentities();
  let challengeListeningAccumulator = null;
  const challengeEvidenceBootId = `boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function normalizeTimestamp(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : 0;
  }

  function normalizeProgress(value) {
    const progress = Number(value);
    return Number.isFinite(progress) && progress >= 0 ? Math.round(progress) : 0;
  }

  function normalizeTheme(value) {
    return THEMES.includes(value) ? value : 'classic';
  }

  function emptyState() {
    return {
      version: STORAGE_VERSION,
      progress: {},
      unlocked: {},
      themes: { page: 'classic', toast: 'classic' },
      settings: { soundEnabled: true },
      ornaments: {
        claimed: {},
        equipped: { achievementId: null, changedAt: 0 }
      }
    };
  }

  function normalizeOrnaments(value, unlocked) {
    const normalized = {
      claimed: {},
      equipped: { achievementId: null, changedAt: 0 }
    };
    const source = value && typeof value === 'object' ? value : {};
    const claimed = source.claimed && typeof source.claimed === 'object' ? source.claimed : {};
    catalog.forEach((achievement) => {
      if (!unlocked[achievement.id]) return;
      const claimedAt = normalizeTimestamp(claimed[achievement.id]?.claimedAt);
      if (claimedAt) normalized.claimed[achievement.id] = { claimedAt };
    });
    const equipped = source.equipped && typeof source.equipped === 'object'
      ? source.equipped
      : {};
    const changedAt = normalizeTimestamp(equipped.changedAt);
    const achievementId = typeof equipped.achievementId === 'string'
      ? equipped.achievementId
      : null;
    if (achievementId && changedAt && normalized.claimed[achievementId]) {
      normalized.equipped = { achievementId, changedAt };
    } else if (equipped.achievementId == null && changedAt) {
      normalized.equipped = { achievementId: null, changedAt };
    }
    return normalized;
  }

  function normalizeState(value) {
    const normalized = emptyState();
    if (!value || typeof value !== 'object') return normalized;
    const progress = value.progress && typeof value.progress === 'object' ? value.progress : {};
    catalog.forEach((achievement) => {
      if (!Object.prototype.hasOwnProperty.call(progress, achievement.id)) return;
      normalized.progress[achievement.id] = normalizeProgress(progress[achievement.id]);
    });
    const source = value.unlocked && typeof value.unlocked === 'object' ? value.unlocked : {};
    catalog.forEach((achievement) => {
      const record = source[achievement.id];
      const unlockedAt = normalizeTimestamp(record && record.unlockedAt);
      if (unlockedAt) normalized.unlocked[achievement.id] = { unlockedAt };
    });
    const themes = value.themes && typeof value.themes === 'object' ? value.themes : {};
    normalized.themes.page = normalizeTheme(themes.page);
    normalized.themes.toast = normalizeTheme(themes.toast);
    const settings = value.settings && typeof value.settings === 'object' ? value.settings : {};
    normalized.settings.soundEnabled = settings.soundEnabled !== false;
    normalized.ornaments = normalizeOrnaments(value.ornaments, normalized.unlocked);
    return normalized;
  }

  function loadActiveProvider() {
    try {
      const provider = String(window.localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY) || '').trim().toLowerCase();
      return /^(?:netease|qq|kugou|qishui)$/.test(provider) ? provider : 'netease';
    } catch (error) {
      return 'netease';
    }
  }

  function storageKeyForScope(scope) {
    return !scope || scope === 'anonymous'
      ? STORAGE_KEY
      : `${STORAGE_KEY}:${encodeURIComponent(scope)}`;
  }

  function readStoredState(storageKey, allowLegacy = false) {
    const fallback = {
      state: emptyState(),
      present: false,
      themePreferencePresent: false,
      soundPreferencePresent: false
    };
    try {
      const current = window.localStorage.getItem(storageKey);
      const legacy = allowLegacy && current == null
        ? window.localStorage.getItem(LEGACY_STORAGE_KEY)
        : null;
      const raw = current == null ? legacy : current;
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return {
        state: normalizeState(parsed),
        present: true,
        themePreferencePresent: current != null && parsed?.themePreferenceSaved !== false,
        soundPreferencePresent: current != null && typeof parsed?.settings?.soundEnabled === 'boolean'
      };
    } catch (error) {
      return fallback;
    }
  }

  function loadState() {
    const loaded = readStoredState(STORAGE_KEY, true);
    localStatePresent = loaded.present;
    localThemePreferencePresent = loaded.themePreferencePresent;
    localSoundPreferencePresent = loaded.soundPreferencePresent;
    return loaded.state;
  }

  function adoptScope(scope) {
    const normalizedScope = typeof scope === 'string' && scope.trim() ? scope.trim() : 'anonymous';
    if (activeScope === normalizedScope) return;
    const previousScope = activeScope;
    const previousState = normalizeState(achievementState);
    const previousPresent = localStatePresent;
    activeScope = normalizedScope;
    activeStorageKey = storageKeyForScope(normalizedScope);
    const loaded = readStoredState(activeStorageKey, normalizedScope === 'anonymous');
    let migrateUnscoped = false;
    if (!loaded.present && previousScope === '' && normalizedScope !== 'anonymous' && previousPresent) {
      try {
        migrateUnscoped = !window.localStorage.getItem(ACCOUNT_MIGRATION_STORAGE_KEY);
      } catch (error) {}
    }
    achievementState = migrateUnscoped ? previousState : loaded.state;
    localStatePresent = migrateUnscoped || loaded.present;
    localThemePreferencePresent = migrateUnscoped
      ? localThemePreferencePresent
      : loaded.themePreferencePresent;
    localSoundPreferencePresent = migrateUnscoped
      ? localSoundPreferencePresent
      : loaded.soundPreferencePresent;
    if (migrateUnscoped) {
      try {
        window.localStorage.setItem(ACCOUNT_MIGRATION_STORAGE_KEY, normalizedScope);
      } catch (error) {}
      saveLocalState();
    }
  }

  function stateApiUrl() {
    return `${STATE_API}?provider=${encodeURIComponent(activeProvider)}`;
  }

  function currentCommunityFeId() {
    const snapshot = window.__feMonsterCommunityProfileSnapshot;
    const snapshotAccountId = String(snapshot?.account?.userId || '').trim();
    const snapshotScope = snapshotAccountId ? `${activeProvider}:${snapshotAccountId}` : '';
    const activeAccountScope = activeScope && activeScope !== 'anonymous'
      ? activeScope
      : snapshotScope;
    if (!activeAccountScope) return '';
    const snapshotId = snapshot?.profile?.feId;
    const domId = document.querySelector('#communityFeId')?.textContent;
    const value = String(snapshotId || domId || '').trim();
    if (/^\d{8}$/.test(value)) return value;
    const remembered = activeAccountScope
      ? rememberedCommunityIdentities.identities[`${activeProvider}|${activeAccountScope}`]
      : '';
    return /^\d{8}$/.test(remembered) ? remembered : '';
  }

  function emptyRememberedCommunityIdentities() {
    return { version: 2, identities: {}, activeScopes: {} };
  }

  function loadRememberedCommunityIdentities() {
    try {
      const value = JSON.parse(window.localStorage.getItem(COMMUNITY_IDENTITY_STORAGE_KEY) || '{}');
      if (Number(value.version) === 2 && value.identities && value.activeScopes) {
        return {
          version: 2,
          identities: { ...value.identities },
          activeScopes: { ...value.activeScopes }
        };
      }
      const legacy = emptyRememberedCommunityIdentities();
      if (/^(?:netease|qq|kugou|qishui)$/.test(value.provider)
        && value.scope && value.scope !== 'anonymous' && /^\d{8}$/.test(value.feId)) {
        legacy.identities[`${value.provider}|${value.scope}`] = value.feId;
        legacy.activeScopes[value.provider] = value.scope;
      }
      return legacy;
    } catch (error) {
      return emptyRememberedCommunityIdentities();
    }
  }

  function saveRememberedCommunityIdentities() {
    try {
      window.localStorage.setItem(COMMUNITY_IDENTITY_STORAGE_KEY, JSON.stringify(rememberedCommunityIdentities));
    } catch (error) {}
  }

  function rememberCommunityIdentity(feId, scope = activeScope) {
    const normalizedFeId = String(feId || '').trim();
    const normalizedScope = String(scope || '').trim();
    if (!/^\d{8}$/.test(normalizedFeId) || !normalizedScope || normalizedScope === 'anonymous') return false;
    rememberedCommunityIdentities.identities[`${activeProvider}|${normalizedScope}`] = normalizedFeId;
    rememberedCommunityIdentities.activeScopes[activeProvider] = normalizedScope;
    saveRememberedCommunityIdentities();
    return true;
  }

  function setRememberedCommunityScope(provider, scope) {
    if (!/^(?:netease|qq|kugou|qishui)$/.test(provider)) return;
    rememberedCommunityIdentities.activeScopes[provider] = scope && scope !== 'anonymous' ? scope : 'anonymous';
    saveRememberedCommunityIdentities();
  }

  function restoreRememberedCommunityScope() {
    const scope = rememberedCommunityIdentities.activeScopes[activeProvider];
    if (!scope || scope === 'anonymous') return false;
    adoptScope(scope);
    return true;
  }

  function challengeEvidenceStorageKey() {
    const feId = currentCommunityFeId();
    const scope = activeScope && activeScope !== 'anonymous' ? activeScope : 'anonymous';
    return `${CHALLENGE_EVIDENCE_STORAGE_KEY}:${activeProvider}:${encodeURIComponent(scope)}:${feId || 'anonymous'}`;
  }

  function readChallengeEvidenceState(storageKey = challengeEvidenceStorageKey()) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      const now = Date.now();
      const events = (Array.isArray(parsed.events) ? parsed.events : [])
        .filter((event) => event && typeof event === 'object'
          && now - normalizeTimestamp(event.occurredAt) <= CHALLENGE_EVIDENCE_MAX_AGE_MS)
        .slice(-CHALLENGE_EVIDENCE_LIMIT);
      const deadLetters = (Array.isArray(parsed.deadLetters) ? parsed.deadLetters : []).slice(-40);
      return { events, deadLetters };
    } catch (error) {
      return { events: [], deadLetters: [] };
    }
  }

  function loadChallengeEvidenceOutbox() {
    const storageKey = challengeEvidenceStorageKey();
    challengeEvidenceActiveStorageKey = storageKey;
    const state = readChallengeEvidenceState(storageKey);
    challengeEvidenceOutbox = state.events;
    challengeEvidenceDeadLetters = state.deadLetters;
    challengeEvidenceSequence = Math.max(
      challengeEvidenceSequence,
      ...challengeEvidenceOutbox.map((event) => normalizeProgress(event.seq))
    );
    render();
    return challengeEvidenceOutbox;
  }

  function writeChallengeEvidenceState(storageKey, events, deadLetters) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        events: events.slice(-CHALLENGE_EVIDENCE_LIMIT),
        deadLetters: deadLetters.slice(-40)
      }));
    } catch (error) {}
    const currentStorageKey = challengeEvidenceStorageKey();
    const current = readChallengeEvidenceState(currentStorageKey);
    challengeEvidenceActiveStorageKey = currentStorageKey;
    challengeEvidenceOutbox = current.events;
    challengeEvidenceDeadLetters = current.deadLetters;
    render();
  }

  function saveChallengeEvidenceOutbox() {
    const storageKey = challengeEvidenceActiveStorageKey || challengeEvidenceStorageKey();
    writeChallengeEvidenceState(
      storageKey,
      challengeEvidenceOutbox,
      challengeEvidenceDeadLetters
    );
  }

  function challengeEvidenceStatus() {
    const currentStorageKey = challengeEvidenceStorageKey();
    const current = readChallengeEvidenceState(currentStorageKey);
    challengeEvidenceActiveStorageKey = currentStorageKey;
    challengeEvidenceOutbox = current.events;
    challengeEvidenceDeadLetters = current.deadLetters;
    const pending = challengeEvidenceOutbox.length;
    return {
      pending,
      rejected: challengeEvidenceDeadLetters.length,
      label: pending ? `${pending} 条待联网验证` : '服务器进度已同步'
    };
  }

  function challengeEvidenceEventId(type, sequence, occurredAt, payload) {
    const payloadText = JSON.stringify(payload || {});
    let hash = 2166136261;
    const source = `${currentCommunityFeId()}|${challengeEvidenceBootId}|${sequence}|${type}|${occurredAt}|${payloadText}`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `evidence-${occurredAt.toString(36)}-${sequence.toString(36)}-${(hash >>> 0).toString(36)}`;
  }

  function normalizeChallengeEvidence(type, payload = {}) {
    if (!['listen-interval', 'track-completed', 'lyric-calibrated'].includes(type)) return null;
    const requestedOccurredAt = type === 'listen-interval'
      ? normalizeTimestamp(payload.endedAt)
      : type === 'track-completed'
        ? normalizeTimestamp(payload.completedAt)
        : 0;
    const occurredAt = requestedOccurredAt || Date.now();
    const seq = ++challengeEvidenceSequence;
    const normalizedPayload = type === 'listen-interval'
      ? (() => {
          const endedAt = normalizeTimestamp(payload.endedAt) || occurredAt;
          const requestedDuration = Math.max(0, Number(payload.durationSec) || 0);
          const requestedStartedAt = normalizeTimestamp(payload.startedAt);
          const boundedDuration = Math.min(
            30,
            requestedDuration || (requestedStartedAt ? Math.max(0, (endedAt - requestedStartedAt) / 1000) : 0)
          );
          const durationSec = Math.round(boundedDuration * 1000) / 1000;
          const startedAt = Math.max(
            1,
            requestedStartedAt || Math.round(endedAt - durationSec * 1000)
          );
          return {
            trackId: boundedChallengeText(payload.trackId, '', 180),
            startedAt,
            endedAt,
            durationSec
          };
        })()
      : type === 'track-completed'
      ? {
          trackId: boundedChallengeText(payload.trackId, '', 180),
          durationSec: Math.max(0, Math.round(Number(payload.durationSec) || 0)),
          ...(normalizeTimestamp(payload.completedAt) ? { completedAt: normalizeTimestamp(payload.completedAt) } : {})
        }
      : {
          trackId: boundedChallengeText(payload.trackId, '', 180),
          revisionId: boundedChallengeText(payload.revisionId, '', 120),
          changedLineCount: Math.max(1, Math.round(Number(payload.changedLineCount) || 1))
        };
    if (!normalizedPayload.trackId || (type === 'listen-interval' && normalizedPayload.durationSec < 1)) return null;
    const eventId = challengeEvidenceEventId(type, seq, occurredAt, normalizedPayload);
    return Object.freeze({ eventId, id: eventId, type, occurredAt, seq, payload: normalizedPayload });
  }

  function challengeEvidenceResponseStatus(response, payload) {
    const upstream = Math.round(Number(payload?.upstreamStatus || payload?.httpStatus) || 0);
    return upstream >= 100 && upstream <= 599 ? upstream : response.status;
  }

  function permanentChallengeEvidenceStatus(status) {
    return [400, 409, 410, 413, 415, 422].includes(status);
  }

  function scheduleChallengeEvidenceRetry(storageKey, increaseAttempt = true) {
    if (storageKey !== challengeEvidenceActiveStorageKey || challengeEvidenceRetryTimers.has(storageKey)) return;
    const previous = challengeEvidenceRetryAttempts.get(storageKey) || 0;
    const attempt = increaseAttempt ? previous + 1 : previous;
    challengeEvidenceRetryAttempts.set(storageKey, attempt);
    const delay = CHALLENGE_EVIDENCE_RETRY_DELAYS[Math.min(attempt, CHALLENGE_EVIDENCE_RETRY_DELAYS.length - 1)];
    const timer = window.setTimeout(() => {
      challengeEvidenceRetryTimers.delete(storageKey);
      if (storageKey === challengeEvidenceActiveStorageKey) void flushChallengeEvidence();
    }, delay);
    challengeEvidenceRetryTimers.set(storageKey, timer);
  }

  function flushChallengeEvidence() {
    const storageKey = challengeEvidenceActiveStorageKey || challengeEvidenceStorageKey();
    const feId = currentCommunityFeId();
    if (!feId) return Promise.resolve(challengeEvidenceStatus());
    const activeFlush = challengeEvidenceFlushes.get(storageKey);
    if (activeFlush) return activeFlush;
    const initial = readChallengeEvidenceState(storageKey);
    if (!initial.events.length) return Promise.resolve(challengeEvidenceStatus());

    const task = (async () => {
      const machine = await challengeMachineIdentity();
      let processed = 0;
      let transientFailure = false;
      let state = readChallengeEvidenceState(storageKey);
      while (state.events.length && processed < CHALLENGE_EVIDENCE_BATCH_SIZE) {
        const event = state.events[0];
        try {
          const response = await window.fetch(`${COMMUNITY_ACHIEVEMENTS_API}/evidence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feId, event, ...machine })
          });
          const payload = await response.json().catch(() => ({}));
          const status = challengeEvidenceResponseStatus(response, payload);
          if (response.ok && payload.ok === true && payload.accepted === true) {
            processed += 1;
            challengeEvidenceRetryAttempts.set(storageKey, 0);
            if (storageKey === challengeEvidenceActiveStorageKey && Array.isArray(payload.challenges)) {
              const normalized = normalizeChallengePayload({ challenges: payload.challenges });
              const byId = new Map(normalized.challenges.map((item) => [item.id, item]));
              challengeCatalog = challengeCatalog.map((item) => byId.get(item.id) || item);
            }
            const latest = readChallengeEvidenceState(storageKey);
            writeChallengeEvidenceState(
              storageKey,
              latest.events.filter((entry) => entry.eventId !== event.eventId),
              latest.deadLetters
            );
            state = readChallengeEvidenceState(storageKey);
            continue;
          }
          if (permanentChallengeEvidenceStatus(status)) {
            const latest = readChallengeEvidenceState(storageKey);
            const deadLetters = latest.deadLetters.concat({
              event,
              rejectedAt: Date.now(),
              reason: boundedChallengeText(payload.error || payload.message, `HTTP ${status}`, 100)
            });
            processed += 1;
            writeChallengeEvidenceState(
              storageKey,
              latest.events.filter((entry) => entry.eventId !== event.eventId),
              deadLetters
            );
            state = readChallengeEvidenceState(storageKey);
            continue;
          }
          transientFailure = true;
          break;
        } catch (error) {
          transientFailure = true;
          break;
        }
      }
      state = readChallengeEvidenceState(storageKey);
      writeChallengeEvidenceState(storageKey, state.events, state.deadLetters);
      if (state.events.length && storageKey === challengeEvidenceActiveStorageKey) {
        scheduleChallengeEvidenceRetry(storageKey, transientFailure);
      }
      return storageKey === challengeEvidenceActiveStorageKey
        ? challengeEvidenceStatus()
        : { pending: state.events.length, rejected: state.deadLetters.length, label: '' };
    })().finally(() => {
      challengeEvidenceFlushes.delete(storageKey);
      if (storageKey === challengeEvidenceActiveStorageKey) render();
    });
    challengeEvidenceFlushes.set(storageKey, task);
    return task;
  }

  async function queueChallengeEvidence(type, payload = {}) {
    if (!currentCommunityFeId()) return { queued: false, event: null, ...challengeEvidenceStatus() };
    const event = normalizeChallengeEvidence(type, payload);
    if (!event) return { queued: false, event: null, ...challengeEvidenceStatus() };
    if (challengeEvidenceOutbox.some((entry) => entry.eventId === event.eventId)) {
      return { queued: false, duplicate: true, event, ...challengeEvidenceStatus() };
    }
    challengeEvidenceOutbox.push(event);
    challengeEvidenceOutbox = challengeEvidenceOutbox.slice(-CHALLENGE_EVIDENCE_LIMIT);
    saveChallengeEvidenceOutbox();
    await flushChallengeEvidence();
    return { queued: true, event, ...challengeEvidenceStatus() };
  }

  function listenObservation(value = {}) {
    const trackId = boundedChallengeText(value.trackId, '', 180);
    const endedAt = normalizeTimestamp(value.endedAt);
    const durationSec = Math.min(30, Math.max(0, Number(value.durationSec) || 0));
    const startedAt = normalizeTimestamp(value.startedAt) || Math.max(1, Math.round(endedAt - durationSec * 1000));
    if (!trackId || !endedAt || durationSec <= 0 || startedAt >= endedAt) return null;
    return { trackId, startedAt, endedAt, durationSec };
  }

  function emitChallengeListeningAccumulator() {
    const current = challengeListeningAccumulator;
    if (!current || current.durationSec < 1) {
      challengeListeningAccumulator = null;
      return false;
    }
    challengeListeningAccumulator = null;
    void queueChallengeEvidence('listen-interval', current);
    return true;
  }

  function observeChallengeListening(value = {}) {
    const observation = listenObservation(value);
    if (!observation) return false;
    const current = challengeListeningAccumulator;
    const continuous = current
      && current.trackId === observation.trackId
      && observation.startedAt >= current.endedAt
      && observation.startedAt - current.endedAt <= 1500;
    if (!continuous) {
      emitChallengeListeningAccumulator();
      challengeListeningAccumulator = { ...observation };
    } else {
      const availableSeconds = Math.max(0, (observation.endedAt - current.endedAt) / 1000);
      current.endedAt = observation.endedAt;
      current.durationSec = Math.min(30, current.durationSec + Math.min(observation.durationSec, availableSeconds));
    }
    if (challengeListeningAccumulator?.durationSec >= 30) emitChallengeListeningAccumulator();
    return true;
  }

  function flushChallengeListening() {
    return emitChallengeListeningAccumulator();
  }

  function communityAchievementsUrl() {
    const values = [`provider=${encodeURIComponent(activeProvider)}`];
    const feId = currentCommunityFeId();
    if (feId) values.push(`feId=${encodeURIComponent(feId)}`);
    return `${COMMUNITY_ACHIEVEMENTS_API}?${values.join('&')}`;
  }

  function boundedChallengeText(value, fallback = '', maximum = 160) {
    const text = typeof value === 'string' || Number.isFinite(value) ? String(value).trim() : '';
    return (text || fallback).slice(0, maximum);
  }

  function normalizeChallengeProgress(value = {}) {
    const current = Math.max(0, Number(value.current) || 0);
    const target = Math.max(1, Number(value.target) || 1);
    return {
      current: Math.min(current, target),
      target,
      unit: boundedChallengeText(value.unit, 'count', 24).toLowerCase()
    };
  }

  function normalizeIdentityCardReward(value = {}) {
    const card = value.identityCard && typeof value.identityCard === 'object'
      ? value.identityCard
      : value.card && typeof value.card === 'object'
        ? value.card
        : value;
    const id = boundedChallengeText(card.id || card.cardId, '', 64);
    if (!id) return null;
    const color = (candidate, fallback) => {
      const normalized = boundedChallengeText(candidate, '', 32);
      return /^#[0-9a-f]{3,8}$/i.test(normalized) ? normalized : fallback;
    };
    const nicknameEditable = card.nicknameEditable === true
      && card.issuedByServer !== true
      && !['locked', 'fixed', 'server'].includes(boundedChallengeText(card.nicknamePolicy, '', 16).toLowerCase());
    return Object.freeze({
      ...card,
      id,
      label: boundedChallengeText(card.label || card.name, '专属身份卡', 64),
      material: boundedChallengeText(card.material, 'polished-gold', 32),
      finish: boundedChallengeText(card.finish, 'polished', 32),
      primaryColor: color(card.primaryColor || card.frontColor, '#D79A24'),
      secondaryColor: color(card.secondaryColor || card.backColor, '#6A3308'),
      accentColor: color(card.accentColor || card.borderColor, '#FFF1A8'),
      borderColor: color(card.borderColor || card.accentColor, '#FFF1A8'),
      issuedByServer: card.issuedByServer !== false,
      nicknameEditable,
      nicknamePolicy: nicknameEditable ? 'profile' : 'locked',
      engravedNickname: boundedChallengeText(card.engravedNickname || card.nickname, '', 32)
    });
  }

  function normalizeChallengePayload(payload = {}) {
    const rewardEntries = Array.isArray(payload.identityCardRewards)
      ? payload.identityCardRewards
      : payload.identityCardRewards && typeof payload.identityCardRewards === 'object'
        ? Object.entries(payload.identityCardRewards).map(([achievementId, reward]) => ({ achievementId, ...reward }))
        : [];
    const rewards = new Map();
    rewardEntries.forEach((entry) => {
      const achievementId = boundedChallengeText(entry?.achievementId || entry?.challengeId, '', 64);
      const card = normalizeIdentityCardReward(entry || {});
      if (achievementId && card) rewards.set(achievementId, card);
    });
    const challenges = (Array.isArray(payload.challenges) ? payload.challenges : [])
      .map((challenge) => {
        const id = boundedChallengeText(challenge?.id || challenge?.achievementId, '', 64);
        if (!id) return null;
        const inlineReward = normalizeIdentityCardReward(challenge?.reward || {});
        if (!rewards.has(id) && inlineReward) rewards.set(id, inlineReward);
        return Object.freeze({
          id,
          title: boundedChallengeText(challenge.title || challenge.name, id, 80),
          description: boundedChallengeText(challenge.description || challenge.tagline, '完成服务器核验的高难度挑战。', 220),
          tier: boundedChallengeText(challenge.tier, 'epic', 24).toLowerCase(),
          serverVerified: challenge.serverVerified !== false,
          progress: normalizeChallengeProgress(challenge.progress),
          eligible: challenge.eligible === true,
          claimed: challenge.claimed === true,
          claimedAt: normalizeTimestamp(challenge.claimedAt)
        });
      })
      .filter(Boolean);
    return { challenges, rewards };
  }

  async function hydrateChallenges() {
    if (challengeLoading) return challengeCatalog;
    const generation = ++challengeLoadGeneration;
    challengeLoading = true;
    challengeLoadError = '';
    render();
    try {
      const response = await window.fetch(communityAchievementsUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`challenge load failed: ${response.status}`);
      const payload = await response.json();
      if (generation !== challengeLoadGeneration) return challengeCatalog;
      const normalized = normalizeChallengePayload(payload);
      challengeCatalog = normalized.challenges;
      challengeRewards = normalized.rewards;
      return challengeCatalog;
    } catch (error) {
      if (generation === challengeLoadGeneration) challengeLoadError = '高难度挑战暂时无法同步';
      return challengeCatalog;
    } finally {
      if (generation === challengeLoadGeneration) {
        challengeLoading = false;
        render();
      }
    }
  }

  function statePayload() {
    return {
      version: STORAGE_VERSION,
      progress: achievementState.progress,
      unlocked: achievementState.unlocked,
      themes: achievementState.themes,
      settings: achievementState.settings,
      ornaments: achievementState.ornaments
    };
  }

  function saveLocalState() {
    try {
      window.localStorage.setItem(activeStorageKey, JSON.stringify({
        ...statePayload(),
        themePreferenceSaved: localThemePreferencePresent
      }));
      localStatePresent = true;
    } catch (error) {}
  }

  async function persistServerState() {
    const generation = syncGeneration;
    const response = await window.fetch(stateApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statePayload()),
      keepalive: true
    });
    if (!response.ok) throw new Error(`achievement save failed: ${response.status}`);
    const responsePayload = await response.json();
    if (generation !== syncGeneration) return statePayload();
    const sync = responsePayload?._sync && typeof responsePayload._sync === 'object'
      ? responsePayload._sync
      : null;
    if (sync?.scope && activeScope && sync.scope !== activeScope) {
      throw new Error('achievement save returned a stale account scope');
    }
    if (sync?.remoteRequired === true && sync?.serverSynced !== true) {
      throw new Error('achievement server backup is pending');
    }
    const serverState = normalizeState(responsePayload);
    const localSnapshot = normalizeState(achievementState);
    const mergedProgress = mergeProgress(localSnapshot.progress, serverState.progress);
    const mergedUnlocked = mergeUnlocked(localSnapshot.unlocked, serverState.unlocked);
    const mergedOrnaments = mergeOrnaments(
      localSnapshot.ornaments,
      serverState.ornaments,
      mergedUnlocked
    );
    const serverAddedState = JSON.stringify(localSnapshot.progress) !== JSON.stringify(mergedProgress)
      || JSON.stringify(localSnapshot.unlocked) !== JSON.stringify(mergedUnlocked)
      || JSON.stringify(localSnapshot.ornaments) !== JSON.stringify(mergedOrnaments);
    achievementState = {
      ...localSnapshot,
      progress: mergedProgress,
      unlocked: mergedUnlocked,
      ornaments: mergedOrnaments
    };
    if (serverAddedState) {
      saveLocalState();
      render();
      emitOrnamentChange('server-merge');
    }
    return statePayload();
  }

  async function drainPersistQueue() {
    if (persistDrainActive || !hydrationFinished || !serverHydrated) return;
    persistDrainActive = true;
    try {
      while (persistCompletedRevision < persistRequestedRevision) {
        const targetRevision = persistRequestedRevision;
        const generation = syncGeneration;
        try {
          await persistServerState();
        } catch (error) {
          if (!persistRetryTimer && persistRetryAttempt < PERSIST_RETRY_DELAYS.length) {
            const retryDelay = PERSIST_RETRY_DELAYS[persistRetryAttempt];
            persistRetryAttempt += 1;
            persistRetryTimer = window.setTimeout(() => {
              persistRetryTimer = 0;
              void drainPersistQueue();
            }, retryDelay);
          } else if (!persistRetryTimer) {
            serverHydrated = false;
            scheduleHydrationRetry();
          }
          break;
        }
        if (generation !== syncGeneration) break;
        persistCompletedRevision = targetRevision;
        persistRetryAttempt = 0;
      }
    } finally {
      persistDrainActive = false;
      if (persistRetryAfterDrain) {
        persistRetryAfterDrain = false;
        window.clearTimeout(persistRetryTimer);
        persistRetryTimer = 0;
        void drainPersistQueue();
      }
    }
  }

  function requestServerPersist() {
    persistRequestedRevision += 1;
    if (!hydrationFinished || !serverHydrated) {
      persistQueuedDuringHydration = true;
      return;
    }
    if (!persistDrainActive && !persistRetryTimer) persistRetryAttempt = 0;
    if (persistRetryTimer) {
      window.clearTimeout(persistRetryTimer);
      persistRetryTimer = 0;
      persistRetryAttempt = 0;
    }
    if (persistDrainActive) persistRetryAfterDrain = true;
    void drainPersistQueue();
  }

  function saveState() {
    saveLocalState();
    requestServerPersist();
  }

  async function flush(options = {}) {
    const timeout = Math.max(250, Math.min(Number(options.timeout) || 4000, 8000));
    const deadline = Date.now() + timeout;
    if (!hydrationFinished) {
      await Promise.race([
        ready,
        wait(Math.max(0, deadline - Date.now()))
      ]);
    }
    if (!serverHydrated) return false;
    const targetRevision = persistRequestedRevision;
    if (persistCompletedRevision >= targetRevision) return true;
    void drainPersistQueue();
    while (Date.now() < deadline) {
      if (persistCompletedRevision >= targetRevision) return true;
      await wait(24);
    }
    return persistCompletedRevision >= targetRevision;
  }

  function mergeUnlocked(localUnlocked, serverUnlocked) {
    const merged = {};
    catalog.forEach((achievement) => {
      const localTimestamp = normalizeTimestamp(localUnlocked?.[achievement.id]?.unlockedAt);
      const serverTimestamp = normalizeTimestamp(serverUnlocked?.[achievement.id]?.unlockedAt);
      const unlockedAt = localTimestamp && serverTimestamp
        ? Math.min(localTimestamp, serverTimestamp)
        : localTimestamp || serverTimestamp;
      if (unlockedAt) merged[achievement.id] = { unlockedAt };
    });
    return merged;
  }

  function mergeProgress(localProgress, serverProgress) {
    const merged = {};
    catalog.forEach((achievement) => {
      const localValue = Object.prototype.hasOwnProperty.call(localProgress || {}, achievement.id)
        ? normalizeProgress(localProgress[achievement.id])
        : null;
      const serverValue = Object.prototype.hasOwnProperty.call(serverProgress || {}, achievement.id)
        ? normalizeProgress(serverProgress[achievement.id])
        : null;
      if (localValue != null || serverValue != null) {
        merged[achievement.id] = Math.max(localValue || 0, serverValue || 0);
      }
    });
    return merged;
  }

  function equipmentOrderKey(equipment) {
    const achievementId = typeof equipment?.achievementId === 'string'
      ? equipment.achievementId
      : '';
    return achievementId || '\uffff';
  }

  function serverEquipmentWins(localEquipment, serverEquipment) {
    const localChangedAt = normalizeTimestamp(localEquipment?.changedAt);
    const serverChangedAt = normalizeTimestamp(serverEquipment?.changedAt);
    if (serverChangedAt !== localChangedAt) return serverChangedAt > localChangedAt;
    return equipmentOrderKey(serverEquipment) > equipmentOrderKey(localEquipment);
  }

  function mergeOrnaments(localOrnaments, serverOrnaments, mergedUnlocked) {
    const local = normalizeOrnaments(localOrnaments, mergedUnlocked);
    const server = normalizeOrnaments(serverOrnaments, mergedUnlocked);
    const claimed = {};
    catalog.forEach((achievement) => {
      if (!mergedUnlocked[achievement.id]) return;
      const localTimestamp = normalizeTimestamp(local.claimed[achievement.id]?.claimedAt);
      const serverTimestamp = normalizeTimestamp(server.claimed[achievement.id]?.claimedAt);
      const claimedAt = localTimestamp && serverTimestamp
        ? Math.min(localTimestamp, serverTimestamp)
        : localTimestamp || serverTimestamp;
      if (claimedAt) claimed[achievement.id] = { claimedAt };
    });
    const localChangedAt = normalizeTimestamp(local.equipped.changedAt);
    const serverChangedAt = normalizeTimestamp(server.equipped.changedAt);
    const selected = serverEquipmentWins(local.equipped, server.equipped)
      ? server.equipped
      : local.equipped;
    const achievementId = selected.achievementId && claimed[selected.achievementId]
      ? selected.achievementId
      : null;
    return {
      claimed,
      equipped: {
        achievementId,
        changedAt: Math.max(localChangedAt, serverChangedAt)
      }
    };
  }

  function scheduleHydrationRetry() {
    if (hydrationRetryTimer) return;
    hydrationRetryTimer = window.setTimeout(() => {
      hydrationRetryTimer = 0;
      void hydrateState();
    }, 5000);
  }

  async function hydrateState() {
    const generation = syncGeneration;
    let localSnapshot = normalizeState(achievementState);
    let serverState = null;
    let responseSync = null;
    for (const retryDelay of HYDRATE_RETRY_DELAYS) {
      if (retryDelay > 0) await wait(retryDelay);
      try {
        const response = await window.fetch(stateApiUrl(), { cache: 'no-store' });
        if (!response.ok) throw new Error(`achievement load failed: ${response.status}`);
        const responsePayload = await response.json();
        if (generation !== syncGeneration) return statePayload();
        responseSync = responsePayload?._sync && typeof responsePayload._sync === 'object'
          ? responsePayload._sync
          : null;
        if (responseSync?.provider) activeProvider = String(responseSync.provider);
        if (responseSync?.scope) {
          adoptScope(responseSync.scope);
          setRememberedCommunityScope(activeProvider, responseSync.scope);
        }
        serverState = normalizeState(responsePayload);
        break;
      } catch (error) {
      }
    }

    if (serverState) {
      localSnapshot = normalizeState(achievementState);
      const mergedProgress = mergeProgress(localSnapshot.progress, serverState.progress);
      const mergedUnlocked = mergeUnlocked(localSnapshot.unlocked, serverState.unlocked);
      achievementState = {
        version: STORAGE_VERSION,
        progress: mergedProgress,
        unlocked: mergedUnlocked,
        themes: localThemePreferencePresent ? localSnapshot.themes : serverState.themes,
        settings: localSoundPreferencePresent ? localSnapshot.settings : serverState.settings,
        ornaments: mergeOrnaments(
          localSnapshot.ornaments,
          serverState.ornaments,
          mergedUnlocked
        )
      };
      serverHydrated = responseSync?.remoteRequired === true
        ? responseSync?.serverSynced === true
        : true;
      localThemePreferencePresent = true;
      localSoundPreferencePresent = true;
      saveLocalState();
      applyThemes();
      render();
      emitOrnamentChange('hydrate');
    } else {
      localSnapshot = normalizeState(achievementState);
      achievementState = localSnapshot;
      applyThemes();
      render();
      emitOrnamentChange('hydrate');
    }

    hydrationFinished = true;
    maybeUnlockCompletionist();
    if (serverHydrated) {
      persistQueuedDuringHydration = false;
      requestServerPersist();
    } else scheduleHydrationRetry();
    if (currentCommunityFeId()) {
      loadChallengeEvidenceOutbox();
      void flushChallengeEvidence();
      void hydrateChallenges();
    }
    return statePayload();
  }

  function handleCommunityAccountChange(event) {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    const provider = String(detail.provider || activeProvider || 'netease').trim().toLowerCase();
    if (!/^(?:netease|qq|kugou|qishui)$/.test(provider)) return;
    const account = detail.account && typeof detail.account === 'object' ? detail.account : {};
    const rawAccountId = account.userId;
    const accountId = typeof rawAccountId === 'string' || Number.isFinite(rawAccountId)
      ? String(rawAccountId).trim()
      : '';
    const nextScope = detail.loggedIn === true && accountId
      ? `${provider}:${accountId}`
      : 'anonymous';
    if (provider === activeProvider && nextScope === activeScope) {
      if (nextScope === 'anonymous') setRememberedCommunityScope(provider, nextScope);
      return;
    }

    syncGeneration += 1;
    activeProvider = provider;
    flushChallengeListening();
    window.clearTimeout(hydrationRetryTimer);
    hydrationRetryTimer = 0;
    window.clearTimeout(persistRetryTimer);
    persistRetryTimer = 0;
    persistRetryAttempt = 0;
    persistRequestedRevision = 0;
    persistCompletedRevision = 0;
    persistQueuedDuringHydration = false;
    serverHydrated = false;
    hydrationFinished = false;
    adoptScope(nextScope);
    setRememberedCommunityScope(provider, nextScope);
    loadChallengeEvidenceOutbox();
    applyThemes();
    render();
    emitOrnamentChange('account-change');
    void hydrateState();
    void hydrateChallenges();
  }

  function handleCommunityProfile(event) {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    if (detail.provider) activeProvider = String(detail.provider).trim().toLowerCase();
    if (detail.loggedIn === false || detail.hasCommunityIdentity === false) {
      setRememberedCommunityScope(activeProvider, 'anonymous');
      if (activeScope !== 'anonymous') adoptScope('anonymous');
      loadChallengeEvidenceOutbox();
      return;
    }
    if (detail.hasCommunityIdentity === true || detail.profile?.feId) {
      const accountId = String(detail.account?.userId || '').trim();
      if ((!activeScope || activeScope === 'anonymous') && accountId) {
        adoptScope(`${activeProvider}:${accountId}`);
        setRememberedCommunityScope(activeProvider, activeScope);
      }
      rememberCommunityIdentity(detail.profile?.feId, activeScope);
      loadChallengeEvidenceOutbox();
      void flushChallengeEvidence();
      void hydrateChallenges();
    }
  }

  function isUnlocked(id) {
    return !!(catalogById.has(id) && achievementState.unlocked[id]);
  }

  function getProgress(id) {
    if (!catalogById.has(id)) return 0;
    return normalizeProgress(achievementState.progress?.[id]);
  }

  function setProgress(id, value) {
    if (!catalogById.has(id)) return false;
    const next = normalizeProgress(value);
    if (next <= getProgress(id)) return false;
    achievementState.progress[id] = next;
    saveState();
    return true;
  }

  function isOrnamentClaimed(id) {
    return !!(ornamentByAchievementId.has(id) && achievementState.ornaments.claimed[id]);
  }

  function getOrnamentState() {
    const claimed = {};
    catalog.forEach((achievement) => {
      const record = achievementState.ornaments.claimed[achievement.id];
      if (record) claimed[achievement.id] = { claimedAt: record.claimedAt };
    });
    return {
      claimed,
      equipped: {
        achievementId: achievementState.ornaments.equipped.achievementId,
        changedAt: achievementState.ornaments.equipped.changedAt
      }
    };
  }

  function getEquippedOrnament() {
    const achievementId = achievementState.ornaments.equipped.achievementId;
    return achievementId ? ornamentByAchievementId.get(achievementId) || null : null;
  }

  function emitOrnamentChange(reason, achievementId = null) {
    if (typeof window.dispatchEvent !== 'function' || typeof window.CustomEvent !== 'function') return;
    const ornament = achievementId ? ornamentByAchievementId.get(achievementId) || null : null;
    window.dispatchEvent(new window.CustomEvent('fe-achievement-ornament-change', {
      detail: {
        reason,
        achievementId,
        ornament,
        state: getOrnamentState()
      }
    }));
  }

  function claimOrnament(id, options = {}) {
    if (!ornamentByAchievementId.has(id) || !isUnlocked(id) || isOrnamentClaimed(id)) return false;
    const requestedTimestamp = normalizeTimestamp(options.claimedAt);
    achievementState.ornaments.claimed[id] = {
      claimedAt: requestedTimestamp || Date.now()
    };
    saveState();
    render();
    emitOrnamentChange('claim', id);
    if (id !== 'completionist') maybeUnlockCompletionist(options);
    return true;
  }

  function nextEquipmentChangedAt(requestedValue) {
    const requestedTimestamp = normalizeTimestamp(requestedValue);
    return Math.max(
      requestedTimestamp || Date.now(),
      normalizeTimestamp(achievementState.ornaments.equipped.changedAt) + 1
    );
  }

  function equipOrnament(id, options = {}) {
    if (!isOrnamentClaimed(id) || achievementState.ornaments.equipped.achievementId === id) {
      return false;
    }
    achievementState.ornaments.equipped = {
      achievementId: id,
      changedAt: nextEquipmentChangedAt(options.changedAt)
    };
    saveState();
    emitOrnamentChange('equip', id);
    return true;
  }

  function unequipOrnament(options = {}) {
    const previousId = achievementState.ornaments.equipped.achievementId;
    if (!previousId) return false;
    achievementState.ornaments.equipped = {
      achievementId: null,
      changedAt: nextEquipmentChangedAt(options.changedAt)
    };
    saveState();
    emitOrnamentChange('unequip', previousId);
    return true;
  }

  function syncAchievementSoundControl() {
    const toggle = document.querySelector('#achievementSoundToggle');
    if (toggle) toggle.checked = achievementState.settings?.soundEnabled !== false;
  }

  function applyThemes() {
    const pageTheme = normalizeTheme(achievementState.themes?.page);
    const toastTheme = normalizeTheme(achievementState.themes?.toast);
    const panel = document.querySelector('#communityProfilePanel');
    const toast = document.querySelector('#achievementToast');
    const pageSelect = document.querySelector('#achievementPageThemeSelect');
    const toastSelect = document.querySelector('#achievementToastThemeSelect');
    if (panel) panel.dataset.achievementPageTheme = pageTheme;
    if (toast) toast.dataset.achievementToastTheme = toastTheme;
    if (pageSelect && pageSelect.value !== pageTheme) pageSelect.value = pageTheme;
    if (toastSelect && toastSelect.value !== toastTheme) toastSelect.value = toastTheme;
    syncAchievementSoundControl();
  }

  function setTheme(target, theme) {
    if (target !== 'page' && target !== 'toast') return false;
    const normalized = normalizeTheme(theme);
    if (achievementState.themes[target] === normalized) return false;
    achievementState.themes[target] = normalized;
    localThemePreferencePresent = true;
    applyThemes();
    saveState();
    return true;
  }

  function setSoundEnabled(enabled) {
    const nextEnabled = enabled !== false;
    if (achievementState.settings.soundEnabled === nextEnabled) return false;
    achievementState.settings.soundEnabled = nextEnabled;
    localSoundPreferencePresent = true;
    if (!nextEnabled && achievementSoundAudio) {
      achievementSoundAudio.pause();
      achievementSoundAudio.currentTime = 0;
    }
    syncAchievementSoundControl();
    saveState();
    return true;
  }

  function bindThemeControls() {
    const pageSelect = document.querySelector('#achievementPageThemeSelect');
    const toastSelect = document.querySelector('#achievementToastThemeSelect');
    if (pageSelect && pageSelect.dataset.achievementThemeBound !== 'true') {
      pageSelect.dataset.achievementThemeBound = 'true';
      pageSelect.addEventListener('change', () => setTheme('page', pageSelect.value));
    }
    if (toastSelect && toastSelect.dataset.achievementThemeBound !== 'true') {
      toastSelect.dataset.achievementThemeBound = 'true';
      toastSelect.addEventListener('change', () => setTheme('toast', toastSelect.value));
    }
    const soundToggle = document.querySelector('#achievementSoundToggle');
    if (soundToggle && soundToggle.dataset.achievementSoundBound !== 'true') {
      soundToggle.dataset.achievementSoundBound = 'true';
      soundToggle.addEventListener('change', () => setSoundEnabled(soundToggle.checked));
    }
    applyThemes();
  }

  const ACHIEVEMENT_ICON_SIZE = 32;

  function achievementIconPixelRatio() {
    const devicePixelRatio = Number(window.devicePixelRatio) || 1;
    return Math.min(3, Math.max(1, devicePixelRatio));
  }

  function drawPixelIcon(canvas, id, unlocked) {
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const commands = ICON_COMMANDS[id];
    const palette = unlocked ? ICON_PALETTES[id] : LOCKED_PALETTE;
    if (!commands || !palette) return;
    const pixelRatio = achievementIconPixelRatio();
    canvas.width = Math.round(ACHIEVEMENT_ICON_SIZE * pixelRatio);
    canvas.height = Math.round(ACHIEVEMENT_ICON_SIZE * pixelRatio);
    if (canvas.style) {
      canvas.style.width = `${ACHIEVEMENT_ICON_SIZE}px`;
      canvas.style.height = `${ACHIEVEMENT_ICON_SIZE}px`;
    }
    canvas.dataset.achievementIcon = id;
    canvas.dataset.achievementIconUnlocked = String(unlocked === true);
    canvas.dataset.achievementIconPixelRatio = String(pixelRatio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.setTransform?.(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, ACHIEVEMENT_ICON_SIZE, ACHIEVEMENT_ICON_SIZE);
    commands.forEach(([tone, x, y, width, height]) => {
      context.fillStyle = palette[tone] || palette.main;
      context.fillRect(x, y, width, height);
    });
  }

  let achievementIconScaleRefreshFrame = 0;

  function refreshAchievementIconScale() {
    achievementIconScaleRefreshFrame = 0;
    document.querySelectorAll('canvas[data-achievement-icon]').forEach((canvas) => {
      drawPixelIcon(
        canvas,
        canvas.dataset.achievementIcon,
        canvas.dataset.achievementIconUnlocked === 'true'
      );
    });
  }

  function scheduleAchievementIconScaleRefresh() {
    if (achievementIconScaleRefreshFrame) return;
    if (typeof window.requestAnimationFrame === 'function') {
      achievementIconScaleRefreshFrame = window.requestAnimationFrame(refreshAchievementIconScale);
      return;
    }
    refreshAchievementIconScale();
  }

  function formatUnlockedAt(timestamp) {
    if (!timestamp) return '--';
    try {
      return new Date(timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function completionistProgress() {
    const unlockedCount = COMPLETIONIST_PREREQUISITE_IDS
      .filter((id) => isUnlocked(id))
      .length;
    const claimedCount = COMPLETIONIST_PREREQUISITE_IDS
      .filter((id) => isOrnamentClaimed(id))
      .length;
    const prerequisiteCount = COMPLETIONIST_PREREQUISITE_IDS.length;
    return {
      unlockedCount,
      claimedCount,
      prerequisiteCount,
      prerequisitesComplete: unlockedCount === prerequisiteCount,
      finalTaskComplete: claimedCount === prerequisiteCount,
      eligible: unlockedCount === prerequisiteCount && claimedCount === prerequisiteCount
    };
  }

  function updateCompletionistRequirements(button, achievement) {
    const prerequisiteIds = Array.isArray(achievement.prerequisiteIds)
      ? achievement.prerequisiteIds
      : [];
    if (!prerequisiteIds.length || !achievement.finalTask) return '';

    let detail = button.querySelector('.achievement-node-requirements');
    if (!detail) {
      detail = document.createElement('span');
      detail.className = 'achievement-node-requirements';
      detail.setAttribute('aria-hidden', 'true');

      const heading = document.createElement('span');
      heading.className = 'achievement-node-requirements-heading';
      detail.appendChild(heading);

      const list = document.createElement('span');
      list.className = 'achievement-node-requirements-list';
      prerequisiteIds.forEach((id) => {
        const item = document.createElement('span');
        item.className = 'achievement-node-requirement';
        item.dataset.requirementId = id;
        list.appendChild(item);
      });
      const finalItem = document.createElement('span');
      finalItem.className = 'achievement-node-requirement achievement-node-requirement--final';
      finalItem.dataset.requirementId = achievement.finalTask.id;
      list.appendChild(finalItem);
      detail.appendChild(list);
      button.appendChild(detail);
    }

    const progress = completionistProgress();
    const heading = detail.querySelector('.achievement-node-requirements-heading');
    if (heading) {
      heading.textContent = `前提任务 ${progress.unlockedCount}/${progress.prerequisiteCount}`;
    }
    detail.querySelectorAll('.achievement-node-requirement').forEach((item) => {
      const requirementId = item.dataset.requirementId;
      const finalTask = requirementId === achievement.finalTask.id;
      const complete = finalTask ? progress.finalTaskComplete : isUnlocked(requirementId);
      const label = finalTask
        ? `终局条件：${achievement.finalTask.label} ${progress.claimedCount}/${progress.prerequisiteCount}`
        : catalogById.get(requirementId)?.name || requirementId;
      item.classList.toggle('is-complete', complete);
      item.textContent = `${complete ? '✓' : '□'} ${label}`;
    });
    button.classList.add('has-requirements');
    button.dataset.requirementsProgress = `${progress.unlockedCount}/${progress.prerequisiteCount}`;

    const prerequisiteLabels = prerequisiteIds.map((id) => (
      `${isUnlocked(id) ? '已完成' : '未完成'} ${catalogById.get(id)?.name || id}`
    ));
    return `前提任务：${prerequisiteLabels.join('；')}。终局条件：${progress.finalTaskComplete ? '已完成' : '未完成'} ${achievement.finalTask.label}`;
  }

  function updateAchievementNode(button, achievement) {
    const unlocked = isUnlocked(achievement.id);
    const record = achievementState.unlocked[achievement.id];
    button.classList.toggle('is-unlocked', unlocked);
    button.classList.toggle('is-locked', !unlocked);
    button.dataset.achievementId = achievement.id;
    button.dataset.tagline = achievement.tagline;
    button.removeAttribute('title');
    const requirementsLabel = updateCompletionistRequirements(button, achievement);
    button.setAttribute(
      'aria-label',
      `${unlocked ? '已达成' : '未达成'}：${achievement.name}。${achievement.tagline}${requirementsLabel ? `。${requirementsLabel}` : ''}`
    );
    const canvas = button.querySelector('canvas');
    drawPixelIcon(canvas, achievement.id, unlocked);
    const name = button.querySelector('.achievement-node-copy strong');
    const status = button.querySelector('.achievement-node-copy small');
    if (name) name.textContent = achievement.name;
    if (status) {
      if (unlocked) status.textContent = formatUnlockedAt(record.unlockedAt);
      else if (achievement.id === 'completionist') {
        const progress = completionistProgress();
        status.textContent = `前提 ${progress.unlockedCount}/${progress.prerequisiteCount} · 挂饰 ${progress.claimedCount}/${progress.prerequisiteCount}`;
      } else status.textContent = '尚未达成';
    }
    return button;
  }

  function createAchievementNode(achievement) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'community-achievement-node';

    const icon = document.createElement('span');
    icon.className = 'achievement-node-icon';
    icon.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    icon.appendChild(canvas);

    const copy = document.createElement('span');
    copy.className = 'achievement-node-copy';
    const name = document.createElement('strong');
    const status = document.createElement('small');
    copy.appendChild(name);
    copy.appendChild(status);

    button.appendChild(icon);
    button.appendChild(copy);
    return updateAchievementNode(button, achievement);
  }

  function createConnector(className) {
    const connector = document.createElement('span');
    connector.className = className;
    connector.setAttribute('aria-hidden', 'true');
    return connector;
  }

  function createAchievementLane(path) {
    const achievements = catalog.filter((achievement) => achievement.path === path.id);
    const lane = document.createElement('section');
    lane.className = 'achievement-path-lane';
    lane.dataset.achievementPath = path.id;
    lane.setAttribute('aria-label', `${path.label}成就`);

    const label = document.createElement('span');
    label.className = 'achievement-path-label';
    const pathUnlocked = achievements.filter((achievement) => isUnlocked(achievement.id)).length;
    label.textContent = `${path.label} ${pathUnlocked}/${achievements.length}`;

    const track = document.createElement('div');
    track.className = 'achievement-path-track';
    achievements.forEach((achievement, index) => {
      if (index > 0) track.appendChild(createConnector('achievement-path-line'));
      track.appendChild(createAchievementNode(achievement));
    });

    lane.appendChild(label);
    lane.appendChild(track);
    return lane;
  }

  function updateAchievementPathLabels(grid) {
    const pathById = new Map(ACHIEVEMENT_PATHS.map((path) => [path.id, path]));
    grid.querySelectorAll('.achievement-path-lane').forEach((lane) => {
      const path = pathById.get(lane.dataset.achievementPath);
      if (!path) return;
      const achievements = catalog.filter((achievement) => achievement.path === path.id);
      const label = lane.querySelector('.achievement-path-label');
      if (label) {
        label.textContent = `${path.label} ${achievements.filter((achievement) => isUnlocked(achievement.id)).length}/${achievements.length}`;
      }
    });
    const secretLabel = grid.querySelector('.achievement-path-secret')?.querySelector('.achievement-path-label');
    if (secretLabel) secretLabel.textContent = `隐藏 ${isUnlocked('secret-left') ? '1/1' : '0/1'}`;
  }

  function challengeTierLabel(tier) {
    return {
      hard: '高难度',
      epic: '史诗难度',
      legendary: '传奇难度',
      mythic: '神话难度'
    }[tier] || '高难度';
  }

  function challengeProgressText(progress = {}) {
    const current = Math.max(0, Number(progress.current) || 0);
    const target = Math.max(1, Number(progress.target) || 1);
    if (['seconds', 'second', 'sec', 's'].includes(progress.unit)) {
      const hours = (value) => {
        const amount = value / 3600;
        return `${Number.isInteger(amount) ? amount : amount.toFixed(1)} 小时`;
      };
      return `${hours(current)} / ${hours(target)}`;
    }
    const unit = {
      tracks: '首', songs: '首', plays: '首',
      interactions: '次', actions: '次',
      lyrics: '次', calibrations: '次', contributions: '次',
      cards: '张', rewards: '张'
    }[progress.unit] || '次';
    return `${Math.round(current)} ${unit} / ${Math.round(target)} ${unit}`;
  }

  function updateChallengeRewardPreview(preview, card) {
    preview.dataset.material = card.material;
    preview.dataset.finish = card.finish;
    preview.style.setProperty('--reward-card-primary', card.primaryColor);
    preview.style.setProperty('--reward-card-secondary', card.secondaryColor);
    preview.style.setProperty('--reward-card-accent', card.accentColor);
    preview.style.setProperty('--reward-card-border', card.borderColor);
    preview.querySelector('.achievement-card-reward-engraving').textContent = card.engravedNickname || 'FE MONSTER';
  }

  function createChallengeRewardPreview(card) {
    const preview = document.createElement('span');
    preview.className = 'achievement-card-reward-preview';
    preview.setAttribute('aria-hidden', 'true');
    const glint = document.createElement('span');
    glint.className = 'achievement-card-reward-glint';
    const engraving = document.createElement('span');
    engraving.className = 'achievement-card-reward-engraving';
    preview.appendChild(glint);
    preview.appendChild(engraving);
    updateChallengeRewardPreview(preview, card);
    return preview;
  }

  function updateChallengeNode(node, challenge) {
    const card = challengeRewards.get(challenge.id);
    node.dataset.achievementChallengeId = challenge.id;
    node.dataset.tier = challenge.tier;
    node.classList.toggle('is-eligible', challenge.eligible && !challenge.claimed);
    node.classList.toggle('is-claimed', challenge.claimed);
    node.querySelector('.achievement-challenge-tier').textContent = challengeTierLabel(challenge.tier);
    node.querySelector('.achievement-challenge-verified').textContent = challenge.serverVerified ? '服务器核验' : '进度同步';
    node.querySelector('.achievement-challenge-title').textContent = challenge.title;
    node.querySelector('.achievement-challenge-description').textContent = challenge.description;
    const progress = node.querySelector('progress');
    progress.max = challenge.progress.target;
    progress.value = challenge.progress.current;
    progress.setAttribute('aria-label', `${challenge.title}进度：${challengeProgressText(challenge.progress)}`);
    node.querySelector('.achievement-challenge-progress-copy').textContent = challengeProgressText(challenge.progress);

    const reward = node.querySelector('.achievement-card-reward');
    reward.hidden = !card;
    if (card) {
      updateChallengeRewardPreview(reward.querySelector('.achievement-card-reward-preview'), card);
      reward.querySelector('.achievement-card-reward-name').textContent = card.label;
      reward.querySelector('.achievement-card-reward-meta').textContent = `${card.material} · ${card.finish} · 专属固定刻字`;
    }

    const claim = node.querySelector('.achievement-challenge-claim');
    claim.disabled = challenge.claimed || !challenge.eligible || !card;
    claim.textContent = challenge.claimed ? '已领取' : challenge.eligible ? '领取身份卡' : '尚未达成';
    claim.setAttribute('aria-label', challenge.claimed
      ? `${challenge.title}奖励已领取`
      : challenge.eligible
        ? `领取${challenge.title}奖励身份卡${card?.label || ''}`
        : `${challenge.title}尚未达成，当前${challengeProgressText(challenge.progress)}`);
    return node;
  }

  function createChallengeNode(challenge) {
    const node = document.createElement('article');
    node.className = 'achievement-challenge';
    const status = document.createElement('span');
    status.className = 'achievement-challenge-status';
    const tier = document.createElement('span');
    tier.className = 'achievement-challenge-tier';
    const verified = document.createElement('span');
    verified.className = 'achievement-challenge-verified';
    status.appendChild(tier);
    status.appendChild(verified);

    const copy = document.createElement('span');
    copy.className = 'achievement-challenge-copy';
    const title = document.createElement('strong');
    title.className = 'achievement-challenge-title';
    const description = document.createElement('small');
    description.className = 'achievement-challenge-description';
    const progressWrap = document.createElement('span');
    progressWrap.className = 'achievement-challenge-progress';
    const progress = document.createElement('progress');
    progress.value = 0;
    progress.max = 1;
    const progressCopy = document.createElement('span');
    progressCopy.className = 'achievement-challenge-progress-copy';
    progressWrap.appendChild(progress);
    progressWrap.appendChild(progressCopy);
    copy.appendChild(title);
    copy.appendChild(description);
    copy.appendChild(progressWrap);

    const reward = document.createElement('span');
    reward.className = 'achievement-card-reward';
    reward.appendChild(createChallengeRewardPreview(normalizeIdentityCardReward({ id: 'preview' })));
    const rewardCopy = document.createElement('span');
    rewardCopy.className = 'achievement-card-reward-copy';
    const rewardKicker = document.createElement('small');
    rewardKicker.textContent = '完成奖励';
    const rewardName = document.createElement('strong');
    rewardName.className = 'achievement-card-reward-name';
    const rewardMeta = document.createElement('span');
    rewardMeta.className = 'achievement-card-reward-meta';
    rewardCopy.appendChild(rewardKicker);
    rewardCopy.appendChild(rewardName);
    rewardCopy.appendChild(rewardMeta);
    reward.appendChild(rewardCopy);

    const claim = document.createElement('button');
    claim.className = 'achievement-challenge-claim';
    claim.type = 'button';
    claim.addEventListener('click', () => {
      void claimChallengeReward(challenge.id);
    });
    node.appendChild(status);
    node.appendChild(copy);
    node.appendChild(reward);
    node.appendChild(claim);
    return updateChallengeNode(node, challenge);
  }

  async function challengeMachineIdentity() {
    try {
      const response = await window.fetch('/api/app/machine', { cache: 'no-store' });
      if (!response.ok) return { computerId: '', computerIdSource: 'client-unavailable' };
      const payload = await response.json();
      const computerId = boundedChallengeText(payload.computerId || payload.id, '', 200);
      return { computerId, computerIdSource: computerId ? 'app-machine' : 'client-unavailable' };
    } catch (error) {
      return { computerId: '', computerIdSource: 'client-unavailable' };
    }
  }

  async function claimChallengeReward(achievementId) {
    const challenge = challengeCatalog.find((entry) => entry.id === achievementId);
    const card = challengeRewards.get(achievementId);
    if (!challenge || !card || !challenge.eligible || challenge.claimed) return false;
    const selector = `[data-achievement-challenge-id="${window.CSS?.escape?.(achievementId) || achievementId}"] .achievement-challenge-claim`;
    const button = document.querySelector(selector);
    if (button) {
      button.disabled = true;
      button.textContent = '领取中…';
    }
    try {
      const feId = currentCommunityFeId();
      if (!feId) throw new Error('请先登录社区');
      const machine = await challengeMachineIdentity();
      const response = await window.fetch(`${COMMUNITY_ACHIEVEMENTS_API}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feId, achievementId, ...machine })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || payload.message || '身份卡领取失败');
      const normalized = normalizeChallengePayload({
        challenges: payload.challenge ? [payload.challenge] : [],
        identityCardRewards: payload.reward ? [{ achievementId, ...payload.reward }] : []
      });
      const confirmed = normalized.challenges[0] || Object.freeze({ ...challenge, claimed: true, claimedAt: Date.now() });
      challengeCatalog = challengeCatalog.map((entry) => entry.id === achievementId ? confirmed : entry);
      if (normalized.rewards.has(achievementId)) challengeRewards.set(achievementId, normalized.rewards.get(achievementId));
      render();
      await window.FeMonsterIdentityCard?.refresh?.({ suppressAnnouncement: true });
      window.dispatchEvent(new CustomEvent('fe-monster-reward-animation', {
        detail: {
          phase: 'display',
          itemType: 'identity-card',
          itemId: card.id,
          animationId: card.displayAnimationId || card.entranceAnimationId || '',
          card: { ...card },
          serverConfirmed: true,
          duplicate: payload.duplicate === true
        }
      }));
      window.FeMonsterIdentityCard?.open?.({ preservePreview: true });
      return payload;
    } catch (error) {
      challengeLoadError = boundedChallengeText(error?.message, '身份卡领取失败', 100);
      render();
      return false;
    }
  }

  function renderChallengeRail(grid) {
    let rail = grid.querySelector('.achievement-challenge-rail');
    if (!rail) {
      rail = document.createElement('section');
      rail.className = 'achievement-challenge-rail';
      rail.setAttribute('aria-label', '高难度成就与身份卡奖励');
      const head = document.createElement('span');
      head.className = 'achievement-challenge-rail-head';
      const title = document.createElement('strong');
      title.textContent = '高难度挑战';
      const copy = document.createElement('small');
      copy.className = 'achievement-challenge-rail-copy';
      head.appendChild(title);
      head.appendChild(copy);
      const list = document.createElement('div');
      list.className = 'achievement-challenge-list';
      const empty = document.createElement('span');
      empty.className = 'achievement-challenge-empty';
      empty.setAttribute('role', 'status');
      rail.appendChild(head);
      rail.appendChild(list);
      rail.appendChild(empty);
      grid.appendChild(rail);
    }
    const list = rail.querySelector('.achievement-challenge-list');
    const empty = rail.querySelector('.achievement-challenge-empty');
    const railCopy = rail.querySelector('.achievement-challenge-rail-copy');
    if (railCopy) {
      const evidence = challengeEvidenceStatus();
      railCopy.textContent = evidence.pending
        ? `真实进度由服务器核验 · ${evidence.label}`
        : '真实进度由服务器核验 · 完成后领取限定身份卡';
    }
    const existing = new Map(Array.from(list.querySelectorAll('[data-achievement-challenge-id]'))
      .map((node) => [node.dataset.achievementChallengeId, node]));
    challengeCatalog.forEach((challenge) => {
      const node = existing.get(challenge.id) || createChallengeNode(challenge);
      updateChallengeNode(node, challenge);
      list.appendChild(node);
      existing.delete(challenge.id);
    });
    existing.forEach((node) => node.remove());
    const hasChallenges = challengeCatalog.length > 0;
    list.hidden = !hasChallenges;
    empty.hidden = hasChallenges;
    if (!hasChallenges) {
      empty.textContent = challengeLoading
        ? '正在同步高难度挑战…'
        : challengeLoadError || '登录社区后同步高难度挑战与限定身份卡';
    }
  }

  function render() {
    const grid = document.querySelector('#communityAchievementGrid');
    const meta = document.querySelector('#communityAchievementMeta');
    const unlocked = catalog
      .map((achievement) => ({ achievement, record: achievementState.unlocked[achievement.id] }))
      .filter((entry) => !!entry.record);

    if (meta) {
      const latest = unlocked.reduce((current, entry) => (
        !current || entry.record.unlockedAt > current.record.unlockedAt ? entry : current
      ), null);
      meta.textContent = `已解锁 ${unlocked.length}/${catalog.length} · 最近达成 ${latest ? formatUnlockedAt(latest.record.unlockedAt) : '--'}`;
    }
    if (!grid) return false;

    const existingNodes = new Map(Array.from(
      grid.querySelectorAll('.community-achievement-node[data-achievement-id]')
    ).map((node) => [node.dataset.achievementId, node]));
    if (existingNodes.size === catalog.length
      && catalog.every((achievement) => existingNodes.has(achievement.id))) {
      catalog.forEach((achievement) => updateAchievementNode(existingNodes.get(achievement.id), achievement));
      updateAchievementPathLabels(grid);
      renderChallengeRail(grid);
      return true;
    }

    const map = document.createElement('div');
    map.className = 'achievement-path';
    map.setAttribute('aria-label', '成就路径');

    const mainPath = document.createElement('div');
    mainPath.className = 'achievement-path-main';
    ACHIEVEMENT_PATHS.forEach((path) => mainPath.appendChild(createAchievementLane(path)));

    const secretPath = document.createElement('div');
    secretPath.className = 'achievement-path-secret';
    secretPath.setAttribute('aria-label', '隐藏成就');
    secretPath.appendChild(createConnector('achievement-path-branch'));
    const secretLabel = document.createElement('span');
    secretLabel.className = 'achievement-path-label';
    secretLabel.textContent = `隐藏 ${isUnlocked('secret-left') ? '1/1' : '0/1'}`;
    secretPath.appendChild(secretLabel);
    catalog
      .filter((achievement) => achievement.path === 'secret')
      .forEach((achievement) => secretPath.appendChild(createAchievementNode(achievement)));

    map.appendChild(mainPath);
    map.appendChild(secretPath);
    grid.replaceChildren(map);
    renderChallengeRail(grid);
    return true;
  }

  function ensureToastKicker(toast, name) {
    let kicker = toast.querySelector('.achievement-toast-kicker');
    if (kicker) {
      kicker.textContent = '获得成就';
      return;
    }
    kicker = document.createElement('span');
    kicker.className = 'achievement-toast-kicker';
    kicker.textContent = '获得成就';
    const parent = name.parentElement || toast;
    parent.insertBefore(kicker, name);
  }

  function playAchievementArpeggio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const schedule = () => {
      try {
        const start = audioContext.currentTime + 0.015;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'square';
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          oscillator.frequency.setValueAtTime(frequency, start + index * 0.075);
        });
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.36);
      } catch (error) {}
    };

    try {
      if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') {
        const resumed = audioContext.resume();
        if (resumed && typeof resumed.then === 'function') resumed.then(schedule).catch(() => {});
        return;
      }
      schedule();
    } catch (error) {}
  }

  function playAchievementSound() {
    if (achievementState.settings?.soundEnabled === false) return;
    const AudioClass = window.Audio;
    if (typeof AudioClass !== 'function') {
      playAchievementArpeggio();
      return;
    }
    try {
      if (!achievementSoundAudio) {
        achievementSoundAudio = new AudioClass(ACHIEVEMENT_SOUND_URL);
        achievementSoundAudio.preload = 'auto';
        achievementSoundAudio.volume = 0.86;
      }
      achievementSoundAudio.pause();
      achievementSoundAudio.currentTime = 0;
      const playback = achievementSoundAudio.play();
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {
          if (achievementState.settings?.soundEnabled !== false) playAchievementArpeggio();
        });
      }
    } catch (error) {
      playAchievementArpeggio();
    }
  }

  function clearToastTimers() {
    window.clearTimeout(toastEntryTimer);
    window.clearTimeout(toastHoldTimer);
    window.clearTimeout(toastExitTimer);
    toastEntryTimer = 0;
    toastHoldTimer = 0;
    toastExitTimer = 0;
  }

  function showNextToast() {
    if (toastActive || toastQueue.length === 0) return;
    const queued = toastQueue.shift();
    const toast = document.querySelector('#achievementToast');
    const icon = document.querySelector('#achievementToastIcon');
    const name = document.querySelector('#achievementToastName');
    if (!toast || !icon || !name) {
      showNextToast();
      return;
    }

    toastActive = true;
    clearToastTimers();
    ensureToastKicker(toast, name);
    name.textContent = queued.achievement.name;
    drawPixelIcon(icon, queued.achievement.id, true);
    toast.setAttribute('aria-label', `获得成就：${queued.achievement.name}`);
    toast.classList.remove('is-visible', 'is-leaving', 'is-animating');
    toast.hidden = false;
    toast.classList.add('is-animating');
    if (queued.sound) playAchievementSound();

    const beginLeaving = () => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        toast.removeEventListener('transitionend', finishOnMotionEnd);
        toast.removeEventListener('animationend', finishOnMotionEnd);
        window.clearTimeout(toastExitTimer);
        toastExitTimer = 0;
        toast.hidden = true;
        toast.classList.remove('is-visible', 'is-leaving', 'is-animating');
        toastActive = false;
        window.setTimeout(showNextToast, 40);
      };
      const finishOnMotionEnd = (event) => {
        if (event.target === toast && event.propertyName === 'transform') finish();
      };
      toast.addEventListener('transitionend', finishOnMotionEnd);
      toast.addEventListener('animationend', finishOnMotionEnd);
      toast.classList.add('is-leaving', 'is-animating');
      toastExitTimer = window.setTimeout(finish, TOAST_EXIT_MS);
    };

    let holdStarted = false;
    const startHold = () => {
      if (holdStarted) return;
      holdStarted = true;
      toast.removeEventListener('transitionend', finishEntering);
      window.clearTimeout(toastEntryTimer);
      toastEntryTimer = 0;
      toast.classList.remove('is-animating');
      toastHoldTimer = window.setTimeout(beginLeaving, TOAST_HOLD_MS);
    };
    const finishEntering = (event) => {
      if (event.target === toast && event.propertyName === 'transform') startHold();
    };
    toast.addEventListener('transitionend', finishEntering);
    toastEntryTimer = window.setTimeout(startHold, 520);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    });
  }

  function queueToast(achievement, options) {
    toastQueue.push({ achievement, sound: options.sound !== false });
    showNextToast();
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function nextPaint() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }

  async function ensureAchievementFontReady() {
    const fontSet = document.fonts;
    if (!fontSet || typeof fontSet.load !== 'function') return false;
    try {
      const loadedFaces = await Promise.race([
        fontSet.load('400 32px "FE AWei Pixel"', '获得成就！世界和平愿天下没有战争'),
        wait(1800).then(() => [])
      ]);
      return Number(loadedFaces?.length) > 0;
    } catch (error) {
      return false;
    }
  }

  function normalizeWorldPeaceTitle(song) {
    return String(song?.title ?? song?.name ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isWorldPeaceSong(song) {
    return /(?:^| )we are the world(?: |$)/.test(normalizeWorldPeaceTitle(song));
  }

  function worldPeaceSongSignature(song) {
    return [
      String(song?.provider ?? ''),
      String(song?.id ?? song?.songId ?? ''),
      normalizeWorldPeaceTitle(song)
    ].join('|');
  }

  async function runWorldPeaceSequence() {
    const overlay = document.querySelector('#worldPeaceCinematic');
    if (!overlay) {
      unlock('world-peace');
      worldPeaceSequenceActive = false;
      return;
    }

    await ensureAchievementFontReady();

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const fadeTime = reducedMotion ? 40 : 950;
    const firstRevealTime = reducedMotion ? 40 : 1200;
    const secondRevealTime = reducedMotion ? 40 : 1500;
    let completed = false;

    try {
      overlay.hidden = false;
      overlay.classList.remove('is-dark', 'is-line-one', 'is-line-one-out', 'is-line-two', 'is-restoring');
      await nextPaint();
      overlay.classList.add('is-dark');
      await wait(fadeTime);
      overlay.classList.add('is-line-one');
      await wait(firstRevealTime + 2000);
      overlay.classList.add('is-line-one-out');
      await wait(reducedMotion ? 40 : 1250);
      overlay.classList.add('is-line-two');
      await wait(secondRevealTime + 1350);
      overlay.classList.add('is-restoring');
      await wait(fadeTime);
      completed = true;
    } finally {
      overlay.hidden = true;
      overlay.classList.remove('is-dark', 'is-line-one', 'is-line-one-out', 'is-line-two', 'is-restoring');
      worldPeaceSequenceActive = false;
      if (completed) unlock('world-peace');
    }
  }

  function handlePlaybackStarted(song) {
    if (!isWorldPeaceSong(song)) {
      lastWorldPeaceSongSignature = '';
      unlock('first-play');
      return false;
    }
    const signature = worldPeaceSongSignature(song);
    if (worldPeaceSequenceActive || signature === lastWorldPeaceSongSignature) return false;
    lastWorldPeaceSongSignature = signature;
    worldPeaceSequenceActive = true;
    runWorldPeaceSequence()
      .catch(() => {
        worldPeaceSequenceActive = false;
      })
      .finally(() => unlock('first-play'));
    return true;
  }

  function maybeUnlockCompletionist(options = {}) {
    if (isUnlocked('completionist')) return false;
    return completionistProgress().eligible ? unlock('completionist', options) : false;
  }

  function unlock(id, options = {}) {
    const achievement = catalogById.get(id);
    if (!achievement || isUnlocked(id)) return false;
    if (id === 'completionist' && !completionistProgress().eligible) return false;
    const requestedTimestamp = normalizeTimestamp(options.unlockedAt);
    achievementState.unlocked[id] = { unlockedAt: requestedTimestamp || Date.now() };
    saveState();
    render();
    emitOrnamentChange('unlock', id);
    if (options.silent !== true && options.notify !== false) queueToast(achievement, options);
    if (id !== 'completionist') maybeUnlockCompletionist(options);
    return true;
  }

  bindThemeControls();
  window.addEventListener?.('resize', scheduleAchievementIconScaleRefresh, { passive: true });
  window.visualViewport?.addEventListener?.('resize', scheduleAchievementIconScaleRefresh, { passive: true });
  window.addEventListener?.('fe-community-account-change', handleCommunityAccountChange);
  window.addEventListener?.('fe-monster-community-profile', handleCommunityProfile);
  window.addEventListener?.('online', () => {
    void flushChallengeEvidence();
    void hydrateChallenges();
  });
  void ensureAchievementFontReady();
  applyThemes();
  restoreRememberedCommunityScope();
  loadChallengeEvidenceOutbox();
  render();
  const ready = hydrateState();
  if (currentCommunityFeId()) void hydrateChallenges();

  window.feAchievements = Object.freeze({
    unlock,
    render,
    isUnlocked,
    getProgress,
    setProgress,
    catalog,
    ornaments: ORNAMENT_CATALOG,
    ready,
    setTheme,
    setSoundEnabled,
    flush,
    claimOrnament,
    equipOrnament,
    unequipOrnament,
    isOrnamentClaimed,
    getOrnamentState,
    getEquippedOrnament,
    handlePlaybackStarted,
    isWorldPeaceSong
    ,refreshChallenges: hydrateChallenges
    ,claimChallengeReward
    ,queueChallengeEvidence
    ,flushChallengeEvidence
    ,getChallengeEvidenceStatus: challengeEvidenceStatus
    ,observeChallengeListening
    ,flushChallengeListening
  });
})();
