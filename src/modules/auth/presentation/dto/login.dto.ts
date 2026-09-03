import { IsEmail, IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({
    example: "user@example.com",
    description: "Registered email address",
  })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "Password1", description: "Account password" })
  @IsString()
  @IsNotEmpty()
  password: string;
}
