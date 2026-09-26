import {
    Injectable,
    Logger,
    ConflictException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UserStatus } from '@common/enums/user-status.enum';

// Mục đích của service này là để tương tác với Keycloak Admin API,
// Thực hiện các thao tác quản lý người dùng như tạo user mới, gán role, v.v.
// Service này sẽ được sử dụng bởi AuthService khi cần tạo user mới trong Keycloak hoặc đồng bộ thông tin user giữa DB local và Keycloak.
// Việc tách riêng KeycloakAdminService giúp tách biệt rõ ràng phần logic liên quan đến Keycloak, dễ bảo trì và mở rộng sau này nếu cần tích hợp thêm các tính năng quản lý người dùng khác của Keycloak.
@Injectable()
export class KeycloakAdminService {
    private readonly logger = new Logger(KeycloakAdminService.name);
    private readonly keycloakUrl: string;
    private readonly realm: string;
    private readonly adminClientId: string;
    private readonly adminClientSecret: string;

    // Dùng để cache token admin Keycloak để tránh phải lấy token mới cho mỗi request đến Keycloak Admin API
    // Cải thiện hiệu năng. Token sẽ được tự động refresh khi gần hết hạn.
    private cachedToken: string | null = null;
    private tokenExpiresAt = 0;

    constructor(private readonly config: ConfigService) {
        this.keycloakUrl = config.get<string>(
            'KEYCLOAK_URL',
            'http://keycloak:8080',
        );
        this.realm = config.get<string>('KEYCLOAK_REALM', '');
        this.adminClientId = config.get<string>('KEYCLOAK_ADMIN_CLIENT_ID', '');
        this.adminClientSecret = config.get<string>(
            'KEYCLOAK_ADMIN_CLIENT_SECRET',
            '',
        );
    }

    // Phương thức để lấy token admin từ Keycloak, có caching để tối ưu hiệu suất khi gọi các API quản lý người dùng của Keycloak
    // Mục đích lấy token admin là để có quyền thực hiện các thao tác quản lý người dùng như tạo user, gán role, v.v.
    private async getAdminToken(): Promise<string> {
        // Nếu token đã được cache và chưa hết hạn thì trả về token đó, nếu không thì lấy token mới từ Keycloak
        if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
            return this.cachedToken;
        }
        const response = await axios.post(
            `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.adminClientId,
                client_secret: this.adminClientSecret,
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        );
        // Cache token với buffer 30 giây trước khi hết hạn thực tế để đảm bảo token luôn hợp lệ khi sử dụng
        this.cachedToken = response.data.access_token as string;

        // expires_in là thời gian sống của token tính bằng giây, chúng ta sẽ trừ đi 30 giây để có buffer trước khi token thực sự hết hạn
        // Lý do trừ đi 30 giây là để đảm bảo rằng chúng ta không sử dụng token đã hết hạn trong trường hợp có độ trễ mạng hoặc xử lý, giúp tránh lỗi xác thực khi gọi Keycloak Admin API với token đã hết hạn.
        this.tokenExpiresAt =
            Date.now() + ((response.data.expires_in as number) - 30) * 1000;
        return this.cachedToken;
    }

    // Tạo một user mới trong Keycloak với email, password, và name.
    // Trả về keycloakId của user vừa tạo để lưu vào DB local.
    // Dùng cho tính năng đăng ký tài khoản mới. Nếu email đã tồn tại trong Keycloak sẽ trả về lỗi ConflictException.
    async createUser(
        email: string,
        password: string,
        name: string,
    ): Promise<string> {
        const token = await this.getAdminToken();
        const response = await axios.post(
            `${this.keycloakUrl}/admin/realms/${this.realm}/users`,
            {
                username: email,
                email,
                firstName: name,
                enabled: true,
                emailVerified: true,
                requiredActions: [],
                credentials: [
                    { type: 'password', value: password, temporary: false },
                ],
            },
            {
                headers: { Authorization: `Bearer ${token}` },
                validateStatus: (s) => s < 500,
            },
        );
        if (response.status === 409) {
            throw new ConflictException('Email already registered');
        }
        if (response.status !== 201) {
            this.logger.error(
                `Keycloak createUser failed: ${response.status} ${JSON.stringify(response.data)}`,
            );
            throw new InternalServerErrorException(
                'Failed to create Keycloak user',
            );
        }
        const location = response.headers['location'] as string; // Keycloak trả về URL của user mới tạo trong header Location, ví dụ: /admin/realms/{realm}/users/{id}
        const keycloakId = location.split('/').pop();
        if (!keycloakId)
            throw new InternalServerErrorException(
                'Keycloak did not return user ID',
            );

        // Sau khi tạo user thành công, chúng ta sẽ xoá requiredActions để user không bị bắt phải đổi mật khẩu khi đăng nhập lần đầu.
        // Điều này giúp cải thiện trải nghiệm người dùng, đặc biệt là trong flow đăng ký khi chúng ta đã cung cấp mật khẩu cho user.
        await axios.put(
            `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakId}`,
            { requiredActions: [] },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        return keycloakId;
    }

    // Xóa user trong Keycloak khi có lỗi xảy ra sau khi đã tạo user trong DB local (compensating action).
    // Nếu xóa thất bại, chỉ log lỗi mà không throw exception vì đây là bước dọn dẹp không bắt buộc phải thành công.
    async deleteUser(keycloakId: string): Promise<void> {
        try {
            const token = await this.getAdminToken();
            await axios.delete(
                `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakId}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
        } catch (err) {
            this.logger.error(
                `Keycloak compensate deleteUser failed for ${keycloakId}: ${String(err)}`,
            );
        }
    }

    // Gán một realm role cho user trong Keycloak.
    // Dùng để đồng bộ role giữa DB local và Keycloak khi tạo user mới hoặc cập nhật role của user.
    async assignRealmRole(keycloakId: string, roleName: string): Promise<void> {
        const token = await this.getAdminToken();
        const role = await this.getOrCreateRealmRole(token, roleName);
        await axios.post(
            `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakId}/role-mappings/realm`,
            [{ id: role.id, name: role.name }],
            { headers: { Authorization: `Bearer ${token}` } },
        );
    }

    // Xóa một realm role của user trong Keycloak.
    // Dùng để đồng bộ role giữa DB local và Keycloak khi cập nhật role của user hoặc khi user bị banned (có thể remove role để hạn chế quyền truy cập ngay lập tức).
    async removeRealmRole(keycloakId: string, roleName: string): Promise<void> {
        const token = await this.getAdminToken();
        const role = await this.findRealmRole(token, roleName);
        // Realm cũ có thể chưa từng được seed role này; không có role thì cũng không có mapping để gỡ.
        if (!role) return;
        await axios.delete(
            `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakId}/role-mappings/realm`,
            {
                headers: { Authorization: `Bearer ${token}` },
                data: [{ id: role.id, name: role.name }],
            },
        );
    }

    // Đọc realm role hiện tại và tự tạo role nghiệp vụ còn thiếu để các realm đã tồn tại lâu vẫn đồng bộ được.
    // POST role được xử lý idempotent: nếu request khác vừa tạo role, đọc lại role thay vì báo lỗi giả.
    private async getOrCreateRealmRole(
        token: string,
        roleName: string,
    ): Promise<{ id: string; name: string }> {
        const existing = await this.findRealmRole(token, roleName);
        if (existing) return existing;

        const createResponse = await axios.post(
            `${this.keycloakUrl}/admin/realms/${this.realm}/roles`,
            {
                name: roleName,
                description: `Business role ${roleName}`,
            },
            {
                headers: { Authorization: `Bearer ${token}` },
                validateStatus: (status) => status < 500,
            },
        );

        if (createResponse.status !== 201 && createResponse.status !== 409) {
            this.logger.error(
                `Keycloak create realm role failed: ${roleName} (${createResponse.status})`,
            );
            throw new InternalServerErrorException(
                `Không thể tạo role ${roleName} trong Keycloak`,
            );
        }

        const created = await this.findRealmRole(token, roleName);
        if (!created) {
            throw new InternalServerErrorException(
                `Keycloak chưa trả về role ${roleName} sau khi tạo`,
            );
        }
        return created;
    }

    // 404 ở endpoint role nghĩa là dữ liệu realm chưa đủ; các lỗi khác vẫn phải được giữ nguyên để vận hành phát hiện.
    private async findRealmRole(
        token: string,
        roleName: string,
    ): Promise<{ id: string; name: string } | null> {
        const response = await axios.get(
            `${this.keycloakUrl}/admin/realms/${this.realm}/roles/${encodeURIComponent(roleName)}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                validateStatus: (status) => status < 500,
            },
        );
        if (response.status === 404) return null;
        if (response.status !== 200) {
            throw new InternalServerErrorException(
                `Không thể đọc role ${roleName} từ Keycloak`,
            );
        }
        return response.data as { id: string; name: string };
    }

    // Đồng bộ trạng thái nghiệp vụ vào Keycloak nhưng luôn giữ identity enabled.
    // Nếu đặt enabled=false cho BANNED, Google broker sẽ dừng trước callback và người dùng
    // chỉ nhìn thấy trang lỗi mặc định của Keycloak. Local Auth Service mới là lớp quyết định
    // quyền đăng nhập và truy cập; attribute này chỉ giúp Keycloak giữ metadata đồng bộ.
    async syncUserStatus(
        keycloakId: string,
        status: UserStatus,
    ): Promise<void> {
        const token = await this.getAdminToken();
        await axios.put(
            `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakId}`,
            {
                enabled: true,
                attributes: { binAccountStatus: [status] },
            },
            { headers: { Authorization: `Bearer ${token}` } },
        );
    }

    // Đặt lại mật khẩu của user trong Keycloak. Dùng trong flow reset password khi user quên mật khẩu.
    async resetUserPassword(
        keycloakId: string,
        newPassword: string,
    ): Promise<void> {
        const token = await this.getAdminToken();
        await axios.put(
            `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakId}/reset-password`,
            { type: 'password', value: newPassword, temporary: false },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
        );
    }
}
