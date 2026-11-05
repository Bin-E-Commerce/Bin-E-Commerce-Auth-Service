// Port lưu một tài khoản nhận hoàn mặc định; dữ liệu nhạy cảm chỉ đi qua thao tác đọc/ghi chuyên biệt.

import type { RefundBankAccountProfile } from '@/modules/users/application/types/user/refund-bank-account.type';

export const USER_REFUND_BANK_ACCOUNT_REPOSITORY = Symbol(
    'USER_REFUND_BANK_ACCOUNT_REPOSITORY',
);

export interface UserRefundBankAccountRepository {
    findByUserId(userId: string): Promise<RefundBankAccountProfile | null>;
    saveForUser(
        userId: string,
        account: RefundBankAccountProfile,
    ): Promise<RefundBankAccountProfile | null>;
}
