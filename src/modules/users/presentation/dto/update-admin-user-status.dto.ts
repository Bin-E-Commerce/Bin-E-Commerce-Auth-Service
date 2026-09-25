import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { UserStatus } from "@common/enums/user-status.enum";

export class UpdateAdminUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
