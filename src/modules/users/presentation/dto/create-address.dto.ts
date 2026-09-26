import {
    IsString,
    IsBoolean,
    IsOptional,
    MaxLength,
    Matches,
} from 'class-validator';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAddressDto {
    // Label dùng để người dùng dễ dàng nhận biết địa chỉ (ví dụ: "Nhà", "Cơ quan")
    @IsString()
    @MaxLength(50)
    label: string;

    // Tên đầy đủ của người nhận hàng tại địa chỉ này
    @IsString()
    @MaxLength(100)
    fullName: string;

    // Số điện thoại liên hệ tại địa chỉ này, yêu cầu phải là số điện thoại Việt Nam hợp lệ
    @IsString()
    @Matches(/^0[3-9][0-9]{8}$/, { message: 'Invalid Vietnamese phone number' })
    phone: string;

    // Tỉnh/thành phố của địa chỉ, ví dụ: "Hà Nội", "TP. Hồ Chí Minh", v.v.
    @IsString()
    @MaxLength(100)
    province: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    ghnProvinceId: number;

    @IsString()
    @MaxLength(100)
    ghnProvinceName: string;

    // Quận/huyện của địa chỉ, ví dụ: "Quận 1", "Huyện Thanh Trì", v.v.
    @IsString()
    @MaxLength(100)
    district: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    ghnDistrictId: number;

    @IsString()
    @MaxLength(100)
    ghnDistrictName: string;

    // Phường/xã của địa chỉ, ví dụ: "Phường Bến Nghé", "Xã Tứ Hiệp", v.v.
    @IsString()
    @MaxLength(100)
    ward: string;

    @IsString()
    @MaxLength(30)
    ghnWardCode: string;

    @IsString()
    @MaxLength(100)
    ghnWardName: string;

    // Đường phố và số nhà, ví dụ: "123 Đường Lê Lợi", "Số 456, Ngõ 789", v.v.
    @IsString()
    @MaxLength(500)
    street: string;

    // Đánh dấu địa chỉ này là mặc định hay không.
    // Một người dùng có thể có nhiều địa chỉ, nhưng chỉ có một địa chỉ được đánh dấu là mặc định (isDefault = true). Điều này giúp chúng ta dễ dàng xác định địa chỉ chính của người dùng khi cần thiết, ví dụ: khi đặt hàng hoặc khi hiển thị thông tin người dùng.
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;
}
