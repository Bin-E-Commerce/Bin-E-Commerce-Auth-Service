import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TerminusModule } from "@nestjs/terminus";
import { RedisModule } from "./database/redis/redis.module";
import { KafkaModule } from "./kafka/kafka.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("POSTGRES_HOST", "localhost"),
        port: config.get<number>("POSTGRES_PORT", 5432),
        username: config.get<string>("POSTGRES_USER"),
        password: config.get<string>("POSTGRES_PASSWORD"),
        database: config.get<string>("POSTGRES_DB"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        migrations: [__dirname + "/database/migrations/*{.ts,.js}"], // Cấu hình để TypeORM tự động tìm kiếm tất cả các file entity và migration trong thư mục database.
        synchronize: config.get<string>("NODE_ENV") !== "production",
        ssl:
          config.get<string>("NODE_ENV") === "production"
            ? { rejectUnauthorized: false }
            : false,
        logging: config.get<string>("NODE_ENV") === "development",
      }),
    }),

    // Health checks
    TerminusModule,
    RedisModule,
    KafkaModule,
    HealthModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
