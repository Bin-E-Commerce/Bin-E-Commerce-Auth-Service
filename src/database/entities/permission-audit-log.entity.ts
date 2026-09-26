import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

// Bảng permission_audit_logs ghi lại mọi thay đổi liên quan đến role/permission.
// Audit log giúp truy vết ai đã cấp/gỡ quyền nào, rất quan trọng cho hệ thống vận hành thật.
@Entity('access_permission_audit_logs')
export class PermissionAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
    actorUserId: string | null;

    @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
    targetUserId: string | null;

    @Column({ name: 'role_id', type: 'uuid', nullable: true })
    roleId: string | null;

    @Column({ name: 'permission_id', type: 'uuid', nullable: true })
    permissionId: string | null;

    @Column({ type: 'varchar', length: 80 })
    action: string;

    @Column({ type: 'jsonb', nullable: true })
    before: Record<string, unknown> | null;

    @Column({ type: 'jsonb', nullable: true })
    after: Record<string, unknown> | null;

    @Column({ type: 'text', nullable: true })
    reason: string | null;

    @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
    ipAddress: string | null;

    @Column({ name: 'user_agent', type: 'text', nullable: true })
    userAgent: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
