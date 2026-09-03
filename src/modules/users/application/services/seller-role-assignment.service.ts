import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { UserRole } from "@common/enums/user-role.enum";
import { Repository } from "typeorm";
import { AccessRole } from "../../../../database/entities/access-role.entity";
import { UserRoleAssignment } from "../../../../database/entities/user-role-assignment.entity";
import { User } from "../../../../database/entities/user.entity";
import { AccessControlCacheService } from "../../../access-control/application/services/access-control-cache.service";
import { KeycloakAdminService } from "../../../auth/application/services/keycloak-admin.service";

@Injectable()
export class SellerRoleAssignmentService {
  private readonly logger = new Logger(SellerRoleAssignmentService.name);

  // Gom toàn bộ thao tác cấp role SELLER vào một provider để Kafka consumer chỉ chịu trách nhiệm nhận và chuyển event.
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AccessRole)
    private readonly roleRepository: Repository<AccessRole>,
    @InjectRepository(UserRoleAssignment)
    private readonly assignmentRepository: Repository<UserRoleAssignment>,
    private readonly accessCache: AccessControlCacheService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  // Cấp role SELLER theo Keycloak user id; upsert giúp event Kafka phát lại không tạo assignment trùng.
  async grantApprovedSellerRole(keycloakUserId: string): Promise<void> {
    const [user, sellerRole] = await Promise.all([
      this.userRepository.findOne({ where: { keycloakId: keycloakUserId } }),
      this.roleRepository.findOne({ where: { code: UserRole.SELLER } }),
    ]);

    if (!user) {
      throw new NotFoundException(
        `Không tìm thấy user tương ứng Keycloak ID ${keycloakUserId}.`,
      );
    }

    if (!sellerRole) {
      throw new NotFoundException(
        "Role SELLER chưa được seed trong hệ thống phân quyền.",
      );
    }

    // Unique key user_id + role_id biến thao tác này thành idempotent và đồng thời kích hoạt lại assignment cũ nếu từng bị tắt.
    await this.assignmentRepository.upsert(
      {
        userId: user.id,
        roleId: sellerRole.id,
        assignedBy: null,
        expiresAt: null,
        isActive: true,
      },
      {
        conflictPaths: ["userId", "roleId"],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    // Xóa cache sau khi DB đã có role mới để lần /me hoặc /refresh kế tiếp trả permission Seller Center ngay.
    await this.accessCache.invalidateUser(user.id);

    // Keycloak được mirror để token đăng nhập mới cũng mang role SELLER; DB assignment vẫn là nguồn quyền động của hệ thống.
    try {
      await this.keycloakAdmin.assignRealmRole(
        user.keycloakId,
        UserRole.SELLER,
      );
    } catch (error) {
      this.logger.warn(
        `Đã cấp role SELLER trong DB nhưng chưa đồng bộ được Keycloak cho user ${user.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
