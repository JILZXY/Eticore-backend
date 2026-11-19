import type { DificultadUnidad } from '../../modules/catalog/dto/consultar-catalogo.dto.js';
import type { TipoUnidad } from '../../shared/validation/content-validator.service.js';

/**
 * Marca canónica que identifica todo el contenido sintético de ejemplo
 * sembrado en entornos de desarrollo y pruebas (RN-30).
 */
export const MARCA_CONTENIDO_SEED =
  '[CONTENIDO DE EJEMPLO SINTÉTICO - ETICORE SEED]';

export type ClaveTemaSeed =
  | 'privacidad_datos'
  | 'seguridad_informacion'
  | 'etica_ti';

export type ClaveFuenteVersionSeed =
  | 'lfpdppp_dof_2010'
  | 'lgpdppso_dof_2017'
  | 'nist_sp_800_63b'
  | 'owasp_auth_cheatsheet'
  | 'lfda_mexico'
  | 'acm_code_ethics_2018';

export interface TemaSeedDefinicion {
  clave: ClaveTemaSeed;
  nombre: string;
  descripcion: string;
}

export interface FuenteSeedDefinicion {
  clave: ClaveFuenteVersionSeed;
  nombreFuente: string;
  tituloEdicion: string;
  autorOrganismo: string;
  url: string;
  fechaOVersion: string;
  licenciaOCondicionUso: string;
}

export interface UnidadMetadatosSeedDefinicion {
  slug: string;
  tipo: TipoUnidad;
  titulo: string;
  descripcion: string;
  temaClave: ClaveTemaSeed;
  dificultad: DificultadUnidad;
  muestraPublica: boolean;
  citas: ReadonlyArray<{
    claveLocal: string;
    fuenteClave: ClaveFuenteVersionSeed;
    revisadaEn: string;
  }>;
}

export interface RutaSeedDefinicion {
  nombre: 'General' | 'TI';
  unidadesTitulos: ReadonlyArray<string>;
}

export const TEMAS_SEED: ReadonlyArray<TemaSeedDefinicion> = [
  {
    clave: 'privacidad_datos',
    nombre: 'Privacidad y datos personales',
    descripcion: `${MARCA_CONTENIDO_SEED} Principios de licitud, consentimiento, calidad, finalidad, lealtad, proporcionalidad y responsabilidad en el tratamiento de datos personales.`,
  },
  {
    clave: 'seguridad_informacion',
    nombre: 'Seguridad de la información',
    descripcion: `${MARCA_CONTENIDO_SEED} Prácticas de autenticación robusta, gestión de secretos, defensa ante ingeniería social y protección de activos de información.`,
  },
  {
    clave: 'etica_ti',
    nombre: 'Ética en tecnologías de la información',
    descripcion: `${MARCA_CONTENIDO_SEED} Responsabilidad profesional en el desarrollo de software, cumplimiento de licencias, propiedad intelectual y manejo ético de datos en proyectos.`,
  },
];

/**
 * Fuentes normativas y técnicas reales con URL pública verificable.
 */
export const FUENTES_SEED: ReadonlyArray<FuenteSeedDefinicion> = [
  {
    clave: 'lfpdppp_dof_2010',
    nombreFuente:
      'Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)',
    tituloEdicion:
      'Ley Federal de Protección de Datos Personales en Posesión de los Particulares',
    autorOrganismo:
      'Cámara de Diputados del H. Congreso de la Unión (Estados Unidos Mexicanos)',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf',
    fechaOVersion: 'DOF 05-07-2010',
    licenciaOCondicionUso:
      'Texto normativo federal de acceso público (Diario Oficial de la Federación, México)',
  },
  {
    clave: 'lgpdppso_dof_2017',
    nombreFuente:
      'Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados (LGPDPPSO)',
    tituloEdicion:
      'Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados',
    autorOrganismo:
      'Cámara de Diputados del H. Congreso de la Unión (Estados Unidos Mexicanos)',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGPDPPSO.pdf',
    fechaOVersion: 'DOF 26-01-2017',
    licenciaOCondicionUso:
      'Texto normativo general de acceso público (Diario Oficial de la Federación, México)',
  },
  {
    clave: 'nist_sp_800_63b',
    nombreFuente:
      'NIST Special Publication 800-63B — Digital Identity Guidelines: Authentication and Lifecycle Management',
    tituloEdicion:
      'NIST SP 800-63B: Digital Identity Guidelines — Authentication and Lifecycle Management',
    autorOrganismo: 'National Institute of Standards and Technology (NIST)',
    url: 'https://pages.nist.gov/800-63-3/sp800-63b.html',
    fechaOVersion: 'NIST SP 800-63B (Revision 3, updated 2020-03-02)',
    licenciaOCondicionUso:
      'Dominio público (U.S. Federal Government work, 17 U.S.C. § 105)',
  },
  {
    clave: 'owasp_auth_cheatsheet',
    nombreFuente: 'OWASP Authentication Cheat Sheet',
    tituloEdicion: 'OWASP Cheat Sheet Series — Authentication Cheat Sheet',
    autorOrganismo: 'Open Web Application Security Project (OWASP Foundation)',
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
    fechaOVersion: 'OWASP Cheat Sheet Series (edición pública vigente)',
    licenciaOCondicionUso:
      'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)',
  },
  {
    clave: 'lfda_mexico',
    nombreFuente: 'Ley Federal del Derecho de Autor (LFDA)',
    tituloEdicion:
      'Ley Federal del Derecho de Autor — Capítulo IV: De los Programas de Computación y las Bases de Datos',
    autorOrganismo:
      'Cámara de Diputados del H. Congreso de la Unión (Estados Unidos Mexicanos)',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFDA.pdf',
    fechaOVersion: 'DOF 24-12-1996 (reformas publicadas en DOF)',
    licenciaOCondicionUso:
      'Texto normativo federal de acceso público (Diario Oficial de la Federación, México)',
  },
  {
    clave: 'acm_code_ethics_2018',
    nombreFuente: 'ACM Code of Ethics and Professional Conduct',
    tituloEdicion:
      'ACM Code of Ethics and Professional Conduct (Adopted by ACM Council 2018)',
    autorOrganismo: 'Association for Computing Machinery (ACM)',
    url: 'https://www.acm.org/code-of-ethics',
    fechaOVersion: 'Versión adoptada el 22 de junio de 2018',
    licenciaOCondicionUso:
      'Consulta pública educativa citando a Association for Computing Machinery (ACM)',
  },
];

export const UNIDADES_METADATOS_SEED: ReadonlyArray<UnidadMetadatosSeedDefinicion> =
  [
    // 3 unidades Aprende
    {
      slug: 'aprende-minimizacion-datos',
      tipo: 'aprende',
      titulo: 'Minimización de datos',
      descripcion: `${MARCA_CONTENIDO_SEED} Lección de ejemplo sobre cómo recolectar únicamente los datos personales estrictamente necesarios para la finalidad informada conforme a la LFPDPPP.`,
      temaClave: 'privacidad_datos',
      dificultad: 'basico',
      muestraPublica: true,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'lfpdppp_dof_2010',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    {
      slug: 'aprende-contrasenas-seguras',
      tipo: 'aprende',
      titulo: 'Contraseñas seguras',
      descripcion: `${MARCA_CONTENIDO_SEED} Lección de ejemplo sobre políticas modernas de contraseñas, verificación con Argon2id y segundo factor TOTP basadas en NIST SP 800-63B y OWASP.`,
      temaClave: 'seguridad_informacion',
      dificultad: 'basico',
      muestraPublica: true,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'nist_sp_800_63b',
          revisadaEn: '2026-11-18',
        },
        {
          claveLocal: 'REF2',
          fuenteClave: 'owasp_auth_cheatsheet',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    {
      slug: 'aprende-licencias-software',
      tipo: 'aprende',
      titulo: 'Licencias de software',
      descripcion: `${MARCA_CONTENIDO_SEED} Lección de ejemplo sobre derechos de autor en programas de cómputo, diferencias entre licencias permisivas y copyleft, y ética profesional.`,
      temaClave: 'etica_ti',
      dificultad: 'intermedio',
      muestraPublica: false,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'lfda_mexico',
          revisadaEn: '2026-11-18',
        },
        {
          claveLocal: 'REF2',
          fuenteClave: 'acm_code_ethics_2018',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    // 3 unidades NormaMatch
    {
      slug: 'normamatch-principios-datos',
      tipo: 'normamatch',
      titulo: 'Relaciona cada situación con su principio',
      descripcion: `${MARCA_CONTENIDO_SEED} Actividad NormaMatch de ejemplo para identificar qué principio rector de protección de datos personales aplica a distintas decisiones cotidianas.`,
      temaClave: 'privacidad_datos',
      dificultad: 'basico',
      muestraPublica: true,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'lfpdppp_dof_2010',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    {
      slug: 'normamatch-datos-necesarios-finalidad',
      tipo: 'normamatch',
      titulo: 'Datos necesarios para la finalidad',
      descripcion: `${MARCA_CONTENIDO_SEED} Actividad NormaMatch de ejemplo para distinguir datos pertinentes de recolecciones excesivas frente a la finalidad declarada en el aviso de privacidad.`,
      temaClave: 'privacidad_datos',
      dificultad: 'intermedio',
      muestraPublica: false,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'lfpdppp_dof_2010',
          revisadaEn: '2026-11-18',
        },
        {
          claveLocal: 'REF2',
          fuenteClave: 'lgpdppso_dof_2017',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    {
      slug: 'normamatch-consentimiento-informado',
      tipo: 'normamatch',
      titulo: 'Consentimiento informado',
      descripcion: `${MARCA_CONTENIDO_SEED} Actividad NormaMatch de ejemplo sobre las modalidades del consentimiento y el derecho de revocación en el tratamiento de datos personales.`,
      temaClave: 'privacidad_datos',
      dificultad: 'intermedio',
      muestraPublica: false,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'lfpdppp_dof_2010',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    // 2 unidades CasoTech
    {
      slug: 'casotech-correo-sospechoso',
      tipo: 'casotech',
      titulo: 'Un correo sospechoso',
      descripcion: `${MARCA_CONTENIDO_SEED} Caso interactivo CasoTech de ejemplo sobre la detección y respuesta ética y técnica ante un intento de phishing dirigido al equipo.`,
      temaClave: 'seguridad_informacion',
      dificultad: 'intermedio',
      muestraPublica: true,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'nist_sp_800_63b',
          revisadaEn: '2026-11-18',
        },
        {
          claveLocal: 'REF2',
          fuenteClave: 'owasp_auth_cheatsheet',
          revisadaEn: '2026-11-18',
        },
      ],
    },
    {
      slug: 'casotech-datos-companero-proyecto',
      tipo: 'casotech',
      titulo: 'Datos de un compañero en un proyecto',
      descripcion: `${MARCA_CONTENIDO_SEED} Caso interactivo CasoTech de ejemplo sobre el uso de datos sintéticos frente a datos reales de personas en un proyecto de desarrollo de software.`,
      temaClave: 'etica_ti',
      dificultad: 'especializado',
      muestraPublica: false,
      citas: [
        {
          claveLocal: 'REF1',
          fuenteClave: 'lfpdppp_dof_2010',
          revisadaEn: '2026-11-18',
        },
        {
          claveLocal: 'REF2',
          fuenteClave: 'acm_code_ethics_2018',
          revisadaEn: '2026-11-18',
        },
      ],
    },
  ];

export const RUTAS_SEED: ReadonlyArray<RutaSeedDefinicion> = [
  {
    nombre: 'General',
    unidadesTitulos: [
      'Minimización de datos',
      'Contraseñas seguras',
      'Relaciona cada situación con su principio',
      'Consentimiento informado',
      'Un correo sospechoso',
    ],
  },
  {
    nombre: 'TI',
    unidadesTitulos: [
      'Minimización de datos',
      'Contraseñas seguras',
      'Licencias de software',
      'Datos necesarios para la finalidad',
      'Un correo sospechoso',
      'Datos de un compañero en un proyecto',
    ],
  },
];
