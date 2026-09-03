import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

// Guard này đảm bảo rằng mọi request đến các route được bảo vệ đều phải có header "x-user-id" hợp lệ,
// tức là đã được xác thực qua JwtAuthGuard trước đó.
// Nếu thiếu hoặc không hợp lệ, sẽ trả về lỗi 401 Unauthorized.
@Injectable()
export class UserIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.headers["x-user-id"];
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new UnauthorizedException("Authentication required");
    }
    return true;
  }
}
