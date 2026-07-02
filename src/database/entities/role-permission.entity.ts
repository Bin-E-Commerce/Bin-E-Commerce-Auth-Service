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
import { PermissionScope } from "@common/auth";
import { AccessRole } from "./access-role.entity";
import { AccessPermission } from "./access-permission.entity";

// Bảng role_permissions nối role với permission và scope.
// Scope cho biết quyền này áp dụng toàn hệ thống, dữ liệu của chính user, shop sở hữu hay shop được phân công.
@Entity("access_role_permissions")
@Index(["roleId", "permissionId", "scope"], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "role_id", type: "uuid" })
  roleId: string;

  @Column({ name: "permission_id", type: "uuid" })
  permissionId: string;

  @Column({ type: "varchar", length: 40 })
  scope: PermissionScope;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @ManyToOne(() => AccessRole, (role) => role.rolePermissions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "role_id" })
  role: AccessRole;

  @ManyToOne(
    () => AccessPermission,
    (permission) => permission.rolePermissions,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "permission_id" })
  permission: AccessPermission;
}
