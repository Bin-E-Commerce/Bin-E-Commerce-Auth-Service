import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";

// Bảng refresh_tokens lưu từng phiên đăng nhập của người dùng thông qua refresh token đã được hash.
// Dữ liệu này dùng để refresh access token, quản lý thiết bị đang đăng nhập và thu hồi phiên khi cần.
@Entity("refresh_tokens")
export class RefreshToken {
  // Khóa chính định danh duy nhất cho một phiên đăng nhập.
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ID user sở hữu refresh token này, dùng để gom tất cả phiên của cùng một tài khoản.
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  // Quan hệ tới bảng users; khi user bị xóa thì toàn bộ phiên đăng nhập cũng bị xóa theo.
  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // Hash của refresh token gốc, không lưu token thô để giảm rủi ro nếu database bị lộ.
  @Index()
  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash: string;

  // Tên thiết bị đã được chuẩn hóa để hiển thị nhanh trên UI, ví dụ "Windows 10/11 - Chrome".
  @Column({ name: "device_name", type: "varchar", length: 150, nullable: true })
  deviceName: string | null;

  // Nhóm thiết bị dùng để chọn icon và phân loại phiên, ví dụ desktop, mobile hoặc tablet.
  @Column({ name: "device_type", type: "varchar", length: 30, nullable: true })
  deviceType: string | null;

  // Trình duyệt được parse từ user-agent, giúp người dùng nhận diện phiên đăng nhập.
  @Column({ name: "browser", type: "varchar", length: 80, nullable: true })
  browser: string | null;

  // Hệ điều hành được parse từ user-agent, ví dụ Windows, macOS, Android hoặc iOS.
  @Column({ name: "os", type: "varchar", length: 80, nullable: true })
  os: string | null;

  // Vị trí đăng nhập nếu sau này có tích hợp IP geolocation; hiện có thể để null.
  @Column({ name: "location", type: "varchar", length: 150, nullable: true })
  location: string | null;

  // Phương thức đăng nhập tạo ra phiên này, ví dụ password, google hoặc facebook.
  @Column({ name: "login_method", type: "varchar", length: 40, nullable: true })
  loginMethod: string | null;

  // Thời điểm refresh token được cấp, tương ứng thời điểm phiên bắt đầu.
  @CreateDateColumn({ name: "issued_at", type: "timestamptz" })
  issuedAt: Date;

  // Thời điểm phiên hoạt động gần nhất, được cập nhật khi user xem hoặc dùng phiên.
  @Column({ name: "last_active_at", type: "timestamptz", nullable: true })
  lastActiveAt: Date | null;

  // Thời điểm refresh token hết hạn; sau mốc này phiên không thể refresh access token nữa.
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  // Thời điểm phiên bị thu hồi; null nghĩa là phiên vẫn còn hiệu lực nếu chưa hết hạn.
  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  // Lý do thu hồi phiên, giúp phân biệt logout thường, đổi mật khẩu, token rotation hoặc nghi ngờ token bị dùng lại.
  @Column({
    name: "revoked_reason",
    type: "varchar",
    length: 60,
    nullable: true,
  })
  revokedReason: string | null;

  // IP tạo hoặc refresh phiên, dùng cho audit và hiển thị khi IP đủ hữu ích.
  @Column({ name: "ip_address", type: "varchar", length: 45, nullable: true })
  ipAddress: string | null;

  // User-agent gốc của trình duyệt, dùng để parse lại thiết bị nếu metadata chưa có hoặc cần audit.
  @Column({ name: "user_agent", type: "text", nullable: true })
  userAgent: string | null;

  // Keycloak client đã phát hành refresh token; cần lưu để refresh/revoke đúng client, nhất là social login.
  @Column({ name: "client_id", type: "varchar", length: 100, nullable: true })
  clientId: string | null;
}
