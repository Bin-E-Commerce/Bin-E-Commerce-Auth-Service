import type { Repository } from 'typeorm';
import { User } from '@/database/entities/user.entity';
import { UserService } from '@/modules/users/application/services/user/user.service';

describe('UserService copilot profile projection', () => {
    // Khởi tạo service với dependency ngoài phạm vi test để xác minh repository chỉ đọc cột allowlist.
    it('selects only basic account fields and never returns entity relations', async () => {
        const userRepo = {
            findOne: jest.fn().mockResolvedValue({
                name: 'Người bán thử nghiệm',
                email: 'seller@example.test',
                phone: '0900000000',
                role: 'SELLER',
                status: 'ACTIVE',
            }),
        };
        const target = new UserService(
            userRepo as unknown as Repository<User>,
            {} as never,
            {} as never,
            {} as never,
        );

        const result = await target.getCopilotProfileByLocalId('user-id');

        expect(userRepo.findOne).toHaveBeenCalledWith({
            where: { id: 'user-id' },
            select: ['name', 'email', 'phone', 'role', 'status'],
        });
        expect(result).toEqual({
            name: 'Người bán thử nghiệm',
            email: 'seller@example.test',
            phone: '0900000000',
            role: 'SELLER',
            status: 'ACTIVE',
        });
        expect(result).not.toHaveProperty('keycloakId');
        expect(result).not.toHaveProperty('addresses');
        expect(result).not.toHaveProperty('refreshTokens');
    });
});
