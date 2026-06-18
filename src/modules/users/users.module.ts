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

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAddress, RefreshToken]),
    AuthModule, // imports KeycloakAdminService
  ],
  controllers: [UserController, AdminUserController, InternalUserController],
  providers: [UserService, InternalServiceGuard],
})
export class UsersModule {}
