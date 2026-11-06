// DTO nhận tài khoản hoàn mặc định của user; các trường đều bắt buộc để không lưu snapshot thiếu dữ liệu.

import { Transform } from 'class-transformer';
import { IsString, IsIn, Matches, MaxLength, MinLength } from 'class-validator';
import { REFUND_BANK_OPTIONS } from '@/modules/users/application/constants/refund-bank-options.constant';

// Chuẩn hóa bank code và tên chủ tài khoản trước khi chạy validation để thống nhất với Order Service.
export class UpdateRefundBankAccountDto {
    @IsString()
    @IsIn(REFUND_BANK_OPTIONS.map((bank) => bank.code), {
        message: 'Ngân hàng không nằm trong danh sách hỗ trợ.',
    })
    @Matches(/^[a-z0-9-]+$/)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    bankCode!: string;

    @IsString()
    @IsIn(REFUND_BANK_OPTIONS.map((bank) => bank.name), {
        message: 'Tên ngân hàng không nằm trong danh sách hỗ trợ.',
    })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    bankName!: string;

    @IsString()
    @MinLength(2)
    @MaxLength(100)
    @Matches(/^\p{L}[\p{L}\p{M}]*(?: \p{L}[\p{L}\p{M}]*)*$/u, {
        message:
            'Tên chủ tài khoản chỉ được gồm chữ cái có dấu và khoảng trắng.',
    })
    @Transform(({ value }) =>
        typeof value === 'string'
            ? value
                  .normalize('NFC')
                  .trim()
                  .replace(/\s+/gu, ' ')
                  .toLocaleUpperCase('vi-VN')
            : value,
    )
    accountHolder!: string;

    @IsString()
    @MinLength(6)
    @MaxLength(30)
    @Matches(/^\d{6,30}$/)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    accountNumber!: string;
}
