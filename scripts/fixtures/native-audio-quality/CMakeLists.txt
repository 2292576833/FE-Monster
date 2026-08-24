cmake_minimum_required(VERSION 3.24)
project(fe_monster_native_audio_quality LANGUAGES C CXX)

if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

if(NOT DEFINED FE_REPO_ROOT OR NOT EXISTS "${FE_REPO_ROOT}/native/windows/CMakeLists.txt")
  message(FATAL_ERROR "Set FE_REPO_ROOT to the FE Monster repository root.")
endif()

# Reuse the production renderer target without adding a quality-only seam to
# the shipped DLL. This fixture builds an independent executable against the
# same pinned Google OBR implementation and Rust ABI headers.
add_subdirectory("${FE_REPO_ROOT}/native/windows" "${CMAKE_BINARY_DIR}/fe-windows")

add_executable(fe_audio_quality_probe
  "${CMAKE_CURRENT_SOURCE_DIR}/fe_audio_quality_probe.cpp"
)
target_include_directories(fe_audio_quality_probe PRIVATE
  "${FE_REPO_ROOT}/native/rust-audio-upmix/include"
)
target_compile_definitions(fe_audio_quality_probe PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
target_link_libraries(fe_audio_quality_probe PRIVATE google_obr_official)
if(MSVC)
  target_compile_options(fe_audio_quality_probe PRIVATE
    /O2 /EHsc /permissive- /Zc:__cplusplus /utf-8
  )
endif()
set_target_properties(fe_audio_quality_probe PROPERTIES
  CXX_STANDARD 20
  CXX_STANDARD_REQUIRED ON
  CXX_EXTENSIONS OFF
  RUNTIME_OUTPUT_DIRECTORY "${FE_RUNTIME_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_DEBUG "${FE_RUNTIME_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${FE_RUNTIME_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${FE_RUNTIME_OUTPUT_DIR}"
)
