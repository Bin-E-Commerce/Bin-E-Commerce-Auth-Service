// Kiểu tài khoản ngân hàng nhận hoàn giữa use case User và adapter persistence.

export interface RefundBankAccountInput {
    bankCode: string;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
}

export interface RefundBankAccountProfile extends RefundBankAccountInput {
    id: string;
    isDefault: boolean;
}
