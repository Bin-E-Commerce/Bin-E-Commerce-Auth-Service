// Test flow forgot/reset password ở application boundary bằng mock repository, Redis OTP và Keycloak.
// Test không boot database thật, không gửi email thật và chỉ kiểm tra các invariant bảo mật của use case.

/// <reference types="jest" />

import {
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { OtpPurpose } from '@/database/entities/otp-challenge.entity';
import { User } from '@/database/entities/user.entity';
import { UserStatus } from '@common/enums/user-status.enum';
import { AuthService } from '@/modules/auth/application/services/auth.service';

type PasswordResetMocks = {
    userRepo: {
        findOne: jest.Mock;
    };
    refreshTokenRepo: {
        update: jest.Mock;
    };
    keycloakAdmin: {
        resetUserPassword: jest.Mock;
    };
    otpService: {
        createChallenge: jest.Mock;
        sendOtp: jest.Mock;
        verifyOtp: jest.Mock;
    };
};

// Tạo AuthService tối thiểu để test password recovery không phụ thuộc vào Nest container hoặc hạ tầng ngoài.
function createPasswordResetService(): {
    target: AuthService;
    mocks: PasswordResetMocks;
} {
    const mocks: PasswordResetMocks = {
        userRepo: {
            findOne: jest.fn(),
        },
        refreshTokenRepo: {
            update: jest.fn().mockResolvedValue(undefined),
        },
        keycloakAdmin: {
            resetUserPassword: jest.fn().mockResolvedValue(undefined),
        },
        otpService: {
            createChallenge: jest.fn(),
            sendOtp: jest.fn().mockResolvedValue(undefined),
            verifyOtp: jest.fn(),
        },
    };

    const target = new AuthService(
        mocks.userRepo as never,
        mocks.refreshTokenRepo as never,
        mocks.keycloakAdmin as never,
        mocks.otpService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );

    return { target, mocks };
}

describe('AuthService password recovery', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should keep a generic response when the email does not exist', async () => {
        // Arrange
        const { target, mocks } = createPasswordResetService();
        mocks.userRepo.findOne.mockResolvedValue(null);

        // Act
        const result = await target.forgotPassword({
            email: 'Missing@Example.com',
        });

        // Assert
        expect(result).toEqual({
            message: 'If the email exists, an OTP has been sent',
            expiresIn: 600,
        });
        expect(mocks.otpService.createChallenge).not.toHaveBeenCalled();
        expect(mocks.otpService.sendOtp).not.toHaveBeenCalled();
    });

    it('should create and send a reset OTP for an active user', async () => {
        // Arrange
        const { target, mocks } = createPasswordResetService();
        const user = {
            id: 'user-1',
            email: 'active@example.com',
            status: UserStatus.ACTIVE,
        } as User;
        mocks.userRepo.findOne.mockResolvedValue(user);
        mocks.otpService.createChallenge.mockResolvedValue('123456');

        // Act
        const result = await target.forgotPassword({
            email: ' Active@Example.com ',
        });

        // Assert
        expect(result.expiresIn).toBe(600);
        expect(mocks.otpService.createChallenge).toHaveBeenCalledWith(
            'active@example.com',
            OtpPurpose.RESET_PASSWORD,
        );
        expect(mocks.otpService.sendOtp).toHaveBeenCalledWith(
            'active@example.com',
            '123456',
            OtpPurpose.RESET_PASSWORD,
            'email',
        );
    });

    it('should reset the Keycloak password and revoke all refresh sessions', async () => {
        // Arrange
        const { target, mocks } = createPasswordResetService();
        const user = {
            id: 'user-1',
            email: 'active@example.com',
            keycloakId: 'keycloak-user-1',
            status: UserStatus.ACTIVE,
        } as User;
        mocks.otpService.verifyOtp.mockResolvedValue(null);
        mocks.userRepo.findOne.mockResolvedValue(user);

        // Act
        const result = await target.resetPassword({
            identifier: ' Active@Example.com ',
            otp: '123456',
            newPassword: 'NewPassword123',
        });

        // Assert
        expect(result).toEqual({
            message: 'Password reset successful. Please log in again.',
        });
        expect(mocks.otpService.verifyOtp).toHaveBeenCalledWith(
            'active@example.com',
            OtpPurpose.RESET_PASSWORD,
            '123456',
        );
        expect(mocks.keycloakAdmin.resetUserPassword).toHaveBeenCalledWith(
            'keycloak-user-1',
            'NewPassword123',
        );
        expect(mocks.refreshTokenRepo.update).toHaveBeenCalledWith(
            { userId: 'user-1' },
            {
                revokedAt: expect.any(Date),
                revokedReason: 'PASSWORD_RESET',
            },
        );
    });

    it('should reject a reset for a banned user before changing the password', async () => {
        // Arrange
        const { target, mocks } = createPasswordResetService();
        mocks.otpService.verifyOtp.mockResolvedValue(null);
        mocks.userRepo.findOne.mockResolvedValue({
            id: 'user-1',
            email: 'banned@example.com',
            keycloakId: 'keycloak-user-1',
            status: UserStatus.BANNED,
        } as User);

        // Act & Assert
        await expect(
            target.resetPassword({
                identifier: 'banned@example.com',
                otp: '123456',
                newPassword: 'NewPassword123',
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(mocks.keycloakAdmin.resetUserPassword).not.toHaveBeenCalled();
        expect(mocks.refreshTokenRepo.update).not.toHaveBeenCalled();
    });

    it('should stop before loading the user when OTP verification fails', async () => {
        // Arrange
        const { target, mocks } = createPasswordResetService();
        mocks.otpService.verifyOtp.mockRejectedValue(
            new BadRequestException('OTP not found. Please request a new one.'),
        );

        // Act & Assert
        await expect(
            target.resetPassword({
                identifier: 'active@example.com',
                otp: '000000',
                newPassword: 'NewPassword123',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mocks.userRepo.findOne).not.toHaveBeenCalled();
        expect(mocks.keycloakAdmin.resetUserPassword).not.toHaveBeenCalled();
    });
});
