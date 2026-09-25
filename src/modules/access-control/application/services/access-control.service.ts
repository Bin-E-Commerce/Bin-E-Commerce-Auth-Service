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
import { AccessPermission } from "../../../../database/entities/access-permission.entity";
import { AccessRole } from "../../../../database/entities/access-role.entity";
import { NavigationItem } from "../../../../database/entities/navigation-item.entity";
import { PermissionAuditLog } from "../../../../database/entities/permission-audit-log.entity";
import { RolePermission } from "../../../../database/entities/role-permission.entity";
import { UserRoleAssignment } from "../../../../database/entities/user-role-assignment.entity";
import { User } from "../../../../database/entities/user.entity";
import type { UpdateRolePermissionDto } from "../../presentation/dto/update-role-permission.dto";
import type {
  AccessAreaDto,
  AccessNavigationItemDto,
  PermissionGrantDto,
  ViewerAccessDto,
} from "../types/access-profile.type";
import { AccessControlCacheService } from "./access-control-cache.service";

export interface AccessControlActorContext {
  actorUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

const ADMIN_CRITICAL_PERMISSION_CODES = new Set<Permission>([
  Permission.ADMIN_ACCESS, // Quyền vào khung Admin Center.
  Permission.ADMIN_DASHBOARD_VIEW, // Quyền xem dashboard mặc định sau khi vào Admin Center.
  Permission.ADMIN_ACCESS_CONTROL_READ, // Quyền xem danh sách role, permission, menu trong Admin Center.
  Permission.ADMIN_ACCESS_CONTROL_UPDATE, // Quyền cấp hoặc gỡ permission cho role.
]);

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

  // Build access profile cho user hiện tại để /me và /refresh trả về quyền, scope và menu mà FE được phép render.
  // Kết quả được cache theo userId + permissionVersion để tránh join nhiều bảng role/permission/navigation ở mọi request.
  async buildViewerAccess(
    user: User,
    _tokenRoles: string[] = [],
  ): Promise<ViewerAccessDto> {
    const cached = await this.cache.get(
      user.id,
      ACCESS_CONTROL_PERMISSION_VERSION,
    );
    if (cached) return cached;

    const roles = await this.resolveUserRoles(user);
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

  // Trả dữ liệu nền cho trang Admin Access Control: catalog role, catalog permission, permission đang gán và menu backend.
  // Endpoint chỉ đọc dữ liệu, còn quyền được phép chỉnh sửa sẽ do controller thêm flag canUpdateRolePermissions dựa trên header.
  async getAdminOverview() {
    const [roles, permissions, rolePermissions, navigation] = await Promise.all(
      [
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
      ],
    );

    return {
      permissionVersion: ACCESS_CONTROL_PERMISSION_VERSION,
      roles,
      permissions,
      rolePermissions,
      navigation,
    };
  }

  // Bật hoặc tắt một permission cho role theo scope cụ thể, dùng cho màn Admin Access Control.
  // Sau khi thay đổi role-permission phải ghi audit và xóa cache vì một role có thể đang ảnh hưởng tới nhiều user.
  async updateRolePermission(
    roleCode: UserRole,
    dto: UpdateRolePermissionDto,
    actor: AccessControlActorContext,
  ) {
    // Chặn việc tự gỡ các quyền sống còn của ADMIN để tránh khóa toàn bộ hệ thống khỏi Admin Center.
    if (this.isDisablingCriticalAdminPermission(roleCode, dto)) {
      throw new BadRequestException(
        "Không thể gỡ quyền quản trị cốt lõi khỏi role ADMIN để tránh tự khóa hệ thống.",
      );
    }

    const [role, permission] = await Promise.all([
      this.roleRepo.findOne({ where: { code: roleCode } }),
      this.permissionRepo.findOne({ where: { code: dto.permissionCode } }),
    ]);

    if (!role) throw new NotFoundException("Không tìm thấy role.");
    if (!permission) throw new NotFoundException("Không tìm thấy permission.");

    // Tìm record cũ theo role + permission + scope để update idempotent thay vì insert trùng.
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

    // Audit log lưu before/after để sau này admin biết ai đã cấp/gỡ quyền nào, lúc nào và vì lý do gì.
    await this.auditRepo.save({
      actorUserId: actor.actorUserId,
      targetUserId: null,
      roleId: role.id,
      permissionId: permission.id,
      action: dto.enabled
        ? "ROLE_PERMISSION_GRANTED"
        : "ROLE_PERMISSION_REVOKED",
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

    // Xóa toàn bộ access profile cache để các user thuộc role này nhận quyền mới ở lần /me hoặc /refresh tiếp theo.
    await this.cache.invalidateAll();

    return this.rolePermissionRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ["role", "permission"],
    });
  }

  // Gom luật bảo vệ quyền cốt lõi của ADMIN vào một nơi để updateRolePermission chỉ đọc như luồng nghiệp vụ.
  private isDisablingCriticalAdminPermission(
    roleCode: UserRole,
    dto: UpdateRolePermissionDto,
  ): boolean {
    return (
      roleCode === UserRole.ADMIN &&
      dto.scope === PermissionScope.GLOBAL &&
      !dto.enabled &&
      ADMIN_CRITICAL_PERMISSION_CODES.has(dto.permissionCode)
    );
  }

  // Resolve role từ local state; tokenRoles không được ưu tiên vì JWT cũ có thể còn hạn sau khi admin thu hồi quyền.
  private async resolveUserRoles(user: User): Promise<UserRole[]> {
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

    // normalizeBusinessRoles loại bỏ role kỹ thuật/role rác và trả về danh sách role nghiệp vụ hợp lệ của hệ thống.
    return normalizeBusinessRoles([user.role, ...assignedRoles]);
  }

  // Từ danh sách role, lấy các permission đang bật và merge nhiều scope của cùng một permission thành một grant duy nhất.
  // Ví dụ seller.order.read có thể có scope own_shop, còn admin.access dùng global; FE và gateway đều đọc cùng grant này.
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

  // Build accessProfile theo từng area để FE không hard-code route mặc định, sidebar admin/seller hoặc quyền vào khu vực.
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

  // Build một area cụ thể bằng cách kiểm tra quyền vào khu vực và lọc menu theo permission/scope của từng item.
  // Quyền access như admin.access hoặc seller.access chỉ mở khung; từng màn hình con vẫn cần permission riêng.
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
      .map(
        (item): AccessNavigationItemDto => ({
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
        }),
      );

    return {
      canAccess: hasAreaAccess,
      defaultRoute: hasAreaAccess
        ? (items[0]?.href ?? explicitDefaultRoute)
        : null,
      navigation: items,
    };
  }

  // Quyết định một navigation item có được trả cho FE hay không dựa trên permission bắt buộc và scope bắt buộc.
  // Nếu item không yêu cầu scope cụ thể thì chỉ cần có permission; nếu có scope thì grant phải chứa đúng scope đó.
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
