#include <jni.h>
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <CommonCrypto/CommonDigest.h>
#include <string.h>

#define MAX_BYTES 4096
#define TOKEN_BYTES 40

static void wipe(void *buffer, size_t length) {
    volatile unsigned char *bytes = buffer;
    while (length--) *bytes++ = 0;
}

static int read_bytes(JNIEnv *env, jbyteArray array, unsigned char *out) {
    if (!array) return 0;
    jsize length = (*env)->GetArrayLength(env, array);
    if (length < 1 || length > MAX_BYTES) return 0;
    (*env)->GetByteArrayRegion(env, array, 0, length, (jbyte *)out);
    return (*env)->ExceptionCheck(env) ? 0 : length;
}

/* Bind the opaque UUID to this vault's entropy; changing either fails closed. */
static CFStringRef account_for(const unsigned char *token, const unsigned char *entropy, int length) {
    for (int i = 0; i < 36; i++) {
        unsigned char c = token[4 + i];
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (c != '-') return NULL;
        } else if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))) {
            return NULL;
        }
    }
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(entropy, (CC_LONG)length, digest);
    char account[36 + 1 + 64 + 1];
    memcpy(account, token + 4, 36);
    account[36] = ':';
    const char *hex = "0123456789abcdef";
    for (int i = 0; i < 32; i++) {
        account[37 + 2*i] = hex[digest[i] >> 4];
        account[38 + 2*i] = hex[digest[i] & 15];
    }
    account[101] = 0;
    wipe(digest, sizeof(digest));
    return CFStringCreateWithCString(NULL, account, kCFStringEncodingUTF8);
}

static CFMutableDictionaryRef query_for(CFStringRef account) {
    if (!account) return NULL;
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(NULL, 0,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    if (!query) return NULL;
    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(query, kSecAttrService, CFSTR("com.femonster.local-memory.v1"));
    CFDictionarySetValue(query, kSecAttrAccount, account);
    CFDictionarySetValue(query, kSecAttrSynchronizable, kCFBooleanFalse);
    return query;
}

JNIEXPORT jbyteArray JNICALL Java_com_femonster_memory_MacKeychainKeyProtector_nativeProtect
    (JNIEnv *env, jclass type, jbyteArray plaintext, jbyteArray context) {
    (void)type;
    unsigned char secret[MAX_BYTES] = {0}, entropy[MAX_BYTES] = {0};
    int length = read_bytes(env, plaintext, secret), entropy_length = read_bytes(env, context, entropy);
    jbyteArray result = NULL;
    if (length && entropy_length) {
        CFUUIDRef uuid = CFUUIDCreate(NULL);
        CFStringRef uuid_string = uuid ? CFUUIDCreateString(NULL, uuid) : NULL;
        unsigned char token[TOKEN_BYTES + 1] = "FMK1";
        if (uuid_string && CFStringGetCString(uuid_string, (char *)token + 4, 37, kCFStringEncodingUTF8)) {
            CFStringRef account = account_for(token, entropy, entropy_length);
            CFMutableDictionaryRef query = query_for(account);
            CFDataRef value = CFDataCreate(NULL, secret, length);
            if (query && value) {
              CFDictionarySetValue(query, kSecValueData, value);
              CFDictionarySetValue(query, kSecAttrLabel, CFSTR("FE Monster encrypted local memory"));
              if (SecItemAdd(query, NULL) == errSecSuccess) {
                result = (*env)->NewByteArray(env, TOKEN_BYTES);
                if (result) (*env)->SetByteArrayRegion(env, result, 0, TOKEN_BYTES, (jbyte *)token);
              }
            }
            if (value) CFRelease(value);
            if (query) CFRelease(query);
            if (account) CFRelease(account);
        }
        if (uuid_string) CFRelease(uuid_string);
        if (uuid) CFRelease(uuid);
    }
    wipe(secret, sizeof(secret));
    wipe(entropy, sizeof(entropy));
    return result;
}

JNIEXPORT jbyteArray JNICALL Java_com_femonster_memory_MacKeychainKeyProtector_nativeUnprotect
    (JNIEnv *env, jclass type, jbyteArray reference, jbyteArray context) {
    (void)type;
    unsigned char token[MAX_BYTES] = {0}, entropy[MAX_BYTES] = {0};
    int length = read_bytes(env, reference, token), entropy_length = read_bytes(env, context, entropy);
    jbyteArray result = NULL;
    if (length == TOKEN_BYTES && entropy_length && !memcmp(token, "FMK1", 4)) {
        CFStringRef account = account_for(token, entropy, entropy_length);
        CFMutableDictionaryRef query = query_for(account);
        CFTypeRef value = NULL;
        if (query) {
          CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
          CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);
          if (SecItemCopyMatching(query, &value) == errSecSuccess && value
            && CFGetTypeID(value) == CFDataGetTypeID()) {
            CFIndex bytes = CFDataGetLength((CFDataRef)value);
            if (bytes > 0 && bytes <= MAX_BYTES) {
                result = (*env)->NewByteArray(env, (jsize)bytes);
                if (result) (*env)->SetByteArrayRegion(env, result, 0, (jsize)bytes,
                    (const jbyte *)CFDataGetBytePtr((CFDataRef)value));
            }
          }
        }
        if (value) CFRelease(value);
        if (query) CFRelease(query);
        if (account) CFRelease(account);
    }
    wipe(token, sizeof(token));
    wipe(entropy, sizeof(entropy));
    return result;
}
