// Bổ sung mã GHN vào địa chỉ Customer để checkout dùng cùng master data với Seller.

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGhnAddressCodes1788009000000 implements MigrationInterface {
    name = 'AddGhnAddressCodes1788009000000';

    // Thêm nullable cho dữ liệu cũ; DTO mới bắt buộc mã đầy đủ cho mọi địa chỉ tạo hoặc cập nhật.
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "user_addresses"
      ADD COLUMN IF NOT EXISTS "ghn_province_id" integer NULL,
      ADD COLUMN IF NOT EXISTS "ghn_province_name" varchar(100) NULL,
      ADD COLUMN IF NOT EXISTS "ghn_district_id" integer NULL,
      ADD COLUMN IF NOT EXISTS "ghn_district_name" varchar(100) NULL,
      ADD COLUMN IF NOT EXISTS "ghn_ward_code" varchar(30) NULL,
      ADD COLUMN IF NOT EXISTS "ghn_ward_name" varchar(100) NULL
    `);
    }

    // Rollback chỉ xóa metadata mã GHN mới thêm.
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "user_addresses"
      DROP COLUMN IF EXISTS "ghn_province_id",
      DROP COLUMN IF EXISTS "ghn_province_name",
      DROP COLUMN IF EXISTS "ghn_district_id",
      DROP COLUMN IF EXISTS "ghn_district_name",
      DROP COLUMN IF EXISTS "ghn_ward_code",
      DROP COLUMN IF EXISTS "ghn_ward_name"
    `);
    }
}
