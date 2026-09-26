import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Headers,
    Param,
    Patch,
    Req,
} from '@nestjs/common';
import { Permission } from '@common/auth';
import { UserRole } from '@common/enums/user-role.enum';
import type { Request } from 'express';
import { UpdateRolePermissionDto } from '@/modules/access-control/presentation/dto/update-role-permission.dto';
import { AccessControlService } from '@/modules/access-control/application/services/access-control.service';

@Controller('auth/access-control')
export class AccessControlController {
    constructor(private readonly accessControlService: AccessControlService) {}

    // Trả toàn bộ dữ liệu để Admin UI render trang phân quyền: role, permission, role-permission và menu backend.
    // API Gateway đã chặn theo permission, nhưng auth-service vẫn check lại để endpoint nội bộ không bị phụ thuộc tuyệt đối vào gateway.
    @Get('admin/overview')
    async getAdminOverview(@Headers('x-user-permissions') permissions = '') {
        this.assertPermission(
            permissions,
            Permission.ADMIN_ACCESS_CONTROL_READ,
        );

        const overview = await this.accessControlService.getAdminOverview();
        const data = {
            ...overview,
            // FE chỉ cần đọc flag này để khóa/mở nút chỉnh sửa, không phải hard-code permission update ở client.
            canUpdateRolePermissions: this.hasPermission(
                permissions,
                Permission.ADMIN_ACCESS_CONTROL_UPDATE,
            ),
        };

        return {
            data,
            message: 'Access control overview retrieved',
            statusCode: 200,
        };
    }

    // Bật hoặc tắt một permission cho role cụ thể; đây là thao tác nhạy cảm nên cần quyền update riêng.
    // Service bên dưới sẽ ghi audit log và xóa cache access profile để quyền mới có hiệu lực cho các lần /me hoặc /refresh sau.
    @Patch('admin/roles/:roleCode/permissions')
    async updateRolePermission(
        @Param('roleCode') roleCode: UserRole,
        @Body() dto: UpdateRolePermissionDto,
        @Headers('x-user-permissions') permissions = '',
        @Headers('x-user-id') actorUserId = '',
        @Req() req: Request,
    ) {
        this.assertPermission(
            permissions,
            Permission.ADMIN_ACCESS_CONTROL_UPDATE,
        );

        const data = await this.accessControlService.updateRolePermission(
            roleCode,
            dto,
            {
                // Ghi lại ai là người thao tác để audit log truy vết được lịch sử cấp/gỡ quyền.
                actorUserId: actorUserId || null,
                ipAddress: req.ip ?? null,
                userAgent: req.headers['user-agent'] ?? null,
            },
        );

        return {
            data,
            message: dto.enabled ? 'Permission granted' : 'Permission revoked',
            statusCode: 200,
        };
    }

    // Parse header x-user-permissions do API Gateway forward xuống và chặn request nếu thiếu quyền bắt buộc.
    // Cách này giúp mỗi endpoint tự khai báo permission cần có, dễ audit và tránh nhầm giữa quyền xem/quyền sửa.
    private assertPermission(
        permissions: string,
        requiredPermission: Permission,
    ): void {
        const permissionList = permissions
            .split(',')
            .map((permission) => permission.trim())
            .filter(Boolean);

        if (!permissionList.includes(requiredPermission)) {
            throw new ForbiddenException('Missing access-control permission');
        }
    }

    // Kiểm tra quyền theo cùng format header để trả flag UI, thay vì bắt frontend tự suy luận quyền update.
    private hasPermission(
        permissions: string,
        requiredPermission: Permission,
    ): boolean {
        return permissions
            .split(',')
            .map((permission) => permission.trim())
            .filter(Boolean)
            .includes(requiredPermission);
    }
}
