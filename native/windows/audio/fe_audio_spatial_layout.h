#pragma once

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace fe::audio {

struct SpatialBedObjectPose {
    float azimuth;
    float elevation;
    float distance;
};

// The bed is intentionally not a flat unit-radius ring. Distinct depth and
// elevation tiers give OBR/X3DAudio enough geometry to encode front/side/back
// distance as well as direction. Canonical 7.1 order is
// FL, FR, FC, LFE, BL, BR, SL, SR; 5.1 is FL, FR, FC, LFE, SL, SR.
inline SpatialBedObjectPose DefaultSpatialBedObjectPose(
    uint32_t channels,
    uint32_t channel
) noexcept {
    if (channels == 8) {
        constexpr SpatialBedObjectPose kLayout[8] = {
            {30.0f, 0.0f, 1.00f},
            {-30.0f, 0.0f, 1.00f},
            {0.0f, 2.0f, 0.82f},
            {0.0f, -30.0f, 1.05f},
            {135.0f, -7.0f, 1.55f},
            {-135.0f, -7.0f, 1.55f},
            {90.0f, 5.0f, 1.28f},
            {-90.0f, 5.0f, 1.28f},
        };
        return kLayout[std::min<uint32_t>(channel, 7u)];
    }
    if (channels == 6) {
        constexpr SpatialBedObjectPose kLayout[6] = {
            {30.0f, 0.0f, 1.00f},
            {-30.0f, 0.0f, 1.00f},
            {0.0f, 2.0f, 0.82f},
            {0.0f, -30.0f, 1.05f},
            {110.0f, 5.0f, 1.28f},
            {-110.0f, 5.0f, 1.28f},
        };
        return kLayout[std::min<uint32_t>(channel, 5u)];
    }
    constexpr SpatialBedObjectPose kStereo[2] = {
        {30.0f, 0.0f, 1.00f},
        {-30.0f, 0.0f, 1.00f},
    };
    return kStereo[std::min<uint32_t>(channel, 1u)];
}

constexpr float kSpatialDistanceCurveScaleMeters = 2.0f;

// Keep route calibration below the emergency limiter and shared with the
// independent quality fixture. These values compensate only for the expected
// stereo fold / OBR normalization; they are not loudness makeup gains.
constexpr float kSpatialUpmixStereoFoldCalibration = 1.25f;
constexpr float kSpatialMatrixDecodeStereoFoldCalibration = 1.75f;
constexpr float kSpatialObrUpmixRouteCalibration = 0.90f;
constexpr float kSpatialObrStereoRouteCalibration = 0.99f;
constexpr float kSpatialObrMatrixDecodeMakeup = 1.33f;
constexpr float kSpatialObrAggregateInputCeiling = 0.80f;
constexpr float kSpatialObrHeadroomReleaseSeconds = 0.25f;

// OBR sums multiple spatial objects before its own limiter. A fixed 1/sqrt(N)
// normalization is energy-correct for decorrelated beds but can still overload
// on coherent bass, ambience, or custom matrices. This block peak bound keeps
// the aggregate object feed linear without reducing ordinary programme audio.
inline float SpatialObrBlockInputHeadroom(
    const float* interleaved,
    uint32_t frames,
    uint32_t channels
) noexcept {
    if (interleaved == nullptr || frames == 0 || channels == 0) return 1.0f;
    const float nominal = 1.0f / std::sqrt(static_cast<float>(channels));
    float aggregate_peak = 0.0f;
    for (uint32_t frame = 0; frame < frames; ++frame) {
        float aggregate = 0.0f;
        for (uint32_t channel = 0; channel < channels; ++channel) {
            const float sample = interleaved[
                static_cast<size_t>(frame) * channels + channel
            ];
            if (std::isfinite(sample)) aggregate += std::abs(sample);
        }
        aggregate_peak = std::max(aggregate_peak, aggregate);
    }
    if (aggregate_peak <= kSpatialObrAggregateInputCeiling) return nominal;
    return std::min(
        nominal,
        kSpatialObrAggregateInputCeiling / aggregate_peak
    );
}

inline float SmoothSpatialObrInputHeadroom(
    float current,
    float target,
    uint32_t frames,
    uint32_t sample_rate
) noexcept {
    if (!std::isfinite(target) || target <= 0.0f) return 0.0f;
    if (!std::isfinite(current) || current <= 0.0f || target <= current) {
        return target;
    }
    const float release = std::exp(
        -static_cast<float>(frames)
            / (std::max(1u, sample_rate) * kSpatialObrHeadroomReleaseSeconds)
    );
    return std::min(target, release * current + (1.0f - release) * target);
}

// XAudio2's documented X3DAudio LPF conversion. The result is suitable as a
// stable one-pole smoothing coefficient for the OBR object feed.
inline float X3dDirectLpfOnePoleAlpha(float lpf_direct) noexcept {
    constexpr float kPi = 3.14159265358979323846f;
    const float coefficient = std::clamp(lpf_direct, 0.0f, 1.0f);
    return std::clamp(
        2.0f * std::sin(kPi / 6.0f * coefficient),
        0.0f,
        1.0f
    );
}

}  // namespace fe::audio
