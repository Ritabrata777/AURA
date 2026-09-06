import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { AiService } from './ai.service';
import { SendChatMessageDto, ChatResponseDto, HealthContextDto } from './dto/chat.dto';

@Controller('ai')
@UseGuards(AuthGuard('jwt'))
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * POST /api/ai/chat
   * Send a message to the AI Health Companion
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SendChatMessageDto,
  ): Promise<ChatResponseDto> {
    try {
      const userId = user.id;
      
      // Validate that user is an individual user
      const individualUserId = await this.aiService.validateIndividualUser(userId);

      this.logger.log(`AI chat request from individual user: ${individualUserId}`);

      // Get AI response
      const response = await this.aiService.chat(
        individualUserId,
        body.message,
        body.conversationHistory || [],
      );

      return {
        success: true,
        message: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error('Error in AI chat endpoint:', error);
      
      return {
        success: false,
        message: error?.message || 'Sorry, I couldn\'t process that right now. Please try again.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/ai/health-context
   * Get current health context for the user
   */
  @Get('health-context')
  @HttpCode(HttpStatus.OK)
  async getHealthContext(@CurrentUser() user: AuthenticatedUser): Promise<HealthContextDto> {
    try {
      const userId = user.id;
      
      // Validate that user is an individual user
      const individualUserId = await this.aiService.validateIndividualUser(userId);

      this.logger.log(`Health context request from individual user: ${individualUserId}`);

      return await this.aiService.getHealthContext(individualUserId);
    } catch (error) {
      this.logger.error('Error fetching health context:', error);
      throw error;
    }
  }
}
