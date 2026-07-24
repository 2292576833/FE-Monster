#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface NodeRunner : NSObject

+ (int)startEngineWithArguments:(NSArray<NSString *> *)arguments;

@end

NS_ASSUME_NONNULL_END

