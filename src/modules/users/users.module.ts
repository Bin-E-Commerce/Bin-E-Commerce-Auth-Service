import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../../database/entities/user.entity";
import { UserAddress } from "../../database/entities/user-address.entity";
import { RefreshToken } from "../../database/entities/refresh-token.entity";

import { UserService } from "./application/services/user.service";
import { UserController } from "./presentation/controllers/user.controller";
import { AdminUserController } from "./presentation/controllers/admin-user.controller";
import { InternalUserController } from "./presentation/controllers/internal-user.controller";
import { InternalServiceGuard } from "./presentation/guards/internal-service.guard";
import { AuthModule } from "../auth/auth.module";
import { AccessControlModule } from "../access-control/access-control.module";
import { AccessRole } from "../../database/entities/access-role.entity";
import { UserRoleAssignment } from "../../database/entities/user-role-assignment.entity";
import { SellerRoleAssignmentService } from "./application/services/seller-role-assignment.service";
import { SellerApplicationConsumer } from "../../kafka/consumers/seller-application.consumer";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserAddress,
      RefreshToken,
      AccessRole,
      UserRoleAssignment,
    ]),
    AuthModule, // imports KeycloakAdminService
    AccessControlModule,
  ],
  controllers: [
    UserController,
    AdminUserController,
    InternalUserController,
    SellerApplicationConsumer,
  ],
  providers: [UserService, InternalServiceGuard, SellerRoleAssignmentService],
})
export class UsersModule {}
