import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserAdminAuditLogs1788009100000 implements MigrationInterface {
  name = "AddUserAdminAuditLogs1788009100000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_user_id" uuid,
        "target_user_id" uuid NOT NULL,
        "action" varchar(80) NOT NULL,
        "before" jsonb,
        "after" jsonb,
        "reason" text,
        "sync_status" varchar(20) NOT NULL DEFAULT 'SUCCESS',
        "ip_address" varchar(45),
        "user_agent" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_admin_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_admin_audit_target_created"
      ON "user_admin_audit_logs" ("target_user_id", "created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_admin_audit_target_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_admin_audit_logs"`);
  }
}
