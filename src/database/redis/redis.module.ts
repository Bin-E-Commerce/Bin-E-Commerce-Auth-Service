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
        return new Redis({
          host: config.get<string>("REDIS_HOST", "localhost"),
          port: config.get<number>("REDIS_PORT", 6379),
          password: config.get<string>("REDIS_PASSWORD") || undefined,
          db: config.get<number>("REDIS_DB", 0),
          lazyConnect: true, // Lazy connect là một tùy chọn để trì hoãn việc kết nối đến Redis cho đến khi client thực sự cần sử dụng,
          // Giúp giảm thiểu thời gian khởi động của ứng dụng và tránh kết nối không cần thiết nếu Redis không được sử dụng ngay lập tức.
          maxRetriesPerRequest: 3, // Giới hạn số lần thử lại khi có lỗi kết nối hoặc lỗi mạng, giúp cải thiện độ ổn định của ứng dụng khi gặp sự cố với Redis.
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
