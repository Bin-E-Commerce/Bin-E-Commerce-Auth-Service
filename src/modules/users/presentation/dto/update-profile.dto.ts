// DTO cập nhật hồ sơ cơ bản; email và avatar có luồng quản lý riêng nên không nhận từ payload này.
import {
    IsString,
    IsOptional,
    MinLength,
    MaxLength,
    Matches,
} from 'class-validator';

// Chỉ cho phép cập nhật tên và điện thoại với giới hạn đồng bộ cùng bảng users.
export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @Matches(/^0[3-9][0-9]{8}$/, { message: 'Invalid Vietnamese phone number' })
    // null biểu thị người dùng chủ động xóa số đã lưu; undefined giữ nguyên giá trị hiện tại.
    phone?: string | null;
}
