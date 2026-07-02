import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ACCESS_CONTROL_PERMISSION_VERSION,
  Permission,
  PermissionScope,
  normalizeBusinessRoles,
} from "@common/auth";
import { UserRole } from "@common/enums/user-role.enum";
import { In, IsNull, MoreThan, Repository } from "typeorm";
import { AccessPermission } from "../../../database/entities/access-permission.entity";
import { AccessRole } from "../../../database/entities/access-role.entity";
import { NavigationItem } from "../../../database/entities/navigation-item.entity";
import { PermissionAuditLog } from "../../../database/entities/permission-audit-log.entity";
import { RolePermission } from "../../../database/entities/role-permission.entity";
import { UserRoleAssignment } from "../../../database/entities/user-role-assignment.entity";
import { User } from "../../../database/entities/user.entity";
import { AccessControlCacheService } from "./access-control-cache.service";
import type { UpdateRolePermissionDto } from "../dto/update-role-permission.dto";
import type {
  AccessAreaDto,
  AccessNavigationItemDto,
  PermissionGrantDto,
  ViewerAccessDto,
} from "../types/access-profile.type";

export interface AccessControlActorContext {
  actorUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(AccessRole)
    private readonly roleRepo: Repository<AccessRole>,
    @InjectRepository(AccessPermission)
    private readonly permissionRepo: Repository<AccessPermission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(UserRoleAssignment)
    private readonly userRoleRepo: Repository<UserRoleAssignment>,
    @InjectRepository(NavigationItem)
    private readonly navigationRepo: Repository<NavigationItem>,
    @InjectRepository(PermissionAuditLog)
    private readonly auditRepo: Repository<PermissionAuditLog>,
    private readonly cache: AccessControlCacheService,
  ) {}

  // Build access profile cho viewer hiện tại; đây là dữ liệu FE dùng để render menu và điều hướng.
  // Redis cache giúp /me, /refresh không join bảng role/permission/navigation liên tục.
  async buildViewerAccess(
    user: User,
    tokenRoles: string[] = [],
  ): Promise<ViewerAccessDto> {
    const cached = await this.cache.get(
      user.id,
      ACCESS_CONTROL_PERMISSION_VERSION,
    );
    if (cached) return cached;

    const roles = await this.resolveUserRoles(user, tokenRoles);
    const grants = await this.resolvePermissionGrants(roles);
    const accessProfile = await this.buildAccessProfile(grants);
    const value = {
      permissions: grants.map((grant) => grant.code),
      permissionGrants: grants,
      accessProfile,
    };

    await this.cache.set(user.id, ACCESS_CONTROL_PERMISSION_VERSION, value);
    return value;
  }

  // Trả danh sách role/permission/navigation cho admin UI cấu hình quyền.
  // Dữ liệu này dùng để hiển thị ma trận quyền và trạng thái menu hiện tại.
  async getAdminOverview() {
    const [roles, permissions, rolePermissions, navigation] = await Promise.all([
      this.roleRepo.find({ order: { code: "ASC" } }),
      this.permissionRepo.find({
        where: { isActive: true },
        order: { resource: "ASC", action: "ASC" },
      }),
      this.rolePermissionRepo.find({
        relations: ["role", "permission"],
        order: { createdAt: "ASC" },
      }),
      this.navigationRepo.find({
        order: { area: "ASC", groupOrder: "ASC", sortOrder: "ASC" },
      }),
    ]);

    return {
      permissionVersion: ACCESS_CONTROL_PERMISSION_VERSION,
      roles,
      permissions,
      rolePermissions,
      navigation,
    };
  }

  // Cấp hoặc gỡ một permission cho role theo scope cụ thể.
  // Role-permission ảnh hưởng tới nhiều user nên sau khi đổi phải xóa toàn bộ access profile cache.
  async updateRolePermission(
    roleCode: UserRole,
    dto: UpdateRolePermissionDto,
    actor: AccessControlActorContext,
  ) {
    if (
      roleCode === UserRole.ADMIN &&
      dto.permissionCode === Permission.ADMIN_ACCESS &&
      dto.scope === PermissionScope.GLOBAL &&
      !dto.enabled
    ) {
      throw new BadRequestException(
        "Không thể gỡ admin.access khỏi role ADMIN để tránh tự khóa khu vực quản trị.",
      );
    }

    const [role, permission] = await Promise.all([
      this.roleRepo.findOne({ where: { code: roleCode } }),
      this.permissionRepo.findOne({ where: { code: dto.permissionCode } }),
    ]);

    if (!role) throw new NotFoundException("Không tìm thấy role.");
    if (!permission) throw new NotFoundException("Không tìm thấy permission.");

    const existing = await this.rolePermissionRepo.findOne({
      where: {
        roleId: role.id,
        permissionId: permission.id,
        scope: dto.scope,
      },
      relations: ["role", "permission"],
    });

    const before = existing
      ? {
          roleCode,
          permissionCode: dto.permissionCode,
          scope: dto.scope,
          isActive: existing.isActive,
        }
      : null;

    const saved = await this.rolePermissionRepo.save({
      id: existing?.id,
      roleId: role.id,
      permissionId: permission.id,
      scope: dto.scope,
      isActive: dto.enabled,
    });

    await this.auditRepo.save({
      actorUserId: actor.actorUserId,
      targetUserId: null,
      roleId: role.id,
      permissionId: permission.id,
      action: dto.enabled ? "ROLE_PERMISSION_GRANTED" : "ROLE_PERMISSION_REVOKED",
      before,
      after: {
        roleCode,
        permissionCode: dto.permissionCode,
        scope: dto.scope,
        isActive: dto.enabled,
      },
      reason: dto.reason ?? null,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    await this.cache.invalidateAll();

    return this.rolePermissionRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ["role", "permission"],
    });
  }

  // Ưu tiên user_roles DB nếu admin đã gán; vẫn merge users.role và tokenRoles để tương thích dữ liệu cũ.
  private async resolveUserRoles(
    user: User,
    tokenRoles: string[],
  ): Promise<UserRole[]> {
    const now = new Date();
    const assignments = await this.userRoleRepo.find({
      where: [
        { userId: user.id, isActive: true, expiresAt: IsNull() },
        { userId: user.id, isActive: true, expiresAt: MoreThan(now) },
      ],
      relations: ["role"],
    });
    const assignedRoles = assignments
      .map((assignment) => assignment.role?.code)
      .filter(Boolean);

    return normalizeBusinessRoles([user.role, ...tokenRoles, ...assignedRoles]);
  }

  // Gom permission theo các role nghiệp vụ, merge nhiều scope của cùng một permission thành một grant duy nhất.
  private async resolvePermissionGrants(
    roles: UserRole[],
  ): Promise<PermissionGrantDto[]> {
    if (roles.length === 0) return [];

    const roleRows = await this.roleRepo.find({
      where: { code: In(roles), isActive: true },
    });
    if (roleRows.length === 0) return [];

    const rolePermissions = await this.rolePermissionRepo.find({
      where: {
        roleId: In(roleRows.map((role) => role.id)),
        isActive: true,
      },
      relations: ["permission"],
    });

    const grantMap = new Map<Permission, Set<PermissionScope>>();
    for (const rolePermission of rolePermissions) {
      if (!rolePermission.permission?.isActive) continue;

      const code = rolePermission.permission.code;
      const scopes = grantMap.get(code) ?? new Set<PermissionScope>();
      scopes.add(rolePermission.scope);
      grantMap.set(code, scopes);
    }

    return [...grantMap.entries()].map(([code, scopes]) => ({
      code,
      scopes: [...scopes],
    }));
  }

  // Build profile theo từng area để FE không phải tự đoán admin/seller default route và sidebar.
  private async buildAccessProfile(grants: PermissionGrantDto[]) {
    const grantByCode = new Map(grants.map((grant) => [grant.code, grant]));
    const navigation = await this.navigationRepo.find({
      where: { isActive: true },
      order: { area: "ASC", groupOrder: "ASC", sortOrder: "ASC" },
    });

    const admin = this.buildArea(
      "admin",
      navigation,
      grantByCode,
      Permission.ADMIN_ACCESS,
      null,
    );
    const seller = this.buildArea(
      "seller",
      navigation,
      grantByCode,
      Permission.SELLER_ACCESS,
      "/seller",
    );

    return {
      permissionVersion: ACCESS_CONTROL_PERMISSION_VERSION,
      defaultRoute: admin.defaultRoute ?? seller.defaultRoute ?? "/",
      areas: { admin, seller },
    };
  }

  // Lọc navigation theo permission/scope và tách quyền vào khu vực khỏi quyền có menu.
  // Seller Center dùng seller.access để vào khung; từng màn hình con như dashboard vẫn được điều khiển bằng permission riêng.
  private buildArea(
    area: "admin" | "seller",
    navigation: NavigationItem[],
    grantByCode: Map<Permission, PermissionGrantDto>,
    accessPermissionCode: Permission,
    explicitDefaultRoute: string | null,
  ): AccessAreaDto {
    const hasAreaAccess = grantByCode.has(accessPermissionCode);
    const items = navigation
      .filter((item) => item.area === area)
      .filter((item) => this.canRenderNavigationItem(item, grantByCode))
      .map((item): AccessNavigationItemDto => ({
        code: item.code,
        groupCode: item.groupCode,
        groupLabel: item.groupLabel,
        groupOrder: item.groupOrder,
        label: item.label,
        description: item.description,
        href: item.href,
        icon: item.icon,
        sortOrder: item.sortOrder,
        requiredPermissionCode: item.requiredPermissionCode,
      }));

    return {
      canAccess: hasAreaAccess,
      defaultRoute: hasAreaAccess ? items[0]?.href ?? explicitDefaultRoute : null,
      navigation: items,
    };
  }

  // Kiểm tra một menu item có được render không dựa trên permission và scope backend đã cấp.
  private canRenderNavigationItem(
    item: NavigationItem,
    grantByCode: Map<Permission, PermissionGrantDto>,
  ): boolean {
    const grant = grantByCode.get(item.requiredPermissionCode);
    if (!grant) return false;
    if (!item.requiredScope) return true;
    return grant.scopes.includes(item.requiredScope);
  }
}
