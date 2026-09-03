import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../../../database/redis/redis.module";
import type { ViewerAccessDto } from "../types/access-profile.type";

const ACCESS_PROFILE_TTL_SECONDS = 10 * 60; // 10 phút là TTL hợp lý cho cache quyền của user, vì quyền của user không thay đổi quá thường xuyên.

@Injectable()
export class AccessControlCacheService {
  private readonly logger = new Logger(AccessControlCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Tạo Redis key có kèm permissionVersion để khi deploy bộ quyền mới thì cache cũ tự hết hiệu lực.
  private key(userId: string, permissionVersion: string): string {
    return `access-profile:${userId}:${permissionVersion}`;
  }

  // Đọc access profile từ Redis; nếu Redis lỗi thì trả null để request vẫn chạy bằng DB thay vì làm hỏng login.
  async get(
    userId: string,
    permissionVersion: string,
  ): Promise<ViewerAccessDto | null> {
    try {
      const raw = await this.redis.get(this.key(userId, permissionVersion));
      return raw ? (JSON.parse(raw) as ViewerAccessDto) : null;
    } catch (error) {
      this.logger.warn(
        `Access profile cache read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // Ghi access profile vào Redis để /me và /refresh không phải join nhiều bảng quyền ở mỗi request.
  async set(
    userId: string,
    permissionVersion: string,
    value: ViewerAccessDto,
  ): Promise<void> {
    try {
      await this.redis.set(
        this.key(userId, permissionVersion),
        JSON.stringify(value),
        "EX",
        ACCESS_PROFILE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Access profile cache write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Xóa mọi access profile cache của một user khi admin đổi role/permission trực tiếp cho user đó.
  async invalidateUser(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`access-profile:${userId}:*`);
      if (keys.length > 0) await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(
        `Access profile cache invalidation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Xóa toàn bộ access profile cache khi admin đổi permission của một role.
  // Một role có thể áp dụng cho nhiều user nên cách an toàn nhất là buộc mọi session build lại quyền ở lần /me hoặc /refresh kế tiếp.
  async invalidateAll(): Promise<void> {
    try {
      const keys = await this.redis.keys("access-profile:*");
      if (keys.length > 0) await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(
        `Access profile cache global invalidation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
