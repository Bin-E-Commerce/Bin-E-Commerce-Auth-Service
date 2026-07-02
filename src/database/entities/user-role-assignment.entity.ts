import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { AccessRole } from "./access-role.entity";

// Bảng user_role_assignments cho phép một user có nhiều role.
// Hiện tại vẫn fallback từ users.role cũ, nhưng bảng này là nền để admin UI gán role linh hoạt.
@Entity("access_user_roles")
@Index(["userId", "roleId"], { unique: true })
export class UserRoleAssignment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "role_id", type: "uuid" })
  roleId: string;

  @Column({ name: "assigned_by", type: "uuid", nullable: true })
  assignedBy: string | null;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => AccessRole, (role) => role.userAssignments, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "role_id" })
  role: AccessRole;
}
