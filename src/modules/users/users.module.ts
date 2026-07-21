import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../../database/entities/user.entity";
import { UserAddress } from "../../database/entities/user-address.entity";
import { RefreshToken } from "../../database/entities/refresh-token.entity";

import { UserService } from "./services/user.service";
import { UserController } from "./controllers/user.controller";
import { AdminUserController } from "./controllers/admin-user.controller";
import { InternalUserController } from "./controllers/internal-user.controller";
import { InternalServiceGuard } from "./guards/internal-service.guard";
import { AuthModule } from "../auth/auth.module";
import { AccessControlModule } from "../access-control/access-control.module";
import { AccessRole } from "../../database/entities/access-role.entity";
import { UserRoleAssignment } from "../../database/entities/user-role-assignment.entity";
import { SellerRoleAssignmentService } from "./services/seller-role-assignment.service";
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
