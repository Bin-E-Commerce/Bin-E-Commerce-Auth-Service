import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

// Audit riêng cho vận hành tài khoản; không dùng permission audit vì ngữ nghĩa và vòng đời khác nhau.
@Entity("user_admin_audit_logs")
@Index(["targetUserId", "createdAt"])
export class UserAdminAuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "actor_user_id", type: "uuid", nullable: true })
  actorUserId: string | null;

  @Column({ name: "target_user_id", type: "uuid" })
  targetUserId: string;

  @Column({ type: "varchar", length: 80 })
  action: string;

  @Column({ type: "jsonb", nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  // PENDING cho biết DB đã ghi nhận thao tác nhưng bước đồng bộ Keycloak chưa kết thúc.
  // Trạng thái này giúp audit phản ánh đúng lỗi giữa chừng thay vì giả vờ thành công.
  @Column({
    name: "sync_status",
    type: "varchar",
    length: 20,
    default: "SUCCESS",
  })
  syncStatus: "PENDING" | "SUCCESS" | "FAILED";

  @Column({ name: "ip_address", type: "varchar", length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: "user_agent", type: "text", nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
