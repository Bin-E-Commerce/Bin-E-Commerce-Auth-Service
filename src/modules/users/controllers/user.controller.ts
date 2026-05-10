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
import { UserService } from "../services/user.service";
import { UpdateProfileDto } from "../dto/update-profile.dto";
import { CreateAddressDto } from "../dto/create-address.dto";
import { UpdateAddressDto } from "../dto/update-address.dto";

@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  async getProfile(@Headers("x-user-id") userId: string) {
    const user = await this.userService.getProfile(userId);
    return { data: user, message: "Profile retrieved", statusCode: 200 };
  }

  @Put("me")
  async updateProfile(
    @Headers("x-user-id") userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.userService.updateProfile(userId, dto);
    return { data: user, message: "Profile updated", statusCode: 200 };
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
}
