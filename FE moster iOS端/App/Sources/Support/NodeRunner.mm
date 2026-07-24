#import "NodeRunner.h"

#include <NodeMobile/NodeMobile.h>
#include <cstring>
#include <string>
#include <vector>

@implementation NodeRunner

+ (int)startEngineWithArguments:(NSArray<NSString *> *)arguments {
    std::vector<std::string> ownedArguments;
    ownedArguments.reserve(arguments.count);

    for (NSString *argument in arguments) {
        const char *utf8 = argument.UTF8String;
        ownedArguments.emplace_back(utf8 == nullptr ? "" : utf8);
    }

    size_t bufferSize = 0;
    for (const std::string &argument : ownedArguments) {
        bufferSize += argument.size() + 1;
    }

    std::vector<char> contiguousBuffer(bufferSize);
    std::vector<char *> argv;
    argv.reserve(ownedArguments.size());
    char *cursor = contiguousBuffer.data();

    for (const std::string &argument : ownedArguments) {
        const size_t length = argument.size() + 1;
        std::memcpy(cursor, argument.c_str(), length);
        argv.push_back(cursor);
        cursor += length;
    }

    return node_start(static_cast<int>(argv.size()), argv.data());
}

@end
