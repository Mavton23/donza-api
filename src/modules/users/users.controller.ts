import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { ALLOWED_MIME, MAX_FILE_SIZE, UPLOAD_POLICIES } from '@/common/config/upload.config';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me/profile')
  completeProfile(@CurrentUser('userId') userId: string, @Body() dto: CompleteProfileDto) {
    return this.users.completeProfile(userId, dto);
  }

  /** multipart/form-data, campo `avatar`. Substitui a estratégia avatarUpload. */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_FILE_SIZE.AVATAR, files: 1 },
      fileFilter: (_req, file, cb) =>
        (ALLOWED_MIME.avatar as readonly string[]).includes(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('Apenas imagens (JPEG, PNG, WEBP) são permitidas para avatar'), false),
    }),
  )
  uploadAvatar(
    @CurrentUser('userId') userId: string,
    @UploadedFile(new FileValidationPipe({ ...UPLOAD_POLICIES.avatar, required: true })) file: Express.Multer.File,
  ) {
    return this.users.updateAvatar(userId, file);
  }
}
