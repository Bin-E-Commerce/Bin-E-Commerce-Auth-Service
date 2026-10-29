// Port thống kê user theo ngày; persistence và timezone SQL được giữ trong infrastructure của auth-service.
export const ADMIN_USER_ACTIVITY_REPOSITORY = Symbol(
    'ADMIN_USER_ACTIVITY_REPOSITORY',
);

export interface AdminUserActivityDailyCount {
    day: string;
    count: number;
}

export interface AdminUserActivityRepositoryPort {
    getNewUsersDaily(from: string, to: string): Promise<AdminUserActivityDailyCount[]>;
}
