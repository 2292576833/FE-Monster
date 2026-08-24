'use strict';

(function loadFeMonsterRuntimeModules() {
  const FE_IDENTITY_CARD_URL = 'fe-identity-card.js?v=20260812-friend-card-2';
  const PET_EMOTION_RUNTIME_URL = 'pet-emotion-runtime.js?v=20260811-conversation-emotion-1';
  const PET_CLIENT_CONTEXT_URL = 'pet-client-context.js?v=20260811-cache-audit-1';
  const PET_LIVE_TURN_CONTROLLER_URL = 'pet-live-turn-controller.js?v=20260811-cache-audit-1';
  const PET_LIVE_TELEMETRY_URL = 'pet-live-telemetry.js?v=20260811-cache-audit-1';
  const PET_LIVE_PLAYOUT_URL = 'pet-live-playout.js?v=20260811-cache-audit-1';
  const PET_LIVE_STT_CLIENT_URL = 'pet-live-stt-client.js?v=20260811-cache-audit-1';
  const PET_ASSISTANT_URL = 'pet-assistant.js?v=20260819-command-parity-2';
  const PET_PRODUCT_TOUR_URL = 'pet-product-tour.js?v=20260811-moving-guide-2';
  const PET_PARTICLE_ORB_URL = 'pet-particle-orb.js?v=20260812-audio-reactive-sphere-2';
  const PET_COMPANION_P2_URL = 'pet-companion-p2.js?v=20260811-cache-audit-1';
  const PIXEL_ACHIEVEMENTS_URL = 'pixel-achievements.js?v=20260813-achievement-rewards-1';
  const PIXEL_LOGIN_ADVENTURE_URL = 'pixel-login-adventure.js?v=20260811-cache-audit-1';
  const CURSOR_TRAILS_URL = 'cursor-trails.js?v=20260811-cache-audit-1';
  const CREATIVE_COMMUNITY_URL = 'creative-community.js?v=20260812-friend-card-1';
  const RHYTHM_GAME_URL = 'rhythm-game.js?v=20260811-cache-audit-1';

  const RUNTIME_MODULE_URLS = [
    FE_IDENTITY_CARD_URL,
    PET_EMOTION_RUNTIME_URL,
    PET_CLIENT_CONTEXT_URL,
    PET_LIVE_TURN_CONTROLLER_URL,
    PET_LIVE_TELEMETRY_URL,
    PET_LIVE_PLAYOUT_URL,
    PET_LIVE_STT_CLIENT_URL,
    PET_ASSISTANT_URL,
    PET_PRODUCT_TOUR_URL,
    PET_PARTICLE_ORB_URL,
    PET_COMPANION_P2_URL,
    PIXEL_ACHIEVEMENTS_URL,
    PIXEL_LOGIN_ADVENTURE_URL,
    CURSOR_TRAILS_URL,
    CREATIVE_COMMUNITY_URL,
    RHYTHM_GAME_URL
  ];

  function readModule(url) {
    const request = new XMLHttpRequest();
    request.open('GET', url, false);
    request.send(null);

    if ((request.status < 200 || request.status >= 300) && request.status !== 0) {
      throw new Error('Failed to load FE Monster runtime module: ' + url + ' (' + request.status + ')');
    }

    return request.responseText;
  }

  const script = document.createElement('script');
  script.text = RUNTIME_MODULE_URLS.map(readModule).join('\n;\n')
    + '\n//# sourceURL=fe-monster-runtime-modules.js';

  const currentScript = document.currentScript;
  if (currentScript && currentScript.parentNode) {
    currentScript.parentNode.insertBefore(script, currentScript.nextSibling);
  } else {
    document.body.appendChild(script);
  }
})();
