import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";

import { User } from "../../../database/entities/user.entity";
import { UserAddress } from "../../../database/entities/user-address.entity";
import { RefreshToken } from "../../../database/entities/refresh-token.entity";
import { UserRole } from "@common/enums/user-role.enum";
import { UserStatus } from "@common/enums/user-status.enum";
import { KeycloakAdminService } from "../../auth/services/keycloak-admin.service";
import { UpdateProfileDto } from "../dto/update-profile.dto";
import { CreateAddressDto } from "../dto/create-address.dto";
import { UpdateAddressDto } from "../dto/update-address.dto";
import { SessionResponseDto } from "../dto/session-response.dto";

const MAX_ADDRESSES = 5;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserAddress)
    private readonly addressRepo: Repository<UserAddress>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  // ─────────────────────────────── HELPERS ──────────────────────────────────

  // x-user-id từ JWT gateway = Keycloak sub (keycloakId), KHÁC với user.id (PostgreSQL UUID).
  // Hàm này resolve keycloakId → local user.id để dùng trong các query trên bảng liên quan.
  private async resolveUserId(keycloakId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { keycloakId },
      select: ["id"],
    });
    if (!user) throw new NotFoundException("User not found");
    return user.id;
  }

  // ─────────────────────────────── PROFILE ─────────────────────────────────

  async getProfile(userId: string): Promise<User> {
    // userId = keycloakId (Keycloak sub từ JWT), query bằng keycloakId thay vì id local
    const user = await this.userRepo.findOne({ where: { keycloakId: userId } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.getProfile(userId);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    return this.userRepo.save(user);
  }

  // ─────────────────────────────── ADDRESSES ───────────────────────────────

  async listAddresses(userId: string): Promise<UserAddress[]> {
    const localId = await this.resolveUserId(userId);
    return this.addressRepo.find({
      where: { userId: localId },
      order: { isDefault: "DESC", createdAt: "ASC" },
    });
  }

  async createAddress(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<UserAddress> {
    const localId = await this.resolveUserId(userId);
    const count = await this.addressRepo.count({ where: { userId: localId } });
    // Giới hạn số lượng địa chỉ mà một người dùng có thể tạo để tránh spam và quản lý dễ dàng hơn. 
    // Nếu đã đạt giới hạn, trả về lỗi 422 Unprocessable Entity.
    if (count >= MAX_ADDRESSES) {
      throw new UnprocessableEntityException(
        `Maximum ${MAX_ADDRESSES} addresses allowed`,
      );
    }

    // Nếu địa chỉ mới được tạo có isDefault=true, 
    // thì cần đảm bảo rằng tất cả các địa chỉ khác của người dùng này sẽ có isDefault=false 
    // để duy trì tính nhất quán, tức là chỉ có một địa chỉ mặc định duy nhất cho mỗi người dùng.
    if (dto.isDefault) {
      await this.addressRepo.update(
        { userId: localId, isDefault: true },
        { isDefault: false },
      );
    }

    const address = this.addressRepo.create({ ...dto, userId: localId });
    return this.addressRepo.save(address);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<UserAddress> {
    const localId = await this.resolveUserId(userId);
    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId: localId },
    });
    if (!address) throw new NotFoundException("Address not found");

    if (dto.isDefault === true && !address.isDefault) {
      await this.addressRepo.update(
        { userId: localId, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(address, dto);
    return this.addressRepo.save(address);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const localId = await this.resolveUserId(userId);
    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId: localId },
    });
    if (!address) throw new NotFoundException("Address not found");

    await this.addressRepo.remove(address);

    // Auto-assign default to newest remaining address if deleted one was default
    if (address.isDefault) {
      const newest = await this.addressRepo.findOne({
        where: { userId: localId },
        order: { createdAt: "DESC" },
      });
      if (newest) {
        await this.addressRepo.update(newest.id, { isDefault: true });
      }
    }
  }

  // ─────────────────────────────── SESSIONS ────────────────────────────────

  // Trả về các phiên còn hoạt động của chính user hiện tại và đánh dấu phiên đang dùng bằng x-session-id.
  async getSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionResponseDto[]> {
    const localId = await this.resolveUserId(userId);
    const now = new Date();
    const tokens = await this.refreshTokenRepo.find({
      where: { userId: localId, revokedAt: IsNull() },
      order: { issuedAt: "DESC" },
    });

    return tokens
      .filter((token) => token.expiresAt > now)
      .map((token) => this.toSessionResponse(token, currentSessionId));
  }

  // Thu hồi một phiên thuộc về user hiện tại; không cho chạm vào phiên của user khác.
  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId?: string,
  ): Promise<void> {
    const localId = await this.resolveUserId(userId);
    const session = await this.refreshTokenRepo.findOne({
      where: { id: sessionId, userId: localId, revokedAt: IsNull() },
    });
    if (!session) throw new NotFoundException("Session not found");

    if (currentSessionId && session.id === currentSessionId) {
      throw new BadRequestException(
        "Cannot revoke current session. Use logout instead.",
      );
    }

    session.revokedAt = new Date();
    session.revokedReason = "USER_REVOKED";
    await this.refreshTokenRepo.save(session);
  }

  // Thu hồi tất cả phiên khác, giữ lại phiên hiện tại để người dùng không bị đăng xuất khỏi thiết bị đang dùng.
  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<number> {
    const localId = await this.resolveUserId(userId);
    const result = await this.refreshTokenRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedReason: "USER_REVOKED" })
      .where(
        "userId = :userId AND revokedAt IS NULL AND id != :currentSessionId",
        { userId: localId, currentSessionId },
      )
      .execute();
    return result.affected ?? 0;
  }

  // Chuyển bản ghi refresh token thành DTO thân thiện cho giao diện quản lý phiên.
  private toSessionResponse(
    token: RefreshToken,
    currentSessionId?: string,
  ): SessionResponseDto {
    return {
      id: token.id,
      deviceName: token.deviceName ?? "Thiết bị không rõ",
      deviceType: token.deviceType ?? "desktop",
      browser: token.browser ?? "Không rõ",
      os: token.os ?? "Không rõ",
      loginMethod: token.loginMethod ?? (token.clientId ? "google" : "password"),
      ipAddress: token.ipAddress,
      location: token.location,
      userAgent: token.userAgent,
      issuedAt: token.issuedAt,
      lastActiveAt: token.lastActiveAt,
      expiresAt: token.expiresAt,
      clientId: token.clientId,
      isCurrent: currentSessionId ? token.id === currentSessionId : false,
    };
  }

  // ─────────────────────────────── ADMIN ───────────────────────────────────

  async listUsers(
    page = 1,
    limit = 20,
  ): Promise<{ data: User[]; total: number }> {
    const [data, total] = await this.userRepo.findAndCount({
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async adminUpdateRole(
    requesterId: string,
    targetId: string,
    newRole: UserRole,
  ): Promise<User> {
    if (requesterId === targetId) {
      throw new ForbiddenException("Cannot change your own role");
    }

    const user = await this.getProfile(targetId);
    const oldRole = user.role;

    await this.keycloakAdmin.removeRealmRole(user.keycloakId, oldRole);
    await this.keycloakAdmin.assignRealmRole(user.keycloakId, newRole);

    user.role = newRole;
    const updated = await this.userRepo.save(user);

    // TODO: publish Kafka user.role-changed event

    return updated;
  }

  async adminUpdateStatus(
    requesterId: string,
    targetId: string,
    newStatus: UserStatus,
  ): Promise<User> {
    if (requesterId === targetId) {
      throw new ForbiddenException("Cannot change your own status");
    }

    const user = await this.getProfile(targetId);
    const enabled = newStatus === UserStatus.ACTIVE;

    await this.keycloakAdmin.setUserEnabled(user.keycloakId, enabled);
    user.status = newStatus;
    const updated = await this.userRepo.save(user);

    // TODO: publish Kafka user.status-changed event

    return updated;
  }
}
