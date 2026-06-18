import { timingSafeEqual } from "crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

@Injectable()
export class InternalServiceGuard implements CanActivate {
  // Đọc secret dùng chung từ môi trường để chỉ service nội bộ được phép gọi endpoint cập nhật avatar.
  constructor(private readonly configService: ConfigService) {}

  // So sánh token theo thời gian cố định để hạn chế rò rỉ thông tin qua timing attack.
  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.configService.get<string>(
      "INTERNAL_SERVICE_TOKEN",
      "",
    );

    if (!expectedToken) {
      throw new ServiceUnavailableException(
        "INTERNAL_SERVICE_TOKEN is not configured",
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const receivedToken = request.headers["x-internal-service-token"];

    if (
      typeof receivedToken !== "string" ||
      !this.tokensMatch(receivedToken, expectedToken)
    ) {
      throw new UnauthorizedException("Invalid internal service token");
    }

    return true;
  }

  // Chỉ gọi timingSafeEqual khi hai buffer cùng độ dài vì Node.js sẽ throw nếu độ dài khác nhau.
  private tokensMatch(receivedToken: string, expectedToken: string): boolean {
    const receivedBuffer = Buffer.from(receivedToken);
    const expectedBuffer = Buffer.from(expectedToken);

    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  }
}
