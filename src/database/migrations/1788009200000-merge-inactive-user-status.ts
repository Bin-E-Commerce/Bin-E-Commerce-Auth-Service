import { MigrationInterface, QueryRunner } from 'typeorm';

// Chuẩn hóa dữ liệu cũ trước khi UserStatus chỉ còn ACTIVE và BANNED.
// INACTIVE được nhập vào BANNED vì cả hai trạng thái đều đã chặn đăng nhập;
// migration này chỉ xử lý dữ liệu tồn tại, không tạo thêm trạng thái mới.
export class MergeInactiveUserStatus1788009200000 implements MigrationInterface {
    name = 'MergeInactiveUserStatus1788009200000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "users" SET "status" = 'BANNED' WHERE "status" = 'INACTIVE'`,
        );
    }

    async down(): Promise<void> {
        // Không thể tự động khôi phục INACTIVE vì sau khi gộp đã mất lý do phân biệt cũ.
    }
}
