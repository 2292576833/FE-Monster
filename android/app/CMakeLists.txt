cmake_minimum_required(VERSION 3.22.1)
project(fe_monster_node_mobile LANGUAGES CXX)

add_library(fe_node_mobile SHARED src/main/cpp/fe-node-mobile.cpp)

set(NODE_MOBILE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/build/generated/nodejs-mobile")
target_include_directories(fe_node_mobile PRIVATE "${NODE_MOBILE_ROOT}/include/node")

add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES
  IMPORTED_LOCATION "${NODE_MOBILE_ROOT}/bin/${ANDROID_ABI}/libnode.so"
)

find_library(log_library log)
target_link_libraries(fe_node_mobile PRIVATE node ${log_library})
target_compile_features(fe_node_mobile PRIVATE cxx_std_17)
