import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('web/index.html');
const css = read('web/styles.css');
const app = read('web/app.js');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const registry = read('src/main/java/com/femonster/music/MusicProviderRegistry.java');
const provider = read('src/main/java/com/femonster/music/MusicProviderClient.java');
const generic = read('src/main/java/com/femonster/music/GenericMusicClient.java');
const netease = read('src/main/java/com/femonster/netease/NeteaseClient.java');

const checks = {
  communityListeningStatsAreVisible:
    /id="communityListeningDuration"/.test(html)
    && /id="communityListeningSongs"/.test(html)
    && /renderCommunityListeningStats/.test(app),
  communityStatsPersistLocally:
    /COMMUNITY_LISTENING_STATS_KEY/.test(app)
    && /saveCommunityListeningStats/.test(app)
    && /listenMsDelta/.test(app),
  providerContractExposesRecommendations:
    /recommendedPlaylistsPayload\s*\(/.test(provider)
    && /recommendedPlaylistsPayload\s*\(/.test(registry),
  recommendationRouteIsProviderAware:
    /\/api\/recommend\/playlists/.test(routes)
    && /providerFrom\(path,\s*query\)/.test(routes),
  neteaseUsesDailyPlaylistSource:
    /recommendedPlaylistsPayload\s*\([\s\S]*?\/recommend\/resource/.test(netease),
  qqAndKugouHaveRecommendationCandidates:
    /recommendedPlaylistsPayload\s*\([\s\S]*?case "qq"/.test(generic)
    && /case "kugou"/.test(generic)
    && /\/top\/playlist/.test(generic),
  recommendationsMergeIntoCurrentProviderLibrary:
    /recommendedPlaylists/.test(app)
    && /\/api\/recommend\/playlists/.test(app)
    && /recommended:\s*true/.test(app),
  recommendedPlaylistCardIsIdentifiable:
    /is-recommended-playlist/.test(app)
    && /今日推荐/.test(app),
  selectedPlaylistBecomesPlaybackQueue:
    /state\.queue\s*=\s*state\.activePlaylistSongs/.test(app)
    && /currentIndex:\s*index/.test(app),
  playbackWheelUsesCurrentQueue:
    /function handleQishuiPlaybackWheel/.test(app)
    && /function switchQishuiPlaybackTrack[\s\S]*?playQueueIndex/.test(app),
  playbackButtonsUseGlassMaterial:
    /#qishuiPlaybackCard[\s\S]*?backdrop-filter:\s*blur/.test(css)
    && /qishui-playback-(?:view-button|tools button|play|direction|quality)/.test(css)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ pass: failures.length === 0, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
