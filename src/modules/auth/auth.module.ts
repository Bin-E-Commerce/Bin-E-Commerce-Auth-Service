import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../../database/entities/user.entity";
import { RefreshToken } from "../../database/entities/refresh-token.entity";
import { AccessControlModule } from "../access-control/access-control.module";

import { KeycloakAdminService } from "./application/services/keycloak-admin.service";
import { OtpService } from "./application/services/otp.service";
import { TokenService } from "./application/services/token.service";
import { AuthService } from "./application/services/auth.service";
import { AuthController } from "./presentation/controllers/auth.controller";

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([User, RefreshToken])],
  controllers: [AuthController],
  providers: [KeycloakAdminService, OtpService, TokenService, AuthService],
  exports: [KeycloakAdminService],
})
export class AuthModule {}
