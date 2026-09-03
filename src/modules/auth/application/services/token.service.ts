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
  async rotateRefreshToken(
    refreshToken: string,
    clientId?: string,
    clientSecret?: string,
  ): Promise<TokenPair> {
    // Cho phép override clientId và clientSecret khi gọi hàm này để hỗ trợ cả flow social auth (clientId = 'web-client')
    // và flow đăng nhập thông thường (clientId = auth-service client). Nếu không override thì mặc định sẽ dùng auth-service client, phù hợp cho flow đăng nhập thông thường.
    const effectiveClientId = clientId ?? this.clientId;
    const effectiveClientSecret = clientSecret ?? this.clientSecret;

    // Các parameter cần thiết để gọi token endpoint với grant_type = refresh_token, bao gồm refresh_token. Client ID và secret cũng được bao gồm nếu có.
    const params: Record<string, string> = {
      grant_type: "refresh_token",
      client_id: effectiveClientId,
      refresh_token: refreshToken,
    };
    // clientSecret có thể để trống nếu client được cấu hình là public client trong Keycloak, nhưng nếu có thì sẽ được bao gồm để tăng cường bảo mật cho flow refresh token.
    if (effectiveClientSecret) params.client_secret = effectiveClientSecret;

    const response = await axios.post(
      this.tokenEndpoint,
      new URLSearchParams(params).toString(),
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
    clientId?: string,
    clientSecret?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    // Cho phép override clientId và clientSecret khi gọi hàm này để hỗ trợ cả flow social auth (clientId = 'web-client')
    // và flow đăng nhập thông thường (clientId = auth-service client). Nếu không override thì mặc định sẽ dùng auth-service client, phù hợp cho flow đăng nhập thông thường.
    const effectiveClientId = clientId ?? this.clientId;
    const effectiveClientSecret = clientSecret ?? this.clientSecret;

    // Các parameter cần thiết để gọi token endpoint với grant_type = authorization_code, bao gồm code và redirect_uri. Client ID và secret cũng được bao gồm nếu có.
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: effectiveClientId,
      code,
      redirect_uri: redirectUri,
    };
    if (effectiveClientSecret) params.client_secret = effectiveClientSecret;

    const response = await axios.post(
      this.tokenEndpoint,
      new URLSearchParams(params).toString(),
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
