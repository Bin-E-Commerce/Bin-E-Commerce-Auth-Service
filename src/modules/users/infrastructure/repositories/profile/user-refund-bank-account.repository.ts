// Adapter lưu tài khoản hoàn theo owner; truy vấn số tài khoản chỉ được mở trong thao tác hồ sơ chuyên biệt.

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UserRefundBankAccount } from '@/database/entities/user-refund-bank-account.entity';
import { User } from '@/database/entities/user.entity';
import type { UserRefundBankAccountRepository } from '@/modules/users/application/contracts/user-refund-bank-account.repository';
import type {
    RefundBankAccountInput,
    RefundBankAccountProfile,
} from '@/modules/users/application/types/user/refund-bank-account.type';

@Injectable()
export class UserRefundBankAccountRepositoryAdapter implements UserRefundBankAccountRepository {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    // Trả tài khoản theo mặc định trước, sau đó theo ngày tạo; chỉ response endpoint đã xác thực mới đọc số đầy đủ.
    async findAllForUser(userId: string): Promise<RefundBankAccountProfile[]> {
        const accounts = await this.accountRepository()
            .createQueryBuilder('account')
            .addSelect('account.accountNumber')
            .where('account.userId = :userId', { userId })
            .orderBy('account.isDefault', 'DESC')
            .addOrderBy('account.createdAt', 'ASC')
            .getMany();
        return accounts.map((account) => this.toProfile(account));
    }

    // Chỉ đọc một tài khoản thuộc user để đồng bộ chính xác các yêu cầu hoàn đang chờ.
    async findForUser(
        userId: string,
        accountId: string,
    ): Promise<RefundBankAccountProfile | null> {
        const account = await this.findScopedAccount(
            this.accountRepository(),
            userId,
            accountId,
            false,
        );
        return account ? this.toProfile(account) : null;
    }

    // Khóa user trước khi kiểm tra danh sách để thao tác đồng thời không thể tạo hai tài khoản mặc định.
    async createForUser(
        userId: string,
        account: RefundBankAccountInput,
    ): Promise<RefundBankAccountProfile | null> {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager
                .getRepository(User)
                .createQueryBuilder('user')
                .select('user.id')
                .where('user.id = :userId', { userId })
                .setLock('pessimistic_write')
                .getOne();
            if (!user) return null;

            const repository = manager.getRepository(UserRefundBankAccount);
            const duplicate = await repository
                .createQueryBuilder('account')
                .addSelect('account.accountNumber')
                .where('account.userId = :userId', { userId })
                .andWhere('account.bankCode = :bankCode', {
                    bankCode: account.bankCode,
                })
                .andWhere('account.accountHolder = :accountHolder', {
                    accountHolder: account.accountHolder,
                })
                .andWhere('account.accountNumber = :accountNumber', {
                    accountNumber: account.accountNumber,
                })
                .getOne();
            // Retry gửi lại cùng dữ liệu sẽ trả tài khoản đã có thay vì tạo bản sao trong hồ sơ.
            if (duplicate) return this.toProfile(duplicate);

            const accountCount = await repository.countBy({ userId });
            const created = repository.create({
                userId,
                ...account,
                isDefault: accountCount === 0,
            });
            return this.toProfile(await repository.save(created));
        });
    }

    // Cập nhật đúng tài khoản thuộc user trong transaction, giữ nguyên trạng thái mặc định của bản ghi.
    async updateForUser(
        userId: string,
        accountId: string,
        account: RefundBankAccountInput,
    ): Promise<RefundBankAccountProfile | null> {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(UserRefundBankAccount);
            const existing = await this.findScopedAccount(
                repository,
                userId,
                accountId,
                true,
            );
            if (!existing) return null;
            return this.toProfile(
                await repository.save({ ...existing, ...account }),
            );
        });
    }

    // Nếu xóa tài khoản mặc định, chọn tài khoản được tạo sớm nhất còn lại trước khi commit.
    async deleteForUser(userId: string, accountId: string): Promise<boolean> {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(UserRefundBankAccount);
            const user = await manager
                .getRepository(User)
                .createQueryBuilder('user')
                .select('user.id')
                .where('user.id = :userId', { userId })
                .setLock('pessimistic_write')
                .getOne();
            if (!user) return false;

            const account = await this.findScopedAccount(
                repository,
                userId,
                accountId,
                true,
            );
            if (!account) return false;
            await repository.delete({ id: accountId, userId });

            if (account.isDefault) {
                const replacement = await repository.findOne({
                    where: { userId },
                    order: { createdAt: 'ASC' },
                });
                if (replacement) {
                    await repository.update(
                        { id: replacement.id, userId },
                        { isDefault: true },
                    );
                }
            }
            return true;
        });
    }

    // Khóa user, bỏ cờ mặc định hiện tại rồi gắn cờ mới trong cùng transaction.
    async setDefaultForUser(
        userId: string,
        accountId: string,
    ): Promise<RefundBankAccountProfile | null> {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager
                .getRepository(User)
                .createQueryBuilder('user')
                .select('user.id')
                .where('user.id = :userId', { userId })
                .setLock('pessimistic_write')
                .getOne();
            if (!user) return null;

            const repository = manager.getRepository(UserRefundBankAccount);
            const target = await this.findScopedAccount(
                repository,
                userId,
                accountId,
                true,
            );
            if (!target) return null;
            if (!target.isDefault) {
                await repository.update(
                    { userId, isDefault: true },
                    { isDefault: false },
                );
                await repository.update(
                    { id: accountId, userId },
                    { isDefault: true },
                );
            }
            return this.toProfile(
                target.isDefault ? target : { ...target, isDefault: true },
            );
        });
    }

    // Query số tài khoản tường minh vì entity mặc định ẩn cột này khỏi truy vấn TypeORM.
    private async findScopedAccount(
        repository: Repository<UserRefundBankAccount>,
        userId: string,
        accountId: string,
        lock: boolean,
    ): Promise<UserRefundBankAccount | null> {
        const query = repository
            .createQueryBuilder('account')
            .addSelect('account.accountNumber')
            .where('account.id = :accountId', { accountId })
            .andWhere('account.userId = :userId', { userId });
        if (lock) query.setLock('pessimistic_write');
        return query.getOne();
    }

    // Chỉ ánh xạ các trường cần cho endpoint hồ sơ, không trả relationship hoặc timestamp persistence.
    private toProfile(
        account: UserRefundBankAccount,
    ): RefundBankAccountProfile {
        return {
            id: account.id,
            bankCode: account.bankCode,
            bankName: account.bankName,
            accountHolder: account.accountHolder,
            accountNumber: account.accountNumber,
            isDefault: account.isDefault,
        };
    }

    // Lấy repository qua DataSource để mọi thao tác transaction dùng đúng EntityManager đang được khóa.
    private accountRepository(): Repository<UserRefundBankAccount> {
        return this.dataSource.getRepository(UserRefundBankAccount);
    }
}
