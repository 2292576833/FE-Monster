/*
 * Runtime asset selector for FE Monster's stereo Google OBR build.
 *
 * This keeps only the official third-order Ambient left/right filter assets
 * needed by AudioElementType::kLayoutStereo. The filter data and renderer are
 * unmodified Google OBR sources.
 */

#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_wrapper.h"

#include <memory>
#include <string>

#include "absl/types/span.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_ambient_l.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_ambient_r.h"

namespace obr {

BinauralFiltersWrapper::BinauralFiltersWrapper() = default;

BinauralFiltersWrapper::~BinauralFiltersWrapper() = default;

std::unique_ptr<std::string> BinauralFiltersWrapper::GetFile(
    const std::string& filename) const {
  absl::Span<const unsigned char> data;
  if (filename == "3OAAmbientL") {
    data = filter_files::BinauralFilters3OAAmbientL();
  } else if (filename == "3OAAmbientR") {
    data = filter_files::BinauralFilters3OAAmbientR();
  } else {
    return nullptr;
  }
  return std::make_unique<std::string>(
      reinterpret_cast<const char*>(data.data()), data.size());
}

}  // namespace obr
