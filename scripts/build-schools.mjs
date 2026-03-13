#!/usr/bin/env node
/**
 * Generate individual school pages at docs/schools/{slug}/index.html
 * and Spanish versions at docs/escuelas/{slug}/index.html.
 *
 * Data hardcoded from:
 *   - data/schools.json (directory info)
 *   - district-analysis-2025-26.md (CAASPP, demographics, budgets, staffing)
 *   - hr-data-briefing-2026-03.md (student growth, teacher demographics)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { headMeta, siteNav, siteFooter } from './html-parts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---- Load schools.json for base directory data ----
const schoolsData = JSON.parse(readFileSync(resolve(ROOT, 'data/schools.json'), 'utf-8'));

// ---- Load SARC data (expenditures per pupil) ----
const SARC_DATA = {};
for (const school of schoolsData.schools) {
  const sarcPath = resolve(ROOT, 'data/sarc', `${school.slug}.json`);
  if (existsSync(sarcPath)) {
    SARC_DATA[school.slug] = JSON.parse(readFileSync(sarcPath, 'utf-8'));
  }
}

// ---- Compute district average per-pupil expenditure from SARC data ----
const sarcSlugs = Object.keys(SARC_DATA);
const DISTRICT_AVG_PER_PUPIL = sarcSlugs.length > 0
  ? Math.round(sarcSlugs.reduce((s, k) => s + (SARC_DATA[k].expenditures?.schoolSite?.totalPerPupil || 0), 0) / sarcSlugs.length)
  : 0;

// ---- Load SpEd data ----
const SPED_ENROLLMENT = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'data/sped-enrollment.json'), 'utf-8')); } catch { return {}; } })();
const SPED_CATEGORIES = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'data/sped-categories.json'), 'utf-8')); } catch { return {}; } })();

// Compute district-wide SpEd averages
const districtSpedPct = SPED_ENROLLMENT.district
  ? (() => {
      const totalEnroll = Object.values(SPED_ENROLLMENT.schools || {}).reduce((s, sc) => s + (sc.totalEnrollment || 0), 0);
      const totalIep = SPED_ENROLLMENT.district.total || 0;
      return totalEnroll > 0 ? Math.round(totalIep / totalEnroll * 1000) / 10 : 0;
    })()
  : 0;
const districtInclusionPct = SPED_CATEGORIES.district?.placement
  ? Math.round(SPED_CATEGORIES.district.placement.regularGt80 / SPED_CATEGORIES.district.placement.total * 1000) / 10
  : 0;

// ---- Load board meeting summaries (concise per-school EN/ES) ----
const BOARD_SUMMARIES = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'data/school-board-summaries.json'), 'utf-8')); } catch { return {}; } })();

// ---- Load board meeting items and match to schools ----
const R2_BASE = 'https://data.rcsd.info';
const meetingsData = JSON.parse(readFileSync(resolve(ROOT, 'data/meetings-data.json'), 'utf-8'));
const timestampMap = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'data/timestamp-map.json'), 'utf-8')); } catch { return {}; } })();
const agendaAttachments = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'data/agenda-attachments.json'), 'utf-8')); } catch { return {}; } })();

// Build AID → R2 path lookup from board-memo JSON files
const aidToR2Path = {};
const memoDir = resolve(ROOT, 'data/board-memos');
try {
  for (const f of readdirSync(memoDir)) {
    if (!f.endsWith('.json')) continue;
    const memo = JSON.parse(readFileSync(resolve(memoDir, f), 'utf-8'));
    for (const item of memo.items) {
      for (const att of item.attachments) {
        if (att.aid && att.filename) {
          aidToR2Path[att.aid] = `board-packets/${memo.date}/${att.filename}`;
        }
      }
    }
  }
} catch {}

// Build AID → Simbli URL lookup from agenda-attachments.json
const aidToSimbliUrl = {};
for (const [, entry] of Object.entries(agendaAttachments)) {
  const atts = entry.attachments || entry;
  if (Array.isArray(atts)) {
    for (const att of atts) {
      if (att.aid && att.url) aidToSimbliUrl[att.aid] = att.url;
    }
  }
}

function attachmentUrl(aid) {
  if (aidToR2Path[aid]) return `${R2_BASE}/${aidToR2Path[aid]}`;
  if (aidToSimbliUrl[aid]) return aidToSimbliUrl[aid];
  return `https://simbli.eboardsolutions.com//Meetings/Attachment.aspx?S=36030397&AID=${aid}`;
}

// School name patterns for matching agenda item titles
const SCHOOL_NAME_PATTERNS = [
  { slug: 'adelante-selby', patterns: ['Adelante Selby', 'Adelante'] },
  { slug: 'clifford', patterns: ['Clifford'] },
  { slug: 'garfield', patterns: ['Garfield'] },
  { slug: 'henry-ford', patterns: ['Henry Ford'] },
  { slug: 'hoover', patterns: ['Hoover'] },
  { slug: 'kennedy', patterns: ['Kennedy'] },
  { slug: 'mckinley-mit', patterns: ['McKinley'] },
  { slug: 'north-star', patterns: ['North Star'] },
  { slug: 'orion', patterns: ['Orion'] },
  { slug: 'roosevelt', patterns: ['Roosevelt'] },
  { slug: 'roy-cloud', patterns: ['Roy Cloud'] },
  { slug: 'taft', patterns: ['Taft'] },
];

function matchSchoolSlugs(title) {
  // Exclude false positive: "Roosevelt Avenue"
  const normalized = title.replace(/Roosevelt\s+Ave(nue)?/gi, '___');
  const matches = new Set();
  for (const { slug, patterns } of SCHOOL_NAME_PATTERNS) {
    for (const p of patterns) {
      if (normalized.includes(p)) { matches.add(slug); break; }
    }
  }
  return [...matches];
}

// Build per-school board items: slug → [{date, type, title, attachments, videoId, timestampSeconds, meetingSlug}]
const SCHOOL_BOARD_ITEMS = {};
for (const s of schoolsData.schools) SCHOOL_BOARD_ITEMS[s.slug] = [];

for (const meeting of meetingsData.meetings) {
  const tsData = timestampMap[meeting.date];
  const videoId = tsData?.videoId || meeting.youtube;
  const meetingSlug = meeting.slug;

  for (let i = 0; i < (meeting.items || []).length; i++) {
    const item = meeting.items[i];
    const slugs = matchSchoolSlugs(item.title);
    if (slugs.length === 0) continue;

    const ts = tsData?.items?.[i];
    const entry = {
      date: meeting.date,
      type: meeting.type,
      title: item.title,
      attachments: (item.attachments || []).filter(a => a.aid || a.href).map(a => ({
        title: a.title,
        url: a.href || attachmentUrl(a.aid),
      })),
      videoId: videoId || null,
      timestampSeconds: ts?.timestampSeconds || null,
      meetingSlug,
    };

    for (const slug of slugs) {
      SCHOOL_BOARD_ITEMS[slug].push(entry);
    }
  }
}

// Sort each school's items newest-first
for (const slug of Object.keys(SCHOOL_BOARD_ITEMS)) {
  SCHOOL_BOARD_ITEMS[slug].sort((a, b) => b.date.localeCompare(a.date));
}

console.log(`Tagged ${Object.values(SCHOOL_BOARD_ITEMS).reduce((s, arr) => s + arr.length, 0)} board items across ${Object.keys(SCHOOL_BOARD_ITEMS).length} schools`);

// ---- Per-school enrichment data (from analysis docs) ----
// All numbers sourced from district-analysis-2025-26.md and hr-data-briefing-2026-03.md

const SCHOOL_DATA = {
  'adelante-selby': {
    description: 'Adelante Selby is RCSD\'s Spanish dual-language immersion school, using the SEAL bilingual model. It is a Community School and a school of choice, drawing families from across the district.',
    descriptionEs: 'Adelante Selby es la escuela de inmersión bilingüe en español del RCSD, que utiliza el modelo bilingüe SEAL. Es una Escuela Comunitaria y una escuela de elección, atrayendo familias de todo el distrito.',
    caaspp: { ela: 34, math: 36 },
    growth: { ela: 22.2, math: 9.2, elaTeachers: 6, mathTeachers: null },
    demographics: { sed: 62.6, el: 42.4, chronicAbsent: 15.4, suspension: 0.00 },
    funding: {
      spsaTotal: 854000, perPupil: 1467,
      titleI: 73000, district: 289000, ptoPta: 165000, measureU: 147000, prop28: 86000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 90.5, misassigned: 0, elMisassigned: 0 },
    teacherDemo: { hispanicStaff: 66.7, whiteStaff: null, over55: 33.3, under35: null },
    notes: 'Zero suspensions. Best teacher staffing in the district (91% credentialed, 0% misassignment). SEAL bilingual model. PTO ($150K) plus Unidos PTO ($15K).',
    notesEs: 'Cero suspensiones. El mejor personal docente del distrito (91% con credencial, 0% asignación incorrecta). Modelo bilingüe SEAL.',
  },
  'clifford': {
    description: 'Clifford is a TK-8 neighborhood school and one of the larger schools in the district. It serves a socioeconomically mixed population with a notable long-term English Learner challenge.',
    descriptionEs: 'Clifford es una escuela de vecindario de TK-8 y una de las escuelas más grandes del distrito. Sirve a una población socioeconómicamente diversa con un desafío notable de estudiantes de inglés a largo plazo.',
    caaspp: { ela: 55, math: 45 },
    growth: { ela: 12.5, math: 9.8, elaTeachers: 13, mathTeachers: null },
    demographics: { sed: 44.2, el: 23.5, chronicAbsent: 20.7, suspension: 1.39 },
    funding: {
      spsaTotal: 665000, perPupil: 951,
      titleI: 73000, district: 73000, ptoPta: 196000, measureU: 173000, prop28: 93000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 86.1, misassigned: 0, elMisassigned: null },
    teacherDemo: { hispanicStaff: null, whiteStaff: 75.0, over55: null, under35: null },
    notes: 'Largest PTO contribution ($196K) after North Star. LTEL crisis: 0% of long-term English Learners at grade level. White staff representation trending upward (75%, +8.3% over 4 years).',
    notesEs: 'La mayor contribución de PTO ($196K) después de North Star. Crisis de LTEL: 0% de estudiantes de inglés a largo plazo al nivel de grado.',
  },
  'garfield': {
    description: 'Garfield is a K-5 neighborhood Community School using a 50:50 bilingual model. It is among the highest-need schools in the district and has experienced significant enrollment decline. Despite low proficiency scores, Garfield teachers produce the highest ELA student growth in the district.',
    descriptionEs: 'Garfield es una Escuela Comunitaria de vecindario K-5 que utiliza un modelo bilingüe 50:50. Es una de las escuelas con mayores necesidades del distrito y ha experimentado una disminución significativa en la inscripción. A pesar de los bajos puntajes de competencia, los maestros de Garfield producen el mayor crecimiento estudiantil en ELA del distrito.',
    caaspp: { ela: 12, math: 8 },
    growth: { ela: 49.0, math: 22.8, elaTeachers: 4, mathTeachers: null },
    demographics: { sed: 95.0, el: 68.2, chronicAbsent: 28.8, suspension: 3.23 },
    funding: {
      spsaTotal: 243000, perPupil: 872,
      titleI: 55000, district: 0, ptoPta: 0, measureU: 79000, prop28: 90000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 87.4, misassigned: 0.3, elMisassigned: null },
    teacherDemo: { hispanicStaff: 52.6, whiteStaff: null, over55: null, under35: null },
    notes: '#1 ELA student growth in the district (49%). Exited CSI status in 2024. Enrollment declined from 515 to 279. No PTO funding. Hispanic staff improved from 35% to 52.6% over 4 years.',
    notesEs: 'N.º 1 en crecimiento estudiantil en ELA del distrito (49%). Salió del estatus CSI en 2024. La inscripción disminuyó de 515 a 279. Sin financiamiento de PTO.',
  },
  'henry-ford': {
    description: 'Henry Ford is a TK-5 neighborhood Community School serving a moderately high-need population. It has strong teacher credentialing but the most significant staff-student demographic mismatch in the district.',
    descriptionEs: 'Henry Ford es una Escuela Comunitaria de vecindario TK-5 que sirve a una población con necesidades moderadamente altas. Tiene una fuerte credencialización docente pero la mayor disparidad demográfica entre personal y estudiantes del distrito.',
    caaspp: { ela: 46, math: 38 },
    growth: { ela: 15.2, math: 10.2, elaTeachers: 6, mathTeachers: null },
    demographics: { sed: 63.1, el: 36.2, chronicAbsent: 24.8, suspension: 1.00 },
    funding: {
      spsaTotal: 681000, perPupil: 1523,
      titleI: 61000, district: 249000, ptoPta: 75000, measureU: 147000, prop28: 75000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 90.6, misassigned: 1.7, elMisassigned: null },
    teacherDemo: { hispanicStaff: 7.7, whiteStaff: 76.9, over55: null, under35: null },
    notes: 'Most extreme staff-student demographic mismatch: 77% White staff serving 67% Hispanic students. 20% special education population. Zero regrettable teacher attrition over 3 years.',
    notesEs: 'La mayor disparidad demográfica entre personal y estudiantes: 77% personal blanco sirviendo a 67% estudiantes hispanos. 20% población de educación especial.',
  },
  'hoover': {
    description: 'Hoover is a TK-8 neighborhood Community School and one of the highest-need schools in the district. Despite having the lowest teacher credentialing rate, Hoover\'s young staff produces the second-highest student growth in both ELA and Math. It offers a full K-8 music program and STEAM instruction.',
    descriptionEs: 'Hoover es una Escuela Comunitaria de vecindario TK-8 y una de las escuelas con mayores necesidades del distrito. A pesar de tener la tasa más baja de credencialización docente, el personal joven de Hoover produce el segundo mayor crecimiento estudiantil en ELA y Matemáticas. Ofrece un programa de música K-8 completo e instrucción STEAM.',
    caaspp: { ela: 17, math: 13 },
    growth: { ela: 36.0, math: 25.6, elaTeachers: 17, mathTeachers: null },
    demographics: { sed: 96.6, el: 66.9, chronicAbsent: 28.5, suspension: 4.79 },
    funding: {
      spsaTotal: 734000, perPupil: 1073,
      titleI: 128000, district: 0, ptoPta: 0, measureU: 183000, prop28: 116000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 52.0, misassigned: 36.7, elMisassigned: 35.2 },
    teacherDemo: { hispanicStaff: 37.5, whiteStaff: null, over55: null, under35: 47.5 },
    notes: 'Youngest staff in the district (47.5% under 35). Worst credentialing (52%) but #2 in student growth for both subjects. 10% of students experiencing homelessness. Zero resignations in 2024-25.',
    notesEs: 'El personal más joven del distrito (47.5% menor de 35 años). La menor credencialización (52%) pero N.º 2 en crecimiento estudiantil en ambas materias. 10% de estudiantes sin hogar.',
  },
  'kennedy': {
    description: 'Kennedy is the largest school in the district, a 6-8 neighborhood Community School and middle school. It has large within-school achievement gaps, with White students scoring significantly higher than Hispanic students. Recent principal leadership changes have led to significant staff turnover.',
    descriptionEs: 'Kennedy es la escuela más grande del distrito, una Escuela Comunitaria de vecindario de 6-8 grados y escuela secundaria. Tiene grandes brechas de logro dentro de la escuela, con estudiantes blancos obteniendo puntajes significativamente más altos que los estudiantes hispanos.',
    caaspp: { ela: 49, math: 30 },
    growth: { ela: 15.4, math: 11.2, elaTeachers: 30, mathTeachers: null },
    demographics: { sed: 65.8, el: 25.8, chronicAbsent: 23.8, suspension: 2.97 },
    funding: {
      spsaTotal: 563000, perPupil: 694,
      titleI: 76000, district: 96000, ptoPta: 20000, measureU: 192000, prop28: 117000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 60.5, misassigned: 22.3, elMisassigned: 16.7 },
    teacherDemo: { hispanicStaff: null, whiteStaff: null, over55: null, under35: null },
    notes: 'Stark within-school gap: White students 81% ELA vs. Hispanic 38%, EL 4%. Highest 3-year staff turnover (20 departures). Largest staff (30 evaluated teachers).',
    notesEs: 'Brecha marcada dentro de la escuela: estudiantes blancos 81% ELA vs. hispanos 38%, EL 4%. Mayor rotación de personal en 3 años (20 salidas).',
  },
  'mckinley-mit': {
    description: 'McKinley MIT is a 6-8 technology-focused middle school of choice and a Community School. It is ATSI-identified (Additional Targeted Support and Improvement) and receives the largest single district investment ($610K) for intervention programs. It has the lowest state test proficiency and highest suspension rate in the district.',
    descriptionEs: 'McKinley MIT es una escuela secundaria de elección enfocada en tecnología de 6-8 grados y una Escuela Comunitaria. Está identificada como ATSI (Apoyo y Mejora Adicional Dirigido) y recibe la mayor inversión distrital individual ($610K) para programas de intervención.',
    caaspp: { ela: 10, math: 7 },
    growth: { ela: 21.8, math: 20.0, elaTeachers: 22, mathTeachers: null },
    demographics: { sed: 92.6, el: 45.5, chronicAbsent: 0, suspension: 10.78 },
    funding: {
      spsaTotal: 795000, perPupil: 1656,
      titleI: 27000, district: 610000, ptoPta: 0, measureU: 75000, prop28: 77000,
      titleISchool: true, atsi: true,
    },
    staffing: { credentialed: 56.5, misassigned: 22.9, elMisassigned: 22.9 },
    teacherDemo: { hispanicStaff: 16.7, whiteStaff: null, over55: null, under35: null },
    notes: 'ATSI-identified. District\'s largest single public investment ($610K ATSI intervention). Lowest CAASPP proficiency. Highest suspension rate (10.78%). 78-point Hispanic staff-student gap (94.4% students / 16.7% staff). Chronic absenteeism reported as 0% -- likely a data error.',
    notesEs: 'Identificado como ATSI. La mayor inversión pública individual del distrito ($610K intervención ATSI). La competencia CAASPP más baja. La tasa de suspensión más alta (10.78%). Los datos de ausencia crónica (0%) probablemente contienen un error.',
  },
  'north-star': {
    description: 'North Star Academy is a 3-8 school of choice with the highest state test proficiency in the district but the lowest student growth rates. It receives no Title I or federal funds and has the lowest per-pupil public funding. Its PTA ($326K) covers 58% of the SPSA budget, filling the gap that categorical programs cover at other schools.',
    descriptionEs: 'North Star Academy es una escuela de elección de 3-8 grados con la mayor competencia en exámenes estatales del distrito pero las tasas más bajas de crecimiento estudiantil. No recibe fondos del Título I ni federales y tiene el financiamiento público per cápita más bajo. Su PTA ($326K) cubre el 58% del presupuesto SPSA.',
    caaspp: { ela: 96, math: 96 },
    growth: { ela: 9.6, math: 10.6, elaTeachers: 16, mathTeachers: null },
    demographics: { sed: 8.9, el: 2.5, chronicAbsent: 3.2, suspension: 0.19 },
    funding: {
      spsaTotal: 564000, perPupil: 1066,
      titleI: 0, district: 10000, ptoPta: 326000, measureU: 135000, prop28: 59000,
      titleISchool: false, atsi: false,
    },
    staffing: { credentialed: 79.7, misassigned: 0, elMisassigned: 0 },
    teacherDemo: { hispanicStaff: 19.0, whiteStaff: null, over55: 42.9, under35: null },
    notes: 'Highest retirement risk: 42.9% of staff over 55. Lowest ELA student growth (9.6%) despite highest proficiency. Every subgroup performs well (Hispanic 81%, SWD 72%). PTA provides $326K -- 58% of site budget.',
    notesEs: 'Mayor riesgo de jubilación: 42.9% del personal mayor de 55 años. El menor crecimiento estudiantil en ELA (9.6%) a pesar de la mayor competencia. Todos los subgrupos rinden bien.',
  },
  'orion': {
    description: 'Orion is a TK-5 alternative school of choice offering Mandarin dual-language immersion with a parent participation (co-op) model. It is the most ethnically diverse school in the district. Achievement gaps exist within the school between White and Hispanic students.',
    descriptionEs: 'Orion es una escuela alternativa de elección TK-5 que ofrece inmersión bilingüe en mandarín con un modelo de participación de padres (cooperativa). Es la escuela más diversa étnicamente del distrito.',
    caaspp: { ela: 53, math: 51 },
    growth: { ela: 11.4, math: 11.3, elaTeachers: 3, mathTeachers: null },
    demographics: { sed: 31.8, el: 22.8, chronicAbsent: 12.6, suspension: 0.21 },
    funding: {
      spsaTotal: 235000, perPupil: 456,
      titleI: 0, district: 0, ptoPta: 130000, measureU: 73000, prop28: 9000,
      titleISchool: false, atsi: false,
    },
    staffing: { credentialed: 68.4, misassigned: 14.6, elMisassigned: 14.6 },
    teacherDemo: { hispanicStaff: null, whiteStaff: null, over55: null, under35: null },
    notes: 'Most ethnically diverse school (35% Hispanic, 23% multiracial, 21% White, 18% Asian). Achievement gap: White 77% vs Hispanic 29% ELA. 33% Chinese staff (Mandarin immersion). Parent co-op model with high engagement.',
    notesEs: 'La escuela más diversa étnicamente (35% hispanos, 23% multirraciales, 21% blancos, 18% asiáticos). Brecha de logro: blancos 77% vs hispanos 29% ELA. Modelo cooperativo de padres.',
  },
  'roosevelt': {
    description: 'Roosevelt is a TK-5 neighborhood Community School that has experienced the steepest enrollment decline in the district, transitioning from K-8 to K-5. It has significant teacher qualification challenges, particularly with EL misassignment.',
    descriptionEs: 'Roosevelt es una Escuela Comunitaria de vecindario TK-5 que ha experimentado la mayor disminución de inscripción del distrito, pasando de K-8 a K-5. Tiene desafíos significativos de calificación docente.',
    caaspp: { ela: 16, math: 18 },
    growth: { ela: 21.5, math: 16.8, elaTeachers: 6, mathTeachers: null },
    demographics: { sed: 69.5, el: 42.6, chronicAbsent: 26.9, suspension: 3.11 },
    funding: {
      spsaTotal: 223000, perPupil: 569,
      titleI: 40000, district: 0, ptoPta: 0, measureU: 0, prop28: 88000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 56.5, misassigned: 28.1, elMisassigned: 28.1 },
    teacherDemo: { hispanicStaff: null, whiteStaff: null, over55: null, under35: null },
    notes: 'Steepest enrollment decline (529 to 344). Transitioned from K-8 to K-5. Science proficiency just 6.8%. 3 regrettable teacher attritions over 3 years (tied for most with McKinley).',
    notesEs: 'Mayor disminución de inscripción (529 a 344). Transicionó de K-8 a K-5. Competencia en ciencias solo 6.8%.',
  },
  'roy-cloud': {
    description: 'Roy Cloud is a TK-8 neighborhood school serving a relatively low-need population. It is one of the higher-performing schools in the district. Despite strong overall performance, its EL and LTEL subgroups are rated RED on the California Dashboard.',
    descriptionEs: 'Roy Cloud es una escuela de vecindario TK-8 que sirve a una población con necesidades relativamente bajas. Es una de las escuelas de mayor rendimiento del distrito. A pesar del fuerte rendimiento general, sus subgrupos de EL y LTEL están calificados en ROJO en el Panel de California.',
    caaspp: { ela: 67, math: 59 },
    growth: { ela: 17.5, math: 15.9, elaTeachers: 13, mathTeachers: null },
    demographics: { sed: 11.4, el: 3.4, chronicAbsent: 8.0, suspension: 1.75 },
    funding: {
      spsaTotal: 415000, perPupil: 652,
      titleI: 0, district: 234000, ptoPta: 113000, measureU: 59000, prop28: 0,
      titleISchool: false, atsi: false,
    },
    staffing: { credentialed: 79.7, misassigned: 8.3, elMisassigned: null },
    teacherDemo: { hispanicStaff: 13.5, whiteStaff: 70.3, over55: 29.7, under35: null },
    notes: 'EL/LTEL subgroups rated RED on California Dashboard despite strong overall scores. DEI Literature Lift initiative ($33K). Rainbow Cloud GSA. Hispanic staff improved from 9% to 13.5% over 4 years.',
    notesEs: 'Subgrupos EL/LTEL calificados en ROJO en el Panel de California a pesar de puntajes generales fuertes. Iniciativa DEI Literature Lift ($33K).',
  },
  'taft': {
    description: 'Taft is a TK-5 neighborhood Community School using a 50:50 bilingual model for K-3. It has one of the smallest budgets despite being among the highest-need schools. Taft\'s young teaching staff produces the highest Math student growth in the district.',
    descriptionEs: 'Taft es una Escuela Comunitaria de vecindario TK-5 que utiliza un modelo bilingüe 50:50 para K-3. Tiene uno de los presupuestos más pequeños a pesar de ser una de las escuelas con mayores necesidades. El personal docente joven de Taft produce el mayor crecimiento estudiantil en matemáticas del distrito.',
    caaspp: { ela: 19, math: 13 },
    growth: { ela: 22.6, math: 27.6, elaTeachers: 7, mathTeachers: null },
    demographics: { sed: 90.0, el: 65.7, chronicAbsent: 26.7, suspension: 0.51 },
    funding: {
      spsaTotal: 190000, perPupil: 521,
      titleI: 42000, district: 0, ptoPta: 0, measureU: 48000, prop28: 72000,
      titleISchool: true, atsi: false,
    },
    staffing: { credentialed: 56.3, misassigned: 15.6, elMisassigned: 15.6 },
    teacherDemo: { hispanicStaff: 29.2, whiteStaff: null, over55: null, under35: 41.7 },
    notes: '#1 Math student growth (27.6%), #3 ELA growth. Youngest staff in district alongside Hoover (41.7% under 35). Smallest SPSA budget ($190K). Exited ATSI in 2024-25. 7% of students experiencing homelessness.',
    notesEs: 'N.º 1 en crecimiento estudiantil en matemáticas (27.6%), N.º 3 en crecimiento en ELA. Personal más joven del distrito junto con Hoover (41.7% menor de 35). El presupuesto SPSA más pequeño ($190K).',
  },
};

// ---- Page-specific CSS ----
const schoolCSS = `
  .section a {
    color: var(--green-mid);
    text-decoration-color: var(--rule);
    text-underline-offset: 2px;
    transition: color 0.15s, text-decoration-color 0.15s;
  }
  .section a:hover {
    color: var(--green-deep);
    text-decoration-color: var(--green-mid);
  }

  /* ---- HEADER ---- */
  .site-header {
    background: var(--green-deep);
    color: var(--cream);
    padding: 0;
    position: relative;
    overflow: hidden;
  }

  .site-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 80%, rgba(74,140,106,0.3) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(196,132,45,0.15) 0%, transparent 50%);
    pointer-events: none;
  }

  .header-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 3.5rem 2rem 3rem;
    position: relative;
  }

  .header-district {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--green-light);
    margin-bottom: 0.5rem;
  }

  .header-district a {
    color: var(--green-light);
    text-decoration: none;
    transition: color 0.2s;
  }
  .header-district a:hover {
    color: #fff;
  }

  .header-logo {
    height: 120px;
    width: auto;
    max-width: 480px;
    margin-bottom: 1.2rem;
    object-fit: contain;
    background: #fff;
    padding: 14px 24px;
    border-radius: 12px;
  }

  .header-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.8rem, 4.5vw, 2.8rem);
    font-weight: 300;
    line-height: 1.15;
    color: #fff;
    max-width: 600px;
    font-optical-sizing: auto;
  }

  .header-subtitle {
    margin-top: 1rem;
    font-size: 0.92rem;
    color: rgba(255,255,255,0.6);
    line-height: 1.6;
    max-width: 520px;
    font-style: italic;
  }

  .header-meta {
    margin-top: 1.8rem;
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .header-stat {
    display: flex;
    flex-direction: column;
  }

  .header-stat-value {
    font-family: 'Fraunces', serif;
    font-size: 1.6rem;
    font-weight: 600;
    color: #fff;
    line-height: 1;
  }

  .header-stat-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.45);
    margin-top: 0.35rem;
  }

  /* ---- SCHOOL TYPE BADGE ---- */
  .school-badge {
    display: inline-block;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.25rem 0.6rem;
    border-radius: 3px;
    margin-top: 1rem;
  }
  .school-badge.neighborhood {
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.7);
  }
  .school-badge.choice {
    background: rgba(196,132,45,0.25);
    color: var(--amber-light);
  }
  .school-badge.community {
    background: rgba(74,140,106,0.25);
    color: var(--green-pale);
    margin-left: 0.4rem;
  }

  /* ---- DISCLAIMER ---- */
  .disclaimer {
    background: #fff3cd;
    border-bottom: 2px solid #e0c36a;
    padding: 0.75rem 1.5rem;
    text-align: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.01em;
    line-height: 1.6;
    color: #664d03;
  }

  /* ---- LANG SWITCH ---- */
  .lang-switch {
    background: var(--cream-dark);
    border-bottom: 1px solid var(--rule);
    text-align: center;
    padding: 0.5rem 1rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
  }
  .lang-switch a {
    color: var(--green-mid);
    text-decoration: none;
  }
  .lang-switch a:hover {
    text-decoration: underline;
  }

  /* ---- NAV ---- */
  .toc {
    background: var(--cream-dark);
    border-bottom: 1px solid var(--rule);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .toc-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    gap: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .toc-inner::-webkit-scrollbar { display: none; }

  .toc a {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.9rem 0.9rem;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }

  .toc a:hover {
    color: var(--green-mid);
    border-bottom-color: var(--green-light);
  }

  /* ---- MAIN ---- */
  .content {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 2rem 6rem;
  }

  /* ---- SECTIONS ---- */
  .section {
    padding-top: 3.5rem;
  }

  .section-rule {
    width: 100%;
    height: 1px;
    background: var(--rule);
    margin-bottom: 0;
  }

  .section-num {
    font-family: 'Fraunces', serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--green-light);
    display: inline-block;
    margin-bottom: 0.3rem;
    letter-spacing: 0.02em;
  }

  h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 400;
    line-height: 1.2;
    color: var(--green-deep);
    margin-bottom: 1.5rem;
    font-optical-sizing: auto;
  }

  h3 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin-top: 2.5rem;
    margin-bottom: 0.8rem;
    line-height: 1.3;
  }

  p {
    margin-bottom: 1rem;
    max-width: 640px;
  }

  .wide p {
    max-width: none;
  }

  .source {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .source a {
    color: var(--text-muted);
    text-decoration: underline;
    text-decoration-color: var(--rule-light);
    text-underline-offset: 2px;
  }
  .source a:hover {
    color: var(--green-mid);
    text-decoration-color: var(--green-mid);
  }

  /* ---- TABLES ---- */
  .table-wrap {
    overflow-x: auto;
    margin: 1.2rem 0 1.5rem;
    -webkit-overflow-scrolling: touch;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  thead th {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    padding: 0.6rem 0.8rem;
    border-bottom: 2px solid var(--green-deep);
    white-space: nowrap;
  }

  thead th.num {
    text-align: right;
  }

  tbody td {
    padding: 0.55rem 0.8rem;
    border-bottom: 1px solid var(--rule-light);
    vertical-align: top;
  }

  tbody td.num {
    text-align: right;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  tbody td.label-cell {
    font-weight: 500;
    white-space: nowrap;
  }

  tbody tr:last-child td {
    border-bottom: 2px solid var(--rule);
  }

  tbody tr.total-row td {
    font-weight: 500;
    border-top: 2px solid var(--green-deep);
    border-bottom: 2px solid var(--green-deep);
    background: var(--green-wash);
  }

  tbody tr:hover td {
    background: var(--green-wash);
  }

  /* Visual bar inside table cells */
  .bar-cell {
    position: relative;
    min-width: 100px;
  }

  .bar {
    display: inline-block;
    height: 6px;
    border-radius: 3px;
    margin-right: 0.5rem;
    vertical-align: middle;
    transition: width 0.4s ease;
  }

  .bar-green { background: var(--green-light); }
  .bar-amber { background: var(--amber); }
  .bar-coral { background: var(--coral); }

  /* ---- CALLOUT BOXES ---- */
  .callout {
    background: var(--green-wash);
    border-left: 3px solid var(--green-light);
    padding: 1.2rem 1.5rem;
    margin: 1.5rem 0;
    font-size: 0.92rem;
    max-width: none;
  }

  .callout p {
    max-width: none;
    margin-bottom: 0.5rem;
  }

  .callout p:last-child { margin-bottom: 0; }

  .callout-amber {
    background: #fef8ee;
    border-left-color: var(--amber);
  }

  /* ---- STAT GRID ---- */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .stat-card {
    background: #fff;
    border: 1px solid var(--rule-light);
    padding: 1.2rem;
  }

  .stat-card-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.3rem;
  }

  .stat-card-value {
    font-family: 'Fraunces', serif;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.1;
    color: var(--green-deep);
  }

  .stat-card-note {
    font-size: 0.78rem;
    color: var(--text-secondary);
    margin-top: 0.3rem;
    line-height: 1.4;
  }
  .info-bubble { position:relative; display:inline-flex; align-items:center; margin-left:0.25rem; vertical-align:middle; }
  .info-bubble-icon { font-family:'IBM Plex Mono',monospace; font-size:0.55rem; color:var(--text-muted); cursor:pointer; width:14px; height:14px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--rule); border-radius:50%; line-height:1; transition:border-color 0.2s,color 0.2s; }
  .info-bubble-icon:hover { border-color:var(--green-mid); color:var(--green-mid); }
  .info-bubble-tip { display:none; position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); background:var(--green-deep); color:rgba(255,255,255,0.9); padding:0.4rem 0.7rem; border-radius:4px; font-family:'IBM Plex Mono',monospace; font-size:0.6rem; white-space:nowrap; z-index:100; pointer-events:auto; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
  .info-bubble-tip::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%); border:5px solid transparent; border-top-color:var(--green-deep); }
  .info-bubble-tip a { color:#fff; text-decoration:underline; }
  .info-bubble-tip a:hover { color:var(--green-pale); }
  .info-bubble:hover .info-bubble-tip, .info-bubble:focus-within .info-bubble-tip { display:block; }

  /* ---- RESOURCE CARDS ---- */
  .resource-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .resource-card {
    background: #fff;
    border: 1px solid var(--rule-light);
    padding: 1.2rem 1.5rem;
    transition: border-color 0.2s;
  }

  .resource-card:hover {
    border-color: var(--green-light);
  }

  .resource-card h4 {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--green-mid);
    margin-bottom: 0.4rem;
  }

  .resource-card p {
    font-size: 0.85rem;
    color: var(--text-secondary);
    max-width: none;
    margin-bottom: 0;
    line-height: 1.5;
  }

  .resource-card a {
    color: var(--green-mid);
    text-decoration: none;
    font-weight: 500;
  }
  .resource-card a:hover {
    text-decoration: underline;
  }

  .resource-card .coming-soon {
    font-style: italic;
    color: var(--text-muted);
  }

  /* ---- BELL SCHEDULE ---- */
  .resource-card.bell-card {
    grid-column: 1 / -1;
    background: var(--green-wash);
    border-color: var(--green-pale);
  }
  .resource-card.bell-card:hover {
    border-color: var(--green-light);
  }

  .bell-supervision {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.6rem;
    letter-spacing: 0.02em;
  }

  .bell-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .bell-table thead th {
    text-align: left;
    padding: 0.35rem 0.6rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--green-mid);
    border-bottom: 2px solid var(--green-pale);
    vertical-align: bottom;
  }

  .bell-col-label {
    display: block;
  }

  .bell-col-sub {
    display: block;
    font-family: 'Newsreader', Georgia, serif;
    font-size: 0.72rem;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-muted);
    margin-top: 0.1rem;
  }

  .bell-table tbody td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    color: var(--text);
    white-space: nowrap;
  }

  .bell-table tbody tr:last-child td {
    border-bottom: none;
  }

  .bell-table tbody tr:hover td {
    background: rgba(45,90,63,0.06);
  }

  .bell-grade {
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 500;
    font-size: 0.8rem;
    color: var(--green-deep);
    min-width: 3.5em;
  }

  .bell-time-range {
    letter-spacing: 0.01em;
  }

  .bell-dash {
    color: var(--text-muted);
    padding: 0 0.1em;
  }

  .bell-card-inner {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  @media (max-width: 600px) {
    .bell-table { font-size: 0.8rem; }
    .bell-table thead th { font-size: 0.62rem; padding: 0.3rem 0.4rem; }
    .bell-table tbody td { padding: 0.35rem 0.4rem; }
  }

  /* ---- BACK LINK ---- */
  .back-link {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 2rem;
    transition: color 0.2s;
  }
  .back-link:hover {
    color: var(--green-mid);
  }

  /* ---- FUNDING BREAKDOWN ---- */
  .funding-bar {
    display: flex;
    height: 18px;
    border-radius: 4px;
    overflow: hidden;
    margin: 1rem 0 0.8rem;
    background: var(--rule-light);
  }
  .funding-bar-segment {
    height: 100%;
    transition: width 0.4s ease;
  }
  .funding-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1.5rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }
  .funding-legend-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .funding-legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ---- RESPONSIVE ---- */
  /* ---- PRINCIPAL + TABLE LAYOUT ---- */
  .principal-row {
    display: flex;
    gap: 2rem;
    margin: 2rem 0 1.5rem;
    align-items: flex-start;
  }

  @media (max-width: 640px) {
    html { font-size: 15px; }
    .header-inner { padding: 2.5rem 1.2rem 2rem; }
    .content { padding: 0 1.2rem 4rem; }
    .header-meta { gap: 1.5rem; }
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .resource-grid { grid-template-columns: 1fr; }
    .toc a { padding: 0.8rem 0.6rem; font-size: 0.6rem; }
    .principal-row { flex-direction: column; align-items: center; gap: 1rem; }
  }

  /* page-specific footer overrides */
  .site-footer { font-size: 0.8rem; text-align: left; }
  .footer-nav { margin-top: 1rem; }
  .footer-nav a { font-size: 0.68rem; margin: 0 1.5rem 0 0; }`;


// ---- Helpers ----

function fmt(n) {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('en-US');
}

function fmtDollar(n) {
  if (!n) return '--';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '--';
  return `${n}%`;
}

function barClass(pct) {
  if (pct >= 50) return 'bar-green';
  if (pct >= 25) return 'bar-amber';
  return 'bar-coral';
}

function barWidth(pct, max = 60) {
  return Math.max(1, Math.round((pct / 100) * max));
}

function rctStatusNote(pto, isEs) {
  if (!pto?.rctStatus || pto.rctStatus === 'current') return '';
  const labels = {
    'not-registered': isEs
      ? 'No registrado en el Registro de Fideicomisos Caritativos de CA'
      : 'Not registered with CA Registry of Charitable Trusts',
    'delinquency-notice': isEs
      ? 'Aviso de morosidad en el Registro de CA'
      : 'Delinquency notice on file with CA Registry',
    'missing-documents': isEs
      ? 'Documentos faltantes en el Registro de CA'
      : 'Missing documents on file with CA Registry',
    'current-in-process': isEs
      ? 'Registro de CA en proceso de revisión'
      : 'CA Registry filing under review',
  };
  const text = labels[pto.rctStatus];
  if (!text) return '';
  const isWarning = ['not-registered', 'delinquency-notice', 'missing-documents'].includes(pto.rctStatus);
  const color = isWarning ? 'var(--coral)' : 'var(--text-muted)';
  return `<p style="font-size:0.75rem; color:${color}; margin-top:0.3rem">${text}</p>`;
}

// ---- Funding bar colors ----
const FUNDING_COLORS = {
  titleI: '#4a8c6a',     // green-light
  district: '#1a3a2a',   // green-deep
  ptoPta: '#c4842d',     // amber
  measureU: '#5b9bd5',   // blue
  prop28: '#9b7cb8',     // purple
};

// ---- Labels ----
const LABELS = {
  en: {
    overview: 'Overview',
    academics: 'Academic Performance',
    demographics: 'Student Demographics',
    funding: 'Funding',
    staffing: 'Staffing',
    resources: 'Documents & Resources',
    grades: 'Grades',
    enrollment: 'Enrollment',
    principal: 'Principal',
    highNeed: 'High-need',
    schoolType: 'School type',
    neighborhood: 'Neighborhood',
    choice: 'School of Choice',
    choiceTip: 'Families from anywhere in the district can apply to attend a School of Choice through the open enrollment process.',
    neighborhoodTip: 'A neighborhood school enrolls students who live within its attendance area boundaries. Families can also apply through open enrollment.',
    communitySchool: 'Community School',
    program: 'Special program',
    studentGrowth: 'Student Growth',
    growthNote: 'Growth measures how much students are learning each year, regardless of their starting point. A school with low proficiency but high growth is accelerating learning. Proficiency measures how many students are at or above grade level right now.',
    growthFinePrint: 'Growth = % of students achieving 105%+ of expected growth on the CAASPP (California Assessment of Student Performance and Progress), the annual state standardized test for grades 3\u20138. Proficiency = % meeting or exceeding grade-level standards.',
    elaGrowth: 'English Growth',
    mathGrowth: 'Math Growth',
    districtAvgElaGrowth: 'District avg: 20.7%',
    districtAvgMathGrowth: 'District avg: 13.8%',
    caasppProficiency: 'CA State Testing (2023-24)',
    elaProficiency: 'English Proficiency',
    mathProficiency: 'Math Proficiency',
    districtAvgEla: 'District avg: 42%',
    districtAvgMath: 'District avg: 35%',
    teachersEvaluated: 'teachers evaluated',
    sed: 'Socioeconomically Disadvantaged',
    el: 'English Learners',
    chronicAbsent: 'Chronic Absenteeism',
    suspension: 'Suspension Rate',
    iepRate: 'Students with IEPs',
    inclusionRate: 'Inclusive Placement',
    inclusionTip: '% of IEP students in regular classroom 80%+ of the day',
    districtAvgAbsent: 'District avg: 18.3%',
    districtAvgSuspension: 'District avg: 2.2%',
    sarcTotalPerPupil: 'Total Per Pupil',
    sarcRestricted: 'Restricted',
    sarcUnrestricted: 'Unrestricted',
    sarcEstSchoolCost: 'Est. School Cost',
    sarcAvgTeacherSalary: 'Avg Teacher Salary',
    sarcDistrictLabel: 'District',
    sarcPtoPerPupil: 'PTO/PTA Per Pupil',
    sarcNoPto: 'Supported by <a href="https://www.rcef.org/" target="_blank">RCEF</a>',
    sarcExpenditureNote: 'Per-pupil expenditure data from the 2022-23 SARC. Restricted funds include Title I, special ed, and EL programs. Unrestricted funds are general operating. PTO/PTA revenue from IRS Form 990 filings.',
    spsaBudget: 'Supplemental (SPSA)',
    perPupil: 'SPSA Per Pupil',
    fundingBreakdown: 'SPSA Source Breakdown',
    titleI: 'Title I',
    districtFunds: 'District',
    ptoPta: 'PTO/PTA',
    measureU: 'Measure U',
    prop28: 'Prop 28',
    receivesTitle1: 'This school receives Title I federal funding.',
    noTitle1: 'This school does not receive Title I federal funding.',
    atsiNote: 'This school is designated ATSI (Additional Targeted Support and Improvement).',
    spsaNote: 'SPSA budgets represent supplemental site-level spending (enrichment, counseling, PD, materials). Base operating costs (teacher salaries, admin, facilities) come from the general fund and vary by school.',
    fullyCredentialed: 'Fully Credentialed',
    misassigned: 'Misassigned',
    elMisassigned: 'EL Misassigned',
    districtAvgCredentialed: 'District avg: 75%',
    districtTarget: 'District target: 100% by 2027',
    teacherDemoHighlights: 'Teacher demographics highlights',
    hispanicStaff: 'Hispanic staff',
    whiteStaff: 'White staff',
    over55: 'Staff over 55',
    under35: 'Staff under 35',
    sarc: 'School Accountability Report Card (SARC)',
    sarcDesc: 'Annual state-mandated report on school conditions and student outcomes.',
    spsa: 'School Plan for Student Achievement (SPSA)',
    spsaDesc: 'Site-level plan for how supplemental funds are spent.',
    viewSarc: 'Download SARC (PDF)',
    viewSpsa: 'Download SPSA (PDF)',
    safetyPlan: 'Comprehensive Safety Plan',
    bellSchedule: 'Bell Schedule',
    regularDays: 'Regular',
    regularDaysSub: 'Mon · Tue · Wed · Fri',
    thursdayEarlyRelease: 'Thursday',
    superMinDays: 'Super-min',
    supervisionStarts: 'Supervision starts',
    grade: 'Grade',
    dismissal: 'Dismissal',
    lunchMenu: 'Lunch Menu',
    schoolSiteCouncil: 'School Site Council',
    ptoPtaOrg: 'PTO / PTA',
    afterSchool: 'After-School Programs',
    parentComm: 'Parent Communication',
    absenceReporting: 'Report an Absence',
    joinKonstella: 'Join on Konstella',
    joinPlatform: 'Join',
    comingSoon: 'Coming soon',
    viewMenu: 'View menu',
    visitWebsite: 'Visit PTO/PTA website',
    schoolWebsite: 'School website',
    backToDistrict: 'All schools',
    disclaimer: '<strong>Draft document.</strong> Personally prepared by David Weekly; this is not a representation of the district or the Board of Trustees and may contain material factual errors. For official information, visit <a href="https://www.rcsdk8.net" style="color:#664d03; text-decoration:underline">rcsdk8.net</a>.',
    langSwitch: 'Leer en espa&ntilde;ol',
    sourceNote: 'Sources: 2024-25 SARCs, 2025-26 SPSAs, 2025-26 LCAP, HR data briefing (Feb 2026). Proficiency from 2023-24 CA state testing. Student growth from 2024-25 evaluations.',
    chronicAbsentNote: 'reported as 0% -- likely a data error',
    address: 'Address',
    phone: 'Phone',
    start: 'Start',
    end: 'End',
    earlyRelease: 'Early release',
    boardMeetings: 'Board Meetings',
    boardMeetingsDesc: 'Board of Trustees meetings with agenda items mentioning this school.',
    watchVideo: 'Watch',
    viewAttachments: 'Attachments',
    viewFullMeeting: 'Full meeting',
    noBoardItems: 'No board meeting items found for this school.',
  },
  es: {
    overview: 'Resumen',
    academics: 'Rendimiento Académico',
    demographics: 'Demografía Estudiantil',
    funding: 'Financiamiento',
    staffing: 'Personal',
    resources: 'Documentos y Recursos',
    grades: 'Grados',
    enrollment: 'Inscripción',
    principal: 'Director/a',
    highNeed: 'Alta necesidad',
    schoolType: 'Tipo de escuela',
    neighborhood: 'Vecindario',
    choice: 'Escuela de Elección',
    choiceTip: 'Las familias de cualquier parte del distrito pueden solicitar asistir a una Escuela de Elección a través del proceso de inscripción abierta.',
    neighborhoodTip: 'Una escuela de vecindario inscribe a estudiantes que viven dentro de los límites de su área de asistencia. Las familias también pueden solicitar a través de inscripción abierta.',
    communitySchool: 'Escuela Comunitaria',
    program: 'Programa especial',
    studentGrowth: 'Crecimiento Estudiantil',
    growthNote: 'El crecimiento mide cuánto aprenden los estudiantes cada año, sin importar su punto de partida. Una escuela con baja competencia pero alto crecimiento está acelerando el aprendizaje. La competencia mide cuántos estudiantes están al nivel de grado o por encima en este momento.',
    growthFinePrint: 'Crecimiento = % de estudiantes que logran más del 105% del crecimiento esperado en el CAASPP (Evaluación del Rendimiento y Progreso Estudiantil de California), el examen estatal anual estandarizado para grados 3\u20138. Competencia = % que cumplen o superan los estándares de su grado.',
    elaGrowth: 'Crecimiento en Inglés',
    mathGrowth: 'Crecimiento en Matemáticas',
    districtAvgElaGrowth: 'Promedio del distrito: 20.7%',
    districtAvgMathGrowth: 'Promedio del distrito: 13.8%',
    caasppProficiency: 'Examen Estatal de CA (2023-24)',
    elaProficiency: 'Competencia en Inglés',
    mathProficiency: 'Competencia en Matemáticas',
    districtAvgEla: 'Promedio del distrito: 42%',
    districtAvgMath: 'Promedio del distrito: 35%',
    teachersEvaluated: 'maestros evaluados',
    sed: 'Desventaja Socioeconómica',
    el: 'Estudiantes de Inglés',
    chronicAbsent: 'Absentismo Crónico',
    suspension: 'Tasa de Suspensión',
    iepRate: 'Estudiantes con IEP',
    inclusionRate: 'Colocación Inclusiva',
    inclusionTip: '% de estudiantes con IEP en aula regular 80%+ del día',
    districtAvgAbsent: 'Promedio del distrito: 18.3%',
    districtAvgSuspension: 'Promedio del distrito: 2.2%',
    sarcTotalPerPupil: 'Total Por Alumno',
    sarcRestricted: 'Restringido',
    sarcUnrestricted: 'No Restringido',
    sarcEstSchoolCost: 'Costo Est. Escolar',
    sarcAvgTeacherSalary: 'Salario Prom. Maestro',
    sarcDistrictLabel: 'Distrito',
    sarcPtoPerPupil: 'PTO/PTA Por Alumno',
    sarcNoPto: 'Apoyado por <a href="https://www.rcef.org/" target="_blank">RCEF</a>',
    sarcExpenditureNote: 'Datos de gastos por alumno del SARC 2022-23. Los fondos restringidos incluyen Título I, educación especial y programas para estudiantes de inglés. Los fondos no restringidos son operación general. Ingresos de PTO/PTA de declaraciones IRS Form 990.',
    spsaBudget: 'Suplementario (SPSA)',
    perPupil: 'SPSA Por Alumno',
    fundingBreakdown: 'Desglose de Fuentes SPSA',
    titleI: 'Título I',
    districtFunds: 'Distrito',
    ptoPta: 'PTO/PTA',
    measureU: 'Medida U',
    prop28: 'Prop 28',
    receivesTitle1: 'Esta escuela recibe financiamiento federal del Título I.',
    noTitle1: 'Esta escuela no recibe financiamiento federal del Título I.',
    atsiNote: 'Esta escuela está designada como ATSI (Apoyo y Mejora Adicional Dirigido).',
    spsaNote: 'Los presupuestos SPSA representan gastos suplementarios a nivel de sitio (enriquecimiento, consejería, desarrollo profesional, materiales). Los costos operativos base (salarios de maestros, administración, instalaciones) provienen del fondo general y varían por escuela.',
    fullyCredentialed: 'Con Credencial Completa',
    misassigned: 'Asignación Incorrecta',
    elMisassigned: 'Asignación Incorrecta EL',
    districtAvgCredentialed: 'Promedio del distrito: 75%',
    districtTarget: 'Meta del distrito: 100% para 2027',
    teacherDemoHighlights: 'Datos demográficos del personal docente',
    hispanicStaff: 'Personal hispano',
    whiteStaff: 'Personal blanco',
    over55: 'Personal mayor de 55',
    under35: 'Personal menor de 35',
    sarc: 'Informe de Responsabilidad Escolar (SARC)',
    sarcDesc: 'Informe anual estatal sobre las condiciones escolares y los resultados estudiantiles.',
    spsa: 'Plan Escolar para el Logro Estudiantil (SPSA)',
    spsaDesc: 'Plan a nivel de sitio sobre cómo se gastan los fondos suplementarios.',
    viewSarc: 'Descargar SARC (PDF)',
    viewSpsa: 'Descargar SPSA (PDF)',
    safetyPlan: 'Plan Integral de Seguridad',
    bellSchedule: 'Horario Escolar',
    regularDays: 'Regular',
    regularDaysSub: 'lun · mar · mié · vie',
    thursdayEarlyRelease: 'Jueves',
    superMinDays: 'Súper-mín',
    supervisionStarts: 'Supervisión comienza',
    grade: 'Grado',
    dismissal: 'Salida',
    lunchMenu: 'Menú de Almuerzo',
    schoolSiteCouncil: 'Consejo del Sitio Escolar',
    ptoPtaOrg: 'PTO / PTA',
    afterSchool: 'Programas Extracurriculares',
    parentComm: 'Comunicación con Padres',
    absenceReporting: 'Reportar una Ausencia',
    joinKonstella: 'Unirse en Konstella',
    joinPlatform: 'Unirse',
    comingSoon: 'Próximamente',
    viewMenu: 'Ver menú',
    visitWebsite: 'Visitar sitio web de PTO/PTA',
    schoolWebsite: 'Sitio web de la escuela',
    backToDistrict: 'Todas las escuelas',
    disclaimer: '<strong>Documento borrador.</strong> Preparado personalmente por David Weekly; esto no es una representación del distrito o de la Mesa Directiva y puede contener errores materiales. Para información oficial, visite <a href="https://www.rcsdk8.net" style="color:#664d03; text-decoration:underline">rcsdk8.net</a>.',
    langSwitch: 'Read in English',
    sourceNote: 'Fuentes: SARCs 2024-25, SPSAs 2025-26, LCAP 2025-26, informes de recursos humanos (feb. 2026). Competencia del examen estatal de CA 2023-24. Crecimiento estudiantil de evaluaciones 2024-25.',
    chronicAbsentNote: 'reportado como 0% -- probablemente un error de datos',
    address: 'Dirección',
    phone: 'Teléfono',
    start: 'Inicio',
    end: 'Fin',
    earlyRelease: 'Salida temprana',
    boardMeetings: 'Reuniones de la Mesa Directiva',
    boardMeetingsDesc: 'Reuniones de la Mesa Directiva con temas de agenda que mencionan esta escuela.',
    watchVideo: 'Ver video',
    viewAttachments: 'Documentos',
    viewFullMeeting: 'Reunión completa',
    noBoardItems: 'No se encontraron temas de reuniones de la mesa directiva para esta escuela.',
  },
};

// ---- Bell schedule HTML helper ----

function expandGrades(rangeStr) {
  // Expand "TK-5" → ["TK","K","1","2","3","4","5"], "6-8" → ["6","7","8"], "TK" → ["TK"]
  const ALL = ['TK','K','1','2','3','4','5','6','7','8'];
  const s = rangeStr.trim();
  if (!s.includes('-')) return [s];
  const [lo, hi] = s.split('-');
  const loIdx = ALL.indexOf(lo);
  const hiIdx = ALL.indexOf(hi);
  if (loIdx === -1 || hiIdx === -1) return [s];
  return ALL.slice(loIdx, hiIdx + 1);
}

function renderBellScheduleHTML(bs, L) {
  if (!bs.regular) {
    return `<p>${L.start}: ${bs.start}<br>${L.end}: ${bs.end}<br>${L.earlyRelease}: ${bs.earlyRelease}</p>`;
  }

  // Build a unified lookup: grade → { start, end, earlyEnd, superMinEnd }
  const gradeOrder = [];
  const gradeMap = {};
  for (const r of bs.regular) {
    gradeOrder.push(r.grades);
    gradeMap[r.grades] = { start: r.start, end: r.end, earlyEnd: null, superMinEnd: null };
  }

  // Match early release times to regular grade rows using grade set overlap
  for (const r of bs.earlyRelease) {
    const earlySet = new Set(expandGrades(r.grades));
    for (const g of gradeOrder) {
      if (gradeMap[g].earlyEnd) continue; // already matched
      const regSet = expandGrades(g);
      if (regSet.some(grade => earlySet.has(grade))) {
        gradeMap[g].earlyEnd = r.end;
      }
    }
  }

  // Match super-minimum times the same way
  if (bs.superMinimum) {
    for (const r of bs.superMinimum) {
      const smSet = new Set(expandGrades(r.grades));
      for (const g of gradeOrder) {
        if (gradeMap[g].superMinEnd) continue;
        const regSet = expandGrades(g);
        if (regSet.some(grade => smSet.has(grade))) {
          gradeMap[g].superMinEnd = r.end;
        }
      }
    }
  }

  const hasSuperMin = bs.superMinimum && bs.superMinimum.length > 0;

  let html = '';
  if (bs.supervision) {
    html += `<p class="bell-supervision">${L.supervisionStarts}: ${bs.supervision}</p>`;
  }

  html += '<div class="bell-card-inner"><table class="bell-table">';
  html += `<thead><tr>
    <th></th>
    <th><span class="bell-col-label">${L.regularDays}</span><span class="bell-col-sub">${L.regularDaysSub}</span></th>
    <th><span class="bell-col-label">${L.thursdayEarlyRelease}</span></th>
    ${hasSuperMin ? `<th><span class="bell-col-label">${L.superMinDays}</span></th>` : ''}
  </tr></thead><tbody>`;

  for (const g of gradeOrder) {
    const d = gradeMap[g];
    html += `<tr>
      <td class="bell-grade">${g}</td>
      <td><span class="bell-time-range">${d.start}<span class="bell-dash"> – </span>${d.end}</span></td>
      <td>${d.earlyEnd || '—'}</td>
      ${hasSuperMin ? `<td>${d.superMinEnd || '—'}</td>` : ''}
    </tr>`;
  }

  html += '</tbody></table></div>';
  return html;
}

// ---- HTML generation ----

function buildSchoolPage(school, data, lang) {
  const L = LABELS[lang];
  const isEs = lang === 'es';
  const name = school.name;
  const nameEs = school.nameEs;
  const displayName = isEs ? nameEs : name;
  const slug = school.slug;

  const enPath = `/schools/${slug}/`;
  const esPath = `/escuelas/${slug}/`;
  const altLangHref = isEs ? enPath : esPath;

  const description = isEs ? data.descriptionEs : data.description;
  const notes = isEs ? data.notesEs : data.notes;

  const schoolTypeLabel = school.type === 'choice' ? L.choice : L.neighborhood;
  const programLabel = isEs ? school.programEs : school.program;

  // Funding bar segments
  const fundingSources = [
    { key: 'titleI', amount: data.funding.titleI, color: FUNDING_COLORS.titleI, label: L.titleI },
    { key: 'district', amount: data.funding.district, color: FUNDING_COLORS.district, label: L.districtFunds },
    { key: 'ptoPta', amount: data.funding.ptoPta, color: FUNDING_COLORS.ptoPta, label: L.ptoPta },
    { key: 'measureU', amount: data.funding.measureU, color: FUNDING_COLORS.measureU, label: L.measureU },
    { key: 'prop28', amount: data.funding.prop28, color: FUNDING_COLORS.prop28, label: L.prop28 },
  ].filter(s => s.amount > 0);

  const fundingTotal = data.funding.spsaTotal;
  const fundingBarHtml = fundingSources.map(s =>
    `<div class="funding-bar-segment" style="width:${((s.amount / fundingTotal) * 100).toFixed(1)}%; background:${s.color}"></div>`
  ).join('');
  const fundingLegendHtml = fundingSources.map(s =>
    `<span class="funding-legend-item"><span class="funding-legend-swatch" style="background:${s.color}"></span>${s.label}: ${fmtDollar(s.amount)}</span>`
  ).join('\n          ');

  // SARC expenditure data
  const sarc = SARC_DATA[slug];
  const sarcExp = sarc?.expenditures?.schoolSite;
  const sarcEnrollment = sarc?.enrollment?.total;
  const ptoRevenue = school.pto?.revenue || 0;
  const ptoPerPupil = ptoRevenue > 0 && school.enrollment > 0 ? Math.round(ptoRevenue / school.enrollment) : 0;
  const miBoosterRevenue = school.miBooster?.revenue || 0;
  const miBoosterPerPupil = miBoosterRevenue > 0 && school.enrollment > 0 ? Math.round(miBoosterRevenue / school.enrollment) : 0;
  const communityPerPupil = ptoPerPupil + miBoosterPerPupil;
  const totalPerPupil = sarcExp ? sarcExp.totalPerPupil + communityPerPupil : 0;
  const estSchoolCost = totalPerPupil > 0 && school.enrollment > 0 ? totalPerPupil * school.enrollment : null;

  // Teacher demo highlights
  const demoItems = [];
  if (data.teacherDemo.hispanicStaff !== null) demoItems.push(`${L.hispanicStaff}: ${fmtPct(data.teacherDemo.hispanicStaff)}`);
  if (data.teacherDemo.whiteStaff !== null) demoItems.push(`${L.whiteStaff}: ${fmtPct(data.teacherDemo.whiteStaff)}`);
  if (data.teacherDemo.over55 !== null) demoItems.push(`${L.over55}: ${fmtPct(data.teacherDemo.over55)}`);
  if (data.teacherDemo.under35 !== null) demoItems.push(`${L.under35}: ${fmtPct(data.teacherDemo.under35)}`);

  // Chronic absenteeism note for McKinley
  const chronicAbsentDisplay = data.demographics.chronicAbsent === 0
    ? `0%*`
    : fmtPct(data.demographics.chronicAbsent);
  const chronicAbsentNote = data.demographics.chronicAbsent === 0
    ? `<br><span class="source">* ${L.chronicAbsentNote}</span>`
    : '';

  // SpEd data for this school
  const spedEnroll = SPED_ENROLLMENT.schools?.[slug];
  const spedCat = SPED_CATEGORIES.schools?.[slug];
  const spedIepPct = spedEnroll?.pct ?? null;
  const spedInclusionPct = spedCat?.placement
    ? Math.round(spedCat.placement.regularGt80 / spedCat.placement.total * 1000) / 10
    : null;

  // Growth stat card note
  const growthTeacherNote = data.growth.elaTeachers
    ? ` (${data.growth.elaTeachers} ${L.teachersEvaluated})`
    : '';


  // School logo
  const logoExt = slug === 'clifford' ? 'png' : 'jpg';
  const logoUrl = `https://data.rcsd.info/logos/${slug}.${logoExt}`;

  // Info bubble helper for source attribution
  const sarcPdfUrl = `https://data.rcsd.info/documents/sarc/2024-25/english/${slug}.pdf`;
  const spsaPdfUrl = `https://data.rcsd.info/documents/spsa/2025-26/${slug}.pdf`;
  const growthUrl = 'https://www.cde.ca.gov/ta/ac/acctgrowthmod.asp';
  const dashboardUrl = `https://www.caschooldashboard.org/reports/${school.cdsCode}/2024`;
  const infoBubble = (text, url) => `<span class="info-bubble" tabindex="0"><span class="info-bubble-icon">i</span><span class="info-bubble-tip"><a href="${url}" target="_blank">${text}</a></span></span>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${headMeta({
  title: `${displayName} — RCSD Open Data`,
  description: isEs
    ? `Datos públicos de ${displayName}: rendimiento académico, demografía, financiamiento y personal para el año escolar 2025-26.`
    : `Public data for ${displayName}: academic performance, demographics, funding, and staffing for the 2025-26 school year.`,
  canonical: `https://rcsd.info${isEs ? esPath : enPath}`,
  ogLocale: isEs ? 'es_US' : 'en_US',
  hreflang: [
    { lang: 'en', href: `https://rcsd.info${enPath}` },
    { lang: 'es', href: `https://rcsd.info${esPath}` },
  ],
  pageCSS: schoolCSS,
})}
</head>
<body>

${siteNav({ activePage: 'schools', lang, altLangHref })}

<header class="site-header">
  <div class="header-inner">
    <div class="header-district"><a href="${isEs ? '/distrito/' : '/district/'}">${isEs ? 'Distrito Escolar de Redwood City' : 'Redwood City School District'}</a></div>
    <img src="${logoUrl}" alt="${displayName}" class="header-logo">
    <h1 class="header-title">${displayName}</h1>
    <p class="header-subtitle">${description}</p>
    <div style="margin-top:0.8rem">
      <span class="school-badge ${school.type}">${schoolTypeLabel} <span class="info-bubble" tabindex="0"><span class="info-bubble-icon" style="border-color:rgba(255,255,255,0.2);color:rgba(255,255,255,0.4)">i</span><span class="info-bubble-tip">${school.type === 'choice' ? L.choiceTip : L.neighborhoodTip}</span></span></span>${school.communitySchool ? `<span class="school-badge community">${L.communitySchool}</span>` : ''}
    </div>
  </div>
</header>

<div class="disclaimer">
  ${L.disclaimer}
</div>

<div class="lang-switch">
  <a href="${altLangHref}">${L.langSwitch}</a>
</div>

<nav class="toc">
  <div class="toc-inner">
    <a href="#overview">${L.overview}</a>
    <a href="#academics">${L.academics}</a>
    <a href="#demographics">${L.demographics}</a>
    <a href="#funding">${L.funding}</a>
    <a href="#staffing">${L.staffing}</a>
    <a href="#resources">${L.resources}</a>
    <a href="#board">${L.boardMeetings}</a>
  </div>
</nav>

<main class="content">

  <!-- ======== 1. OVERVIEW ======== -->
  <section class="section" id="overview">
    <div class="section-rule"></div>
    <div class="section-num">01</div>
    <h2>${L.overview}</h2>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.grades}</div>
        <div class="stat-card-value">${school.grades}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.enrollment}</div>
        <div class="stat-card-value">${fmt(school.enrollment)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.highNeed}</div>
        <div class="stat-card-value">${fmtPct(school.highNeedPct)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
      </div>
    </div>

    <div class="principal-row">
      ${existsSync(resolve(ROOT, 'docs/img/principals', slug + '.jpg')) ? `<div style="flex-shrink:0">
        <a href="${school.website}/our-school/meet-our-school-leadership"><img src="/img/principals/${slug}.jpg" alt="${school.principal}" style="width:160px; border-radius:10px; display:block"></a>
        <div style="text-align:center; margin-top:0.6rem">
          <div style="font-family:'IBM Plex Mono',monospace; font-size:0.6rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted)">${L.principal}</div>
          <div style="font-size:1.05rem; font-weight:500; margin-top:0.15rem"><a href="${school.website}/our-school/meet-our-school-leadership" style="color:var(--green-mid); text-decoration:none">${school.principal}</a></div>
        </div>
      </div>` : ''}
      <div class="table-wrap" style="flex:1; margin:0">
        <table>
          <tbody>
            <tr><td class="label-cell">${L.schoolType}</td><td>${schoolTypeLabel}</td></tr>${programLabel ? `
            <tr><td class="label-cell">${L.program}</td><td>${programLabel}</td></tr>` : ''}${school.communitySchool ? `
            <tr><td class="label-cell">${L.communitySchool}</td><td>${isEs ? 'Sí' : 'Yes'}</td></tr>` : ''}
            <tr><td class="label-cell">${L.address}</td><td>${school.address}</td></tr>
            <tr><td class="label-cell">${L.phone}</td><td>${school.phone}</td></tr>
            <tr><td class="label-cell">${L.schoolWebsite}</td><td><a href="${school.website}">${school.website.replace('https://', '')}</a></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ======== 2. ACADEMIC PERFORMANCE ======== -->
  <section class="section" id="academics">
    <div class="section-rule"></div>
    <div class="section-num">02</div>
    <h2>${L.academics}</h2>

    <h3>${L.studentGrowth}</h3>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.elaGrowth}</div>
        <div class="stat-card-value">${fmtPct(data.growth.ela)} ${infoBubble('CDE Growth Model', growthUrl)}</div>
        <div class="stat-card-note">${L.districtAvgElaGrowth}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.mathGrowth}</div>
        <div class="stat-card-value">${fmtPct(data.growth.math)} ${infoBubble('CDE Growth Model', growthUrl)}</div>
        <div class="stat-card-note">${L.districtAvgMathGrowth}</div>
      </div>
    </div>

    <h3>${L.caasppProficiency}</h3>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.elaProficiency}</div>
        <div class="stat-card-value">${fmtPct(data.caaspp.ela)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
        <div class="stat-card-note"><span class="bar ${barClass(data.caaspp.ela)}" style="width:${barWidth(data.caaspp.ela)}px"></span>${L.districtAvgEla}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.mathProficiency}</div>
        <div class="stat-card-value">${fmtPct(data.caaspp.math)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
        <div class="stat-card-note"><span class="bar ${barClass(data.caaspp.math)}" style="width:${barWidth(data.caaspp.math)}px"></span>${L.districtAvgMath}</div>
      </div>
    </div>

    <div class="callout">
      <p>${L.growthNote}</p>
    </div>

    <p class="source">${L.growthFinePrint}</p>
    <p class="source">${L.sourceNote}</p>
  </section>

  <!-- ======== 3. STUDENT DEMOGRAPHICS ======== -->
  <section class="section" id="demographics">
    <div class="section-rule"></div>
    <div class="section-num">03</div>
    <h2>${L.demographics}</h2>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.sed}</div>
        <div class="stat-card-value">${fmtPct(data.demographics.sed)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.el}</div>
        <div class="stat-card-value">${fmtPct(data.demographics.el)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.chronicAbsent}</div>
        <div class="stat-card-value">${chronicAbsentDisplay} ${infoBubble('CA Dashboard', dashboardUrl)}</div>
        <div class="stat-card-note">${L.districtAvgAbsent}${chronicAbsentNote}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.suspension}</div>
        <div class="stat-card-value">${fmtPct(data.demographics.suspension)} ${infoBubble('CA Dashboard', dashboardUrl)}</div>
        <div class="stat-card-note">${L.districtAvgSuspension}</div>
      </div>
      ${spedIepPct !== null ? `<div class="stat-card">
        <div class="stat-card-label">${L.iepRate}</div>
        <div class="stat-card-value">${fmtPct(spedIepPct)} ${infoBubble('CDE Census 2024-25', 'https://www.cde.ca.gov/ds/ad/filesenrcensus.asp')}</div>
        <div class="stat-card-note">${isEs ? 'Promedio del distrito' : 'District avg'}: ${fmtPct(districtSpedPct)}</div>
      </div>` : ''}
      ${spedInclusionPct !== null ? `<div class="stat-card">
        <div class="stat-card-label">${L.inclusionRate} ${infoBubble(L.inclusionTip, 'https://www.cde.ca.gov/ds/ad/filesspedps.asp')}</div>
        <div class="stat-card-value">${fmtPct(spedInclusionPct)}</div>
        <div class="stat-card-note">${isEs ? 'Promedio del distrito' : 'District avg'}: ${fmtPct(districtInclusionPct)}</div>
      </div>` : ''}
    </div>
  </section>

  <!-- ======== 4. FUNDING ======== -->
  <section class="section" id="funding">
    <div class="section-rule"></div>
    <div class="section-num">04</div>
    <h2>${L.funding}</h2>

    ${sarcExp ? `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.sarcTotalPerPupil}</div>
        <div class="stat-card-value">$${fmt(totalPerPupil)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
        <div class="stat-card-note">${isEs ? 'Distrito' : 'District'}: $${fmt(sarcExp.totalPerPupil)}${communityPerPupil > 0 ? ` + ${isEs ? 'comunidad' : 'community'}: $${fmt(communityPerPupil)}` : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.sarcEstSchoolCost}</div>
        <div class="stat-card-value">${fmtDollar(estSchoolCost)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
        <div class="stat-card-note">${L.sarcRestricted}: $${fmt(sarcExp.restrictedPerPupil)} · ${L.sarcUnrestricted}: $${fmt(sarcExp.unrestrictedPerPupil)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.sarcAvgTeacherSalary}</div>
        <div class="stat-card-value">$${fmt(sarcExp.avgTeacherSalary)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
        <div class="stat-card-note">${L.sarcDistrictLabel}: $${fmt(sarc.expenditures.district.avgTeacherSalary)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.sarcPtoPerPupil}</div>
        <div class="stat-card-value">${communityPerPupil > 0 ? '$' + fmt(communityPerPupil) : '\u2014'}</div>
        <div class="stat-card-note">${school.pto?.revenue ? '<a href="' + school.pto.sourceUrl + '" target="_blank">' + fmtDollar(ptoRevenue) + ' ' + (isEs ? 'ingresos anuales' : 'annual revenue') + ' (IRS 990) &#8599;</a>' : L.sarcNoPto}${school.miBooster?.revenue ? '<br><a href="' + school.miBooster.sourceUrl + '" target="_blank">+ ' + fmtDollar(miBoosterRevenue) + ' RCMIS (IRS 990) &#8599;</a>' : ''}</div>
      </div>
    </div>

    <div class="callout">
      <p>${L.sarcExpenditureNote}</p>
    </div>
    ` : ''}

    <h3 style="margin-top:2rem">${isEs ? 'Financiamiento Suplementario del Sitio (SPSA) 2025-26' : 'Site Supplemental (SPSA) 2025-26'}</h3>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.spsaBudget}</div>
        <div class="stat-card-value">${fmtDollar(data.funding.spsaTotal)} ${infoBubble('SPSA 2025-26', spsaPdfUrl)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.perPupil}</div>
        <div class="stat-card-value">$${fmt(data.funding.perPupil)} ${infoBubble('SPSA 2025-26', spsaPdfUrl)}</div>
      </div>
    </div>

    <h3>${L.fundingBreakdown}</h3>

    <div class="funding-bar">
      ${fundingBarHtml}
    </div>
    <div class="funding-legend">
      ${fundingLegendHtml}
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${isEs ? 'Fuente' : 'Source'}</th>
            <th class="num">${isEs ? 'Monto' : 'Amount'}</th>
            <th class="num">${isEs ? '% del Total' : '% of Total'}</th>
          </tr>
        </thead>
        <tbody>
          ${fundingSources.map(s => `<tr>
            <td class="label-cell">${s.label}</td>
            <td class="num">${fmtDollar(s.amount)}</td>
            <td class="num">${((s.amount / fundingTotal) * 100).toFixed(0)}%</td>
          </tr>`).join('\n          ')}
          <tr class="total-row">
            <td class="label-cell">Total</td>
            <td class="num">${fmtDollar(fundingTotal)}</td>
            <td class="num">100%</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="callout${data.funding.atsi ? ' callout-amber' : ''}">
      <p>${data.funding.titleISchool ? L.receivesTitle1 : L.noTitle1}${data.funding.atsi ? ` ${L.atsiNote}` : ''}</p>
    </div>

    <p class="source">${L.spsaNote}</p>
  </section>

  <!-- ======== 5. STAFFING ======== -->
  <section class="section" id="staffing">
    <div class="section-rule"></div>
    <div class="section-num">05</div>
    <h2>${L.staffing}</h2>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${L.fullyCredentialed}</div>
        <div class="stat-card-value">${fmtPct(data.staffing.credentialed)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
        <div class="stat-card-note"><span class="bar ${barClass(data.staffing.credentialed)}" style="width:${barWidth(data.staffing.credentialed)}px"></span>${L.districtAvgCredentialed}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${L.misassigned}</div>
        <div class="stat-card-value">${fmtPct(data.staffing.misassigned)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
      </div>
      ${data.staffing.elMisassigned !== null ? `<div class="stat-card">
        <div class="stat-card-label">${L.elMisassigned}</div>
        <div class="stat-card-value">${fmtPct(data.staffing.elMisassigned)} ${infoBubble('SARC 2024-25', sarcPdfUrl)}</div>
      </div>` : ''}
    </div>

    <p class="source">${L.districtTarget}</p>

    ${demoItems.length > 0 ? `
    <h3>${L.teacherDemoHighlights}</h3>
    <div class="table-wrap">
      <table>
        <tbody>
          ${demoItems.map(item => {
            const [label, value] = item.split(': ');
            return `<tr><td class="label-cell">${label}</td><td class="num">${value}</td></tr>`;
          }).join('\n          ')}
        </tbody>
      </table>
    </div>` : ''}

    ${notes ? `
    <div class="callout">
      <p>${notes}</p>
    </div>` : ''}
  </section>

  <!-- ======== 6. DOCUMENTS & RESOURCES ======== -->
  <section class="section" id="resources">
    <div class="section-rule"></div>
    <div class="section-num">06</div>
    <h2>${L.resources}</h2>

    <div class="resource-grid">
      <div class="resource-card">
        <h4>${L.sarc}</h4>
        <p>${L.sarcDesc}</p>
        <p style="margin-top:0.5rem"><a href="https://data.rcsd.info/documents/sarc/2024-25/english/${slug}.pdf" target="_blank">${L.viewSarc}${isEs ? ' (inglés)' : ''} &#8599;</a></p>
      </div>
      <div class="resource-card">
        <h4>${L.spsa}</h4>
        <p>${L.spsaDesc}</p>
        <p style="margin-top:0.5rem"><a href="https://data.rcsd.info/documents/spsa/2025-26/${slug}.pdf" target="_blank">${L.viewSpsa}${isEs ? ' (inglés)' : ''} &#8599;</a></p>
      </div>
      <div class="resource-card bell-card">
        <h4>${L.bellSchedule}</h4>
        ${renderBellScheduleHTML(school.bellSchedule, L)}
      </div>
      <div class="resource-card">
        <h4>${L.lunchMenu}</h4>
        ${school.lunchUrl
          ? `<p><a href="${school.lunchUrl}" target="_blank">${L.viewMenu} &#8599;</a></p>`
          : `<p class="coming-soon">${L.comingSoon}</p>`}
      </div>
      <div class="resource-card">
        <h4>${L.ptoPtaOrg}</h4>
        ${school.pto?.url
          ? `<p><a href="${school.pto.url}" target="_blank">${school.pto.name || L.visitWebsite} &#8599;</a></p>${rctStatusNote(school.pto, isEs)}`
          : `<p><a href="https://www.rcef.org/" target="_blank">${isEs ? 'Fundación Educativa de Redwood City (RCEF)' : 'Redwood City Education Foundation (RCEF)'} &#8599;</a></p>`}
        ${school.miBooster?.url ? `<p style="margin-top:0.4rem"><a href="${school.miBooster.url}" target="_blank">${school.miBooster.name} &#8599;</a></p>` : ''}
      </div>
      <div class="resource-card">
        <h4>${L.parentComm}</h4>
        <p><a href="${schoolsData.districtLinks.parentSquare}" target="_blank">ParentSquare ${isEs ? '(oficial del distrito)' : '(district-wide)'} &#8599;</a></p>
        ${school.parentLinks?.konstella
          ? `<p><a href="${school.parentLinks.konstella}" target="_blank">${L.joinKonstella} &#8599;</a></p>`
          : school.parentLinks?.platform === 'Konstella'
            ? `<p>Konstella — ${school.parentLinks.konstellaNote || (isEs ? 'contacte al PTO' : 'contact PTO for link')}</p>`
            : school.parentLinks?.platform === 'Membership Toolkit' && school.parentLinks.joinUrl
              ? `<p><a href="${school.parentLinks.joinUrl}" target="_blank">${L.joinPlatform} PTA &#8599;</a></p>`
              : ''}
      </div>
      <div class="resource-card">
        <h4>${L.absenceReporting}</h4>
        <p>SchoolMessenger</p>
        <p><a href="${schoolsData.districtLinks.absenceReporting.ios}" target="_blank">iOS &#8599;</a> · <a href="${schoolsData.districtLinks.absenceReporting.android}" target="_blank">Android &#8599;</a></p>
      </div>
      <div class="resource-card">
        <h4>${L.safetyPlan}</h4>
        <p class="coming-soon">${L.comingSoon}</p>
      </div>
      <div class="resource-card">
        <h4>${L.schoolSiteCouncil}</h4>
        <p class="coming-soon">${L.comingSoon}</p>
      </div>
      <div class="resource-card">
        <h4>${L.afterSchool}</h4>
        <p class="coming-soon">${L.comingSoon}</p>
      </div>
    </div>

  </section>

  <!-- ======== 7. BOARD MEETINGS ======== -->
  <section class="section" id="board">
    <div class="section-rule"></div>
    <div class="section-num">07</div>
    <h2>${L.boardMeetings}</h2>
    <p class="source" style="margin-bottom:1.5rem">${L.boardMeetingsDesc}</p>

    ${(() => {
      const items = SCHOOL_BOARD_ITEMS[slug] || [];
      if (items.length === 0) return `<p>${L.noBoardItems}</p>`;

      // Group by date
      const byDate = new Map();
      for (const item of items) {
        if (!byDate.has(item.date)) byDate.set(item.date, []);
        byDate.get(item.date).push(item);
      }

      return [...byDate.entries()].map(([date, dateItems]) => {
        const d = new Date(date + 'T12:00:00');
        const dateStr = d.toLocaleDateString(isEs ? 'es-US' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const meetingType = dateItems[0].type;
        const meetingSlug = dateItems[0].meetingSlug;

        const itemsHtml = dateItems.map(item => {
          // Use concise per-school summary if available, otherwise fall back to raw title
          const summaryKey = item.date + '|' + item.title.replace(/&#039;/g, "'");
          const summaryObj = BOARD_SUMMARIES[summaryKey]?.[slug];
          const displayText = (summaryObj ? (isEs ? summaryObj.es : summaryObj.en) : null) || item.title;

          const attsHtml = item.attachments.length > 0
            ? `<div style="margin-top:0.4rem; display:flex; flex-wrap:wrap; gap:0.4rem">${item.attachments.map(a =>
                `<a href="${a.url}" target="_blank" style="font-family:'IBM Plex Mono',monospace; font-size:0.65rem; background:var(--green-wash); padding:0.2rem 0.5rem; border-radius:3px; text-decoration:none; color:var(--green-mid)">${a.title} &#8599;</a>`
              ).join('')}</div>`
            : '';

          const videoLink = item.videoId
            ? `<a href="https://www.youtube.com/watch?v=${item.videoId}${item.timestampSeconds ? '&t=' + item.timestampSeconds : ''}" target="_blank" style="font-family:'IBM Plex Mono',monospace; font-size:0.65rem; color:var(--coral); text-decoration:none; white-space:nowrap">&#9654; ${L.watchVideo}</a>`
            : '';

          return `<div style="padding:0.6rem 0; border-bottom:1px solid var(--rule-light)">
              <div style="font-size:0.9rem; line-height:1.4">${displayText}</div>
              <div style="margin-top:0.3rem; display:flex; align-items:center; gap:0.8rem; flex-wrap:wrap">${videoLink}</div>
              ${attsHtml}
            </div>`;
        }).join('');

        return `<div style="margin-bottom:2rem">
          <div style="display:flex; align-items:baseline; gap:0.8rem; margin-bottom:0.3rem">
            <h3 style="margin:0; font-size:1rem">${dateStr}</h3>
            <span style="font-family:'IBM Plex Mono',monospace; font-size:0.6rem; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.05em">${meetingType}</span>
            <a href="/meetings/#${date}" style="font-family:'IBM Plex Mono',monospace; font-size:0.6rem; color:var(--green-mid); text-decoration:none">${L.viewFullMeeting} &rarr;</a>
          </div>
          ${itemsHtml}
        </div>`;
      }).join('');
    })()}
  </section>

</main>

${siteFooter({ lang })}

</body>
</html>`;
}


// ---- Schools index page ----

function buildSchoolsIndex(lang) {
  const isEs = lang === 'es';
  const title = isEs ? 'Escuelas — Distrito Escolar de Redwood City' : 'Schools — Redwood City School District';
  const description = isEs
    ? 'Las 12 escuelas del Distrito Escolar de Redwood City: datos, financiamiento, rendimiento y recursos.'
    : 'All 12 Redwood City School District schools: data, funding, performance, and resources.';
  const canonical = isEs ? 'https://rcsd.info/escuelas/' : 'https://rcsd.info/schools/';
  const altHref = isEs ? '/schools/' : '/escuelas/';

  const L = isEs ? {
    heading: 'Escuelas del distrito',
    subtitle: 'Seleccione una escuela para ver datos detallados sobre rendimiento acad\u00e9mico, demograf\u00eda, financiamiento y recursos.',
    thSchool: 'Escuela', thGrades: 'Grados', thEnroll: 'Inscripci\u00f3n', thHighNeed: '% alta necesidad',
    thGrowthEla: 'Crec. Inglés', thGrowthMath: 'Crec. Mat',
    growthExplainer: '<strong>% alta necesidad</strong> = porcentaje de estudiantes socioeconómicamente desfavorecidos o aprendices de inglés. <strong>Crecimiento</strong> = porcentaje de estudiantes que superaron el crecimiento esperado en el examen estatal de CA (CAASPP). Mide cuánto aprenden los estudiantes cada año, sin importar su punto de partida — una escuela con baja competencia pero alto crecimiento está acelerando el aprendizaje.',
    viewDetails: 'Ver detalles',
    pathPrefix: '/escuelas/',
  } : {
    heading: 'District schools',
    subtitle: 'Select a school to see detailed data on academic performance, demographics, funding, and resources.',
    thSchool: 'School', thGrades: 'Grades', thEnroll: 'Enrollment', thHighNeed: '% high-need',
    thGrowthEla: 'English growth', thGrowthMath: 'Math growth',
    growthExplainer: '<strong>% high-need</strong> = share of students who are socioeconomically disadvantaged or English learners. <strong>Growth</strong> = percentage of students who exceeded expected growth on the CA state test (CAASPP). It measures how much students are learning each year regardless of starting point\u2014a school with low proficiency but high growth is accelerating learning.',
    viewDetails: 'View details',
    pathPrefix: '/schools/',
  };

  // Sort schools by name for the index
  const sorted = [...schoolsData.schools]
    .filter(s => SCHOOL_DATA[s.slug])
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = sorted.map(s => {
    const d = SCHOOL_DATA[s.slug];
    const elaG = Math.round(d.growth.ela);
    const mathG = Math.round(d.growth.math);
    const elaBarW = Math.round((d.growth.ela / 49) * 58);
    const mathBarW = Math.round((d.growth.math / 28) * 58);
    const elaColor = d.growth.ela >= 20 ? 'green' : d.growth.ela >= 15 ? 'amber' : 'coral';
    const mathColor = d.growth.math >= 20 ? 'green' : d.growth.math >= 15 ? 'amber' : 'coral';
    const href = `${L.pathPrefix}${s.slug}/`;
    return `          <tr onclick="location.href='${href}'" style="cursor:pointer">
            <td class="school-name"><a href="${href}">${s.nameShort || s.name} <span class="arrow">&rarr;</span></a></td>
            <td>${s.grades}</td>
            <td class="num">${s.enrollment.toLocaleString()}</td>
            <td class="num">${s.highNeedPct}%</td>
            <td class="num"><span class="bar bar-${elaColor}" style="width:${elaBarW}px"></span>${elaG}%</td>
            <td class="num"><span class="bar bar-${mathColor}" style="width:${mathBarW}px"></span>${mathG}%</td>
          </tr>`;
  }).join('\n');

  const indexCSS = `
  .schools-header { padding: 3rem 0 0; }
  .schools-header h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.8rem, 4vw, 2.5rem);
    font-weight: 400;
    color: var(--green-deep);
    margin-bottom: 1rem;
  }
  .schools-header p { max-width: 640px; margin-bottom: 2rem; }
  .schools-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .schools-table-wrap table { width: 100%; border-collapse: collapse; font-size: 0.88rem; line-height: 1.45; }
  .schools-table-wrap thead th {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted);
    text-align: left; padding: 0.6rem 0.8rem; border-bottom: 2px solid var(--green-deep); white-space: nowrap;
  }
  .schools-table-wrap thead th.num { text-align: right; }
  .schools-table-wrap tbody td {
    padding: 0.55rem 0.8rem; border-bottom: 1px solid var(--rule-light); vertical-align: top;
  }
  .schools-table-wrap tbody td.num {
    text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 0.82rem; white-space: nowrap;
  }
  .schools-table-wrap tbody td.school-name { font-weight: 500; white-space: nowrap; }
  .schools-table-wrap tbody td.school-name a { color: var(--green-mid); text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 2px; }
  .schools-table-wrap tbody td.school-name a:hover { color: var(--green-deep); text-decoration-color: var(--green-mid); }
  .schools-table-wrap tbody td.school-name .arrow { color: var(--text-muted); font-size: 0.8em; transition: transform 0.15s, color 0.15s; display: inline-block; }
  .schools-table-wrap tbody tr:hover td { background: var(--green-wash); }
  .schools-table-wrap tbody tr:hover .arrow { color: var(--green-mid); transform: translateX(3px); }
  .schools-table-wrap tbody tr:last-child td { border-bottom: 2px solid var(--rule); }
  .bar { display: inline-block; height: 6px; border-radius: 3px; margin-right: 0.5rem; vertical-align: middle; }
  .bar-green { background: var(--green-light); }
  .bar-amber { background: var(--amber); }
  .bar-coral { background: var(--coral); }
  .schools-content { max-width: 960px; margin: 0 auto; padding: 0 2rem 6rem; }
  @media (max-width: 640px) { .schools-content { padding: 0 1.2rem 4rem; } }`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${headMeta({
  title,
  description,
  canonical,
  ogLocale: isEs ? 'es_US' : 'en_US',
  hreflang: [
    { lang: 'en', href: 'https://rcsd.info/schools/' },
    { lang: 'es', href: 'https://rcsd.info/escuelas/' },
  ],
  pageCSS: indexCSS,
})}
</head>
<body>

${siteNav({ activePage: 'schools', lang, altLangHref: altHref })}

<div class="schools-content">
  <div class="schools-header">
    <h1>${L.heading}</h1>
    <p>${L.subtitle}</p>
  </div>

  <div class="schools-table-wrap">
    <table>
      <thead>
        <tr>
          <th>${L.thSchool}</th>
          <th>${L.thGrades}</th>
          <th class="num">${L.thEnroll}</th>
          <th class="num">${L.thHighNeed}</th>
          <th class="num">${L.thGrowthEla}</th>
          <th class="num">${L.thGrowthMath}</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>

  <p style="font-size:0.82rem; color:var(--text-muted); margin-top:1.2rem; line-height:1.5">${L.growthExplainer}</p>
</div>

${siteFooter({ lang })}

</body>
</html>`;
}


// ---- Main: generate all pages ----

let count = 0;

for (const school of schoolsData.schools) {
  const data = SCHOOL_DATA[school.slug];
  if (!data) {
    console.warn(`No enrichment data for ${school.slug}, skipping`);
    continue;
  }

  // English
  const enDir = resolve(ROOT, 'docs', 'schools', school.slug);
  mkdirSync(enDir, { recursive: true });
  const enHtml = buildSchoolPage(school, data, 'en');
  writeFileSync(resolve(enDir, 'index.html'), enHtml);
  console.log(`Wrote docs/schools/${school.slug}/index.html`);

  // Spanish
  const esDir = resolve(ROOT, 'docs', 'escuelas', school.slug);
  mkdirSync(esDir, { recursive: true });
  const esHtml = buildSchoolPage(school, data, 'es');
  writeFileSync(resolve(esDir, 'index.html'), esHtml);
  console.log(`Wrote docs/escuelas/${school.slug}/index.html`);

  count++;
}

// Schools index pages
const enIndexDir = resolve(ROOT, 'docs', 'schools');
mkdirSync(enIndexDir, { recursive: true });
writeFileSync(resolve(enIndexDir, 'index.html'), buildSchoolsIndex('en'));
console.log('Wrote docs/schools/index.html');

const esIndexDir = resolve(ROOT, 'docs', 'escuelas');
mkdirSync(esIndexDir, { recursive: true });
writeFileSync(resolve(esIndexDir, 'index.html'), buildSchoolsIndex('es'));
console.log('Wrote docs/escuelas/index.html');

console.log(`\nGenerated ${count} school pages + 2 index pages (${count * 2 + 2} HTML files total).`);
