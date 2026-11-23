import React, { useState, useMemo, useEffect } from 'react';
import {
  BIMESTERS,
  CURRICULUM_PRESETS,
  getDefaultConfig,
  buildSchoolDataset,
  getSubjectBimesterDetails,
  getClassSubjectBimesterAverage,
  loadSaaSState,
  saveSaaSState,
  regenerateTeachersList
} from './db.js';

const PAGE_SIZE = 50;

function getGradeBadgeClass(val, isSoft = false) {
  if (val === null || val === undefined || isNaN(val)) return 'pill pill-empty';
  if (val >= 7) return isSoft ? 'pill pill-green-soft' : 'pill pill-green';
  if (val >= 5) return isSoft ? 'pill pill-amber-soft' : 'pill pill-amber';
  return isSoft ? 'pill pill-red-soft' : 'pill pill-red';
}

function getStatusBadgeClass(status) {
  if (status === 'Aprovado') return 'status-tag status-ok';
  if (status === 'Em Recuperação') return 'status-tag status-warn';
  return 'status-tag status-danger';
}

export default function App() {
  // Estado principal persistido (configurações granulares, professores, overrides)
  const [persisted, setPersisted] = useState(() => loadSaaSState());

  // Navegação SaaS
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'students' | 'teachers' | 'classes' | 'controls'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function handleSwitchTab(tab) {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Filtros do Diretório de Alunos (8.000 alunos)
  const [searchTerm, setSearchTerm] = useState('');
  const [filterShift, setFilterShift] = useState('ALL'); // 'ALL' | 'Manhã' | 'Tarde' | 'Noite'
  const [filterModality, setFilterModality] = useState('ALL'); // 'ALL' | 'EM Regular' | 'EM Técnico' | 'EJA'
  const [filterClassId, setFilterClassId] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'Aprovado' | 'Em Recuperação' | 'Retido por Nota' | 'Retido por Falta' | 'GAZETA'
  const [page, setPage] = useState(1);

  // Filtros de Professores
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherAreaFilter, setTeacherAreaFilter] = useState('ALL');
  const [teacherShiftFilter, setTeacherShiftFilter] = useState('ALL');

  // Filtros de Turmas
  const [classShiftFilter, setClassShiftFilter] = useState('ALL');
  const [classModalityFilter, setClassModalityFilter] = useState('ALL');

  // Modais
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [bimesterModal, setBimesterModal] = useState(null); // { studentId, subjectCode, bimesterKey }
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);

  // Formulários de criação
  const [newTeacherForm, setNewTeacherForm] = useState({
    name: '',
    email: '',
    area: 'Matemática',
    subjectsText: 'Matemática',
    shifts: ['Manhã'],
    modalities: ['EM Regular'],
    weeklyHours: 30,
    status: 'Efetivo Ativo'
  });

  const [newStudentForm, setNewStudentForm] = useState({
    name: '',
    classId: ''
  });

  // Draft de configurações granulares (aba Controles Granulares)
  const [configDraft, setConfigDraft] = useState(() => persisted.config);

  useEffect(() => {
    setConfigDraft(persisted.config);
  }, [persisted.config]);

  // Salva automaticamente qualquer mudança em persisted
  useEffect(() => {
    saveSaaSState(persisted);
  }, [persisted]);

  // Constrói dataset de 8.000 alunos e ~200 turmas em memória
  const dataset = useMemo(() => {
    return buildSchoolDataset(persisted.config, persisted.overrides);
  }, [persisted.config, persisted.overrides]);

  const classMap = useMemo(() => {
    const map = new Map();
    for (const c of dataset.classes) map.set(c.id, c);
    return map;
  }, [dataset.classes]);

  const studentMap = useMemo(() => {
    const map = new Map();
    for (const s of dataset.students) map.set(s.id, s);
    return map;
  }, [dataset.students]);

  // Estatísticas globais em tempo real
  const stats = useMemo(() => {
    const byShift = {
      Manhã: { total: 0, emReg: 0, emTec: 0, eja: 0, avgSum: 0, skipsSum: 0, gazetas: 0 },
      Tarde: { total: 0, emReg: 0, emTec: 0, eja: 0, avgSum: 0, skipsSum: 0, gazetas: 0 },
      Noite: { total: 0, emReg: 0, emTec: 0, eja: 0, avgSum: 0, skipsSum: 0, gazetas: 0 }
    };

    let approved = 0;
    let recovery = 0;
    let retainedGrade = 0;
    let retainedSkip = 0;
    let chronicSkippers = 0;
    let totalAvgSum = 0;
    let totalAttendanceSum = 0;

    for (const s of dataset.students) {
      const sh = byShift[s.shift];
      if (sh) {
        sh.total++;
        if (s.modality === 'EM Regular') sh.emReg++;
        else if (s.modality === 'EM Técnico') sh.emTec++;
        else if (s.modality === 'EJA') sh.eja++;
        sh.avgSum += s.overallAvg;
        sh.skipsSum += s.totalSkips;
        sh.gazetas += s.isolatedSkips;
      }

      if (s.status === 'Aprovado') approved++;
      else if (s.status === 'Em Recuperação') recovery++;
      else if (s.status === 'Retido por Nota') retainedGrade++;
      else if (s.status === 'Retido por Falta') retainedSkip++;

      if (s.isChronicSkipper || s.attendancePercent < 75) chronicSkippers++;
      totalAvgSum += s.overallAvg;
      totalAttendanceSum += s.attendancePercent;
    }

    const total = dataset.students.length || 1;
    const totalTeacherSkips = persisted.teachers.reduce((acc, t) => acc + (Number(t.teacherSkips) || 0), 0);

    return {
      totalStudents: dataset.students.length,
      totalClasses: dataset.classes.length,
      totalTeachers: persisted.teachers.length,
      totalTeacherSkips,
      globalAvg: (totalAvgSum / total).toFixed(2),
      globalAttendance: (totalAttendanceSum / total).toFixed(1),
      approved,
      recovery,
      retainedGrade,
      retainedSkip,
      chronicSkippers,
      byShift
    };
  }, [dataset, persisted.teachers]);

  // Alunos filtrados
  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return dataset.students.filter((s) => {
      if (filterShift !== 'ALL' && s.shift !== filterShift) return false;
      if (filterModality !== 'ALL' && s.modality !== filterModality) return false;
      if (filterClassId !== 'ALL' && s.classId !== filterClassId) return false;
      if (filterStatus === 'GAZETA') {
        if (!s.isChronicSkipper && s.isolatedSkips < 5) return false;
      } else if (filterStatus !== 'ALL' && s.status !== filterStatus) {
        return false;
      }
      if (q) {
        const matchName = s.name.toLowerCase().includes(q);
        const matchRa = s.ra.toLowerCase().includes(q);
        const matchClass = s.classCode.toLowerCase().includes(q);
        if (!matchName && !matchRa && !matchClass) return false;
      }
      return true;
    });
  }, [dataset.students, searchTerm, filterShift, filterModality, filterClassId, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  // Lista de turmas filtradas para o dropdown de alunos
  const availableClassesForDropdown = useMemo(() => {
    return dataset.classes.filter((c) => {
      if (filterShift !== 'ALL' && c.shift !== filterShift) return false;
      if (filterModality !== 'ALL' && c.modality !== filterModality) return false;
      return true;
    });
  }, [dataset.classes, filterShift, filterModality]);

  // Professores filtrados
  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    return persisted.teachers.filter((t) => {
      if (teacherAreaFilter !== 'ALL' && t.area !== teacherAreaFilter) return false;
      if (teacherShiftFilter !== 'ALL' && !t.shifts.includes(teacherShiftFilter)) return false;
      if (q) {
        const hay = `${t.name} ${t.registration} ${t.email} ${t.subjects.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [persisted.teachers, teacherSearch, teacherAreaFilter, teacherShiftFilter]);

  // Turmas filtradas na aba Turmas
  const filteredClasses = useMemo(() => {
    return dataset.classes.filter((c) => {
      if (classShiftFilter !== 'ALL' && c.shift !== classShiftFilter) return false;
      if (classModalityFilter !== 'ALL' && c.modality !== classModalityFilter) return false;
      return true;
    });
  }, [dataset.classes, classShiftFilter, classModalityFilter]);

  // Aluno selecionado no Drawer de Boletim Individual
  const selectedStudent = selectedStudentId ? studentMap.get(selectedStudentId) : null;
  const selectedStudentClass = selectedStudent ? classMap.get(selectedStudent.classId) : null;

  const selectedClassPeers = useMemo(() => {
    if (!selectedStudentClass) return [];
    return dataset.students.filter((s) => s.classId === selectedStudentClass.id);
  }, [dataset.students, selectedStudentClass]);

  // Handlers de alteração no banco LocalStorage (Deltas)
  function updatePersisted(updater) {
    setPersisted((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
  }

  function handleQuickSkipAdjust(student, deltaSkips, isIsolated = false) {
    const newTotal = Math.max(0, Math.min(student.totalClassesHeld, student.totalSkips + deltaSkips));
    const newIsolated = isIsolated
      ? Math.max(0, student.isolatedSkips + deltaSkips)
      : student.isolatedSkips;

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        studentMeta: {
          ...prev.overrides.studentMeta,
          [student.id]: {
            ...(prev.overrides.studentMeta?.[student.id] || {}),
            totalSkips: newTotal,
            isolatedSkips: newIsolated
          }
        }
      }
    }));
  }

  function handleStudentSubjectGradeChange(student, classObj, subject, bimesterKey, evalId, newValue) {
    const stuBimKey = `${student.id}__${subject.code}__${bimesterKey}`;
    const currentDetails = getSubjectBimesterDetails(
      student,
      classObj,
      subject,
      bimesterKey,
      persisted.config,
      persisted.overrides
    );

    // Garante que os valores atuais fiquem salvos antes de alterar um campo
    const nextGradesMap = {};
    for (const ev of currentDetails.assessments) {
      nextGradesMap[ev.id] = ev.grade;
    }
    if (newValue === '') {
      nextGradesMap[evalId] = '';
    } else {
      let num = Number(newValue);
      if (isNaN(num)) num = 0;
      num = Math.max(0, Math.min(10, num));
      nextGradesMap[evalId] = num;
    }

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        studentGrades: {
          ...prev.overrides.studentGrades,
          [stuBimKey]: {
            ...(prev.overrides.studentGrades?.[stuBimKey] || {}),
            grades: nextGradesMap
          }
        }
      }
    }));
  }

  function handleStudentSubjectSkipsChange(student, subject, bimesterKey, field, val) {
    const stuBimKey = `${student.id}__${subject.code}__${bimesterKey}`;
    const num = Math.max(0, Number(val) || 0);

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        studentGrades: {
          ...prev.overrides.studentGrades,
          [stuBimKey]: {
            ...(prev.overrides.studentGrades?.[stuBimKey] || {}),
            [field]: num
          }
        }
      }
    }));
  }

  function handleAssessmentMetaChange(classObj, subject, bimesterKey, evalIdx, field, val) {
    const evalScopeKey = `${classObj.id}__${subject.code}__${bimesterKey}`;
    const student = selectedStudent;
    const currentDetails = getSubjectBimesterDetails(
      student,
      classObj,
      subject,
      bimesterKey,
      persisted.config,
      persisted.overrides
    );

    const updatedList = currentDetails.assessments.map((ev, i) => {
      if (i !== evalIdx) return { id: ev.id, name: ev.name, date: ev.date, weight: ev.weight };
      return {
        id: ev.id,
        name: field === 'name' ? val : ev.name,
        date: field === 'date' ? val : ev.date,
        weight: field === 'weight' ? Number(val) || 0 : ev.weight
      };
    });

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        assessments: {
          ...prev.overrides.assessments,
          [evalScopeKey]: updatedList
        }
      }
    }));
  }

  function handleAddAssessmentInModal(classObj, subject, bimesterKey) {
    const evalScopeKey = `${classObj.id}__${subject.code}__${bimesterKey}`;
    const currentDetails = getSubjectBimesterDetails(
      selectedStudent,
      classObj,
      subject,
      bimesterKey,
      persisted.config,
      persisted.overrides
    );

    const updatedList = [
      ...currentDetails.assessments.map((ev) => ({
        id: ev.id,
        name: ev.name,
        date: ev.date,
        weight: ev.weight
      })),
      {
        id: `ev_${Date.now()}`,
        name: 'Nova Avaliação Extra',
        date: '28/09',
        weight: 20
      }
    ];

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        assessments: {
          ...prev.overrides.assessments,
          [evalScopeKey]: updatedList
        }
      }
    }));
  }

  function handleDeleteAssessmentInModal(classObj, subject, bimesterKey, evalIdx) {
    const evalScopeKey = `${classObj.id}__${subject.code}__${bimesterKey}`;
    const currentDetails = getSubjectBimesterDetails(
      selectedStudent,
      classObj,
      subject,
      bimesterKey,
      persisted.config,
      persisted.overrides
    );

    const updatedList = currentDetails.assessments
      .filter((_, i) => i !== evalIdx)
      .map((ev) => ({ id: ev.id, name: ev.name, date: ev.date, weight: ev.weight }));

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        assessments: {
          ...prev.overrides.assessments,
          [evalScopeKey]: updatedList
        }
      }
    }));
  }

  function handleDeleteStudent(stuId) {
    if (!window.confirm('Remover este aluno do diretório?')) return;
    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        deletedStudents: {
          ...prev.overrides.deletedStudents,
          [stuId]: true
        }
      }
    }));
    if (selectedStudentId === stuId) setSelectedStudentId(null);
  }

  function handleCreateStudent(e) {
    e.preventDefault();
    if (!newStudentForm.name.trim()) return;
    const targetClass = classMap.get(newStudentForm.classId) || dataset.classes[0];
    if (!targetClass) return;

    const newId = `stu_custom_${Date.now()}`;
    const newStu = {
      id: newId,
      ra: `2026${String(Math.floor(100000 + Math.random() * 899999))}-SP`,
      name: newStudentForm.name.trim(),
      classId: targetClass.id,
      className: targetClass.name,
      classCode: targetClass.code,
      serie: targetClass.serie,
      shift: targetClass.shift,
      modality: targetClass.modality,
      seed: Date.now() >>> 0,
      academicAffinity: 0.78,
      isChronicSkipper: false,
      overallAvg: 8.2,
      totalSkips: 4,
      isolatedSkips: 0,
      totalClassesHeld: (persisted.config.activeBimestersCount || 3) * 200,
      attendancePercent: 99.3,
      status: 'Aprovado'
    };

    updatePersisted((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        addedStudents: [newStu, ...(prev.overrides.addedStudents || [])]
      }
    }));

    setNewStudentForm({ name: '', classId: '' });
    setShowAddStudentModal(false);
    setSelectedStudentId(newId);
  }

  // Professores CRUD
  function handleCreateTeacher(e) {
    e.preventDefault();
    if (!newTeacherForm.name.trim()) return;
    const id = `prof_${Date.now()}`;
    const subjects = newTeacherForm.subjectsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newTeacher = {
      id,
      registration: `DOC-${Math.floor(203000 + Math.random() * 9000)}`,
      name: newTeacherForm.name.startsWith('Prof.')
        ? newTeacherForm.name.trim()
        : `Prof. ${newTeacherForm.name.trim()}`,
      email: newTeacherForm.email.trim() || `docente.${Date.now().toString().slice(-4)}@educacao.sp.gov.br`,
      area: newTeacherForm.area,
      subjects: subjects.length > 0 ? subjects : ['Disciplina Geral'],
      shifts: newTeacherForm.shifts.length > 0 ? newTeacherForm.shifts : ['Manhã'],
      modalities: newTeacherForm.modalities.length > 0 ? newTeacherForm.modalities : ['EM Regular'],
      weeklyHours: Number(newTeacherForm.weeklyHours) || 30,
      teacherSkips: 0,
      status: newTeacherForm.status,
      classesCount: Math.max(2, Math.round((Number(newTeacherForm.weeklyHours) || 30) / 4))
    };

    updatePersisted((prev) => ({
      ...prev,
      teachers: [newTeacher, ...prev.teachers]
    }));

    setShowAddTeacherModal(false);
    setNewTeacherForm({
      name: '',
      email: '',
      area: 'Matemática',
      subjectsText: 'Matemática',
      shifts: ['Manhã'],
      modalities: ['EM Regular'],
      weeklyHours: 30,
      status: 'Efetivo Ativo'
    });
  }

  function handleTeacherSkipDelta(teacherId, delta) {
    updatePersisted((prev) => ({
      ...prev,
      teachers: prev.teachers.map((t) =>
        t.id === teacherId ? { ...t, teacherSkips: Math.max(0, (t.teacherSkips || 0) + delta) } : t
      )
    }));
  }

  function handleSaveTeacherEdit(e) {
    e.preventDefault();
    if (!editingTeacher) return;
    updatePersisted((prev) => ({
      ...prev,
      teachers: prev.teachers.map((t) => (t.id === editingTeacher.id ? editingTeacher : t))
    }));
    setEditingTeacher(null);
  }

  function handleDeleteTeacher(teacherId) {
    if (!window.confirm('Remover este docente do corpo ativo?')) return;
    updatePersisted((prev) => ({
      ...prev,
      teachers: prev.teachers.filter((t) => t.id !== teacherId)
    }));
  }

  // Controles Granulares: Aplicar configurações e recalcular escola
  function handleApplyGranularConfig(e) {
    e.preventDefault();
    const nextConfig = {
      ...configDraft,
      year: Number(configDraft.year) || 2026,
      seed: Number(configDraft.seed) || 20260918,
      studentsPerClass: Math.max(15, Math.min(60, Number(configDraft.studentsPerClass) || 40)),
      morningEmRegularStudents: Math.max(0, Number(configDraft.morningEmRegularStudents) || 0),
      morningEmTecnicoStudents: Math.max(0, Number(configDraft.morningEmTecnicoStudents) || 0),
      afternoonEmRegularStudents: Math.max(0, Number(configDraft.afternoonEmRegularStudents) || 0),
      afternoonEmTecnicoStudents: Math.max(0, Number(configDraft.afternoonEmTecnicoStudents) || 0),
      nightEmRegularStudents: Math.max(0, Number(configDraft.nightEmRegularStudents) || 0),
      nightEjaStudents: Math.max(0, Number(configDraft.nightEjaStudents) || 0),
      activeBimestersCount: Math.max(1, Math.min(4, Number(configDraft.activeBimestersCount) || 3)),
      activitiesPerBimester: Math.max(1, Math.min(4, Number(configDraft.activitiesPerBimester) || 4)),
      minGrade: Math.max(0, Math.min(10, Number(configDraft.minGrade) || 0)),
      maxGrade: Math.max(0, Math.min(10, Number(configDraft.maxGrade) || 10)),
      baseSkipRatePercent: Math.max(0, Math.min(60, Number(configDraft.baseSkipRatePercent) || 0)),
      classSkipSpikeRatePercent: Math.max(0, Math.min(100, Number(configDraft.classSkipSpikeRatePercent) || 0)),
      teacherCount: Math.max(5, Math.min(300, Number(configDraft.teacherCount) || 92))
    };

    updatePersisted((prev) => ({
      ...prev,
      config: nextConfig,
      teachers:
        nextConfig.teacherCount !== prev.config.teacherCount || nextConfig.seed !== prev.config.seed
          ? regenerateTeachersList(nextConfig)
          : prev.teachers
    }));
    setPage(1);
    alert('Configurações granulares aplicadas! O diretório foi atualizado.');
  }

  function handleRandomizeNewSeed() {
    const newSeed = Math.floor(10000000 + Math.random() * 89999999);
    const nextConfig = { ...configDraft, seed: newSeed };
    setConfigDraft(nextConfig);
    updatePersisted((prev) => ({
      ...prev,
      config: nextConfig,
      teachers: regenerateTeachersList(nextConfig)
    }));
  }

  function handleResetFullPlatform() {
    if (!window.confirm('Restaurar toda a plataforma para o padrão inicial de 8.000 alunos?')) return;
    const def = getDefaultConfig();
    const fresh = {
      config: def,
      overrides: {
        studentMeta: {},
        studentGrades: {},
        assessments: {},
        classSubjects: {},
        addedStudents: [],
        deletedStudents: {}
      },
      teachers: regenerateTeachersList(def)
    };
    setPersisted(fresh);
    setConfigDraft(def);
    setSelectedStudentId(null);
    setBimesterModal(null);
    setPage(1);
  }

  // Exportar CSV dos alunos filtrados (útil para secretaria escolar)
  function handleExportCSV() {
    const slice = filteredStudents.slice(0, 1000);
    const header = 'RA,Nome,Turno,Modalidade,Turma,Media Geral,Faltas Totais,Gazetas,Frequencia (%),Situacao\n';
    const rows = slice
      .map(
        (s) =>
          `"${s.ra}","${s.name}","${s.shift}","${s.modality}","${s.classCode}",${s.overallAvg},${s.totalSkips},${s.isolatedSkips},${s.attendancePercent}%,"${s.status}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sige_diretorio_${slice.length}_alunos.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Soma prevista no rascunho de controles granulares
  const draftTotalStudents =
    (Number(configDraft.morningEmRegularStudents) || 0) +
    (Number(configDraft.morningEmTecnicoStudents) || 0) +
    (Number(configDraft.afternoonEmRegularStudents) || 0) +
    (Number(configDraft.afternoonEmTecnicoStudents) || 0) +
    (Number(configDraft.nightEmRegularStudents) || 0) +
    (Number(configDraft.nightEjaStudents) || 0);

  // Modal de detalhes do Bimestre (Avaliações + Pesos + Faltas)
  const bimesterModalData = useMemo(() => {
    if (!bimesterModal) return null;
    const stu = studentMap.get(bimesterModal.studentId);
    if (!stu) return null;
    const cls = classMap.get(stu.classId);
    if (!cls) return null;
    const sub = cls.subjects.find((x) => x.code === bimesterModal.subjectCode);
    if (!sub) return null;

    const details = getSubjectBimesterDetails(
      stu,
      cls,
      sub,
      bimesterModal.bimesterKey,
      persisted.config,
      persisted.overrides
    );
    const peers = dataset.students.filter((p) => p.classId === cls.id);
    const classAvg = getClassSubjectBimesterAverage(
      cls,
      peers,
      sub,
      bimesterModal.bimesterKey,
      persisted.config,
      persisted.overrides
    );

    return { stu, cls, sub, details, classAvg };
  }, [bimesterModal, studentMap, classMap, dataset.students, persisted.config, persisted.overrides]);

  return (
    <div className="saas-shell">
      {/* Cabeçalho Mobile Fixo */}
      <div className="mobile-header">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label="Abrir menu"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          ☰
        </button>
        <div className="mobile-brand">
          <span className="brand-logo-sm">S</span>
          <span>SIGE Pro</span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setNewStudentForm({ name: '', classId: dataset.classes[0]?.id || '' });
            setShowAddStudentModal(true);
          }}
        >
          + Aluno
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar SaaS Lateral (Drawer no Mobile) */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">S</div>
          <div>
            <div className="brand-title">SIGE Pro</div>
            <div className="brand-sub">School Directory SaaS</div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            &times;
          </button>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('dashboard')}
          >
            <span>📊</span> Visão Geral & Turnos
          </button>
          <button
            className={`nav-item ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('students')}
          >
            <span>🎓</span> Alunos & Faltas ({stats.totalStudents.toLocaleString('pt-BR')})
          </button>
          <button
            className={`nav-item ${activeTab === 'teachers' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('teachers')}
          >
            <span>👨‍🏫</span> Corpo Docente ({stats.totalTeachers})
          </button>
          <button
            className={`nav-item ${activeTab === 'classes' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('classes')}
          >
            <span>🏫</span> Turmas & Grades ({stats.totalClasses})
          </button>
          <button
            className={`nav-item ${activeTab === 'controls' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('controls')}
          >
            <span>🎛️</span> Controles Granulares
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="shift-summary-mini">
            <div className="mini-title">Distribuição Ativa</div>
            <div className="mini-row">
              <span>☀️ Manhã (EM Only)</span>
              <strong>{stats.byShift.Manhã.total.toLocaleString('pt-BR')}</strong>
            </div>
            <div className="mini-row">
              <span>🌤️ Tarde (EM Only)</span>
              <strong>{stats.byShift.Tarde.total.toLocaleString('pt-BR')}</strong>
            </div>
            <div className="mini-row">
              <span>🌙 Noite (EM + EJA)</span>
              <strong>{stats.byShift.Noite.total.toLocaleString('pt-BR')}</strong>
            </div>
          </div>
          <button className="btn-reset-side" onClick={handleResetFullPlatform}>
            Restaurar Padrão (8.000)
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="main-area">
        <header className="topbar">
          <div>
            <h1 className="page-title">{persisted.config.schoolName}</h1>
            <p className="page-subtitle">
              Ano Letivo {persisted.config.year} • {stats.totalStudents.toLocaleString('pt-BR')} alunos matriculados em{' '}
              {stats.totalClasses} turmas • Banco LocalStorage Híbrido Ativo
            </p>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-secondary" onClick={handleRandomizeNewSeed}>
              🎲 Nova Semente
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setNewStudentForm({ name: '', classId: dataset.classes[0]?.id || '' });
                setShowAddStudentModal(true);
              }}
            >
              + Matricular Aluno
            </button>
          </div>
        </header>

        {/* ==================== ABA 1: DASHBOARD EXECUTIVO ==================== */}
        {activeTab === 'dashboard' && (
          <section className="tab-content">
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Total de Alunos</div>
                <div className="kpi-value">{stats.totalStudents.toLocaleString('pt-BR')}</div>
                <div className="kpi-foot">{stats.totalClasses} turmas ativas</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Corpo Docente</div>
                <div className="kpi-value">{stats.totalTeachers}</div>
                <div className="kpi-foot">{stats.totalTeacherSkips} ausências docentes no ano</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Média Global da Escola</div>
                <div className="kpi-value">{stats.globalAvg}</div>
                <div className="kpi-foot">Frequência média: {stats.globalAttendance}%</div>
              </div>
              <div className="kpi-card kpi-alert">
                <div className="kpi-label">Alerta de Faltas / Gazetas</div>
                <div className="kpi-value">{stats.chronicSkippers.toLocaleString('pt-BR')}</div>
                <div className="kpi-foot">
                  {stats.retainedSkip} alunos abaixo de 75% de frequência
                </div>
              </div>
            </div>

            {/* Cards por Turno (Manhã EM Only, Tarde EM Only, Noite EM + EJA) */}
            <h2 className="section-heading">Estrutura por Turno e Modalidade</h2>
            <div className="shift-cards-grid">
              {[
                {
                  key: 'Manhã',
                  badge: 'EM ONLY',
                  icon: '☀️',
                  desc: 'Manhã • Exclusivo Ensino Médio (Regular + Técnico)'
                },
                {
                  key: 'Tarde',
                  badge: 'EM ONLY',
                  icon: '🌤️',
                  desc: 'Tarde (Noon) • Exclusivo Ensino Médio (Regular + Técnico)'
                },
                {
                  key: 'Noite',
                  badge: 'EM + EJA',
                  icon: '🌙',
                  desc: 'Noite • Ensino Médio Noturno + EJA (Educação de Jovens e Adultos)'
                }
              ].map((item) => {
                const sData = stats.byShift[item.key];
                const avg = sData.total ? (sData.avgSum / sData.total).toFixed(2) : '-';
                return (
                  <div className="shift-card" key={item.key}>
                    <div className="shift-card-head">
                      <span className="shift-title">
                        {item.icon} Turno {item.key}
                      </span>
                      <span className="modality-chip">{item.badge}</span>
                    </div>
                    <p className="shift-desc">{item.desc}</p>
                    <div className="shift-metrics">
                      <div>
                        <span>Matriculados</span>
                        <strong>{sData.total.toLocaleString('pt-BR')}</strong>
                      </div>
                      <div>
                        <span>Média do Turno</span>
                        <strong>{avg}</strong>
                      </div>
                      <div>
                        <span>Gazetas Registradas</span>
                        <strong className="text-danger">{sData.gazetas.toLocaleString('pt-BR')}</strong>
                      </div>
                    </div>
                    <div className="shift-breakdown">
                      <span>EM Regular: {sData.emReg.toLocaleString('pt-BR')}</span>
                      <span>EM Técnico: {sData.emTec.toLocaleString('pt-BR')}</span>
                      <span>EJA: {sData.eja.toLocaleString('pt-BR')}</span>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setFilterShift(item.key);
                        setFilterModality('ALL');
                        setFilterClassId('ALL');
                        setPage(1);
                        setActiveTab('students');
                      }}
                    >
                      Explorar Alunos do Turno &rarr;
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Resumo de Situação Acadêmica */}
            <div className="panel">
              <div className="panel-head">
                <h3>Distribuição de Situação Acadêmica (8.000 Alunos)</h3>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setFilterStatus('GAZETA');
                    setPage(1);
                    setActiveTab('students');
                  }}
                >
                  Filtrar Alunos com Gazetas Altas
                </button>
              </div>
              <div className="status-bars">
                {[
                  { label: 'Aprovados (Média ≥ 6 e Freq ≥ 75%)', count: stats.approved, cls: 'bar-green' },
                  { label: 'Em Recuperação (Média 4.5 - 5.9)', count: stats.recovery, cls: 'bar-amber' },
                  { label: 'Retidos por Nota (< 4.5)', count: stats.retainedGrade, cls: 'bar-red' },
                  { label: 'Retidos por Falta (< 75%)', count: stats.retainedSkip, cls: 'bar-purple' }
                ].map((row) => {
                  const pct = ((row.count / (stats.totalStudents || 1)) * 100).toFixed(1);
                  return (
                    <div className="status-bar-row" key={row.label}>
                      <div className="status-bar-info">
                        <span>{row.label}</span>
                        <strong>
                          {row.count.toLocaleString('pt-BR')} ({pct}%)
                        </strong>
                      </div>
                      <div className="bar-track">
                        <div className={`bar-fill ${row.cls}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ==================== ABA 2: DIRETÓRIO DE 8.000 ALUNOS & SKIPS ==================== */}
        {activeTab === 'students' && (
          <section className="tab-content">
            <div className="filters-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Buscar aluno por Nome, RA ou Turma..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />

              <select
                value={filterShift}
                onChange={(e) => {
                  setFilterShift(e.target.value);
                  setFilterClassId('ALL');
                  setPage(1);
                }}
              >
                <option value="ALL">Todos os Turnos</option>
                <option value="Manhã">☀️ Manhã (EM Only)</option>
                <option value="Tarde">🌤️ Tarde / Noon (EM Only)</option>
                <option value="Noite">🌙 Noite (EM + EJA)</option>
              </select>

              <select
                value={filterModality}
                onChange={(e) => {
                  setFilterModality(e.target.value);
                  setFilterClassId('ALL');
                  setPage(1);
                }}
              >
                <option value="ALL">Todas Modalidades</option>
                <option value="EM Regular">EM Regular</option>
                <option value="EM Técnico">EM Técnico (TI)</option>
                <option value="EJA">EJA (Noturno)</option>
              </select>

              <select
                value={filterClassId}
                onChange={(e) => {
                  setFilterClassId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Todas as Turmas ({availableClassesForDropdown.length})</option>
                {availableClassesForDropdown.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.modality}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Todas Situações</option>
                <option value="Aprovado">Aprovado</option>
                <option value="Em Recuperação">Em Recuperação</option>
                <option value="Retido por Nota">Retido por Nota</option>
                <option value="Retido por Falta">Retido por Falta</option>
                <option value="GAZETA">⚠️ Alerta de Gazetas (Skips)</option>
              </select>

              <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                📥 Exportar CSV
              </button>
            </div>

            <div className="table-meta-bar">
              <span>
                Exibindo <strong>{pagedStudents.length}</strong> de{' '}
                <strong>{filteredStudents.length.toLocaleString('pt-BR')}</strong> alunos encontrados
              </span>
              <div className="pagination">
                <button disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  &laquo; Anterior
                </button>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima &raquo;
                </button>
              </div>
            </div>

            <div className="table-card desktop-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>RA</th>
                    <th>Aluno(a)</th>
                    <th>Turma / Turno</th>
                    <th>Modalidade</th>
                    <th>Média Geral</th>
                    <th>Faltas (Skips)</th>
                    <th>Gazetas</th>
                    <th>Frequência</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStudents.map((stu) => (
                    <tr key={stu.id} className={stu.attendancePercent < 75 ? 'row-alert' : ''}>
                      <td className="mono">{stu.ra}</td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => setSelectedStudentId(stu.id)}
                          title="Abrir boletim completo de notas e faltas"
                        >
                          {stu.name}
                        </button>
                      </td>
                      <td>
                        <span className="class-pill">{stu.classCode}</span>{' '}
                        <span className="muted-sm">{stu.shift}</span>
                      </td>
                      <td>
                        <span className={`mod-badge mod-${stu.modality.replace(/\s+/g, '-').toLowerCase()}`}>
                          {stu.modality}
                        </span>
                      </td>
                      <td>
                        <span className={getGradeBadgeClass(stu.overallAvg)}>{stu.overallAvg}</span>
                      </td>
                      <td>
                        <div className="skip-stepper">
                          <button onClick={() => handleQuickSkipAdjust(stu, -1, false)} title="Remover 1 falta">
                            -
                          </button>
                          <span>{stu.totalSkips}</span>
                          <button onClick={() => handleQuickSkipAdjust(stu, 1, false)} title="Registrar +1 falta">
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="skip-stepper skip-gazeta">
                          <button onClick={() => handleQuickSkipAdjust(stu, -1, true)} title="Remover gazeta">
                            -
                          </button>
                          <span>{stu.isolatedSkips}</span>
                          <button onClick={() => handleQuickSkipAdjust(stu, 1, true)} title="Registrar +1 gazeta">
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <strong className={stu.attendancePercent < 75 ? 'text-danger' : 'text-ok'}>
                          {stu.attendancePercent}%
                        </strong>
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(stu.status)}>{stu.status}</span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button
                            className="btn btn-xs btn-primary"
                            onClick={() => setSelectedStudentId(stu.id)}
                          >
                            Boletim
                          </button>
                          <button
                            className="btn btn-xs btn-danger"
                            onClick={() => handleDeleteStudent(stu.id)}
                            title="Excluir aluno"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pagedStudents.length === 0 && (
                    <tr>
                      <td colSpan={10} className="empty-cell">
                        Nenhum aluno encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Cards Responsivos para Mobile (<= 768px) */}
            <div className="mobile-cards-list">
              {pagedStudents.map((stu) => (
                <div key={stu.id} className={`mobile-entity-card ${stu.attendancePercent < 75 ? 'card-alert' : ''}`}>
                  <div className="mobile-card-top">
                    <div>
                      <button className="link-btn mobile-card-title" onClick={() => setSelectedStudentId(stu.id)}>
                        {stu.name}
                      </button>
                      <div className="mono">RA {stu.ra}</div>
                    </div>
                    <span className={getGradeBadgeClass(stu.overallAvg)}>{stu.overallAvg}</span>
                  </div>

                  <div className="mobile-card-tags">
                    <span className="class-pill">{stu.classCode}</span>
                    <span className="muted-sm">{stu.shift}</span>
                    <span className={`mod-badge mod-${stu.modality.replace(/\s+/g, '-').toLowerCase()}`}>
                      {stu.modality}
                    </span>
                    <span className={getStatusBadgeClass(stu.status)}>{stu.status}</span>
                  </div>

                  <div className="mobile-card-metrics">
                    <div className="mobile-metric-item">
                      <span>Faltas</span>
                      <div className="skip-stepper">
                        <button onClick={() => handleQuickSkipAdjust(stu, -1, false)}>-</button>
                        <span>{stu.totalSkips}</span>
                        <button onClick={() => handleQuickSkipAdjust(stu, 1, false)}>+</button>
                      </div>
                    </div>
                    <div className="mobile-metric-item">
                      <span>Gazetas</span>
                      <div className="skip-stepper skip-gazeta">
                        <button onClick={() => handleQuickSkipAdjust(stu, -1, true)}>-</button>
                        <span>{stu.isolatedSkips}</span>
                        <button onClick={() => handleQuickSkipAdjust(stu, 1, true)}>+</button>
                      </div>
                    </div>
                    <div className="mobile-metric-item">
                      <span>Frequência</span>
                      <strong className={stu.attendancePercent < 75 ? 'text-danger' : 'text-ok'}>
                        {stu.attendancePercent}%
                      </strong>
                    </div>
                  </div>

                  <div className="mobile-card-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => setSelectedStudentId(stu.id)}>
                      Abrir Boletim
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteStudent(stu.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {pagedStudents.length === 0 && (
                <div className="empty-cell panel">Nenhum aluno encontrado com os filtros selecionados.</div>
              )}
            </div>
          </section>
        )}

        {/* ==================== ABA 3: GESTÃO DE PROFESSORES ==================== */}
        {activeTab === 'teachers' && (
          <section className="tab-content">
            <div className="filters-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Buscar professor por nome, matrícula ou disciplina..."
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
              />

              <select value={teacherAreaFilter} onChange={(e) => setTeacherAreaFilter(e.target.value)}>
                <option value="ALL">Todas as Áreas</option>
                <option value="Linguagens">Linguagens</option>
                <option value="Matemática">Matemática</option>
                <option value="Ciências da Natureza">Ciências da Natureza</option>
                <option value="Ciências Humanas">Ciências Humanas</option>
                <option value="Eixo Tecnológico TI">Eixo Tecnológico TI</option>
              </select>

              <select value={teacherShiftFilter} onChange={(e) => setTeacherShiftFilter(e.target.value)}>
                <option value="ALL">Todos os Turnos</option>
                <option value="Manhã">Manhã</option>
                <option value="Tarde">Tarde</option>
                <option value="Noite">Noite</option>
              </select>

              <button className="btn btn-primary" onClick={() => setShowAddTeacherModal(true)}>
                + Novo Professor
              </button>
            </div>

            <div className="table-card desktop-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Matrícula</th>
                    <th>Docente</th>
                    <th>Área</th>
                    <th>Componentes Atribuídos</th>
                    <th>Turnos / Modalidades</th>
                    <th>Carga Horária</th>
                    <th>Ausências (Skips)</th>
                    <th>Vínculo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.registration}</td>
                      <td>
                        <div className="teacher-name">{t.name}</div>
                        <div className="muted-sm">{t.email}</div>
                      </td>
                      <td>{t.area}</td>
                      <td>{t.subjects.join(', ')}</td>
                      <td>
                        <div>{t.shifts.join(' • ')}</div>
                        <div className="muted-sm">{t.modalities.join(', ')}</div>
                      </td>
                      <td>{t.weeklyHours}h/sem ({t.classesCount} turmas)</td>
                      <td>
                        <div className="skip-stepper">
                          <button onClick={() => handleTeacherSkipDelta(t.id, -1)}>-</button>
                          <span>{t.teacherSkips}</span>
                          <button onClick={() => handleTeacherSkipDelta(t.id, 1)}>+</button>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-tag ${
                            t.status === 'Efetivo Ativo'
                              ? 'status-ok'
                              : t.status === 'Substituto'
                              ? 'status-warn'
                              : 'status-danger'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button
                            className="btn btn-xs btn-secondary"
                            onClick={() => setEditingTeacher({ ...t })}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-xs btn-danger"
                            onClick={() => handleDeleteTeacher(t.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards Responsivos de Professores para Mobile */}
            <div className="mobile-cards-list">
              {filteredTeachers.map((t) => (
                <div key={t.id} className="mobile-entity-card">
                  <div className="mobile-card-top">
                    <div>
                      <div className="teacher-name">{t.name}</div>
                      <div className="mono">{t.registration} • {t.area}</div>
                      <div className="muted-sm">{t.email}</div>
                    </div>
                    <span
                      className={`status-tag ${
                        t.status === 'Efetivo Ativo'
                          ? 'status-ok'
                          : t.status === 'Substituto'
                          ? 'status-warn'
                          : 'status-danger'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="muted-sm">
                    <strong>Componentes:</strong> {t.subjects.join(', ')}
                  </div>
                  <div className="muted-sm">
                    <strong>Turnos:</strong> {t.shifts.join(' • ')} ({t.modalities.join(', ')})
                  </div>

                  <div className="mobile-card-metrics">
                    <div className="mobile-metric-item">
                      <span>Carga</span>
                      <strong>{t.weeklyHours}h ({t.classesCount} turmas)</strong>
                    </div>
                    <div className="mobile-metric-item">
                      <span>Ausências (Skips)</span>
                      <div className="skip-stepper">
                        <button onClick={() => handleTeacherSkipDelta(t.id, -1)}>-</button>
                        <span>{t.teacherSkips}</span>
                        <button onClick={() => handleTeacherSkipDelta(t.id, 1)}>+</button>
                      </div>
                    </div>
                  </div>

                  <div className="mobile-card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingTeacher({ ...t })}>
                      Editar Docente
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTeacher(t.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================== ABA 4: TURMAS & GRADES CURRICULARES ==================== */}
        {activeTab === 'classes' && (
          <section className="tab-content">
            <div className="filters-bar">
              <select value={classShiftFilter} onChange={(e) => setClassShiftFilter(e.target.value)}>
                <option value="ALL">Todos os Turnos</option>
                <option value="Manhã">☀️ Manhã (EM Only)</option>
                <option value="Tarde">🌤️ Tarde (EM Only)</option>
                <option value="Noite">🌙 Noite (EM + EJA)</option>
              </select>

              <select value={classModalityFilter} onChange={(e) => setClassModalityFilter(e.target.value)}>
                <option value="ALL">Todas Modalidades</option>
                <option value="EM Regular">EM Regular</option>
                <option value="EM Técnico">EM Técnico (TI)</option>
                <option value="EJA">EJA (Noturno)</option>
              </select>

              <span className="muted-sm">
                Mostrando {filteredClasses.length} de {dataset.classes.length} turmas
              </span>
            </div>

            <div className="classes-grid">
              {filteredClasses.slice(0, 90).map((cls) => (
                <div className="class-card" key={cls.id}>
                  <div className="class-card-head">
                    <strong>{cls.code}</strong>
                    <span className={`mod-badge mod-${cls.modality.replace(/\s+/g, '-').toLowerCase()}`}>
                      {cls.modality}
                    </span>
                  </div>
                  <div className="class-card-sub">
                    {cls.name} • {cls.room}
                  </div>
                  <div className="class-card-meta">
                    <span>Turno: <strong>{cls.shift}</strong></span>
                    <span>Alunos: <strong>{cls.studentCount}</strong></span>
                    <span>Matérias: <strong>{cls.subjects.length}</strong></span>
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setFilterShift(cls.shift);
                      setFilterModality(cls.modality);
                      setFilterClassId(cls.id);
                      setPage(1);
                      setActiveTab('students');
                    }}
                  >
                    Ver Alunos da Turma &rarr;
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================== ABA 5: CONTROLES GRANULARES ==================== */}
        {activeTab === 'controls' && (
          <section className="tab-content">
            <form className="controls-form" onSubmit={handleApplyGranularConfig}>
              <div className="panel">
                <h3>1. Identidade & Escala da Rede</h3>
                <div className="form-grid">
                  <label>
                    <span>Nome da Instituição / Rede</span>
                    <input
                      type="text"
                      value={configDraft.schoolName}
                      onChange={(e) => setConfigDraft({ ...configDraft, schoolName: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Ano Letivo</span>
                    <input
                      type="number"
                      value={configDraft.year}
                      onChange={(e) => setConfigDraft({ ...configDraft, year: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Semente Determinística (Seed)</span>
                    <input
                      type="number"
                      value={configDraft.seed}
                      onChange={(e) => setConfigDraft({ ...configDraft, seed: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Alunos por Turma</span>
                    <input
                      type="number"
                      min="15"
                      max="60"
                      value={configDraft.studentsPerClass}
                      onChange={(e) => setConfigDraft({ ...configDraft, studentsPerClass: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Total de Professores</span>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={configDraft.teacherCount}
                      onChange={(e) => setConfigDraft({ ...configDraft, teacherCount: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h3>2. Distribuição Granular por Turno & Modalidade</h3>
                  <span className="pill pill-green">
                    Total Previsto: {draftTotalStudents.toLocaleString('pt-BR')} Alunos
                  </span>
                </div>
                <div className="form-grid">
                  <label>
                    <span>☀️ Manhã — EM Regular (EM Only)</span>
                    <input
                      type="number"
                      min="0"
                      step="40"
                      value={configDraft.morningEmRegularStudents}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, morningEmRegularStudents: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>☀️ Manhã — EM Técnico TI (EM Only)</span>
                    <input
                      type="number"
                      min="0"
                      step="40"
                      value={configDraft.morningEmTecnicoStudents}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, morningEmTecnicoStudents: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>🌤️ Tarde (Noon) — EM Regular (EM Only)</span>
                    <input
                      type="number"
                      min="0"
                      step="40"
                      value={configDraft.afternoonEmRegularStudents}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, afternoonEmRegularStudents: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>🌤️ Tarde (Noon) — EM Técnico TI (EM Only)</span>
                    <input
                      type="number"
                      min="0"
                      step="40"
                      value={configDraft.afternoonEmTecnicoStudents}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, afternoonEmTecnicoStudents: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>🌙 Noite — Ensino Médio Noturno</span>
                    <input
                      type="number"
                      min="0"
                      step="40"
                      value={configDraft.nightEmRegularStudents}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, nightEmRegularStudents: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>🌙 Noite — EJA (Educação de Jovens e Adultos)</span>
                    <input
                      type="number"
                      min="0"
                      step="40"
                      value={configDraft.nightEjaStudents}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, nightEjaStudents: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="panel">
                <h3>3. Parâmetros Granulares de Notas, Avaliações e Faltas (Skips)</h3>
                <div className="form-grid">
                  <label>
                    <span>Bimestres Preenchidos (1 a 4)</span>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={configDraft.activeBimestersCount}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, activeBimestersCount: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Atividades por Bimestre (1 a 4)</span>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={configDraft.activitiesPerBimester}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, activitiesPerBimester: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Nota Mínima Base</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={configDraft.minGrade}
                      onChange={(e) => setConfigDraft({ ...configDraft, minGrade: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Nota Máxima Base</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={configDraft.maxGrade}
                      onChange={(e) => setConfigDraft({ ...configDraft, maxGrade: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Taxa Base de Faltas / Skips (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      step="0.5"
                      value={configDraft.baseSkipRatePercent}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, baseSkipRatePercent: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Incidência de Gazetas Crônicas (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={configDraft.classSkipSpikeRatePercent}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, classSkipSpikeRatePercent: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="controls-submit-row">
                <button type="button" className="btn btn-secondary" onClick={handleRandomizeNewSeed}>
                  🎲 Sortear Nova Semente
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Aplicar Configurações e Atualizar Diretório
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      {/* ==================== DRAWER: BOLETIM INDIVIDUAL DO ALUNO ==================== */}
      {selectedStudent && selectedStudentClass && (
        <div className="drawer-overlay" onClick={() => setSelectedStudentId(null)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <div className="muted-sm">RA {selectedStudent.ra} • {selectedStudent.shift} • {selectedStudent.modality}</div>
                <h2>{selectedStudent.name}</h2>
                <div className="muted-sm">{selectedStudentClass.name} ({selectedStudentClass.room})</div>
              </div>
              <button className="close-x" onClick={() => setSelectedStudentId(null)}>
                &times;
              </button>
            </div>

            <div className="drawer-kpis">
              <div>
                <span>Média Geral</span>
                <strong>{selectedStudent.overallAvg}</strong>
              </div>
              <div>
                <span>Faltas Totais</span>
                <strong>{selectedStudent.totalSkips}</strong>
              </div>
              <div>
                <span>Gazetas</span>
                <strong className="text-danger">{selectedStudent.isolatedSkips}</strong>
              </div>
              <div>
                <span>Frequência</span>
                <strong>{selectedStudent.attendancePercent}%</strong>
              </div>
            </div>

            <p className="drawer-tip">
              Clique em qualquer bimestre de um componente curricular abaixo para lançar notas, pesos, atividades e faltas/gazetas granulares.
            </p>

            <div className="boletim-table-wrap">
              <table className="boletim-table">
                <thead>
                  <tr>
                    <th>Componente Curricular</th>
                    {BIMESTERS.map((b) => (
                      <th key={b.key}>{b.short}</th>
                    ))}
                    <th>Conselho</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudentClass.subjects.map((sub) => {
                    let bSum = 0;
                    let bCount = 0;
                    const bimCells = BIMESTERS.map((b) => {
                      const det = getSubjectBimesterDetails(
                        selectedStudent,
                        selectedStudentClass,
                        sub,
                        b.key,
                        persisted.config,
                        persisted.overrides
                      );
                      if (det.average !== null) {
                        bSum += det.average;
                        bCount++;
                      }
                      return { b, det };
                    });
                    const finalAvg = bCount === 4 ? Number((bSum / 4).toFixed(1)) : null;

                    return (
                      <tr key={sub.code}>
                        <td>
                          <div className="sub-title">{sub.name}</div>
                          <div className="muted-sm">{sub.area} • {sub.weeklyClasses} aulas/sem</div>
                        </td>
                        {bimCells.map(({ b, det }) => (
                          <td
                            key={b.key}
                            className="clickable-bim"
                            onClick={() =>
                              setBimesterModal({
                                studentId: selectedStudent.id,
                                subjectCode: sub.code,
                                bimesterKey: b.key
                              })
                            }
                          >
                            <span className={getGradeBadgeClass(det.average)}>
                              {det.average !== null ? det.average : '-'}
                            </span>
                            <div className="mini-skip-tag">
                              {det.skips}f {det.isolatedSkips > 0 ? `(${det.isolatedSkips}g)` : ''}
                            </div>
                          </td>
                        ))}
                        <td>
                          <span className={getGradeBadgeClass(finalAvg, true)}>
                            {finalAvg !== null ? finalAvg : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: DETALHES DO BIMESTRE (AVALIAÇÕES & SKIPS) ==================== */}
      {bimesterModalData && (
        <div className="modal-overlay" onClick={() => setBimesterModal(null)}>
          <div className="modal-card-lg" onClick={(e) => e.stopPropagation()}>
            <button className="close-x top-right" onClick={() => setBimesterModal(null)}>
              &times;
            </button>

            <div className="modal-head-row">
              <div>
                <div className="muted-sm">
                  {bimesterModalData.stu.name} • {bimesterModalData.cls.code}
                </div>
                <h3>{bimesterModalData.sub.name}</h3>
              </div>
              <span className="modality-chip">{bimesterModalData.details.bimesterLabel}</span>
            </div>

            <div className="green-card-box">
              <div className="progress-item">
                <div className="progress-lbl">
                  <span>Média do Aluno</span>
                  <strong>
                    {bimesterModalData.details.average !== null ? bimesterModalData.details.average : '-'}
                  </strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-green"
                    style={{
                      width: `${
                        bimesterModalData.details.average !== null
                          ? Math.min(100, bimesterModalData.details.average * 10)
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>

              <div className="progress-item">
                <div className="progress-lbl">
                  <span>Média da Turma ({bimesterModalData.cls.code})</span>
                  <strong>{bimesterModalData.classAvg !== null ? bimesterModalData.classAvg : '-'}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-teal"
                    style={{
                      width: `${
                        bimesterModalData.classAvg !== null
                          ? Math.min(100, bimesterModalData.classAvg * 10)
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>

              <div className="skips-granular-box">
                <label>
                  <span>Faltas na Matéria (de {bimesterModalData.details.totalSubjectClasses} aulas)</span>
                  <input
                    type="number"
                    min="0"
                    max={bimesterModalData.details.totalSubjectClasses}
                    value={bimesterModalData.details.skips}
                    onChange={(e) =>
                      handleStudentSubjectSkipsChange(
                        bimesterModalData.stu,
                        bimesterModalData.sub,
                        bimesterModal.bimesterKey,
                        'skips',
                        e.target.value
                      )
                    }
                  />
                </label>
                <label>
                  <span>Gazetas Isoladas (Skips)</span>
                  <input
                    type="number"
                    min="0"
                    max={bimesterModalData.details.totalSubjectClasses}
                    value={bimesterModalData.details.isolatedSkips}
                    onChange={(e) =>
                      handleStudentSubjectSkipsChange(
                        bimesterModalData.stu,
                        bimesterModalData.sub,
                        bimesterModal.bimesterKey,
                        'isolatedSkips',
                        e.target.value
                      )
                    }
                  />
                </label>
                <div className="freq-pill">
                  Frequência: <strong>{bimesterModalData.details.attendancePercent}%</strong>
                </div>
              </div>

              <hr className="dashed-line" />

              <table className="eval-edit-table">
                <thead>
                  <tr>
                    <th>Avaliação</th>
                    <th>Data</th>
                    <th>Nota</th>
                    <th>Peso (%)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bimesterModalData.details.assessments.map((ev, idx) => (
                    <tr key={ev.id}>
                      <td>
                        <input
                          type="text"
                          value={ev.name}
                          onChange={(e) =>
                            handleAssessmentMetaChange(
                              bimesterModalData.cls,
                              bimesterModalData.sub,
                              bimesterModal.bimesterKey,
                              idx,
                              'name',
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="w-date"
                          value={ev.date}
                          onChange={(e) =>
                            handleAssessmentMetaChange(
                              bimesterModalData.cls,
                              bimesterModalData.sub,
                              bimesterModal.bimesterKey,
                              idx,
                              'date',
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="w-num"
                          min="0"
                          max="10"
                          step="0.1"
                          value={ev.grade === null ? '' : ev.grade}
                          onChange={(e) =>
                            handleStudentSubjectGradeChange(
                              bimesterModalData.stu,
                              bimesterModalData.cls,
                              bimesterModalData.sub,
                              bimesterModal.bimesterKey,
                              ev.id,
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="w-num"
                          min="0"
                          max="100"
                          value={ev.weight}
                          onChange={(e) =>
                            handleAssessmentMetaChange(
                              bimesterModalData.cls,
                              bimesterModalData.sub,
                              bimesterModal.bimesterKey,
                              idx,
                              'weight',
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="btn-icon-del"
                          onClick={() =>
                            handleDeleteAssessmentInModal(
                              bimesterModalData.cls,
                              bimesterModalData.sub,
                              bimesterModal.bimesterKey,
                              idx
                            )
                          }
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="modal-foot-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    handleAddAssessmentInModal(
                      bimesterModalData.cls,
                      bimesterModalData.sub,
                      bimesterModal.bimesterKey
                    )
                  }
                >
                  + Nova Avaliação
                </button>
                <span className="muted-sm">
                  Soma dos pesos:{' '}
                  {bimesterModalData.details.assessments.reduce((a, b) => a + (Number(b.weight) || 0), 0)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: MATRICULAR NOVO ALUNO ==================== */}
      {showAddStudentModal && (
        <div className="modal-overlay" onClick={() => setShowAddStudentModal(false)}>
          <form className="modal-card-sm" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateStudent}>
            <h3>Matricular Novo Aluno</h3>
            <label>
              <span>Nome Completo do Aluno</span>
              <input
                type="text"
                required
                placeholder="Ex: Ana Clara Oliveira"
                value={newStudentForm.name}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, name: e.target.value })}
              />
            </label>
            <label>
              <span>Turma / Turno / Modalidade</span>
              <select
                value={newStudentForm.classId}
                onChange={(e) => setNewStudentForm({ ...newStudentForm, classId: e.target.value })}
              >
                {dataset.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.shift} ({c.modality})
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddStudentModal(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Matricular
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: NOVO PROFESSOR ==================== */}
      {showAddTeacherModal && (
        <div className="modal-overlay" onClick={() => setShowAddTeacherModal(false)}>
          <form className="modal-card-sm" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateTeacher}>
            <h3>Cadastrar Novo Professor</h3>
            <label>
              <span>Nome do Docente</span>
              <input
                type="text"
                required
                placeholder="Ex: Prof. Marcos Vinícius"
                value={newTeacherForm.name}
                onChange={(e) => setNewTeacherForm({ ...newTeacherForm, name: e.target.value })}
              />
            </label>
            <label>
              <span>E-mail Institucional</span>
              <input
                type="email"
                placeholder="marcos@educacao.sp.gov.br"
                value={newTeacherForm.email}
                onChange={(e) => setNewTeacherForm({ ...newTeacherForm, email: e.target.value })}
              />
            </label>
            <label>
              <span>Área de Conhecimento</span>
              <select
                value={newTeacherForm.area}
                onChange={(e) => setNewTeacherForm({ ...newTeacherForm, area: e.target.value })}
              >
                <option value="Linguagens">Linguagens</option>
                <option value="Matemática">Matemática</option>
                <option value="Ciências da Natureza">Ciências da Natureza</option>
                <option value="Ciências Humanas">Ciências Humanas</option>
                <option value="Eixo Tecnológico TI">Eixo Tecnológico TI</option>
              </select>
            </label>
            <label>
              <span>Componentes (separados por vírgula)</span>
              <input
                type="text"
                value={newTeacherForm.subjectsText}
                onChange={(e) => setNewTeacherForm({ ...newTeacherForm, subjectsText: e.target.value })}
              />
            </label>
            <label>
              <span>Carga Horária Semanal</span>
              <input
                type="number"
                min="10"
                max="44"
                value={newTeacherForm.weeklyHours}
                onChange={(e) => setNewTeacherForm({ ...newTeacherForm, weeklyHours: e.target.value })}
              />
            </label>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddTeacherModal(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Cadastrar Docente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: EDITAR PROFESSOR ==================== */}
      {editingTeacher && (
        <div className="modal-overlay" onClick={() => setEditingTeacher(null)}>
          <form className="modal-card-sm" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveTeacherEdit}>
            <h3>Editar Docente ({editingTeacher.registration})</h3>
            <label>
              <span>Nome</span>
              <input
                type="text"
                required
                value={editingTeacher.name}
                onChange={(e) => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
              />
            </label>
            <label>
              <span>Carga Horária Semanal</span>
              <input
                type="number"
                min="10"
                max="44"
                value={editingTeacher.weeklyHours}
                onChange={(e) =>
                  setEditingTeacher({ ...editingTeacher, weeklyHours: Number(e.target.value) || 20 })
                }
              />
            </label>
            <label>
              <span>Vínculo / Situação</span>
              <select
                value={editingTeacher.status}
                onChange={(e) => setEditingTeacher({ ...editingTeacher, status: e.target.value })}
              >
                <option value="Efetivo Ativo">Efetivo Ativo</option>
                <option value="Substituto">Substituto</option>
                <option value="Licença Médica">Licença Médica</option>
              </select>
            </label>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingTeacher(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Barra de Navegação Inferior Fixa para Mobile */}
      <nav className="mobile-bottom-nav" aria-label="Navegação mobile">
        <button
          type="button"
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => handleSwitchTab('dashboard')}
        >
          <span>📊</span>
          <small>Visão</small>
        </button>
        <button
          type="button"
          className={activeTab === 'students' ? 'active' : ''}
          onClick={() => handleSwitchTab('students')}
        >
          <span>🎓</span>
          <small>Alunos</small>
        </button>
        <button
          type="button"
          className={activeTab === 'teachers' ? 'active' : ''}
          onClick={() => handleSwitchTab('teachers')}
        >
          <span>👨‍🏫</span>
          <small>Docentes</small>
        </button>
        <button
          type="button"
          className={activeTab === 'classes' ? 'active' : ''}
          onClick={() => handleSwitchTab('classes')}
        >
          <span>🏫</span>
          <small>Turmas</small>
        </button>
        <button
          type="button"
          className={activeTab === 'controls' ? 'active' : ''}
          onClick={() => handleSwitchTab('controls')}
        >
          <span>🎛️</span>
          <small>Controles</small>
        </button>
      </nav>
    </div>
  );
}
