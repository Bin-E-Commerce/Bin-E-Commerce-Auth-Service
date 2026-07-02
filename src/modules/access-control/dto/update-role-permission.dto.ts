import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { Permission, PermissionScope } from "@common/auth";

export class UpdateRolePermissionDto {
  @IsEnum(Permission)
  permissionCode: Permission;

  @IsEnum(PermissionScope)
  scope: PermissionScope;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
