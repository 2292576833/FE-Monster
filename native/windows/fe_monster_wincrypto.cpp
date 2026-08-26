#include <windows.h>
#include <bcrypt.h>
#include <dpapi.h>
#include <jni.h>

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <cwchar>

namespace {

constexpr jsize kMaxPlaintextBytes = 4096;
constexpr jsize kMaxEntropyBytes = 4096;
constexpr jsize kMaxProtectedBytes = 65536;

constexpr wchar_t kDescription[] = L"FE Monster Local AI Memory v1";

// The envelope is encrypted as the DPAPI plaintext. Its SHA-256 covers the
// magic, version, encoded payload length, and payload (but not the digest).
constexpr BYTE kEnvelopeMagic[] = {'F', 'E', 'M', 'D', 'P', 'A', 'P', 'I'};
constexpr std::uint32_t kEnvelopeVersion = 1;
constexpr std::size_t kVersionOffset = sizeof(kEnvelopeMagic);
constexpr std::size_t kLengthOffset = kVersionOffset + sizeof(std::uint32_t);
constexpr std::size_t kDigestOffset = kLengthOffset + sizeof(std::uint32_t);
constexpr std::size_t kSha256Bytes = 32;
constexpr std::size_t kPayloadOffset = kDigestOffset + kSha256Bytes;

class SecureBuffer final {
public:
    SecureBuffer() noexcept = default;

    ~SecureBuffer() noexcept {
        reset();
    }

    SecureBuffer(const SecureBuffer&) = delete;
    SecureBuffer& operator=(const SecureBuffer&) = delete;

    bool allocate(std::size_t size) noexcept {
        reset();
        if (size == 0) {
            return false;
        }

        BYTE* allocated = static_cast<BYTE*>(
            HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, size));
        if (allocated == nullptr) {
            return false;
        }

        data_ = allocated;
        size_ = size;
        return true;
    }

    BYTE* data() noexcept {
        return data_;
    }

    const BYTE* data() const noexcept {
        return data_;
    }

    std::size_t size() const noexcept {
        return size_;
    }

private:
    void reset() noexcept {
        if (data_ != nullptr) {
            SecureZeroMemory(data_, size_);
            HeapFree(GetProcessHeap(), 0, data_);
            data_ = nullptr;
            size_ = 0;
        }
    }

    BYTE* data_ = nullptr;
    std::size_t size_ = 0;
};

class LocalBlob final {
public:
    LocalBlob() noexcept = default;

    ~LocalBlob() noexcept {
        if (blob_.pbData != nullptr) {
            SecureZeroMemory(blob_.pbData, blob_.cbData);
            LocalFree(blob_.pbData);
            blob_.pbData = nullptr;
            blob_.cbData = 0;
        }
    }

    LocalBlob(const LocalBlob&) = delete;
    LocalBlob& operator=(const LocalBlob&) = delete;

    DATA_BLOB* out() noexcept {
        return &blob_;
    }

    BYTE* data() noexcept {
        return blob_.pbData;
    }

    const BYTE* data() const noexcept {
        return blob_.pbData;
    }

    DWORD size() const noexcept {
        return blob_.cbData;
    }

private:
    DATA_BLOB blob_{};
};

class LocalWideString final {
public:
    LocalWideString() noexcept = default;

    ~LocalWideString() noexcept {
        if (value_ != nullptr) {
            const std::size_t bytes = (std::wcslen(value_) + 1) * sizeof(wchar_t);
            SecureZeroMemory(value_, bytes);
            LocalFree(value_);
            value_ = nullptr;
        }
    }

    LocalWideString(const LocalWideString&) = delete;
    LocalWideString& operator=(const LocalWideString&) = delete;

    LPWSTR* out() noexcept {
        return &value_;
    }

    const wchar_t* get() const noexcept {
        return value_;
    }

private:
    LPWSTR value_ = nullptr;
};

class AlgorithmHandle final {
public:
    AlgorithmHandle() noexcept = default;

    ~AlgorithmHandle() noexcept {
        if (handle_ != nullptr) {
            BCryptCloseAlgorithmProvider(handle_, 0);
            handle_ = nullptr;
        }
    }

    AlgorithmHandle(const AlgorithmHandle&) = delete;
    AlgorithmHandle& operator=(const AlgorithmHandle&) = delete;

    BCRYPT_ALG_HANDLE* out() noexcept {
        return &handle_;
    }

    BCRYPT_ALG_HANDLE get() const noexcept {
        return handle_;
    }

private:
    BCRYPT_ALG_HANDLE handle_ = nullptr;
};

class HashHandle final {
public:
    HashHandle() noexcept = default;

    ~HashHandle() noexcept {
        if (handle_ != nullptr) {
            BCryptDestroyHash(handle_);
            handle_ = nullptr;
        }
    }

    HashHandle(const HashHandle&) = delete;
    HashHandle& operator=(const HashHandle&) = delete;

    BCRYPT_HASH_HANDLE* out() noexcept {
        return &handle_;
    }

    BCRYPT_HASH_HANDLE get() const noexcept {
        return handle_;
    }

private:
    BCRYPT_HASH_HANDLE handle_ = nullptr;
};

bool bcryptSucceeded(NTSTATUS status) noexcept {
    return status >= 0;
}

void writeUint32LittleEndian(BYTE* destination, std::uint32_t value) noexcept {
    destination[0] = static_cast<BYTE>(value);
    destination[1] = static_cast<BYTE>(value >> 8);
    destination[2] = static_cast<BYTE>(value >> 16);
    destination[3] = static_cast<BYTE>(value >> 24);
}

std::uint32_t readUint32LittleEndian(const BYTE* source) noexcept {
    return static_cast<std::uint32_t>(source[0])
        | (static_cast<std::uint32_t>(source[1]) << 8)
        | (static_cast<std::uint32_t>(source[2]) << 16)
        | (static_cast<std::uint32_t>(source[3]) << 24);
}

bool computeSha256(
    const BYTE* prefix,
    ULONG prefixLength,
    const BYTE* payload,
    ULONG payloadLength,
    BYTE* digest) noexcept {
    AlgorithmHandle algorithm;
    if (!bcryptSucceeded(BCryptOpenAlgorithmProvider(
            algorithm.out(), BCRYPT_SHA256_ALGORITHM, nullptr, 0))) {
        return false;
    }

    ULONG hashObjectLength = 0;
    ULONG hashLength = 0;
    ULONG copied = 0;
    if (!bcryptSucceeded(BCryptGetProperty(
            algorithm.get(),
            BCRYPT_OBJECT_LENGTH,
            reinterpret_cast<PUCHAR>(&hashObjectLength),
            sizeof(hashObjectLength),
            &copied,
            0))
        || copied != sizeof(hashObjectLength)
        || hashObjectLength == 0) {
        return false;
    }
    if (!bcryptSucceeded(BCryptGetProperty(
            algorithm.get(),
            BCRYPT_HASH_LENGTH,
            reinterpret_cast<PUCHAR>(&hashLength),
            sizeof(hashLength),
            &copied,
            0))
        || copied != sizeof(hashLength)
        || hashLength != kSha256Bytes) {
        return false;
    }

    SecureBuffer hashObject;
    if (!hashObject.allocate(hashObjectLength)) {
        return false;
    }

    HashHandle hash;
    if (!bcryptSucceeded(BCryptCreateHash(
            algorithm.get(),
            hash.out(),
            hashObject.data(),
            hashObjectLength,
            nullptr,
            0,
            0))) {
        return false;
    }
    if (!bcryptSucceeded(BCryptHashData(
            hash.get(), const_cast<PUCHAR>(prefix), prefixLength, 0))) {
        return false;
    }
    if (!bcryptSucceeded(BCryptHashData(
            hash.get(), const_cast<PUCHAR>(payload), payloadLength, 0))) {
        return false;
    }
    return bcryptSucceeded(BCryptFinishHash(
        hash.get(), digest, static_cast<ULONG>(kSha256Bytes), 0));
}

bool constantTimeEqual(const BYTE* left, const BYTE* right, std::size_t length) noexcept {
    unsigned int difference = 0;
    for (std::size_t index = 0; index < length; ++index) {
        difference |= static_cast<unsigned int>(left[index] ^ right[index]);
    }
    return difference == 0;
}

bool validJavaArrayLength(
    JNIEnv* environment,
    jbyteArray value,
    jsize maximum,
    jsize& length) noexcept {
    if (value == nullptr) {
        return false;
    }
    length = environment->GetArrayLength(value);
    return length > 0 && length <= maximum;
}

bool copyJavaArray(
    JNIEnv* environment,
    jbyteArray source,
    jsize length,
    SecureBuffer& destination) noexcept {
    if (!destination.allocate(static_cast<std::size_t>(length))) {
        return false;
    }
    environment->GetByteArrayRegion(
        source, 0, length, reinterpret_cast<jbyte*>(destination.data()));
    if (environment->ExceptionCheck()) {
        environment->ExceptionClear();
        return false;
    }
    return true;
}

void throwCode(
    JNIEnv* environment,
    const char* exceptionClass,
    const char* code) noexcept {
    if (environment->ExceptionCheck()) {
        environment->ExceptionClear();
    }
    jclass type = environment->FindClass(exceptionClass);
    if (type != nullptr) {
        environment->ThrowNew(type, code);
        environment->DeleteLocalRef(type);
    }
}

void throwInvalidInput(JNIEnv* environment) noexcept {
    throwCode(environment, "java/lang/IllegalArgumentException", "DPAPI_INVALID_INPUT");
}

void throwState(JNIEnv* environment, const char* code) noexcept {
    throwCode(environment, "java/lang/IllegalStateException", code);
}

jbyteArray newJavaByteArray(
    JNIEnv* environment,
    const BYTE* bytes,
    jsize length,
    const char* failureCode) noexcept {
    jbyteArray result = environment->NewByteArray(length);
    if (result == nullptr || environment->ExceptionCheck()) {
        throwState(environment, failureCode);
        return nullptr;
    }

    environment->SetByteArrayRegion(
        result, 0, length, reinterpret_cast<const jbyte*>(bytes));
    if (environment->ExceptionCheck()) {
        environment->DeleteLocalRef(result);
        throwState(environment, failureCode);
        return nullptr;
    }
    return result;
}

bool buildEnvelope(
    const SecureBuffer& plaintext,
    SecureBuffer& envelope) noexcept {
    const std::size_t envelopeLength = kPayloadOffset + plaintext.size();
    if (!envelope.allocate(envelopeLength)) {
        return false;
    }

    std::memcpy(envelope.data(), kEnvelopeMagic, sizeof(kEnvelopeMagic));
    writeUint32LittleEndian(envelope.data() + kVersionOffset, kEnvelopeVersion);
    writeUint32LittleEndian(
        envelope.data() + kLengthOffset,
        static_cast<std::uint32_t>(plaintext.size()));
    std::memcpy(
        envelope.data() + kPayloadOffset,
        plaintext.data(),
        plaintext.size());

    return computeSha256(
        envelope.data(),
        static_cast<ULONG>(kDigestOffset),
        envelope.data() + kPayloadOffset,
        static_cast<ULONG>(plaintext.size()),
        envelope.data() + kDigestOffset);
}

bool validateEnvelope(const LocalBlob& envelope, std::uint32_t& payloadLength) noexcept {
    if (envelope.data() == nullptr
        || envelope.size() < kPayloadOffset
        || envelope.size() > kPayloadOffset + static_cast<std::size_t>(kMaxPlaintextBytes)
        || std::memcmp(envelope.data(), kEnvelopeMagic, sizeof(kEnvelopeMagic)) != 0
        || readUint32LittleEndian(envelope.data() + kVersionOffset) != kEnvelopeVersion) {
        return false;
    }

    payloadLength = readUint32LittleEndian(envelope.data() + kLengthOffset);
    if (payloadLength == 0
        || payloadLength > static_cast<std::uint32_t>(kMaxPlaintextBytes)
        || envelope.size() != kPayloadOffset + payloadLength) {
        return false;
    }

    SecureBuffer computedDigest;
    if (!computedDigest.allocate(kSha256Bytes)
        || !computeSha256(
            envelope.data(),
            static_cast<ULONG>(kDigestOffset),
            envelope.data() + kPayloadOffset,
            payloadLength,
            computedDigest.data())) {
        return false;
    }

    return constantTimeEqual(
        envelope.data() + kDigestOffset,
        computedDigest.data(),
        kSha256Bytes);
}

}  // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_femonster_memory_WindowsDpapiKeyProtector_nativeProtect(
    JNIEnv* environment,
    jclass,
    jbyteArray plaintextArray,
    jbyteArray entropyArray) {
    jsize plaintextLength = 0;
    jsize entropyLength = 0;
    if (!validJavaArrayLength(
            environment, plaintextArray, kMaxPlaintextBytes, plaintextLength)
        || !validJavaArrayLength(
            environment, entropyArray, kMaxEntropyBytes, entropyLength)) {
        throwInvalidInput(environment);
        return nullptr;
    }

    SecureBuffer plaintext;
    SecureBuffer entropy;
    SecureBuffer envelope;
    if (!copyJavaArray(environment, plaintextArray, plaintextLength, plaintext)
        || !copyJavaArray(environment, entropyArray, entropyLength, entropy)
        || !buildEnvelope(plaintext, envelope)) {
        throwState(environment, "DPAPI_PROTECT_FAILED");
        return nullptr;
    }

    DATA_BLOB input{
        static_cast<DWORD>(envelope.size()),
        envelope.data(),
    };
    DATA_BLOB optionalEntropy{
        static_cast<DWORD>(entropy.size()),
        entropy.data(),
    };
    LocalBlob protectedBlob;
    if (!CryptProtectData(
            &input,
            kDescription,
            &optionalEntropy,
            nullptr,
            nullptr,
            CRYPTPROTECT_UI_FORBIDDEN,
            protectedBlob.out())
        || protectedBlob.data() == nullptr
        || protectedBlob.size() == 0
        || protectedBlob.size() > static_cast<DWORD>(kMaxProtectedBytes)) {
        throwState(environment, "DPAPI_PROTECT_FAILED");
        return nullptr;
    }

    return newJavaByteArray(
        environment,
        protectedBlob.data(),
        static_cast<jsize>(protectedBlob.size()),
        "DPAPI_PROTECT_FAILED");
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_femonster_memory_WindowsDpapiKeyProtector_nativeUnprotect(
    JNIEnv* environment,
    jclass,
    jbyteArray protectedArray,
    jbyteArray entropyArray) {
    jsize protectedLength = 0;
    jsize entropyLength = 0;
    if (!validJavaArrayLength(
            environment, protectedArray, kMaxProtectedBytes, protectedLength)
        || !validJavaArrayLength(
            environment, entropyArray, kMaxEntropyBytes, entropyLength)) {
        throwInvalidInput(environment);
        return nullptr;
    }

    SecureBuffer protectedBytes;
    SecureBuffer entropy;
    if (!copyJavaArray(environment, protectedArray, protectedLength, protectedBytes)
        || !copyJavaArray(environment, entropyArray, entropyLength, entropy)) {
        throwState(environment, "DPAPI_UNPROTECT_FAILED");
        return nullptr;
    }

    DATA_BLOB input{
        static_cast<DWORD>(protectedBytes.size()),
        protectedBytes.data(),
    };
    DATA_BLOB optionalEntropy{
        static_cast<DWORD>(entropy.size()),
        entropy.data(),
    };
    LocalBlob envelope;
    LocalWideString description;
    if (!CryptUnprotectData(
            &input,
            description.out(),
            &optionalEntropy,
            nullptr,
            nullptr,
            CRYPTPROTECT_UI_FORBIDDEN,
            envelope.out())) {
        throwState(environment, "DPAPI_UNPROTECT_FAILED");
        return nullptr;
    }

    if (description.get() == nullptr
        || std::wcscmp(description.get(), kDescription) != 0) {
        throwState(environment, "DPAPI_INTEGRITY_FAILED");
        return nullptr;
    }

    std::uint32_t payloadLength = 0;
    if (!validateEnvelope(envelope, payloadLength)) {
        throwState(environment, "DPAPI_INTEGRITY_FAILED");
        return nullptr;
    }

    return newJavaByteArray(
        environment,
        envelope.data() + kPayloadOffset,
        static_cast<jsize>(payloadLength),
        "DPAPI_UNPROTECT_FAILED");
}
