/// <reference types="jest" />

import { UserRole } from '@common/enums/user-role.enum';
import { SellerRoleAssignmentService } from '@/modules/users/application/services/seller/seller-role-assignment.service';

// Seller approval là event có thể đến trễ hoặc được phát lại; test này bảo vệ
// invariant quan trọng: event seller không được hạ quyền của nhân sự quản trị.
describe('SellerRoleAssignmentService', () => {
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

            await service.grantApprovedSellerRole('kc-id');

            expect(assignmentRepository.upsert).not.toHaveBeenCalled();
            expect(accessCache.invalidateUser).not.toHaveBeenCalled();
            expect(keycloakAdmin.assignRealmRole).not.toHaveBeenCalled();
        },
    );
});
