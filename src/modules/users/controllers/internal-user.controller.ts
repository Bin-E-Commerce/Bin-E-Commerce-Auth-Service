// File này công bố các contract nội bộ của Auth Service cho service khác.
// Các endpoint đều yêu cầu internal token và không cho caller tự chọn user ngoài x-user-id.

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Put,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { UpdateAvatarInternalDto } from "../dto/update-avatar-internal.dto";
import { InternalServiceGuard } from "../guards/internal-service.guard";
import { UserService } from "../services/user.service";

@Controller("internal/users")
@UseGuards(InternalServiceGuard)
export class InternalUserController {
  // Nhận UserService qua dependency injection để controller chỉ xử lý contract nội bộ.
  constructor(private readonly userService: UserService) {}

  // Cập nhật avatar từ Media Service và trả URL cũ để service gọi có thể dọn file S3 tương ứng.
  @Put("avatar")
  async updateAvatar(
    @Headers("x-user-id") userId: string | undefined,
    @Body() dto: UpdateAvatarInternalDto,
  ) {
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user context");
    }

    const result = await this.userService.updateAvatar(userId, dto.avatarUrl);

    return {
      data: result,
      message: "Avatar updated",
      statusCode: 200,
    };
  }

  // Xác nhận địa chỉ thuộc user hiện tại rồi trả snapshot cho Order Service lưu bất biến.
  @Get("addresses/:addressId")
  async getOwnedAddress(
    @Headers("x-user-id") userId: string | undefined,
    @Param("addressId", new ParseUUIDPipe()) addressId: string,
  ) {
    if (!userId)
      throw new UnauthorizedException("Missing authenticated user context");
    return this.userService.getOwnedAddress(userId, addressId);
  }

  // Trả email của user theo keycloakId cho service nội bộ gửi thông báo; caller không được đọc thêm profile hoặc credential.
  @Get(":userId/email")
  async getUserEmail(@Param("userId") userId: string) {
    const user = await this.userService.getProfile(userId);
    return { email: user.email };
  }

  // Trả về profile hiện thị tối thiểu cho danh sách review; endpoint chỉ mở cho service có internal token.
  @Get("public-profiles")
  async getPublicProfiles(@Query("ids") idsHeader?: string) {
    const keycloakIds = (idsHeader ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100);

    return {
      data: await this.userService.getPublicProfiles(keycloakIds),
      message: "Public profiles retrieved",
      statusCode: 200,
    };
  }
}
