// Port quản lý danh sách tài khoản hoàn; mọi thao tác ghi đều giới hạn theo user sở hữu.

import type {
    RefundBankAccountInput,
    RefundBankAccountProfile,
} from '@/modules/users/application/types/user/refund-bank-account.type';

export const USER_REFUND_BANK_ACCOUNT_REPOSITORY = Symbol(
    'USER_REFUND_BANK_ACCOUNT_REPOSITORY',
);

export interface UserRefundBankAccountRepository {
    findAllForUser(userId: string): Promise<RefundBankAccountProfile[]>;
    findForUser(
        userId: string,
        accountId: string,
    ): Promise<RefundBankAccountProfile | null>;
    createForUser(
        userId: string,
        account: RefundBankAccountInput,
    ): Promise<RefundBankAccountProfile | null>;
    updateForUser(
        userId: string,
        accountId: string,
        account: RefundBankAccountInput,
    ): Promise<RefundBankAccountProfile | null>;
    deleteForUser(userId: string, accountId: string): Promise<boolean>;
    setDefaultForUser(
        userId: string,
        accountId: string,
    ): Promise<RefundBankAccountProfile | null>;
}
