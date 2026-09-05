import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthService, AuthResult } from "./auth.service";
import { IsEmail, IsNotEmpty, IsString, MinLength, IsIn } from "class-validator";

class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsIn(["PATIENT", "DOCTOR", "INDIVIDUAL_USER"])
  @IsNotEmpty()
  role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER";
}

class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto.email, dto.password, dto.role);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto.email, dto.password);
  }
}
