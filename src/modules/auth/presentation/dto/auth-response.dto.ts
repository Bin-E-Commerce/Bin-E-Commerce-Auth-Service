import { User } from '@/database/entities/user.entity';
import type {
    AccessProfileDto,
    PermissionGrantDto,
} from '@/modules/access-control/application/types/access-profile.type';

export interface AuthUserResponse extends Pick<
    User,
    | 'id'
    | 'email'
    | 'name'
    | 'phone'
    | 'role'
    | 'status'
    | 'avatarUrl'
    | 'createdAt'
> {
    shopLogoUrl: string | null;
    roles: string[];
    permissions: string[];
    permissionGrants: PermissionGrantDto[];
    accessProfile: AccessProfileDto;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    sessionId: string;
    user: AuthUserResponse;
}
