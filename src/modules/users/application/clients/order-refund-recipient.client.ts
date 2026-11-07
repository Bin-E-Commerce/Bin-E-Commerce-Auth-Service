// Client nội bộ đồng bộ tài khoản nhận hoàn sang các payment attempt đang chờ trong Order Service.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RefundBankAccountSyncInput } from '@/modules/users/application/types/user/refund-bank-account.type';

// Gửi snapshot tối thiểu qua mạng nội bộ; không log hoặc phát tán thông tin ngân hàng sang event công khai.
@Injectable()
export class OrderRefundRecipientClient {
    private readonly targetBase: string;
    private readonly internalToken: string;

    // URL được cấu hình theo môi trường; secret chỉ gửi qua header giữa hai service.
    constructor(private readonly config: ConfigService) {
        this.targetBase = config.get<string>(
            'ORDER_SERVICE_URL',
            'http://localhost:3011',
        );
        this.internalToken = config.get<string>('INTERNAL_SERVICE_TOKEN', '');
    }

    // Đồng bộ trước khi commit sửa profile để lỗi downstream không làm profile và refund lệch nhau.
    async syncPendingRefundRecipient(
        input: RefundBankAccountSyncInput,
    ): Promise<void> {
        let lastError: unknown;
        const url = `${this.targetBase}/api/v1/internal/orders/refund-bank-accounts/${input.accountId}/sync`;

        // Thử lại một lần cho lỗi mạng/5xx; lỗi contract 4xx được trả ngay để không che dữ liệu sai.
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await fetch(url, {
                    method: 'PUT',
                    signal: AbortSignal.timeout(5000),
                    headers: {
                        accept: 'application/json',
                        'content-type': 'application/json',
                        'x-user-id': input.userId,
                        'x-internal-service-token': this.internalToken,
                    },
                    body: JSON.stringify({
                        previousAccount: {
                            bankCode: input.previousAccount.bankCode,
                            bankName: input.previousAccount.bankName,
                            accountHolder: input.previousAccount.accountHolder,
                            accountNumber: input.previousAccount.accountNumber,
                        },
                        account: {
                            bankCode: input.account.bankCode,
                            bankName: input.account.bankName,
                            accountHolder: input.account.accountHolder,
                            accountNumber: input.account.accountNumber,
                        },
                        allowSingleAccountLegacySync:
                            input.allowSingleAccountLegacySync,
                    }),
                });
                if (response.ok) return;
                lastError = new Error(
                    `Order Service returned ${response.status}`,
                );
                // Contract/permission errors không thể được sửa bằng retry; lỗi server được thử lại một lần.
                if (response.status < 500) break;
            } catch (error) {
                lastError = error;
            }
        }

        // Không đưa số tài khoản vào lỗi/log; caller sẽ giữ nguyên profile nếu đồng bộ không thành công.
        throw new ServiceUnavailableException(
            `Không thể đồng bộ tài khoản nhận hoàn sang Order Service: ${String(lastError)}`,
        );
    }
}
