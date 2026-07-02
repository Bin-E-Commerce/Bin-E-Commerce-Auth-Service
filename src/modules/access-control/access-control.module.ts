import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccessPermission } from "../../database/entities/access-permission.entity";
import { AccessRole } from "../../database/entities/access-role.entity";
import { NavigationItem } from "../../database/entities/navigation-item.entity";
import { PermissionAuditLog } from "../../database/entities/permission-audit-log.entity";
import { RolePermission } from "../../database/entities/role-permission.entity";
import { UserRoleAssignment } from "../../database/entities/user-role-assignment.entity";
import { RedisModule } from "../../database/redis/redis.module";
import { AccessControlController } from "./controllers/access-control.controller";
import { AccessControlCacheService } from "./services/access-control-cache.service";
import { AccessControlSeedService } from "./services/access-control-seed.service";
import { AccessControlService } from "./services/access-control.service";

@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forFeature([
      AccessRole,
      AccessPermission,
      RolePermission,
      UserRoleAssignment,
      NavigationItem,
      PermissionAuditLog,
    ]),
  ],
  controllers: [AccessControlController],
  providers: [
    AccessControlCacheService,
    AccessControlSeedService,
    AccessControlService,
  ],
  exports: [AccessControlService, AccessControlCacheService],
})
export class AccessControlModule {}
