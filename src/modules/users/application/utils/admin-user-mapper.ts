import { User } from "../../../../database/entities/user.entity";
import { RefreshToken } from "../../../../database/entities/refresh-token.entity";
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserSession,
} from "../types/admin-user.types";

// Mapper này tạo projection công khai cho Admin UI và tuyệt đối không đưa keycloakId/token hash ra response.
export function toAdminUserListItem(user: User): AdminUserListItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function toAdminUserDetail(
  user: User,
  sessionCount: number,
): AdminUserDetail {
  return {
    ...toAdminUserListItem(user),
    updatedAt: user.updatedAt,
    sessionCount,
  };
}

export function toAdminUserSession(session: RefreshToken): AdminUserSession {
  return {
    id: session.id,
    deviceName: session.deviceName ?? "Thiết bị không rõ",
    deviceType: session.deviceType ?? "desktop",
    browser: session.browser ?? "Không rõ",
    os: session.os ?? "Không rõ",
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    issuedAt: session.issuedAt,
    lastActiveAt: session.lastActiveAt,
    expiresAt: session.expiresAt,
  };
}
