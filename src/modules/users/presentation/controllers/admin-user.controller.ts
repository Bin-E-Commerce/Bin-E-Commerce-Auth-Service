import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminUserService } from '@/modules/users/application/services/admin/admin-user.service';
import { ListAdminUsersDto } from '@/modules/users/presentation/dto/list-admin-users.dto';
import { RevokeAdminUserSessionDto } from '@/modules/users/presentation/dto/revoke-admin-user-session.dto';
import { UpdateAdminUserRoleDto } from '@/modules/users/presentation/dto/update-admin-user-role.dto';
import { UpdateAdminUserStatusDto } from '@/modules/users/presentation/dto/update-admin-user-status.dto';

// Controller chỉ nhận identity do Gateway inject; quyền ADMIN được xác minh lại từ local database trong service.
@Controller('admin/users')
export class AdminUserController {
    constructor(private readonly adminUserService: AdminUserService) {}

    @Get()
    async list(
        @Headers('x-user-id') actorId: string,
        @Query() query: ListAdminUsersDto,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.listUsers(query),
            message: 'Users retrieved',
            statusCode: 200,
        };
    }

    @Get(':id')
    async detail(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.getUser(id),
            message: 'User retrieved',
            statusCode: 200,
        };
    }

    @Get(':id/sessions')
    async sessions(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.getSessions(id),
            message: 'Sessions retrieved',
            statusCode: 200,
        };
    }

    @Get(':id/audit')
    async audit(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.getAudit(id),
            message: 'Audit retrieved',
            statusCode: 200,
        };
    }

    @Put(':id/role')
    async updateRole(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAdminUserRoleDto,
        @Req() req: Request,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.updateRole(
                actorId,
                id,
                dto,
                this.context(req),
            ),
            message: 'Role updated',
            statusCode: 200,
        };
    }

    @Put(':id/status')
    async updateStatus(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAdminUserStatusDto,
        @Req() req: Request,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.updateStatus(
                actorId,
                id,
                dto,
                this.context(req),
            ),
            message: 'Status updated',
            statusCode: 200,
        };
    }

    @Delete(':id/sessions/:sessionId')
    async revokeSession(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Param('sessionId', ParseUUIDPipe) sessionId: string,
        @Body() dto: RevokeAdminUserSessionDto,
        @Req() req: Request,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.revokeSession(
                actorId,
                id,
                sessionId,
                dto.reason,
                this.context(req),
            ),
            message: 'Session revoked',
            statusCode: 200,
        };
    }

    @Post(':id/sessions/revoke-all')
    async revokeAllSessions(
        @Headers('x-user-id') actorId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RevokeAdminUserSessionDto,
        @Req() req: Request,
    ) {
        await this.authorize(actorId);
        return {
            data: await this.adminUserService.revokeAllSessionsForAdmin(
                actorId,
                id,
                dto.reason,
                this.context(req),
            ),
            message: 'All sessions revoked',
            statusCode: 200,
        };
    }

    private async authorize(actorId: string): Promise<void> {
        await this.adminUserService.assertAdminActor(actorId);
    }

    private context(req: Request) {
        return {
            // Gateway đã chuẩn hóa req.ip; không tin x-forwarded-for do browser tự gửi.
            ipAddress: req.ip ?? null,
            userAgent:
                typeof req.headers['user-agent'] === 'string'
                    ? req.headers['user-agent']
                    : null,
        };
    }
}
