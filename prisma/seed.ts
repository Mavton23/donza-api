import 'dotenv/config';
import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: adapter,
});


/**
 * Permissões por cargo de grupo. ATENÇÃO: são valores-padrão de arranque.
 * Se já tens dados reais na tabela `moderation_permissions` do Express, migra-os em vez de usar estes
 * (nota: os nomes de cargo passam de 'co-leader' para 'co_leader', como no enum StudyGroupRole).
 */
const PERMISSIONS: Record<string, Record<string, Record<string, boolean>>> = {
  member: {
    topics: { create: true, edit: false, delete: false, pin: false, close: false },
    content: { upload: true, edit: false, delete: false },
    tasks: { create: false, edit: false, delete: false, assign: false },
    meetings: { schedule: false, edit: false, cancel: false },
    members: { invite: false, approve: false, mute: false, ban: false, changeRole: false },
    group: { edit: false, delete: false, archive: false },
  },
  moderator: {
    topics: { create: true, edit: true, delete: true, pin: true, close: true },
    content: { upload: true, edit: true, delete: true },
    tasks: { create: true, edit: true, delete: false, assign: true },
    meetings: { schedule: true, edit: true, cancel: false },
    members: { invite: true, approve: true, mute: true, ban: false, changeRole: false },
    group: { edit: false, delete: false, archive: false },
  },
  co_leader: {
    topics: { create: true, edit: true, delete: true, pin: true, close: true },
    content: { upload: true, edit: true, delete: true },
    tasks: { create: true, edit: true, delete: true, assign: true },
    meetings: { schedule: true, edit: true, cancel: true },
    members: { invite: true, approve: true, mute: true, ban: true, changeRole: false },
    group: { edit: true, delete: false, archive: false },
  },
  leader: {
    topics: { create: true, edit: true, delete: true, pin: true, close: true },
    content: { upload: true, edit: true, delete: true },
    tasks: { create: true, edit: true, delete: true, assign: true },
    meetings: { schedule: true, edit: true, cancel: true },
    members: { invite: true, approve: true, mute: true, ban: true, changeRole: true },
    group: { edit: true, delete: true, archive: true },
  },
};

async function main() {
  for (const [role, permissions] of Object.entries(PERMISSIONS)) {
    await prisma.moderationPermission.upsert({
      where: { role },
      create: { role, permissions: permissions as Prisma.InputJsonValue },
      update: {}, // não sobrescreve ajustes feitos depois
    });
  }
  console.log(`Permissões de moderação: ${Object.keys(PERMISSIONS).length} cargos`);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD não definidos: administrador não criado.');
    return;
  }
  if (password.length < 12) throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres');

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`Administrador ${email} já existe.`);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      username: process.env.ADMIN_USERNAME ?? 'admin_donza',
      password: await bcrypt.hash(password, 12),
      role: UserRole.admin,
      status: UserStatus.approved,
      isVerified: true,
      verifiedAt: new Date(),
      fullName: 'Administrador',
      profileCompleted: true,
    },
  });
  console.log(`Administrador ${email} criado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
