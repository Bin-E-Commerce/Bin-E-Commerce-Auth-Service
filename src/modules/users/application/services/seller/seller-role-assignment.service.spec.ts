/// <reference types="jest" />

import { UserRole } from '@common/enums/user-role.enum';
import { UserRoleAssignment } from '@/database/entities/user-role-assignment.entity';
import { User } from '@/database/entities/user.entity';
import { SellerRoleAssignmentService } from '@/modules/users/application/services/seller/seller-role-assignment.service';

// Seller approval tra theo user ID nội bộ và không được hạ quyền nhân sự quản trị.
describe('SellerRoleAssignmentService', () => {
    it('cấp role SELLER theo user ID nội bộ và mirror bằng Keycloak ID', async () => {
        // Arrange: event mang ID Auth DB; Keycloak ID chỉ dùng khi mirror role.
        const user = {
            id: 'internal-user-id',
            keycloakId: 'keycloak-subject-id',
            role: UserRole.CUSTOMER,
        };
        const lockedUser = { ...user };
        const userRepository = {
            findOne: jest.fn().mockResolvedValue(user),
        };
        const roleRepository = {
            findOne: jest.fn().mockResolvedValue({ id: 'seller-role-id' }),
        };
        const transactionUserRepository = {
            findOne: jest.fn().mockResolvedValue(lockedUser),
            save: jest.fn().mockResolvedValue(lockedUser),
        };
        const assignmentRepository = {
            update: jest.fn().mockResolvedValue(undefined),
            upsert: jest.fn().mockResolvedValue(undefined),
        };
        const dataSource = {
            transaction: jest.fn(
                async (
                    callback: (manager: {
                        getRepository: (entity: unknown) => unknown;
                    }) => Promise<unknown>,
                ) =>
                    callback({
                        getRepository: (entity) =>
                            entity === User
                                ? transactionUserRepository
                                : entity === UserRoleAssignment
                                  ? assignmentRepository
                                  : undefined,
                    }),
            ),
        };
        const accessCache = { invalidateUser: jest.fn() };
        const keycloakAdmin = {
            removeRealmRole: jest.fn(),
            assignRealmRole: jest.fn(),
        };
        const target = new SellerRoleAssignmentService(
            userRepository as never,
            roleRepository as never,
            dataSource as never,
            accessCache as never,
            keycloakAdmin as never,
        );

        // Act: xử lý event theo userId nội bộ, không dùng Keycloak subject để tìm DB.
        await target.grantApprovedSellerRole('internal-user-id');

        // Assert: cả hai lần tra DB dùng ID nội bộ, còn Keycloak nhận subject riêng.
        expect(userRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'internal-user-id' },
        });
        expect(transactionUserRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'internal-user-id' },
            lock: { mode: 'pessimistic_write' },
        });
        expect(lockedUser.role).toBe(UserRole.SELLER);
        expect(assignmentRepository.upsert).toHaveBeenCalledWith(
            {
                userId: 'internal-user-id',
                roleId: 'seller-role-id',
                assignedBy: null,
                expiresAt: null,
                isActive: true,
            },
            {
                conflictPaths: ['userId', 'roleId'],
                skipUpdateIfNoValuesChanged: true,
            },
        );
        expect(keycloakAdmin.assignRealmRole).toHaveBeenCalledWith(
            'keycloak-subject-id',
            UserRole.SELLER,
        );
        expect(keycloakAdmin.removeRealmRole).toHaveBeenCalledWith(
            'keycloak-subject-id',
            UserRole.CUSTOMER,
        );
        expect(accessCache.invalidateUser).toHaveBeenCalledWith(
            'internal-user-id',
        );
    });

    it.each([UserRole.ADMIN, UserRole.SUPPORT_AGENT])(
        'bỏ qua event SELLER khi user đang có role privileged %s',
        async (role) => {
            const userRepository = {
                findOne: jest
                    .fn()
                    .mockResolvedValue({
                        id: 'user-id',
                        keycloakId: 'kc-id',
                        role,
                    }),
            };
            const roleRepository = {
                findOne: jest.fn().mockResolvedValue({ id: 'seller-role-id' }),
            };
            const assignmentRepository = { upsert: jest.fn() };
            const accessCache = { invalidateUser: jest.fn() };
            const keycloakAdmin = { assignRealmRole: jest.fn() };
            const dataSource = { transaction: jest.fn() };
            const service = new SellerRoleAssignmentService(
                userRepository as never,
                roleRepository as never,
                dataSource as never,
                accessCache as never,
                keycloakAdmin as never,
            );

            await service.grantApprovedSellerRole('user-id');

            expect(assignmentRepository.upsert).not.toHaveBeenCalled();
            expect(accessCache.invalidateUser).not.toHaveBeenCalled();
            expect(keycloakAdmin.assignRealmRole).not.toHaveBeenCalled();
        },
    );
});
