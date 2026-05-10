import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not } from "typeorm";

import { User } from "../../../database/entities/user.entity";
import { UserAddress } from "../../../database/entities/user-address.entity";
import { UserRole } from "@common/enums/user-role.enum";
import { UserStatus } from "@common/enums/user-status.enum";
import { KeycloakAdminService } from "../../auth/services/keycloak-admin.service";
import { UpdateProfileDto } from "../dto/update-profile.dto";
import { CreateAddressDto } from "../dto/create-address.dto";
import { UpdateAddressDto } from "../dto/update-address.dto";

const MAX_ADDRESSES = 5;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserAddress)
    private readonly addressRepo: Repository<UserAddress>,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  // ─────────────────────────────── PROFILE ─────────────────────────────────

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
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
    return this.addressRepo.find({
      where: { userId },
      order: { isDefault: "DESC", createdAt: "ASC" },
    });
  }

  async createAddress(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<UserAddress> {
    const count = await this.addressRepo.count({ where: { userId } });
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
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const address = this.addressRepo.create({ ...dto, userId });
    return this.addressRepo.save(address);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId },
    });
    if (!address) throw new NotFoundException("Address not found");

    if (dto.isDefault === true && !address.isDefault) {
      await this.addressRepo.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(address, dto);
    return this.addressRepo.save(address);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId },
    });
    if (!address) throw new NotFoundException("Address not found");

    await this.addressRepo.remove(address);

    // Auto-assign default to newest remaining address if deleted one was default
    if (address.isDefault) {
      const newest = await this.addressRepo.findOne({
        where: { userId },
        order: { createdAt: "DESC" },
      });
      if (newest) {
        await this.addressRepo.update(newest.id, { isDefault: true });
      }
    }
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
