import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, Producer } from "kafkajs";

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  // Kafka producer instance đóng vai trò là người gửi message đến Kafka topics, được khởi tạo trong constructor và kết nối trong onModuleInit
  private readonly producer: Producer;

  constructor(private readonly config: ConfigService) {
    // Lấy cấu hình Kafka brokers từ environment variables  ư
    const brokers = this.config
      .get<string>("KAFKA_BROKERS", "localhost:29092")
      .split(",");

    // Khởi tạo Kafka producer với clientId và brokers đã cấu hình,
    // đồng thời thiết lập retry options để tự động thử lại khi gửi message thất bại,
    // giúp tăng độ tin cậy khi giao tiếp với Kafka
    const kafka = new Kafka({
      clientId: "auth-service",
      brokers,
      retry: { retries: 3 },
    });

    this.producer = kafka.producer();
  }

  // Kết nối đến Kafka khi module được khởi động,
  // nếu kết nối thất bại sẽ log lỗi nhưng không throw để tránh ảnh hưởng đến luồng chính của ứng dụng,
  //  vì Kafka là optional
  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect(); // Kết nối đến Kafka broker
      this.logger.log("Kafka producer connected");
    } catch (err) {
      // Kafka là optional — không block startup nếu Kafka chưa chạy
      this.logger.warn(
        `Kafka producer connect failed (non-fatal): ${String(err)}`,
      );
    }
  }

  // Ngắt kết nối Kafka producer khi module bị hủy,
  // đảm bảo rằng các tài nguyên được giải phóng đúng cách khi ứng dụng dừng hoặc reload
  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect().catch(() => void 0);
  }

  // Phương thức để publish message đến một Kafka topic cụ thể
  async publish(topic: string, payload: unknown): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
    } catch (err) {
      // Fire-and-forget — log nhưng không throw để tránh ảnh hưởng luồng chính
      this.logger.error(
        `Failed to publish to topic "${topic}": ${String(err)}`,
      );
    }
  }
}
