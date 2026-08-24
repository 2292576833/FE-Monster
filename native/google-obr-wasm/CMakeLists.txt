cmake_minimum_required(VERSION 3.28)
project(fe_monster_google_obr_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "This target must be configured through emcmake.")
endif()

if(NOT DEFINED OBR_SOURCE_DIR OR NOT EXISTS "${OBR_SOURCE_DIR}/obr/renderer/obr_impl.cc")
  message(FATAL_ERROR "Set OBR_SOURCE_DIR to the pinned official google/obr checkout.")
endif()
file(TO_CMAKE_PATH "${OBR_SOURCE_DIR}" OBR_SOURCE_DIR)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ON)

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
target_compile_options(pffft PRIVATE -O3 -msimd128)

set(OBR_CORE_SOURCES
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/ambisonic_binaural_decoder.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/dsp_utils.cc"
  "${OBR_SOURCE_DIR}/obr/ambisonic_binaural_decoder/fft_manager.cc"
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
  "${CMAKE_CURRENT_SOURCE_DIR}/binaural_filters_stereo_ambient.cc"
)

add_library(google_obr_official STATIC ${OBR_CORE_SOURCES})
target_include_directories(google_obr_official PUBLIC
  "${OBR_SOURCE_DIR}"
  "${eigen_SOURCE_DIR}"
  "${absl_SOURCE_DIR}"
  "${pffft_source_SOURCE_DIR}"
)
target_compile_options(google_obr_official PRIVATE
  -O3
  -flto
  -msimd128
)
target_compile_definitions(google_obr_official PRIVATE EIGEN_MPL2_ONLY)
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

add_executable(obr_official "${CMAKE_CURRENT_SOURCE_DIR}/obr_web_wrapper.cc")
target_link_libraries(obr_official PRIVATE google_obr_official)
target_compile_options(obr_official PRIVATE -O3 -flto -msimd128)
target_link_options(obr_official PRIVATE
  -O3
  -flto
  -msimd128
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_ES6=1"
  "SHELL:-s EXPORT_NAME=createOfficialObrModule"
  "SHELL:-s ENVIRONMENT=node,worker,worklet"
  "SHELL:-s SINGLE_FILE=1"
  "SHELL:-s WASM_ASYNC_COMPILATION=0"
  "SHELL:-s ALLOW_MEMORY_GROWTH=0"
  "SHELL:-s INITIAL_MEMORY=67108864"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s ASSERTIONS=0"
  "SHELL:-s EXPORTED_FUNCTIONS=['_obr_create','_obr_destroy','_obr_is_ready','_obr_frame_count','_obr_input_channel','_obr_output_channel','_obr_process','_obr_backend_name','_obr_source_revision','_malloc','_free']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['UTF8ToString','HEAPF32']"
)

set_target_properties(obr_official PROPERTIES
  OUTPUT_NAME "obr-official"
  SUFFIX ".js"
)
