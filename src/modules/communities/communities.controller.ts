import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ALLOWED_MIME, MAX_FILE_SIZE, UPLOAD_POLICIES } from '@/common/config/upload.config';
import { CurrentUser, OptionalAuth, RequireApproved } from '@/common/decorators/auth.decorators';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import type { AuthUser } from '@/common/types/auth-user';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto, ListCommunitiesQueryDto, UpdateCommunityDto } from './dto/community.dto';

const imagesInterceptor = () =>
  FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }, { name: 'thumbnailImage', maxCount: 1 }], {
    limits: { fileSize: MAX_FILE_SIZE.COMMUNITY_IMAGE, files: 2 },
    fileFilter: (_req, file, cb) =>
      (ALLOWED_MIME.communityImages as readonly string[]).includes(file.mimetype)
        ? cb(null, true)
        : cb(new BadRequestException('As imagens devem ser JPEG, PNG, WEBP ou GIF'), false),
  });
const imagesPipe = () => new FileValidationPipe({ ...UPLOAD_POLICIES.communityImages, required: false });
type Files = { coverImage?: Express.Multer.File[]; thumbnailImage?: Express.Multer.File[] };

/** Rotas estáticas (`me`) antes de `:idOrSlug`. */
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communities: CommunitiesService) {}

  @OptionalAuth() @Get()
  list(@CurrentUser() user: AuthUser | undefined, @Query() q: ListCommunitiesQueryDto) {
    return this.communities.list(q, user);
  }

  @Get('me')
  mine(@CurrentUser('userId') userId: string, @Query() q: ListCommunitiesQueryDto) {
    return this.communities.mine(userId, q);
  }

  @RequireApproved() @Post() @UseInterceptors(imagesInterceptor())
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommunityDto, @UploadedFiles(imagesPipe()) files: Files) {
    return this.communities.create(user, dto, files);
  }

  /** UUID ou slug. */
  @OptionalAuth() @Get(':idOrSlug')
  detail(@CurrentUser() user: AuthUser | undefined, @Param('idOrSlug') idOrSlug: string) {
    return this.communities.getDetail(idOrSlug, user);
  }

  @Patch(':communityId') @UseInterceptors(imagesInterceptor())
  update(
    @CurrentUser() user: AuthUser,
    @Param('communityId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunityDto,
    @UploadedFiles(imagesPipe()) files: Files,
  ) {
    return this.communities.update(user, id, dto, files);
  }

  @Delete(':communityId')
  remove(@CurrentUser() user: AuthUser, @Param('communityId', ParseUUIDPipe) id: string) {
    return this.communities.remove(user, id);
  }
}
