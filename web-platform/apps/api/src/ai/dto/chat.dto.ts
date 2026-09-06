import { IsString, IsNotEmpty, MaxLength, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}

export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @IsOptional()
  conversationHistory?: ChatMessageDto[];
}

export class ChatResponseDto {
  success: boolean;
  message: string;
  timestamp: string;
}

export class HealthContextDto {
  timeWindow: string;
  heartRate: {
    current: number | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    trend: 'stable' | 'increasing' | 'decreasing' | 'unknown';
  };
  spo2: {
    current: number | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    trend: 'stable' | 'increasing' | 'decreasing' | 'unknown';
  };
  temperature: {
    current: number | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    trend: 'stable' | 'increasing' | 'decreasing' | 'unknown';
  };
  ecg: {
    available: boolean;
    recording: boolean;
    lastSessionAt: string | null;
  };
  device: {
    online: boolean;
    lastSeen: string | null;
    deviceId: string | null;
  };
}
