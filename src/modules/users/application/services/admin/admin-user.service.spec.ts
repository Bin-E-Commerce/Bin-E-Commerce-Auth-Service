/// <reference types="jest" />

import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@common/enums/user-role.enum';
import { UserStatus } from '@common/enums/user-status.enum';
import { User } from '@/database/entities/user.entity';
import { AdminUserService } from '@/modules/users/application/services/admin/admin-user.service';

// Test boundary authorization của user-management mà không boot database thật.
// Mục tiêu là chứng minh role trong header/JWT không đủ: Auth Service vẫn phải
// đọc user local và từ chối ADMIN đã bị khóa hoặc mọi role khác.
describe('AdminUserService authorization', () => {
    function createService(
        user: { id: string; role: UserRole; status: UserStatus } | null,
    ) {
        const userRepo = {
            findOne: jest.fn().mockResolvedValue(user),
        } as never;
        return new AdminUserService(
            userRepo,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );
    }

    it('cho phép chỉ ADMIN đang ACTIVE', async () => {
        await expect(
            createService({
                id: 'admin-id',
                role: UserRole.ADMIN,
                status: UserStatus.ACTIVE,
            }).assertAdminActor('admin-id'),
        ).resolves.toBeUndefined();
    });

    // Dùng transaction mock tối thiểu để kiểm tra rule qua public method,
    // thay vì gọi trực tiếp private helper và làm test phụ thuộc implementation.
    function createMutationService(targetUser: Partial<User>) {
        const targetRepository = {
            findOne: jest.fn().mockResolvedValue(targetUser),
        };
        const queryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
        };
        const manager = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
            getRepository: jest.fn().mockReturnValue(targetRepository),
        };
        const dataSource = {
            transaction: jest.fn((callback: (value: unknown) => unknown) =>
                callback(manager),
            ),
        };
        return new AdminUserService(
            {} as never,
            {} as never,
            {} as never,
            dataSource as never,
            {} as never,
            {} as never,
            {} as never,
        );
    }

    it.each([
        [UserRole.SUPPORT_AGENT, UserStatus.ACTIVE],
        [UserRole.ADMIN, UserStatus.BANNED],
    ] as const)(
        'từ chối actor %s/%s dù request có thể mang role ADMIN cũ',
        async (role, status) => {
            await expect(
                createService({
                    id: 'actor-id',
                    role,
                    status,
                }).assertAdminActor('actor-id'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        },
    );

    it('từ chối actor không còn tồn tại trong local database', async () => {
        await expect(
            createService(null).assertAdminActor('missing-id'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chặn admin thay đổi role của một admin khác', async () => {
        // Arrange
        const target = createMutationService({
            id: 'target-admin',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
        });

        // Act & Assert
        await expect(
            target.updateRole(
                'actor-admin',
                'target-admin',
                {
                    role: UserRole.CUSTOMER,
                    reason: 'Không hợp lệ',
                },
                { ipAddress: null, userAgent: null },
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chặn admin thay đổi status hoặc thu hồi session của admin khác', async () => {
        // Arrange
        const target = createMutationService({
            id: 'target-admin',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
        });

        // Act & Assert
        await expect(
            target.updateStatus(
                'actor-admin',
                'target-admin',
                {
                    status: UserStatus.BANNED,
                    reason: 'Không hợp lệ',
                },
                { ipAddress: null, userAgent: null },
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            target.revokeAllSessionsForAdmin(
                'actor-admin',
                'target-admin',
                'Không hợp lệ',
                { ipAddress: null, userAgent: null },
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
