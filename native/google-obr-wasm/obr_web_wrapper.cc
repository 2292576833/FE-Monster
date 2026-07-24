/*
 * FE Monster WebAssembly bridge for Google Open Binaural Renderer.
 *
 * The renderer implementation linked by this bridge is the official Google
 * OBR source pinned in REVISION. Google OBR remains subject to its BSD
 * 3-Clause Clear License and Open Binaural Renderer Patent License 1.0.
 */

#include <cstddef>
#include <cstdint>
#include <memory>
#include <new>

#include <emscripten/emscripten.h>

#include "obr/audio_buffer/audio_buffer.h"
#include "obr/renderer/audio_element_config.h"
#include "obr/renderer/audio_element_type.h"
#include "obr/renderer/obr_impl.h"

namespace {

constexpr int kStereoChannels = 2;
constexpr int kAmbientProfile = 1;

struct ObrWebRenderer {
  ObrWebRenderer(int frames, int sampling_rate,
                 obr::BinauralFilterProfile profile)
      : frame_count(frames),
        renderer(frames, sampling_rate),
        input(kStereoChannels, frames),
        output(kStereoChannels, frames) {
    status = renderer.AddAudioElement(obr::AudioElementType::kLayoutStereo,
                                      profile)
                 .ok()
             ? 1
             : 0;
  }

  int frame_count;
  int status = 0;
  obr::ObrImpl renderer;
  obr::AudioBuffer input;
  obr::AudioBuffer output;
};

ObrWebRenderer* FromHandle(std::uintptr_t handle) {
  return reinterpret_cast<ObrWebRenderer*>(handle);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE std::uintptr_t obr_create(int frame_count,
                                               int sampling_rate,
                                               int filter_profile) {
  if (frame_count <= 0 || sampling_rate <= 0 ||
      filter_profile != kAmbientProfile) {
    return 0;
  }
  auto* renderer =
      new (std::nothrow) ObrWebRenderer(
          frame_count, sampling_rate, obr::BinauralFilterProfile::kAmbient);
  if (renderer == nullptr || renderer->status != 1) {
    delete renderer;
    return 0;
  }
  return reinterpret_cast<std::uintptr_t>(renderer);
}

EMSCRIPTEN_KEEPALIVE void obr_destroy(std::uintptr_t handle) {
  delete FromHandle(handle);
}

EMSCRIPTEN_KEEPALIVE int obr_is_ready(std::uintptr_t handle) {
  const auto* renderer = FromHandle(handle);
  return renderer != nullptr && renderer->status == 1 ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int obr_frame_count(std::uintptr_t handle) {
  const auto* renderer = FromHandle(handle);
  return renderer == nullptr ? 0 : renderer->frame_count;
}

EMSCRIPTEN_KEEPALIVE float* obr_input_channel(std::uintptr_t handle,
                                              int channel) {
  auto* renderer = FromHandle(handle);
  if (renderer == nullptr || channel < 0 || channel >= kStereoChannels) {
    return nullptr;
  }
  return renderer->input[static_cast<std::size_t>(channel)].begin();
}

EMSCRIPTEN_KEEPALIVE float* obr_output_channel(std::uintptr_t handle,
                                               int channel) {
  auto* renderer = FromHandle(handle);
  if (renderer == nullptr || channel < 0 || channel >= kStereoChannels) {
    return nullptr;
  }
  return renderer->output[static_cast<std::size_t>(channel)].begin();
}

EMSCRIPTEN_KEEPALIVE int obr_process(std::uintptr_t handle) {
  auto* renderer = FromHandle(handle);
  if (renderer == nullptr || renderer->status != 1) return 0;
  renderer->renderer.Process(renderer->input, &renderer->output);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* obr_backend_name() {
  return "google-obr-official";
}

EMSCRIPTEN_KEEPALIVE const char* obr_source_revision() {
  return "478dc7c752d5eccae534635139ff0253eee3a14a";
}

}  // extern "C"
