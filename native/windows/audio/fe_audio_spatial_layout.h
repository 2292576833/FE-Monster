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

// Canonical 7.1 order is FL, FR, FC, LFE, BL, BR, SL, SR; 5.1 is
// FL, FR, FC, LFE, SL, SR.
inline SpatialBedObjectPose DefaultSpatialBedObjectPose(
    uint32_t channels,
    uint32_t channel
) noexcept {
    if (channels == 8) {
        constexpr SpatialBedObjectPose kLayout[8] = {
            {30.0f, 0.0f, 1.0f},
            {-30.0f, 0.0f, 1.0f},
            {0.0f, 0.0f, 1.0f},
            {0.0f, -30.0f, 1.0f},
            {135.0f, 0.0f, 1.0f},
            {-135.0f, 0.0f, 1.0f},
            {90.0f, 0.0f, 1.0f},
            {-90.0f, 0.0f, 1.0f},
        };
        return kLayout[std::min<uint32_t>(channel, 7u)];
    }
    if (channels == 6) {
        constexpr SpatialBedObjectPose kLayout[6] = {
            {30.0f, 0.0f, 1.0f},
            {-30.0f, 0.0f, 1.0f},
            {0.0f, 0.0f, 1.0f},
            {0.0f, -30.0f, 1.0f},
            {110.0f, 0.0f, 1.0f},
            {-110.0f, 0.0f, 1.0f},
        };
        return kLayout[std::min<uint32_t>(channel, 5u)];
    }
    constexpr SpatialBedObjectPose kStereo[2] = {
        {30.0f, 0.0f, 1.00f},
        {-30.0f, 0.0f, 1.00f},
    };
    return kStereo[std::min<uint32_t>(channel, 1u)];
}

inline float SpatialBedAzimuthForWidth(
    uint32_t channels,
    uint32_t channel,
    float base_azimuth,
    float width
) noexcept {
    const float safe_width = std::clamp(width, 0.0f, 2.0f);
    if (!std::isfinite(base_azimuth)) return 0.0f;
    if (safe_width <= 1.0f) return base_azimuth * safe_width;
    float sector_limit = 0.0f;
    if (channel <= 1) sector_limit = 60.0f;
    else if (channels == 8 && channel >= 4 && channel <= 5) sector_limit = 150.0f;
    else if ((channels == 6 && channel >= 4) || (channels == 8 && channel >= 6)) {
        sector_limit = 120.0f;
    }
    if (sector_limit == 0.0f || std::abs(base_azimuth) <= 1.0e-6f) return 0.0f;
    const float signed_limit = std::copysign(sector_limit, base_azimuth);
    return base_azimuth + (signed_limit - base_azimuth) * (safe_width - 1.0f);
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

}  // namespace fe::audio
