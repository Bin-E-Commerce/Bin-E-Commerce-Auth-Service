// DTO khóa hợp đồng đăng ký trước khi cấp OTP: chuẩn hóa email/tên và từ chối dữ liệu ngoài quy tắc.
import { Transform } from 'class-transformer';
import {
    IsNotEmpty,
    IsEmail,
    IsString,
    IsOptional,
    MinLength,
    MaxLength,
    Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterInitiateDto {
    @ApiProperty({ example: 'user@example.com', description: 'Email address' })
    // Chuẩn hóa email trước khi kiểm tra/tìm tài khoản; kiểu sai được giữ lại để IsString từ chối.
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsString()
    @IsNotEmpty()
    @IsEmail({}, { message: 'Email không hợp lệ' })
    @MaxLength(254)
    email: string;

    @ApiProperty({
        example: 'Password1',
        description: '8–100 ký tự, có ít nhất một chữ in hoa và một chữ số',
        minLength: 8,
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    @MaxLength(100)
    @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
        message: 'Mật khẩu cần có ít nhất 1 chữ in hoa và 1 chữ số',
    })
    password: string;

    @ApiProperty({
        example: 'Nguyễn Văn A',
        description:
            'Họ tên gồm chữ cái Unicode, khoảng trắng, dấu nháy hoặc gạch nối',
        minLength: 2,
        maxLength: 100,
    })
    // Cắt khoảng trắng ngoài tên để FE và BE cùng so khớp tên đã chuẩn hóa.
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(100)
    @Matches(/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u, {
        message: 'Họ tên chỉ gồm chữ cái, khoảng trắng, dấu nháy hoặc gạch nối',
    })
    name: string;

    @ApiPropertyOptional({
        example: '0912345678',
        description: 'Vietnamese phone number (0[3-9]xxxxxxxx)',
    })
    @IsOptional()
    @IsString()
    @Matches(/^0[3-9][0-9]{8}$/, { message: 'Invalid Vietnamese phone number' })
    phone?: string;
}
