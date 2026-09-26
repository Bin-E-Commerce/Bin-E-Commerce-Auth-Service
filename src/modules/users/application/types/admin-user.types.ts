import { UserRole } from '@common/enums/user-role.enum';
import { UserStatus } from '@common/enums/user-status.enum';

export interface AdminUserListItem {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: UserRole;
    status: UserStatus;
    avatarUrl: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
}

export interface AdminUserDetail extends AdminUserListItem {
    updatedAt: Date;
    sessionCount: number;
}

export interface AdminUserSession {
    id: string;
    deviceName: string;
    deviceType: string;
    browser: string;
    os: string;
    ipAddress: string | null;
    userAgent: string | null;
    issuedAt: Date;
    lastActiveAt: Date | null;
    expiresAt: Date;
}
