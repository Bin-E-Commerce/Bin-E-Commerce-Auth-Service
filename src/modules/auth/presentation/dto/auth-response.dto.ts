import { User } from "../../../../database/entities/user.entity";
import type { AccessProfileDto, PermissionGrantDto } from "../../../access-control/application/types/access-profile.type";

export interface AuthUserResponse
  extends Pick<
    User,
    "id" | "email" | "name" | "phone" | "role" | "status" | "avatarUrl" | "createdAt"
  > {
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
