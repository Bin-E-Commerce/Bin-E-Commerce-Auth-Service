import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Headers,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { UserService } from "../services/user.service";
import { UserRole } from "@common/enums/user-role.enum";
import { UserStatus } from "@common/enums/user-status.enum";
import { IsIn } from "class-validator";
import { IsString } from "class-validator";

class UpdateRoleDto {
  @IsString()
  @IsIn(Object.values(UserRole))
  role: UserRole;
}

class UpdateStatusDto {
  @IsString()
  @IsIn(Object.values(UserStatus))
  status: UserStatus;
}

// API quản lý user dành cho admin.
// API Gateway đã chặn bằng @RequirePermissions(admin.access), service này chỉ nhận request có user context hợp lệ.
@Controller("admin/users")
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async listUsers(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const result = await this.userService.listUsers(page, Math.min(limit, 100));
    return { data: result, message: "Users retrieved", statusCode: 200 };
  }

  @Put(":id/role")
  async updateRole(
    @Headers("x-user-id") requesterId: string,
    @Param("id", ParseUUIDPipe) targetId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const user = await this.userService.adminUpdateRole(
      requesterId,
      targetId,
      dto.role,
    );
    return { data: user, message: "Role updated", statusCode: 200 };
  }

  @Put(":id/status")
  async updateStatus(
    @Headers("x-user-id") requesterId: string,
    @Param("id", ParseUUIDPipe) targetId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const user = await this.userService.adminUpdateStatus(
      requesterId,
      targetId,
      dto.status,
    );
    return { data: user, message: "Status updated", statusCode: 200 };
  }
}
