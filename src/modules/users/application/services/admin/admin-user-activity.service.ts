// Use case chỉ trả tổng user công khai theo ngày; không đọc hồ sơ cá nhân hay dữ liệu đăng nhập.
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
    ADMIN_USER_ACTIVITY_REPOSITORY,
    type AdminUserActivityRepositoryPort,
} from '@/modules/users/application/contracts/admin-user-activity.repository';

@Injectable()
export class AdminUserActivityService {
    constructor(
        @Inject(ADMIN_USER_ACTIVITY_REPOSITORY)
        private readonly repository: AdminUserActivityRepositoryPort,
    ) {}

    // Giới hạn báo cáo ở 31 ngày để endpoint dashboard không bị dùng cho truy vấn lịch sử toàn bảng.
    async getNewUsersDaily(from: string, to: string) {
        // Parse ngày thuần theo UTC chỉ để tính độ dài; timezone hiển thị dữ liệu được áp dụng ở repository.
        const fromDay = Date.parse(`${from}T00:00:00.000Z`);
        const toDay = Date.parse(`${to}T00:00:00.000Z`);
        const dayCount = (toDay - fromDay) / 86_400_000;

        // Chặn ngày đảo thứ tự, dữ liệu không hợp lệ và cửa sổ quá rộng trước khi gọi truy vấn tổng hợp.
        if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 31) {
            throw new BadRequestException(
                'Khoảng thống kê phải từ 1 đến 31 ngày.',
            );
        }

        return {
            from,
            to,
            daily: await this.repository.getNewUsersDaily(from, to),
        };
    }
}
