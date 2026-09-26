import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
    SellerApplicationReviewedEvent,
    SellerEvents,
} from '@common/kafka/events';
import { SellerRoleAssignmentService } from '@/modules/users/application/services/seller/seller-role-assignment.service';

@Controller()
export class SellerApplicationConsumer {
    private readonly logger = new Logger(SellerApplicationConsumer.name);

    // Consumer chỉ điều phối event sang use case cấp role, không chứa truy vấn DB hoặc luật phân quyền riêng.
    constructor(
        private readonly sellerRoleAssignment: SellerRoleAssignmentService,
    ) {}

    // Nhận fact hồ sơ được duyệt và cấp quyền Seller Center cho đúng user được ghi trong application.
    @EventPattern(SellerEvents.APPLICATION_APPROVED)
    async handleApplicationApproved(
        @Payload() event: SellerApplicationReviewedEvent,
    ): Promise<void> {
        this.logger.log(
            `Processing approved seller application event ${event.eventId}`,
        );

        await this.sellerRoleAssignment.grantApprovedSellerRole(
            event.data.userId,
        );
    }
}
