// Adapter đọc/ghi tài khoản nhận hoàn trong hồ sơ User, tách query TypeORM khỏi application service.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '@/database/entities/user.entity';
import type { UserRefundBankAccountRepository } from '@/modules/users/application/contracts/user-refund-bank-account.repository';
import type { RefundBankAccountProfile } from '@/modules/users/application/types/user/refund-bank-account.type';

// Chỉ truy vấn bốn cột nhạy cảm qua addSelect; các truy vấn User thông thường vẫn bị select:false bảo vệ.
@Injectable()
export class UserRefundBankAccountRepositoryAdapter implements UserRefundBankAccountRepository {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    // Trả null khi user chưa lưu đủ tài khoản, để giao diện mở form trống thay vì hiện dữ liệu một phần.
    async findByUserId(
        userId: string,
    ): Promise<RefundBankAccountProfile | null> {
        const user = await this.userRepository
            .createQueryBuilder('user')
            .select('user.id')
            .addSelect([
                'user.refundBankCode',
                'user.refundBankName',
                'user.refundAccountHolder',
                'user.refundAccountNumber',
            ])
            .where('user.id = :userId', { userId })
            .getOne();

        if (
            !user?.refundBankCode ||
            !user.refundBankName ||
            !user.refundAccountHolder ||
            !user.refundAccountNumber
        ) {
            return null;
        }

        return {
            bankCode: user.refundBankCode,
            bankName: user.refundBankName,
            accountHolder: user.refundAccountHolder,
            accountNumber: user.refundAccountNumber,
        };
    }

    // Cập nhật đúng hồ sơ được định danh bởi Gateway; null báo application rằng local user không còn tồn tại.
    async saveForUser(
        userId: string,
        account: RefundBankAccountProfile,
    ): Promise<RefundBankAccountProfile | null> {
        const result = await this.userRepository.update(
            { id: userId },
            {
                refundBankCode: account.bankCode,
                refundBankName: account.bankName,
                refundAccountHolder: account.accountHolder,
                refundAccountNumber: account.accountNumber,
            },
        );

        return result.affected ? account : null;
    }
}
