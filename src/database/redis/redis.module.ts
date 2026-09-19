import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

// Biến này sẽ được sử dụng để inject Redis client vào các service khác trong ứng dụng.
// Việc sử dụng một token riêng biệt giúp tránh xung đột với các provider khác
// và làm cho việc quản lý dependency injection trở nên rõ ràng hơn.
export const REDIS_CLIENT = "REDIS_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        // Dùng URL managed Redis khi có; local vẫn giữ cơ chế host/port cũ.
        const redisUrl = config.get<string>("REDIS_URL")?.trim();
        const options = {
          db: config.get<number>("REDIS_DB", 0),
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        };
        return redisUrl
          ? new Redis(redisUrl, options)
          : new Redis({
              host: config.get<string>("REDIS_HOST", "localhost"),
              port: config.get<number>("REDIS_PORT", 6379),
              password: config.get<string>("REDIS_PASSWORD") || undefined,
              ...options,
            });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
