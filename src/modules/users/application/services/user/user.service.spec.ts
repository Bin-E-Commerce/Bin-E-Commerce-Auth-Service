import type { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { User } from '@/database/entities/user.entity';
import { UserService } from '@/modules/users/application/services/user/user.service';

describe('UserService copilot profile projection', () => {
    // Khởi tạo service với dependency ngoài phạm vi test để xác minh repository chỉ đọc cột allowlist.
    it('selects only basic account fields and never returns entity relations', async () => {
        const userRepo = {
            findOne: jest.fn().mockResolvedValue({
                name: 'Người bán thử nghiệm',
                avatarUrl: 'https://cdn.example.test/avatar.jpg',
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
            select: ['name', 'avatarUrl', 'email', 'phone', 'role', 'status'],
        });
        expect(result).toEqual({
            name: 'Người bán thử nghiệm',
            avatarUrl: 'https://cdn.example.test/avatar.jpg',
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

describe('UserService.getEmailByLocalId', () => {
    let target: UserService;
    let mockUserRepository: { findOne: jest.Mock };

    beforeEach(() => {
        mockUserRepository = { findOne: jest.fn() };
        target = new UserService(
            mockUserRepository as unknown as Repository<User>,
            {} as never,
            {} as never,
            {} as never,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should read only email by the Auth DB user ID from finance events', async () => {
        // Arrange
        const localUserId = 'auth-user-id';
        mockUserRepository.findOne.mockResolvedValue({
            id: localUserId,
            email: 'seller@example.test',
        } as User);

        // Act
        const result = await target.getEmailByLocalId(localUserId);

        // Assert
        expect(result).toBe('seller@example.test');
        expect(mockUserRepository.findOne).toHaveBeenCalledWith({
            where: { id: localUserId },
            select: ['id', 'email'],
        });
        expect(mockUserRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw when the local account no longer exists', async () => {
        // Arrange
        mockUserRepository.findOne.mockResolvedValue(null);

        // Act & Assert
        await expect(
            target.getEmailByLocalId('deleted-user-id'),
        ).rejects.toThrow(NotFoundException);
        expect(mockUserRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'deleted-user-id' },
            select: ['id', 'email'],
        });
    });
});
