// File này công bố các contract nội bộ của Auth Service cho service khác.
// Các endpoint đều yêu cầu internal token và không cho caller tự chọn user ngoài x-user-id.

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
    if (!userId) throw new UnauthorizedException("Missing authenticated user context");
    return this.userService.getOwnedAddress(userId, addressId);
  }
}
