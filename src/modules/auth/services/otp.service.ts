import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { createHash, randomInt } from "crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../../database/redis/redis.module";
import { OtpPurpose } from "../../../database/entities/otp-challenge.entity";
import { KafkaProducerService } from "../../../kafka/kafka-producer.service";
import {
  NotificationEvents,
  OtpRequestedPayload,
} from "@common/kafka/events/notification.events";

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_TTL_SECONDS = 600; // 10 phút
  private readonly MAX_ATTEMPTS = 3; // Số lần thử OTP trước khi khóa và yêu cầu tạo lại
  private readonly RESEND_COOLDOWN_MS = 60_000; // 60s

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  // Truy xuất key trong Redis theo mục đích và định danh (email hoặc phone), giúp phân biệt các loại OTP khác nhau như đăng ký, reset password, v.v.
  // Ví dụ: otp:REGISTER:, otp:RESET_PASSWORD:...
  private key(purpose: OtpPurpose, identifier: string): string {
    return `otp:${purpose}:${identifier}`;
  }

  // Hàm băm OTP để lưu trữ an toàn trong Redis, tránh lưu OTP raw. Khi verify, chúng ta sẽ băm input và so sánh với hash đã lưu.
  private hashOtp(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  // Hàm này tạo ra một mã OTP ngẫu nhiên gồm 6 chữ số, đảm bảo rằng mã OTP có độ dài cố định và dễ nhớ cho người dùng.
  private generateCode(): string {
    return randomInt(100_000, 1_000_000).toString();
  }

  // Tạo một OTP mới cho một identifier (email hoặc phone) và mục đích cụ thể (đăng ký, reset password, v.v.)
  async createChallenge(
    identifier: string, // input: email hoặc phone tuỳ mục đích
    purpose: OtpPurpose, // input: mục đích của OTP, giúp phân biệt giữa các loại OTP khác nhau như đăng ký, reset password, v.v.
    extraData?: Record<string, unknown>, // ví dụ: { name, phone, password } cho OTP đăng ký, có thể được lưu tạm thời trong Redis và trả về khi verify thành công để sử dụng trong bước tiếp theo của flow
  ): Promise<string> {
    // Tạo key Redis dựa trên mục đích và định danh để lưu trữ OTP một cách có tổ chức và dễ quản lý.
    const k = this.key(purpose, identifier);

    // Kiểm tra nếu OTP đã tồn tại và đang trong thời gian cooldown trước khi cho phép tạo lại OTP mới, giúp tránh spam OTP và bảo vệ hệ thống khỏi các cuộc tấn công brute-force.
    // Ví dụ: nếu user vừa yêu cầu OTP mới, họ sẽ phải chờ một khoảng thời gian nhất định (RESEND_COOLDOWN_MS) trước khi có thể yêu cầu OTP khác, điều này giúp giảm thiểu rủi ro bị lạm dụng chức năng OTP.
    const resendAt = await this.redis.hget(k, "resend_at");
    if (resendAt && parseInt(resendAt, 10) > Date.now()) {
      const secondsLeft = Math.ceil(
        (parseInt(resendAt, 10) - Date.now()) / 1000,
      );
      throw new HttpException(
        `Please wait ${secondsLeft}s before requesting a new OTP`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Tạo Otp mới
    const raw = this.generateCode();

    // Dùng pipeline để atomic: xoá key cũ → set hash mới → đặt TTL
    const pipeline = this.redis.pipeline(); //
    pipeline.del(k);
    pipeline.hset(k, {
      otp_hash: this.hashOtp(raw),
      resend_at: String(Date.now() + this.RESEND_COOLDOWN_MS),
      attempts: "0",
      max_attempts: String(this.MAX_ATTEMPTS),
      extra_data: extraData ? JSON.stringify(extraData) : "",
    });
    pipeline.expire(k, this.OTP_TTL_SECONDS);
    await pipeline.exec();

    return raw;
  }

  // Xác thực Otp và xóa sau khi xác thực
  async verifyOtp(
    identifier: string, // input: email hoặc phone tuỳ mục đích
    purpose: OtpPurpose, // input: mục đích của OTP, giúp phân biệt giữa các loại OTP khác nhau như đăng ký, reset password, v.v. Khi verify, chúng ta sẽ dùng purpose và identifier để tìm đúng OTP challenge trong Redis để verify.
    input: string, // input: mã OTP mà user nhập vào để verify, sẽ được băm và so sánh với hash đã lưu trong Redis. Nếu khớp thì OTP hợp lệ, nếu không thì sẽ tăng số lần thử và kiểm tra xem có vượt quá giới hạn hay không.
  ): Promise<Record<string, unknown> | null> {
    const k = this.key(purpose, identifier); // Tạo key Redis dựa trên mục đích và định danh để truy xuất OTP challenge tương ứng trong Redis. Ví dụ: otp:REGISTER:email@example.com
    const data = await this.redis.hgetall(k); // Lấy tất cả dữ liệu liên quan đến OTP challenge từ Redis, bao gồm otp_hash, resend_at, attempts, max_attempts và extra_data. Dữ liệu này sẽ được sử dụng để verify OTP và quản lý số lần thử.

    if (!data || !data.otp_hash) {
      throw new BadRequestException("OTP not found. Please request a new one.");
    }

    // Tăng số lần thử OTP lên 1 và kiểm tra xem có vượt quá giới hạn hay không. Nếu vượt quá, xoá OTP challenge khỏi Redis và yêu cầu user tạo lại OTP mới. Nếu chưa vượt quá, tiếp tục verify OTP.
    const attempts = await this.redis.hincrby(k, "attempts", 1);
    const maxAttempts = parseInt(data.max_attempts ?? "3", 10);

    if (attempts > maxAttempts) {
      await this.redis.del(k);
      throw new HttpException(
        "Maximum OTP attempts exceeded. Please request a new one.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // So sánh OTP đã nhập (sau khi băm) với hash đã lưu trong Redis để xác định xem OTP có hợp lệ hay không. Nếu không hợp lệ, trả về lỗi và thông báo số lần thử còn lại. Nếu hợp lệ, xoá OTP challenge khỏi Redis và trả về extra_data nếu có để sử dụng trong bước tiếp theo của flow.
    if (this.hashOtp(input) !== data.otp_hash) {
      const remaining = maxAttempts - attempts;
      throw new BadRequestException(
        `Invalid OTP. ${remaining} attempt(s) remaining.`,
      );
    }

    // Thành công — xoá challenge khỏi Redis
    await this.redis.del(k);
    return data.extra_data
      ? (JSON.parse(data.extra_data) as Record<string, unknown>)
      : null;
  }

  async sendOtp(
    identifier: string,
    code: string,
    channel: "email" | "sms" = "email",
  ): Promise<void> {
    if (process.env["NODE_ENV"] !== "production") {
      // NEVER log OTP in production
      this.logger.log(
        `[DEV OTP] ${channel.toUpperCase()} → ${identifier}: ${code}`,
      );
    }

    if (channel === "email") {
      const payload: OtpRequestedPayload = {
        email: identifier,
        otp: code,
        purpose: "REGISTER",
        expiresIn: this.OTP_TTL_SECONDS,
      };
      // Publish sự kiện OTP_REQUESTED lên Kafka để Notification Service có thể nhận
      // và gửi email chứa OTP đến người dùng. Payload bao gồm email, mã OTP, mục đích của OTP (ví dụ: đăng ký),
      // và thời gian hết hạn của OTP để Notification Service có thể hiển thị thông tin chính xác trong email.
      await this.kafkaProducer.publish(
        NotificationEvents.OTP_REQUESTED,
        payload,
      );
    }
  }
}
