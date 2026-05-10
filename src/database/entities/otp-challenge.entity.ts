import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum OtpPurpose {
  REGISTER = "REGISTER",
  LOGIN = "LOGIN",
  RESET_PASSWORD = "RESET_PASSWORD",
}

// Sẽ lưu trữ OTP challenge tạm thời trong Redis, nhưng cũng có thể lưu trong DB nếu muốn có lịch sử hoặc cần truy vấn phức tạp hơn.
// Một số ví dụ sẽ lưu xuống DB là: OTP dùng để xác thực giao dịch quan trọng (chuyển tiền, thay đổi thông tin nhạy cảm), hoặc OTP dùng để xác thực 2FA cho login, vì những loại OTP này có thể cần lưu lại để audit sau này.
// Ví dụ cần audit là: Một người dùng khiếu nại: "Tôi không hề đổi mật khẩu, ai đó đã làm việc này!".
// Tại sao cần DB: Trường extraData có thể lưu lại IP Address, Device ID hoặc User Agent tại thời điểm yêu cầu OTP. Đây là bằng chứng quan trọng để hỗ trợ người dùng hoặc cung cấp cho cơ quan chức năng khi có tranh chấp.
// Tuy nhiên, đối với các OTP có tính chất ngắn hạn và không cần lưu trữ lâu dài như OTP đăng ký hoặc reset password, chúng ta có thể chỉ lưu trong Redis để tối ưu hiệu năng và giảm tải cho database.
@Entity("otp_challenges")
@Index(["identifier", "purpose"]) // Tạo index để nhanh chóng tìm kiếm OTP theo identifier và purpose
export class OtpChallenge {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Field này dùng để lưu trữ thông tin định danh cho OTP, có thể là email hoặc số điện thoại tùy theo mục đích sử dụng. Ví dụ:
  @Column({ type: "varchar", length: 255 })
  identifier: string;

  // Mã OTP đã được băm (hash) bằng SHA-256 — không bao giờ lưu trữ OTP dưới dạng plaintext
  // Để đảm bảo
  @Column({ name: "otp_hash", type: "varchar", length: 64 })
  otpHash: string;

  // Mục đích của OTP, ví dụ: REGISTER, LOGIN, RESET_PASSWORD
  @Column({ type: "varchar", length: 30 })
  purpose: OtpPurpose;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  // Số lần thử đã sử dụng để xác thực OTP này, dùng để giới hạn số lần thử (ví dụ: max 3 attempts)
  @Column({ type: "int", default: 0 })
  attempts: number;

  // Số lần thử tối đa cho phép để xác thực OTP này
  @Column({ name: "max_attempts", type: "int", default: 3 })
  maxAttempts: number;

  // Thời điểm có thể gửi lại OTP mới nếu người dùng yêu cầu resend, ví dụ: sau mỗi 60 giây
  @Column({ name: "resend_at", type: "timestamptz", nullable: true })
  resendAt: Date | null;

  // Trường này có thể dùng để lưu trữ thêm thông tin liên quan đến OTP, ví dụ: IP address của người dùng khi yêu cầu OTP, user agent, hoặc bất kỳ metadata nào khác cần thiết cho việc debug hoặc phân tích sau này
  @Column({ name: "extra_data", type: "text", nullable: true })
  extraData: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
