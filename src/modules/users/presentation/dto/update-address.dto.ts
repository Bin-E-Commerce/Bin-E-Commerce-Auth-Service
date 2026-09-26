import {
    IsString,
    IsBoolean,
    IsOptional,
    MaxLength,
    Matches,
} from 'class-validator';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAddressDto {
    @IsOptional()
    @IsString()
    @MaxLength(50)
    label?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    fullName?: string;

    @IsOptional()
    @IsString()
    @Matches(/^0[3-9][0-9]{8}$/, { message: 'Invalid Vietnamese phone number' })
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    province?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    ghnProvinceId?: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    ghnProvinceName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    district?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    ghnDistrictId?: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    ghnDistrictName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    ward?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    ghnWardCode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    ghnWardName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    street?: string;

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;
}
