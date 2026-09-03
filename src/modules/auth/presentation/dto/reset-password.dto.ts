import {
  IsEmail,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from "class-validator";

export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(255)
  identifier: string; // mặc định là email, nhưng có thể mở rộng để hỗ trợ username hoặc phone sau này nếu cần

  @IsString()
  @Matches(/^\d{6}$/, { message: "OTP must be 6 digits" })
  otp: string; // OTP 6 chữ số được gửi qua email trong bước forgot-password

  // Mật khẩu mới phải có độ dài từ 8 đến 128 ký tự,
  // chứa ít nhất một chữ hoa và một chữ số để đảm bảo tính bảo mật.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message:
      "Password must contain at least one uppercase letter and one digit",
  })
  newPassword: string;
}
