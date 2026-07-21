import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { Transport } from "@nestjs/microservices";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { buildHelmetOptions } from "./common/config/helmet.config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  const config = app.get(ConfigService);
  const isDev = config.get<string>("NODE_ENV") !== "production";
  const port = config.get<number>("PORT", 3002);
  const kafkaBrokers = config
    .get<string>("KAFKA_BROKERS", "localhost:29092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);

  // Kết nối Kafka consumer cùng tiến trình HTTP để auth-service nhận sự kiện duyệt seller mà không cần endpoint nội bộ mới.
  app.connectMicroservice({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: "auth-service-seller-consumer",
        brokers: kafkaBrokers,
      },
      consumer: {
        groupId: config.get<string>(
          "KAFKA_GROUP_ID",
          "auth-service-seller-role",
        ),
      },
    },
  });

  app.use(cookieParser());

  // Helmet: gắn security headers cho tất cả response
  app.use(helmet(buildHelmetOptions(isDev)));

  // Global prefix
  app.setGlobalPrefix("api");

  // URI versioning — /api/v1/auth/...
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Loại bỏ các trường không có trong DTO
      forbidNonWhitelisted: true, // Từ chối các request có trường không hợp lệ
      transform: true, // Tự động chuyển đổi payload thành instance của DTO class
      transformOptions: { enableImplicitConversion: true }, // Cho phép chuyển đổi kiểu dữ liệu một cách tự động, ví dụ: "age": "30" sẽ được chuyển thành age: 30 nếu DTO định nghĩa age là number
    }),
  );

  // CORS (gateway handles auth, but allow dev direct access)
  app.enableCors({ origin: false });

  // Swagger (dev only)
  if (isDev) {
    const doc = new DocumentBuilder()
      .setTitle("Auth Service")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));
  }

  // Graceful shutdown hooks để đảm bảo rằng auth service có thể tắt một cách an toàn khi nhận được tín hiệu dừng (ví dụ: SIGINT, SIGTERM)
  app.enableShutdownHooks();

  // Khởi động consumer trước HTTP listener để service không nhận request khi luồng đồng bộ role chưa sẵn sàng.
  await app.startAllMicroservices();
  await app.listen(port);
  console.log(`[auth-service] Running on port ${port}`);
}

bootstrap();
