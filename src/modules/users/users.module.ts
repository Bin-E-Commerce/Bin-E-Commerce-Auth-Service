import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@/database/entities/user.entity';
import { UserAddress } from '@/database/entities/user-address.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';

import { UserService } from '@/modules/users/application/services/user/user.service';
import { UserController } from '@/modules/users/presentation/controllers/user.controller';
import { AdminUserController } from '@/modules/users/presentation/controllers/admin-user.controller';
import { InternalUserController } from '@/modules/users/presentation/controllers/internal-user.controller';
import { InternalServiceGuard } from '@/modules/users/presentation/guards/internal-service.guard';
import { AuthModule } from '@/modules/auth/auth.module';
import { AccessControlModule } from '@/modules/access-control/access-control.module';
import { AccessRole } from '@/database/entities/access-role.entity';
import { UserRoleAssignment } from '@/database/entities/user-role-assignment.entity';
import { UserAdminAuditLog } from '@/database/entities/user-admin-audit-log.entity';
import { SellerRoleAssignmentService } from '@/modules/users/application/services/seller/seller-role-assignment.service';
import { AdminUserService } from '@/modules/users/application/services/admin/admin-user.service';
import { SellerApplicationConsumer } from '@/kafka/consumers/seller-application.consumer';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            UserAddress,
            RefreshToken,
            AccessRole,
            UserRoleAssignment,
            UserAdminAuditLog,
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
    providers: [
        UserService,
        AdminUserService,
        InternalServiceGuard,
        SellerRoleAssignmentService,
    ],
})
export class UsersModule {}
