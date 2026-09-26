import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { UserRole } from '@common/enums/user-role.enum';

export class UpdateAdminUserRoleDto {
    @IsEnum(UserRole)
    role: UserRole;

    @IsString()
    @MinLength(3)
    @MaxLength(500)
    reason: string;

    @IsOptional()
    @IsDateString()
    expectedUpdatedAt?: string;
}
