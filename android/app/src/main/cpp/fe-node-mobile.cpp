#include <jni.h>
#include <android/log.h>
#include <node.h>

#include <cstring>
#include <string>
#include <vector>

namespace {
constexpr const char* kLogTag = "FE-MUSIC-NODE";
}

extern "C" JNIEXPORT jint JNICALL
Java_com_femonster_mobile_MainActivity_startNodeWithArguments(
    JNIEnv* env,
    jobject,
    jobjectArray arguments) {
  const jsize count = env->GetArrayLength(arguments);
  std::vector<std::string> values;
  values.reserve(static_cast<size_t>(count));

  size_t buffer_size = 0;
  for (jsize index = 0; index < count; ++index) {
    auto value = static_cast<jstring>(env->GetObjectArrayElement(arguments, index));
    const char* utf = env->GetStringUTFChars(value, nullptr);
    values.emplace_back(utf == nullptr ? "" : utf);
    if (utf != nullptr) env->ReleaseStringUTFChars(value, utf);
    env->DeleteLocalRef(value);
    buffer_size += values.back().size() + 1;
  }

  std::vector<char> buffer(buffer_size, '\0');
  std::vector<char*> argv(static_cast<size_t>(count));
  char* cursor = buffer.data();
  for (jsize index = 0; index < count; ++index) {
    const std::string& value = values[static_cast<size_t>(index)];
    std::memcpy(cursor, value.c_str(), value.size());
    argv[static_cast<size_t>(index)] = cursor;
    cursor += value.size() + 1;
  }

  __android_log_write(ANDROID_LOG_INFO, kLogTag, "Starting on-device music gateway");
  return static_cast<jint>(node::Start(count, argv.data()));
}
