// DTO kiểm tra email và OTP ở bước hoàn tất đăng ký; OTP chỉ được phép gồm sáu chữ số.
import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    Length,
    Matches,
    MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterVerifyDto {
    @ApiProperty({
        example: 'user@example.com',
        description: 'Email used during registration',
    })
    // Chuẩn hóa cùng quy tắc với bước xin OTP để email vẫn khớp khi người dùng viết hoa/thừa khoảng trắng.
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsString()
    @IsNotEmpty()
    @IsEmail()
    @MaxLength(254)
    identifier: string;

    @ApiProperty({
        example: '123456',
        description: '6-digit OTP sent to email',
        minLength: 6,
        maxLength: 6,
    })
    @IsString()
    @Length(6, 6)
    @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ gồm sáu chữ số' })
    otp: string;
}
