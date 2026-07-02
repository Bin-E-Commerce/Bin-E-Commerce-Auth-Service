import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Req,
} from "@nestjs/common";
import { Permission } from "@common/auth";
import { UserRole } from "@common/enums/user-role.enum";
import type { Request } from "express";
import { UpdateRolePermissionDto } from "../dto/update-role-permission.dto";
import { AccessControlService } from "../services/access-control.service";

@Controller("auth/access-control")
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  // Trả dữ liệu cấu hình role/permission/navigation cho Admin UI.
  // Auth-service vẫn tự kiểm tra x-user-permissions để không phụ thuộc hoàn toàn vào API Gateway.
  @Get("admin/overview")
  async getAdminOverview(@Headers("x-user-permissions") permissions = "") {
    this.assertAdminAccess(permissions);

    const data = await this.accessControlService.getAdminOverview();
    return {
      data,
      message: "Access control overview retrieved",
      statusCode: 200,
    };
  }

  // Cấp hoặc gỡ permission cho một role; thao tác này ghi audit log và xóa cache access profile.
  // Endpoint chỉ dành cho admin.access vì nó thay đổi quyền vận hành toàn hệ thống.
  @Patch("admin/roles/:roleCode/permissions")
  async updateRolePermission(
    @Param("roleCode") roleCode: UserRole,
    @Body() dto: UpdateRolePermissionDto,
    @Headers("x-user-permissions") permissions = "",
    @Headers("x-user-id") actorUserId = "",
    @Req() req: Request,
  ) {
    this.assertAdminAccess(permissions);

    const data = await this.accessControlService.updateRolePermission(
      roleCode,
      dto,
      {
        actorUserId: actorUserId || null,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      },
    );

    return {
      data,
      message: dto.enabled ? "Permission granted" : "Permission revoked",
      statusCode: 200,
    };
  }

  // Tách kiểm tra admin.access để mọi endpoint quản trị trong controller dùng cùng một luật.
  private assertAdminAccess(permissions: string): void {
    const permissionList = permissions
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean);

    if (!permissionList.includes(Permission.ADMIN_ACCESS)) {
      throw new ForbiddenException("Missing admin access permission");
    }
  }
}
