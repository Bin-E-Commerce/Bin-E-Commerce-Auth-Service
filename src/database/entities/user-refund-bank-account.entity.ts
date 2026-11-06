// Lưu tài khoản nhận hoàn riêng theo từng user; repository chỉ trả số tài khoản qua API hồ sơ được xác thực.

import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { User } from '@/database/entities/user.entity';

@Entity('user_refund_bank_accounts')
@Index(['userId'])
@Index(['userId'], { unique: true, where: '"is_default" = true' })
export class UserRefundBankAccount {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, (user) => user.refundBankAccounts, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'bank_code', type: 'varchar', length: 50 })
    bankCode: string;

    @Column({ name: 'bank_name', type: 'varchar', length: 100 })
    bankName: string;

    @Column({ name: 'account_holder', type: 'varchar', length: 100 })
    accountHolder: string;

    @Column({
        name: 'account_number',
        type: 'varchar',
        length: 30,
        select: false,
    })
    accountNumber: string;

    @Column({ name: 'is_default', type: 'boolean', default: false })
    isDefault: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
