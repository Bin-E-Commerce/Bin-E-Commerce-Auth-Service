import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRole } from '@common/enums/user-role.enum';
import { DataSource, Repository } from 'typeorm';
import { AccessRole } from '@/database/entities/access-role.entity';
import { UserRoleAssignment } from '@/database/entities/user-role-assignment.entity';
import { User } from '@/database/entities/user.entity';
import { AccessControlCacheService } from '@/modules/access-control/application/services/access-control-cache.service';
import { KeycloakAdminService } from '@/modules/auth/application/services/keycloak-admin.service';

// Boundary xử lý seller approval event: giữ role chính và assignment nhất quán
// trong DB, sau đó mirror role sang Keycloak mà không làm hạ quyền staff.
@Injectable()
export class SellerRoleAssignmentService {
    private readonly logger = new Logger(SellerRoleAssignmentService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(AccessRole)
        private readonly roleRepository: Repository<AccessRole>,
        private readonly dataSource: DataSource,
        private readonly accessCache: AccessControlCacheService,
        private readonly keycloakAdmin: KeycloakAdminService,
    ) {}

    // Kafka event có thể phát lại nên thao tác phải idempotent. User/role được
    // đọc trước để validate nhanh, còn transaction sẽ đọc lại user sau khi lock.
    async grantApprovedSellerRole(keycloakUserId: string): Promise<void> {
        const [user, sellerRole] = await Promise.all([
            this.userRepository.findOne({
                where: { keycloakId: keycloakUserId },
            }),
            this.roleRepository.findOne({ where: { code: UserRole.SELLER } }),
        ]);

        if (!user) {
            throw new NotFoundException(
                `Không tìm thấy user tương ứng Keycloak ID ${keycloakUserId}.`,
            );
        }

        if (!sellerRole) {
            throw new NotFoundException(
                'Role SELLER chưa được seed trong hệ thống phân quyền.',
            );
        }

        // Seller approval chỉ được nâng CUSTOMER thành SELLER. Event đến trễ hoặc
        // bị phát lại không được phép hạ quyền ADMIN/SUPPORT_AGENT về SELLER.
        if (user.role !== UserRole.CUSTOMER && user.role !== UserRole.SELLER) {
            this.logger.warn(
                `Bỏ qua seller approval cho privileged role ${user.role} của user ${user.id}.`,
            );
            return;
        }

        // Khóa user và cập nhật role + assignment trong cùng transaction. Event Kafka
        // có thể đến trễ hoặc phát lại, nên phải đọc lại state sau lock thay vì tin
        // bản ghi đã query trước đó.
        const mutation = await this.dataSource.transaction(async (manager) => {
            const transactionUserRepository = manager.getRepository(User);
            const transactionAssignmentRepository =
                manager.getRepository(UserRoleAssignment);
            const lockedUser = await transactionUserRepository.findOne({
                where: { id: user.id },
                lock: { mode: 'pessimistic_write' },
            });

            if (!lockedUser) {
                throw new NotFoundException(
                    'User không còn tồn tại khi xử lý seller approval.',
                );
            }

            // Re-check sau lock để event seller không thể hạ role nếu một mutation
            // Admin vừa chuyển user sang ADMIN hoặc SUPPORT_AGENT.
            if (
                lockedUser.role !== UserRole.CUSTOMER &&
                lockedUser.role !== UserRole.SELLER
            ) {
                this.logger.warn(
                    `Bỏ qua seller approval cho privileged role ${lockedUser.role} của user ${lockedUser.id}.`,
                );
                return null;
            }

            const previousRole = lockedUser.role;

            // Role chính chỉ giữ một assignment active. Assignment cũ được tắt trước
            // khi bật SELLER để access profile không còn quyền stale ngoài ý muốn.
            await transactionAssignmentRepository.update(
                { userId: lockedUser.id, isActive: true },
                { isActive: false },
            );
            await transactionAssignmentRepository.upsert(
                {
                    userId: lockedUser.id,
                    roleId: sellerRole.id,
                    assignedBy: null,
                    expiresAt: null,
                    isActive: true,
                },
                {
                    conflictPaths: ['userId', 'roleId'],
                    skipUpdateIfNoValuesChanged: true,
                },
            );

            if (lockedUser.role !== UserRole.SELLER) {
                lockedUser.role = UserRole.SELLER;
                await transactionUserRepository.save(lockedUser);
            }

            return { user: lockedUser, previousRole };
        });

        // Transaction có thể bỏ qua event do role privileged; khi đó không được
        // invalidate cache hoặc gọi Keycloak như một mutation mới.
        if (!mutation) return;
        const { user: lockedUser, previousRole } = mutation;

        // Cache phải xóa sau commit để request kế tiếp đọc đúng assignment SELLER.
        await this.accessCache.invalidateUser(lockedUser.id);

        // Keycloak chỉ là mirror cho token đăng nhập mới. Local DB vẫn là nguồn
        // quyền động, vì vậy lỗi mirror được log rõ nhưng không làm mất mutation DB.
        try {
            if (previousRole !== UserRole.SELLER) {
                await this.keycloakAdmin.removeRealmRole(
                    lockedUser.keycloakId,
                    previousRole,
                );
            }
            await this.keycloakAdmin.assignRealmRole(
                lockedUser.keycloakId,
                UserRole.SELLER,
            );
        } catch (error) {
            this.logger.warn(
                `Đã cấp role SELLER trong DB nhưng chưa đồng bộ được Keycloak cho user ${lockedUser.id}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}
