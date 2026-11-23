/**
 * Seed de DEMONSTRAÇÃO para testar a Donza localmente (dados fictícios, em português).
 *
 *   npx ts-node prisma/seed-demo.ts            # cria/actualiza os dados (idempotente)
 *   npx ts-node prisma/seed-demo.ts --reset    # apaga primeiro os dados de demonstração e recria
 *
 * Todos os utilizadores usam a palavra-passe DEMO_PASSWORD (por omissão: Donza#2026pass).
 * Recusa correr com NODE_ENV=production (use ALLOW_DEMO_SEED=true para forçar, por sua conta e risco).
 * Complementa o `prisma/seed.ts` (permissões de moderação e administrador real); não o substitui.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: adapter,
});

const PASSWORD = process.env.DEMO_PASSWORD ?? 'Donza#2026pass';
const DOMAIN = 'donza.test';
const RESET = process.argv.includes('--reset');
const DAY = 86_400_000;
const inDays = (n: number, hour = 10) => { const d = new Date(Date.now() + n * DAY); d.setHours(hour, 0, 0, 0); return d; };

/** Mesmas permissões-padrão de `prisma/seed.ts` (não sobrescreve ajustes existentes). */
const PERMISSIONS: Record<string, Record<string, Record<string, boolean>>> = {
  member: { topics: { create: true, edit: false, delete: false, pin: false, close: false }, content: { upload: true, edit: false, delete: false }, tasks: { create: false, edit: false, delete: false, assign: false }, meetings: { schedule: false, edit: false, cancel: false }, members: { invite: false, approve: false, mute: false, ban: false, changeRole: false }, group: { edit: false, delete: false, archive: false } },
  moderator: { topics: { create: true, edit: true, delete: true, pin: true, close: true }, content: { upload: true, edit: true, delete: true }, tasks: { create: true, edit: true, delete: false, assign: true }, meetings: { schedule: true, edit: true, cancel: false }, members: { invite: true, approve: true, mute: true, ban: false, changeRole: false }, group: { edit: false, delete: false, archive: false } },
  co_leader: { topics: { create: true, edit: true, delete: true, pin: true, close: true }, content: { upload: true, edit: true, delete: true }, tasks: { create: true, edit: true, delete: true, assign: true }, meetings: { schedule: true, edit: true, cancel: true }, members: { invite: true, approve: true, mute: true, ban: true, changeRole: false }, group: { edit: true, delete: false, archive: false } },
  leader: { topics: { create: true, edit: true, delete: true, pin: true, close: true }, content: { upload: true, edit: true, delete: true }, tasks: { create: true, edit: true, delete: true, assign: true }, meetings: { schedule: true, edit: true, cancel: true }, members: { invite: true, approve: true, mute: true, ban: true, changeRole: true }, group: { edit: true, delete: true, archive: true } },
};

type UserDef = { username: string; role: 'admin' | 'instructor' | 'institution' | 'student'; status?: 'approved' | 'pending'; extra?: Partial<Prisma.UserUncheckedCreateInput> };
const USERS: UserDef[] = [
  { username: 'admin', role: 'admin', extra: { fullName: 'Administrador Donza' } },
  { username: 'ana.mestra', role: 'instructor', extra: { fullName: 'Ana Mestra', bio: 'Professora de matemática com 12 anos de experiência.', expertise: ['Matemática', 'Física', 'Estatística'] } },
  { username: 'bruno.lima', role: 'instructor', extra: { fullName: 'Bruno Lima', bio: 'Engenheiro de software e formador em dados e web.', expertise: ['Programação', 'Dados', 'Web'] } },
  { username: 'instituto.alfa', role: 'institution', extra: { institutionName: 'Instituto Alfa', bio: 'Centro de formação técnica em Maputo.' } },
  { username: 'aluno.um', role: 'student', extra: { fullName: 'Carlos Aluno' } },
  { username: 'aluno.dois', role: 'student', extra: { fullName: 'Marta Aluna', isPrivate: true } },
  { username: 'aluno.tres', role: 'student', extra: { fullName: 'Joana Estudante' } },
  { username: 'aluno.quatro', role: 'student', extra: { fullName: 'Tiago Aprendiz' } },
  { username: 'inst.pendente', role: 'instructor', status: 'pending', extra: { fullName: 'Rita Pendente', teachingExperience: 4, expertise: ['Física'] } },
  { username: 'org.pendente', role: 'institution', status: 'pending', extra: { institutionName: 'Instituto Pendente' } },
];

const COURSES = [
  { title: 'Matemática Essencial', slug: 'matematica-essencial', category: 'Matemática', level: 'beginner', price: 0, by: 'ana.mestra', hours: 12 },
  { title: 'Física para o Ensino Médio', slug: 'fisica-ensino-medio', category: 'Ciências', level: 'intermediate', price: 1500, by: 'ana.mestra', hours: 20 },
  { title: 'Estatística Aplicada', slug: 'estatistica-aplicada', category: 'Matemática', level: 'intermediate', price: 900, by: 'ana.mestra', hours: 16 },
  { title: 'Introdução à Programação', slug: 'intro-programacao', category: 'Tecnologia', level: 'beginner', price: 0, by: 'bruno.lima', hours: 14 },
  { title: 'Análise de Dados com Python', slug: 'dados-python', category: 'Tecnologia', level: 'advanced', price: 3600, by: 'bruno.lima', hours: 30 },
  { title: 'Desenvolvimento Web Moderno', slug: 'web-moderno', category: 'Tecnologia', level: 'intermediate', price: 2400, by: 'bruno.lima', hours: 28 },
] as const;

async function resetDemo() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { userId: true } });
  const ids = users.map((u) => u.userId);
  if (!ids.length) return;
  console.log(`--reset: a apagar dados de ${ids.length} utilizadores de demonstração…`);
  // O cascade do esquema remove o conteúdo ligado a estes utilizadores; os que não têm cascade são tratados antes.
  await prisma.communityMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.community.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.studyGroup.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.event.deleteMany({ where: { organizerId: { in: ids } } });
  await prisma.course.deleteMany({ where: { instructorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { userId: { in: ids } } });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Seed de demonstração recusado em produção (defina ALLOW_DEMO_SEED=true para forçar).');
  }
  if (PASSWORD.length < 12) throw new Error('DEMO_PASSWORD deve ter pelo menos 12 caracteres');
  if (RESET) await resetDemo();

  // ── Permissões de moderação ──
  for (const [role, permissions] of Object.entries(PERMISSIONS)) {
    await prisma.moderationPermission.upsert({ where: { role }, create: { role, permissions: permissions as Prisma.InputJsonValue }, update: {} });
  }

  // ── Utilizadores ──
  const hash = await bcrypt.hash(PASSWORD, 10);
  const U: Record<string, { userId: string }> = {};
  for (const d of USERS) {
    const email = `${d.username}@${DOMAIN}`;
    const status = d.status ?? 'approved';
    const data = { username: d.username, email, password: hash, role: d.role, status, isVerified: true, verifiedAt: new Date(), profileCompleted: true, ...d.extra } as Prisma.UserUncheckedCreateInput;
    U[d.username] = await prisma.user.upsert({ where: { email }, create: data, update: { password: hash, status, role: d.role }, select: { userId: true } });
  }
  console.log(`Utilizadores: ${USERS.length}`);

  // ── Cursos, módulos e aulas ──
  const C: Record<string, { courseId: string }> = {};
  for (const c of COURSES) {
    const existing = await prisma.course.findUnique({ where: { slug: c.slug }, select: { courseId: true } });
    if (existing) { C[c.slug] = existing; continue; }
    const course = await prisma.course.create({
      data: {
        title: c.title, slug: c.slug, category: c.category, level: c.level, price: c.price, currency: 'MZN', instructorId: U[c.by].userId,
        organizerId: c.by === 'bruno.lima' ? U['instituto.alfa'].userId : undefined, status: 'published', isPublic: true, duration: c.hours, language: 'Portuguese',
        shortDescription: `Curso de ${c.title.toLowerCase()} com exemplos práticos.`, description: `Aprenda ${c.title} passo a passo.\n\nInclui exercícios, projectos e acompanhamento do instrutor.`,
      },
      select: { courseId: true },
    });
    for (let m = 1; m <= 3; m++) {
      const mo = await prisma.module.create({ data: { courseId: course.courseId, creatorId: U[c.by].userId, title: `Módulo ${m}`, description: `Conteúdos do módulo ${m}.`, order: m, isPublished: true }, select: { moduleId: true } });
      for (let l = 1; l <= 3; l++) {
        await prisma.lesson.create({ data: { moduleId: mo.moduleId, creatorId: U[c.by].userId, title: `Aula ${m}.${l}`, lessonType: 'text', content: `Conteúdo da aula ${m}.${l}.\n\nExplicação detalhada com exemplos.`, order: l, isPublished: true, duration: 600, isFree: l === 1 } });
      }
    }
    C[c.slug] = course;
  }
  // um rascunho para o painel do instrutor
  if (!(await prisma.course.findUnique({ where: { slug: 'curso-em-rascunho' } }))) {
    await prisma.course.create({ data: { title: 'Curso em rascunho', slug: 'curso-em-rascunho', category: 'Tecnologia', level: 'beginner', price: 0, currency: 'MZN', instructorId: U['ana.mestra'].userId, status: 'draft', shortDescription: 'Ainda em preparação.' } });
  }
  console.log(`Cursos: ${COURSES.length} publicados + 1 rascunho`);

  // ── Matrículas e avaliações ──
  const enroll = async (user: string, slug: string, progress: number) => {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: U[user].userId, courseId: C[slug].courseId } },
      create: { userId: U[user].userId, courseId: C[slug].courseId, progress, lastAccessed: new Date(), status: progress >= 100 ? 'completed' : 'active', completedAt: progress >= 100 ? new Date() : null },
      update: {},
    });
  };
  await enroll('aluno.um', 'matematica-essencial', 100);
  await enroll('aluno.um', 'intro-programacao', 45);
  await enroll('aluno.um', 'web-moderno', 10);
  await enroll('aluno.dois', 'matematica-essencial', 60);
  await enroll('aluno.dois', 'dados-python', 20);
  await enroll('aluno.tres', 'intro-programacao', 100);
  await enroll('aluno.tres', 'fisica-ensino-medio', 35);
  await enroll('aluno.quatro', 'estatistica-aplicada', 5);

  const reviews: [string, string, number, string][] = [
    ['aluno.um', 'matematica-essencial', 5, 'Explicações claras e exercícios muito úteis.'],
    ['aluno.dois', 'matematica-essencial', 4, 'Gostei, mas queria mais exemplos de geometria.'],
    ['aluno.tres', 'intro-programacao', 5, 'Ótimo para quem está a começar.'],
    ['aluno.um', 'intro-programacao', 4, 'Bom ritmo e projectos práticos.'],
  ];
  for (const [user, slug, rating, comment] of reviews) {
    const exists = await prisma.review.findFirst({ where: { userId: U[user].userId, courseId: C[slug].courseId, entityType: 'course' }, select: { reviewId: true } });
    if (!exists) await prisma.review.create({ data: { entityType: 'course', userId: U[user].userId, courseId: C[slug].courseId, rating, comment } });
  }
  for (const slug of new Set(reviews.map((r) => r[1]))) {
    const agg = await prisma.review.aggregate({ where: { courseId: C[slug].courseId, entityType: 'course' }, _avg: { rating: true }, _count: true });
    await prisma.course.update({ where: { courseId: C[slug].courseId }, data: { ratingAverage: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count } });
  }
  console.log('Matrículas e avaliações criadas');

  // ── Seguidores ──
  for (const [a, b] of [['aluno.um', 'ana.mestra'], ['aluno.um', 'bruno.lima'], ['aluno.dois', 'ana.mestra'], ['aluno.tres', 'bruno.lima'], ['aluno.um', 'aluno.tres']] as const) {
    await prisma.userRelationship.upsert({
      where: { userId_relatedUserId: { userId: U[a].userId, relatedUserId: U[b].userId } },
      create: { userId: U[a].userId, relatedUserId: U[b].userId, relationshipType: 'follow', status: 'accepted' }, update: {},
    });
  }

  // ── Comunidade ──
  let community = await prisma.community.findUnique({ where: { slug: 'estudar-matematica' }, select: { communityId: true } });
  if (!community) {
    community = await prisma.community.create({
      data: { creatorId: U['ana.mestra'].userId, name: 'Estudar Matemática', slug: 'estudar-matematica', shortDescription: 'Dúvidas, desafios e partilha de recursos.', description: 'Espaço aberto para quem estuda matemática: tire dúvidas, resolva desafios e partilhe materiais.', isPublic: true, membershipType: 'open', rules: ['Respeito acima de tudo', 'Sem spam', 'Mostre o seu raciocínio ao pedir ajuda'] },
      select: { communityId: true },
    });
    const members: [string, 'admin' | 'moderator' | 'member'][] = [['ana.mestra', 'admin'], ['bruno.lima', 'moderator'], ['aluno.um', 'member'], ['aluno.dois', 'member'], ['aluno.tres', 'member']];
    for (const [u, role] of members) await prisma.communityMember.create({ data: { communityId: community.communityId, userId: U[u].userId, role, status: 'active' } });
    const posts: [string, string, string, 'discussion' | 'question' | 'announcement' | 'resource', boolean][] = [
      ['ana.mestra', 'Bem-vindos à comunidade!', 'Apresentem-se e digam o que estão a estudar neste momento. 👋', 'announcement', true],
      ['aluno.um', 'Como resolver equações do 2.º grau?', 'Tenho dúvidas na fórmula resolvente quando o discriminante é negativo. Alguém explica?', 'question', false],
      ['aluno.tres', 'Resumo de trigonometria', 'Partilho o meu resumo com as principais identidades. Espero que ajude!', 'resource', false],
      ['bruno.lima', 'Desafio da semana', 'Quantas diagonais tem um polígono de 12 lados? Mostrem o raciocínio.', 'discussion', false],
    ];
    for (const [author, title, content, postType, isPinned] of posts) {
      await prisma.communityPost.create({ data: { communityId: community.communityId, authorId: U[author].userId, title, content, excerpt: content.slice(0, 120), postType, isPinned, status: 'published', visibility: 'public' } });
    }
  }
  console.log('Comunidade: Estudar Matemática');

  // ── Grupo de estudo ──
  let group = await prisma.studyGroup.findFirst({ where: { name: 'Preparação para o Exame', creatorId: U['ana.mestra'].userId }, select: { groupId: true } });
  if (!group) {
    group = await prisma.studyGroup.create({
      data: { creatorId: U['ana.mestra'].userId, communityId: community.communityId, name: 'Preparação para o Exame', description: 'Grupo semanal de resolução de exercícios.', goals: 'Rever todo o programa até ao exame e resolver 3 provas antigas.', privacy: 'public', maxMembers: 12, approvalRequired: false, meetingSchedule: { days: ['wednesday'], time: '18:00', frequency: 'weekly' } },
      select: { groupId: true },
    });
    const roster: [string, 'leader' | 'moderator' | 'member', number][] = [['ana.mestra', 'leader', 40], ['aluno.um', 'moderator', 25], ['aluno.dois', 'member', 15], ['aluno.tres', 'member', 10]];
    for (const [u, role, score] of roster) await prisma.studyGroupMember.create({ data: { groupId: group.groupId, userId: U[u].userId, role, contributionScore: score, lastActiveAt: new Date() } });
    const topic = await prisma.discussionTopic.create({ data: { groupId: group.groupId, authorId: U['aluno.dois'].userId, title: 'Dúvida sobre limites', content: 'Alguém consegue explicar o limite de sen(x)/x quando x tende para 0?' } });
    await prisma.discussionTopic.create({ data: { groupId: group.groupId, authorId: U['ana.mestra'].userId, title: 'Calendário de revisões', content: 'Fixo aqui o plano: funções, limites, derivadas e integrais.', isPinned: true } });
    void topic;
    const task = await prisma.groupTask.create({ data: { groupId: group.groupId, creatorId: U['ana.mestra'].userId, title: 'Resolver a prova de 2023', description: 'Cada membro resolve as questões 1 a 5 e partilha as dúvidas.', deadline: inDays(5), priority: 'high' } });
    for (const u of ['aluno.um', 'aluno.dois', 'aluno.tres']) await prisma.taskAssignment.create({ data: { taskId: task.taskId, userId: U[u].userId } });
    await prisma.groupMeeting.create({ data: { groupId: group.groupId, organizerId: U['ana.mestra'].userId, title: 'Sessão de dúvidas', description: 'Revisão em grupo antes do exame.', startTime: inDays(2, 18), endTime: inDays(2, 19), meetingUrl: 'https://meet.example.com/donza-exame' } });
  }
  console.log('Grupo de estudo: Preparação para o Exame');

  // ── Eventos ──
  const events: [string, string, string, number, boolean, number | null, number][] = [
    ['ana.mestra', 'Aula aberta: Funções e gráficos', 'Sessão online gratuita com perguntas e respostas.', 3, true, 100, 0],
    ['instituto.alfa', 'Workshop de Python para iniciantes', 'Workshop presencial com computadores fornecidos.', 9, false, 20, 250],
  ];
  for (const [by, title, description, days, online, max, price] of events) {
    if (await prisma.event.findFirst({ where: { title, organizerId: U[by].userId }, select: { eventId: true } })) continue;
    const ev = await prisma.event.create({
      data: { organizerId: U[by].userId, title, description, startDate: inDays(days, 17), endDate: inDays(days, 19), isOnline: online, meetingUrl: online ? 'https://meet.example.com/donza-aula' : null, location: online ? null : 'Maputo, Av. 24 de Julho, 1200', maxParticipants: max, price, status: 'scheduled' },
      select: { eventId: true },
    });
    for (const u of ['aluno.um', 'aluno.tres']) await prisma.eventParticipant.create({ data: { eventId: ev.eventId, userId: U[u].userId, status: 'registered' } });
  }
  console.log('Eventos: 2');

  // ── Depoimentos e ajuda ──
  if (!(await prisma.testimonial.count({ where: { status: 'approved' } }))) {
    await prisma.testimonial.create({ data: { userId: U['aluno.um'].userId, content: 'Aprendi mais em três semanas do que em meses sozinho. Os instrutores respondem depressa!', rating: 5, status: 'approved', featured: true } });
    await prisma.testimonial.create({ data: { userId: U['aluno.tres'].userId, content: 'Os grupos de estudo mantêm-me motivada e organizada.', rating: 5, status: 'approved', featured: true } });
    await prisma.testimonial.create({ data: { userId: U['aluno.dois'].userId, content: 'Gostava de ter mais cursos de física, mas a plataforma é excelente.', rating: 4, status: 'pending' } });
  }
  const helpCats = [['primeiros-passos', 'Comece aqui', 1], ['pagamentos', 'Preços, métodos e reembolsos', 2], ['conta', 'Perfil, segurança e privacidade', 3]] as const;
  for (const [name, description, displayOrder] of helpCats) await prisma.helpCategory.upsert({ where: { name }, create: { name, description, displayOrder }, update: {} });
  const articles = [
    ['Como me inscrevo num curso?', 'como-me-inscrevo', 'primeiros-passos', 'Abra o curso, clique em **Inscrever-me** e, se for pago, escolha o método de pagamento. Os cursos gratuitos ficam disponíveis de imediato.'],
    ['Que métodos de pagamento aceitam?', 'metodos-de-pagamento', 'pagamentos', 'Aceitamos cartão, M-Pesa, e-Mola e transferência bancária. Nas transferências, o acesso é libertado após confirmação.'],
    ['Como altero a minha palavra-passe?', 'alterar-palavra-passe', 'conta', 'Vá a **Definições → Segurança**, indique a palavra-passe actual e escolha uma nova com pelo menos 8 caracteres.'],
  ] as const;
  for (const [title, slug, category, content] of articles) {
    await prisma.helpArticle.upsert({ where: { slug }, create: { title, slug, category, content, excerpt: content.slice(0, 120), status: 'published' }, update: {} });
  }

  // ── Notificações de exemplo ──
  if (!(await prisma.notification.count({ where: { userId: U['aluno.um'].userId } }))) {
    await prisma.notification.create({ data: { userId: U['aluno.um'].userId, type: 'DONZA_NOTIFICATION', title: 'Bem-vindo à Donza!', message: 'Explore os cursos, junte-se a uma comunidade e crie o seu primeiro grupo de estudo.' } });
    await prisma.notification.create({ data: { userId: U['aluno.um'].userId, type: 'EVENT_REGISTRATION', title: 'Inscrição confirmada', message: 'Está inscrito em “Aula aberta: Funções e gráficos”.' } });
  }

  console.log('\n✔ Seed de demonstração concluído.');
  console.log(`  Palavra-passe de todos os utilizadores: ${PASSWORD}`);
  console.log('  Contas (email = <utilizador>@' + DOMAIN + '):');
  console.log('   admin · ana.mestra, bruno.lima (instrutores) · instituto.alfa (instituição)');
  console.log('   aluno.um, aluno.dois, aluno.tres, aluno.quatro (alunos)');
  console.log('   inst.pendente, org.pendente (aguardam aprovação do administrador)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
