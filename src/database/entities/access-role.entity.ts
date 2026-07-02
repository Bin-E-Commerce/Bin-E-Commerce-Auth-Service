import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserRole } from "@common/enums/user-role.enum";
import { RolePermission } from "./role-permission.entity";
import { UserRoleAssignment } from "./user-role-assignment.entity";

// Bảng roles lưu vai trò nghiệp vụ có thể gán cho user, ví dụ ADMIN, SUPPORT_AGENT, SELLER.
// Role chỉ là nhóm quyền; quyền thật được quyết định qua bảng role_permissions.
@Entity("access_roles")
export class AccessRole {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Mã role cố định dùng trong token/seed/code, không dùng name hiển thị để phân quyền.
  @Index({ unique: true })
  @Column({ type: "varchar", length: 80, unique: true })
  code: UserRole;

  // Tên thân thiện cho admin UI.
  @Column({ type: "varchar", length: 120 })
  name: string;

  // Mô tả giúp người vận hành hiểu role này dùng cho nhóm người nào.
  @Column({ type: "text", nullable: true })
  description: string | null;

  // Role hệ thống như ADMIN/CUSTOMER không được xóa bằng UI để tránh khóa nhầm nền tảng.
  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  rolePermissions: RolePermission[];

  @OneToMany(() => UserRoleAssignment, (assignment) => assignment.role)
  userAssignments: UserRoleAssignment[];
}
