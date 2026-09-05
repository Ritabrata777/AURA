import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { Doctor, IndividualUser, Patient, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  patient: Patient | null;
  doctor: Doctor | null;
  individualUser: IndividualUser | null;
}

export interface AuthResult {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
    patientId?: string;
    doctorId?: string;
    individualUserId?: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER",
  ): Promise<AuthResult> {
    const normalizedEmail = AuthService.normalizeEmail(email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role,
        patient: role === "PATIENT" ? { create: {} } : undefined,
        doctor: role === "DOCTOR" ? { create: {} } : undefined,
        individualUser: role === "INDIVIDUAL_USER" ? { create: {} } : undefined,
      },
      include: {
        patient: true,
        doctor: true,
        individualUser: true,
      },
    });

    return this.generateAuthResult(user);
  }

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: AuthService.normalizeEmail(email) },
      include: {
        patient: true,
        doctor: true,
        individualUser: true,
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
        individualUserId: user.individualUser?.id,
      },
    };
  }

  async validateJwt(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return await this.getAuthenticatedUser(payload.sub);
    } catch {
      return null;
    }
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patient: true,
        doctor: true,
        individualUser: true,
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
      individualUser: user.individualUser,
    };
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patient: {
          include: {
            devices: { include: { device: true } },
          },
        },
        doctor: true,
        individualUser: {
          include: {
            devices: { include: { device: true } },
          },
        },
      },
    });
  }
}
