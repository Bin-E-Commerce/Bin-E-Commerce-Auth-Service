import { IsEmail, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterVerifyDto {
  @ApiProperty({
    example: "user@example.com",
    description: "Email used during registration",
  })
  @IsEmail()
  identifier: string;

  @ApiProperty({
    example: "123456",
    description: "6-digit OTP sent to email",
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  otp: string;
}
