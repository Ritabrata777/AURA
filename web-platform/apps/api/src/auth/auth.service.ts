import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthResult {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
    patientId?: string;
    doctorId?: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string, role: "PATIENT" | "DOCTOR"): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        patient: role === "PATIENT" ? { create: {} } : undefined,
        doctor: role === "DOCTOR" ? { create: {} } : undefined,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });

    return this.generateAuthResult(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        patient: true,
        doctor: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.generateAuthResult(user);
  }

  private generateAuthResult(user: any): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        patientId: user.patient?.id,
        doctorId: user.doctor?.id,
      },
    };
  }

  async validateJwt(token: string): Promise<{ id: string; email: string; role: string; patient?: any; doctor?: any } | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          patient: true,
          doctor: true,
        },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        patient: user.patient,
        doctor: user.doctor,
      };
    } catch {
      return null;
    }
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patient: {
          include: {
            devices: {
              include: {
                device: true,
              },
            },
          },
        },
        doctor: true,
      },
    });
  }
}
