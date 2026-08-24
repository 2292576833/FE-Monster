cmake_minimum_required(VERSION 3.24)
project(fe_monster_windows_audio LANGUAGES C CXX)

if(NOT WIN32)
  message(FATAL_ERROR "The FE Monster XAudio2 pipeline is Windows-only.")
endif()
if(NOT DEFINED OBR_SOURCE_DIR OR NOT EXISTS "${OBR_SOURCE_DIR}/obr/renderer/obr_impl.cc")
  message(FATAL_ERROR "Set OBR_SOURCE_DIR to the pinned official google/obr checkout.")
endif()
if(NOT DEFINED FE_JNI_INCLUDE_DIR OR NOT EXISTS "${FE_JNI_INCLUDE_DIR}/jni.h")
  message(FATAL_ERROR "Set FE_JNI_INCLUDE_DIR to the active JDK include directory.")
endif()
if(NOT DEFINED FE_JNI_WINDOWS_INCLUDE_DIR OR NOT EXISTS "${FE_JNI_WINDOWS_INCLUDE_DIR}/jni_md.h")
  message(FATAL_ERROR "Set FE_JNI_WINDOWS_INCLUDE_DIR to the JDK Windows include directory.")
endif()

file(TO_CMAKE_PATH "${OBR_SOURCE_DIR}" OBR_SOURCE_DIR)
file(TO_CMAKE_PATH "${FE_JNI_INCLUDE_DIR}" FE_JNI_INCLUDE_DIR)
file(TO_CMAKE_PATH "${FE_JNI_WINDOWS_INCLUDE_DIR}" FE_JNI_WINDOWS_INCLUDE_DIR)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(BUILD_SHARED_LIBS OFF)
if(MSVC)
  # The installer is per-user and must run on a clean Windows x64 machine
  # without a separately installed Visual C++ redistributable.
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  set(ABSL_MSVC_STATIC_RUNTIME ON CACHE BOOL "Link Abseil with the static MSVC runtime" FORCE)
endif()
if(NOT DEFINED FE_RUNTIME_OUTPUT_DIR)
  set(FE_RUNTIME_OUTPUT_DIR "${CMAKE_BINARY_DIR}/runtime")
endif()
file(TO_CMAKE_PATH "${FE_RUNTIME_OUTPUT_DIR}" FE_RUNTIME_OUTPUT_DIR)

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

set(FE_AUDIO_PIPELINE_SOURCE
  "${CMAKE_CURRENT_SOURCE_DIR}/audio/fe_audio_pipeline.cpp"
)
set(FE_AUDIO_SYSTEM_LIBS
  xaudio2
  ole32
  uuid
)
# X3DAudio is provided by the Windows SDK's XAudio2 import surface; no
# separate x3daudio.lib exists in the current Windows 10/11 SDK.

add_library(fe_monster_xaudio2 SHARED
  "${CMAKE_CURRENT_SOURCE_DIR}/fe_monster_xaudio2.cpp"
  ${FE_AUDIO_PIPELINE_SOURCE}
)
target_include_directories(fe_monster_xaudio2 PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/audio"
  "${FE_JNI_INCLUDE_DIR}"
  "${FE_JNI_WINDOWS_INCLUDE_DIR}"
)
target_compile_definitions(fe_monster_xaudio2 PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
target_link_libraries(fe_monster_xaudio2 PRIVATE google_obr_official ${FE_AUDIO_SYSTEM_LIBS})
set_target_properties(fe_monster_xaudio2 PROPERTIES OUTPUT_NAME "fe-monster-xaudio2")

add_executable(fe_audio_probe
  "${CMAKE_CURRENT_SOURCE_DIR}/audio/fe_audio_probe.cpp"
  ${FE_AUDIO_PIPELINE_SOURCE}
)
target_include_directories(fe_audio_probe PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/audio")
target_compile_definitions(fe_audio_probe PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
target_link_libraries(fe_audio_probe PRIVATE google_obr_official ${FE_AUDIO_SYSTEM_LIBS})

add_executable(fe_channel_router_probe
  "${CMAKE_CURRENT_SOURCE_DIR}/audio/fe_channel_router_probe.cpp"
  ${FE_AUDIO_PIPELINE_SOURCE}
)
target_include_directories(fe_channel_router_probe PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/audio")
target_compile_definitions(fe_channel_router_probe PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
target_link_libraries(fe_channel_router_probe PRIVATE google_obr_official ${FE_AUDIO_SYSTEM_LIBS})

foreach(target fe_monster_xaudio2 fe_audio_probe fe_channel_router_probe)
  if(MSVC)
    target_compile_options(${target} PRIVATE /O2 /EHsc /permissive- /Zc:__cplusplus /utf-8)
  endif()
  set_target_properties(${target} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${FE_RUNTIME_OUTPUT_DIR}"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG "${FE_RUNTIME_OUTPUT_DIR}"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${FE_RUNTIME_OUTPUT_DIR}"
    RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${FE_RUNTIME_OUTPUT_DIR}"
  )
endforeach()
