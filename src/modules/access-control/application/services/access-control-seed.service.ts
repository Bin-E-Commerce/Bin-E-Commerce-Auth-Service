import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ACCESS_CONTROL_PERMISSION_VERSION,
  NAVIGATION_ITEM_DEFINITIONS,
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_DEFINITIONS,
} from "@common/auth";
import { Repository } from "typeorm";
import { AccessPermission } from "../../../../database/entities/access-permission.entity";
import { AccessRole } from "../../../../database/entities/access-role.entity";
import { NavigationItem } from "../../../../database/entities/navigation-item.entity";
import { RolePermission } from "../../../../database/entities/role-permission.entity";

@Injectable()
export class AccessControlSeedService implements OnModuleInit {
  private readonly logger = new Logger(AccessControlSeedService.name);

  constructor(
    @InjectRepository(AccessRole)
    private readonly roleRepo: Repository<AccessRole>,
    @InjectRepository(AccessPermission)
    private readonly permissionRepo: Repository<AccessPermission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(NavigationItem)
    private readonly navigationRepo: Repository<NavigationItem>,
  ) {}

  // Seed access-control khi module khởi động để môi trường local/dev luôn có bộ quyền chuẩn.
  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    await this.seedRolePermissions();
    await this.seedNavigationItems();
  }

  // Upsert permission từ shared package; DB lưu trạng thái, còn code là nguồn định nghĩa quyền chuẩn.
  private async seedPermissions(): Promise<void> {
    const activePermissionCodes = new Set(
      PERMISSION_DEFINITIONS.map((definition) => definition.code),
    );

    for (const definition of PERMISSION_DEFINITIONS) {
      const existing = await this.permissionRepo.findOne({
        where: { code: definition.code },
      });

      await this.permissionRepo.save({
        id: existing?.id,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        resource: definition.resource,
        action: definition.action,
        permissionVersion: ACCESS_CONTROL_PERMISSION_VERSION,
        isActive: true,
      });
    }

    // Tắt permission không còn trong manifest để quyền cũ không tiếp tục được grant từ DB/cache.
    const existingPermissions = await this.permissionRepo.find();
    for (const permission of existingPermissions) {
      if (activePermissionCodes.has(permission.code)) continue;
      if (!permission.isActive) continue;

      await this.permissionRepo.save({
        ...permission,
        isActive: false,
      });
    }
  }

  // Upsert role hệ thống để admin UI có dữ liệu ngay cả khi chưa có migration thủ công.
  private async seedRoles(): Promise<void> {
    for (const definition of ROLE_DEFINITIONS) {
      const existing = await this.roleRepo.findOne({
        where: { code: definition.code },
      });

      await this.roleRepo.save({
        id: existing?.id,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: definition.isSystem,
        isActive: true,
      });
    }
  }

  // Upsert role-permission-scope mặc định, không xóa assignment thủ công để tránh mất quyền admin đã tùy chỉnh.
  private async seedRolePermissions(): Promise<void> {
    const roles = await this.roleRepo.find();
    const permissions = await this.permissionRepo.find();
    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const permissionByCode = new Map(
      permissions.map((permission) => [permission.code, permission]),
    );

    for (const definition of ROLE_PERMISSION_DEFINITIONS) {
      const role = roleByCode.get(definition.roleCode);
      const permission = permissionByCode.get(definition.permissionCode);
      if (!role || !permission) {
        this.logger.warn(
          `Skip role permission seed because role or permission is missing: ${definition.roleCode}/${definition.permissionCode}`,
        );
        continue;
      }

      const existing = await this.rolePermissionRepo.findOne({
        where: {
          roleId: role.id,
          permissionId: permission.id,
          scope: definition.scope,
        },
      });

      if (existing) continue;

      await this.rolePermissionRepo.save({
        roleId: role.id,
        permissionId: permission.id,
        scope: definition.scope,
        isActive: true,
      });
    }
  }

  // Upsert navigation item để FE lấy sidebar từ backend thay vì tự định nghĩa menu theo role.
  private async seedNavigationItems(): Promise<void> {
    for (const definition of NAVIGATION_ITEM_DEFINITIONS) {
      const existing = await this.navigationRepo.findOne({
        where: { code: definition.code },
      });

      await this.navigationRepo.save({
        id: existing?.id,
        area: definition.area,
        groupCode: definition.groupCode,
        groupLabel: definition.groupLabel,
        groupOrder: definition.groupOrder,
        code: definition.code,
        label: definition.label,
        description: definition.description,
        href: definition.href,
        icon: definition.icon,
        sortOrder: definition.sortOrder,
        requiredPermissionCode: definition.requiredPermissionCode,
        requiredScope: definition.requiredScope ?? null,
        parentId: null,
        isActive: true,
      });
    }
  }
}
