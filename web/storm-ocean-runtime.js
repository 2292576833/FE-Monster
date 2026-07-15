(function attachStormOceanRuntime(global) {
  'use strict';

  const PROFILE = 'storm-ocean-v1';
  const runtimeVersion = '2026.07.15-storm-ocean-optics-70';
  const ANDROID_CLIENT = Boolean(global.FeMonsterAndroid || /Android/i.test(global.navigator?.userAgent || ''));
  const LOW_END_ANDROID = ANDROID_CLIENT && global.feMonsterAndroidPerformanceTier === 'low';
  const BASS_SURGE_PACKETS = Object.freeze([
    Object.freeze({ x: 1, z: 0, frequency: 0.076, speed: 0.66, phase: 0.2, gateRate: 0.071, gatePhase: 0.4, warpFrequency: 0.019, warpSpeed: 0.1 }),
    Object.freeze({ x: -0.55, z: 0.835, frequency: 0.083, speed: 0.72, phase: 1.7, gateRate: 0.093, gatePhase: 2.1, warpFrequency: 0.023, warpSpeed: -0.08 }),
    Object.freeze({ x: -0.94, z: -0.34, frequency: 0.071, speed: 0.61, phase: 3.1, gateRate: 0.081, gatePhase: 4.6, warpFrequency: 0.017, warpSpeed: 0.12 }),
    Object.freeze({ x: 0.12, z: -0.993, frequency: 0.089, speed: 0.78, phase: 4.4, gateRate: 0.107, gatePhase: 1.2, warpFrequency: 0.026, warpSpeed: -0.11 }),
    Object.freeze({ x: 0.72, z: 0.694, frequency: 0.068, speed: 0.58, phase: 5.6, gateRate: 0.064, gatePhase: 3.5, warpFrequency: 0.021, warpSpeed: 0.09 }),
    Object.freeze({ x: -0.17, z: 0.985, frequency: 0.095, speed: 0.84, phase: 2.5, gateRate: 0.119, gatePhase: 5.3, warpFrequency: 0.028, warpSpeed: -0.13 })
  ]);
  let cachedEnvironment = null;
  let cachedWaterTextureSet = null;
  let cachedTextureCapability = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep01(value) {
    const normalized = clamp(value, 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
  }

  function mixNumber(start, end, amount) {
    return start + (end - start) * amount;
  }

  function mixTriplet(start, end, amount) {
    return start.map((value, index) => mixNumber(value, end[index], amount));
  }

  function normalizedDirection(x, z) {
    const length = Math.hypot(x, z) || 1;
    return [x / length, z / length];
  }

  function thunderstormWaveMultiplier(config = {}, intensityOverride) {
    const settings = config.thunderstorm || {};
    const intensity = clamp(
      Number.isFinite(Number(intensityOverride))
        ? Number(intensityOverride)
        : Number(config.thunderstormIntensity) || 0,
      0,
      1
    );
    const bassWaveGain = clamp(Number(settings.bassWaveGain) || 1.55, 1, 1.8);
    return mixNumber(1, bassWaveGain, intensity);
  }

  function sampledStormWave(x, z, directionX, directionZ, frequency, speed, phase, steepness, seconds) {
    const direction = normalizedDirection(directionX, directionZ);
    const wavePhase = (x * direction[0] + z * direction[1]) * frequency + seconds * speed + phase;
    const fundamental = Math.sin(wavePhase);
    const secondHarmonic = Math.sin(wavePhase * 2 - 0.48) * steepness * 0.16;
    const thirdHarmonic = Math.sin(wavePhase * 3 + 0.73) * steepness * steepness * 0.032;
    const crestShape = (Math.max(fundamental, 0) ** 2 - 0.25) * steepness * 0.09;
    return fundamental + secondHarmonic + thirdHarmonic + crestShape;
  }

  function bassSurgeWeight(seconds, bassAmount, packet) {
    const randomEnvelope = Math.sin(seconds * packet.gateRate + packet.gatePhase) * 0.5 + 0.5;
    const activationThreshold = 0.62 - bassAmount * 0.34;
    const activation = smoothstep01((randomEnvelope - activationThreshold) / 0.38);
    const directionFloor = 0.08 + bassAmount * 0.12;
    return mixNumber(directionFloor, 1, activation);
  }

  function sampledBassSurgePacket(x, z, seconds, packet) {
    const projected = x * packet.x + z * packet.z;
    const cross = -x * packet.z + z * packet.x;
    const warp = Math.sin(cross * packet.warpFrequency + seconds * packet.warpSpeed + packet.phase) * 0.58;
    const largePhase = projected * packet.frequency - seconds * packet.speed + packet.phase + warp;
    const large = Math.sin(largePhase);
    const medium = Math.sin(projected * packet.frequency * 1.78 - seconds * packet.speed * 1.46 + packet.phase * 1.73 - warp * 0.52) * 0.31;
    const crest = (Math.max(large, 0) ** 2 - 0.25) * 0.14;
    return large + medium + crest;
  }

  function sampleBassSurgeState(seconds, bass) {
    const bassAmount = clamp(Number(bass) || 0, 0, 1);
    const weights = BASS_SURGE_PACKETS.map((packet) => bassSurgeWeight(seconds, bassAmount, packet));
    let dominantDirection = 0;
    for (let index = 1; index < weights.length; index += 1) {
      if (weights[index] > weights[dominantDirection]) dominantDirection = index;
    }
    return {
      weights,
      activeDirectionCount: weights.filter((weight) => weight >= 0.45).length,
      dominantDirection,
      directions: BASS_SURGE_PACKETS.map((packet) => [packet.x, packet.z])
    };
  }

  function sampleOmnidirectionalBassWaveHeight(x, z, seconds, bass, config = {}, thunderstormIntensity) {
    const bassInput = clamp(Number(bass) || 0, 0, 1);
    if (bassInput <= 0) return 0;
    let packetHeight = 0;
    let packetEnergy = 0;
    BASS_SURGE_PACKETS.forEach((packet) => {
      const weight = bassSurgeWeight(seconds, bassInput, packet);
      packetHeight += sampledBassSurgePacket(x, z, seconds, packet) * weight;
      packetEnergy += weight * weight;
    });
    const normalizedPacketHeight = packetHeight / Math.max(Math.sqrt(packetEnergy), 0.5);
    const amplitudeResponse = Math.pow(bassInput, 0.78) * (0.72 + bassInput * 0.68);
    const surgeGain = clamp(Number(config.randomSurgeBassGain) || 1.12, 0.45, 1.6);
    const thunderstormGain = thunderstormWaveMultiplier(config, thunderstormIntensity);
    const bassWaveHeight = clamp((Number(config.bassWaveHeight) || 2.8) * surgeGain * thunderstormGain, 0.35, 9.5);
    return normalizedPacketHeight * amplitudeResponse * bassWaveHeight;
  }

  function sampleWaveHeight(x, z, seconds, lowFrequencyAmplitude, config = {}, thunderstormIntensityOverride) {
    const longDirection = normalizedDirection(-0.34, 0.94);
    const crossDirection = normalizedDirection(0.62, 0.78);
    const gustDirection = normalizedDirection(0.18, 0.98);
    const longWarp = Math.sin((x * longDirection[0] + z * longDirection[1]) * 0.029 + seconds * 0.11);
    const crossWarp = Math.sin((x * crossDirection[0] + z * crossDirection[1]) * 0.047 - seconds * 0.16 + 2.1);
    const warpedX = x + longWarp * 1.9 + crossWarp * 0.72;
    const warpedZ = z + crossWarp * 1.45 - longWarp * 0.54;
    const gustEnvelope = 0.86 + 0.14 * Math.sin(
      (x * gustDirection[0] + z * gustDirection[1]) * 0.021 - seconds * 0.08 + longWarp * 0.72
    );

    let swell = sampledStormWave(warpedX, warpedZ, 0.94, 0.34, 0.092, 0.39, 0, 0.72, seconds);
    swell += sampledStormWave(warpedX, warpedZ, 0.98, 0.19, 0.148, 0.51, 1.7, 0.58, seconds) * 0.44;
    swell += sampledStormWave(warpedX, warpedZ, 0.84, 0.54, 0.214, 0.63, 4.6, 0.48, seconds) * 0.2;
    swell += sampledStormWave(warpedX, warpedZ, -0.2, 1, 0.116, -0.31, 2.8, 0.24, seconds) * 0.1;

    const windX = mixNumber(x, warpedX, 0.46);
    const windZ = mixNumber(z, warpedZ, 0.46);
    let windSea = sampledStormWave(windX, windZ, 0.96, 0.29, 0.43, 0.89, 3.2, 0.44, seconds);
    windSea += sampledStormWave(windX, windZ, 0.89, 0.46, 0.72, 1.17, 0.8, 0.38, seconds) * 0.43;
    windSea += sampledStormWave(windX, windZ, 0.99, 0.11, 1.08, 1.46, 5.4, 0.31, seconds) * 0.19;

    let capillary = sampledStormWave(x, z, 0.93, 0.37, 1.74, 1.82, 2.4, 0.2, seconds);
    capillary += sampledStormWave(x, z, 0.98, 0.22, 2.62, 2.18, 3.8, 0.16, seconds) * 0.42;
    capillary += sampledStormWave(x, z, 0.78, 0.63, 3.86, 2.55, 2.2, 0.12, seconds) * 0.2;

    const thunderstormIntensity = clamp(
      Number.isFinite(Number(thunderstormIntensityOverride))
        ? Number(thunderstormIntensityOverride)
        : Number(config.thunderstormIntensity) || 0,
      0,
      1
    );
    const thunderstormGain = thunderstormWaveMultiplier(config, thunderstormIntensity);
    const amplitude = clamp(Number(config.idleWaveHeight) || 0.46, 0.08, 2.4)
      + clamp(Number(config.bassWaveHeight) || 2.8, 0, 7.2) * clamp(Number(lowFrequencyAmplitude) || 0, 0, 1) * 0.42 * thunderstormGain;
    return (swell * 0.53 + windSea * 0.25 * gustEnvelope + capillary * 0.026) * amplitude
      + sampleOmnidirectionalBassWaveHeight(x, z, seconds, lowFrequencyAmplitude, config, thunderstormIntensity);
  }

  function sampleWaveFrame(x, z, seconds, lowFrequencyAmplitude, config = {}, sampleStep = 0.8, thunderstormIntensity) {
    const step = clamp(Number(sampleStep) || 0.8, 0.18, 4);
    const height = sampleWaveHeight(x, z, seconds, lowFrequencyAmplitude, config, thunderstormIntensity);
    const left = sampleWaveHeight(x - step, z, seconds, lowFrequencyAmplitude, config, thunderstormIntensity);
    const right = sampleWaveHeight(x + step, z, seconds, lowFrequencyAmplitude, config, thunderstormIntensity);
    const down = sampleWaveHeight(x, z - step, seconds, lowFrequencyAmplitude, config, thunderstormIntensity);
    const up = sampleWaveHeight(x, z + step, seconds, lowFrequencyAmplitude, config, thunderstormIntensity);
    return {
      height,
      slopeX: (right - left) / (step * 2),
      slopeZ: (up - down) / (step * 2)
    };
  }

  const lightingLooks = Object.freeze({
    day: Object.freeze({
      zenith: [0.085, 0.155, 0.22],
      horizon: [0.33, 0.44, 0.5],
      sun: [0.96, 0.95, 0.88],
      highlight: [0.76, 0.86, 0.9],
      ambient: 0.88,
      exposure: 1.06
    }),
    sunset: Object.freeze({
      zenith: [0.025, 0.052, 0.093],
      horizon: [0.45, 0.2, 0.09],
      sun: [1.0, 0.58, 0.3],
      highlight: [0.93, 0.58, 0.31],
      ambient: 0.6,
      exposure: 0.98
    }),
    evening: Object.freeze({
      zenith: [0.012, 0.025, 0.055],
      horizon: [0.11, 0.085, 0.14],
      sun: [0.43, 0.34, 0.44],
      highlight: [0.39, 0.48, 0.65],
      ambient: 0.42,
      exposure: 0.94
    })
  });

  function mixLightingLook(start, end, amount) {
    const eased = smoothstep01(amount);
    return {
      zenith: mixTriplet(start.zenith, end.zenith, eased),
      horizon: mixTriplet(start.horizon, end.horizon, eased),
      sun: mixTriplet(start.sun, end.sun, eased),
      highlight: mixTriplet(start.highlight, end.highlight, eased),
      ambient: mixNumber(start.ambient, end.ambient, eased),
      exposure: mixNumber(start.exposure, end.exposure, eased)
    };
  }

  function mixLightingState(start, end, amount) {
    const eased = smoothstep01(amount);
    const sunDirection = mixTriplet(start.sunDirection, end.sunDirection, eased);
    const directionLength = Math.hypot(...sunDirection) || 1;
    return {
      phase: eased < 0.5 ? start.phase : end.phase,
      elapsedMinute: mixNumber(start.elapsedMinute, end.elapsedMinute, eased),
      progress: mixNumber(start.progress, end.progress, eased),
      sunDirection: sunDirection.map((value) => value / directionLength),
      zenith: mixTriplet(start.zenith, end.zenith, eased),
      horizon: mixTriplet(start.horizon, end.horizon, eased),
      sun: mixTriplet(start.sun, end.sun, eased),
      highlight: mixTriplet(start.highlight, end.highlight, eased),
      ambient: mixNumber(start.ambient, end.ambient, eased),
      exposure: mixNumber(start.exposure, end.exposure, eased)
    };
  }

  function lightingAtMinute(minute, config = {}) {
    const duration = clamp(Number(config.lightingCycleMinutes) || 30, 6, 180);
    const elapsedMinute = clamp(Number(minute) || 0, 0, duration);
    const firstBoundary = duration / 3;
    const secondBoundary = duration * 2 / 3;
    const crossfadeMinutes = clamp((Number(config.lightingCrossfadeSeconds) || 90) / 60, 0.25, duration / 5);
    const halfCrossfade = crossfadeMinutes / 2;
    let phase = 'day';
    let look = lightingLooks.day;

    if (elapsedMinute >= secondBoundary) phase = 'evening';
    else if (elapsedMinute >= firstBoundary) phase = 'sunset';

    if (elapsedMinute >= firstBoundary - halfCrossfade && elapsedMinute <= firstBoundary + halfCrossfade) {
      look = mixLightingLook(
        lightingLooks.day,
        lightingLooks.sunset,
        (elapsedMinute - firstBoundary + halfCrossfade) / crossfadeMinutes
      );
    } else if (elapsedMinute > firstBoundary + halfCrossfade && elapsedMinute < secondBoundary - halfCrossfade) {
      look = lightingLooks.sunset;
    } else if (elapsedMinute >= secondBoundary - halfCrossfade && elapsedMinute <= secondBoundary + halfCrossfade) {
      look = mixLightingLook(
        lightingLooks.sunset,
        lightingLooks.evening,
        (elapsedMinute - secondBoundary + halfCrossfade) / crossfadeMinutes
      );
    } else if (elapsedMinute > secondBoundary + halfCrossfade) {
      look = lightingLooks.evening;
    }

    const progress = elapsedMinute / duration;
    const solarEase = smoothstep01(progress);
    const elevation = mixNumber(0.68, 0.035, solarEase);
    const azimuth = mixNumber(-0.82, -0.25, progress);
    const sunDirection = [Math.cos(azimuth), elevation, Math.sin(azimuth)];
    const length = Math.hypot(...sunDirection) || 1;
    const configuredDayExposure = clamp(Number(config.exposure) || lightingLooks.day.exposure, 0.78, 1.2);
    const exposureScale = configuredDayExposure / lightingLooks.day.exposure;
    return {
      phase,
      elapsedMinute,
      progress,
      sunDirection: sunDirection.map((value) => value / length),
      zenith: [...look.zenith],
      horizon: [...look.horizon],
      sun: [...look.sun],
      highlight: [...look.highlight],
      ambient: look.ambient,
      exposure: look.exposure * exposureScale
    };
  }

  function lightingForMode(mode, config = {}) {
    const duration = clamp(Number(config.lightingCycleMinutes) || 30, 6, 180);
    if (mode === 'sunset') return lightingAtMinute(duration * 0.5, config);
    if (mode === 'evening') return lightingAtMinute(duration, config);
    return lightingAtMinute(0, config);
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function random() {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function seedFromText(value) {
    const text = String(value || 'storm-ocean-horizon-v1');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function lightingAtElapsedMinute(minute, config = {}) {
    const duration = clamp(Number(config.lightingCycleMinutes) || 30, 6, 180);
    const elapsedMinute = Math.max(0, Number(minute) || 0);
    const looping = config.lightingLoop === true;
    const cycleIndex = looping ? Math.floor(elapsedMinute / duration) : 0;
    const cycleMinute = looping
      ? elapsedMinute - cycleIndex * duration
      : Math.min(elapsedMinute, duration);
    return {
      ...lightingAtMinute(cycleMinute, config),
      elapsedMinute,
      cycleMinute,
      cycleIndex
    };
  }

  function thunderstormAtMinute(minute, config = {}) {
    const settings = config.thunderstorm || {};
    const schedule = settings.schedule || {};
    const cycleMinutes = clamp(
      Number(schedule.cycleMinutes) || Number(config.lightingCycleMinutes) || 30,
      6,
      180
    );
    const elapsedMinute = Math.max(0, Number(minute) || 0);
    const cycleIndex = Math.floor(elapsedMinute / cycleMinutes);
    const cycleMinute = elapsedMinute - cycleIndex * cycleMinutes;
    const modulo = clamp(Math.floor(Number(schedule.eligibleCycleModulo) || 3), 2, 12);
    const remainder = clamp(Math.floor(Number(schedule.eligibleCycleRemainder) || 2), 0, modulo - 1);
    const eligible = settings.enabled !== false && cycleIndex >= 2 && cycleIndex % modulo === remainder;
    const cycleSeed = (seedFromText(schedule.seed) ^ Math.imul(cycleIndex + 1, 0x9e3779b1)) >>> 0;
    const random = seededRandom(cycleSeed);
    const chance = clamp(Number(schedule.chance) || 0.55, 0.05, 0.95);
    const occurs = eligible && random() < chance;
    const durationRange = Array.isArray(schedule.durationMinutes) ? schedule.durationMinutes : [4, 9];
    const minimumDuration = clamp(Number(durationRange[0]) || 4, 1.5, cycleMinutes * 0.45);
    const maximumDuration = clamp(Number(durationRange[1]) || 9, minimumDuration, cycleMinutes * 0.62);
    const durationMinutes = mixNumber(minimumDuration, maximumDuration, random());
    const latestStart = Math.max(3, cycleMinutes - durationMinutes - 2);
    const startMinute = mixNumber(3, Math.min(18, latestStart), random());
    const endMinute = startMinute + durationMinutes;
    return {
      active: occurs && cycleMinute >= startMinute && cycleMinute < endMinute,
      eligible,
      occurs,
      cycleIndex,
      cycleMinute,
      startMinute,
      endMinute,
      durationMinutes
    };
  }

  function lightningStrikeAtIndex(index, config = {}) {
    const settings = config.thunderstorm || {};
    const lightning = settings.lightning || {};
    const schedule = settings.schedule || {};
    const strikeIndex = Math.max(0, Math.floor(Number(index) || 0));
    const strikeSeed = (seedFromText(lightning.seed || schedule.seed) ^ Math.imul(strikeIndex + 1, 0x85ebca6b)) >>> 0;
    const random = seededRandom(strikeSeed);
    const interval = Array.isArray(lightning.intervalSeconds) ? lightning.intervalSeconds : [2.2, 7.5];
    return {
      index: strikeIndex,
      target: [mixNumber(-138, 138, random()), mixNumber(-288, -68, random())],
      seed: random(),
      intervalSeconds: mixNumber(
        clamp(Number(interval[0]) || 2.2, 0.8, 12),
        clamp(Number(interval[1]) || 7.5, 1.2, 18),
        random()
      )
    };
  }

  function sunsetSeagullFlightAtSecond(second, phase = 'sunset', config = {}) {
    const settings = config.sunsetSeagulls || {};
    const elapsedSecond = Math.max(0, Number(second) || 0);
    if (settings.enabled === false || phase !== 'sunset') {
      return {
        active: false,
        phaseEligible: false,
        state: 'hidden-phase',
        intensity: 0,
        phase,
        windowIndex: -1,
        localSeconds: 0,
        durationSeconds: 0,
        progress: 0,
        direction: 1,
        nextInSeconds: Number.POSITIVE_INFINITY
      };
    }
    const flightRange = Array.isArray(settings.flightWindowSeconds) ? settings.flightWindowSeconds : [18, 27];
    const gapRange = Array.isArray(settings.gapSeconds) ? settings.gapSeconds : [42, 76];
    const minimumFlight = clamp(Number(flightRange[0]) || 18, 10, 45);
    const maximumFlight = clamp(Number(flightRange[1]) || 27, minimumFlight, 55);
    const minimumGap = clamp(Number(gapRange[0]) || 42, 18, 150);
    const maximumGap = clamp(Number(gapRange[1]) || 76, minimumGap, 180);
    const leadInSeconds = clamp(Number(settings.leadInSeconds) || 7, 2, 30);
    const fadeSeconds = clamp(Number(settings.fadeSeconds) || 1.8, 0.8, 4);
    const sequenceSeconds = clamp(Number(settings.sequenceSeconds) || 900, 240, 3600);
    const sequenceSecond = elapsedSecond < leadInSeconds
      ? elapsedSecond
      : leadInSeconds + ((elapsedSecond - leadInSeconds) % sequenceSeconds);
    let cursor = leadInSeconds;
    for (let windowIndex = 0; windowIndex < 64 && cursor <= leadInSeconds + sequenceSeconds; windowIndex += 1) {
      const random = seededRandom((seedFromText(settings.seed || 'storm-ocean-sunset-seagulls-v1')
        ^ Math.imul(windowIndex + 1, 0x9e3779b1)) >>> 0);
      const durationSeconds = mixNumber(minimumFlight, maximumFlight, random());
      const gapSeconds = mixNumber(minimumGap, maximumGap, random());
      const direction = random() < 0.5 ? -1 : 1;
      if (sequenceSecond >= cursor && sequenceSecond < cursor + durationSeconds) {
        const localSeconds = sequenceSecond - cursor;
        return {
          active: true,
          phaseEligible: true,
          state: 'visible',
          intensity: smoothstep01(localSeconds / fadeSeconds)
            * smoothstep01((durationSeconds - localSeconds) / fadeSeconds),
          phase,
          windowIndex,
          localSeconds,
          durationSeconds,
          progress: clamp(localSeconds / Math.max(durationSeconds, 0.001), 0, 1),
          direction,
          nextInSeconds: 0
        };
      }
      if (sequenceSecond < cursor) {
        return {
          active: false,
          phaseEligible: true,
          state: 'gap',
          intensity: 0,
          phase,
          windowIndex,
          localSeconds: 0,
          durationSeconds,
          progress: 0,
          direction,
          nextInSeconds: cursor - sequenceSecond
        };
      }
      cursor += durationSeconds + gapSeconds;
    }
    return {
      active: false,
      phaseEligible: true,
      state: 'gap',
      intensity: 0,
      phase,
      windowIndex: -1,
      localSeconds: 0,
      durationSeconds: 0,
      progress: 0,
      direction: 1,
      nextInSeconds: Math.max(0, leadInSeconds + sequenceSeconds - sequenceSecond)
    };
  }

  function seagullPosePosition(birdIndex, flightSeconds, durationSeconds, direction, config = {}) {
    const settings = config.sunsetSeagulls || {};
    const count = clamp(Math.floor(Number(settings.count) || 10), 6, 14);
    const progress = clamp(flightSeconds / Math.max(durationSeconds, 0.001), 0, 1);
    const random = seededRandom((seedFromText(settings.seed || 'storm-ocean-sunset-seagulls-v1')
      ^ Math.imul(birdIndex + 1, 0x85ebca6b)) >>> 0);
    const phaseA = random() * Math.PI * 2;
    const phaseB = random() * Math.PI * 2;
    const phaseC = random() * Math.PI * 2;
    const pairRank = birdIndex === 0 ? 0 : Math.ceil(birdIndex / 2);
    const side = birdIndex === 0 ? 0 : birdIndex % 2 === 0 ? 1 : -1;
    const leaderOffset = pairRank * 7.2 + random() * 3.8;
    const lateralOffset = side * (pairRank * 6.1 + random() * 2.8);
    const altitudeRange = Array.isArray(settings.altitude) ? settings.altitude : [35, 52];
    const minimumAltitude = clamp(Number(altitudeRange[0]) || 35, 24, 70);
    const maximumAltitude = clamp(Number(altitudeRange[1]) || 52, minimumAltitude, 84);
    const centerAltitude = mixNumber(minimumAltitude, maximumAltitude, 0.58);
    const depthRange = Array.isArray(settings.depth) ? settings.depth : [-210, -150];
    const minimumDepth = clamp(Number(depthRange[0]) || -210, -280, -105);
    const maximumDepth = clamp(Number(depthRange[1]) || -150, minimumDepth, -90);
    const centerDepth = mixNumber(minimumDepth, maximumDepth, 0.48);
    const span = clamp(Number(settings.flightSpan) || 310, 220, 420);
    const flightSpeedTime = flightSeconds + birdIndex * 0.037;
    const baseX = mixNumber(-span * 0.58, span * 0.58, direction > 0 ? progress : 1 - progress);
    const flockBreath = Math.sin(flightSeconds * 0.31 + phaseA) * 2.4;
    const fineDrift = Math.sin(flightSeconds * 0.73 + phaseB) * 0.72;
    return [
      baseX - direction * leaderOffset + Math.sin(flightSpeedTime * 0.27 + phaseB) * 2.2,
      centerAltitude + pairRank * 0.48 + side * pairRank * 0.42 + Math.sin(flightSpeedTime * 0.47 + phaseA) * 1.5
        + Math.sin(flightSpeedTime * 1.19 + phaseC) * 0.24,
      centerDepth + lateralOffset + flockBreath + fineDrift
    ];
  }

  function sampleSunsetSeagullPose(birdIndex, flightSeconds, durationSeconds, direction = 1, config = {}) {
    const settings = config.sunsetSeagulls || {};
    const index = Math.max(0, Math.floor(Number(birdIndex) || 0));
    const seconds = Math.max(0, Number(flightSeconds) || 0);
    const duration = Math.max(0.001, Number(durationSeconds) || 22);
    const normalizedDirection = direction < 0 ? -1 : 1;
    const random = seededRandom((seedFromText(settings.seed || 'storm-ocean-sunset-seagulls-v1')
      ^ Math.imul(index + 1, 0xc2b2ae35)) >>> 0);
    const phaseA = random() * Math.PI * 2;
    const phaseB = random() * Math.PI * 2;
    const wingRate = mixNumber(4.7, 6.15, random());
    const glideWave = Math.sin(seconds * mixNumber(0.34, 0.48, random()) + phaseB) * 0.5 + 0.5;
    const glideAmount = smoothstep01((glideWave - 0.46) / 0.38);
    const flapAmount = 1 - glideAmount * 0.88;
    const wingAngle = -0.04 + Math.sin(seconds * wingRate + phaseA) * 0.54 * flapAmount
      + Math.sin(seconds * 0.68 + phaseB) * 0.055;
    const position = seagullPosePosition(index, seconds, duration, normalizedDirection, config);
    const nextPosition = seagullPosePosition(index, seconds + 1 / 60, duration, normalizedDirection, config);
    const velocity = nextPosition.map((value, axis) => (value - position[axis]) * 60);
    const turnSignal = Math.sin(seconds * 0.31 + phaseA) * 0.64 + Math.sin(seconds * 0.73 + phaseB) * 0.36;
    const bank = clamp(-turnSignal * 0.16 - velocity[1] * 0.012, -0.28, 0.28);
    const progress = clamp(seconds / duration, 0, 1);
    const edgeFade = smoothstep01(progress / 0.075) * smoothstep01((1 - progress) / 0.075);
    return {
      position,
      velocity,
      wingAngle,
      glideAmount,
      flightMode: glideAmount > 0.58 ? 'glide' : 'flap',
      bank,
      edgeFade,
      progress
    };
  }

  function buildEnvironmentFace(index) {
    const size = ANDROID_CLIENT ? (LOW_END_ANDROID ? 256 : 512) : 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const random = seededRandom(9173 + index * 7919);
    const gradient = context.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, index === 2 ? '#52616a' : '#263640');
    gradient.addColorStop(0.42, '#17252d');
    gradient.addColorStop(0.72, index === 3 ? '#03070a' : '#0a161c');
    gradient.addColorStop(1, '#02070a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    context.globalCompositeOperation = 'screen';
    const cloudLayers = ANDROID_CLIENT ? (LOW_END_ANDROID ? 12 : 20) : 30;
    for (let layer = 0; layer < cloudLayers; layer += 1) {
      const x = (random() * 1.5 - 0.25) * size;
      const y = (-0.04 + random() * 0.66) * size;
      const width = (0.3 + random() * 0.52) * size;
      const height = (0.09 + random() * 0.16) * size;
      const alpha = 0.045 + random() * 0.075;
      const cloud = context.createRadialGradient(x, y, 0, x, y, width * 0.58);
      cloud.addColorStop(0, `rgba(164, 180, 186, ${alpha})`);
      cloud.addColorStop(0.5, `rgba(66, 82, 91, ${alpha * 0.72})`);
      cloud.addColorStop(1, 'rgba(10, 18, 24, 0)');
      context.save();
      context.translate(x, y);
      context.scale(1, height / Math.max(width, 1));
      context.translate(-x, -y);
      context.fillStyle = cloud;
      context.fillRect(x - width, y - width, width * 2, width * 2);
      context.restore();
    }

    const horizon = context.createLinearGradient(0, size * 0.56, 0, size * 0.9);
    horizon.addColorStop(0, 'rgba(122, 161, 181, 0)');
    horizon.addColorStop(0.42, index === 4 ? 'rgba(184, 204, 211, 0.28)' : 'rgba(116, 143, 154, 0.16)');
    horizon.addColorStop(1, 'rgba(4, 13, 18, 0)');
    context.fillStyle = horizon;
    context.fillRect(0, size * 0.52, size, size * 0.4);
    context.globalCompositeOperation = 'source-over';
    return canvas;
  }

  function environmentMap(THREE) {
    if (cachedEnvironment) return cachedEnvironment;
    const texture = new THREE.CubeTexture(Array.from({ length: 6 }, (_, index) => buildEnvironmentFace(index)));
    if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    texture.name = `StormOceanEnvironment${ANDROID_CLIENT ? (LOW_END_ANDROID ? 256 : 512) : 1024}`;
    texture.needsUpdate = true;
    cachedEnvironment = texture;
    return texture;
  }

  function configureWaterTexture(texture, THREE, anisotropy, tileCount, mapType) {
    if (!texture) return texture;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat?.set?.(tileCount / 4.35, tileCount / 6.9);
    texture.flipY = false;
    texture.unpackAlignment = 1;
    if (mapType === 'normal' && THREE.RGBFormat) texture.format = THREE.RGBFormat;
    if (mapType === 'roughness' && THREE.LuminanceFormat) texture.format = THREE.LuminanceFormat;
    texture.anisotropy = Math.min(16, Math.max(1, Number(anisotropy) || 16));
    if (THREE.LinearMipmapLinearFilter) texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (THREE.LinearFilter) texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  function textureCapability(config = {}) {
    const configuredMaximum = Number(config.maxTextureSize) || 0;
    if (!cachedTextureCapability) {
      let maximumTextureSize = 0;
      let rendererName = '';
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const attributes = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
        const context = canvas.getContext('webgl2', attributes) || canvas.getContext('webgl', attributes);
        if (context) {
          maximumTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE)) || 0;
          const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) rendererName = String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
          context.getExtension('WEBGL_lose_context')?.loseContext?.();
        }
      }
      cachedTextureCapability = { maximumTextureSize, rendererName };
    }
    const maximumTextureSize = configuredMaximum || cachedTextureCapability.maximumTextureSize || 4096;
    const deviceMemory = Number(global.navigator?.deviceMemory) || 0;
    const minimumMemory = Math.max(4, Number(config.waterTextureMinDeviceMemoryGB) || 8);
    const softwareRenderer = /swiftshader|llvmpipe|software/i.test(cachedTextureCapability.rendererName);
    return {
      maximumTextureSize,
      deviceMemory,
      use8K: maximumTextureSize >= 8192 && (deviceMemory === 0 || deviceMemory >= minimumMemory) && !softwareRenderer,
      rendererName: cachedTextureCapability.rendererName
    };
  }

  function waterTextureSet(THREE, config = {}) {
    if (cachedWaterTextureSet) return cachedWaterTextureSet;
    if (!THREE?.TextureLoader || typeof document === 'undefined') return null;
    const root = new URL('assets/storm-ocean/', document.baseURI).href;
    const loader = new THREE.TextureLoader();
    const anisotropy = ANDROID_CLIENT
      ? Math.min(LOW_END_ANDROID ? 4 : 8, Number(config.maxAnisotropy) || 16)
      : Number(config.maxAnisotropy) || 16;
    const tileCount = clamp(Number(config.waterTextureTiles) || 6.5, 4, 10);
    const fallbackNormalUrl = `${root}water-normal-spectral-4k.png?v=20260713-2`;
    const fallbackRoughnessUrl = `${root}water-roughness-spectral-4k.png?v=20260713-2`;
    const requestedResolution = Number(config.waterTextureResolution) || 4096;
    const capability = textureCapability(config);
    const use8K = !ANDROID_CLIENT && requestedResolution >= 8192 && capability.use8K;
    const configuredNormalUrl = new URL(String(config.normalMapUrl || fallbackNormalUrl), document.baseURI).href;
    const configuredRoughnessUrl = new URL(String(config.roughnessMapUrl || fallbackRoughnessUrl), document.baseURI).href;
    const normalUrl = use8K ? configuredNormalUrl : fallbackNormalUrl;
    const roughnessUrl = use8K ? configuredRoughnessUrl : fallbackRoughnessUrl;
    const textureState = {
      resolution: use8K ? 8192 : 4096,
      requestedResolution,
      maximumTextureSize: capability.maximumTextureSize,
      usingFallback: requestedResolution >= 8192 && !use8K,
      fallbackReason: requestedResolution >= 8192 && !use8K ? 'device-capability' : ''
    };
    const loadPortableTexture = (primaryUrl, fallbackUrl, mapType) => {
      let texture = null;
      texture = loader.load(primaryUrl, undefined, undefined, () => {
        if (primaryUrl === fallbackUrl) return;
        loader.load(fallbackUrl, (replacement) => {
          texture.image = replacement.image;
          texture.name = `StormOcean_Spectral${mapType === 'normal' ? 'Normal' : 'Roughness'}_4K`;
          texture.needsUpdate = true;
          textureState.resolution = 4096;
          textureState.usingFallback = true;
          textureState.fallbackReason = '8k-load-failed';
        });
      });
      return configureWaterTexture(texture, THREE, anisotropy, tileCount, mapType);
    };
    const normalMap = loadPortableTexture(normalUrl, fallbackNormalUrl, 'normal');
    const roughnessMap = loadPortableTexture(roughnessUrl, fallbackRoughnessUrl, 'roughness');
    normalMap.name = `StormOcean_SpectralNormal_${use8K ? '8K' : '4K'}`;
    roughnessMap.name = `StormOcean_SpectralRoughness_${use8K ? '8K' : '4K'}`;
    cachedWaterTextureSet = { normalMap, roughnessMap, textureState };
    return cachedWaterTextureSet;
  }

  function createSeagullWingGeometry(THREE, side) {
    const direction = side < 0 ? -1 : 1;
    const points = [
      [0.04 * direction, 0.03, 0.34],
      [0.88 * direction, 0.12, 0.22],
      [1.82 * direction, 0.18, -0.02],
      [3.18 * direction, 0.055, -0.58],
      [2.46 * direction, -0.035, -0.96],
      [1.28 * direction, -0.045, -0.63],
      [0.08 * direction, -0.02, -0.42]
    ];
    const positions = new Float32Array(points.flat());
    const base = new THREE.Color(0xc9c8c0);
    const middle = new THREE.Color(0xa9aaab);
    const tip = new THREE.Color(0x34383d);
    const vertexColors = [base, base, middle, tip, tip, middle, base];
    const colors = new Float32Array(vertexColors.flatMap((color) => [color.r, color.g, color.b]));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex([0, 1, 6, 1, 5, 6, 1, 2, 5, 2, 4, 5, 2, 3, 4]);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createSeagullTailGeometry(THREE) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.46, 0.01, -0.82,
      -0.88, 0.02, -1.72,
      -0.12, 0.0, -1.34,
      0.46, 0.01, -0.82,
      0.88, 0.02, -1.72,
      0.12, 0.0, -1.34
    ]), 3));
    geometry.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 3, 2, 5, 3]);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createSunsetSeagullFlock(THREE, config = {}) {
    if (!THREE?.InstancedMesh || !THREE?.Object3D || !THREE?.Matrix4) return null;
    const settings = config.sunsetSeagulls || {};
    if (settings.enabled === false) return null;
    const count = clamp(Math.floor(Number(settings.count) || 10), 6, 14);
    const group = new THREE.Group();
    group.name = 'StormSunsetSeagullFlock';
    group.visible = false;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      name: 'StormSeagull_FeatherBody',
      color: 0xd5d2c7,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const wingMaterial = new THREE.MeshStandardMaterial({
      name: 'StormSeagull_FeatherWing',
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const beakMaterial = new THREE.MeshStandardMaterial({
      name: 'StormSeagull_Beak',
      color: 0xb48a4f,
      roughness: 0.72,
      metalness: 0
    });

    const makeInstances = (name, geometry, material) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.instanceMatrix?.setUsage?.(THREE.DynamicDrawUsage);
      group.add(mesh);
      return mesh;
    };

    const parts = [
      {
        key: 'body',
        mesh: makeInstances('StormSeagulls_Body', new THREE.SphereGeometry(1, 12, 8), bodyMaterial),
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [0.58, 0.4, 1.34]
      },
      {
        key: 'head',
        mesh: makeInstances('StormSeagulls_Head', new THREE.SphereGeometry(1, 10, 7), bodyMaterial),
        position: [0, 0.12, 1.27],
        rotation: [0, 0, 0],
        scale: [0.43, 0.4, 0.48]
      },
      {
        key: 'beak',
        mesh: makeInstances('StormSeagulls_Beak', new THREE.ConeGeometry(0.18, 0.72, 8), beakMaterial),
        position: [0, 0.07, 1.86],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, 1, 1]
      },
      {
        key: 'leftWing',
        mesh: makeInstances('StormSeagulls_LeftWing', createSeagullWingGeometry(THREE, 1), wingMaterial),
        position: [0, 0.08, 0.18],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        wingSide: 1
      },
      {
        key: 'rightWing',
        mesh: makeInstances('StormSeagulls_RightWing', createSeagullWingGeometry(THREE, -1), wingMaterial),
        position: [0, 0.08, 0.18],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        wingSide: -1
      },
      {
        key: 'tail',
        mesh: makeInstances('StormSeagulls_ForkedTail', createSeagullTailGeometry(THREE), bodyMaterial),
        position: [0, -0.01, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
    ];
    const scaleRandom = seededRandom(seedFromText(settings.seed || 'storm-ocean-sunset-seagulls-v1') ^ 0x7f4a7c15);
    return {
      group,
      parts,
      count,
      renderBatches: parts.length,
      visibility: 0,
      visibleCount: 0,
      phaseEligible: false,
      scheduleState: 'hidden-phase',
      activeSchedule: null,
      poseRevision: 0,
      poseChecksum: 0,
      poses: [],
      wingAngles: [],
      birdScales: Array.from({ length: count }, () => mixNumber(0.88, 1.12, scaleRandom())),
      birdObject: new THREE.Object3D(),
      partObject: new THREE.Object3D(),
      partMatrix: new THREE.Matrix4(),
      lookTarget: new THREE.Vector3(),
      worldScale: new THREE.Vector3(1, 1, 1)
    };
  }

  function setSeagullPreview(runtime, enabled) {
    if (!runtime) return false;
    runtime.seagullPreview = enabled === true;
    runtime.seagullPreviewStartedAt = Number(runtime.currentTime) || 0;
    return runtime.seagullPreview;
  }

  function updateSunsetSeagullFlock(runtime, seconds, phaseSeconds, phase, dt) {
    const flock = runtime?.seagullFlock;
    if (!flock) return;
    const previewElapsed = Math.max(0, seconds - (runtime.seagullPreviewStartedAt || seconds)) + 2.2;
    const schedule = runtime.seagullPreview
      ? {
        active: true,
        phaseEligible: true,
        state: 'visible',
        intensity: 1,
        phase: 'sunset',
        windowIndex: 999,
        localSeconds: previewElapsed,
        durationSeconds: 24,
        progress: clamp(previewElapsed / 24, 0, 1),
        direction: 1,
        nextInSeconds: 0
      }
      : sunsetSeagullFlightAtSecond(phaseSeconds, phase, runtime.config);
    const phaseEligible = phase === 'sunset';
    const weatherSafe = runtime.thunderstormIntensity < 0.15;
    const visibilityTarget = schedule.active && (runtime.seagullPreview || (phaseEligible && weatherSafe))
      ? clamp(Number(schedule.intensity) || 0, 0, 1)
      : 0;
    const visibilityRate = visibilityTarget > flock.visibility ? 2.1 : weatherSafe ? 1.8 : 3.2;
    flock.visibility += (visibilityTarget - flock.visibility) * (1 - Math.exp(-visibilityRate * dt));
    flock.visibility = clamp(flock.visibility, 0, 1);
    if (schedule.active) flock.activeSchedule = schedule;
    const activeSchedule = schedule.active ? schedule : flock.activeSchedule;
    const shouldRender = Boolean(activeSchedule && flock.visibility > 0.008);
    flock.group.visible = shouldRender;
    flock.phaseEligible = phaseEligible;
    flock.scheduleState = !phaseEligible && !runtime.seagullPreview
      ? 'hidden-phase'
      : !weatherSafe && !runtime.seagullPreview
        ? 'weather-avoidance'
        : schedule.active
          ? flock.visibility >= 0.96 ? 'visible' : 'fading-in'
          : flock.visibility > 0.008 ? 'fading-out' : 'gap';
    if (!shouldRender) {
      flock.visibleCount = 0;
      flock.parts.forEach(({ mesh }) => {
        mesh.count = 0;
      });
      return;
    }

    runtime.root.getWorldScale?.(flock.worldScale);
    const referenceScale = Math.max(Math.abs(flock.worldScale.y), 0.0001);
    const compensationX = referenceScale / Math.max(Math.abs(flock.worldScale.x), 0.0001);
    const compensationZ = referenceScale / Math.max(Math.abs(flock.worldScale.z), 0.0001);
    const birdObject = flock.birdObject;
    const partObject = flock.partObject;
    let poseChecksum = 0;
    flock.poses.length = 0;
    flock.wingAngles.length = 0;
    for (let birdIndex = 0; birdIndex < flock.count; birdIndex += 1) {
      const pose = sampleSunsetSeagullPose(
        birdIndex,
        activeSchedule.localSeconds,
        activeSchedule.durationSeconds,
        activeSchedule.direction,
        runtime.config
      );
      const birdScale = flock.birdScales[birdIndex] * 1.18
        * flock.visibility
        * Math.max(0.001, pose.edgeFade);
      birdObject.position.set(...pose.position);
      flock.lookTarget.set(
        pose.position[0] + pose.velocity[0],
        pose.position[1] + pose.velocity[1],
        pose.position[2] + pose.velocity[2]
      );
      birdObject.lookAt(flock.lookTarget);
      birdObject.rotateZ(pose.bank);
      birdObject.scale.setScalar(birdScale);
      birdObject.updateMatrix();
      flock.parts.forEach((part) => {
        partObject.position.set(...part.position);
        partObject.rotation.set(...part.rotation);
        if (part.wingSide) partObject.rotation.z = pose.wingAngle * part.wingSide;
        partObject.scale.set(
          part.scale[0] * compensationX,
          part.scale[1],
          part.scale[2] * compensationZ
        );
        partObject.updateMatrix();
        flock.partMatrix.multiplyMatrices(birdObject.matrix, partObject.matrix);
        part.mesh.setMatrixAt(birdIndex, flock.partMatrix);
      });
      if (birdIndex < 4) flock.poses.push(pose.position.map((value) => Number(value.toFixed(3))));
      flock.wingAngles.push(Number(pose.wingAngle.toFixed(4)));
      poseChecksum += pose.position[0] * 0.17 + pose.position[1] * 0.31 + pose.position[2] * 0.07
        + pose.wingAngle * 1.7 + pose.bank * 0.9;
    }
    flock.parts.forEach(({ mesh }) => {
      mesh.count = flock.count;
      mesh.instanceMatrix.needsUpdate = true;
    });
    flock.visibleCount = flock.count;
    flock.poseChecksum = poseChecksum;
    flock.poseRevision += 1;
  }

  function createStormSkyDome(THREE, uniforms, config) {
    const geometry = new THREE.SphereGeometry(1180, 48, 24);
    const material = new THREE.ShaderMaterial({
      name: 'StormSky_Procedural_Cumulonimbus',
      uniforms: {
        uStormTime: uniforms.time,
        uStormBass: uniforms.bass,
        uStormSunDirection: uniforms.sunDirection,
        uStormSunColor: uniforms.sunColor,
        uStormSkyZenithColor: uniforms.zenithColor,
        uStormHorizonColor: uniforms.horizonColor,
        uStormSkyHighlightColor: uniforms.highlightColor,
        uStormAmbientStrength: uniforms.ambient,
        uStormThunder: uniforms.thunder,
        uStormThunderFlow: uniforms.thunderFlow,
        uLightningFlash: uniforms.lightningFlash,
        uLightningTarget: uniforms.lightningTarget,
        uLightningSeed: uniforms.lightningSeed,
        uCloudSpeed: { value: clamp(Number(config.cloudSpeed) || 0.012, 0.004, 0.04) }
      },
      vertexShader: `
        varying vec3 vStormSkyDirection;

        void main() {
          vStormSkyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform float uStormTime;
        uniform float uStormBass;
        uniform float uCloudSpeed;
        uniform vec3 uStormSunDirection;
        uniform vec3 uStormSunColor;
        uniform vec3 uStormSkyZenithColor;
        uniform vec3 uStormHorizonColor;
        uniform vec3 uStormSkyHighlightColor;
        uniform float uStormAmbientStrength;
        uniform float uStormThunder;
        uniform float uStormThunderFlow;
        uniform float uLightningFlash;
        uniform vec2 uLightningTarget;
        uniform float uLightningSeed;
        varying vec3 vStormSkyDirection;

        float stormSkyHash(vec2 point) {
          vec3 value = fract(vec3(point.xyx) * 0.1031);
          value += dot(value, value.yzx + 33.33);
          return fract((value.x + value.y) * value.z);
        }

        float stormSkyNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 local = fract(point);
          local = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
          return mix(
            mix(stormSkyHash(cell), stormSkyHash(cell + vec2(1.0, 0.0)), local.x),
            mix(stormSkyHash(cell + vec2(0.0, 1.0)), stormSkyHash(cell + vec2(1.0, 1.0)), local.x),
            local.y
          );
        }

        float stormSkyFbm(vec2 point) {
          float value = 0.0;
          float amplitude = 0.51;
          float weight = 0.0;
          mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
          for (int octave = 0; octave < 7; octave++) {
            value += stormSkyNoise(point) * amplitude;
            weight += amplitude;
            point = rotation * point * 2.07 + vec2(7.13, 3.71);
            amplitude *= 0.485;
          }
          return value / max(weight, 0.001);
        }

        float stormSkyRidgedFbm(vec2 point) {
          float value = 0.0;
          float amplitude = 0.56;
          float weight = 0.0;
          mat2 rotation = mat2(0.86, -0.51, 0.51, 0.86);
          for (int octave = 0; octave < 6; octave++) {
            float ridge = 1.0 - abs(stormSkyNoise(point) * 2.0 - 1.0);
            value += ridge * ridge * amplitude;
            weight += amplitude;
            point = rotation * point * 2.12 + vec2(4.19, 8.73);
            amplitude *= 0.47;
          }
          return value / max(weight, 0.001);
        }

        float stormSkyBandLimitedSine(float phase) {
          float footprint = fwidth(phase);
          return sin(phase) * (1.0 - smoothstep(0.48, 1.72, footprint));
        }

        void main() {
          vec3 direction = normalize(vStormSkyDirection);
          float longitude = atan(direction.z, direction.x);
          float thunder = clamp(uStormThunder, 0.0, 1.0);
          float cloudTime = uStormTime * uCloudSpeed;
          vec2 cloudPoint = vec2(longitude * 2.65, direction.y * 5.8);
          vec2 baseDrift = vec2(cloudTime * 0.42, -cloudTime * 0.07);
          float convergenceCenter = -1.5707963;
          float convergenceDelta = atan(sin(longitude - convergenceCenter), cos(longitude - convergenceCenter));
          float convergenceSide = convergenceDelta / (abs(convergenceDelta) + 0.18);
          vec2 convergenceDrift = vec2(convergenceSide * uStormThunderFlow * 0.17, -uStormThunderFlow * 0.025);
          vec2 slowDrift = baseDrift + convergenceDrift * thunder * 0.82;
          vec2 domainWarp = vec2(
            stormSkyFbm(cloudPoint * 0.66 + slowDrift + 3.17),
            stormSkyFbm(cloudPoint * 0.66 - slowDrift.yx - 5.41)
          ) - 0.5;
          vec2 warpedPoint = cloudPoint + domainWarp * 1.18;

          float broad = stormSkyFbm(warpedPoint * 0.78 + slowDrift * 0.62);
          float billow = stormSkyRidgedFbm(warpedPoint * 1.92 - slowDrift * 0.84 + 4.8);
          float detail = stormSkyFbm(warpedPoint * 4.85 + slowDrift * 1.24 - 8.2);
          float microDetail = stormSkyRidgedFbm(warpedPoint * 11.8 - slowDrift * 1.7 + 17.6);
          vec2 finePoint = warpedPoint * 18.5 + slowDrift * 2.1 - 24.3;
          float fineFootprint = max(length(dFdx(finePoint)), length(dFdy(finePoint)));
          float fineFade = 1.0 - smoothstep(0.55, 1.25, fineFootprint);
          float fineDetail = mix(0.5, stormSkyNoise(finePoint), fineFade);
          float stormCloudWindShearA = stormSkyBandLimitedSine(
            dot(warpedPoint, normalize(vec2(0.982, 0.189))) * 12.4 + domainWarp.x * 1.7 - cloudTime * 2.08
          );
          float stormCloudWindShearB = stormSkyBandLimitedSine(
            dot(warpedPoint, normalize(vec2(0.91, 0.415))) * 21.6 - domainWarp.y * 1.15 - cloudTime * 2.72
          );
          float stormCloudAnvilBand = smoothstep(-0.04, 0.34, direction.y)
            * (1.0 - smoothstep(0.7, 0.94, direction.y));
          float stormCloudWindShearV2 = (stormCloudWindShearA * 0.64 + stormCloudWindShearB * 0.36)
            * stormCloudAnvilBand;
          float densityField = broad * 0.59 + billow * 0.24 + detail * 0.13;
          densityField += (microDetail - 0.5) * 0.075;
          densityField += (fineDetail - 0.5) * 0.035;
          densityField += stormCloudWindShearV2 * 0.024;
          float verticalCoverage = smoothstep(-0.32, 0.46, direction.y);
          densityField += verticalCoverage * 0.055;
          densityField += thunder * (0.085 + verticalCoverage * 0.045);
          float densityAa = max(fwidth(densityField) * 1.8, 0.004);
          float cloudDensity = smoothstep(0.425 - thunder * 0.055 - densityAa, 0.68 + densityAa, densityField);
          float cloudCore = smoothstep(0.54 - thunder * 0.038 - densityAa, 0.77 + densityAa, densityField);
          float cloudEdge = clamp(cloudDensity * (1.0 - cloudCore), 0.0, 1.0);

          vec3 lightDirection = normalize(uStormSunDirection);
          vec2 stormCloudLightSlopeV2 = normalize(vec2(lightDirection.x * 2.65, lightDirection.y * 5.8) + vec2(0.001));
          float stormCloudLightFrontV3 = stormSkyFbm(
            (warpedPoint + stormCloudLightSlopeV2 * 0.034) * 0.78 + slowDrift * 0.62
          );
          float stormCloudLightBackV3 = stormSkyFbm(
            (warpedPoint - stormCloudLightSlopeV2 * 0.034) * 0.78 + slowDrift * 0.62
          );
          float stormCloudReliefV2 = clamp(0.5 + (stormCloudLightBackV3 - stormCloudLightFrontV3) * 4.8, 0.0, 1.0);
          float lightGap = pow(max(dot(direction, lightDirection), 0.0), 18.0);
          lightGap *= 0.34 + (1.0 - cloudCore) * 0.72;
          float solarHalo = pow(max(dot(direction, lightDirection), 0.0), 8.0);
          float solarDisc = pow(max(dot(direction, lightDirection), 0.0), 420.0);
          float solarVisibility = 1.0 - cloudCore * 0.92;
          float horizonGlow = exp(-abs(direction.y + 0.062) * 9.2);
          horizonGlow *= 0.16 + (1.0 - cloudDensity) * 0.31;

          float skyHeight = smoothstep(-0.34, 0.58, direction.y);
          vec3 horizonColor = uStormHorizonColor;
          vec3 zenithColor = uStormSkyZenithColor;
          vec3 skyColor = mix(horizonColor, zenithColor, skyHeight);
          skyColor *= mix(1.0, 0.62, thunder);

          float underside = clamp(billow * 0.38 + detail * 0.21 + horizonGlow * 0.18, 0.0, 1.0);
          float silverLining = pow(cloudEdge, 1.35) * (0.28 + lightGap * 1.5);
          vec3 cloudDark = mix(zenithColor * 0.08, horizonColor * 0.07, 0.42);
          vec3 cloudMid = mix(zenithColor, horizonColor, 0.4) * (0.35 + uStormAmbientStrength * 0.34);
          vec3 cloudLit = uStormSkyHighlightColor * (0.29 + uStormAmbientStrength * 0.29);
          vec3 cloudColor = mix(cloudDark, cloudMid, underside);
          cloudColor += cloudLit * silverLining;
          cloudColor *= mix(0.82, 1.09, detail);
          cloudColor *= mix(0.94, 1.06, fineDetail);
          float stormCloudCavityV2 = smoothstep(0.54, 0.82, billow)
            * (1.0 - smoothstep(0.5, 0.84, detail));
          cloudColor *= mix(0.94, 1.045, clamp(stormCloudWindShearV2 * 0.5 + 0.5, 0.0, 1.0));
          cloudColor *= 1.0 - stormCloudCavityV2 * 0.075;
          cloudColor *= mix(0.91, 1.09, stormCloudReliefV2);
          cloudColor = mix(cloudColor, cloudColor * vec3(0.38, 0.34, 0.48), thunder * 0.72);

          float strikeLongitude = atan(uLightningTarget.y, uLightningTarget.x);
          float strikeDelta = atan(sin(longitude - strikeLongitude), cos(longitude - strikeLongitude));
          float lightningHeight = clamp((direction.y + 0.12) / 0.8, 0.0, 1.0);
          float lightningJagBroad = (stormSkyNoise(vec2(lightningHeight * 19.0, uLightningSeed * 37.0 + 4.3)) - 0.5)
            * mix(0.014, 0.052, lightningHeight);
          float lightningJagFine = (stormSkyNoise(vec2(lightningHeight * 61.0, uLightningSeed * 53.0 + 13.7)) - 0.5)
            * mix(0.008, 0.018, lightningHeight);
          float lightningJag = lightningJagBroad + lightningJagFine;
          float boltLongitude = strikeLongitude + lightningJag;
          float boltDistance = abs(atan(sin(longitude - boltLongitude), cos(longitude - boltLongitude)));
          float boltAa = max(fwidth(longitude) * 0.9, 0.00055);
          float boltHeightMask = smoothstep(-0.135, -0.065, direction.y)
            * (1.0 - smoothstep(0.58, 0.7, direction.y));
          float lightningBolt = (1.0 - smoothstep(boltAa * 0.35, boltAa * 1.6 + 0.00045, boltDistance)) * boltHeightMask;
          float lightningBoltGlow = (1.0 - smoothstep(boltAa * 1.4, boltAa * 8.0 + 0.004, boltDistance)) * boltHeightMask;
          float branchDirection = stormSkyNoise(vec2(uLightningSeed * 19.0, 8.7)) > 0.5 ? 1.0 : -1.0;
          float branchProgress = clamp((0.7 - lightningHeight) / 0.4, 0.0, 1.0);
          float branchOffset = branchDirection * branchProgress * (0.018 + branchProgress * 0.075);
          branchOffset += (stormSkyNoise(vec2(lightningHeight * 43.0, uLightningSeed * 29.0 + 2.1)) - 0.5) * 0.012;
          float branchDistance = abs(atan(
            sin(longitude - boltLongitude - branchOffset),
            cos(longitude - boltLongitude - branchOffset)
          ));
          float branchMask = smoothstep(0.24, 0.32, lightningHeight)
            * (1.0 - smoothstep(0.68, 0.73, lightningHeight));
          float lightningBranch = (1.0 - smoothstep(boltAa * 0.8, boltAa * 2.1 + 0.0008, branchDistance))
            * branchMask * 0.38;
          float secondaryBranchProgress = clamp((0.52 - lightningHeight) / 0.31, 0.0, 1.0);
          float secondaryBranchOffset = -branchDirection * secondaryBranchProgress
            * (0.012 + secondaryBranchProgress * 0.052);
          float secondaryBranchDistance = abs(atan(
            sin(longitude - boltLongitude - secondaryBranchOffset),
            cos(longitude - boltLongitude - secondaryBranchOffset)
          ));
          float secondaryBranchMask = smoothstep(0.13, 0.2, lightningHeight)
            * (1.0 - smoothstep(0.49, 0.54, lightningHeight));
          float lightningSecondaryBranch = (1.0 - smoothstep(
            boltAa,
            boltAa * 2.5 + 0.001,
            secondaryBranchDistance
          )) * secondaryBranchMask * 0.27;
          float internalGlow = (1.0 - smoothstep(0.028, 0.3, abs(strikeDelta)))
            * cloudCore * uLightningFlash;
          cloudColor += vec3(0.29, 0.075, 0.54) * internalGlow * (0.82 + detail * 0.48);

          vec3 finalColor = mix(skyColor, cloudColor, cloudDensity);
          float openSkyLight = lightGap * (1.0 - cloudCore * 0.84);
          finalColor += uStormSkyHighlightColor * openSkyLight * (0.35 + uStormAmbientStrength * 0.34);
          finalColor += uStormHorizonColor * horizonGlow * 0.22;
          finalColor += uStormSunColor * solarVisibility * (solarHalo * 0.065 + solarDisc * 0.92);
          finalColor += vec3(0.34, 0.12, 0.78) * lightningBoltGlow * uLightningFlash * 0.72;
          finalColor += vec3(0.88, 0.82, 1.0)
            * (lightningBolt + lightningBranch + lightningSecondaryBranch) * uLightningFlash
            * (0.9 + cloudDensity * 0.38);
          finalColor *= mix(0.965, 1.035, microDetail);
          finalColor *= 0.96 + uStormBass * 0.025;

          gl_FragColor = vec4(finalColor, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true
    });
    const sky = new THREE.Mesh(geometry, material);
    sky.name = 'StormSky_ProceduralDome';
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    return sky;
  }

  function createStormFoamOverlay(THREE, geometry, uniforms) {
    const material = new THREE.ShaderMaterial({
      name: 'StormOcean_Procedural_FoamOverlay',
      uniforms: {
        uStormTime: uniforms.time,
        uStormBass: uniforms.bass,
        uStormIdleHeight: uniforms.idleHeight,
        uStormBassHeight: uniforms.bassHeight
      },
      vertexShader: `
        uniform float uStormTime;
        uniform float uStormBass;
        uniform float uStormIdleHeight;
        uniform float uStormBassHeight;
        varying vec2 vStormFoamPoint;
        varying float vStormFoamHeight;
        varying float vStormFoamNearness;

        float stormOverlayWave(vec2 point, vec2 direction, float frequency, float speed, float phase) {
          return sin(dot(point, normalize(direction)) * frequency + uStormTime * speed + phase);
        }

        float stormOverlayHeight(vec2 point) {
          float largeWave = stormOverlayWave(point, vec2(1.0, 0.32), 0.135, 0.56, 0.0);
          largeWave += stormOverlayWave(point, vec2(-0.38, 1.0), 0.205, 0.43, 1.7) * 0.62;
          largeWave += stormOverlayWave(point, vec2(0.21, -1.0), 0.287, 0.37, 4.6) * 0.24;
          float chop = stormOverlayWave(point, vec2(0.58, 1.0), 0.47, 0.92, 3.2);
          chop += stormOverlayWave(point, vec2(-1.0, 0.18), 0.73, 1.21, 0.8) * 0.46;
          chop += stormOverlayWave(point, vec2(0.76, -1.0), 1.28, 1.62, 2.4) * 0.18;
          float micro = stormOverlayWave(point, vec2(0.46, 1.0), 2.18, 1.94, 0.7);
          micro += stormOverlayWave(point, vec2(-1.0, 0.63), 2.86, 2.22, 4.1) * 0.58;
          micro += stormOverlayWave(point, vec2(0.82, -1.0), 3.64, 2.48, 2.2) * 0.34;
          float amplitude = uStormIdleHeight + uStormBassHeight * uStormBass;
          return (largeWave * 0.58 + chop * 0.34 + micro * 0.055) * amplitude;
        }

        void main() {
          vec3 transformed = position;
          vec2 point = position.xz;
          float height = stormOverlayHeight(point);
          transformed.y += height + 0.045;
          transformed.x += cos(dot(point, vec2(0.13, 0.06)) + uStormTime * 0.56) * (uStormIdleHeight + uStormBassHeight * uStormBass) * 0.16;
          transformed.z += sin(dot(point, vec2(-0.04, 0.19)) + uStormTime * 0.43) * (uStormIdleHeight + uStormBassHeight * uStormBass) * 0.12;
          vStormFoamPoint = point;
          vStormFoamHeight = height;
          vStormFoamNearness = smoothstep(-285.0, 54.0, position.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform float uStormTime;
        uniform float uStormBass;
        varying vec2 vStormFoamPoint;
        varying float vStormFoamHeight;
        varying float vStormFoamNearness;

        float stormFoamHash(vec2 point) {
          vec3 value = fract(vec3(point.xyx) * 0.1031);
          value += dot(value, value.yzx + 33.33);
          return fract((value.x + value.y) * value.z);
        }

        float stormFoamNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 local = fract(point);
          local = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
          return mix(
            mix(stormFoamHash(cell), stormFoamHash(cell + vec2(1.0, 0.0)), local.x),
            mix(stormFoamHash(cell + vec2(0.0, 1.0)), stormFoamHash(cell + vec2(1.0, 1.0)), local.x),
            local.y
          );
        }

        float stormFoamFbm(vec2 point) {
          float value = 0.0;
          float amplitude = 0.52;
          float weight = 0.0;
          mat2 rotation = mat2(0.84, -0.54, 0.54, 0.84);
          for (int octave = 0; octave < 6; octave++) {
            value += stormFoamNoise(point) * amplitude;
            weight += amplitude;
            point = rotation * point * 2.04 + vec2(5.2, 1.7);
            amplitude *= 0.48;
          }
          return value / max(weight, 0.001);
        }

        void main() {
          vec2 flow = vec2(vStormFoamPoint.x * 0.14, vStormFoamPoint.y * 0.108);
          flow += vec2(uStormTime * 0.023, -uStormTime * 0.036);
          float broad = stormFoamFbm(flow * 0.92);
          float detail = stormFoamFbm(flow * 5.6 + broad * 2.2 + 9.2);
          float micro = stormFoamFbm(flow * 13.4 - detail * 1.8 - uStormTime * 0.055 + 21.7);
          float breakup = smoothstep(0.22, 0.78, micro);
          float ridgeA = 0.5 + 0.5 * sin(vStormFoamPoint.y * 0.39 + vStormFoamPoint.x * 0.12 + broad * 6.2 - uStormTime * 0.34);
          float ridgeB = 0.5 + 0.5 * sin(vStormFoamPoint.y * 0.57 - vStormFoamPoint.x * 0.083 + detail * 4.8 - uStormTime * 0.47 + 2.7);
          float ridgeAa = max(max(fwidth(ridgeA), fwidth(ridgeB)) * 1.4, 0.006);
          float ridges = max(
            smoothstep(0.82 - ridgeAa, 0.965 + ridgeAa, ridgeA),
            smoothstep(0.86 - ridgeAa, 0.98 + ridgeAa, ridgeB) * 0.72
          );
          float wash = smoothstep(0.66, 0.845, detail * 0.71 + broad * 0.29);
          wash *= smoothstep(0.36, 0.73, micro);
          float crest = smoothstep(0.24, 0.84, vStormFoamHeight) * smoothstep(0.62, 0.84, detail);
          float nearMask = smoothstep(0.18, 0.96, vStormFoamNearness);
          float bubbles = smoothstep(0.76, 0.9, micro) * smoothstep(0.58, 0.82, detail) * 0.24;
          float foam = max(ridges * (0.32 + wash * 0.68), max(crest, bubbles)) * nearMask;
          foam *= mix(0.42, 1.0, breakup);
          foam *= 0.7 + uStormBass * 0.16;
          vec3 foamColor = mix(vec3(0.44, 0.55, 0.61), vec3(1.08, 1.14, 1.12), breakup * 0.42 + nearMask * 0.28);
          gl_FragColor = vec4(foamColor, clamp(foam * 0.62, 0.0, 0.64));
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const overlay = new THREE.Mesh(geometry, material);
    overlay.name = 'StormOcean_DynamicFoamOverlay';
    overlay.frustumCulled = false;
    overlay.renderOrder = 4;
    return overlay;
  }

  function createStormUnderwaterBackdrop(THREE, uniforms) {
    const geometry = new THREE.PlaneGeometry(470, 720, 1, 1);
    const material = new THREE.ShaderMaterial({
      name: 'StormOcean_UnderwaterRadianceMaterial',
      uniforms: {
        uStormTime: uniforms.time,
        uStormBass: uniforms.bass,
        uStormHorizonColor: uniforms.horizonColor,
        uStormSkyHighlightColor: uniforms.highlightColor
      },
      vertexShader: `
        precision highp float;
        varying vec2 vStormUnderwaterUv;
        void main() {
          vStormUnderwaterUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uStormTime;
        uniform float uStormBass;
        uniform vec3 uStormHorizonColor;
        uniform vec3 uStormSkyHighlightColor;
        varying vec2 vStormUnderwaterUv;

        float stormUnderwaterHash(vec2 point) {
          vec3 value = fract(vec3(point.xyx) * 0.1031);
          value += dot(value, value.yzx + 33.33);
          return fract((value.x + value.y) * value.z);
        }

        float stormUnderwaterNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 local = fract(point);
          local = local * local * (3.0 - 2.0 * local);
          return mix(
            mix(stormUnderwaterHash(cell), stormUnderwaterHash(cell + vec2(1.0, 0.0)), local.x),
            mix(stormUnderwaterHash(cell + vec2(0.0, 1.0)), stormUnderwaterHash(cell + vec2(1.0, 1.0)), local.x),
            local.y
          );
        }

        float stormUnderwaterFbm(vec2 point) {
          float value = 0.0;
          float amplitude = 0.55;
          mat2 rotation = mat2(0.83, -0.56, 0.56, 0.83);
          for (int octave = 0; octave < 5; octave++) {
            value += stormUnderwaterNoise(point) * amplitude;
            point = rotation * point * 2.03 + vec2(4.7, -2.1);
            amplitude *= 0.48;
          }
          return value / 1.068;
        }

        void main() {
          vec2 point = (vStormUnderwaterUv - 0.5) * vec2(18.0, 26.0);
          float broad = stormUnderwaterFbm(point * 0.28);
          float detail = stormUnderwaterFbm(point * 0.82 + broad * 1.6 + 13.0);
          float fine = stormUnderwaterFbm(point * 2.35 - detail * 1.1 + vec2(31.0, -17.0));
          float depth = smoothstep(0.0, 0.9, vStormUnderwaterUv.y);
          float causticPhase = uStormTime * 0.075;
          float causticA = abs(sin(point.x * 1.31 + point.y * 0.38 + detail * 4.2 + causticPhase));
          float causticB = abs(sin(point.y * 1.07 - point.x * 0.29 - broad * 3.7 - causticPhase * 0.73));
          float causticC = abs(sin((point.x - point.y) * 0.83 + fine * 3.2 + causticPhase * 0.41));
          float caustic = pow(clamp(1.0 - abs(causticA + causticB + causticC - 1.52), 0.0, 1.0), 9.0);
          caustic *= 0.18 + (1.0 - depth) * 0.62;
          float particulate = smoothstep(0.91, 0.985, stormUnderwaterNoise(point * 3.8 + 41.0));
          vec3 deep = vec3(0.004, 0.011, 0.016);
          vec3 clear = vec3(0.024, 0.058, 0.068) + uStormHorizonColor * 0.008;
          float waterColumnSignal = broad * 0.38 + detail * 0.34 + fine * 0.28;
          float waterColumnWindow = smoothstep(0.18, 0.78, waterColumnSignal) * mix(0.78, 1.0, 1.0 - depth);
          vec3 color = mix(deep, clear, waterColumnWindow);
          color += uStormSkyHighlightColor * caustic * (0.007 + uStormBass * 0.003);
          color += uStormSkyHighlightColor * particulate * 0.002;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      toneMapped: true,
      fog: false
    });
    const backdrop = new THREE.Mesh(geometry, material);
    backdrop.name = 'StormOcean_UnderwaterRadianceBackdrop';
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.set(0, -6.5, -190);
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -4;
    backdrop.visible = false;
    return backdrop;
  }

  function prepareOceanMaterial(material, THREE, config, uniforms) {
    if (!material || material.userData?.stormOceanPrepared) return material;
    material.userData = material.userData || {};
    material.userData.stormOceanPrepared = true;
    material.envMapIntensity = clamp(Number(config.reflectionIntensity) || 0.64, 0.5, 0.82);
    material.roughness = clamp(Number(config.waterRoughness) || 0.17, 0.12, 0.28);
    material.metalness = 0;
    material.side = THREE.DoubleSide;
    material.map = null;
    material.metalnessMap = null;
    material.aoMap = null;
    material.displacementMap = null;
    material.emissiveMap = null;
    material.alphaMap = null;
    material.color?.setHex?.(0x0b2632);
    material.emissive?.setHex?.(0x000000);
    if ('emissiveIntensity' in material) material.emissiveIntensity = 0;
    if ('transmission' in material) material.transmission = clamp(Number(config.waterTransmission) || 0.82, 0.72, 0.9);
    if ('ior' in material) material.ior = 1.333;
    if ('reflectivity' in material) material.reflectivity = 0.3;
    if ('thickness' in material) material.thickness = 0.72;
    if ('attenuationDistance' in material) material.attenuationDistance = 38;
    material.attenuationColor?.setHex?.(0x2f7484);
    if ('clearcoat' in material) material.clearcoat = 0;
    if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.32;
    const spectralTextures = waterTextureSet(THREE, config);
    if (spectralTextures) {
      material.normalMap = spectralTextures.normalMap;
      material.roughnessMap = spectralTextures.roughnessMap;
      material.userData.stormWaterTextures = spectralTextures;
    }
    const textureNormalScale = clamp(Number(config.textureNormalScale) || 0.7, 0.58, 0.82);
    material.normalScale?.set?.(textureNormalScale, textureNormalScale);
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
    // The sandbox selection pass reapplies these captured base values after the
    // GLB finishes loading. Keep them aligned with the storm runtime overrides
    // so it cannot restore the opaque authoring material and wash out the view.
    material.userData.sandboxBaseOpacity = 1;
    material.userData.sandboxBaseEmissiveIntensity = 0;
    if (material.map && 'encoding' in material.map && THREE.sRGBEncoding) material.map.encoding = THREE.sRGBEncoding;

    const foamCoverage = clamp(Number(config.foamCoverage) || 0.46, 0.2, 0.55);
    const foamContrast = clamp(Number(config.foamContrast) || 0.7, 0.3, 0.92);
    const waterMicroNormal = clamp(Number(config.waterMicroNormal) || 0.018, 0.009, 0.026);
    const cloudSpeed = clamp(Number(config.cloudSpeed) || 0.012, 0.004, 0.04);
    const thunderstormBassWaveGain = clamp(Number(config.thunderstorm?.bassWaveGain) || 1.55, 1, 1.8);
    const hybridRayTracing = config.rayTracingMode === 'hybrid-analytic';
    const rayTraceStrength = hybridRayTracing
      ? clamp(Number(config.rayTraceStrength) || 0.82, 0.35, 1)
      : 0;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uStormTime = uniforms.time;
      shader.uniforms.uStormBass = uniforms.bass;
      shader.uniforms.uStormIdleHeight = uniforms.idleHeight;
      shader.uniforms.uStormBassHeight = uniforms.bassHeight;
      shader.uniforms.uStormSunDirection = uniforms.sunDirection;
      shader.uniforms.uStormSunColor = uniforms.sunColor;
      shader.uniforms.uStormSkyZenithColor = uniforms.zenithColor;
      shader.uniforms.uStormHorizonColor = uniforms.horizonColor;
      shader.uniforms.uStormSkyHighlightColor = uniforms.highlightColor;
      shader.uniforms.uStormAmbientStrength = uniforms.ambient;
      shader.uniforms.uStormThunder = uniforms.thunder;
      shader.uniforms.uStormLightningFlash = uniforms.lightningFlash;
      shader.uniforms.uStormLightningTarget = uniforms.lightningTarget;
      shader.uniforms.uStormSceneColor = uniforms.sceneColor;
      shader.uniforms.uStormSceneResolution = uniforms.sceneResolution;
      shader.uniforms.uStormSceneRefractionReady = uniforms.sceneRefractionReady;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uStormTime;
uniform float uStormBass;
uniform float uStormIdleHeight;
uniform float uStormBassHeight;
uniform float uStormThunder;
varying float vStormEdgeFade;
varying float vStormCrest;
varying float vStormSlope;
varying float vStormCurvature;
varying float vStormNearness;
varying vec2 vStormPoint;

float stormWave(vec2 point, vec2 direction, float frequency, float speed, float phase, float steepness) {
  float wavePhase = dot(point, normalize(direction)) * frequency + uStormTime * speed + phase;
  float fundamental = sin(wavePhase);
  float secondHarmonic = sin(wavePhase * 2.0 - 0.48) * steepness * 0.16;
  float thirdHarmonic = sin(wavePhase * 3.0 + 0.73) * steepness * steepness * 0.032;
  float crestShape = (pow(max(fundamental, 0.0), 2.0) - 0.25) * steepness * 0.09;
  return fundamental + secondHarmonic + thirdHarmonic + crestShape;
}

float stormBassWeight(float gateRate, float gatePhase) {
  float randomEnvelope = sin(uStormTime * gateRate + gatePhase) * 0.5 + 0.5;
  float activationThreshold = 0.62 - uStormBass * 0.34;
  float activation = smoothstep(activationThreshold, activationThreshold + 0.38, randomEnvelope);
  float directionFloor = 0.08 + uStormBass * 0.12;
  return mix(directionFloor, 1.0, activation);
}

float stormBassPacket(vec2 point, vec2 direction, float frequency, float speed, float phase, float warpFrequency, float warpSpeed) {
  float projected = dot(point, direction);
  float crossPosition = dot(point, vec2(-direction.y, direction.x));
  float warp = sin(crossPosition * warpFrequency + uStormTime * warpSpeed + phase) * 0.58;
  float largePhase = projected * frequency - uStormTime * speed + phase + warp;
  float large = sin(largePhase);
  float medium = sin(projected * frequency * 1.78 - uStormTime * speed * 1.46 + phase * 1.73 - warp * 0.52) * 0.31;
  float crest = (pow(max(large, 0.0), 2.0) - 0.25) * 0.14;
  return large + medium + crest;
}

float stormHeight(vec2 point) {
  float longWarp = sin(dot(point, normalize(vec2(-0.34, 0.94))) * 0.029 + uStormTime * 0.11);
  float crossWarp = sin(dot(point, normalize(vec2(0.62, 0.78))) * 0.047 - uStormTime * 0.16 + 2.1);
  vec2 warpedPoint = point + vec2(longWarp * 1.9 + crossWarp * 0.72, crossWarp * 1.45 - longWarp * 0.54);
  float gustEnvelope = 0.86 + 0.14 * sin(dot(point, normalize(vec2(0.18, 0.98))) * 0.021 - uStormTime * 0.08 + longWarp * 0.72);
  float stormSwell = stormWave(warpedPoint, vec2(0.94, 0.34), 0.092, 0.39, 0.0, 0.72);
  stormSwell += stormWave(warpedPoint, vec2(0.98, 0.19), 0.148, 0.51, 1.7, 0.58) * 0.44;
  stormSwell += stormWave(warpedPoint, vec2(0.84, 0.54), 0.214, 0.63, 4.6, 0.48) * 0.2;
  stormSwell += stormWave(warpedPoint, vec2(-0.2, 1.0), 0.116, -0.31, 2.8, 0.24) * 0.1;
  vec2 windPoint = mix(point, warpedPoint, 0.46);
  float stormWindSea = stormWave(windPoint, vec2(0.96, 0.29), 0.43, 0.89, 3.2, 0.44);
  stormWindSea += stormWave(windPoint, vec2(0.89, 0.46), 0.72, 1.17, 0.8, 0.38) * 0.43;
  stormWindSea += stormWave(windPoint, vec2(0.99, 0.11), 1.08, 1.46, 5.4, 0.31) * 0.19;
  float stormCapillary = stormWave(point, vec2(0.93, 0.37), 1.74, 1.82, 2.4, 0.2);
  stormCapillary += stormWave(point, vec2(0.98, 0.22), 2.62, 2.18, 3.8, 0.16) * 0.42;
  stormCapillary += stormWave(point, vec2(0.78, 0.63), 3.86, 2.55, 2.2, 0.12) * 0.2;
  float bassWeight0 = stormBassWeight(0.071, 0.4);
  float bassWeight1 = stormBassWeight(0.093, 2.1);
  float bassWeight2 = stormBassWeight(0.081, 4.6);
  float bassWeight3 = stormBassWeight(0.107, 1.2);
  float bassWeight4 = stormBassWeight(0.064, 3.5);
  float bassWeight5 = stormBassWeight(0.119, 5.3);
  float randomBassSurge = stormBassPacket(point, vec2(1.0, 0.0), 0.076, 0.66, 0.2, 0.019, 0.1) * bassWeight0;
  randomBassSurge += stormBassPacket(point, vec2(-0.55, 0.835), 0.083, 0.72, 1.7, 0.023, -0.08) * bassWeight1;
  randomBassSurge += stormBassPacket(point, vec2(-0.94, -0.34), 0.071, 0.61, 3.1, 0.017, 0.12) * bassWeight2;
  randomBassSurge += stormBassPacket(point, vec2(0.12, -0.993), 0.089, 0.78, 4.4, 0.026, -0.11) * bassWeight3;
  randomBassSurge += stormBassPacket(point, vec2(0.72, 0.694), 0.068, 0.58, 5.6, 0.021, 0.09) * bassWeight4;
  randomBassSurge += stormBassPacket(point, vec2(-0.17, 0.985), 0.095, 0.84, 2.5, 0.028, -0.13) * bassWeight5;
  float bassWeightEnergy = bassWeight0 * bassWeight0 + bassWeight1 * bassWeight1 + bassWeight2 * bassWeight2
    + bassWeight3 * bassWeight3 + bassWeight4 * bassWeight4 + bassWeight5 * bassWeight5;
  randomBassSurge /= max(sqrt(bassWeightEnergy), 0.5);
  float stormThunderBassGain = mix(1.0, ${thunderstormBassWaveGain.toFixed(4)}, uStormThunder);
  float stormAmplitude = uStormIdleHeight + uStormBassHeight * uStormBass * 0.42 * stormThunderBassGain;
  float bassAmplitudeResponse = pow(uStormBass, 0.78) * (0.72 + uStormBass * 0.68);
  float randomSurgeHeight = clamp(uStormBassHeight * 1.12 * stormThunderBassGain, 0.35, 9.5);
  return (stormSwell * 0.53 + stormWindSea * 0.25 * gustEnvelope + stormCapillary * 0.026) * stormAmplitude
    + randomBassSurge * bassAmplitudeResponse * randomSurgeHeight;
}`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `float stormNormalStep = 0.22;
float stormCenter = stormHeight(position.xz);
float stormLeft = stormHeight(position.xz - vec2(stormNormalStep, 0.0));
float stormRight = stormHeight(position.xz + vec2(stormNormalStep, 0.0));
float stormDown = stormHeight(position.xz - vec2(0.0, stormNormalStep));
float stormUp = stormHeight(position.xz + vec2(0.0, stormNormalStep));
vec3 objectNormal = normalize(vec3(stormLeft - stormRight, stormNormalStep * 2.0, stormDown - stormUp));`
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
vec2 stormPoint = position.xz;
float stormVertexThunderBassGain = mix(1.0, ${thunderstormBassWaveGain.toFixed(4)}, uStormThunder);
float stormAmplitude = uStormIdleHeight + uStormBassHeight * uStormBass * 0.42 * stormVertexThunderBassGain;
float stormSurfaceHeight = stormCenter;
transformed.y += stormSurfaceHeight;
float stormHorizontalPhase = dot(stormPoint, normalize(vec2(0.94, 0.34))) * 0.092 + uStormTime * 0.39;
transformed.x += cos(stormHorizontalPhase) * stormAmplitude * 0.075;
transformed.z += cos(stormHorizontalPhase) * stormAmplitude * 0.027;
float stormSideFade = 1.0 - smoothstep(146.0, 180.0, abs(position.x));
float stormFarFade = smoothstep(-449.0, -392.0, position.z);
float stormNearFade = 1.0 - smoothstep(45.0, 72.0, position.z);
vStormEdgeFade = clamp(stormSideFade * stormFarFade * stormNearFade, 0.0, 1.0);
vStormCrest = smoothstep(0.12, max(0.2, stormAmplitude * 0.82), stormSurfaceHeight);
vStormSlope = clamp(length(vec2(stormLeft - stormRight, stormDown - stormUp)) / (stormNormalStep * 2.0), 0.0, 1.0);
float stormCurvature = max(0.0, (stormCenter * 4.0 - stormLeft - stormRight - stormDown - stormUp) / (stormNormalStep * stormNormalStep));
vStormCurvature = clamp(stormCurvature * 8.0, 0.0, 1.0);
vStormNearness = smoothstep(-285.0, 54.0, position.z);
vStormPoint = stormPoint;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uStormTime;
uniform float uStormBass;
uniform vec3 uStormSunDirection;
uniform vec3 uStormSunColor;
uniform vec3 uStormSkyZenithColor;
uniform vec3 uStormHorizonColor;
uniform vec3 uStormSkyHighlightColor;
uniform float uStormAmbientStrength;
uniform float uStormThunder;
uniform float uStormLightningFlash;
uniform vec2 uStormLightningTarget;
uniform sampler2D uStormSceneColor;
uniform vec2 uStormSceneResolution;
uniform float uStormSceneRefractionReady;
varying float vStormEdgeFade;
varying float vStormCrest;
varying float vStormSlope;
varying float vStormCurvature;
varying float vStormNearness;
varying vec2 vStormPoint;

float stormSurfaceHash(vec2 point) {
  vec3 value = fract(vec3(point.xyx) * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

float stormSurfaceNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  return mix(
    mix(stormSurfaceHash(cell), stormSurfaceHash(cell + vec2(1.0, 0.0)), local.x),
    mix(stormSurfaceHash(cell + vec2(0.0, 1.0)), stormSurfaceHash(cell + vec2(1.0, 1.0)), local.x),
    local.y
  );
}

float stormSurfaceFbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.52;
  float weight = 0.0;
  mat2 rotation = mat2(0.84, -0.54, 0.54, 0.84);
  for (int octave = 0; octave < 6; octave++) {
    value += stormSurfaceNoise(point) * amplitude;
    weight += amplitude;
    point = rotation * point * 2.05 + vec2(5.2, 1.7);
    amplitude *= 0.49;
  }
  return value / max(weight, 0.001);
}

float stormSurfaceDetail(vec2 point) {
  mat2 rotation = mat2(0.79, -0.61, 0.61, 0.79);
  float detail = stormSurfaceNoise(point) * 0.57;
  point = rotation * point * 2.13 + vec2(3.7, 8.1);
  detail += stormSurfaceNoise(point) * 0.29;
  point = rotation * point * 2.27 + vec2(6.4, 2.9);
  detail += stormSurfaceNoise(point) * 0.14;
  return detail;
}

float stormBandLimitedSine(float phase) {
  float footprint = fwidth(phase);
  float frequencyFade = 1.0 - smoothstep(0.42, 1.82, footprint);
  return sin(phase) * frequencyFade;
}

float stormFootprintFade(vec2 point, float beginFade, float endFade) {
  float footprint = max(length(dFdx(point)), length(dFdy(point)));
  return 1.0 - smoothstep(beginFade, endFade, footprint);
}

vec3 stormSunViewDirection() {
  return normalize((viewMatrix * vec4(uStormSunDirection, 0.0)).xyz);
}

float stormReflectedSkyHash(vec2 point) {
  vec3 value = fract(vec3(point.xyx) * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

float stormReflectedSkyNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  return mix(
    mix(stormReflectedSkyHash(cell), stormReflectedSkyHash(cell + vec2(1.0, 0.0)), local.x),
    mix(stormReflectedSkyHash(cell + vec2(0.0, 1.0)), stormReflectedSkyHash(cell + vec2(1.0, 1.0)), local.x),
    local.y
  );
}

float stormReflectedSkyFbmV3(vec2 point) {
  float value = 0.0;
  float amplitude = 0.51;
  float weight = 0.0;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 3; octave++) {
    value += stormReflectedSkyNoise(point) * amplitude;
    weight += amplitude;
    point = rotation * point * 2.07 + vec2(7.13, 3.71);
    amplitude *= 0.485;
  }
  return value / max(weight, 0.001);
}

vec3 stormTraceSkyRadiance(vec3 rayDirection, vec2 surfacePoint, float phase) {
  vec3 direction = normalize(inverseTransformDirection(rayDirection, viewMatrix));
  float elevation = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  float longitude = atan(direction.z, direction.x);
  float cloudTime = uStormTime * ${cloudSpeed.toFixed(5)};
  vec2 skyPoint = vec2(longitude * 2.65, direction.y * 5.8);
  vec2 skyDrift = vec2(cloudTime * 0.42, -cloudTime * 0.07);
  skyPoint += skyDrift + vec2(phase * 0.0007, -phase * 0.0004);
  float cloudBroad = stormReflectedSkyFbmV3(skyPoint * 0.78 + skyDrift * 0.62);
  float cloudBillow = stormReflectedSkyFbmV3(skyPoint * 1.92 - skyDrift * 0.84 + 4.8);
  float cloudDetail = stormReflectedSkyNoise(skyPoint * 4.85 + skyDrift * 1.24 - 8.2);
  float cloudMass = clamp(cloudBroad * 0.64 + cloudBillow * 0.27 + cloudDetail * 0.09 + uStormThunder * 0.06, 0.0, 1.0);
  float cloudEdge = 1.0 - abs(cloudMass * 2.0 - 1.0);
  float horizon = exp(-abs(direction.y) * 5.8);
  float upperSky = smoothstep(0.08, 0.92, elevation);
  float radiance = mix(0.08, 0.72, upperSky) * mix(0.48, 1.18, cloudMass);
  radiance += horizon * (0.12 + cloudEdge * 0.13);
  radiance += smoothstep(0.72, 0.94, cloudEdge) * 0.08;
  vec3 skyTone = mix(uStormHorizonColor, uStormSkyZenithColor, upperSky);
  vec3 cloudTone = mix(skyTone * 0.2, uStormSkyHighlightColor * 0.62, cloudEdge * uStormAmbientStrength);
  float solarTrace = pow(max(dot(direction, normalize(uStormSunDirection)), 0.0), 92.0);
  vec3 tracedColor = mix(skyTone, cloudTone, smoothstep(0.31, 0.78, cloudMass));
  tracedColor *= clamp(radiance, 0.025, 1.25);
  tracedColor += uStormSunColor * solarTrace * (0.24 + (1.0 - cloudMass) * 0.54);
  tracedColor *= mix(1.0, 0.72, uStormThunder);
  return max(tracedColor, vec3(0.001));
}

float stormTraceUnderwaterDensity(vec2 surfacePoint, vec3 rayDirection, float rayLength) {
  float density = 0.0;
  for (int stepIndex = 0; stepIndex < 7; stepIndex++) {
    float stepDistance = (float(stepIndex) + 0.5) * rayLength / 7.0;
    vec2 samplePoint = surfacePoint + rayDirection.xz * stepDistance;
    samplePoint += vec2(rayDirection.y * stepDistance * 0.17, uStormTime * 0.013);
    float broadDensity = stormSurfaceNoise(samplePoint * 0.21 + float(stepIndex) * 7.3);
    float fineDensity = stormSurfaceNoise(samplePoint * 0.61 - float(stepIndex) * 3.9 + 11.7);
    float microDensity = stormSurfaceNoise(samplePoint * 1.37 + float(stepIndex) * 5.1 - 23.4);
    density += broadDensity * 0.58 + fineDensity * 0.29 + microDensity * 0.13;
  }
  return density / 7.0;
}

vec3 stormPerturbWaterNormal(vec3 surfacePosition, vec3 surfaceNormal, float height, float strength) {
  vec3 sigmaX = dFdx(surfacePosition);
  vec3 sigmaY = dFdy(surfacePosition);
  vec3 basisX = cross(sigmaY, surfaceNormal);
  vec3 basisY = cross(surfaceNormal, sigmaX);
  float determinant = dot(sigmaX, basisX);
  vec3 gradient = sign(determinant) * (dFdx(height) * basisX + dFdy(height) * basisY);
  return normalize(abs(determinant) * surfaceNormal - gradient * strength);
}`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
vec2 stormFoamFlow = vStormPoint * vec2(0.024, 0.019);
stormFoamFlow += vec2(uStormTime * 0.012, -uStormTime * 0.019);
float stormFoamBroad = stormSurfaceFbm(stormFoamFlow * 0.82);
float stormFoamDetail = stormSurfaceFbm(stormFoamFlow * 4.8 + stormFoamBroad * 1.7 + 9.2);
float stormFoamBreakup = stormSurfaceNoise(stormFoamFlow * 12.6 - uStormTime * 0.028);
float stormDetailWarp = (stormFoamBroad - 0.5) * 1.3;
float stormPixelFootprint = max(length(dFdx(vStormPoint)), length(dFdy(vStormPoint)));
float stormStochasticFade = 1.0 - smoothstep(0.24, 1.35, stormPixelFootprint);
float stormRandomCapillary = stormSurfaceDetail(vStormPoint * 2.72 + vec2(uStormTime * 0.061, -uStormTime * 0.083) + stormDetailWarp);
float stormCrossCapillary = stormSurfaceDetail(mat2(0.36, -0.93, 0.93, 0.36) * vStormPoint * 5.4 + vec2(-uStormTime * 0.11, uStormTime * 0.074));
float stormFacetPatch = stormSurfaceDetail(mat2(0.73, -0.68, 0.68, 0.73) * vStormPoint * 0.91 + vec2(uStormTime * 0.019, -uStormTime * 0.014) + 18.4);
float stormUnresolvedMicroVariance = smoothstep(0.16, 1.1, stormPixelFootprint)
  * mix(0.72, 1.0, stormFacetPatch);
float stormNearCapillaryFade = stormStochasticFade * smoothstep(0.36, 0.94, vStormNearness);
float stormUltraFineA = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.57, 0.82))) * 48.2 + stormDetailWarp * 0.09 - uStormTime * 4.16);
float stormUltraFineB = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.83, 0.56))) * 63.4 - stormDetailWarp * 0.07 + uStormTime * 4.73);
float stormNanoCapillaryFade = stormStochasticFade * smoothstep(0.68, 0.98, vStormNearness);
float stormNanoFineA = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.71, 0.7))) * 78.6 + stormDetailWarp * 0.045 - uStormTime * 5.18);
float stormNanoFineB = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.91, 0.42))) * 96.2 - stormDetailWarp * 0.038 + uStormTime * 5.74);
float stormMesoPhaseA = dot(vStormPoint, normalize(vec2(0.86, 0.51))) * 17.8 + stormDetailWarp * 0.26 - uStormTime * 2.38;
float stormMesoPhaseB = dot(vStormPoint, normalize(vec2(-0.57, 0.82))) * 31.6 - stormDetailWarp * 0.18 + uStormTime * 3.06;
float stormMesoRippleA = stormBandLimitedSine(stormMesoPhaseA);
float stormMesoRippleB = stormBandLimitedSine(stormMesoPhaseB);
float stormMesoRipple = (stormMesoRippleA * 0.64 + stormMesoRippleB * 0.36) * stormStochasticFade;
float stormCrossMesoC = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.93, -0.37))) * 22.4 + stormDetailWarp * 0.21 + uStormTime * 2.71);
float stormCrossMesoD = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.18, -0.984))) * 41.3 - stormDetailWarp * 0.1 - uStormTime * 3.68);
float stormCrossMesoDetail = (stormCrossMesoC * 0.61 + stormCrossMesoD * 0.39) * stormStochasticFade;
float stormWeatherFineA = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.76, -0.65))) * 58.4 + stormDetailWarp * 0.082 - uStormTime * 4.42);
float stormWeatherFineB = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.39, -0.92))) * 89.8 - stormDetailWarp * 0.054 + uStormTime * 5.36);
float stormWeatherFine = (stormWeatherFineA * 0.58 + stormWeatherFineB * 0.42)
  * stormNearCapillaryFade * mix(0.35, 1.0, uStormThunder);
float stormSpectralCrossE = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.48, -0.877))) * 28.7 + stormDetailWarp * 0.16 - uStormTime * 3.13);
float stormSpectralCrossF = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.67, -0.742))) * 46.9 - stormDetailWarp * 0.085 + uStormTime * 3.94);
float stormSurfaceDetailV8 = (stormSpectralCrossE * 0.59 + stormSpectralCrossF * 0.41) * stormStochasticFade;
float stormNaturalCapillaryJ = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.914, -0.406))) * 73.2 + stormFacetPatch * 0.087 - uStormTime * 4.82);
float stormNaturalCapillaryK = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.536, 0.844))) * 112.6 - stormDetailWarp * 0.041 + uStormTime * 6.12);
float stormNaturalCapillaryV8 = (stormNaturalCapillaryJ * 0.63 + stormNaturalCapillaryK * 0.37) * stormNanoCapillaryFade;
vec2 stormGrainPoint = mat2(0.69, -0.72, 0.72, 0.69) * vStormPoint * 8.2 + vec2(uStormTime * 0.17, -uStormTime * 0.12);
float stormGrainFade = stormFootprintFade(stormGrainPoint, 0.28, 0.92) * stormNearCapillaryFade;
float stormFacetGrain = mix(0.5, stormSurfaceNoise(stormGrainPoint), stormGrainFade);
float stormWindFacetPhase = dot(vStormPoint, normalize(vec2(0.985, 0.173))) * 14.8 + stormCrossCapillary * 2.7 - uStormTime * 2.34;
float stormWindFacet = 0.5 + 0.5 * stormBandLimitedSine(stormWindFacetPhase);
stormWindFacet = mix(0.5, stormWindFacet, stormStochasticFade);
float stormWindRibbonA = stormBandLimitedSine(stormWindFacetPhase * 1.23 + (stormFacetPatch - 0.5) * 1.6);
float stormWindRibbonB = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.91, 0.41))) * 24.6 - stormDetailWarp * 0.31 - uStormTime * 2.78);
float stormWindRibbonC = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.998, -0.055))) * 38.2 + stormCrossCapillary * 0.42 - uStormTime * 3.46);
float stormWindRibbonD = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.79, -0.61))) * 52.8 - stormDetailWarp * 0.12 - uStormTime * 4.08);
float stormWindRibbonE = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.46, 0.89))) * 68.4 + stormFacetPatch * 0.21 + uStormTime * 4.66);
float stormWindRibbonF = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.33, 0.944))) * 84.6 - stormDetailWarp * 0.075 - uStormTime * 5.17);
float stormWindRibbonG = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.965, -0.262))) * 108.2 + stormFacetPatch * 0.13 + uStormTime * 5.92);
float stormWindRibbonH = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.985, 0.17))) * 126.4 - stormDetailWarp * 0.045 - uStormTime * 6.48);
float stormWindRibbonI = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.82, 0.57))) * 151.2 + stormDetailWarp * 0.032 + uStormTime * 7.02);
float stormCoherentCapillary = (stormWindRibbonA * 0.37 + stormWindRibbonB * 0.24 + stormWindRibbonC * 0.15 + stormWindRibbonD * 0.1 + stormWindRibbonE * 0.065 + stormWindRibbonF * 0.045 + stormWindRibbonG * 0.03) * stormStochasticFade;
float stormCapillaryLace = (stormWindRibbonF * 0.62 + stormWindRibbonG * 0.38) * stormNanoCapillaryFade;
float stormUltraCapillaryLace = (stormWindRibbonH * 0.61 + stormWindRibbonI * 0.39) * stormNanoCapillaryFade;
float stormWindRidgeMask = smoothstep(0.62, 0.94, stormCoherentCapillary * 0.5 + 0.5) * stormNearCapillaryFade;
float stormFarFieldFade = (1.0 - smoothstep(0.34, 0.86, vStormNearness))
  * stormFootprintFade(vStormPoint * 0.18, 0.22, 1.15);
float stormFarWindA = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.982, 0.189))) * 2.86 + stormDetailWarp * 0.38 - uStormTime * 1.18);
float stormFarWindB = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.88, 0.475))) * 4.72 - stormDetailWarp * 0.21 - uStormTime * 1.62);
float stormFarFieldDetail = (stormFarWindA * 0.68 + stormFarWindB * 0.32) * stormFarFieldFade;
float stormWindShearEnvelope = smoothstep(0.28, 0.78, stormFoamBroad * 0.58 + stormFacetPatch * 0.42);
float stormWindShearDetail = stormCoherentCapillary * mix(0.34, 1.0, stormWindShearEnvelope) * stormStochasticFade;
float stormSurfaceDetailV9 = stormFarFieldDetail * 0.58 + stormWindShearDetail * 0.42;
float stormFoamStart = mix(0.88, 0.72, ${foamCoverage.toFixed(4)});
float stormFoamWidth = mix(0.17, 0.065, ${foamContrast.toFixed(4)});
float stormCrestSignal = vStormCrest * 0.44 + vStormSlope * 0.24 + vStormCurvature * 0.32 + (stormFoamDetail - 0.5) * 0.08;
stormCrestSignal += uStormThunder * uStormBass * 0.08;
float stormCrestFoam = smoothstep(stormFoamStart, stormFoamStart + stormFoamWidth, stormCrestSignal);
float stormWindStreak = 0.5 + 0.5 * sin(dot(vStormPoint, normalize(vec2(-0.34, 0.94))) * 0.31 + stormFoamBroad * 3.6 - uStormTime * 0.27);
float stormDirectionalBreak = smoothstep(0.61, 0.9, stormWindStreak) * smoothstep(0.5, 0.78, stormFoamDetail);
float stormFoam = stormCrestFoam * mix(0.16, 1.0, stormDirectionalBreak);
float stormMicroBreakWave = 0.5 + 0.5 * (stormUltraFineA * 0.42 + stormUltraFineB * 0.23 + stormNanoFineA * 0.12 + stormNanoFineB * 0.07 + stormCoherentCapillary * 0.16);
float stormMicroBreakRidge = smoothstep(0.82, 0.965, stormMicroBreakWave);
stormMicroBreakRidge *= smoothstep(0.38, 0.82, vStormCurvature + vStormCrest * 0.24) * stormNearCapillaryFade;
float stormBubbleNoise = stormSurfaceNoise(vStormPoint * 1.72 + vec2(-uStormTime * 0.037, uStormTime * 0.026) + stormFoamDetail * 2.1);
float stormBubbleAA = max(fwidth(stormBubbleNoise) * 1.3, 0.006);
float stormMicroBubble = smoothstep(0.82 - stormBubbleAA, 0.93 + stormBubbleAA, stormBubbleNoise);
stormMicroBubble *= smoothstep(0.59, 0.86, stormFoamDetail) * stormNearCapillaryFade;
float stormCurvatureFilament = smoothstep(0.27, 0.72, vStormCurvature + vStormCrest * 0.16);
stormCurvatureFilament *= smoothstep(0.54, 0.82, stormFoamDetail) * smoothstep(0.43, 0.82, stormFoamBreakup);
stormCurvatureFilament *= 0.22 + stormDirectionalBreak * 0.78;
stormFoam = max(stormFoam, stormCurvatureFilament * 0.34);
float stormSecondaryBreak = smoothstep(0.8, 0.96, vStormSlope + vStormCrest * 0.12);
stormSecondaryBreak *= smoothstep(0.74, 0.91, stormFoamDetail) * smoothstep(0.7, 0.91, stormFoamBreakup);
stormFoam = max(stormFoam, stormSecondaryBreak * 0.34);
float stormGranularWhitecap = smoothstep(0.64, 0.84, stormCrestSignal + stormFoamBreakup * 0.085);
stormGranularWhitecap *= smoothstep(0.58, 0.84, stormFoamDetail) * mix(0.18, 1.0, stormDirectionalBreak);
stormFoam = max(stormFoam, stormGranularWhitecap * 0.38);
stormFoam = max(stormFoam, stormMicroBreakRidge * (0.08 + stormDirectionalBreak * 0.15));
stormFoam = max(stormFoam, stormMicroBubble * stormCrestFoam * 0.18);
float stormFoamPoreField = stormFacetGrain * 0.58 + stormBubbleNoise * 0.42;
float stormFoamPoreAa = max(fwidth(stormFoamPoreField) * 1.2, 0.005);
float stormFoamPoreMask = smoothstep(0.36 - stormFoamPoreAa, 0.72 + stormFoamPoreAa, stormFoamPoreField);
float stormFoamPatchV2 = smoothstep(0.48, 0.74, stormFoamBroad * 0.22 + stormFoamDetail * 0.48 + stormFoamBreakup * 0.3);
float stormFoamVoidV2 = smoothstep(0.64, 0.88, (1.0 - stormFoamBroad) * 0.55 + stormBubbleNoise * 0.45);
float stormFoamFiligreeV2 = 1.0 - smoothstep(
  0.085 + stormFoamPoreAa,
  0.27 + stormFoamPoreAa,
  abs(stormFoamPoreField - 0.54)
);
stormFoam *= mix(0.5, 1.0, stormFoamPatchV2) * (1.0 - stormFoamVoidV2 * 0.52);
stormFoam *= mix(0.64, 1.0, stormFoamPoreMask);
stormFoam = max(stormFoam, stormCrestFoam * stormFoamFiligreeV2 * stormDirectionalBreak * 0.11);
stormFoam = max(stormFoam, stormCurvatureFilament * stormMicroBreakRidge * (0.14 + stormFoamPatchV2 * 0.12));
stormFoam *= smoothstep(0.12, 0.94, vStormNearness) * (0.44 + stormFoamBreakup * 0.56);
stormFoam *= smoothstep(0.06, 0.8, vStormEdgeFade);

float stormWaterVariation = stormSurfaceFbm(stormFoamFlow * 0.46 + 2.4);
float stormWaterMottle = stormSurfaceNoise(vStormPoint * 0.19 + vec2(-uStormTime * 0.006, uStormTime * 0.004) + 41.8);
float stormFineTone = stormMesoRipple * 0.4 + stormCrossMesoDetail * 0.28 + stormSurfaceDetailV8 * 0.2 + stormCoherentCapillary * 0.12 + stormSurfaceDetailV9 * 0.14;
vec3 stormWaterSky = mix(uStormSkyZenithColor, uStormHorizonColor, 0.28);
float stormWaterSkyLuminance = dot(stormWaterSky, vec3(0.2126, 0.7152, 0.0722));
vec3 stormWaterNeutralSky = mix(vec3(stormWaterSkyLuminance), stormWaterSky, 0.26);
vec3 stormDeepWater = vec3(0.0025, 0.0095, 0.0145) + stormWaterNeutralSky * vec3(0.003, 0.007, 0.009);
vec3 stormLiftedWater = vec3(0.012, 0.031, 0.041) + stormWaterNeutralSky * vec3(0.008, 0.017, 0.021);
float stormWaterLift = clamp(0.18 + vStormSlope * 0.12 + vStormCrest * 0.055 + vStormCurvature * 0.035 + stormWaterVariation * 0.07 + stormCoherentCapillary * stormNearCapillaryFade * 0.008 + stormFineTone * stormNearCapillaryFade * 0.016 + (stormWaterMottle - 0.5) * 0.012, 0.0, 0.5);
diffuseColor.rgb = mix(stormDeepWater, stormLiftedWater, stormWaterLift);
diffuseColor.a *= vStormEdgeFade;`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
float stormMicroWarp = (stormSurfaceFbm(vStormPoint * 0.071 + vec2(uStormTime * 0.012, -uStormTime * 0.016)) - 0.5) * 1.3;
float stormMicroHeight = stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.94, 0.34))) * 2.46 + stormMicroWarp - uStormTime * 0.94) * 0.46;
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.98, 0.2))) * 5.28 - stormMicroWarp * 0.54 - uStormTime * 1.43) * 0.28;
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.8, 0.6))) * 9.72 + stormMicroWarp * 0.31 - uStormTime * 1.92) * 0.16;
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.24, 0.97))) * 7.36 - stormMicroWarp * 0.22 + uStormTime * 1.16) * 0.1;
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.66, 0.75))) * 13.4 + stormMicroWarp * 0.18 - uStormTime * 2.17) * (0.035 + vStormNearness * 0.025);
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.17, 0.985))) * 19.6 - stormMicroWarp * 0.13 + uStormTime * 2.63) * (0.018 + vStormNearness * 0.015);
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(0.42, 0.91))) * 27.8 + stormFacetPatch * 0.46 - uStormTime * 3.08) * (0.008 + vStormNearness * 0.014) * stormStochasticFade;
stormMicroHeight += stormBandLimitedSine(dot(vStormPoint, normalize(vec2(-0.74, 0.67))) * 35.6 - stormFacetPatch * 0.38 + uStormTime * 3.42) * (0.005 + vStormNearness * 0.01) * stormStochasticFade;
stormMicroHeight += (stormUltraFineA * 0.0045 + stormUltraFineB * 0.003) * stormNearCapillaryFade;
stormMicroHeight += (stormNanoFineA * 0.0018 + stormNanoFineB * 0.0012) * stormNanoCapillaryFade;
stormMicroHeight += stormMesoRipple * (0.012 + vStormNearness * 0.006);
stormMicroHeight += stormCrossMesoDetail * (0.004 + vStormNearness * 0.002);
stormMicroHeight += stormWeatherFine * (0.002 + vStormNearness * 0.001);
stormMicroHeight += stormSurfaceDetailV8 * (0.005 + vStormNearness * 0.0035);
stormMicroHeight += stormNaturalCapillaryV8 * (0.0014 + vStormNearness * 0.0012);
stormMicroHeight += stormCoherentCapillary * (0.034 + vStormNearness * 0.018) * stormNearCapillaryFade;
stormMicroHeight += stormCapillaryLace * (0.006 + vStormNearness * 0.006);
stormMicroHeight += stormUltraCapillaryLace * (0.0012 + vStormNearness * 0.001);
stormMicroHeight += stormSurfaceDetailV9 * (0.012 + stormFarFieldFade * 0.01);
stormMicroHeight += ((stormRandomCapillary - 0.5) * 0.085 + (stormCrossCapillary - 0.5) * 0.032) * stormStochasticFade;
stormMicroHeight += (stormWindFacet - 0.5) * 0.032;
stormMicroHeight *= mix(0.86, 1.12, stormFacetPatch);
normal = stormPerturbWaterNormal(
  -vViewPosition,
  normal,
  stormMicroHeight,
  ${waterMicroNormal.toFixed(4)} * mix(1.0, 1.08, uStormThunder * uStormBass)
);
#if defined(USE_NORMALMAP) && defined(TANGENTSPACE_NORMALMAP)
  vec2 stormSecondaryNormalUv = vUv * 2.37 + vec2(-uStormTime * 0.006, uStormTime * 0.004);
  float stormSecondaryNormalFade = stormFootprintFade(stormSecondaryNormalUv, 0.2, 0.88)
    * smoothstep(0.28, 0.96, vStormNearness);
  vec3 stormSecondaryNormalSample = texture2D(normalMap, stormSecondaryNormalUv).xyz * 2.0 - 1.0;
  stormSecondaryNormalSample.xy *= normalScale * 0.14;
  vec3 stormSecondaryNormalV3 = perturbNormal2Arb(
    -vViewPosition,
    normal,
    stormSecondaryNormalSample,
    faceDirection
  );
  normal = normalize(mix(normal, stormSecondaryNormalV3, stormSecondaryNormalFade * 0.12));
#endif
float stormNormalDerivativeVarianceV3 = max(
  dot(dFdx(normal), dFdx(normal)),
  dot(dFdy(normal), dFdy(normal))
);
roughnessFactor = clamp(
  sqrt(roughnessFactor * roughnessFactor + min(stormNormalDerivativeVarianceV3 * 0.05, 0.026)),
  0.075,
  0.32
);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
float stormMicroRoughness = stormSurfaceFbm(vStormPoint * 1.06 + vec2(-uStormTime * 0.018, uStormTime * 0.026));
float stormCapillaryRoughness = mix(stormRandomCapillary, stormCrossCapillary, 0.34);
float stormFineFacetVariance = (abs(stormUltraFineA) * 0.56 + abs(stormUltraFineB) * 0.44) * stormNearCapillaryFade;
float stormNanoFacetVariance = (abs(stormNanoFineA) * 0.58 + abs(stormNanoFineB) * 0.42) * stormNanoCapillaryFade;
float stormRibbonVariance = abs(stormCoherentCapillary) * stormNearCapillaryFade;
float stormLaceVariance = abs(stormCapillaryLace) * stormNanoCapillaryFade;
float stormMesoVariance = abs(stormMesoRipple) * stormNearCapillaryFade;
float stormCrossMesoVariance = abs(stormCrossMesoDetail) * stormNearCapillaryFade;
float stormWeatherFineVariance = abs(stormWeatherFine);
float stormSurfaceDetailV8Variance = abs(stormSurfaceDetailV8) * stormNearCapillaryFade;
float stormNaturalCapillaryV8Variance = abs(stormNaturalCapillaryV8);
float stormUltraLaceVariance = abs(stormUltraCapillaryLace);
float stormSurfaceDetailV9Variance = abs(stormSurfaceDetailV9) * max(stormFarFieldFade, stormNearCapillaryFade * 0.42);
float stormGrainVariance = abs(stormFacetGrain - 0.5) * 2.0;
float stormRidgePolish = stormWindRidgeMask * mix(0.62, 1.0, stormFacetPatch);
float stormPhysicalRoughness = 0.082 + stormMicroRoughness * 0.052 + stormCapillaryRoughness * 0.03 + stormFineFacetVariance * 0.011 + stormNanoFacetVariance * 0.005 + stormRibbonVariance * 0.012 + stormLaceVariance * 0.005 + stormMesoVariance * 0.008 + stormCrossMesoVariance * 0.006 + stormWeatherFineVariance * 0.003 + stormSurfaceDetailV8Variance * 0.005 + stormNaturalCapillaryV8Variance * 0.002 + stormUltraLaceVariance * 0.003 + stormSurfaceDetailV9Variance * 0.006 + stormUnresolvedMicroVariance * 0.022 + stormGrainVariance * 0.009 + stormWindFacet * 0.01 + (1.0 - stormFacetPatch) * 0.021 + vStormSlope * 0.025 + vStormCurvature * 0.009 - vStormCrest * 0.007 - stormRidgePolish * 0.006;
roughnessFactor = clamp(mix(roughnessFactor, stormPhysicalRoughness, 0.9), 0.075, 0.29);
roughnessFactor = mix(roughnessFactor, 0.64, clamp(stormFoam * 0.76, 0.0, 0.76));`
        )
        .replace(
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          `vec3 stormSkyHighlightColor = uStormSkyHighlightColor;
vec3 stormFoamColor = mix(vec3(0.28, 0.34, 0.36), stormSkyHighlightColor * 0.58, stormFoamBreakup * 0.46 + vStormNearness * 0.2);
stormFoamColor += stormSkyHighlightColor * stormMicroBubble * 0.02;
stormFoamColor += stormSkyHighlightColor * stormFoamFiligreeV2 * stormCrestFoam * 0.014;
vec3 stormViewDirection = normalize(vViewPosition);
float stormFacing = clamp(abs(dot(normalize(normal), stormViewDirection)), 0.0, 1.0);
float stormFresnel = 0.02037 + 0.97963 * pow(1.0 - stormFacing, 5.0);
float stormSilverGlint = smoothstep(0.58, 0.94, vStormSlope * 0.48 + (1.0 - roughnessFactor) * 0.34 + stormFoamDetail * 0.08);
stormSilverGlint *= 0.08 + vStormNearness * 0.16;
vec3 stormTransmissionTint = mix(stormDeepWater, stormLiftedWater, clamp(0.22 + stormWaterVariation * 0.15 + vStormNearness * 0.06 + stormFacing * 0.1, 0.0, 0.54));
vec3 stormSkySpecularTint = mix(stormSkyHighlightColor, uStormHorizonColor, 0.46);
stormSkySpecularTint = mix(stormSkySpecularTint, vec3(dot(stormSkySpecularTint, vec3(0.2126, 0.7152, 0.0722))), 0.24);
vec3 stormReflection = outgoingLight * stormSkySpecularTint * 0.018;
vec3 stormDirectSpecularV3 = vec3(0.0);
stormReflection += stormSkySpecularTint * stormSilverGlint * 0.012;
vec3 stormReflectedView = normalize(reflect(-stormViewDirection, normalize(normal)));
float stormSkyElevation = clamp(stormReflectedView.y * 0.5 + 0.5, 0.0, 1.0);
vec3 stormTraceReference = abs(stormReflectedView.y) < 0.98 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
vec3 stormTraceTangent = normalize(cross(stormTraceReference, stormReflectedView));
vec3 stormTraceBitangent = normalize(cross(stormReflectedView, stormTraceTangent));
float stormTraceHorizonStability = mix(0.74, 1.0, smoothstep(0.06, 0.58, abs(stormReflectedView.y)));
float stormTraceCone = clamp((roughnessFactor * roughnessFactor * 1.35 + stormUnresolvedMicroVariance * 0.032) * stormTraceHorizonStability, 0.005, 0.095);
float stormTraceRotation = stormSurfaceNoise(vStormPoint * 0.037 + vec2(57.2, -31.4)) * 6.2831853;
vec3 stormTraceAxisA = normalize(stormTraceTangent * cos(stormTraceRotation) + stormTraceBitangent * sin(stormTraceRotation));
vec3 stormTraceAxisB = normalize(cross(stormReflectedView, stormTraceAxisA));
vec3 stormReflectionRayA = normalize(stormReflectedView + stormTraceAxisA * stormTraceCone * 0.82 + stormTraceAxisB * stormTraceCone * 0.18);
vec3 stormReflectionRayB = normalize(stormReflectedView - stormTraceAxisA * stormTraceCone * 0.82 - stormTraceAxisB * stormTraceCone * 0.18);
vec3 stormReflectionRayC = normalize(stormReflectedView + stormTraceAxisB * stormTraceCone * 0.66 - stormTraceAxisA * stormTraceCone * 0.27);
vec3 stormReflectionRayD = normalize(stormReflectedView - stormTraceAxisB * stormTraceCone * 0.66 + stormTraceAxisA * stormTraceCone * 0.27);
vec3 stormReflectionRayE = normalize(stormReflectedView + (stormTraceAxisA + stormTraceAxisB) * stormTraceCone * 0.48);
vec3 stormReflectionRayF = normalize(stormReflectedView - (stormTraceAxisA + stormTraceAxisB) * stormTraceCone * 0.48);
vec3 stormReflectionRayG = normalize(stormReflectedView + (stormTraceAxisA - stormTraceAxisB) * stormTraceCone * 0.48);
vec3 stormReflectionRayH = normalize(stormReflectedView - (stormTraceAxisA - stormTraceAxisB) * stormTraceCone * 0.48);
vec3 stormRayColor = stormTraceSkyRadiance(stormReflectedView, vStormPoint, 0.0) * 0.24;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayA, vStormPoint, 1.7) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayB, vStormPoint, 4.3) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayC, vStormPoint, 7.1) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayD, vStormPoint, 10.9) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayE, vStormPoint, 13.7) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayF, vStormPoint, 17.3) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayG, vStormPoint, 20.1) * 0.095;
stormRayColor += stormTraceSkyRadiance(stormReflectionRayH, vStormPoint, 23.9) * 0.095;
float stormRayRadiance = dot(stormRayColor, vec3(0.2126, 0.7152, 0.0722));
float stormReflectedCloud = clamp(stormRayRadiance * 2.25, 0.0, 1.35);
float stormOvercastLift = smoothstep(0.31, 0.78, stormSkyElevation);
vec3 stormOvercastDark = mix(uStormSkyZenithColor * 0.1, uStormHorizonColor * 0.1, stormOvercastLift);
vec3 stormOvercastLight = stormSkyHighlightColor * 0.32;
vec3 stormOvercastReflection = mix(stormOvercastDark, stormOvercastLight, stormOvercastLift);
stormOvercastReflection *= mix(0.62, 1.18, stormReflectedCloud);
vec3 stormRayTracedReflection = mix(stormOvercastDark, stormRayColor * (0.76 + uStormAmbientStrength * 0.44), smoothstep(0.08, 0.9, stormSkyElevation));
stormOvercastReflection = mix(stormOvercastReflection, stormRayTracedReflection, ${rayTraceStrength.toFixed(4)});
vec3 stormSkyLightDirection = stormSunViewDirection();
float stormHorizonFlash = pow(max(dot(stormReflectedView, stormSkyLightDirection), 0.0), 38.0);
stormReflection += stormOvercastReflection;
stormReflection += mix(uStormSunColor, stormSkySpecularTint, 0.62) * stormHorizonFlash * (0.052 + uStormAmbientStrength * 0.038);
vec3 stormHalfDirection = normalize(stormSkyLightDirection + stormViewDirection);
vec3 stormSurfaceNormal = normalize(normal);
float stormNormalHighlight = max(dot(stormSurfaceNormal, stormHalfDirection), 0.0);
float stormNoV = max(dot(stormSurfaceNormal, stormViewDirection), 0.001);
float stormNoL = max(dot(stormSurfaceNormal, stormSkyLightDirection), 0.0);
float stormVoH = max(dot(stormViewDirection, stormHalfDirection), 0.0);
float stormGgxAlpha = max(0.025, roughnessFactor * roughnessFactor);
float stormGgxAlpha2 = stormGgxAlpha * stormGgxAlpha;
float stormGgxDenominator = stormNormalHighlight * stormNormalHighlight * (stormGgxAlpha2 - 1.0) + 1.0;
float stormGgxDistribution = stormGgxAlpha2 / max(3.14159265 * stormGgxDenominator * stormGgxDenominator, 0.0001);
float stormGgxK = (roughnessFactor + 1.0) * (roughnessFactor + 1.0) * 0.125;
float stormGgxVisibilityV = stormNoV / max(stormNoV * (1.0 - stormGgxK) + stormGgxK, 0.001);
float stormGgxVisibilityL = stormNoL / max(stormNoL * (1.0 - stormGgxK) + stormGgxK, 0.001);
float stormGgxFresnel = 0.02037 + 0.97963 * pow(1.0 - stormVoH, 5.0);
float stormSunSpecular = stormGgxDistribution * stormGgxVisibilityV * stormGgxVisibilityL * stormGgxFresnel;
stormSunSpecular *= stormNoL / max(4.0 * stormNoV * stormNoL, 0.001);
stormSunSpecular = min(stormSunSpecular * mix(0.62, 1.0, stormWindFacet), 0.072);
float stormBroadSkyLobe = pow(stormNormalHighlight, 16.0) * (1.0 - roughnessFactor) * 0.024;
float stormFineSkyGlint = pow(stormNormalHighlight, 76.0) * (1.0 - roughnessFactor) * (0.022 + vStormNearness * 0.032);
float stormRandomSparkle = smoothstep(0.72, 0.94, stormRandomCapillary * 0.58 + stormCrossCapillary * 0.26 + stormWindFacet * 0.16);
float stormCapillarySparkle = stormWindRidgeMask * 0.78 + stormRandomSparkle * stormStochasticFade * 0.22;
stormCapillarySparkle *= pow(stormNormalHighlight, 72.0) * (0.018 + vStormNearness * 0.034);
stormDirectSpecularV3 += mix(uStormSunColor, stormSkySpecularTint, 0.58) * stormSunSpecular * (0.2 + uStormAmbientStrength * 0.12);
stormReflection += stormSkySpecularTint * (stormBroadSkyLobe + stormFineSkyGlint + stormCapillarySparkle) * (0.22 + uStormAmbientStrength * 0.16);
float stormLightningWaterDistance = distance(vStormPoint, uStormLightningTarget);
float stormLightningWaterMask = 1.0 - smoothstep(18.0, 148.0, stormLightningWaterDistance);
stormDirectSpecularV3 += vec3(0.19, 0.085, 0.34) * stormLightningWaterMask * uStormLightningFlash
  * (0.055 + stormFresnel * 0.15) * (1.0 - roughnessFactor * 0.22);
stormReflection *= 0.82 + stormFacetPatch * 0.14 + stormMicroRoughness * 0.04;
float stormReflectionLuminance = dot(stormReflection, vec3(0.2126, 0.7152, 0.0722));
float stormReflectionShoulder = 1.0 / (1.0 + max(stormReflectionLuminance - 0.22, 0.0) * 1.85);
stormReflection *= stormReflectionShoulder;
float stormDirectLuminance = dot(stormDirectSpecularV3, vec3(0.2126, 0.7152, 0.0722));
stormDirectSpecularV3 *= 1.0 / (1.0 + max(stormDirectLuminance - 0.085, 0.0) * 3.2);

float stormViewIntoWater = smoothstep(0.18, 0.94, stormFacing);
float stormImpurityBroad = stormSurfaceFbm(vStormPoint * 0.083 + vec2(uStormTime * 0.004, -uStormTime * 0.006) + 14.7);
float stormImpurityFine = stormSurfaceNoise(vStormPoint * 0.47 - vec2(uStormTime * 0.011, uStormTime * 0.008) + 31.2);
float stormSuspendedMatter = smoothstep(0.54, 0.86, stormImpurityBroad * 0.72 + stormImpurityFine * 0.28);
float stormUnderwaterRayLength = mix(10.5, 3.2, stormViewIntoWater);
vec2 stormColumnDirection = normalize(vec2(0.31, -0.95) + vec2(stormMesoRipple, stormCrossMesoDetail) * 0.16);
vec3 stormColumnRay = normalize(vec3(stormColumnDirection.x, -max(stormFacing, 0.18), stormColumnDirection.y));
float stormTracedDensity = stormTraceUnderwaterDensity(vStormPoint, stormColumnRay, stormUnderwaterRayLength);
vec2 stormRefractedFoot = vStormPoint + stormColumnDirection * stormUnderwaterRayLength * (0.18 + (1.0 - stormFacing) * 0.34);
float stormWaterColumnBroad = stormSurfaceFbm(stormRefractedFoot * 0.061 + vec2(-uStormTime * 0.003, uStormTime * 0.002) + 63.1);
float stormWaterColumnDetail = stormSurfaceNoise(stormRefractedFoot * 0.29 + stormWaterColumnBroad * 2.7 - vec2(uStormTime * 0.008, uStormTime * 0.005) + 8.4);
float stormWaterColumnDepth = stormUnderwaterRayLength * mix(0.62, 1.42, stormWaterColumnBroad * 0.68 + stormWaterColumnDetail * 0.32);
stormWaterColumnDepth *= mix(0.9, 1.18, stormTracedDensity);
vec3 stormWaterAbsorption = exp(-vec3(0.082, 0.036, 0.021) * stormWaterColumnDepth);
vec2 stormScreenUv = gl_FragCoord.xy / max(uStormSceneResolution, vec2(1.0));
vec2 stormScreenRefractionOffset = normalize(normal).xy * (0.0016 + vStormNearness * 0.0024) * (0.68 + roughnessFactor * 0.24);
vec2 stormRefractedUvA = clamp(stormScreenUv + stormScreenRefractionOffset, vec2(0.002), vec2(0.998));
vec2 stormRefractedUvB = clamp(stormScreenUv + stormScreenRefractionOffset * 1.18, vec2(0.002), vec2(0.998));
vec3 stormSceneRefraction = texture2D(uStormSceneColor, stormRefractedUvA).rgb * 0.88;
stormSceneRefraction += texture2D(uStormSceneColor, stormRefractedUvB).rgb * 0.12;
vec3 stormProceduralIncident = mix(uStormHorizonColor, uStormSkyZenithColor, 0.34) * (0.105 + uStormAmbientStrength * 0.04);
vec3 stormIncidentWaterLight = mix(stormProceduralIncident, stormSceneRefraction, uStormSceneRefractionReady * 0.99);
stormIncidentWaterLight = mix(stormIncidentWaterLight, stormSkyHighlightColor * 0.11, stormViewIntoWater * (1.0 - uStormSceneRefractionReady) * 0.14);
vec3 stormSingleScatterColor = mix(vec3(0.003, 0.012, 0.016), vec3(0.006, 0.023, 0.029), stormSuspendedMatter);
vec3 stormSingleScatter = stormSingleScatterColor * (vec3(1.0) - stormWaterAbsorption);
stormSingleScatter *= (0.24 + stormTracedDensity * 0.17) * ${rayTraceStrength.toFixed(4)};
vec3 stormRefraction = stormIncidentWaterLight * stormWaterAbsorption + stormSingleScatter;
float stormSubsurfaceWindow = smoothstep(0.28, 0.78, stormWaterColumnDetail * 0.56 + (1.0 - stormTracedDensity) * 0.44);
stormRefraction *= mix(0.78, 1.12, stormSubsurfaceWindow);
stormRefraction *= mix(0.96, 1.025, stormWaterMottle);
stormRefraction += stormTransmissionTint * stormViewIntoWater * (0.002 + stormSubsurfaceWindow * 0.003);
float stormBacklitCrest = pow(max(dot(-stormSkyLightDirection, stormSurfaceNormal), 0.0), 1.35);
stormBacklitCrest *= vStormCrest * smoothstep(0.16, 0.68, vStormSlope) * (0.42 + vStormCurvature * 0.58);
float stormCrestThickness = clamp(stormFacetPatch * 0.46 + stormWaterVariation * 0.26 + (stormUltraFineA * 0.5 + 0.5) * 0.18 + vStormCurvature * 0.1, 0.0, 1.0);
stormCrestThickness *= 1.0 - clamp(stormFoam * 0.42, 0.0, 0.42);
float stormCrestThinness = 1.0 - stormCrestThickness;
vec3 stormCrestTransmissionColor = mix(vec3(0.009, 0.047, 0.055), uStormSkyHighlightColor * vec3(0.08, 0.145, 0.15), 0.18 + stormCrestThinness * 0.24);
stormRefraction += stormCrestTransmissionColor * stormBacklitCrest * (0.16 + stormCrestThinness * 0.2 + uStormAmbientStrength * 0.11);
stormRefraction += stormCrestTransmissionColor * stormMicroBreakRidge * stormBacklitCrest * 0.025;
float stormOpticalDepthVariation = smoothstep(0.16, 0.84, stormWaterVariation * 0.42 + vStormCrest * 0.2 + stormFacetPatch * 0.12 + stormSubsurfaceWindow * 0.26);
stormRefraction *= mix(0.84, 1.1, stormOpticalDepthVariation);
stormRefraction = max((stormRefraction - vec3(0.01)) * 1.12 + vec3(0.01), vec3(0.0));
stormRefraction *= mix(1.08, 1.28, stormViewIntoWater);

float stormReflectionWeight = clamp(stormFresnel * (1.0 - roughnessFactor * 0.16), 0.018, 0.965);
float stormReflectionNormalized = clamp((stormReflectionWeight - 0.018) / 0.947, 0.0, 1.0);
stormReflectionWeight = 0.018 + pow(stormReflectionNormalized, mix(1.0, 1.72, vStormNearness)) * 0.947;
stormReflectionWeight = min(stormReflectionWeight, mix(0.115, 0.965, 1.0 - vStormNearness));
vec3 stormWaterLight = mix(stormRefraction, stormReflection, stormReflectionWeight) + stormDirectSpecularV3;
float stormFoamBlend = clamp(stormFoam * (0.25 + stormCrestFoam * 0.14 + stormFoamFiligreeV2 * 0.06), 0.0, 0.24);
vec3 stormOutgoing = mix(stormWaterLight, stormFoamColor, stormFoamBlend);
float stormNaturalGlintMask = smoothstep(0.5, 0.86, stormWindRidgeMask * 0.5 + (stormUltraFineA * 0.5 + 0.5) * 0.25 + stormFacetPatch * 0.25);
stormNaturalGlintMask *= stormNearCapillaryFade * (1.0 - clamp(stormFoam * 0.72, 0.0, 0.72));
stormOutgoing += stormSkySpecularTint * stormNaturalGlintMask * stormFresnel * 0.09;
gl_FragColor = vec4(stormOutgoing, diffuseColor.a);`
        );
      material.userData.stormOceanShader = shader;
    };
    material.customProgramCacheKey = () => `fe-storm-ocean-${runtimeVersion}`;
    material.needsUpdate = true;
    return material;
  }

  function setColorTriplet(color, triplet, scale = 1) {
    color?.setRGB?.(triplet[0] * scale, triplet[1] * scale, triplet[2] * scale);
  }

  function thunderstormLighting(lighting, intensity, lightningFlash, config = {}) {
    const amount = smoothstep01(intensity);
    const flash = clamp(Number(lightningFlash) || 0, 0, 1);
    const exposureMultiplier = clamp(
      Number(config.thunderstorm?.clouds?.sceneExposureMultiplier) || 0.82,
      0.68,
      0.92
    );
    return {
      ...lighting,
      zenith: mixTriplet(lighting.zenith, [0.012, 0.018, 0.038], amount * 0.82),
      horizon: mixTriplet(lighting.horizon, [0.03, 0.04, 0.068], amount * 0.8),
      sun: mixTriplet(lighting.sun, [0.21, 0.15, 0.31], amount * 0.82),
      highlight: mixTriplet(
        mixTriplet(lighting.highlight, [0.24, 0.16, 0.45], amount * 0.78),
        [0.62, 0.45, 0.94],
        flash * 0.28
      ),
      ambient: lighting.ambient * mixNumber(1, 0.72, amount) + flash * 0.18,
      exposure: lighting.exposure * mixNumber(1, exposureMultiplier, amount) * (1 + flash * 0.2),
      lightningFlash: flash
    };
  }

  function beginLightningStrike(runtime, strikeIndex = runtime?.lightningStrikeCount || 0) {
    if (!runtime) return null;
    const strike = lightningStrikeAtIndex(strikeIndex, runtime.config);
    runtime.uniforms.lightningTarget.value.set(strike.target[0], strike.target[1]);
    runtime.uniforms.lightningSeed.value = strike.seed;
    runtime.lightningStartedAt = Number(runtime.currentTime) || 0;
    runtime.lightningStrikeCount = strike.index + 1;
    runtime.lastLightningTarget = [strike.target[0], 0, strike.target[1]];
    runtime.nextLightningAt = runtime.lightningStartedAt + strike.intervalSeconds;
    return strike;
  }

  function triggerLightning(runtime, strikeIndex) {
    return beginLightningStrike(
      runtime,
      Number.isFinite(Number(strikeIndex)) ? Number(strikeIndex) : runtime?.lightningStrikeCount || 0
    );
  }

  function updateSceneLightRig(rig, lighting) {
    if (!rig || !lighting) return;
    const lightningFlash = clamp(Number(lighting.lightningFlash) || 0, 0, 1);
    setColorTriplet(
      rig.hemisphere?.color,
      mixTriplet(lighting.zenith, [0.54, 0.48, 0.86], lightningFlash * 0.58)
    );
    setColorTriplet(rig.hemisphere?.groundColor, lighting.horizon, 0.22);
    if (rig.hemisphere) rig.hemisphere.intensity = 0.2 + lighting.ambient * 0.76 + lightningFlash * 0.45;
    setColorTriplet(
      rig.sun?.color,
      mixTriplet(lighting.sun, [0.82, 0.76, 1.0], lightningFlash * 0.82)
    );
    if (rig.sun) {
      rig.sun.intensity = 0.05 + lighting.ambient * 0.55 + lightningFlash * 1.6;
      const target = rig.target?.position || { x: 0, y: 0, z: -110 };
      rig.sun.position.set(
        target.x + lighting.sunDirection[0] * 260,
        target.y + lighting.sunDirection[1] * 260,
        target.z + lighting.sunDirection[2] * 260
      );
    }
    if (rig.scene?.background?.isColor) setColorTriplet(rig.scene.background, lighting.zenith, 0.17);
    if (rig.scene?.fog?.color) {
      const fogColor = mixTriplet(lighting.zenith, lighting.horizon, 0.26);
      setColorTriplet(rig.scene.fog.color, fogColor, 0.4);
    }
    if (rig.renderer) rig.renderer.toneMappingExposure = lighting.exposure;
  }

  function applyLighting(runtime, lighting) {
    const uniforms = runtime?.uniforms;
    if (!uniforms || !lighting) return;
    uniforms.sunDirection.value.set(...lighting.sunDirection);
    setColorTriplet(uniforms.sunColor.value, lighting.sun);
    setColorTriplet(uniforms.zenithColor.value, lighting.zenith);
    setColorTriplet(uniforms.horizonColor.value, lighting.horizon);
    setColorTriplet(uniforms.highlightColor.value, lighting.highlight);
    uniforms.ambient.value = lighting.ambient;
    runtime.lightingPhase = lighting.phase;
    runtime.lightingProgress = lighting.progress;
    runtime.currentLighting = lighting;
    updateSceneLightRig(runtime.sceneLightRig, lighting);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.stormLightingPhase = lighting.phase;
      document.documentElement.dataset.stormLightingProgress = lighting.progress.toFixed(4);
      document.documentElement.dataset.stormLightingMode = runtime.lightingMode || 'realtime';
    }
  }

  function setLightingMode(runtime, mode) {
    if (!runtime) return 'realtime';
    const normalizedMode = ['day', 'sunset', 'evening'].includes(mode) ? mode : 'realtime';
    if (runtime.lightingMode === normalizedMode) return normalizedMode;
    runtime.lightingTransitionFrom = runtime.currentBaseLighting
      || lightingForMode(runtime.lightingMode === 'realtime' ? 'day' : runtime.lightingMode, runtime.config);
    runtime.lightingTransitionStartedAt = Number(runtime.currentTime) || 0;
    runtime.lightingMode = normalizedMode;
    if (typeof document !== 'undefined') document.documentElement.dataset.stormLightingMode = normalizedMode;
    return normalizedMode;
  }

  function setThunderstormMode(runtime, mode) {
    if (!runtime) return 'auto';
    const normalizedMode = mode === 'on' || mode === 'off' ? mode : 'auto';
    runtime.thunderstormMode = normalizedMode;
    runtime.nextLightningAt = normalizedMode === 'on'
      ? (Number(runtime.currentTime) || 0) + 0.45
      : Number.POSITIVE_INFINITY;
    if (normalizedMode !== 'on') {
      runtime.lightningFlash = 0;
      runtime.uniforms.lightningFlash.value = 0;
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.stormWeatherMode = normalizedMode;
    }
    return normalizedMode;
  }

  function prepare(root, THREE, config = {}) {
    if (!root || !THREE) return null;
    const initialLighting = lightingAtMinute(0, config);
    const fallbackRefractionTexture = new THREE.DataTexture(
      new Uint8Array([2, 10, 15, 255]),
      1,
      1,
      THREE.RGBAFormat
    );
    fallbackRefractionTexture.name = 'StormOcean_FallbackRefraction';
    fallbackRefractionTexture.needsUpdate = true;
    const uniforms = {
      time: { value: 0 },
      bass: { value: 0 },
      idleHeight: { value: clamp(Math.min(Number(config.idleWaveHeight) || 0.48, 0.55), 0.08, 0.62) },
      bassHeight: { value: clamp(Number(config.bassWaveHeight) || 2.1, 0.2, 5.5) },
      sunDirection: { value: new THREE.Vector3(...initialLighting.sunDirection) },
      sunColor: { value: new THREE.Color().setRGB(...initialLighting.sun) },
      zenithColor: { value: new THREE.Color().setRGB(...initialLighting.zenith) },
      horizonColor: { value: new THREE.Color().setRGB(...initialLighting.horizon) },
      highlightColor: { value: new THREE.Color().setRGB(...initialLighting.highlight) },
      ambient: { value: initialLighting.ambient },
      thunder: { value: 0 },
      thunderFlow: { value: 0 },
      lightningFlash: { value: 0 },
      lightningTarget: { value: new THREE.Vector2(0, -170) },
      lightningSeed: { value: 0 },
      sceneColor: { value: fallbackRefractionTexture },
      sceneResolution: { value: new THREE.Vector2(1, 1) },
      sceneRefractionReady: { value: 0 }
    };
    const runtime = {
      profile: PROFILE,
      root,
      uniforms,
      cloudNodes: [],
      foamMaterials: [],
      oceanMaterials: [],
      oceanNodes: [],
      foamNodes: [],
      foamOverlays: [],
      skyDome: null,
      underwaterBackdrop: null,
      refractionTarget: null,
      refractionTargetSize: new THREE.Vector2(0, 0),
      refractionCaptureAt: 0,
      refractionCapturing: false,
      fallbackRefractionTexture,
      envelope: 0,
      follower: 0,
      lastTime: 0,
      lightingStartedAt: null,
      lightingMode: 'realtime',
      lightingPhase: initialLighting.phase,
      lightingProgress: 0,
      currentLighting: initialLighting,
      currentBaseLighting: initialLighting,
      lightingTransitionFrom: null,
      lightingTransitionStartedAt: 0,
      thunderstormMode: 'auto',
      thunderstormSource: 'none',
      thunderstormIntensity: 0,
      thunderFlow: 0,
      nextLightningAt: Number.POSITIVE_INFINITY,
      lightningStartedAt: Number.NEGATIVE_INFINITY,
      lightningFlash: 0,
      lightningStrikeCount: 0,
      lastLightningTarget: [0, 0, -170],
      seagullFlock: null,
      seagullLastPhase: initialLighting.phase,
      seagullSunsetStartedAt: null,
      seagullPreview: false,
      seagullPreviewStartedAt: 0,
      sceneLightRig: null,
      waterTextures: waterTextureSet(THREE, config),
      config
    };
    const materialSet = new Set();
    const foamSet = new Set();
    root.traverse((node) => {
      const name = String(node.name || '');
      if (node.isLight) {
        // Blender's Cycles area lights carry physically large watt values that
        // overexpose the realtime glTF renderer. The client owns a calibrated
        // realtime light rig, so exported render-only lights stay disabled.
        node.visible = false;
        node.intensity = 0;
        return;
      }
      if (/^StormClouds_(Near|Mid|Far|Horizon)$/i.test(name)) {
        node.userData.stormCloudBasePosition = node.position.clone();
        node.userData.stormCloudPhase = ((runtime.cloudNodes.length * 0.381966) + 0.17) % 1;
        runtime.cloudNodes.push(node);
      }
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (name === 'StormClouds_HorizonBackdrop') {
        node.visible = false;
        node.frustumCulled = true;
        return;
      }
      if (/^StormClouds_.*_Puff_/i.test(name)) {
        // Blender's displaced IcoSphere puffs flatten into bright discs after
        // glTF export. The live client renders its cloud volume as layered
        // procedural atmosphere instead, while these heavy meshes stay culled.
        node.visible = false;
        node.frustumCulled = true;
        return;
      }
      if (/^StormOcean_(Surface|Near|Far)/i.test(name)) {
        runtime.oceanNodes.push(node);
        materials.forEach((material) => {
          if (!material || materialSet.has(material)) return;
          materialSet.add(material);
          prepareOceanMaterial(material, THREE, config, uniforms);
          runtime.oceanMaterials.push(material);
        });
      }
      if (/Storm(Foam|Whitecap)/i.test(name)) {
        runtime.foamNodes.push(node);
        materials.forEach((material) => {
          if (!material || foamSet.has(material)) return;
          foamSet.add(material);
          material.userData = material.userData || {};
          material.userData.stormBaseOpacity = Number(material.opacity) || 0.58;
          material.userData.stormBaseEmissiveIntensity = Number(material.emissiveIntensity) || 0;
          runtime.foamMaterials.push(material);
        });
      }
      materials.forEach((material) => {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'displacementMap']) {
          const texture = material?.[key];
          if (!texture) continue;
          texture.anisotropy = Math.min(16, Number(config.maxAnisotropy) || 16);
          if ((key === 'normalMap' || key === 'roughnessMap') && THREE.LinearMipmapLinearFilter) {
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
          }
          texture.needsUpdate = true;
        }
      });
    });
    if (config.foamOverlayEnabled === true) {
      runtime.oceanNodes.forEach((node) => {
        if (!node.geometry) return;
        const overlay = createStormFoamOverlay(THREE, node.geometry, uniforms);
        overlay.userData.sceneItemId = node.userData.sceneItemId;
        node.add(overlay);
        runtime.foamOverlays.push(overlay);
      });
    }
    runtime.skyDome = createStormSkyDome(THREE, uniforms, config);
    root.add(runtime.skyDome);
    runtime.underwaterBackdrop = createStormUnderwaterBackdrop(THREE, uniforms);
    root.add(runtime.underwaterBackdrop);
    runtime.seagullFlock = createSunsetSeagullFlock(THREE, config);
    if (runtime.seagullFlock) root.add(runtime.seagullFlock.group);
    root.userData.stormOceanRuntime = runtime;
    applyLighting(runtime, initialLighting);
    return runtime;
  }

  function ensureRefractionTarget(runtime, renderer, THREE) {
    if (!runtime || !renderer || !THREE) return null;
    const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    const scale = ANDROID_CLIENT ? (LOW_END_ANDROID ? 0.42 : 0.54) : 0.72;
    const maximumWidth = ANDROID_CLIENT ? (LOW_END_ANDROID ? 720 : 1024) : 1600;
    const maximumHeight = ANDROID_CLIENT ? (LOW_END_ANDROID ? 405 : 576) : 900;
    const width = Math.max(240, Math.min(maximumWidth, Math.round(drawSize.x * scale)));
    const height = Math.max(135, Math.min(maximumHeight, Math.round(drawSize.y * scale)));
    if (!runtime.refractionTarget) {
      runtime.refractionTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false
      });
      runtime.refractionTarget.texture.name = 'StormOcean_SceneColorRefraction';
      runtime.refractionTarget.texture.generateMipmaps = false;
    } else if (runtime.refractionTarget.width !== width || runtime.refractionTarget.height !== height) {
      runtime.refractionTarget.setSize(width, height);
    }
    runtime.refractionTargetSize.set(width, height);
    runtime.uniforms.sceneResolution.value.set(Math.max(1, drawSize.x), Math.max(1, drawSize.y));
    runtime.uniforms.sceneColor.value = runtime.refractionTarget.texture;
    return runtime.refractionTarget;
  }

  function captureRefraction(scene, renderer, camera, now = 0) {
    if (!scene || !renderer || !camera) return false;
    const runtime = scene.userData?.stormOceanRuntime;
    if (!runtime || runtime.profile !== PROFILE || runtime.refractionCapturing) return false;
    const timestamp = Math.max(0, Number(now) || 0);
    const minimumCaptureInterval = ANDROID_CLIENT ? (LOW_END_ANDROID ? 82 : 54) : 38;
    if (runtime.uniforms.sceneRefractionReady.value > 0.5 && timestamp - runtime.refractionCaptureAt < minimumCaptureInterval) {
      runtime.uniforms.sceneResolution.value.set(
        Math.max(1, renderer.domElement?.width || 1),
        Math.max(1, renderer.domElement?.height || 1)
      );
      return true;
    }
    const THREE = global.THREE;
    const target = ensureRefractionTarget(runtime, renderer, THREE);
    if (!target) return false;

    runtime.refractionCapturing = true;
    const previousTarget = renderer.getRenderTarget?.() || null;
    const previousAutoClear = renderer.autoClear;
    const previousToneMapping = renderer.toneMapping;
    const previousShadowAutoUpdate = renderer.shadowMap?.autoUpdate;
    const hiddenNodes = [...runtime.oceanNodes, ...runtime.foamNodes, ...runtime.foamOverlays]
      .filter((node, index, nodes) => node && nodes.indexOf(node) === index)
      .map((node) => ({ node, visible: node.visible }));
    const backdropVisibility = runtime.underwaterBackdrop?.visible === true;
    try {
      hiddenNodes.forEach(({ node }) => { node.visible = false; });
      if (runtime.underwaterBackdrop) runtime.underwaterBackdrop.visible = true;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
      if (THREE.NoToneMapping !== undefined) renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      runtime.uniforms.sceneRefractionReady.value = 1;
      runtime.refractionCaptureAt = timestamp;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      renderer.toneMapping = previousToneMapping;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      hiddenNodes.forEach(({ node, visible }) => { node.visible = visible; });
      if (runtime.underwaterBackdrop) runtime.underwaterBackdrop.visible = backdropVisibility;
      runtime.refractionCapturing = false;
    }
    return true;
  }

  function dispose(runtime) {
    if (!runtime) return;
    runtime.refractionTarget?.dispose?.();
    runtime.refractionTarget = null;
    runtime.fallbackRefractionTexture?.dispose?.();
    runtime.fallbackRefractionTexture = null;
  }

  function update(runtime, now, lowFrequencyAmplitude, playing) {
    if (!runtime) return;
    const seconds = Math.max(0, Number(now) || 0) / 1000;
    const dt = runtime.lastTime ? clamp(seconds - runtime.lastTime, 1 / 240, 0.08) : 1 / 60;
    runtime.lastTime = seconds;
    let target = playing ? Math.pow(clamp(Number(lowFrequencyAmplitude) || 0, 0, 1), 0.72) : 0;
    if (target < 0.045) target = 0;
    const attack = clamp(Number(runtime.config.bassAttack) || 6.4, 1, 18);
    const release = clamp(Number(runtime.config.bassRelease) || 1.65, 0.4, 8);
    const envelopeRate = target > runtime.envelope ? attack : release;
    runtime.envelope += (target - runtime.envelope) * (1 - Math.exp(-envelopeRate * dt));
    runtime.follower += (runtime.envelope - runtime.follower) * (1 - Math.exp(-4.2 * dt));
    const smoothBass = clamp(runtime.follower, 0, 1);
    runtime.currentTime = seconds;
    runtime.currentBass = smoothBass;
    runtime.uniforms.time.value = seconds;
    runtime.uniforms.bass.value = smoothBass;
    if (!Number.isFinite(runtime.lightingStartedAt)) runtime.lightingStartedAt = seconds;
    const lightingElapsedMinutes = Math.max(0, seconds - runtime.lightingStartedAt) / 60;
    const scheduledThunderstorm = thunderstormAtMinute(lightingElapsedMinutes, runtime.config);
    const thunderstormSettings = runtime.config.thunderstorm || {};
    const scheduledActive = runtime.lightingMode === 'realtime' && scheduledThunderstorm.active;
    const thunderstormTarget = thunderstormSettings.enabled === false || runtime.thunderstormMode === 'off'
      ? 0
      : runtime.thunderstormMode === 'on' || scheduledActive
        ? 1
        : 0;
    runtime.thunderstormSource = runtime.thunderstormMode === 'on'
      ? 'manual'
      : scheduledActive
        ? 'scheduled'
        : 'none';
    const cloudSettings = thunderstormSettings.clouds || {};
    const thunderstormRate = thunderstormTarget > runtime.thunderstormIntensity
      ? 3 / clamp(Number(cloudSettings.buildSeconds) || 12, 2, 45)
      : 3 / clamp(Number(cloudSettings.clearSeconds) || 18, 3, 60);
    runtime.thunderstormIntensity += (thunderstormTarget - runtime.thunderstormIntensity)
      * (1 - Math.exp(-thunderstormRate * dt));
    runtime.thunderstormIntensity = clamp(runtime.thunderstormIntensity, 0, 1);
    runtime.thunderFlow += runtime.thunderstormIntensity * dt;
    runtime.uniforms.thunder.value = runtime.thunderstormIntensity;
    runtime.uniforms.thunderFlow.value = runtime.thunderFlow;

    if (thunderstormTarget > 0) {
      if (!Number.isFinite(runtime.nextLightningAt)) runtime.nextLightningAt = seconds + 0.45;
      if (runtime.thunderstormIntensity > 0.12 && seconds >= runtime.nextLightningAt) {
        beginLightningStrike(runtime);
      }
    } else {
      runtime.nextLightningAt = Number.POSITIVE_INFINITY;
      runtime.lightningStartedAt = Number.NEGATIVE_INFINITY;
    }
    const lightningAge = seconds - runtime.lightningStartedAt;
    let lightningFlash = 0;
    if (thunderstormTarget > 0 && lightningAge >= 0 && lightningAge < 0.62) {
      const primary = Math.exp(-lightningAge * 18);
      const secondary = lightningAge >= 0.08 ? 0.48 * Math.exp(-(lightningAge - 0.08) * 30) : 0;
      const aftershock = lightningAge >= 0.19 ? 0.22 * Math.exp(-(lightningAge - 0.19) * 42) : 0;
      lightningFlash = clamp(primary + secondary + aftershock, 0, 1);
    }
    runtime.lightningFlash = lightningFlash;
    runtime.uniforms.lightningFlash.value = lightningFlash;

    const targetLighting = runtime.lightingMode === 'realtime'
      ? lightingAtElapsedMinute(lightingElapsedMinutes, runtime.config)
      : lightingForMode(runtime.lightingMode, runtime.config);
    let nextLighting = targetLighting;
    if (runtime.lightingTransitionFrom) {
      const transitionSeconds = clamp(Number(runtime.config.lightingModeTransitionSeconds) || 0.75, 0.2, 2.5);
      const transitionProgress = clamp((seconds - runtime.lightingTransitionStartedAt) / transitionSeconds, 0, 1);
      nextLighting = mixLightingState(runtime.lightingTransitionFrom, targetLighting, transitionProgress);
      if (transitionProgress >= 1) runtime.lightingTransitionFrom = null;
    }
    runtime.currentBaseLighting = nextLighting;
    applyLighting(runtime, thunderstormLighting(
      nextLighting,
      runtime.thunderstormIntensity,
      lightningFlash,
      runtime.config
    ));
    const seagullPhase = nextLighting.phase;
    if (runtime.seagullLastPhase !== seagullPhase) {
      runtime.seagullLastPhase = seagullPhase;
      runtime.seagullSunsetStartedAt = seagullPhase === 'sunset' ? seconds : null;
    }
    if (seagullPhase === 'sunset' && !Number.isFinite(runtime.seagullSunsetStartedAt)) {
      runtime.seagullSunsetStartedAt = seconds;
    }
    const seagullPhaseSeconds = seagullPhase === 'sunset'
      ? Math.max(0, seconds - runtime.seagullSunsetStartedAt)
      : 0;
    updateSunsetSeagullFlock(runtime, seconds, seagullPhaseSeconds, seagullPhase, dt);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.stormWeatherMode = runtime.thunderstormMode;
      document.documentElement.dataset.stormThunderstormActive = String(runtime.thunderstormIntensity > 0.04);
      document.documentElement.dataset.stormThunderstormSource = runtime.thunderstormSource;
      document.documentElement.dataset.stormLightningActive = String(lightningFlash > 0.02);
      document.documentElement.dataset.stormLightingCycle = String(targetLighting.cycleIndex || 0);
    }
    if (runtime.waterTextures) {
      const drift = seconds * (0.0022 + smoothBass * 0.0005);
      const driftX = (-drift * 0.94) % 1;
      const driftY = (-drift * 0.34) % 1;
      runtime.waterTextures.normalMap.offset.set(driftX, driftY);
      runtime.waterTextures.roughnessMap.offset.copy(runtime.waterTextures.normalMap.offset);
    }

    const cloudTravel = clamp(Number(runtime.config.cloudTravel) || 42, 8, 120);
    const cloudSpeed = clamp(Number(runtime.config.cloudSpeed) || 0.028, 0.004, 0.12);
    runtime.cloudNodes.forEach((node, index) => {
      const base = node.userData.stormCloudBasePosition;
      if (!base) return;
      const name = String(node.name || '');
      const layerSpeed = /Near/i.test(name) ? 1 : /Mid/i.test(name) ? 0.62 : /Far/i.test(name) ? 0.36 : 0.22;
      const progress = (seconds * cloudSpeed * layerSpeed + node.userData.stormCloudPhase) % 1;
      node.position.z = base.z - progress * cloudTravel;
      node.position.x = base.x + Math.sin(seconds * 0.021 * layerSpeed + index) * cloudTravel * 0.035;
      node.position.y = base.y + Math.sin(seconds * 0.033 + index * 1.7) * 0.16;
    });
    runtime.foamMaterials.forEach((material) => {
      const baseOpacity = Number(material.userData.stormBaseOpacity) || 0.58;
      material.opacity = clamp(baseOpacity * (1 + smoothBass * 0.34), 0, 1);
      const baseEmission = Number(material.userData.stormBaseEmissiveIntensity) || 0;
      if ('emissiveIntensity' in material) material.emissiveIntensity = baseEmission * (1 + smoothBass * 0.7);
    });
  }

  function configureScene(scene, renderer, THREE, config = {}) {
    if (!scene || !renderer || !THREE) return;
    const environment = environmentMap(THREE);
    scene.environment = environment;
    scene.background = new THREE.Color(0x061019);
    const requestedFog = Number(config.fogDensity) || 0.001;
    scene.fog = new THREE.FogExp2(0x07131a, clamp(Math.min(requestedFog, 0.0018), 0.00075, 0.004));
    renderer.shadowMap.enabled = !ANDROID_CLIENT;
    if (!ANDROID_CLIENT && THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    let rig = scene.userData.stormOceanLightRig;
    if (!rig) {
      const hemisphere = new THREE.HemisphereLight(0xc8e8f4, 0x071015, 0.8);
      hemisphere.name = 'StormCycleHemisphere';
      const sun = new THREE.DirectionalLight(0xffeed2, 1.2);
      sun.name = 'StormCycleSun';
      sun.castShadow = !ANDROID_CLIENT;
      const shadowSize = ANDROID_CLIENT ? 512 : 2048;
      sun.shadow.mapSize.set(shadowSize, shadowSize);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 700;
      sun.shadow.camera.left = -190;
      sun.shadow.camera.right = 190;
      sun.shadow.camera.top = 190;
      sun.shadow.camera.bottom = -190;
      const target = new THREE.Object3D();
      target.name = 'StormCycleSunTarget';
      target.position.set(0, 0, -110);
      sun.target = target;
      scene.add(hemisphere, sun, target);
      rig = { scene, renderer, hemisphere, sun, target };
      scene.userData.stormOceanLightRig = rig;
    } else {
      rig.renderer = renderer;
    }
    const initialLighting = lightingAtMinute(0, config);
    updateSceneLightRig(rig, initialLighting);
    scene.traverse((node) => {
      const runtime = node.userData?.stormOceanRuntime;
      if (!runtime || runtime.profile !== PROFILE) return;
      scene.userData.stormOceanRuntime = runtime;
      runtime.sceneLightRig = rig;
      updateSceneLightRig(rig, runtime.currentLighting || lightingAtMinute(0, config));
    });
  }

  function isProfile(config) {
    return config?.profile === PROFILE;
  }

  global.FeStormOceanRuntime = Object.freeze({
    PROFILE,
    runtimeVersion,
    isProfile,
    prepare,
    update,
    setLightingMode,
    setThunderstormMode,
    triggerLightning,
    setSeagullPreview,
    captureRefraction,
    dispose,
    configureScene,
    lightingAtMinute,
    lightingAtElapsedMinute,
    thunderstormAtMinute,
    lightningStrikeAtIndex,
    sunsetSeagullFlightAtSecond,
    sampleSunsetSeagullPose,
    sampleBassSurgeState,
    sampleOmnidirectionalBassWaveHeight,
    sampleWaveHeight,
    sampleWaveFrame
  });
})(window);
