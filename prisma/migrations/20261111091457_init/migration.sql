-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'instructor', 'admin', 'institution');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('graduation', 'specialization', 'masters', 'phd');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('Universidade', 'Faculdade', 'Escola Técnica', 'Centro de Pesquisa', 'Plataforma Online', 'ONG Educacional', 'Outro');

-- CreateEnum
CREATE TYPE "MobileMoneyProvider" AS ENUM ('mpesa', 'emola', 'outro');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'verified', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending', 'documents_uploaded', 'completed');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('alvara', 'credenciamento', 'estatutos', 'endereco', 'nuit', 'diplomas', 'experiencia', 'identidade', 'cv', 'certificacoes', 'comprovante_matricula', 'registroProfissional', 'other');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('follow', 'blocked');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('accepted', 'blocked');

-- CreateEnum
CREATE TYPE "InstructorLinkStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TestimonialSource" AS ENUM ('platform', 'external');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('video', 'audio', 'pdf', 'text', 'quiz', 'assignment');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "SubmissionFormat" AS ENUM ('text', 'file', 'both');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('draft', 'submitted', 'graded', 'late');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('issued', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ReviewEntityType" AS ENUM ('course', 'event', 'instructor');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('scheduled', 'live', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "EventParticipantStatus" AS ENUM ('registered', 'attended', 'cancelled');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('conversation', 'group', 'community');

-- CreateEnum
CREATE TYPE "MessageContextType" AS ENUM ('conversation', 'group', 'community', 'announcement', 'support');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'file', 'link', 'topic_change', 'announcement');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read', 'pending_approval');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('participant', 'member', 'moderator', 'admin', 'owner');

-- CreateEnum
CREATE TYPE "CommunityMembershipType" AS ENUM ('open', 'approval', 'invite_only');

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('active', 'archived', 'suspended');

-- CreateEnum
CREATE TYPE "CommunityBaseRole" AS ENUM ('member', 'moderator', 'admin');

-- CreateEnum
CREATE TYPE "CommunityMemberStatus" AS ENUM ('active', 'muted', 'banned');

-- CreateEnum
CREATE TYPE "CommunityInviteStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('draft', 'published', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('public', 'members', 'restricted');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('discussion', 'question', 'resource', 'announcement', 'assignment');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('active', 'deleted', 'flagged');

-- CreateEnum
CREATE TYPE "PostReactionType" AS ENUM ('like', 'helpful', 'creative', 'confused', 'celebrate', 'insightful');

-- CreateEnum
CREATE TYPE "CommentReactionType" AS ENUM ('like', 'upvote', 'downvote', 'laugh', 'celebrate', 'insightful', 'confused', 'thanks');

-- CreateEnum
CREATE TYPE "PostAttachmentType" AS ENUM ('file', 'link', 'video', 'image', 'document', 'presentation');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('desktop', 'mobile', 'tablet');

-- CreateEnum
CREATE TYPE "ObjectiveLevel" AS ENUM ('basic', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "StudyGroupStatus" AS ENUM ('active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "StudyGroupPrivacy" AS ENUM ('public', 'private', 'invite_only');

-- CreateEnum
CREATE TYPE "StudyGroupRole" AS ENUM ('member', 'leader', 'co-leader', 'moderator');

-- CreateEnum
CREATE TYPE "StudyGroupMemberStatus" AS ENUM ('active', 'muted', 'banned', 'left');

-- CreateEnum
CREATE TYPE "JoinMethod" AS ENUM ('direct', 'invite', 'approval', 'promoted', 'rejoined');

-- CreateEnum
CREATE TYPE "SharedContentType" AS ENUM ('pdf', 'video', 'code', 'link', 'slide', 'image');

-- CreateEnum
CREATE TYPE "GroupMeetingStatus" AS ENUM ('scheduled', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('confirmed', 'declined', 'pending');

-- CreateEnum
CREATE TYPE "GroupTaskStatus" AS ENUM ('pending', 'in_progress', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "TaskAssignmentStatus" AS ENUM ('pending', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('up', 'down');

-- CreateEnum
CREATE TYPE "GroupReportType" AS ENUM ('WEEKLY_ACTIVITY', 'MONTHLY_SUMMARY', 'TASK_COMPLETION', 'TOP_CONTRIBUTORS');

-- CreateEnum
CREATE TYPE "AchievementType" AS ENUM ('TOP_CONTRIBUTOR', 'TASK_COMPLETER', 'DISCUSSION_LEADER', 'RESOURCE_PROVIDER');

-- CreateEnum
CREATE TYPE "ContentReportReason" AS ENUM ('spam', 'inappropriate', 'off_topic', 'other');

-- CreateEnum
CREATE TYPE "ScanContentType" AS ENUM ('post', 'comment', 'resource', 'profile');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('automated', 'manual', 'userReport');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'reviewed', 'actioned', 'falsePositive');

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('free', 'basic', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('active', 'past_due', 'canceled', 'incomplete');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'mobile_method', 'cash', 'international');

-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('visa', 'mastercard', 'amex', 'elo', 'hipercard');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'paid', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('bank_transfer', 'mobile_money', 'digital_wallet', 'internal_credit');

-- CreateEnum
CREATE TYPE "BeneficiaryType" AS ENUM ('instructor', 'institution');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('email', 'chat', 'callback');

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('pending', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('course_started', 'course_completed', 'lesson_completed', 'resource_viewed', 'achievement_earned', 'enrollment', 'group_join', 'group_leave', 'group_role_change', 'content_upload', 'link_shared', 'content_update', 'content_delete', 'content_download', 'meeting_scheduled', 'meeting_attended', 'discussion_started', 'task_created', 'task_completed', 'system_maintenance', 'system_backup', 'admin_user_created', 'admin_user_updated', 'admin_content_created', 'admin_content_updated', 'system_alert');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('course', 'lesson', 'resource', 'achievement', 'event', 'study_group', 'group_content', 'group_meeting', 'discussion_topic', 'group_task');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DONZA_NOTIFICATION', 'USER_REVIEW_REQUIRED', 'USER_APPROVED', 'USER_REJECTED', 'EVENT_REMINDER', 'EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_DELETED', 'EVENT_REGISTRATION', 'EVENT_REGISTRATION_CANCELLED', 'TASK_DEADLINE', 'NEW_MESSAGE', 'COURSE_UPDATE', 'REVIEW_REPLY', 'NEW_MEMBER', 'ROLE_CHANGED', 'MEETING_SCHEDULED', 'TASK_ASSIGNED', 'NEW_FOLLOWER', 'FOLLOWING_UPDATE', 'UNFOLLOWED', 'COURSE_CREATED', 'COURSE_DELETED', 'COURSE_PUBLISHED', 'COURSE_ENROLLMENT', 'COURSE_UNENROLLMENT', 'COURSE_COMPLETION', 'COURSE_APPROVAL', 'COURSE_REJECTION', 'COURSE_MATERIAL_UPDATE', 'COURSE_DEADLINE_REMINDER', 'COURSE_NEW_ANNOUNCEMENT', 'MODULE_UPDATED', 'COMMUNITY_CREATED', 'MEMBER_REQUEST', 'NEW_COMMUNITY_MEMBER', 'NEW_COMMUNITY_POST', 'POST_REACTION', 'NEW_COMMENT', 'COMMENT_REPLY', 'POST_DELETED', 'COMMENT_DELETED', 'NEW_DIRECT_MESSAGE', 'CONVERSATION_READ', 'NEW_CONVERSATION', 'NEW_TICKET', 'STUDY_GROUP_NEW_MESSAGE', 'STUDY_GROUP_TOPIC_CHANGED', 'STUDY_GROUP_MESSAGE_EDITED', 'STUDY_GROUP_MESSAGE_DELETED', 'STUDY_GROUP_MESSAGE_OFF_TOPIC', 'STUDY_GROUP_CONTENT_UPLOADED', 'STUDY_GROUP_LINK_ADDED', 'STUDY_GROUP_CONTENT_UPDATED', 'STUDY_GROUP_CONTENT_DELETED', 'DISCUSSION_TOPIC_CREATED', 'DISCUSSION_TOPIC_UPDATED', 'DISCUSSION_REPLY_ADDED', 'DISCUSSION_REPLY_UPDATED', 'DISCUSSION_REPLY_VOTED', 'STUDY_GROUP_TASK_CREATED', 'STUDY_GROUP_TASK_UPDATED', 'STUDY_GROUP_TASK_DELETED', 'STUDY_GROUP_TASK_ASSIGNED', 'STUDY_GROUP_TASK_STATUS_CHANGED', 'COMMUNITY_UPDATED', 'MEMBER_LEFT_COMMUNITY', 'STUDY_GROUP_INVITE', 'STUDY_GROUP_JOIN_REQUEST', 'STUDY_GROUP_REQUEST_APPROVED', 'STUDY_GROUP_REQUEST_REJECTED', 'STUDY_GROUP_ROLE_CHANGE', 'STUDY_GROUP_REMOVED', 'STUDY_GROUP_UPDATED', 'STUDY_GROUP_DELETED', 'STUDY_GROUP_MEETING_SCHEDULED');

-- CreateTable
CREATE TABLE "users" (
    "userId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'student',
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "educationLevel" "EducationLevel",
    "educationField" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "socialMedia" JSONB NOT NULL DEFAULT '{}',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastLogin" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "notificationPreferences" JSONB NOT NULL DEFAULT '{"email":{"eventReminders":true,"taskDeadlines":true,"newMessages":true,"courseUpdates":false,"reviewReplies":true},"inApp":true}',
    "messagePreferences" JSONB NOT NULL DEFAULT '{"acceptsMessagesFromStudents":false,"acceptsMessagesFromAll":false,"courseRelatedOnly":true,"dailyMessageLimit":5,"allowAttachments":false}',
    "teachingExperience" INTEGER,
    "institutionName" TEXT,
    "institutionType" "InstitutionType",
    "academicPrograms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "website" TEXT,
    "contactPhone" TEXT,
    "nuit" TEXT,
    "legalRepresentative" TEXT,
    "accreditation" TEXT,
    "yearFounded" INTEGER,
    "verificationData" JSONB NOT NULL DEFAULT '{}',
    "rejectionReason" TEXT,
    "reviewedById" UUID,
    "reviewDate" TIMESTAMP(3),
    "taxIdentification" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "mobileMoneyNumber" TEXT,
    "mobileMoneyProvider" "MobileMoneyProvider",
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'pending',
    "kycVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "temp_users" (
    "tempId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'student',
    "verificationToken" TEXT NOT NULL,
    "tokenExpires" TIMESTAMP(3) NOT NULL,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'pending',
    "potentialUsername" TEXT,
    "potentialFullname" TEXT,
    "potentialInstitutionName" TEXT,
    "potentialNuit" TEXT,
    "educationLevel" "EducationLevel",
    "educationField" TEXT,
    "legalRepresentative" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temp_users_pkey" PRIMARY KEY ("tempId")
);

-- CreateTable
CREATE TABLE "tokens" (
    "tokenId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("tokenId")
);

-- CreateTable
CREATE TABLE "user_documents" (
    "docId" UUID NOT NULL,
    "tempUserId" UUID,
    "userId" UUID,
    "documentType" "DocumentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'cloudinary',
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" UUID,
    "reviewDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_documents_pkey" PRIMARY KEY ("docId")
);

-- CreateTable
CREATE TABLE "user_relationships" (
    "relationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "relatedUserId" UUID NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL DEFAULT 'follow',
    "status" "RelationshipStatus" NOT NULL DEFAULT 'accepted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_relationships_pkey" PRIMARY KEY ("relationId")
);

-- CreateTable
CREATE TABLE "institution_instructors" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "message" TEXT,
    "status" "InstructorLinkStatus" NOT NULL DEFAULT 'pending',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "institution_instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "testimonialId" UUID NOT NULL,
    "userId" UUID,
    "content" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "source" "TestimonialSource" NOT NULL DEFAULT 'platform',
    "externalAuthor" TEXT,
    "externalRole" TEXT,
    "externalAvatarUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("testimonialId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notificationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "relatedEntityId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notificationId")
);

-- CreateTable
CREATE TABLE "courses" (
    "courseId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "organizerId" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "shortDescription" VARCHAR(200),
    "coverImageUrl" TEXT,
    "level" "DifficultyLevel" NOT NULL DEFAULT 'beginner',
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "duration" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'Portuguese',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "requirements" TEXT[],
    "learningOutcomes" TEXT[],
    "metrics" JSONB NOT NULL DEFAULT '{"enrollments":0,"completionRate":0,"avgRating":0,"lessonEngagement":{},"studentDemographics":{}}',
    "messageSettings" JSONB NOT NULL DEFAULT '{"studentsCanMessage":true,"createCourseChannel":true}',
    "ratingAverage" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "modules" (
    "moduleId" UUID NOT NULL,
    "courseId" UUID,
    "creatorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("moduleId")
);

-- CreateTable
CREATE TABLE "lessons" (
    "lessonId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "externalResources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mediaUrl" TEXT,
    "duration" INTEGER,
    "order" INTEGER NOT NULL,
    "lessonType" "LessonType" NOT NULL DEFAULT 'video',
    "level" "DifficultyLevel" NOT NULL DEFAULT 'beginner',
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("lessonId")
);

-- CreateTable
CREATE TABLE "user_lessons" (
    "userLessonId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_lessons_pkey" PRIMARY KEY ("userLessonId")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "enrollmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessed" TIMESTAMP(3),
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "rating" INTEGER,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("enrollmentId")
);

-- CreateTable
CREATE TABLE "assignments" (
    "assignmentId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "moduleId" UUID,
    "lessonId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'draft',
    "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT false,
    "latePenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "submissionFormat" "SubmissionFormat" NOT NULL DEFAULT 'both',
    "allowedFileTypes" TEXT[] DEFAULT ARRAY['pdf', 'docx', 'zip']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("assignmentId")
);

-- CreateTable
CREATE TABLE "submissions" (
    "submissionId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "content" TEXT,
    "attachmentUrl" TEXT,
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'draft',
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "certificates" (
    "certificateId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "eventId" UUID,
    "credentialId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" TIMESTAMP(3),
    "hours" DECIMAL(5,1) NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "verificationUrl" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'issued',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("certificateId")
);

-- CreateTable
CREATE TABLE "reviews" (
    "reviewId" UUID NOT NULL,
    "entityType" "ReviewEntityType" NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "eventId" UUID,
    "instructorId" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "instructorReply" TEXT,
    "replyDate" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("reviewId")
);

-- CreateTable
CREATE TABLE "events" (
    "eventId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "location" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "meetingUrl" TEXT,
    "maxParticipants" INTEGER,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "EventStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "registrationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "EventParticipantStatus" NOT NULL DEFAULT 'registered',
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "activities" (
    "activityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "groupId" UUID,
    "courseId" UUID,
    "type" "ActivityType" NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "duration" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("activityId")
);

-- CreateTable
CREATE TABLE "achievements" (
    "achievementId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "type" "AchievementType" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("achievementId")
);

-- CreateTable
CREATE TABLE "conversations" (
    "conversationId" UUID NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'conversation',
    "name" TEXT,
    "description" TEXT,
    "avatar" TEXT,
    "contextId" UUID,
    "creatorId" UUID,
    "settings" JSONB NOT NULL DEFAULT '{"allowImages":true,"allowFiles":true,"requireApproval":false,"onlyAdminsCanPost":false,"maxMessageLength":2000,"isPublic":true}',
    "stats" JSONB NOT NULL DEFAULT '{"messageCount":0,"participantCount":0,"lastActivity":null}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "participants" (
    "participantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contextType" "ConversationType" NOT NULL,
    "contextId" UUID,
    "role" "ParticipantRole" NOT NULL DEFAULT 'participant',
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("participantId")
);

-- CreateTable
CREATE TABLE "messages" (
    "messageId" UUID NOT NULL,
    "senderId" UUID,
    "replyToId" UUID,
    "content" TEXT NOT NULL,
    "contextType" "MessageContextType" NOT NULL DEFAULT 'conversation',
    "contextId" UUID,
    "type" "MessageType" NOT NULL DEFAULT 'text',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "MessageStatus" NOT NULL DEFAULT 'sent',
    "readBy" JSONB NOT NULL DEFAULT '{}',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" UUID,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "message_requests" (
    "requestId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_requests_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "message_limits" (
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "message_limits_pkey" PRIMARY KEY ("userId","date")
);

-- CreateTable
CREATE TABLE "communities" (
    "communityId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" VARCHAR(100),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "coverImage" TEXT,
    "thumbnailImage" TEXT,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "membershipType" "CommunityMembershipType" NOT NULL DEFAULT 'open',
    "status" "CommunityStatus" NOT NULL DEFAULT 'active',
    "socialLinks" JSONB NOT NULL DEFAULT '{}',
    "analytics" JSONB NOT NULL DEFAULT '{"memberCount":0,"postCount":0,"engagementRate":0}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "communities_pkey" PRIMARY KEY ("communityId")
);

-- CreateTable
CREATE TABLE "community_members" (
    "memberId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CommunityBaseRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CommunityMemberStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "community_members_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "community_roles" (
    "roleId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{"managePosts":false,"manageEvents":false,"inviteMembers":false,"removeMembers":false,"editCommunity":false}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_roles_pkey" PRIMARY KEY ("roleId")
);

-- CreateTable
CREATE TABLE "community_member_roles" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "community_member_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_invites" (
    "inviteId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "inviterId" UUID NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "status" "CommunityInviteStatus" NOT NULL DEFAULT 'pending',
    "token" VARCHAR(64),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_invites_pkey" PRIMARY KEY ("inviteId")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "postId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" VARCHAR(200),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "PostStatus" NOT NULL DEFAULT 'draft',
    "visibility" "PostVisibility" NOT NULL DEFAULT 'public',
    "postType" "PostType" NOT NULL DEFAULT 'discussion',
    "difficultyLevel" "DifficultyLevel",
    "isOriginalContent" BOOLEAN NOT NULL DEFAULT true,
    "sourceUrl" VARCHAR(512),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "editHistory" JSONB NOT NULL DEFAULT '[]',
    "lastEditedAt" TIMESTAMP(3),
    "acceptedAnswerId" UUID,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB NOT NULL DEFAULT '{"reactions":{"like":0,"helpful":0,"creative":0,"confused":0,"celebrate":0,"insightful":0},"viewCount":0,"commentCount":0}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "commentId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "parentCommentId" UUID,
    "content" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'active',
    "isAnswer" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("commentId")
);

-- CreateTable
CREATE TABLE "post_reactions" (
    "reactionId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "PostReactionType" NOT NULL DEFAULT 'like',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("reactionId")
);

-- CreateTable
CREATE TABLE "comment_reactions" (
    "reactionId" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "CommentReactionType" NOT NULL DEFAULT 'like',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("reactionId")
);

-- CreateTable
CREATE TABLE "post_views" (
    "viewId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "deviceType" "DeviceType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("viewId")
);

-- CreateTable
CREATE TABLE "post_attachments" (
    "attachmentId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "type" "PostAttachmentType" NOT NULL DEFAULT 'file',
    "title" VARCHAR(100),
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_attachments_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "tags" (
    "tagId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "isSystemTag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("tagId")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "postId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "learning_objectives" (
    "objectiveId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "level" "ObjectiveLevel" NOT NULL DEFAULT 'basic',
    "subjectArea" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_objectives_pkey" PRIMARY KEY ("objectiveId")
);

-- CreateTable
CREATE TABLE "post_objectives" (
    "postId" UUID NOT NULL,
    "objectiveId" UUID NOT NULL,
    "relevance" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "post_objectives_pkey" PRIMARY KEY ("postId","objectiveId")
);

-- CreateTable
CREATE TABLE "study_groups" (
    "groupId" UUID NOT NULL,
    "communityId" UUID,
    "creatorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "meetingSchedule" JSONB,
    "maxMembers" INTEGER,
    "status" "StudyGroupStatus" NOT NULL DEFAULT 'active',
    "privacy" "StudyGroupPrivacy" NOT NULL DEFAULT 'public',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goals" TEXT,
    "inviteCode" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "coverImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("groupId")
);

-- CreateTable
CREATE TABLE "study_group_members" (
    "membershipId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "StudyGroupRole" NOT NULL DEFAULT 'member',
    "previousRole" "StudyGroupRole",
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contributionScore" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "StudyGroupMemberStatus" NOT NULL DEFAULT 'active',
    "mutedUntil" TIMESTAMP(3),
    "joinMethod" "JoinMethod" NOT NULL DEFAULT 'direct',
    "inviteCodeUsed" TEXT,
    "preventiveModeration" JSONB NOT NULL DEFAULT '{"contentFilter":{"enabled":true,"level":"medium"},"rateLimiting":{"postsPerHour":10,"commentsPerHour":20},"newMemberRestrictions":{"contentCreation":false,"duration":"24h"}}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_group_members_pkey" PRIMARY KEY ("membershipId")
);

-- CreateTable
CREATE TABLE "study_group_pending_members" (
    "requestId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "message" TEXT,
    "responseMessage" TEXT,

    CONSTRAINT "study_group_pending_members_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "group_meetings" (
    "meetingId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "meetingUrl" TEXT,
    "recurring" JSONB,
    "status" "GroupMeetingStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_meetings_pkey" PRIMARY KEY ("meetingId")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "participationId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'pending',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("participationId")
);

-- CreateTable
CREATE TABLE "group_tasks" (
    "taskId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "assignerId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "GroupTaskStatus" NOT NULL DEFAULT 'pending',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_tasks_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "assignmentId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedById" UUID,
    "status" "TaskAssignmentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("assignmentId")
);

-- CreateTable
CREATE TABLE "shared_contents" (
    "contentId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileType" "SharedContentType" NOT NULL,
    "externalUrl" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_contents_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "discussion_topics" (
    "topicId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flags" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussion_topics_pkey" PRIMARY KEY ("topicId")
);

-- CreateTable
CREATE TABLE "discussion_replies" (
    "replyId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "isSolution" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussion_replies_pkey" PRIMARY KEY ("replyId")
);

-- CreateTable
CREATE TABLE "reply_votes" (
    "voteId" UUID NOT NULL,
    "replyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "voteType" "VoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_votes_pkey" PRIMARY KEY ("voteId")
);

-- CreateTable
CREATE TABLE "group_reports" (
    "reportId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "generatedById" UUID,
    "type" "GroupReportType" NOT NULL,
    "data" JSONB NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_reports_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "reportId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "topicId" UUID,
    "reason" "ContentReportReason" NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "content_scan_results" (
    "scanId" UUID NOT NULL,
    "contentType" "ScanContentType" NOT NULL,
    "contentId" UUID,
    "scanType" "ScanType" NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flaggedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB,
    "status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_scan_results_pkey" PRIMARY KEY ("scanId")
);

-- CreateTable
CREATE TABLE "moderation_permissions" (
    "permissionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_permissions_pkey" PRIMARY KEY ("permissionId")
);

-- CreateTable
CREATE TABLE "billings" (
    "billingId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "plan" "BillingPlan" NOT NULL DEFAULT 'free',
    "status" "BillingStatus" NOT NULL DEFAULT 'incomplete',
    "paymentMethod" "PaymentMethod",
    "cardLast4" VARCHAR(4),
    "cardBrand" "CardBrand",
    "cardExpMonth" INTEGER,
    "cardExpYear" INTEGER,
    "externalPaymentMethodId" TEXT,
    "exchangeRate" DECIMAL(10,4),
    "originalCurrency" VARCHAR(3) NOT NULL DEFAULT 'MZN',
    "originalAmount" DECIMAL(10,2),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billings_pkey" PRIMARY KEY ("billingId")
);

-- CreateTable
CREATE TABLE "invoices" (
    "invoiceId" UUID NOT NULL,
    "billingId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MZN',
    "platformShare" DECIMAL(10,2),
    "instructorShare" DECIMAL(10,2),
    "institutionShare" DECIMAL(10,2),
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "dueDate" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoiceId")
);

-- CreateTable
CREATE TABLE "payouts" (
    "payoutId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "beneficiaryType" "BeneficiaryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MZN',
    "exchangeRate" DECIMAL(10,4),
    "originalAmount" DECIMAL(10,2),
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "payoutMethod" "PayoutMethod" NOT NULL,
    "externalPayoutId" TEXT,
    "paidAt" TIMESTAMP(3),
    "estimatedArrivalDate" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("payoutId")
);

-- CreateTable
CREATE TABLE "help_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(200),
    "icon" VARCHAR(30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "articleId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'getting-started',
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "excerpt" VARCHAR(200),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "reviewerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("articleId")
);

-- CreateTable
CREATE TABLE "help_feedbacks" (
    "feedbackId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "wasHelpful" BOOLEAN NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_feedbacks_pkey" PRIMARY KEY ("feedbackId")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "requestId" UUID NOT NULL,
    "userId" UUID,
    "updatedById" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactMethod" "ContactMethod" NOT NULL,
    "subject" TEXT,
    "message" TEXT,
    "phone" TEXT,
    "preferredTime" TIMESTAMP(3),
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_role_isVerified_status_idx" ON "users"("role", "isVerified", "status");

-- CreateIndex
CREATE INDEX "users_expertise_idx" ON "users" USING GIN ("expertise");

-- CreateIndex
CREATE UNIQUE INDEX "temp_users_email_key" ON "temp_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "temp_users_verificationToken_key" ON "temp_users"("verificationToken");

-- CreateIndex
CREATE INDEX "temp_users_tokenExpires_idx" ON "temp_users"("tokenExpires");

-- CreateIndex
CREATE INDEX "temp_users_isEmailVerified_idx" ON "temp_users"("isEmailVerified");

-- CreateIndex
CREATE INDEX "temp_users_registrationStatus_idx" ON "temp_users"("registrationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_token_key" ON "tokens"("token");

-- CreateIndex
CREATE INDEX "tokens_userId_idx" ON "tokens"("userId");

-- CreateIndex
CREATE INDEX "tokens_expiresAt_idx" ON "tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_documents_storageKey_key" ON "user_documents"("storageKey");

-- CreateIndex
CREATE INDEX "user_documents_userId_documentType_idx" ON "user_documents"("userId", "documentType");

-- CreateIndex
CREATE INDEX "user_documents_tempUserId_idx" ON "user_documents"("tempUserId");

-- CreateIndex
CREATE INDEX "user_documents_status_idx" ON "user_documents"("status");

-- CreateIndex
CREATE INDEX "user_relationships_relationshipType_status_idx" ON "user_relationships"("relationshipType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_relationships_userId_relatedUserId_key" ON "user_relationships"("userId", "relatedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_instructors_institutionId_instructorId_key" ON "institution_instructors"("institutionId", "instructorId");

-- CreateIndex
CREATE INDEX "testimonials_status_idx" ON "testimonials"("status");

-- CreateIndex
CREATE INDEX "testimonials_featured_idx" ON "testimonials"("featured");

-- CreateIndex
CREATE INDEX "testimonials_userId_idx" ON "testimonials"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_scheduledAt_idx" ON "notifications"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_instructorId_idx" ON "courses"("instructorId");

-- CreateIndex
CREATE INDEX "courses_category_idx" ON "courses"("category");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "courses_title_idx" ON "courses"("title");

-- CreateIndex
CREATE INDEX "modules_courseId_order_idx" ON "modules"("courseId", "order");

-- CreateIndex
CREATE INDEX "lessons_moduleId_order_idx" ON "lessons"("moduleId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "user_lessons_userId_lessonId_key" ON "user_lessons"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "enrollments_courseId_idx" ON "enrollments"("courseId");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- CreateIndex
CREATE INDEX "assignments_courseId_idx" ON "assignments"("courseId");

-- CreateIndex
CREATE INDEX "submissions_assignmentId_userId_idx" ON "submissions"("assignmentId", "userId");

-- CreateIndex
CREATE INDEX "submissions_userId_idx" ON "submissions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_credentialId_key" ON "certificates"("credentialId");

-- CreateIndex
CREATE INDEX "certificates_userId_idx" ON "certificates"("userId");

-- CreateIndex
CREATE INDEX "certificates_courseId_idx" ON "certificates"("courseId");

-- CreateIndex
CREATE INDEX "certificates_eventId_idx" ON "certificates"("eventId");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "reviews_entityType_courseId_idx" ON "reviews"("entityType", "courseId");

-- CreateIndex
CREATE INDEX "reviews_entityType_eventId_idx" ON "reviews"("entityType", "eventId");

-- CreateIndex
CREATE INDEX "reviews_entityType_instructorId_idx" ON "reviews"("entityType", "instructorId");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- CreateIndex
CREATE INDEX "events_organizerId_idx" ON "events"("organizerId");

-- CreateIndex
CREATE INDEX "events_status_startDate_idx" ON "events"("status", "startDate");

-- CreateIndex
CREATE INDEX "event_participants_eventId_idx" ON "event_participants"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_userId_eventId_key" ON "event_participants"("userId", "eventId");

-- CreateIndex
CREATE INDEX "activities_userId_idx" ON "activities"("userId");

-- CreateIndex
CREATE INDEX "activities_groupId_idx" ON "activities"("groupId");

-- CreateIndex
CREATE INDEX "activities_createdAt_idx" ON "activities"("createdAt");

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "activities_entityType_entityId_idx" ON "activities"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "achievements_membershipId_idx" ON "achievements"("membershipId");

-- CreateIndex
CREATE INDEX "conversations_type_isActive_idx" ON "conversations"("type", "isActive");

-- CreateIndex
CREATE INDEX "conversations_contextId_idx" ON "conversations"("contextId");

-- CreateIndex
CREATE INDEX "participants_userId_contextType_idx" ON "participants"("userId", "contextType");

-- CreateIndex
CREATE UNIQUE INDEX "participants_contextType_contextId_userId_key" ON "participants"("contextType", "contextId", "userId");

-- CreateIndex
CREATE INDEX "message_context_index" ON "messages"("contextType", "contextId", "createdAt");

-- CreateIndex
CREATE INDEX "message_sender_index" ON "messages"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "message_search_index" ON "messages"("contextType", "contextId", "status");

-- CreateIndex
CREATE INDEX "message_requests_receiverId_status_idx" ON "message_requests"("receiverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "communities_name_key" ON "communities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_tags_idx" ON "communities" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "community_members_role_idx" ON "community_members"("role");

-- CreateIndex
CREATE UNIQUE INDEX "community_members_communityId_userId_key" ON "community_members"("communityId", "userId");

-- CreateIndex
CREATE INDEX "community_roles_communityId_idx" ON "community_roles"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "community_member_roles_memberId_roleId_key" ON "community_member_roles"("memberId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "community_invites_token_key" ON "community_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "community_invites_communityId_email_key" ON "community_invites"("communityId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "community_posts_acceptedAnswerId_key" ON "community_posts"("acceptedAnswerId");

-- CreateIndex
CREATE INDEX "community_posts_communityId_idx" ON "community_posts"("communityId");

-- CreateIndex
CREATE INDEX "community_posts_authorId_idx" ON "community_posts"("authorId");

-- CreateIndex
CREATE INDEX "community_posts_isPinned_idx" ON "community_posts"("isPinned");

-- CreateIndex
CREATE INDEX "community_posts_postType_idx" ON "community_posts"("postType");

-- CreateIndex
CREATE INDEX "community_posts_status_idx" ON "community_posts"("status");

-- CreateIndex
CREATE INDEX "post_comments_postId_idx" ON "post_comments"("postId");

-- CreateIndex
CREATE INDEX "post_comments_authorId_idx" ON "post_comments"("authorId");

-- CreateIndex
CREATE INDEX "post_comments_parentCommentId_idx" ON "post_comments"("parentCommentId");

-- CreateIndex
CREATE INDEX "post_reactions_userId_idx" ON "post_reactions"("userId");

-- CreateIndex
CREATE INDEX "post_reactions_type_idx" ON "post_reactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "post_reactions_postId_userId_key" ON "post_reactions"("postId", "userId");

-- CreateIndex
CREATE INDEX "comment_reactions_userId_idx" ON "comment_reactions"("userId");

-- CreateIndex
CREATE INDEX "comment_reactions_type_idx" ON "comment_reactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reactions_commentId_userId_key" ON "comment_reactions"("commentId", "userId");

-- CreateIndex
CREATE INDEX "post_views_postId_idx" ON "post_views"("postId");

-- CreateIndex
CREATE INDEX "post_views_userId_idx" ON "post_views"("userId");

-- CreateIndex
CREATE INDEX "post_views_createdAt_idx" ON "post_views"("createdAt");

-- CreateIndex
CREATE INDEX "post_attachments_postId_idx" ON "post_attachments"("postId");

-- CreateIndex
CREATE INDEX "post_attachments_type_idx" ON "post_attachments"("type");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "tags_isSystemTag_idx" ON "tags"("isSystemTag");

-- CreateIndex
CREATE INDEX "learning_objectives_subjectArea_idx" ON "learning_objectives"("subjectArea");

-- CreateIndex
CREATE INDEX "learning_objectives_level_idx" ON "learning_objectives"("level");

-- CreateIndex
CREATE UNIQUE INDEX "study_groups_inviteCode_key" ON "study_groups"("inviteCode");

-- CreateIndex
CREATE INDEX "study_groups_communityId_idx" ON "study_groups"("communityId");

-- CreateIndex
CREATE INDEX "study_groups_creatorId_idx" ON "study_groups"("creatorId");

-- CreateIndex
CREATE INDEX "study_groups_tags_idx" ON "study_groups" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "study_group_members_role_idx" ON "study_group_members"("role");

-- CreateIndex
CREATE INDEX "study_group_members_status_idx" ON "study_group_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "study_group_members_groupId_userId_key" ON "study_group_members"("groupId", "userId");

-- CreateIndex
CREATE INDEX "study_group_pending_members_status_idx" ON "study_group_pending_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "study_group_pending_members_groupId_userId_key" ON "study_group_pending_members"("groupId", "userId");

-- CreateIndex
CREATE INDEX "group_meetings_groupId_idx" ON "group_meetings"("groupId");

-- CreateIndex
CREATE INDEX "group_meetings_startTime_idx" ON "group_meetings"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "group_tasks_groupId_idx" ON "group_tasks"("groupId");

-- CreateIndex
CREATE INDEX "group_tasks_status_idx" ON "group_tasks"("status");

-- CreateIndex
CREATE INDEX "group_tasks_deadline_idx" ON "group_tasks"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_taskId_userId_key" ON "task_assignments"("taskId", "userId");

-- CreateIndex
CREATE INDEX "shared_contents_groupId_fileType_idx" ON "shared_contents"("groupId", "fileType");

-- CreateIndex
CREATE INDEX "discussion_topics_groupId_idx" ON "discussion_topics"("groupId");

-- CreateIndex
CREATE INDEX "discussion_topics_isPinned_idx" ON "discussion_topics"("isPinned");

-- CreateIndex
CREATE INDEX "discussion_replies_topicId_idx" ON "discussion_replies"("topicId");

-- CreateIndex
CREATE INDEX "discussion_replies_isSolution_idx" ON "discussion_replies"("isSolution");

-- CreateIndex
CREATE UNIQUE INDEX "reply_votes_replyId_userId_key" ON "reply_votes"("replyId", "userId");

-- CreateIndex
CREATE INDEX "group_reports_groupId_type_idx" ON "group_reports"("groupId", "type");

-- CreateIndex
CREATE INDEX "content_reports_topicId_idx" ON "content_reports"("topicId");

-- CreateIndex
CREATE INDEX "content_reports_resolved_idx" ON "content_reports"("resolved");

-- CreateIndex
CREATE INDEX "content_scan_results_contentType_contentId_idx" ON "content_scan_results"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "content_scan_results_status_idx" ON "content_scan_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_permissions_role_key" ON "moderation_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "billings_externalId_key" ON "billings"("externalId");

-- CreateIndex
CREATE INDEX "billings_institutionId_idx" ON "billings"("institutionId");

-- CreateIndex
CREATE INDEX "billings_status_idx" ON "billings"("status");

-- CreateIndex
CREATE INDEX "invoices_billingId_idx" ON "invoices"("billingId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_externalId_idx" ON "invoices"("externalId");

-- CreateIndex
CREATE INDEX "payouts_beneficiaryId_idx" ON "payouts"("beneficiaryId");

-- CreateIndex
CREATE INDEX "payouts_invoiceId_idx" ON "payouts"("invoiceId");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "payouts_payoutMethod_idx" ON "payouts"("payoutMethod");

-- CreateIndex
CREATE INDEX "payouts_createdAt_idx" ON "payouts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "help_categories_name_key" ON "help_categories"("name");

-- CreateIndex
CREATE INDEX "help_categories_displayOrder_idx" ON "help_categories"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");

-- CreateIndex
CREATE INDEX "help_articles_category_idx" ON "help_articles"("category");

-- CreateIndex
CREATE INDEX "help_articles_rating_idx" ON "help_articles"("rating");

-- CreateIndex
CREATE INDEX "help_feedbacks_articleId_idx" ON "help_feedbacks"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "help_feedbacks_userId_articleId_key" ON "help_feedbacks"("userId", "articleId");

-- CreateIndex
CREATE INDEX "contact_requests_status_idx" ON "contact_requests"("status");

-- CreateIndex
CREATE INDEX "contact_requests_contactMethod_idx" ON "contact_requests"("contactMethod");

-- CreateIndex
CREATE INDEX "contact_requests_userId_idx" ON "contact_requests"("userId");

-- CreateIndex
CREATE INDEX "contact_requests_createdAt_idx" ON "contact_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_tempUserId_fkey" FOREIGN KEY ("tempUserId") REFERENCES "temp_users"("tempId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_relationships" ADD CONSTRAINT "user_relationships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_relationships" ADD CONSTRAINT "user_relationships_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_instructors" ADD CONSTRAINT "institution_instructors_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_instructors" ADD CONSTRAINT "institution_instructors_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("moduleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lessons" ADD CONSTRAINT "user_lessons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lessons" ADD CONSTRAINT "user_lessons_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("lessonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("moduleId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("lessonId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("assignmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("eventId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "study_group_members"("membershipId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("messageId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_limits" ADD CONSTRAINT "message_limits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("communityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_roles" ADD CONSTRAINT "community_roles_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("communityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_member_roles" ADD CONSTRAINT "community_member_roles_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "community_members"("memberId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_member_roles" ADD CONSTRAINT "community_member_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "community_roles"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("communityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("communityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_acceptedAnswerId_fkey" FOREIGN KEY ("acceptedAnswerId") REFERENCES "post_comments"("commentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "post_comments"("commentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "post_comments"("commentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("tagId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_objectives" ADD CONSTRAINT "post_objectives_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_objectives" ADD CONSTRAINT "post_objectives_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "learning_objectives"("objectiveId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("communityId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_pending_members" ADD CONSTRAINT "study_group_pending_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_pending_members" ADD CONSTRAINT "study_group_pending_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_pending_members" ADD CONSTRAINT "study_group_pending_members_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meetings" ADD CONSTRAINT "group_meetings_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meetings" ADD CONSTRAINT "group_meetings_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "group_meetings"("meetingId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_assignerId_fkey" FOREIGN KEY ("assignerId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "group_tasks"("taskId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_contents" ADD CONSTRAINT "shared_contents_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_contents" ADD CONSTRAINT "shared_contents_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "discussion_topics"("topicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_votes" ADD CONSTRAINT "reply_votes_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "discussion_replies"("replyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_votes" ADD CONSTRAINT "reply_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_reports" ADD CONSTRAINT "group_reports_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_reports" ADD CONSTRAINT "group_reports_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "discussion_topics"("topicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billings" ADD CONSTRAINT "billings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "billings"("billingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("invoiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_category_fkey" FOREIGN KEY ("category") REFERENCES "help_categories"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_feedbacks" ADD CONSTRAINT "help_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_feedbacks" ADD CONSTRAINT "help_feedbacks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "help_articles"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
