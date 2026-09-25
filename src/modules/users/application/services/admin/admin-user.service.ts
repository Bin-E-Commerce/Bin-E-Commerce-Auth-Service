import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { User } from "../../../../../database/entities/user.entity";
import { RefreshToken } from "../../../../../database/entities/refresh-token.entity";
import { AccessRole } from "../../../../../database/entities/access-role.entity";
import { UserRoleAssignment } from "../../../../../database/entities/user-role-assignment.entity";
import { UserAdminAuditLog } from "../../../../../database/entities/user-admin-audit-log.entity";
import { UserRole } from "@common/enums/user-role.enum";
import { UserStatus } from "@common/enums/user-status.enum";
import { AccessControlCacheService } from "../../../../access-control/application/services/access-control-cache.service";
import { KeycloakAdminService } from "../../../../auth/application/services/keycloak-admin.service";
import { ListAdminUsersDto } from "../../../presentation/dto/list-admin-users.dto";
import { UpdateAdminUserRoleDto } from "../../../presentation/dto/update-admin-user-role.dto";
import { UpdateAdminUserStatusDto } from "../../../presentation/dto/update-admin-user-status.dto";
import {
  toAdminUserDetail,
  toAdminUserListItem,
  toAdminUserSession,
} from "../../utils/admin-user-mapper";

export interface AdminMutationContext {
  ipAddress: string | null;
  userAgent: string | null;
}

interface PreparedMutation {
  user: User;
  auditId: string;
  before: Record<string, unknown>;
}

// Boundary quản trị user: DB transaction giữ state nhất quán, còn Keycloak được đồng bộ sau commit và kết quả được ghi audit.
@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly sessionRepo: Repository<RefreshToken>,
    @InjectRepository(UserAdminAuditLog)
    private readonly auditRepo: Repository<UserAdminAuditLog>,
    private readonly dataSource: DataSource,
    private readonly accessCache: AccessControlCacheService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  // Authorization đọc actor trực tiếp từ DB; không dùng role header làm nguồn quyền.
  async assertAdminActor(actorId: string): Promise<void> {
    const actor = await this.userRepo.findOne({
      where: { id: actorId },
      select: ["id", "role", "status"],
    });
    if (
      !actor ||
      actor.role !== UserRole.ADMIN ||
      actor.status !== UserStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        "Chỉ ADMIN đang hoạt động được quản lý user",
      );
    }
  }

  // Lấy projection tối thiểu cho bảng Admin, áp dụng filter trước khi phân trang
  // để total và danh sách luôn nói về cùng một tập kết quả.
  async listUsers(query: ListAdminUsersDto) {
    const page = query.page;
    const limit = Math.min(query.limit, 100);
    const builder = this.userRepo.createQueryBuilder("user");
    builder.select([
      "user.id",
      "user.name",
      "user.email",
      "user.phone",
      "user.role",
      "user.status",
      "user.avatarUrl",
      "user.lastLoginAt",
      "user.createdAt",
    ]);
    if (query.search?.trim()) {
      builder.andWhere(
        "(user.name ILIKE :search OR user.email ILIKE :search OR COALESCE(user.phone, '') ILIKE :search)",
        { search: `%${query.search.trim()}%` },
      );
    }
    if (query.role) builder.andWhere("user.role = :role", { role: query.role });
    if (query.status)
      builder.andWhere("user.status = :status", { status: query.status });
    const sortColumn =
      query.sortBy === "name" ? "user.name" : `user.${query.sortBy}`;
    builder
      .orderBy(sortColumn, query.sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    // Dùng cùng bộ lọc cho danh sách và total; nếu count toàn bảng thì số trang
    // sẽ sai ngay khi admin tìm kiếm hoặc lọc theo role/status.
    const [users, total, active, banned] = await Promise.all([
      builder.getMany(),
      builder.clone().getCount(),
      this.userRepo.count({ where: { status: UserStatus.ACTIVE } }),
      this.userRepo.count({ where: { status: UserStatus.BANNED } }),
    ]);

    return {
      items: users.map(toAdminUserListItem),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      summary: { total, active, banned },
    };
  }

  // Chi tiết chỉ trả projection an toàn và đếm refresh session còn hạn,
  // không expose keycloakId, token hash hay credential nội bộ.
  async getUser(targetId: string) {
    const user = await this.requireUser(targetId);
    return toAdminUserDetail(user, await this.countActiveSessions(targetId));
  }

  // Session hết hạn không còn là session cần quản trị, vì vậy được lọc cả ở DB
  // lẫn bước mapping để số lượng hiển thị không bị phình bởi dữ liệu lịch sử.
  async getSessions(targetId: string) {
    await this.requireUser(targetId);
    const sessions = await this.sessionRepo.find({
      where: { userId: targetId, revokedAt: IsNull() },
      order: { lastActiveAt: "DESC", issuedAt: "DESC" },
    });
    const now = new Date();
    return sessions
      .filter((session) => session.expiresAt > now)
      .map(toAdminUserSession);
  }

  // Audit được giới hạn 100 bản ghi gần nhất để detail page không kéo vô hạn dữ liệu.
  async getAudit(targetId: string) {
    await this.requireUser(targetId);
    return this.auditRepo.find({
      where: { targetUserId: targetId },
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  // DB transaction hoàn tất trước; sau commit mới gọi Keycloak vì external API
  // không thể tham gia rollback SQL. Audit PENDING giúp quan sát được khoảng trống này.
  async updateRole(
    actorId: string,
    targetId: string,
    dto: UpdateAdminUserRoleDto,
    context: AdminMutationContext,
  ) {
    const prepared = await this.dataSource.transaction((manager) =>
      this.prepareRoleMutation(manager, actorId, targetId, dto, context),
    );
    if (!prepared)
      return toAdminUserDetail(
        await this.requireUser(targetId),
        await this.countActiveSessions(targetId),
      );

    await this.accessCache.invalidateUser(targetId);
    const syncStatus = await this.syncKeycloakRole(
      prepared.user,
      prepared.before.role as UserRole,
      dto.role,
    );
    await this.finishAudit(prepared.auditId, syncStatus, targetId);
    if (syncStatus === "FAILED")
      throw new ServiceUnavailableException(
        "Role đã lưu nhưng chưa đồng bộ Keycloak; hãy retry.",
      );
    return toAdminUserDetail(
      prepared.user,
      await this.countActiveSessions(targetId),
    );
  }

  // Status local được ghi cùng việc revoke refresh session. Keycloak chỉ là bước
  // mirror sau commit; Auth Service vẫn dùng local status để chặn token cũ.
  async updateStatus(
    actorId: string,
    targetId: string,
    dto: UpdateAdminUserStatusDto,
    context: AdminMutationContext,
  ) {
    const prepared = await this.dataSource.transaction((manager) =>
      this.prepareStatusMutation(manager, actorId, targetId, dto, context),
    );
    if (!prepared) {
      const unchangedUser = await this.requireUser(targetId);
      // Re-sync cả mutation không đổi dữ liệu để sửa các tài khoản BANNED cũ
      // đã từng bị set enabled=false trước khi flow OAuth được điều chỉnh.
      const syncStatus = await this.syncKeycloakStatus(unchangedUser);
      if (syncStatus === "FAILED")
        throw new ServiceUnavailableException(
          "Trạng thái đã lưu nhưng chưa đồng bộ Keycloak; hãy retry.",
        );
      return toAdminUserDetail(
        unchangedUser,
        await this.countActiveSessions(targetId),
      );
    }

    await this.accessCache.invalidateUser(targetId);
    const syncStatus = await this.syncKeycloakStatus(prepared.user);
    await this.finishAudit(prepared.auditId, syncStatus, targetId);
    if (syncStatus === "FAILED")
      throw new ServiceUnavailableException(
        "Trạng thái đã lưu nhưng chưa đồng bộ Keycloak; hãy retry.",
      );
    return toAdminUserDetail(
      prepared.user,
      await this.countActiveSessions(targetId),
    );
  }

  // Thu hồi một session và audit phải nằm trong cùng transaction để không xảy ra
  // tình trạng UI báo thành công nhưng audit không có record tương ứng.
  async revokeSession(
    actorId: string,
    targetId: string,
    sessionId: string,
    reason: string,
    context: AdminMutationContext,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const target = await this.requireUserWithManager(manager, targetId);
      this.assertTargetCanBeManaged(actorId, target);
      const sessionRepo = manager.getRepository(RefreshToken);
      const session = await sessionRepo.findOne({
        where: { id: sessionId, userId: targetId, revokedAt: IsNull() },
      });
      if (!session || session.expiresAt <= new Date())
        throw new NotFoundException("Session not found");
      session.revokedAt = new Date();
      session.revokedReason = "ADMIN_REVOKED";
      await sessionRepo.save(session);
      await manager.getRepository(UserAdminAuditLog).save({
        actorUserId: actorId,
        targetUserId: targetId,
        action: "USER_SESSION_REVOKED",
        before: { sessionId },
        after: { sessionId, revoked: true },
        reason,
        syncStatus: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { revokedCount: 1 };
    });
  }

  // Thu hồi hàng loạt chỉ tác động session còn hạn; session đã hết hạn không còn
  // khả năng cấp access token mới và không cần update lại vô ích.
  async revokeAllSessionsForAdmin(
    actorId: string,
    targetId: string,
    reason: string,
    context: AdminMutationContext,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const target = await this.requireUserWithManager(manager, targetId);
      this.assertTargetCanBeManaged(actorId, target);
      const revokedCount = await this.revokeAllSessionsWithManager(
        manager,
        targetId,
        "ADMIN_REVOKED_ALL",
      );
      await manager.getRepository(UserAdminAuditLog).save({
        actorUserId: actorId,
        targetUserId: targetId,
        action: "USER_ALL_SESSIONS_REVOKED",
        before: { activeSessions: revokedCount },
        after: { activeSessions: 0 },
        reason,
        syncStatus: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { revokedCount };
    });
  }

  // Chuẩn bị toàn bộ state role trong một transaction: khóa actor boundary,
  // cập nhật role chính, assignment và refresh session rồi mới ghi audit PENDING.
  private async prepareRoleMutation(
    manager: EntityManager,
    actorId: string,
    targetId: string,
    dto: UpdateAdminUserRoleDto,
    context: AdminMutationContext,
  ): Promise<PreparedMutation | null> {
    // Mọi mutation role đều khóa danh sách admin theo cùng một thứ tự trước khi
    // khóa target. Nhờ vậy hai admin không thể đồng thời cùng hạ admin cuối cùng
    // và cũng tránh kiểu khóa chéo target -> admin giữa các transaction.
    await this.lockActiveAdmins(manager);
    const user = await this.requireUserWithManager(manager, targetId, true);
    this.assertTargetCanBeManaged(actorId, user);
    this.assertExpectedVersion(user.updatedAt, dto.expectedUpdatedAt);
    if (user.role === dto.role) return null;
    if (
      user.role === UserRole.ADMIN &&
      user.status === UserStatus.ACTIVE &&
      dto.role !== UserRole.ADMIN
    )
      await this.assertNotLastActiveAdmin(manager);

    const role = await manager
      .getRepository(AccessRole)
      .findOne({ where: { code: dto.role, isActive: true } });
    if (!role)
      throw new NotFoundException("Role chưa được seed trong hệ thống");
    const before = { role: user.role, status: user.status };
    user.role = dto.role;
    await manager.getRepository(User).save(user);
    await this.reconcilePrimaryRole(manager, user, role.id, actorId);
    const revokedCount = await this.revokeAllSessionsWithManager(
      manager,
      targetId,
      "ADMIN_ROLE_CHANGED",
    );
    const audit = await manager.getRepository(UserAdminAuditLog).save({
      actorUserId: actorId,
      targetUserId: targetId,
      action: "USER_ROLE_CHANGED",
      before,
      after: { role: dto.role, revokedCount },
      reason: dto.reason,
      syncStatus: "PENDING",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return { user, auditId: audit.id, before };
  }

  // Status mutation dùng cùng lock boundary với role mutation để rule admin cuối
  // cùng không phụ thuộc vào thứ tự request đến từ hai tab Admin khác nhau.
  private async prepareStatusMutation(
    manager: EntityManager,
    actorId: string,
    targetId: string,
    dto: UpdateAdminUserStatusDto,
    context: AdminMutationContext,
  ): Promise<PreparedMutation | null> {
    // Status mutation cũng dùng cùng lock boundary với role mutation vì khóa
    // một admin ACTIVE có thể làm thay đổi điều kiện "admin cuối cùng".
    await this.lockActiveAdmins(manager);
    const user = await this.requireUserWithManager(manager, targetId, true);
    this.assertTargetCanBeManaged(actorId, user);
    this.assertExpectedVersion(user.updatedAt, dto.expectedUpdatedAt);
    if (user.status === dto.status) return null;
    if (
      user.role === UserRole.ADMIN &&
      user.status === UserStatus.ACTIVE &&
      dto.status !== UserStatus.ACTIVE
    )
      await this.assertNotLastActiveAdmin(manager);

    const before = { role: user.role, status: user.status };
    user.status = dto.status;
    await manager.getRepository(User).save(user);
    const revokedCount =
      dto.status === UserStatus.ACTIVE
        ? 0
        : await this.revokeAllSessionsWithManager(
            manager,
            targetId,
            `ADMIN_STATUS_${dto.status}`,
          );
    const audit = await manager.getRepository(UserAdminAuditLog).save({
      actorUserId: actorId,
      targetUserId: targetId,
      action: "USER_STATUS_CHANGED",
      before,
      after: { status: dto.status, revokedCount },
      reason: dto.reason,
      syncStatus: "PENDING",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return { user, auditId: audit.id, before };
  }

  // Chuyển audit từ PENDING sang kết quả đồng bộ Keycloak. Nếu update audit thất bại,
  // trả lỗi 503 thay vì giấu trạng thái không xác định sau một mutation đã commit.
  private async finishAudit(
    auditId: string,
    syncStatus: "SUCCESS" | "FAILED",
    targetId: string,
  ): Promise<void> {
    try {
      await this.auditRepo.update(auditId, { syncStatus });
    } catch (error) {
      this.logger.error(
        `Audit sync status update failed for ${targetId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        "Mutation đã lưu nhưng audit chưa hoàn tất; cần kiểm tra vận hành.",
      );
    }
  }

  // Tất cả target lookup đi qua helper này để controller/service không lặp cách
  // xử lý 404 và không vô tình trả entity null xuống mapper.
  private async requireUser(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  // Lock pessimistic chỉ dùng trong transaction mutation; các query đọc thông
  // thường không cần khóa và vẫn dùng repository ngoài transaction.
  private async requireUserWithManager(
    manager: EntityManager,
    id: string,
    lock = false,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  // Self-protection là invariant ở application service, không phụ thuộc frontend
  // có ẩn nút hay không.
  private assertNotSelf(actorId: string, targetId: string): void {
    if (actorId === targetId)
      throw new ForbiddenException(
        "Không thể thay đổi role hoặc trạng thái của chính mình",
      );
  }

  // Lock tất cả admin ACTIVE rồi đếm lại trong cùng transaction. Nhờ vậy hai
  // request đồng thời không thể cùng nhìn thấy một admin cuối và cùng hạ quyền.
  private async assertNotLastActiveAdmin(
    manager: EntityManager,
  ): Promise<void> {
    const admins = await manager
      .createQueryBuilder(User, "admin")
      .select(["admin.id"])
      .where("admin.role = :role AND admin.status = :status", {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      })
      .setLock("pessimistic_write")
      .getMany();
    if (admins.length <= 1)
      throw new ConflictException(
        "Không thể hạ quyền hoặc khóa admin cuối cùng đang hoạt động",
      );
  }

  // Admin có thể xem detail, session và audit của admin khác nhưng không được
  // thay đổi role/status hay thu hồi session trong MVP. Rule nằm ở service để
  // request gửi thẳng từ client cũng không thể bypass lớp bảo vệ của UI.
  private assertTargetCanBeManaged(actorId: string, target: User): void {
    this.assertNotSelf(actorId, target.id);
    if (target.role === UserRole.ADMIN)
      throw new ForbiddenException(
        "Tài khoản ADMIN được bảo vệ và chỉ được xem trong Admin Center",
      );
  }

  private async lockActiveAdmins(manager: EntityManager): Promise<void> {
    await manager
      .createQueryBuilder(User, "admin")
      .select(["admin.id"])
      .where("admin.role = :role AND admin.status = :status", {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      })
      .orderBy("admin.id", "ASC")
      .setLock("pessimistic_write")
      .getMany();
  }

  // expectedUpdatedAt là optimistic concurrency check ở boundary API; target đã
  // bị khóa trong transaction nên sau khi qua check, mutation không bị ghi đè âm thầm.
  private assertExpectedVersion(updatedAt: Date, expected?: string): void {
    if (expected && new Date(expected).getTime() !== updatedAt.getTime())
      throw new ConflictException(
        "User đã được cập nhật; hãy tải lại trước khi thao tác",
      );
  }

  // Role chính luôn có đúng một assignment active. Các assignment cũ được tắt
  // trước khi bật role mới để access profile không giữ quyền stale.
  private async reconcilePrimaryRole(
    manager: EntityManager,
    user: User,
    roleId: string,
    actorId: string,
  ): Promise<void> {
    const assignmentRepo = manager.getRepository(UserRoleAssignment);
    await assignmentRepo.update(
      { userId: user.id, isActive: true },
      { isActive: false },
    );
    const existing = await assignmentRepo.findOne({
      where: { userId: user.id, roleId },
    });
    if (existing) {
      existing.isActive = true;
      existing.assignedBy = actorId;
      await assignmentRepo.save(existing);
      return;
    }
    await assignmentRepo.save(
      assignmentRepo.create({
        userId: user.id,
        roleId,
        assignedBy: actorId,
        isActive: true,
      }),
    );
  }

  // Chỉ revoke refresh token còn hạn; access token cũ vẫn bị chặn ở Auth Service
  // bằng status/role local khi request tiếp theo cần xác minh quyền động.
  private async revokeAllSessionsWithManager(
    manager: EntityManager,
    userId: string,
    reason: string,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where("userId = :userId AND revokedAt IS NULL AND expiresAt > :now", {
        userId,
        now: new Date(),
      })
      .execute();
    return result.affected ?? 0;
  }

  // Dùng cùng điều kiện với revoke để sessionCount trên detail không lệch với
  // danh sách session mà Admin đang thấy.
  private async countActiveSessions(userId: string): Promise<number> {
    return this.sessionRepo
      .createQueryBuilder("session")
      .where(
        "session.userId = :userId AND session.revokedAt IS NULL AND session.expiresAt > :now",
        { userId, now: new Date() },
      )
      .getCount();
  }

  // Keycloak sync là best-effort mirror sau commit. Local DB vẫn là nguồn quyền;
  // FAILED chỉ báo caller retry và được ghi lại trong audit.
  private async syncKeycloakRole(
    user: User,
    oldRole: UserRole,
    newRole: UserRole,
  ): Promise<"SUCCESS" | "FAILED"> {
    try {
      await this.keycloakAdmin.removeRealmRole(user.keycloakId, oldRole);
      await this.keycloakAdmin.assignRealmRole(user.keycloakId, newRole);
      return "SUCCESS";
    } catch (error) {
      this.logger.error(
        `Keycloak role sync failed for ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "FAILED";
    }
  }

  // Ghi status nghiệp vụ vào Keycloak nhưng không disable identity, vì Google broker
  // cần hoàn tất callback để web hiển thị lỗi BANNED theo UX của ứng dụng.
  private async syncKeycloakStatus(user: User): Promise<"SUCCESS" | "FAILED"> {
    try {
      await this.keycloakAdmin.syncUserStatus(user.keycloakId, user.status);
      return "SUCCESS";
    } catch (error) {
      this.logger.error(
        `Keycloak status sync failed for ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "FAILED";
    }
  }
}
