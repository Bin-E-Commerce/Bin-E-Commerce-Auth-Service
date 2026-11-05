// Migration thêm một tài khoản nhận hoàn mặc định vào hồ sơ user; dữ liệu cũ để null và có thể rollback an toàn.

import { MigrationInterface, QueryRunner } from 'typeorm';

// Thêm bốn cột nullable để hồ sơ hiện tại tiếp tục hoạt động trước khi user lưu tài khoản hoàn đầu tiên.
export class AddUserRefundBankAccount1793008600000 implements MigrationInterface {
    name = 'AddUserRefundBankAccount1793008600000';

    // Thêm trường nhận hoàn mà không cập nhật hay suy đoán dữ liệu người dùng cũ.
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD "refund_bank_code" character varying(50)`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "refund_bank_name" character varying(100)`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "refund_account_holder" character varying(100)`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "refund_account_number" character varying(30)`,
        );
    }

    // Xóa đúng các cột do migration này tạo nếu cần rollback.
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "refund_account_number"`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "refund_account_holder"`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "refund_bank_name"`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "refund_bank_code"`,
        );
    }
}
