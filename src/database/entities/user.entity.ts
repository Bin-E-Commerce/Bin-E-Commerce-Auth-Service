import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from "typeorm";
import { UserRole } from "@common/enums/user-role.enum";
import { UserStatus } from "@common/enums/user-status.enum";
import { UserAddress } from "./user-address.entity";
import { RefreshToken } from "./refresh-token.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255, unique: true })
  email: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  // Keycloak ID là một UUID được Keycloak gán cho mỗi người dùng khi họ được tạo ra trong hệ thống Keycloak.
  // Việc lưu trữ keycloakId trong bảng users giúp chúng ta có thể liên kết trực tiếp giữa người dùng trong hệ thống của chúng ta với người dùng tương ứng trong Keycloak,
  // điều này rất hữu ích cho việc quản lý người dùng và xác thực thông qua Keycloak.
  @Index({ unique: true })
  @Column({ name: "keycloak_id", type: "varchar", length: 36, unique: true })
  keycloakId: string;

  @Column({ type: "varchar", length: 50, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ type: "varchar", length: 20, default: UserStatus.ACTIVE })
  status: UserStatus;

  // Avatar URL là một trường tùy chọn để lưu trữ đường dẫn đến ảnh đại diện của người dùng. Trường này có thể null nếu người dùng chưa thiết lập ảnh đại diện.
  @Column({ name: "avatar_url", type: "text", nullable: true })
  avatarUrl: string | null;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @OneToMany(() => UserAddress, (address) => address.user)
  addresses: UserAddress[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];
}
