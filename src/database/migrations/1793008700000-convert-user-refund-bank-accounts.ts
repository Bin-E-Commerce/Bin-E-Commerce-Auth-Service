import { MigrationInterface, QueryRunner } from 'typeorm';

// Chuyển tài khoản hoàn đơn lẻ sang danh sách user sở hữu, giữ lại dữ liệu cũ và chọn nó làm mặc định.
export class ConvertUserRefundBankAccounts1793008700000 implements MigrationInterface {
    name = 'ConvertUserRefundBankAccounts1793008700000';

    // Tạo bảng mới trước, chép những hồ sơ đủ bốn trường rồi mới bỏ các cột cũ để không làm mất tài khoản đang dùng.
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user_refund_bank_accounts" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "bank_code" character varying(50) NOT NULL,
                "bank_name" character varying(100) NOT NULL,
                "account_holder" character varying(100) NOT NULL,
                "account_number" character varying(30) NOT NULL,
                "is_default" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_refund_bank_accounts" PRIMARY KEY ("id"),
                CONSTRAINT "FK_user_refund_bank_accounts_user" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_user_refund_bank_accounts_user_id"
            ON "user_refund_bank_accounts" ("user_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_user_refund_bank_accounts_default"
            ON "user_refund_bank_accounts" ("user_id")
            WHERE "is_default" = true
        `);
        await queryRunner.query(`
            INSERT INTO "user_refund_bank_accounts" (
                "user_id", "bank_code", "bank_name", "account_holder",
                "account_number", "is_default"
            )
            SELECT "id", "refund_bank_code", "refund_bank_name",
                   "refund_account_holder", "refund_account_number", true
            FROM "users"
            WHERE "refund_bank_code" IS NOT NULL
              AND "refund_bank_name" IS NOT NULL
              AND "refund_account_holder" IS NOT NULL
              AND "refund_account_number" IS NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
                DROP COLUMN "refund_account_number",
                DROP COLUMN "refund_account_holder",
                DROP COLUMN "refund_bank_name",
                DROP COLUMN "refund_bank_code"
        `);
    }

    // Khi rollback, khôi phục tài khoản duy nhất của mỗi user về cột cũ trước khi xóa bảng danh sách.
    async down(queryRunner: QueryRunner): Promise<void> {
        const duplicateOwners = (await queryRunner.query(`
            SELECT "user_id"
            FROM "user_refund_bank_accounts"
            GROUP BY "user_id"
            HAVING COUNT(*) > 1
            LIMIT 1
        `)) as Array<{ user_id: string }>;
        // Không rollback nếu thao tác này sẽ làm mất các tài khoản phụ đã được customer thêm sau migration.
        if (duplicateOwners.length > 0) {
            throw new Error(
                'Không thể rollback khi user đã có nhiều tài khoản nhận hoàn; cần giữ bảng danh sách để tránh mất dữ liệu.',
            );
        }

        await queryRunner.query(`
            ALTER TABLE "users"
                ADD COLUMN "refund_bank_code" character varying(50),
                ADD COLUMN "refund_bank_name" character varying(100),
                ADD COLUMN "refund_account_holder" character varying(100),
                ADD COLUMN "refund_account_number" character varying(30)
        `);
        await queryRunner.query(`
            UPDATE "users" AS users
            SET "refund_bank_code" = accounts."bank_code",
                "refund_bank_name" = accounts."bank_name",
                "refund_account_holder" = accounts."account_holder",
                "refund_account_number" = accounts."account_number"
            FROM "user_refund_bank_accounts" AS accounts
            WHERE accounts."user_id" = users."id"
        `);
        await queryRunner.query(`DROP TABLE "user_refund_bank_accounts"`);
    }
}
