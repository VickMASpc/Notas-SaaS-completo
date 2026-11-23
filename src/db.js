/**
 * ============================================================================
 * SIGE PRO - MOTOR DE BANCO DE DADOS LOCALSTORAGE DE ALTA ESCALA (8.000 ALUNOS)
 * ============================================================================
 *
 * Arquitetura Híbrida Determinística + Delta em LocalStorage:
 * - Como 8.000 alunos x 10 disciplinas x 4 bimestres x 4 avaliações = ~1.280.000
 *   registros de notas/faltas (o que ocuparia ~35MB em JSON puro e estouraria o
 *   limite de 5MB do LocalStorage do navegador), este motor utiliza:
 *   1. Geração determinística ultrarrápida em memória (PRNG Mulberry32) baseada
 *      nas configurações granulares (`config`: semente, distribuição Manhã/Tarde/Noite,
 *      EM Regular, EM Técnico e EJA Noturno, faixa de notas, taxa de faltas/gazetas).
 *   2. Persistência em LocalStorage (`sige_saas_db_v1`) de todas as configurações,
 *      professores, turmas, grades curriculares, avaliações e TODOS os deltas
 *      (edições manuais de notas, faltas/skips, novos alunos, exclusões, etc.).
 */

const STORAGE_KEY = 'sige_saas_db_v1';

// Listas de nomes brasileiros realistas para geração de 8.000 alunos e 90 professores
const FIRST_NAMES = [
  'Miguel', 'Arthur', 'Gael', 'Théo', 'Heitor', 'Ravi', 'Davi', 'Bernardo', 'Noah', 'Gabriel',
  'Samuel', 'Pedro', 'Anthony', 'Isaac', 'Benício', 'Benjamin', 'Matheus', 'Lucas', 'Joaquim', 'Nicolas',
  'Lucca', 'Lorenzo', 'Henrique', 'João', 'Rafael', 'Henry', 'Murilo', 'Levi', 'Guilherme', 'Vicente',
  'Felipe', 'Bryan', 'Matteo', 'Bento', 'João Pedro', 'Pietro', 'Leonardo', 'Daniel', 'Gustavo', 'Pedro Henrique',
  'Helena', 'Alice', 'Laura', 'Maria Alice', 'Sophia', 'Manuela', 'Maitê', 'Liz', 'Cecília', 'Isabella',
  'Luísa', 'Eloá', 'Heloísa', 'Júlia', 'Ayla', 'Maria Luísa', 'Isis', 'Elisa', 'Antonella', 'Valentina',
  'Maya', 'Maria Júlia', 'Aurora', 'Lara', 'Maria Clara', 'Lívia', 'Esther', 'Giovanna', 'Sarah', 'Maria Cecília',
  'Lorena', 'Beatriz', 'Rebeca', 'Luna', 'Olívia', 'Maria Helena', 'Mariana', 'Isadora', 'Melissa', 'Catarina',
  'Vinícius', 'Caio', 'Bruno', 'Thiago', 'Eduardo', 'Rodrigo', 'Fernando', 'André', 'Marcelo', 'Diego',
  'Camila', 'Letícia', 'Amanda', 'Bruna', 'Natália', 'Larissa', 'Fernanda', 'Carolina', 'Bianca', 'Patrícia'
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
  'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
  'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
  'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira', 'Araújo', 'Pinto', 'Correia', 'Moura', 'Cavalcanti',
  'Monteiro', 'Campos', 'Peixoto', 'Batista', 'Duarte', 'Miranda', 'Azevedo', 'Farias', 'Bezerra', 'Borges'
];

// Catálogos de Componentes Curriculares por Modalidade
export const CURRICULUM_PRESETS = {
  EM_REGULAR: [
    { code: 'LP', name: 'Língua Portuguesa', area: 'Linguagens', weeklyClasses: 4 },
    { code: 'MAT', name: 'Matemática', area: 'Matemática', weeklyClasses: 4 },
    { code: 'HIS', name: 'História', area: 'Ciências Humanas', weeklyClasses: 2 },
    { code: 'GEO', name: 'Geografia', area: 'Ciências Humanas', weeklyClasses: 2 },
    { code: 'BIO', name: 'Biologia', area: 'Ciências da Natureza', weeklyClasses: 2 },
    { code: 'FIS', name: 'Física', area: 'Ciências da Natureza', weeklyClasses: 2 },
    { code: 'QUI', name: 'Química', area: 'Ciências da Natureza', weeklyClasses: 2 },
    { code: 'ING', name: 'Língua Inglesa', area: 'Linguagens', weeklyClasses: 2 },
    { code: 'ART', name: 'Arte', area: 'Linguagens', weeklyClasses: 1 },
    { code: 'EDF', name: 'Educação Física', area: 'Linguagens', weeklyClasses: 2 },
    { code: 'FIL', name: 'Filosofia & Sociologia', area: 'Ciências Humanas', weeklyClasses: 2 }
  ],
  EM_TECNICO: [
    { code: 'LP', name: 'Língua Portuguesa', area: 'Linguagens', weeklyClasses: 3 },
    { code: 'MAT', name: 'Matemática', area: 'Matemática', weeklyClasses: 3 },
    { code: 'EDF', name: 'Educação Física', area: 'Linguagens', weeklyClasses: 2 },
    { code: 'IA', name: 'Inteligência Artificial', area: 'Eixo Tecnológico TI', weeklyClasses: 3 },
    { code: 'BDD', name: 'Modelagem e Desenv. de Banco de Dados', area: 'Eixo Tecnológico TI', weeklyClasses: 3 },
    { code: 'BACK', name: 'Programação Back-End', area: 'Eixo Tecnológico TI', weeklyClasses: 4 },
    { code: 'FRONT', name: 'Programação Front-End', area: 'Eixo Tecnológico TI', weeklyClasses: 3 },
    { code: 'MOB', name: 'Programação Mobile', area: 'Eixo Tecnológico TI', weeklyClasses: 3 },
    { code: 'PROJ', name: 'Projeto Multidisciplinar', area: 'Eixo Tecnológico TI', weeklyClasses: 2 },
    { code: 'VER', name: 'Versionamento e Sistemas de Mensageria', area: 'Eixo Tecnológico TI', weeklyClasses: 2 }
  ],
  EJA: [
    { code: 'LP', name: 'Língua Portuguesa e Literatura (EJA)', area: 'Linguagens', weeklyClasses: 4 },
    { code: 'MAT', name: 'Matemática Aplicada (EJA)', area: 'Matemática', weeklyClasses: 4 },
    { code: 'CH', name: 'História e Geografia (Ciências Humanas EJA)', area: 'Ciências Humanas', weeklyClasses: 3 },
    { code: 'CN', name: 'Biologia, Física e Química (Ciências da Natureza EJA)', area: 'Ciências da Natureza', weeklyClasses: 3 },
    { code: 'ING', name: 'Língua Estrangeira Moderna - Inglês (EJA)', area: 'Linguagens', weeklyClasses: 2 },
    { code: 'TRAB', name: 'Mundo do Trabalho e Cidadania (EJA)', area: 'Ciências Humanas', weeklyClasses: 2 },
    { code: 'INF', name: 'Inclusão Digital e Tecnologia (EJA)', area: 'Eixo Tecnológico TI', weeklyClasses: 2 }
  ]
};

export const BIMESTERS = [
  { key: 'b1', label: '1º Bimestre', short: '1º Bim', months: ['02', '03', '04'] },
  { key: 'b2', label: '2º Bimestre', short: '2º Bim', months: ['05', '06'] },
  { key: 'b3', label: '3º Bimestre', short: '3º Bim', months: ['08', '09'] },
  { key: 'b4', label: '4º Bimestre', short: '4º Bim', months: ['10', '11'] }
];

const DEFAULT_ACTIVITY_TEMPLATES = [
  { name: 'Avaliação das Tarefas', weight: 20, dayOffset: '12' },
  { name: 'Prova Paulista / Bimestral', weight: 30, dayOffset: '21' },
  { name: 'Trabalho Prático / Seminário', weight: 25, dayOffset: '25' },
  { name: 'Atividade em Sala', weight: 25, dayOffset: '18' }
];

/**
 * Gerador pseudoaleatório rápido e determinístico (Mulberry32)
 */
export function createPRNG(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Configuração padrão do SaaS Escolar (8.000 Alunos distribuídos conforme especificação):
 * - Manhã (Morning): Apenas Ensino Médio (EM Regular + EM Técnico) -> 3.200 alunos
 * - Tarde (Noon/Afternoon): Apenas Ensino Médio (EM Regular + EM Técnico) -> 2.600 alunos
 * - Noite (Night): Ensino Médio Noturno (1.200) + EJA Ensino Médio (1.000) -> 2.200 alunos
 * Total padrão: 8.000 alunos.
 */
export function getDefaultConfig() {
  return {
    schoolName: 'C.E.E.T.E.P.S. / Rede Estadual Integrada — Unidade Central',
    year: 2026,
    seed: 20260918,
    studentsPerClass: 40,
    // Distribuição por Turno e Modalidade (Manhã e Tarde = EM Only; Noite = EM + EJA)
    morningEmRegularStudents: 1920, // 48 turmas
    morningEmTecnicoStudents: 1280, // 32 turmas (Total Manhã = 3.200 - EM Only)
    afternoonEmRegularStudents: 1560, // 39 turmas
    afternoonEmTecnicoStudents: 1040, // 26 turmas (Total Tarde = 2.600 - EM Only)
    nightEmRegularStudents: 1200, // 30 turmas (Noite EM)
    nightEjaStudents: 1000, // 25 turmas (Noite EJA)
    // Parâmetros de Notas, Avaliações e Faltas (Skips/Gazetas)
    activeBimestersCount: 3, // 1º ao 3º Bimestre preenchidos por padrão (ou 4)
    activitiesPerBimester: 4,
    minGrade: 4.2,
    maxGrade: 10.0,
    baseSkipRatePercent: 8.5, // Taxa média de faltas (%)
    classSkipSpikeRatePercent: 14.0, // % de alunos com padrão de "gazeta" (skips elevados)
    teacherCount: 92
  };
}

/**
 * Gera os 92 Professores do Corpo Docente distribuídos pelas áreas e turnos
 */
function generateTeachers(config) {
  const rng = createPRNG(config.seed + 777);
  const areas = [
    { area: 'Linguagens', subjects: ['Língua Portuguesa', 'Língua Inglesa', 'Arte', 'Educação Física'] },
    { area: 'Matemática', subjects: ['Matemática', 'Matemática Aplicada (EJA)'] },
    { area: 'Ciências da Natureza', subjects: ['Biologia', 'Física', 'Química'] },
    { area: 'Ciências Humanas', subjects: ['História', 'Geografia', 'Filosofia & Sociologia', 'Mundo do Trabalho e Cidadania (EJA)'] },
    {
      area: 'Eixo Tecnológico TI',
      subjects: [
        'Inteligência Artificial',
        'Modelagem e Desenv. de Banco de Dados',
        'Programação Back-End',
        'Programação Front-End',
        'Programação Mobile',
        'Projeto Multidisciplinar',
        'Versionamento e Sistemas de Mensageria'
      ]
    }
  ];

  const shiftCombos = [
    ['Manhã'],
    ['Tarde'],
    ['Noite'],
    ['Manhã', 'Tarde'],
    ['Tarde', 'Noite'],
    ['Manhã', 'Noite'],
    ['Manhã', 'Tarde', 'Noite']
  ];

  const teachers = [];
  const usedNames = new Set();

  for (let i = 0; i < config.teacherCount; i++) {
    let fullName = '';
    for (let attempt = 0; attempt < 30; attempt++) {
      const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
      const ln1 = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
      const ln2 = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
      fullName = ln1 !== ln2 ? `Prof. ${fn} ${ln1} ${ln2}` : `Prof. ${fn} ${ln1}`;
      if (!usedNames.has(fullName)) {
        usedNames.add(fullName);
        break;
      }
    }

    const areaObj = areas[i % areas.length];
    const primarySubject = areaObj.subjects[Math.floor(rng() * areaObj.subjects.length)];
    const secondarySubject = areaObj.subjects[Math.floor(rng() * areaObj.subjects.length)];
    const subjects = primarySubject === secondarySubject ? [primarySubject] : [primarySubject, secondarySubject];

    const shifts = shiftCombos[Math.floor(rng() * shiftCombos.length)];
    const modalities = [];
    if (shifts.includes('Manhã') || shifts.includes('Tarde')) {
      modalities.push(areaObj.area === 'Eixo Tecnológico TI' ? 'EM Técnico' : 'EM Regular');
    }
    if (shifts.includes('Noite')) {
      modalities.push('EM Regular');
      if (rng() > 0.35) modalities.push('EJA');
    }

    const weeklyHoursOptions = [20, 24, 30, 40];
    const weeklyHours = weeklyHoursOptions[Math.floor(rng() * weeklyHoursOptions.length)];
    const teacherSkips = Math.floor(rng() * 6); // Faltas/ausências docentes no ano
    const statusRoll = rng();
    const status = statusRoll > 0.93 ? 'Licença Médica' : statusRoll > 0.87 ? 'Substituto' : 'Efetivo Ativo';

    const cleanSlug = fullName
      .replace('Prof. ', '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '.');

    teachers.push({
      id: `prof_${i + 1}`,
      registration: `DOC-${String(202000 + i + 1)}`,
      name: fullName,
      email: `${cleanSlug}@educacao.sp.gov.br`,
      area: areaObj.area,
      subjects,
      shifts,
      modalities: Array.from(new Set(modalities)),
      weeklyHours,
      teacherSkips,
      status,
      classesCount: Math.max(2, Math.round(weeklyHours / 4))
    });
  }

  return teachers;
}

/**
 * Gera todas as Turmas (Classes) e os 8.000 Alunos conforme a distribuição dos turnos:
 * - Manhã (Morning): Apenas EM (1ª, 2ª, 3ª Série EM Regular e EM Técnico)
 * - Tarde (Noon):    Apenas EM (1ª, 2ª, 3ª Série EM Regular e EM Técnico)
 * - Noite (Night):   EM Noturno (1ª, 2ª, 3ª Série EM) + EJA Ensino Médio (Termos I, II, III, IV)
 */
export function buildSchoolDataset(config, overrides) {
  const rng = createPRNG(config.seed);
  const perClass = Math.max(15, Math.min(60, Number(config.studentsPerClass) || 40));

  const groups = [
    {
      shift: 'Manhã',
      shiftCode: 'M',
      modality: 'EM Regular',
      presetKey: 'EM_REGULAR',
      gradesList: ['1ª Série EM', '2ª Série EM', '3ª Série EM'],
      totalStudents: Number(config.morningEmRegularStudents) || 0
    },
    {
      shift: 'Manhã',
      shiftCode: 'M',
      modality: 'EM Técnico',
      presetKey: 'EM_TECNICO',
      gradesList: ['1ª Série EM Técnico (TI)', '2ª Série EM Técnico (TI)', '3ª Série EM Técnico (TI)'],
      totalStudents: Number(config.morningEmTecnicoStudents) || 0
    },
    {
      shift: 'Tarde',
      shiftCode: 'T',
      modality: 'EM Regular',
      presetKey: 'EM_REGULAR',
      gradesList: ['1ª Série EM', '2ª Série EM', '3ª Série EM'],
      totalStudents: Number(config.afternoonEmRegularStudents) || 0
    },
    {
      shift: 'Tarde',
      shiftCode: 'T',
      modality: 'EM Técnico',
      presetKey: 'EM_TECNICO',
      gradesList: ['1ª Série EM Técnico (TI)', '2ª Série EM Técnico (TI)', '3ª Série EM Técnico (TI)'],
      totalStudents: Number(config.afternoonEmTecnicoStudents) || 0
    },
    {
      shift: 'Noite',
      shiftCode: 'N',
      modality: 'EM Regular',
      presetKey: 'EM_REGULAR',
      gradesList: ['1ª Série EM Noturno', '2ª Série EM Noturno', '3ª Série EM Noturno'],
      totalStudents: Number(config.nightEmRegularStudents) || 0
    },
    {
      shift: 'Noite',
      shiftCode: 'N',
      modality: 'EJA',
      presetKey: 'EJA',
      gradesList: ['EJA - Termo I (EM)', 'EJA - Termo II (EM)', 'EJA - Termo III (EM)', 'EJA - Termo IV (EM)'],
      totalStudents: Number(config.nightEjaStudents) || 0
    }
  ];

  const classes = [];
  const students = [];
  let globalStudentCounter = 1;
  let globalClassCounter = 1;

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (const grp of groups) {
    if (grp.totalStudents <= 0) continue;
    const numClasses = Math.max(1, Math.ceil(grp.totalStudents / perClass));
    let remainingInGroup = grp.totalStudents;

    for (let cIdx = 0; cIdx < numClasses; cIdx++) {
      const countInThisClass =
        cIdx === numClasses - 1 ? remainingInGroup : Math.min(perClass, remainingInGroup);
      if (countInThisClass <= 0) break;
      remainingInGroup -= countInThisClass;

      const serieName = grp.gradesList[cIdx % grp.gradesList.length];
      const letterIdx = Math.floor(cIdx / grp.gradesList.length);
      const letter =
        letterIdx < 26
          ? letters[letterIdx]
          : `${letters[Math.floor(letterIdx / 26) - 1]}${letters[letterIdx % 26]}`;

      const classId = `turma_${globalClassCounter}`;
      const roomNumber = 100 + ((globalClassCounter * 3) % 85);
      const classCode = `${serieName.split(' ')[0]} ${letter} - ${grp.shiftCode}`;

      // Componentes curriculares desta turma (com suporte a customizações salvas em overrides)
      const customSubjects = overrides?.classSubjects?.[classId];
      const subjects = customSubjects
        ? customSubjects
        : CURRICULUM_PRESETS[grp.presetKey].map((sub) => ({ ...sub }));

      classes.push({
        id: classId,
        code: classCode,
        name: `${serieName} — Turma ${letter}`,
        serie: serieName,
        shift: grp.shift, // 'Manhã' | 'Tarde' | 'Noite'
        modality: grp.modality, // 'EM Regular' | 'EM Técnico' | 'EJA'
        presetKey: grp.presetKey,
        room: `Sala ${roomNumber}`,
        studentCount: countInThisClass,
        subjects
      });

      // Gera os alunos desta turma com perfil determinístico rápido
      for (let sIdx = 0; sIdx < countInThisClass; sIdx++) {
        const stuId = `stu_${globalStudentCounter}`;

        // Verifica se este aluno foi excluído manualmente
        if (overrides?.deletedStudents?.[stuId]) {
          globalStudentCounter++;
          continue;
        }

        const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
        const ln1 = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
        const ln2 = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
        const ln3 = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
        const defaultName =
          ln1 !== ln2 && ln2 !== ln3 ? `${fn} ${ln1} ${ln2}` : `${fn} ${ln1} ${LAST_NAMES[(sIdx + 7) % LAST_NAMES.length]}`;

        // Semente individual do aluno para cálculo instantâneo sob demanda + resumo anual
        const studentSeed = (config.seed ^ (globalStudentCounter * 2654435761)) >>> 0;
        const sRng = createPRNG(studentSeed);

        // Perfil de desempenho base do aluno (0.0 a 1.0) e propensão a faltas/gazetas
        const academicAffinity = 0.25 + sRng() * 0.75;
        const isChronicSkipper = sRng() * 100 < config.classSkipSpikeRatePercent;

        // Calcula média geral resumida e total de faltas (ou usa override manual se existir)
        const studentOverride = overrides?.studentMeta?.[stuId] || {};
        const minG = Number(config.minGrade) || 4.0;
        const maxG = Number(config.maxGrade) || 10.0;
        const rawBaseAvg = minG + academicAffinity * (maxG - minG);
        const defaultOverallAvg = Number(Math.min(10, Math.max(0, rawBaseAvg)).toFixed(1));

        // Total de aulas no ano até o momento (~200 aulas por bimestre somando todas as matérias)
        const activeBims = Math.max(1, Math.min(4, Number(config.activeBimestersCount) || 3));
        const totalClassesHeld = activeBims * 200;

        const skipMultiplier = isChronicSkipper ? 2.4 + sRng() * 1.8 : 0.2 + sRng() * 1.1;
        const rawSkips = Math.round(((totalClassesHeld * (config.baseSkipRatePercent / 100)) * skipMultiplier));
        const defaultTotalSkips = Math.min(totalClassesHeld, Math.max(0, rawSkips));
        // Gazetas (aulas cabuladas isoladamente dentro do turno)
        const defaultClassSkips = isChronicSkipper
          ? Math.max(2, Math.round(defaultTotalSkips * 0.35))
          : Math.round(defaultTotalSkips * 0.1);

        const totalSkips =
          studentOverride.totalSkips !== undefined ? studentOverride.totalSkips : defaultTotalSkips;
        const isolatedSkips =
          studentOverride.isolatedSkips !== undefined ? studentOverride.isolatedSkips : defaultClassSkips;
        const overallAvg =
          studentOverride.overallAvg !== undefined ? studentOverride.overallAvg : defaultOverallAvg;

        const attendancePercent = Number(
          Math.max(0, Math.min(100, ((totalClassesHeld - totalSkips) / totalClassesHeld) * 100)).toFixed(1)
        );

        let status = 'Aprovado';
        if (attendancePercent < 75) {
          status = 'Retido por Falta';
        } else if (overallAvg < 4.5) {
          status = 'Retido por Nota';
        } else if (overallAvg < 6.0) {
          status = 'Em Recuperação';
        }

        students.push({
          id: stuId,
          ra: `2026${String(globalStudentCounter).padStart(6, '0')}-SP`,
          name: studentOverride.name || defaultName,
          classId,
          className: `${serieName} — Turma ${letter}`,
          classCode,
          serie: serieName,
          shift: grp.shift,
          modality: grp.modality,
          seed: studentSeed,
          academicAffinity,
          isChronicSkipper,
          overallAvg,
          totalSkips,
          isolatedSkips, // "Gazetas" (faltas em aulas específicas estando na escola)
          totalClassesHeld,
          attendancePercent,
          status
        });

        globalStudentCounter++;
      }

      globalClassCounter++;
    }
  }

  // Adiciona alunos criados manualmente pelo usuário
  if (overrides?.addedStudents && Array.isArray(overrides.addedStudents)) {
    for (const customStu of overrides.addedStudents) {
      if (!overrides?.deletedStudents?.[customStu.id]) {
        students.unshift(customStu);
      }
    }
  }

  return { classes, students };
}

/**
 * Gera ou recupera as avaliações e notas detalhadas de um Aluno (ou Turma)
 * para um Componente Curricular e Bimestre específicos.
 * Combina os valores determinísticos da semente com quaisquer edições salvas em `overrides`.
 */
export function getSubjectBimesterDetails(student, classObj, subject, bimesterKey, config, overrides) {
  const bimesterMeta = BIMESTERS.find((b) => b.key === bimesterKey) || BIMESTERS[0];
  const bimIndex = BIMESTERS.findIndex((b) => b.key === bimesterKey);
  const activeBims = Number(config.activeBimestersCount) || 3;
  const isBimesterOpen = bimIndex < activeBims;

  // Chave das avaliações da turma para esta disciplina e bimestre
  const evalScopeKey = `${classObj.id}__${subject.code}__${bimesterKey}`;
  let assessmentsMeta = overrides?.assessments?.[evalScopeKey];

  if (!assessmentsMeta) {
    const count = Math.max(1, Math.min(4, Number(config.activitiesPerBimester) || 4));
    const weightsByCount = {
      1: [100],
      2: [50, 50],
      3: [30, 40, 30],
      4: [20, 30, 25, 25]
    };
    const weights = weightsByCount[count] || [25, 25, 25, 25];
    const month = bimesterMeta.months[bimesterMeta.months.length - 1];

    assessmentsMeta = [];
    for (let i = 0; i < count; i++) {
      const tpl = DEFAULT_ACTIVITY_TEMPLATES[i % DEFAULT_ACTIVITY_TEMPLATES.length];
      assessmentsMeta.push({
        id: `ev_${i + 1}`,
        name: tpl.name,
        date: `${tpl.dayOffset}/${month}`,
        weight: weights[i]
      });
    }
  }

  // Total de aulas dadas na disciplina no bimestre (ex: 4 aulas/sem * 10 semanas = 40 aulas)
  const totalSubjectClasses = (subject.weeklyClasses || 2) * 10;

  // Semente específica para (Aluno + Disciplina + Bimestre)
  let hash = student.seed || 123456;
  const keyStr = `${subject.code}_${bimesterKey}`;
  for (let i = 0; i < keyStr.length; i++) {
    hash = Math.imul(hash ^ keyStr.charCodeAt(i), 16777619);
  }
  const rng = createPRNG(hash >>> 0);

  // Chave de override de notas/faltas do aluno nesta matéria e bimestre
  const stuBimKey = `${student.id}__${subject.code}__${bimesterKey}`;
  const stuBimOverride = overrides?.studentGrades?.[stuBimKey] || {};

  const minG = Number(config.minGrade) || 4.0;
  const maxG = Number(config.maxGrade) || 10.0;

  let weightedSum = 0;
  let totalWeightUsed = 0;

  const assessmentsWithGrades = assessmentsMeta.map((ev) => {
    let grade = null;
    if (stuBimOverride.grades && stuBimOverride.grades[ev.id] !== undefined) {
      grade = stuBimOverride.grades[ev.id];
    } else if (isBimesterOpen) {
      // Gera nota coerente com a afinidade acadêmica do aluno + variação da atividade
      const base = minG + (student.academicAffinity || 0.7) * (maxG - minG);
      const jitter = (rng() - 0.48) * 2.2;
      grade = Number(Math.min(10, Math.max(0, base + jitter)).toFixed(2));
    }

    const w = Number(ev.weight) || 0;
    if (grade !== null && grade !== '' && !isNaN(grade) && w > 0) {
      weightedSum += Number(grade) * w;
      totalWeightUsed += w;
    }

    return {
      ...ev,
      grade
    };
  });

  const average = totalWeightUsed > 0 ? Number((weightedSum / totalWeightUsed).toFixed(1)) : null;

  // Faltas e Gazetas (Skips) do aluno neste componente e bimestre
  let skips = 0;
  let isolatedSkips = 0;
  if (stuBimOverride.skips !== undefined) {
    skips = Number(stuBimOverride.skips) || 0;
  } else if (isBimesterOpen) {
    const rate = (config.baseSkipRatePercent || 8) / 100;
    const mult = student.isChronicSkipper ? 2.2 + rng() * 1.5 : rng() * 1.2;
    skips = Math.min(totalSubjectClasses, Math.max(0, Math.round(totalSubjectClasses * rate * mult)));
  }

  if (stuBimOverride.isolatedSkips !== undefined) {
    isolatedSkips = Number(stuBimOverride.isolatedSkips) || 0;
  } else if (isBimesterOpen && skips > 0) {
    isolatedSkips = student.isChronicSkipper ? Math.ceil(skips * 0.4) : Math.floor(skips * 0.15);
  }

  const attendancePercent = Number(
    Math.max(0, Math.min(100, ((totalSubjectClasses - skips) / totalSubjectClasses) * 100)).toFixed(1)
  );

  return {
    bimesterKey,
    bimesterLabel: bimesterMeta.label,
    totalSubjectClasses,
    assessments: assessmentsWithGrades,
    average,
    skips,
    isolatedSkips,
    attendancePercent
  };
}

/**
 * Calcula a Média da Turma para uma Disciplina e Bimestre (baseada nos alunos daquela turma)
 */
export function getClassSubjectBimesterAverage(classObj, classStudents, subject, bimesterKey, config, overrides) {
  let sum = 0;
  let count = 0;
  for (const stu of classStudents) {
    const details = getSubjectBimesterDetails(stu, classObj, subject, bimesterKey, config, overrides);
    if (details.average !== null) {
      sum += details.average;
      count++;
    }
  }
  return count > 0 ? Number((sum / count).toFixed(1)) : null;
}

/**
 * Carrega o estado persistido no LocalStorage ou inicializa com os padrões de 8.000 alunos
 */
export function loadSaaSState() {
  const defaultConfig = getDefaultConfig();
  let saved = null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      saved = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Erro ao ler LocalStorage, inicializando banco padrão:', err);
  }

  const config = saved?.config ? { ...defaultConfig, ...saved.config } : defaultConfig;
  const overrides = saved?.overrides || {
    studentMeta: {},
    studentGrades: {},
    assessments: {},
    classSubjects: {},
    addedStudents: [],
    deletedStudents: {}
  };
  const teachers =
    saved?.teachers && Array.isArray(saved.teachers) && saved.teachers.length > 0
      ? saved.teachers
      : generateTeachers(config);

  return { config, overrides, teachers };
}

/**
 * Salva configurações, professores e deltas de notas/faltas no LocalStorage
 */
export function saveSaaSState(stateToSave) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        config: stateToSave.config,
        overrides: stateToSave.overrides,
        teachers: stateToSave.teachers
      })
    );
  } catch (err) {
    console.error('Erro ao salvar estado no LocalStorage:', err);
  }
}

/**
 * Regenera a lista de professores com nova semente
 */
export function regenerateTeachersList(config) {
  return generateTeachers(config);
}
