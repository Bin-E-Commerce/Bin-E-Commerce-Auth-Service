import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SellerShopLogoResponse {
    logoUrl: string | null;
}

@Injectable()
export class SellerShopClient {
    private readonly logger = new Logger(SellerShopClient.name);
    private readonly sellerServiceUrl: string;
    private readonly internalServiceToken: string;

    // Đọc cấu hình một lần để login và refresh dùng cùng một contract nội bộ.
    constructor(config: ConfigService) {
        this.sellerServiceUrl = config.get<string>(
            'SELLER_SERVICE_URL',
            'http://localhost:3007',
        );
        this.internalServiceToken = config.get<string>(
            'INTERNAL_SERVICE_TOKEN',
            '',
        );
    }

    // Logo shop chỉ là dữ liệu hiển thị nên lỗi Seller Service không được làm hỏng phiên đăng nhập.
    async getShopLogoUrl(ownerUserId: string): Promise<string | null> {
        const response = await fetch(
            `${this.sellerServiceUrl}/api/v1/internal/seller/users/${ownerUserId}/shop-logo`,
            {
                headers: {
                    accept: 'application/json',
                    'x-internal-service-token': this.internalServiceToken,
                },
                signal: AbortSignal.timeout(2_000),
            },
        ).catch((error: unknown) => {
            this.logger.debug(
                `Không đọc được logo shop của user ${ownerUserId}: ${String(error)}`,
            );
            return null;
        });

        if (!response?.ok) return null;

        const payload = (await response.json()) as SellerShopLogoResponse;
        return typeof payload.logoUrl === 'string' && payload.logoUrl.trim()
            ? payload.logoUrl
            : null;
    }
}
