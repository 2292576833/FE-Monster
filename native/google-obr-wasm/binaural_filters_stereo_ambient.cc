/*
 * Runtime asset selector for FE Monster's stereo Google OBR build.
 *
 * This packages the official third-order Direct, Ambient, and Reverberant
 * left/right filter assets used by the native renderer. The filter data and
 * renderer are unmodified Google OBR sources.
 */

#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_wrapper.h"

#include <memory>
#include <string>

#include "absl/types/span.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_ambient_l.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_ambient_r.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_direct_l.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_direct_r.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_reverberant_l.h"
#include "obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_reverberant_r.h"

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
  } else if (filename == "3OADirectL") {
    data = filter_files::BinauralFilters3OADirectL();
  } else if (filename == "3OADirectR") {
    data = filter_files::BinauralFilters3OADirectR();
  } else if (filename == "3OAReverberantL") {
    data = filter_files::BinauralFilters3OAReverberantL();
  } else if (filename == "3OAReverberantR") {
    data = filter_files::BinauralFilters3OAReverberantR();
  } else {
    return nullptr;
  }
  return std::make_unique<std::string>(
      reinterpret_cast<const char*>(data.data()), data.size());
}

}  // namespace obr
