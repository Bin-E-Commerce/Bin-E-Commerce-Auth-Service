import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { UserService } from "../../application/services/user.service";
import { UpdateProfileDto } from "../dto/update-profile.dto";
import { CreateAddressDto } from "../dto/create-address.dto";
import { UpdateAddressDto } from "../dto/update-address.dto";
import { User } from "../../../../database/entities/user.entity";
import { AccessControlService } from "../../../access-control/application/services/access-control.service";

@Controller("users")
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get("me")
  async getProfile(@Headers("x-user-id") userId: string) {
    const user = await this.userService.getProfileByLocalId(userId);
    return {
      data: await this.toUserResponse(user),
      message: "Profile retrieved",
      statusCode: 200,
    };
  }

  @Put("me")
  async updateProfile(
    @Headers("x-user-id") userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.userService.updateProfile(userId, dto);
    return {
      data: await this.toUserResponse(user),
      message: "Profile updated",
      statusCode: 200,
    };
  }

  @Get("me/addresses")
  async listAddresses(@Headers("x-user-id") userId: string) {
    const addresses = await this.userService.listAddresses(userId);
    return { data: addresses, message: "Addresses retrieved", statusCode: 200 };
  }

  @Post("me/addresses")
  @HttpCode(HttpStatus.CREATED)
  async createAddress(
    @Headers("x-user-id") userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    const address = await this.userService.createAddress(userId, dto);
    return { data: address, message: "Address created", statusCode: 201 };
  }

  @Put("me/addresses/:id")
  async updateAddress(
    @Headers("x-user-id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const address = await this.userService.updateAddress(userId, id, dto);
    return { data: address, message: "Address updated", statusCode: 200 };
  }

  @Delete("me/addresses/:id")
  @HttpCode(HttpStatus.OK)
  async deleteAddress(
    @Headers("x-user-id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.userService.deleteAddress(userId, id);
    return { data: null, message: "Address deleted", statusCode: 200 };
  }

  // ──────────────────────────────── SESSIONS ────────────────────────────────

  @Get("me/sessions")
  async getSessions(
    @Headers("x-user-id") userId: string,
    @Headers("x-session-id") currentSessionId?: string,
  ) {
    const sessions = await this.userService.getSessions(
      userId,
      currentSessionId,
    );
    return { data: sessions, message: "Sessions retrieved", statusCode: 200 };
  }

  @Delete("me/sessions")
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(
    @Headers("x-user-id") userId: string,
    @Headers("x-session-id") currentSessionId: string,
  ) {
    const revokedCount = await this.userService.revokeOtherSessions(
      userId,
      currentSessionId,
    );
    return {
      data: { revokedCount },
      message: "Other sessions revoked",
      statusCode: 200,
    };
  }

  @Delete("me/sessions/:id")
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Headers("x-user-id") userId: string,
    @Headers("x-session-id") currentSessionId: string,
    @Param("id", ParseUUIDPipe) sessionId: string,
  ) {
    await this.userService.revokeSession(userId, sessionId, currentSessionId);
    return { data: null, message: "Session revoked", statusCode: 200 };
  }

  // Chuẩn hóa response profile để FE luôn nhận permissions/accessProfile như /auth/refresh và /auth/me.
  private async toUserResponse(user: User) {
    const {
      id,
      email,
      name,
      phone,
      role,
      status,
      avatarUrl,
      createdAt,
      updatedAt,
      lastLoginAt,
    } = user;
    const roles = [role];
    const access = await this.accessControlService.buildViewerAccess(
      user,
      roles,
    );

    return {
      id,
      email,
      name,
      phone,
      role,
      roles,
      permissions: access.permissions,
      permissionGrants: access.permissionGrants,
      accessProfile: access.accessProfile,
      status,
      avatarUrl,
      lastLoginAt,
      createdAt,
      updatedAt,
    };
  }
}
