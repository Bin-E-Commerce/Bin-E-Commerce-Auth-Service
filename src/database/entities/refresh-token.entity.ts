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

// Lý do cần lưu refresh token trong database: để quản lý vòng đời của refresh token,
// Bao gồm việc thu hồi (revocation) khi người dùng đăng xuất hoặc khi có dấu hiệu nghi ngờ về bảo mật
// cũng như để hỗ trợ việc xoá các token cũ sau một khoảng thời gian nhất định để giảm thiểu rủi ro bảo mật
// Biết user agent và IP address khi tạo refresh token cũng giúp chúng ta có thể phát hiện các hoạt động đáng ngờ,
// ví dụ: nếu một refresh token được sử dụng từ một địa chỉ IP hoặc user agent khác với lần tạo token, chúng ta có thể đánh dấu token đó là nghi ngờ và yêu cầu người dùng xác thực lại
@Entity("refresh_tokens")
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  // Thiết lập quan hệ nhiều-nhiều giữa RefreshToken và User, với cascade delete để tự động xóa refresh token khi user bị xóa
  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // Hash của refresh token, được index để tối ưu hóa việc tìm kiếm khi xác thực token
  @Index()
  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash: string;

  // Thời điểm phát hành của refresh token, dùng để xác định tuổi của token và có thể dùng để thực hiện các chính sách xoá token cũ sau một khoảng thời gian nhất định
  @CreateDateColumn({ name: "issued_at", type: "timestamptz" })
  issuedAt: Date;

  // Thời điểm hết hạn của refresh token, sau thời điểm này token sẽ không còn hợp lệ và cần được làm mới
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  // Thời điểm token bị thu hồi, nếu có, dùng để xác định token không còn hợp lệ trước thời điểm hết hạn nếu token bị thu hồi vì lý do bảo mật hoặc người dùng đăng xuất
  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  // Địa chỉ IP của người dùng khi tạo refresh token, hữu ích cho việc logging hoặc phát hiện hành vi đáng ngờ
  @Column({ name: "ip_address", type: "varchar", length: 45, nullable: true })
  ipAddress: string | null;

  // User agent của người dùng khi tạo refresh token, hữu ích cho việc logging hoặc phát hiện hành vi đáng ngờ
  @Column({ name: "user_agent", type: "text", nullable: true })
  userAgent: string | null;

  // Keycloak client_id dùng để phát hành token này — cần để rotate đúng client khi refresh
  // Mặc định null = dùng auth-service client (password grant); 'web-client' = social login
  @Column({ name: "client_id", type: "varchar", length: 100, nullable: true })
  clientId: string | null;
}
