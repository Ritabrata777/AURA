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

    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        patient: true,
        doctor: true,
        individualUser: true,
      },
    });

    if (user) {
      // User exists - add the new role if they don't have it
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        throw new UnauthorizedException("Invalid password for existing account");
      }

      // Check if they already have this role
      if (
        (role === "PATIENT" && user.patient) ||
        (role === "DOCTOR" && user.doctor) ||
        (role === "INDIVIDUAL_USER" && user.individualUser)
      ) {
        throw new ConflictException(`You already have the ${role} role. Please login instead.`);
      }

      // Add the new role
      if (role === "PATIENT") {
        await this.prisma.patient.create({
          data: { userId: user.id },
        });
      } else if (role === "DOCTOR") {
        await this.prisma.doctor.create({
          data: { userId: user.id },
        });
      } else if (role === "INDIVIDUAL_USER") {
        await this.prisma.individualUser.create({
          data: { userId: user.id },
        });
      }

      // Fetch updated user
      user = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: {
          patient: true,
          doctor: true,
          individualUser: true,
        },
      });
    } else {
      // New user - create with the specified role
      const passwordHash = await bcrypt.hash(password, 10);

      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role, // Default role
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
    }

    return this.generateAuthResult(user!, role);
  }

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async login(email: string, password: string, role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER"): Promise<AuthResult> {
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

    // Check if user has the requested role
    if (
      (role === "PATIENT" && !user.patient) ||
      (role === "DOCTOR" && !user.doctor) ||
      (role === "INDIVIDUAL_USER" && !user.individualUser)
    ) {
      throw new UnauthorizedException(`You don't have access as ${role}. Please register for this role first.`);
    }

    return this.generateAuthResult(user, role);
  }

  private generateAuthResult(user: any, activeRole: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER"): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: activeRole, // Use the selected role, not user.role
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: activeRole,
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
