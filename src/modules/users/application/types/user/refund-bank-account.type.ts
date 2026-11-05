// Kiểu hồ sơ tài khoản nhận hoàn được dùng giữa use case User và adapter persistence.

export interface RefundBankAccountProfile {
    bankCode: string;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
}
