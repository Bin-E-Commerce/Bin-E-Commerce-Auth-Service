import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import axios from "axios";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly keycloakUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly config: ConfigService) {
    this.keycloakUrl = config.get<string>(
      "KEYCLOAK_URL",
      "http://keycloak:8080",
    );
    this.realm = config.get<string>("KEYCLOAK_REALM", "");
    this.clientId = config.get<string>("KEYCLOAK_CLIENT_ID", "");
    this.clientSecret = config.get<string>("KEYCLOAK_CLIENT_SECRET", "");
  }

  // Băm token để lưu trữ an toàn trong DB (nếu cần). Keycloak đã hash refresh token khi trả về, nhưng chúng ta vẫn hash lại để đảm bảo an toàn tối đa nếu có rò rỉ DB.
  hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  // Endpoint token của Keycloak để lấy token mới hoặc refresh token. Chúng ta sẽ gọi endpoint này trong các flow đăng nhập, đăng ký, social auth, và refresh token.
  private get tokenEndpoint(): string {
    return `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
  }

  // Lấy cặp access token và refresh token mới từ Keycloak bằng cách sử dụng Resource Owner Password Credentials Grant (dùng cho login thông thường với email/password).
  async issueTokenPair(email: string, password: string): Promise<TokenPair> {
    const response = await axios.post(
      this.tokenEndpoint,
      new URLSearchParams({
        grant_type: "password",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: email,
        password,
        scope: "openid",
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );

    if (response.status !== 200) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return {
      accessToken: response.data.access_token as string,
      refreshToken: response.data.refresh_token as string,
      expiresIn: response.data.expires_in as number,
      refreshExpiresIn: response.data.refresh_expires_in as number,
    };
  }

  // Lấy cặp access token và refresh token mới từ Keycloak bằng cách sử dụng Refresh Token Grant (dùng cho refresh token flow).
  // Lý do lấy cả refresh token mới là để thực hiện refresh token rotation
  // Tăng cường bảo mật bằng cách giảm thời gian sống của mỗi refresh token và phát hiện sớm nếu có token bị lộ.
  async rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
    const response = await axios.post(
      this.tokenEndpoint,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );

    if (response.status !== 200) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    return {
      accessToken: response.data.access_token as string,
      refreshToken: response.data.refresh_token as string,
      expiresIn: response.data.expires_in as number,
      refreshExpiresIn: response.data.refresh_expires_in as number,
    };
  }

  // Lấy cặp access token và refresh token mới từ Keycloak bằng cách sử dụng Authorization Code Grant (dùng cho social auth hoặc các flow có redirect).
  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    const response = await axios.post(
      this.tokenEndpoint,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );

    if (response.status !== 200) {
      throw new BadRequestException("Invalid or expired authorization code");
    }

    return {
      accessToken: response.data.access_token as string,
      refreshToken: response.data.refresh_token as string,
      idToken: response.data.id_token as string,
      expiresIn: response.data.expires_in as number,
      refreshExpiresIn: response.data.refresh_expires_in as number,
    };
  }

  // Thu hồi refresh token khi user logout hoặc khi refresh token bị nghi ngờ bị lộ. Điều này sẽ làm cho refresh token không còn hợp lệ nữa, và nếu client cố gắng dùng nó để lấy access token mới sẽ bị từ chối.
  async revokeToken(refreshToken: string): Promise<void> {
    await axios.post(
      `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/revoke`,
      new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
  }
}
