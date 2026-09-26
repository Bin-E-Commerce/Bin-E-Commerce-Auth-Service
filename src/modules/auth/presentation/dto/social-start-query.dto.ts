import { Transform } from 'class-transformer';
import { IsEmail, IsOptional } from 'class-validator';

// Query tùy chọn cho bước bắt đầu social login.
// Email được dùng để chặn sớm tài khoản BANNED trước khi trình duyệt rời khỏi web
// sang Keycloak; không dùng query này để cấp quyền hay thay thế kiểm tra callback.
export class SocialStartQueryDto {
    @IsOptional()
    @IsEmail()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    email?: string;
}
