import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Permission, PermissionScope } from '@common/auth';

// Bảng navigation_items lưu menu/màn hình mà FE được render theo accessProfile.
// FE không tự định nghĩa sidebar lớn; backend trả danh sách menu hợp lệ dựa trên permission của user.
@Entity('access_navigation_items')
export class NavigationItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'parent_id', type: 'uuid', nullable: true })
    parentId: string | null;

    @Index()
    @Column({ type: 'varchar', length: 40 })
    area: 'admin' | 'seller';

    @Column({
        name: 'group_code',
        type: 'varchar',
        length: 80,
        default: 'default',
    })
    groupCode: string;

    @Column({
        name: 'group_label',
        type: 'varchar',
        length: 120,
        default: 'Chung',
    })
    groupLabel: string;

    @Column({ name: 'group_order', type: 'int', default: 0 })
    groupOrder: number;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 120, unique: true })
    code: string;

    @Column({ type: 'varchar', length: 120 })
    label: string;

    @Column({ type: 'varchar', length: 180 })
    description: string;

    @Column({ type: 'varchar', length: 240 })
    href: string;

    @Column({ type: 'varchar', length: 80 })
    icon: string;

    @Column({ name: 'sort_order', type: 'int', default: 0 })
    sortOrder: number;

    @Column({ name: 'required_permission_code', type: 'varchar', length: 160 })
    requiredPermissionCode: Permission;

    @Column({
        name: 'required_scope',
        type: 'varchar',
        length: 40,
        nullable: true,
    })
    requiredScope: PermissionScope | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
