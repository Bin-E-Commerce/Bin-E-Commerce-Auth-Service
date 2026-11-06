// Controller profile nhận user ID đã được API Gateway xác thực và trả tài khoản nhận hoàn qua endpoint riêng.

import {
    Controller,
    Get,
    Header,
    Put,
    Post,
    Delete,
    Body,
    Param,
    Headers,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { UserService } from '@/modules/users/application/services/user/user.service';
import { UserRefundBankAccountService } from '@/modules/users/application/services/user/user-refund-bank-account.service';
import { UpdateProfileDto } from '@/modules/users/presentation/dto/update-profile.dto';
import { UpdateRefundBankAccountDto } from '@/modules/users/presentation/dto/update-refund-bank-account.dto';
import { CreateAddressDto } from '@/modules/users/presentation/dto/create-address.dto';
import { UpdateAddressDto } from '@/modules/users/presentation/dto/update-address.dto';
import { User } from '@/database/entities/user.entity';
import { AccessControlService } from '@/modules/access-control/application/services/access-control.service';

@Controller('users')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly refundBankAccountService: UserRefundBankAccountService,
        private readonly accessControlService: AccessControlService,
    ) {}

    @Get('me')
    async getProfile(@Headers('x-user-id') userId: string) {
        const user = await this.userService.getProfileByLocalId(userId);
        return {
            data: await this.toUserResponse(user),
            message: 'Profile retrieved',
            statusCode: 200,
        };
    }

    @Put('me')
    async updateProfile(
        @Headers('x-user-id') userId: string,
        @Body() dto: UpdateProfileDto,
    ) {
        const user = await this.userService.updateProfile(userId, dto);
        return {
            data: await this.toUserResponse(user),
            message: 'Profile updated',
            statusCode: 200,
        };
    }

    // Trả danh sách tài khoản ngân hàng của user hiện tại; x-user-id được Gateway gắn sau khi xác thực JWT.
    @Get('me/refund-bank-accounts')
    @Header('Cache-Control', 'private, no-store')
    async listRefundBankAccounts(@Headers('x-user-id') userId: string) {
        const accounts =
            await this.refundBankAccountService.listForUser(userId);
        return {
            data: accounts,
            message: 'Refund bank accounts retrieved',
            statusCode: 200,
        };
    }

    // Tạo tài khoản nhận hoàn; repository tự chọn làm mặc định khi đây là tài khoản đầu tiên của user.
    @Post('me/refund-bank-accounts')
    @Header('Cache-Control', 'private, no-store')
    @HttpCode(HttpStatus.CREATED)
    async createRefundBankAccount(
        @Headers('x-user-id') userId: string,
        @Body() dto: UpdateRefundBankAccountDto,
    ) {
        const account = await this.refundBankAccountService.createForUser(
            userId,
            dto,
        );
        return {
            data: account,
            message: 'Refund bank account created',
            statusCode: 201,
        };
    }

    // Cập nhật tài khoản theo ID và owner để một customer không thể sửa tài khoản của người khác.
    @Put('me/refund-bank-accounts/:id')
    @Header('Cache-Control', 'private, no-store')
    async updateRefundBankAccount(
        @Headers('x-user-id') userId: string,
        @Param('id', ParseUUIDPipe) accountId: string,
        @Body() dto: UpdateRefundBankAccountDto,
    ) {
        const account = await this.refundBankAccountService.updateForUser(
            userId,
            accountId,
            dto,
        );
        return {
            data: account,
            message: 'Refund bank account updated',
            statusCode: 200,
        };
    }

    // Xóa tài khoản theo owner; nếu đó là mặc định, use case chọn tài khoản còn lại làm mặc định.
    @Delete('me/refund-bank-accounts/:id')
    @Header('Cache-Control', 'private, no-store')
    async deleteRefundBankAccount(
        @Headers('x-user-id') userId: string,
        @Param('id', ParseUUIDPipe) accountId: string,
    ) {
        await this.refundBankAccountService.deleteForUser(userId, accountId);
        return {
            data: null,
            message: 'Refund bank account deleted',
            statusCode: 200,
        };
    }

    // Đặt mặc định qua transaction để bảng chỉ có một tài khoản nhận hoàn chính cho mỗi customer.
    @Put('me/refund-bank-accounts/:id/default')
    @Header('Cache-Control', 'private, no-store')
    async setDefaultRefundBankAccount(
        @Headers('x-user-id') userId: string,
        @Param('id', ParseUUIDPipe) accountId: string,
    ) {
        const account = await this.refundBankAccountService.setDefaultForUser(
            userId,
            accountId,
        );
        return {
            data: account,
            message: 'Default refund bank account updated',
            statusCode: 200,
        };
    }

    @Get('me/addresses')
    async listAddresses(@Headers('x-user-id') userId: string) {
        const addresses = await this.userService.listAddresses(userId);
        return {
            data: addresses,
            message: 'Addresses retrieved',
            statusCode: 200,
        };
    }

    @Post('me/addresses')
    @HttpCode(HttpStatus.CREATED)
    async createAddress(
        @Headers('x-user-id') userId: string,
        @Body() dto: CreateAddressDto,
    ) {
        const address = await this.userService.createAddress(userId, dto);
        return { data: address, message: 'Address created', statusCode: 201 };
    }

    @Put('me/addresses/:id')
    async updateAddress(
        @Headers('x-user-id') userId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAddressDto,
    ) {
        const address = await this.userService.updateAddress(userId, id, dto);
        return { data: address, message: 'Address updated', statusCode: 200 };
    }

    @Delete('me/addresses/:id')
    @HttpCode(HttpStatus.OK)
    async deleteAddress(
        @Headers('x-user-id') userId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        await this.userService.deleteAddress(userId, id);
        return { data: null, message: 'Address deleted', statusCode: 200 };
    }

    // ──────────────────────────────── SESSIONS ────────────────────────────────

    @Get('me/sessions')
    async getSessions(
        @Headers('x-user-id') userId: string,
        @Headers('x-session-id') currentSessionId?: string,
    ) {
        const sessions = await this.userService.getSessions(
            userId,
            currentSessionId,
        );
        return {
            data: sessions,
            message: 'Sessions retrieved',
            statusCode: 200,
        };
    }

    @Delete('me/sessions')
    @HttpCode(HttpStatus.OK)
    async revokeOtherSessions(
        @Headers('x-user-id') userId: string,
        @Headers('x-session-id') currentSessionId: string,
    ) {
        const revokedCount = await this.userService.revokeOtherSessions(
            userId,
            currentSessionId,
        );
        return {
            data: { revokedCount },
            message: 'Other sessions revoked',
            statusCode: 200,
        };
    }

    @Delete('me/sessions/:id')
    @HttpCode(HttpStatus.OK)
    async revokeSession(
        @Headers('x-user-id') userId: string,
        @Headers('x-session-id') currentSessionId: string,
        @Param('id', ParseUUIDPipe) sessionId: string,
    ) {
        await this.userService.revokeSession(
            userId,
            sessionId,
            currentSessionId,
        );
        return { data: null, message: 'Session revoked', statusCode: 200 };
    }

    // Chuẩn hóa response profile để FE luôn nhận permissions/accessProfile như /auth/refresh và /auth/me.
    private async toUserResponse(user: User) {
        const {
            id,
            email,
            name,
            phone,
            role,
            status,
            avatarUrl,
            createdAt,
            updatedAt,
            lastLoginAt,
        } = user;
        const roles = [role];
        const access = await this.accessControlService.buildViewerAccess(
            user,
            roles,
        );

        return {
            id,
            email,
            name,
            phone,
            role,
            roles,
            permissions: access.permissions,
            permissionGrants: access.permissionGrants,
            accessProfile: access.accessProfile,
            status,
            avatarUrl,
            lastLoginAt,
            createdAt,
            updatedAt,
        };
    }
}
