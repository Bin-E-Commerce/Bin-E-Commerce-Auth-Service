// Adapter chỉ trả số user đăng ký theo ngày, loại staff khỏi chỉ số tăng trưởng người dùng nền tảng.
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
    AdminUserActivityDailyCount,
    AdminUserActivityRepositoryPort,
} from '@/modules/users/application/contracts/admin-user-activity.repository';

@Injectable()
export class AdminUserActivityRepository implements AdminUserActivityRepositoryPort {
    constructor(private readonly dataSource: DataSource) {}

    // Nhóm/định dạng theo cùng ngày giờ Việt Nam; lọc cột timestamp trực tiếp để DB tận dụng index created_at.
    async getNewUsersDaily(
        from: string,
        to: string,
    ): Promise<AdminUserActivityDailyCount[]> {
        return this.dataSource.query(
            `
                SELECT
                    TO_CHAR((registered_user.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS day,
                    COUNT(*)::int AS count
                FROM users AS registered_user
                WHERE registered_user.role IN ('CUSTOMER', 'SELLER')
                  AND registered_user.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
                  AND registered_user.created_at < ($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
                GROUP BY (registered_user.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                ORDER BY day ASC
            `,
            [from, to],
        );
    }
}
