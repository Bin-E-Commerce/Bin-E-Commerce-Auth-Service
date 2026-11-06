// Use case quản lý danh sách tài khoản nhận hoàn; dữ liệu đã chuẩn hóa được lưu qua repository port.

import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { REFUND_BANK_OPTIONS } from '@/modules/users/application/constants/refund-bank-options.constant';
import { USER_REFUND_BANK_ACCOUNT_REPOSITORY } from '@/modules/users/application/contracts/user-refund-bank-account.repository';
import type { UserRefundBankAccountRepository } from '@/modules/users/application/contracts/user-refund-bank-account.repository';
import type {
    RefundBankAccountInput,
    RefundBankAccountProfile,
} from '@/modules/users/application/types/user/refund-bank-account.type';

@Injectable()
export class UserRefundBankAccountService {
    constructor(
        @Inject(USER_REFUND_BANK_ACCOUNT_REPOSITORY)
        private readonly refundBankAccountRepository: UserRefundBankAccountRepository,
    ) {}

    // Chỉ trả danh sách của user hiện tại; số tài khoản không đi qua response profile tổng quát.
    listForUser(userId: string): Promise<RefundBankAccountProfile[]> {
        return this.refundBankAccountRepository.findAllForUser(userId);
    }

    // Chuẩn hóa và xác thực dữ liệu trước khi tạo tài khoản để API nội bộ cũng không lưu dữ liệu sai.
    async createForUser(
        userId: string,
        value: RefundBankAccountInput,
    ): Promise<RefundBankAccountProfile> {
        const account = this.normalizeAccount(value);
        const saved = await this.refundBankAccountRepository.createForUser(
            userId,
            account,
        );
        if (!saved) throw new NotFoundException('User not found');
        return saved;
    }

    // Chỉ cập nhật bản ghi thuộc user hiện tại; ID của tài khoản không thể dùng để sửa dữ liệu user khác.
    async updateForUser(
        userId: string,
        accountId: string,
        value: RefundBankAccountInput,
    ): Promise<RefundBankAccountProfile> {
        const account = this.normalizeAccount(value);
        const saved = await this.refundBankAccountRepository.updateForUser(
            userId,
            accountId,
            account,
        );
        if (!saved)
            throw new NotFoundException('Refund bank account not found');
        return saved;
    }

    // Xóa theo cặp user/account; không tiết lộ tài khoản khác nếu ID không thuộc người gọi.
    async deleteForUser(userId: string, accountId: string): Promise<void> {
        const deleted = await this.refundBankAccountRepository.deleteForUser(
            userId,
            accountId,
        );
        if (!deleted)
            throw new NotFoundException('Refund bank account not found');
    }

    // Đổi mặc định qua repository transaction để một user không thể có hai tài khoản mặc định.
    async setDefaultForUser(
        userId: string,
        accountId: string,
    ): Promise<RefundBankAccountProfile> {
        const account =
            await this.refundBankAccountRepository.setDefaultForUser(
                userId,
                accountId,
            );
        if (!account)
            throw new NotFoundException('Refund bank account not found');
        return account;
    }

    // Chuẩn hóa đúng danh mục ngân hàng, chữ cái/khoảng trắng trong tên và chuỗi số giữ nguyên số 0 đầu.
    private normalizeAccount(
        value: RefundBankAccountInput,
    ): RefundBankAccountInput {
        if (
            !value ||
            typeof value.bankCode !== 'string' ||
            typeof value.bankName !== 'string' ||
            typeof value.accountHolder !== 'string' ||
            typeof value.accountNumber !== 'string'
        ) {
            throw new BadRequestException('Thông tin tài khoản chưa đầy đủ.');
        }

        const bankCode = value.bankCode.trim().toLowerCase();
        const bank = REFUND_BANK_OPTIONS.find(
            (option) => option.code === bankCode,
        );
        // Chỉ nhận cặp mã/tên trong danh mục hỗ trợ để ngăn label giả khi admin đối chiếu tài khoản.
        if (!bank || value.bankName.trim() !== bank.name) {
            throw new BadRequestException(
                'Vui lòng chọn đúng ngân hàng trong danh sách hỗ trợ.',
            );
        }

        const accountHolder = value.accountHolder
            .normalize('NFC')
            .trim()
            .replace(/\s+/gu, ' ')
            .toLocaleUpperCase('vi-VN');
        // Giữ đúng quy tắc ngân hàng đã thống nhất: tên chỉ có chữ Unicode và khoảng trắng.
        if (
            accountHolder.length < 2 ||
            accountHolder.length > 100 ||
            !/^\p{L}[\p{L}\p{M}]*(?: \p{L}[\p{L}\p{M}]*)*$/u.test(accountHolder)
        ) {
            throw new BadRequestException(
                'Tên chủ tài khoản chỉ được gồm chữ cái có dấu và khoảng trắng.',
            );
        }

        const accountNumber = value.accountNumber.trim();
        // Không chuyển số tài khoản sang number để giữ số 0 đầu và giới hạn đầu vào ở 6–30 chữ số.
        if (!/^\d{6,30}$/.test(accountNumber)) {
            throw new BadRequestException(
                'Số tài khoản phải có từ 6 đến 30 chữ số.',
            );
        }

        return {
            bankCode: bank.code,
            bankName: bank.name,
            accountHolder,
            accountNumber,
        };
    }
}
