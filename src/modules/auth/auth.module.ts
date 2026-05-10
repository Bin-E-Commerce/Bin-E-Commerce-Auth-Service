import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../../database/entities/user.entity";
import { RefreshToken } from "../../database/entities/refresh-token.entity";

import { KeycloakAdminService } from "./services/keycloak-admin.service";
import { OtpService } from "./services/otp.service";
import { TokenService } from "./services/token.service";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken])],
  controllers: [AuthController],
  providers: [KeycloakAdminService, OtpService, TokenService, AuthService],
  exports: [KeycloakAdminService],
})
export class AuthModule {}
