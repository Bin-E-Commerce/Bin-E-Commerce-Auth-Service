import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Permission } from '@common/auth';
import { RolePermission } from '@/database/entities/role-permission.entity';

// Bảng permissions lưu danh sách quyền chuẩn được seed từ code.
// Admin có thể gán quyền cho role, nhưng không nên tự tạo code quyền tùy ý ngoài shared package.
@Entity('access_permissions')
export class AccessPermission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Mã quyền là contract giữa backend guard, access profile và admin UI.
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 160, unique: true })
    code: Permission;

    @Column({ type: 'varchar', length: 160 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    // Resource/action giúp admin UI nhóm quyền theo nghiệp vụ thay vì hiển thị danh sách phẳng.
    @Column({ type: 'varchar', length: 100 })
    resource: string;

    @Column({ type: 'varchar', length: 80 })
    action: string;

    // Version hỗ trợ invalidate cache khi thay đổi bộ quyền sau deploy.
    @Column({ name: 'permission_version', type: 'varchar', length: 40 })
    permissionVersion: string;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @OneToMany(
        () => RolePermission,
        (rolePermission) => rolePermission.permission,
    )
    rolePermissions: RolePermission[];
}
