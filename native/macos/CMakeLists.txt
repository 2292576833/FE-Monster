cmake_minimum_required(VERSION 3.24)
project(fe_monster_macos_audio LANGUAGES C CXX)
if(NOT APPLE)
  message(FATAL_ERROR "CoreAudio requires the Apple SDK; run the portable PCM probe independently on other platforms.")
endif()
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(BUILD_SHARED_LIBS OFF)
if(NOT EXISTS "${OBR_SOURCE_DIR}/obr/renderer/obr_impl.cc")
  message(FATAL_ERROR "OBR_SOURCE_DIR must refer to the pinned Google OBR checkout.")
endif()
if(NOT EXISTS "${FE_JNI_INCLUDE_DIR}/jni.h" OR NOT EXISTS "${FE_JNI_PLATFORM_INCLUDE_DIR}/jni_md.h")
  message(FATAL_ERROR "Set the JDK JNI include directories.")
endif()
if(NOT EXISTS "${FE_RUST_AUDIO_LIBRARY}")
  message(FATAL_ERROR "Build the Rust audio dylib before configuring CoreAudio.")
endif()
include(FetchContent)
if(POLICY CMP0169)
  cmake_policy(SET CMP0169 OLD)
endif()

FetchContent_Declare(
  absl
  GIT_REPOSITORY https://github.com/abseil/abseil-cpp.git
  GIT_TAG 20250512.1
)
FetchContent_Declare(
  eigen
  GIT_REPOSITORY https://gitlab.com/libeigen/eigen.git
  GIT_TAG 3147391d946bb4b6c68edd901f2add6ac1f31f8c
)
FetchContent_Declare(
  pffft_source
  GIT_REPOSITORY https://bitbucket.org/jpommier/pffft.git
  GIT_TAG 180c2d62717c0150d8aebd165fce19ee4e5f86f9
)
FetchContent_MakeAvailable(absl)
FetchContent_GetProperties(eigen)
if(NOT eigen_POPULATED)
  FetchContent_Populate(eigen)
endif()
FetchContent_GetProperties(pffft_source)
if(NOT pffft_source_POPULATED)
  FetchContent_Populate(pffft_source)
endif()

add_library(pffft STATIC "${pffft_source_SOURCE_DIR}/pffft.c")
target_include_directories(pffft PUBLIC "${pffft_source_SOURCE_DIR}")
if(MSVC)
  target_compile_definitions(pffft PRIVATE _USE_MATH_DEFINES)
  target_compile_options(pffft PRIVATE /O2 /fp:fast)
else()
target_compile_options(pffft PRIVATE -O3)
endif()

# The pinned OBR API takes a small render quantum, while its FFT manager
# derives the analysis size by doubling that quantum.  Generate a build-local
# copy with the requested 8192-point analysis FFT so XAudio2 still receives
# 256-frame realtime blocks and the source checkout remains pristine.
set(FE_OBR_FFT_MANAGER_SOURCE
  "${CMAKE_CURRENT_BINARY_DIR}/fe_obr_fft_manager_8192.cc"
)
file(READ
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/fft_manager.cc"
  FE_OBR_FFT_MANAGER_TEXT
)
string(REPLACE
  "NextPowTwo(frames_per_buffer) * 2"
  "static_cast<size_t>(8192)"
  FE_OBR_FFT_MANAGER_TEXT
  "${FE_OBR_FFT_MANAGER_TEXT}"
)
set(FE_OBR_FFT_NEEDLE "NextPowTwo(frames_per_buffer) * 2")
string(FIND "${FE_OBR_FFT_MANAGER_TEXT}" "${FE_OBR_FFT_NEEDLE}" FE_OBR_FFT_NEEDLE_POSITION)
if(FE_OBR_FFT_NEEDLE_POSITION GREATER_EQUAL 0)
  message(FATAL_ERROR "Unable to apply the 8192-point OBR FFT tuning")
endif()
# Frequency magnitude/phase utilities index FFT bins, not render frames. Keep
# their half-spectrum lengths consistent with the enlarged transform as well.
string(FIND "${FE_OBR_FFT_MANAGER_TEXT}" "void FftManager::MagnitudeFromCanonicalFreqBuffer(" FE_OBR_BINS_BEGIN)
string(FIND "${FE_OBR_FFT_MANAGER_TEXT}" "void FftManager::FreqDomainConvolution(" FE_OBR_BINS_END)
if(FE_OBR_BINS_BEGIN LESS 0 OR FE_OBR_BINS_END LESS FE_OBR_BINS_BEGIN)
  message(FATAL_ERROR "Unable to locate the OBR magnitude/phase FFT-bin utilities")
endif()
math(EXPR FE_OBR_BINS_LENGTH "${FE_OBR_BINS_END} - ${FE_OBR_BINS_BEGIN}")
string(SUBSTRING "${FE_OBR_FFT_MANAGER_TEXT}" 0 ${FE_OBR_BINS_BEGIN} FE_OBR_FFT_PREFIX)
string(SUBSTRING "${FE_OBR_FFT_MANAGER_TEXT}" ${FE_OBR_BINS_BEGIN} ${FE_OBR_BINS_LENGTH} FE_OBR_FFT_BINS)
string(SUBSTRING "${FE_OBR_FFT_MANAGER_TEXT}" ${FE_OBR_BINS_END} -1 FE_OBR_FFT_SUFFIX)
string(REPLACE "frames_per_buffer_" "(fft_size_ / 2)" FE_OBR_FFT_BINS "${FE_OBR_FFT_BINS}")
set(FE_OBR_FFT_MANAGER_TEXT "${FE_OBR_FFT_PREFIX}${FE_OBR_FFT_BINS}${FE_OBR_FFT_SUFFIX}")
file(WRITE "${FE_OBR_FFT_MANAGER_SOURCE}" "${FE_OBR_FFT_MANAGER_TEXT}")

# The decoder's frequency input must use the same size as FftManager. Keeping
# the upstream 2 * render-quantum allocation after increasing the FFT would
# let PFFFT write 8192 floats into a 512-float buffer on the first OBR block.
set(FE_OBR_DECODER_SOURCE
  "${CMAKE_CURRENT_BINARY_DIR}/fe_obr_ambisonic_binaural_decoder_8192.cc"
)
file(READ
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/ambisonic_binaural_decoder.cc"
  FE_OBR_DECODER_TEXT
)
set(FE_OBR_DECODER_NEEDLE "NextPowTwo(frames_per_buffer) * kNumStereoChannels")
string(FIND "${FE_OBR_DECODER_TEXT}" "${FE_OBR_DECODER_NEEDLE}" FE_OBR_DECODER_NEEDLE_POSITION)
if(FE_OBR_DECODER_NEEDLE_POSITION LESS 0)
  message(FATAL_ERROR "Unable to locate the OBR decoder frequency-buffer allocation")
endif()
string(REPLACE "${FE_OBR_DECODER_NEEDLE}" "fft_manager->GetFftSize()"
  FE_OBR_DECODER_TEXT "${FE_OBR_DECODER_TEXT}")
file(WRITE "${FE_OBR_DECODER_SOURCE}" "${FE_OBR_DECODER_TEXT}")

set(OBR_CORE_SOURCES
  "${FE_OBR_DECODER_SOURCE}"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/dsp_utils.cc"
  "${FE_OBR_FFT_MANAGER_SOURCE}"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/partitioned_fft_filter.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/planar_interleaved_conversion.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/resampler.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/sample_type_conversion.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/sh_hrir_creator.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/wav.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/wav_reader.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_ambient_l.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_ambient_r.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_direct_l.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_direct_r.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_reverberant_l.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/binaural_filters/binaural_filters_3_oa_reverberant_r.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_encoder/ambisonic_encoder.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_encoder/associated_legendre_polynomials_generator.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_rotator/ambisonic_rotator.cc"
  "${OBR_SOURCE_DIR}/obr/audio_buffer/audio_buffer.cc"
  "${OBR_SOURCE_DIR}/obr/audio_buffer/channel_view.cc"
  "${OBR_SOURCE_DIR}/obr/audio_buffer/simd_utils.cc"
  "${OBR_SOURCE_DIR}/obr/peak_limiter/peak_limiter.cc"
  "${OBR_SOURCE_DIR}/obr/renderer/audio_element_config.cc"
  "${OBR_SOURCE_DIR}/obr/renderer/obr_impl.cc"
  "${CMAKE_CURRENT_SOURCE_DIR}/../google-obr-wasm/binaural_filters_stereo_ambient.cc"
)

add_library(google_obr_official STATIC ${OBR_CORE_SOURCES})
target_include_directories(google_obr_official PUBLIC
  "${OBR_SOURCE_DIR}"
  "${eigen_SOURCE_DIR}"
  "${absl_SOURCE_DIR}"
  "${pffft_source_SOURCE_DIR}"
)
target_compile_definitions(google_obr_official PRIVATE EIGEN_MPL2_ONLY)
if(MSVC)
  target_compile_options(google_obr_official PRIVATE /O2 /EHsc /permissive- /Zc:__cplusplus /utf-8)
else()
  target_compile_options(google_obr_official PRIVATE -O3)
endif()
target_link_libraries(google_obr_official PRIVATE
  pffft
  absl::base
  absl::die_if_null
  absl::flat_hash_map
  absl::log
  absl::log_internal_message
  absl::log_internal_check_op
  absl::status
  absl::statusor
  absl::strings
  absl::synchronization
)


add_library(fe_monster_rust SHARED IMPORTED)
set_target_properties(fe_monster_rust PROPERTIES IMPORTED_LOCATION "${FE_RUST_AUDIO_LIBRARY}")
add_library(fe_monster_coreaudio SHARED fe_monster_coreaudio.cpp)
target_include_directories(fe_monster_coreaudio PRIVATE "${FE_JNI_INCLUDE_DIR}" "${FE_JNI_PLATFORM_INCLUDE_DIR}")
target_link_libraries(fe_monster_coreaudio PRIVATE google_obr_official fe_monster_rust "-framework AudioUnit" "-framework AudioToolbox" "-framework CoreAudio")
set_target_properties(fe_monster_coreaudio PROPERTIES
  OUTPUT_NAME "fe-monster-coreaudio"
  LIBRARY_OUTPUT_DIRECTORY "${FE_RUNTIME_OUTPUT_DIR}"
  BUILD_WITH_INSTALL_RPATH TRUE INSTALL_RPATH "@loader_path"
  INSTALL_NAME_DIR "@rpath"
)
include(CTest)
add_executable(fe_pcm_queue_probe audio/fe_pcm_queue_probe.cpp)
add_test(NAME pcm_queue COMMAND fe_pcm_queue_probe)
add_executable(fe_coreaudio_dsp_probe audio/fe_coreaudio_dsp_probe.cpp)
target_link_libraries(fe_coreaudio_dsp_probe PRIVATE google_obr_official fe_monster_rust)
set_target_properties(fe_coreaudio_dsp_probe PROPERTIES BUILD_RPATH "${FE_RUNTIME_OUTPUT_DIR}")
add_test(NAME coreaudio_dsp COMMAND fe_coreaudio_dsp_probe)
