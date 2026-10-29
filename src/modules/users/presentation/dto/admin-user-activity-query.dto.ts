// Query ngày dashboard chấp nhận ngày ISO thuần; timezone được xác định thống nhất ở repository.
import { IsDateString, Matches } from 'class-validator';

export class AdminUserActivityQueryDto {
    @IsDateString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    from!: string;

    @IsDateString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    to!: string;
}
