import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT", 3001);

  app.use(cookieParser());

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
  if (config.get<string>("NODE_ENV") !== "production") {
    const doc = new DocumentBuilder()
      .setTitle("Auth Service")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));
  }

  // Graceful shutdown hooks để đảm bảo rằng auth service có thể tắt một cách an toàn khi nhận được tín hiệu dừng (ví dụ: SIGINT, SIGTERM)
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`[auth-service] Running on port ${port}`);
}

bootstrap();
