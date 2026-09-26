import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@/database/entities/user.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';
import { AccessControlModule } from '@/modules/access-control/access-control.module';

import { KeycloakAdminService } from '@/modules/auth/application/services/keycloak-admin.service';
import { OtpService } from '@/modules/auth/application/services/otp.service';
import { TokenService } from '@/modules/auth/application/services/token.service';
import { AuthService } from '@/modules/auth/application/services/auth.service';
import { AuthController } from '@/modules/auth/presentation/controllers/auth.controller';
import { SellerShopClient } from '@/modules/auth/application/clients/seller-shop.client';

@Module({
    imports: [
        AccessControlModule,
        TypeOrmModule.forFeature([User, RefreshToken]),
    ],
    controllers: [AuthController],
    providers: [
        KeycloakAdminService,
        OtpService,
        TokenService,
        SellerShopClient,
        AuthService,
    ],
    exports: [KeycloakAdminService],
})
export class AuthModule {}
