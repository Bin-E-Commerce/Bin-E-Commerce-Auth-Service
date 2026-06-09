import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  ParseUUIDPipe,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "../services/auth.service";
import { RegisterInitiateDto } from "../dto/register-initiate.dto";
import { RegisterVerifyDto } from "../dto/register-verify.dto";
import { LoginDto } from "../dto/login.dto";
import { RefreshDto } from "../dto/refresh.dto";
import { SocialCallbackDto } from "../dto/social-callback.dto";
import { ForgotPasswordDto } from "../dto/forgot-password.dto";
import { ResetPasswordDto } from "../dto/reset-password.dto";
import { ChangePasswordDto } from "../dto/change-password.dto";

const REFRESH_COOKIE = "refresh_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // thời gian sống của cookie (7 ngày) — trùng với thời gian sống của refresh token để tránh trường hợp cookie còn nhưng token đã hết hạn
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register/initiate")
  @HttpCode(HttpStatus.OK)
  async registerInitiate(@Body() dto: RegisterInitiateDto) {
    const result = await this.authService.registerInitiate(dto);
    return { data: result, message: "OTP sent successfully", statusCode: 200 };
  }

  @Post("register/verify")
  @HttpCode(HttpStatus.CREATED)
  async registerVerify(
    @Body() dto: RegisterVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Khi người dùng gửi mã OTP để xác minh đăng ký, sau khi xác minh thành công,
    const result = await this.authService.registerVerify(
      dto,
      req.ip,
      req.headers["user-agent"],
    );

    // AuthService sẽ trả về access token và refresh token.
    // Chúng ta sẽ set refresh token vào cookie để client có thể sử dụng cho các request sau này,
    // Đồng thời trả về access token và thông tin user trong response body.
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _, ...safeResult } = result;
    return {
      data: safeResult,
      message: "Registration successful",
      statusCode: 201,
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      dto,
      req.ip,
      req.headers["user-agent"],
    );
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _, ...safeResult } = result;
    return { data: safeResult, message: "Login successful", statusCode: 200 };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Khi client gửi request refresh token, chúng ta sẽ lấy refresh token từ cookie (ưu tiên)
    // hoặc từ body nếu cookie không có.
    const token =
      (req.cookies as Record<string, string>)?.[REFRESH_COOKIE] ??
      dto.refreshToken;
    if (!token) throw new UnauthorizedException("Refresh token missing");

    const result = await this.authService.refresh(
      token,
      req.ip,
      req.headers["user-agent"],
    );
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _, ...safeResult } = result;
    return { data: safeResult, message: "Token refreshed", statusCode: 200 };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies as Record<string, string>)?.[REFRESH_COOKIE] ??
      dto.refreshToken;
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
    return { data: null, message: "Logged out successfully", statusCode: 200 };
  }

  @Get("social/start/:provider")
  getSocialStart(@Param("provider") provider: string) {
    const result = this.authService.getSocialAuthUrl(provider);
    return {
      data: result,
      message: "Social auth URL generated",
      statusCode: 200,
    };
  }

  @Post("social/callback/:provider")
  @HttpCode(HttpStatus.OK)
  async socialCallback(
    @Param("provider") provider: string,
    @Body() dto: SocialCallbackDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.socialCallback(
      provider,
      dto,
      req.ip,
      req.headers["user-agent"],
    );
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _, ...safeResult } = result;
    return {
      data: safeResult,
      message: "Social login successful",
      statusCode: 200,
    };
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);
    return { data: result, message: result.message, statusCode: 200 };
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    return { data: null, message: result.message, statusCode: 200 };
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Headers("x-user-id") userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Header x-user-id được gateway gắn từ JWT, nên thiếu header này nghĩa là request không còn ngữ cảnh đăng nhập hợp lệ.
    if (!userId) throw new UnauthorizedException("Missing user context");

    const result = await this.authService.changePassword(
      userId,
      dto,
      req.ip,
      req.headers["user-agent"],
    );
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _, ...safeResult } = result;
    return {
      data: safeResult,
      message: "Password changed successfully",
      statusCode: 200,
    };
  }

  @Get("sessions")
  async getSessions(
    @Headers("x-user-id") userId: string,
    @Headers("x-session-id") currentSessionId?: string,
    @Req() req?: Request,
  ) {
    // Danh sách phiên lấy theo refresh token cookie trước, header userId chỉ dùng làm ngữ cảnh xác thực dự phòng.
    if (!userId) throw new UnauthorizedException("Missing user context");

    const rawRefreshToken =
      (req?.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const sessions = await this.authService.listSessions(
      userId,
      currentSessionId,
      rawRefreshToken,
      req?.headers["user-agent"],
    );
    return { data: sessions, message: "Sessions retrieved", statusCode: 200 };
  }

  @Post("sessions/:sessionId/revoke")
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Headers("x-user-id") userId: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Req() req: Request,
  ) {
    // Ưu tiên refresh token trong cookie để xác định đúng chủ phiên, vì header sessionId có thể cũ sau khi refresh token xoay vòng.
    if (!userId) throw new UnauthorizedException("Missing user context");

    const rawRefreshToken =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.authService.revokeSessionById(
      userId,
      sessionId,
      rawRefreshToken,
    );
    return { data: null, message: "Session revoked", statusCode: 200 };
  }

  @Post("sessions/logout-others")
  @HttpCode(HttpStatus.OK)
  async logoutOtherSessions(
    @Headers("x-user-id") userId: string,
    @Headers("x-session-id") currentSessionId: string | undefined,
    @Req() req: Request,
  ) {
    // Cookie refresh token là nguồn chính để giữ lại đúng phiên hiện tại; header chỉ là phương án dự phòng.
    if (!userId) throw new UnauthorizedException("Missing user context");

    const rawRefreshToken =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const revokedCount = await this.authService.revokeOtherSessions(
      userId,
      currentSessionId,
      rawRefreshToken,
    );
    return {
      data: { revokedCount },
      message: "Other sessions revoked",
      statusCode: 200,
    };
  }

  @Post("sessions/logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAllSessions(
    @Headers("x-user-id") userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Logout tất cả phải thu hồi cả phiên hiện tại và xóa cookie refresh token trên trình duyệt.
    if (!userId) throw new UnauthorizedException("Missing user context");

    const rawRefreshToken =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const revokedCount = await this.authService.revokeAllSessions(
      userId,
      rawRefreshToken,
    );
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
    return {
      data: { revokedCount },
      message: "All sessions revoked",
      statusCode: 200,
    };
  }
}
