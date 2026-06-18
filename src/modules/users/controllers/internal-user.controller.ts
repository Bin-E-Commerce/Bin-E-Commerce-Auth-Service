import {
  Body,
  Controller,
  Headers,
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
}
