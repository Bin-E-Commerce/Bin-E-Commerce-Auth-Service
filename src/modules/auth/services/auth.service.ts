import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";

import { User } from "../../../database/entities/user.entity";
import { RefreshToken } from "../../../database/entities/refresh-token.entity";
import { OtpPurpose } from "../../../database/entities/otp-challenge.entity";
import { UserRole } from "@common/enums/user-role.enum";
import { UserStatus } from "@common/enums/user-status.enum";

import { KeycloakAdminService } from "./keycloak-admin.service";
import { OtpService } from "./otp.service";
import { TokenService, TokenPair } from "./token.service";
import { RegisterInitiateDto } from "../dto/register-initiate.dto";
import { RegisterVerifyDto } from "../dto/register-verify.dto";
import { LoginDto } from "../dto/login.dto";
import { SocialCallbackDto } from "../dto/social-callback.dto";
import { ForgotPasswordDto } from "../dto/forgot-password.dto";
import { ResetPasswordDto } from "../dto/reset-password.dto";
import { AuthResponse } from "../dto/auth-response.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Dùng để tạm lưu state của social login flow, tránh CSRF. Cấu trúc: state => { provider, expiresAt }
  private readonly socialStateStore = new Map<
    string,
    { provider: string; expiresAt: number }
  >();

  // Khởi tạo AuthService với các repository để truy cập database, các service để tương tác với Keycloak, OTP và token management,
  // Cũng như ConfigService để lấy cấu hình từ environment variables. AuthService sẽ là nơi chứa logic chính
  // Cho các chức năng authentication như đăng ký, đăng nhập, refresh token và social login.
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────── REGISTER ────────────────────────────────

  async registerInitiate(
    dto: RegisterInitiateDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const email = dto.email.toLowerCase();

    // Kiểm tra nếu email đã tồn tại trong hệ thống
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException("Email already registered");

    // Tạo OTP challenge mới cho mục đích đăng ký, lưu trữ thông tin tạm thời như name, phone và password (dùng để tạo user trong Keycloak sau này)
    const rawOtp = await this.otpService.createChallenge(
      email,
      OtpPurpose.REGISTER,
      {
        name: dto.name,
        phone: dto.phone ?? null,
        passwordForKc: dto.password, // SECURITY_TODO: encrypt before production
      },
    );

    await this.otpService.sendOtp(email, rawOtp, "email");

    return { message: "OTP sent to your email", expiresIn: 600 };
  }

  async registerVerify(
    dto: RegisterVerifyDto,
    ip?: string,
    userAgent?: string, // Thông tin IP và user agent được truyền vào để lưu thông tin phiên đăng nhập sau này, hỗ trợ các tính năng bảo mật như phát hiện token bị lộ.
  ): Promise<AuthResponse> {
    const identifier = dto.identifier.toLowerCase();

    // Xác thực OTP, nếu thành công sẽ trả về thông tin tạm thời đã lưu khi tạo challenge (name, phone, passwordForKc) để tiếp tục tạo user trong Keycloak và local DB.
    // Nếu OTP không hợp lệ hoặc hết hạn sẽ trả về null và chúng ta sẽ ném lỗi UnauthorizedException.
    const extra = await this.otpService.verifyOtp(
      identifier,
      OtpPurpose.REGISTER,
      dto.otp,
    );

    // Nếu OTP hợp lệ, tiếp tục tạo user mới trong Keycloak và local DB.
    const { name, phone, passwordForKc } = extra as {
      name: string;
      phone: string | null;
      passwordForKc: string;
    };

    // Tạo user mới trong Keycloak trước để lấy keycloakId, nếu thất bại sẽ không tạo user trong DB local.
    // Nếu thành công sẽ tiếp tục tạo user trong DB local, nếu DB local thất bại sẽ xoá user vừa tạo trong Keycloak để tránh rác user không đồng bộ giữa Keycloak và DB local.
    const keycloakId = await this.keycloakAdmin.createUser(
      identifier,
      passwordForKc,
      name,
    );

    // Create local user — compensate Keycloak on failure
    let user: User;
    try {
      user = this.userRepo.create({
        email: identifier,
        name,
        phone: phone ?? null,
        keycloakId,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      });
      user = await this.userRepo.save(user);
    } catch (err) {
      this.logger.error(
        `Local DB insert failed, compensating Keycloak user ${keycloakId}`,
      );
      await this.keycloakAdmin.deleteUser(keycloakId);
      throw err;
    }

    // Gán realm role CUSTOMER cho user trong Keycloak để đồng bộ với role trong DB local.
    // Nếu thất bại, sẽ log lỗi nhưng không throw exception vì user đã được tạo thành công và có thể gán role sau.
    try {
      await this.keycloakAdmin.assignRealmRole(keycloakId, UserRole.CUSTOMER);
    } catch (err) {
      this.logger.error(
        `Failed to assign realm role CUSTOMER to Keycloak user ${keycloakId}: ${String(err)}`,
      );
    }

    // Tự động đăng nhập sau khi đăng ký thành công bằng cách lấy token từ Keycloak
    // Và lưu refresh token vào DB local.
    // Nếu bước này thất bại, user vẫn được tạo thành công nhưng sẽ phải đăng nhập thủ công.
    const tokens = await this.tokenService.issueTokenPair(
      identifier,
      passwordForKc,
    );

    // Lưu refresh token vào DB để quản lý phiên đăng nhập,
    // hỗ trợ revoke khi cần thiết, và phục vụ cho các tính năng bảo mật như phát hiện token bị lộ.
    const session = await this.saveRefreshToken(
      user.id,
      tokens.refreshToken,
      tokens.refreshExpiresIn,
      ip,
      userAgent,
    );

    return { ...tokens, sessionId: session.id, user: this.safeUser(user) };
  }

  // ─────────────────────────────── LOGIN ───────────────────────────────────
  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();
    // Kiểm tra user trong DB local để đảm bảo tài khoản tồn tại và đang ở trạng thái ACTIVE.
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException("Account not found");
    if (user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException("Account is inactive or banned");

    // Lấy token từ Keycloak bằng cách gọi token endpoint với Resource Owner Password Credentials Grant
    // Nếu thất bại sẽ ném lỗi UnauthorizedException.
    const tokens = await this.tokenService.issueTokenPair(email, dto.password);

    // Cập nhật lastLoginAt và lưu refresh token vào DB local để quản lý phiên đăng nhập,
    // hỗ trợ revoke khi cần thiết, và phục vụ cho các tính năng bảo mật như phát hiện token bị lộ.
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const session = await this.saveRefreshToken(
      user.id,
      tokens.refreshToken,
      tokens.refreshExpiresIn,
      ip,
      userAgent,
    );

    return { ...tokens, sessionId: session.id, user: this.safeUser(user) };
  }

  // ─────────────────────────────── SOCIAL ──────────────────────────────────

  getSocialAuthUrl(provider: string): { authUrl: string; state: string } {
    // Tạo state ngẫu nhiên để chống CSRF trong flow social login.
    // State này sẽ được lưu tạm thời trong socialStateStore với thông tin provider và thời gian hết hạn.
    const state = randomUUID();
    this.socialStateStore.set(state, {
      provider,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Dọn dẹp các state đã hết hạn trong socialStateStore để tránh rò rỉ bộ nhớ.
    for (const [key, val] of this.socialStateStore) {
      if (val.expiresAt < Date.now()) this.socialStateStore.delete(key);
    }

    const keycloakUrl = this.config.get<string>(
      "KEYCLOAK_URL",
      "http://keycloak:8080",
    );
    const realm = this.config.get<string>("KEYCLOAK_REALM", "");
    const clientId = this.config.get<string>(
      "KEYCLOAK_WEB_CLIENT_ID",
      "web-client",
    );
    const redirectUri = this.getSocialCallbackUrl();

    const authUrl =
      `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&scope=openid email profile` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&kc_idp_hint=${provider}`;

    return { authUrl, state };
  }

  async socialCallback(
    provider: string,
    dto: SocialCallbackDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    // Xác thực state để chống CSRF, đảm bảo state tồn tại, khớp với provider, và chưa hết hạn.
    // Nếu không hợp lệ sẽ ném lỗi UnauthorizedException.
    const stored = this.socialStateStore.get(dto.state);
    if (
      !stored ||
      stored.provider !== provider ||
      stored.expiresAt < Date.now()
    ) {
      throw new UnauthorizedException("Invalid or expired state parameter");
    }
    this.socialStateStore.delete(dto.state);

    const redirectUri = this.getSocialCallbackUrl();
    const webClientId = this.config.get<string>(
      "KEYCLOAK_WEB_CLIENT_ID",
      "web-client",
    );
    const webClientSecret = this.config.get<string>(
      "KEYCLOAK_WEB_CLIENT_SECRET",
      "",
    );
    const tokens = await this.tokenService.exchangeCode(
      dto.code,
      redirectUri,
      webClientId,
      webClientSecret,
    );

    // Decode id_token to get user info (no verification needed — Keycloak already validated)
    const idPayload = jwt.decode(tokens.idToken) as Record<string, unknown>;
    const keycloakId = idPayload["sub"] as string;
    const email = (idPayload["email"] as string | undefined)?.toLowerCase();
    const name =
      (idPayload["name"] as string | undefined) ??
      (idPayload["preferred_username"] as string) ??
      "User";

    if (!email)
      throw new UnauthorizedException(
        "Email not provided by identity provider",
      );

    // Upsert local user
    let user = await this.userRepo.findOne({ where: { keycloakId } });
    if (!user) {
      user = await this.userRepo.findOne({ where: { email } });
      if (user) {
        // Merge: link keycloakId to existing account
        await this.userRepo.update(user.id, { keycloakId });
        user.keycloakId = keycloakId;
      } else {
        // New social user
        user = this.userRepo.create({
          email,
          name,
          keycloakId,
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
        });
        user = await this.userRepo.save(user);
        await this.keycloakAdmin.assignRealmRole(keycloakId, UserRole.CUSTOMER);
        // TODO: publish Kafka user.registered event
      }
    }

    if (user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException("Account is inactive or banned");

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const session = await this.saveRefreshToken(
      user.id,
      tokens.refreshToken,
      tokens.refreshExpiresIn,
      ip,
      userAgent,
      webClientId,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      sessionId: session.id,
      user: this.safeUser(user),
    };
  }

  // ─────────────────────────────── REFRESH ─────────────────────────────────

  async refresh(
    rawRefreshToken: string, // Token gốc từ client gửi lên
    ip?: string, // Địa chỉ IP của client, dùng để lưu thông tin phiên đăng nhập và hỗ trợ các tính năng bảo mật như phát hiện token bị lộ.
    userAgent?: string, // User agent của client, cũng dùng để lưu thông tin phiên đăng nhập và hỗ trợ các tính năng bảo mật.
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    sessionId: string;
    user: Partial<User>;
  }> {
    const hash = this.tokenService.hashToken(rawRefreshToken);

    // Kiểm tra refresh token trong DB local để đảm bảo token hợp lệ, chưa bị thu hồi, và chưa hết hạn.
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash },
      relations: ["user"],
    });

    // Nếu token không tồn tại, đã bị thu hồi, hoặc đã hết hạn, sẽ ném lỗi UnauthorizedException.
    // Đồng thời, nếu token đã bị thu hồi (nghi ngờ bị lộ)
    // Sẽ thực hiện revoke tất cả các token khác của user đó để bảo vệ tài khoản.
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Nếu token đã bị thu hồi, sẽ thu hồi tất cả các token khác của user đó để bảo vệ tài khoản, phòng trường hợp token bị lộ.
      if (stored?.revokedAt) {
        await this.refreshTokenRepo.update(
          { userId: stored.userId },
          { revokedAt: new Date() },
        );
      }
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    // Nếu token hợp lệ, sẽ gọi Keycloak để lấy cặp access token và refresh token mới.
    // Lý do lấy refresh token mới là để thực hiện refresh token rotation
    // Tăng cường bảo mật bằng cách giảm thời gian sống của mỗi refresh token và phát hiện sớm nếu có token bị lộ.
    // Dùng đúng client_id đã phát hành token (web-client cho social login, auth-service cho password login)
    const storedClientId = stored.clientId ?? undefined;
    const storedClientSecret = stored.clientId
      ? this.config.get<string>("KEYCLOAK_WEB_CLIENT_SECRET", "")
      : undefined;
    const tokens = await this.tokenService.rotateRefreshToken(
      rawRefreshToken,
      storedClientId,
      storedClientSecret,
    );

    // Revoke old token, store new one
    await this.refreshTokenRepo.update(stored.id, { revokedAt: new Date() });
    const newSession = await this.saveRefreshToken(
      stored.userId,
      tokens.refreshToken,
      tokens.refreshExpiresIn,
      ip,
      userAgent,
      stored.clientId ?? undefined,
    );

    return { ...tokens, sessionId: newSession.id, user: this.safeUser(stored.user) };
  }

  // ─────────────────────────────── LOGOUT ──────────────────────────────────

  async logout(rawRefreshToken: string): Promise<void> {
    const hash = this.tokenService.hashToken(rawRefreshToken);
    await this.refreshTokenRepo.update(
      { tokenHash: hash },
      { revokedAt: new Date() },
    );
    try {
      await this.tokenService.revokeToken(rawRefreshToken);
    } catch {
      this.logger.warn(
        "Keycloak token revocation failed — refresh token already revoked locally",
      );
    }
  }

  // ─────────────────────────── FORGOT PASSWORD ─────────────────────────────

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const email = dto.email.toLowerCase();

    // Dùng thông báo mơ hồ để tránh email enumeration attack
    // Nếu email tồn tại và tài khoản đang ở trạng thái ACTIVE,
    // sẽ tạo OTP challenge mới cho mục đích reset password và gửi OTP qua email.
    const genericResponse = {
      message: "If the email exists, an OTP has been sent",
      expiresIn: 600,
    };

    // Kiểm tra user trong DB local để đảm bảo tài khoản tồn tại và đang ở trạng thái ACTIVE.
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || user.status !== UserStatus.ACTIVE) return genericResponse;

    // Tạo OTP challenge mới cho mục đích reset password,
    // nếu đã tồn tại challenge chưa hết hạn sẽ tái sử dụng để tránh spam OTP.
    const rawOtp = await this.otpService.createChallenge(
      email,
      OtpPurpose.RESET_PASSWORD,
    );

    await this.otpService.sendOtp(email, rawOtp, "email");

    return genericResponse;
  }

  // ─────────────────────────── RESET PASSWORD ──────────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const identifier = dto.identifier.toLowerCase();

    // Xác thực OTP — sẽ throw nếu OTP không hợp lệ/hết hạn
    await this.otpService.verifyOtp(
      identifier,
      OtpPurpose.RESET_PASSWORD,
      dto.otp,
    );

    const user = await this.userRepo.findOne({ where: { email: identifier } });
    if (!user) throw new NotFoundException("User not found");
    if (user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException("Account is inactive or banned");

    // Đổi mật khẩu trong Keycloak
    await this.keycloakAdmin.resetUserPassword(
      user.keycloakId,
      dto.newPassword,
    );

    // Thu hồi toàn bộ phiên đăng nhập hiện tại của user để buộc đăng nhập lại
    await this.refreshTokenRepo.update(
      { userId: user.id },
      { revokedAt: new Date() },
    );

    return { message: "Password reset successful. Please log in again." };
  }

  // ─────────────────────────────── HELPERS ─────────────────────────────────

  private async saveRefreshToken(
    userId: string,
    rawToken: string,
    refreshExpiresIn: number,
    ip?: string,
    userAgent?: string,
    clientId?: string,
  ): Promise<RefreshToken> {
    const record = this.refreshTokenRepo.create({
      userId,
      tokenHash: this.tokenService.hashToken(rawToken),
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      clientId: clientId ?? null,
    });
    return this.refreshTokenRepo.save(record);
  }

  private safeUser(user: User): Partial<User> {
    const { id, email, name, phone, role, status, avatarUrl, createdAt } = user;
    return { id, email, name, phone, role, status, avatarUrl, createdAt };
  }

  private getSocialCallbackUrl(): string {
    const configured = this.config.get<string>("SOCIAL_AUTH_CALLBACK_URL");
    if (configured) return configured;

    const frontendUrl = this.config
      .get<string>("FRONTEND_URL", "http://localhost:5173")
      .replace(/\/+$/, "");
    return `${frontendUrl}/callback`;
  }
}
