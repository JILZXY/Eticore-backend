import {
  UNIDADES_METADATOS_SEED,
  type UnidadMetadatosSeedDefinicion,
} from './content-catalog.data.js';

export interface LeccionSeedDefinicion extends UnidadMetadatosSeedDefinicion {
  contenido: Record<string, unknown>;
}

const CONTENIDOS_POR_SLUG: Readonly<Record<string, Record<string, unknown>>> = {
  // =========================================================================
  // 1. Aprende — Minimización de datos
  // =========================================================================
  'aprende-minimizacion-datos': {
    objetivo:
      '[CONTENIDO DE EJEMPLO] Comprender y aplicar el principio de proporcionalidad y minimización en el diseño de formularios y bases de datos para recolectar únicamente los datos personales indispensables para la finalidad informada.',
    secciones: [
      {
        id: 'sec-1',
        orden: 1,
        titulo: 'El principio de proporcionalidad y minimización',
        cuerpo:
          'El tratamiento de datos personales debe limitarse a aquellos datos que resulten adecuados, relevantes y no excesivos en relación con las finalidades concretas, explícitas y legítimas declaradas en el aviso de privacidad. Recolectar campos "por si se ocupan en el futuro" incrementa la superficie de riesgo y contraviene el principio de proporcionalidad.',
        referencia_local: 'REF1',
      },
      {
        id: 'sec-2',
        orden: 2,
        titulo: 'Finalidades primarias frente a datos innecesarios',
        cuerpo:
          'Al diseñar un flujo de registro educativo o transaccional, cada atributo solicitado debe justificarse por una necesidad operativa real. Si una plataforma solo necesita identificar una cuenta con un nombre de visualización y un correo electrónico, solicitar teléfono, domicilio, edad o identificación oficial resulta desproporcionado.',
        referencia_local: 'REF1',
      },
      {
        id: 'sec-3',
        orden: 3,
        titulo: 'Ciclo de vida, retención y supresión oportuna',
        cuerpo:
          'La minimización también aplica en el tiempo: cuando los datos personales han dejado de ser necesarios para el cumplimiento de las finalidades previstas en el aviso de privacidad y las disposiciones aplicables, deben bloquearse y posteriormente suprimirse o seudonimizarse de manera controlada.',
        referencia_local: 'REF1',
      },
    ],
    ejemplo: {
      titulo: 'Rediseño de formulario de inscripción académica de ejemplo',
      descripcion:
        'Un equipo de desarrollo reemplazó un formulario de 14 campos personales por solo 2 atributos esenciales (nombre de visualización y correo normalizado), reduciendo el riesgo de exposición sin afectar la operación educativa.',
    },
    buenas_practicas: [
      'Justificar documentalmente la finalidad primaria de cada columna antes de agregarla al esquema.',
      'Evitar campos de texto libre donde las personas puedan introducir datos sensibles o de terceros sin necesidad.',
      'Establecer plazos claros de retención y purga para sesiones, desafíos temporales y bitácoras.',
    ],
  },

  // =========================================================================
  // 2. Aprende — Contraseñas seguras
  // =========================================================================
  'aprende-contrasenas-seguras': {
    objetivo:
      '[CONTENIDO DE EJEMPLO] Aplicar estándares técnicos modernos para la política de contraseñas, su derivación criptográfica en servidor y el refuerzo con segundo factor TOTP.',
    secciones: [
      {
        id: 'sec-1',
        orden: 1,
        titulo: 'Longitud y entropía por encima de reglas arbitrarias',
        cuerpo:
          'Las guías modernas de identidad digital priorizan una longitud mínima robusta (por ejemplo, de 15 a 128 caracteres) y el rechazo de contraseñas comprometidas o triviales, en lugar de imponer cambios forzados periódicos o combinaciones predecibles de símbolos que incentivan patrones débiles.',
        referencia_local: 'REF1',
      },
      {
        id: 'sec-2',
        orden: 2,
        titulo: 'Almacenamiento con funciones adaptativas de memoria dura',
        cuerpo:
          'El servidor nunca debe almacenar contraseñas en claro ni con funciones de resumen rápidas como SHA-256 directo. Debe emplear un algoritmo de derivación resistente a hardware especializado, como Argon2id con sal aleatoria única por credencial, y aislar la tabla de credenciales de las consultas ordinarias.',
        referencia_local: 'REF2',
      },
      {
        id: 'sec-3',
        orden: 3,
        titulo: 'Segundo factor TOTP y protección del secreto',
        cuerpo:
          'Para roles administrativos y operaciones críticas, la contraseña debe complementarse con un segundo factor temporal (TOTP). El secreto compartido TOTP se almacena cifrado de forma autenticada (AES-256-GCM) con llave gestionada fuera de la base de datos y con control anti-replay del último paso aceptado.',
        referencias_locales: ['REF1', 'REF2'],
      },
    ],
    ejemplo: {
      titulo: 'Frase de paso larga frente a contraseña corta compleja',
      descripcion:
        'Una frase de paso de 20 caracteres con espacios ofrece mayor resistencia ante ataques de fuerza bruta y es más fácil de recordar para la persona usuaria que una cadena de 8 caracteres como "P@ssw0rd1".',
    },
    buenas_practicas: [
      'Aceptar frases de paso largas (15 a 128 caracteres) permitiendo caracteres imprimibles y espacios internos.',
      'Comparar las contraseñas candidatas contra una lista de contraseñas comunes o comprometidas antes de derivar el hash.',
      'Exigir segundo factor verificado en cada sesión de cuentas con privilegios administrativos.',
    ],
  },

  // =========================================================================
  // 3. Aprende — Licencias de software
  // =========================================================================
  'aprende-licencias-software': {
    objetivo:
      '[CONTENIDO DE EJEMPLO] Distinguir los derechos patrimoniales y morales en programas de cómputo, así como las obligaciones éticas y legales al integrar bibliotecas con licencias permisivas, copyleft o propietarias.',
    secciones: [
      {
        id: 'sec-1',
        orden: 1,
        titulo: 'Protección jurídica de los programas de computación',
        cuerpo:
          'Los programas de computación se protegen en los mismos términos que las obras literarias. El autor conserva derechos morales irrenunciables y derechos patrimoniales que facultan para autorizar o prohibir la reproducción, traducción, adaptación y distribución del código.',
        referencia_local: 'REF1',
      },
      {
        id: 'sec-2',
        orden: 2,
        titulo: 'Licencias permisivas, copyleft y propietarias',
        cuerpo:
          'Una licencia de software define las condiciones bajo las cuales un tercero puede usar, modificar o redistribuir el código. Las licencias permisivas (como MIT o Apache-2.0) exigen conservar avisos de autoría; las licencias copyleft (como GPL) requieren que las obras derivadas distribuidas mantengan la misma libertad; el software sin licencia explícita conserva todos los derechos reservados.',
        referencia_local: 'REF1',
      },
      {
        id: 'sec-3',
        orden: 3,
        titulo: 'Integridad profesional al reutilizar componentes',
        cuerpo:
          'El código público en repositorios abiertos no equivale a dominio público si carece de licencia. La ética profesional exige respetar la propiedad intelectual, otorgar el crédito correspondiente a las personas autoras y verificar la compatibilidad de licencias antes de incorporar dependencias a un proyecto.',
        referencias_locales: ['REF1', 'REF2'],
      },
    ],
    ejemplo: {
      titulo: 'Auditoría de dependencias antes de publicar un paquete',
      descripcion:
        'Antes de distribuir un sistema académico, el equipo revisa el archivo de licencias de todas las bibliotecas empleadas y conserva los textos de atribución exigidos por sus autores.',
    },
    buenas_practicas: [
      'No copiar fragmentos de repositorios sin licencia explícita asumiendo que son de uso libre.',
      'Mantener intactos los encabezados de copyright y archivos LICENSE de las bibliotecas de terceros.',
      'Documentar la licencia del propio proyecto y verificar la compatibilidad entre dependencias.',
    ],
  },

  // =========================================================================
  // 4. NormaMatch — Relaciona cada situación con su principio
  // =========================================================================
  'normamatch-principios-datos': {
    opciones: [
      {
        id: 'op-proporcionalidad',
        texto: 'Principio de proporcionalidad (minimización de datos)',
      },
      {
        id: 'op-finalidad',
        texto: 'Principio de finalidad determinada y explícita',
      },
      {
        id: 'op-informacion',
        texto: 'Principio de información (aviso de privacidad previo)',
      },
      {
        id: 'op-responsabilidad',
        texto: 'Principio de responsabilidad y medidas de seguridad',
      },
    ],
    situaciones: [
      {
        id: 'sit-1',
        enunciado:
          '[EJEMPLO] Un equipo elimina de su formulario de registro los campos de domicilio, edad y teléfono porque la plataforma solo necesita identificar al aprendiz por su nombre de visualización y correo.',
        respuesta_correcta: 'op-proporcionalidad',
        explicacion:
          'Conforme al principio de proporcionalidad de la LFPDPPP, solo deben recabarse los datos personales que resulten necesarios, adecuados y no excesivos para las finalidades previstas.',
        referencia_local: 'REF1',
      },
      {
        id: 'sit-2',
        enunciado:
          '[EJEMPLO] Antes de recabar cualquier dato en el flujo de alta, la aplicación muestra de forma clara quién es el responsable del tratamiento y con qué propósitos se utilizará la información.',
        respuesta_correcta: 'op-informacion',
        explicacion:
          'El principio de información obliga a dar a conocer a la persona titular, mediante el aviso de privacidad, la existencia y las características principales del tratamiento antes de recabar sus datos.',
        referencia_local: 'REF1',
      },
      {
        id: 'sit-3',
        enunciado:
          '[EJEMPLO] Una organización evita utilizar los correos registrados para actividades académicas con fines de prospección publicitaria no contemplados ni aceptados originalmente.',
        respuesta_correcta: 'op-finalidad',
        explicacion:
          'El principio de finalidad establece que el tratamiento debe limitarse al cumplimiento de las finalidades determinadas y explícitas en el aviso de privacidad; una finalidad distinta requiere un nuevo consentimiento.',
        referencia_local: 'REF1',
      },
    ],
  },

  // =========================================================================
  // 5. NormaMatch — Datos necesarios para la finalidad
  // =========================================================================
  'normamatch-datos-necesarios-finalidad': {
    opciones: [
      {
        id: 'op-necesario',
        texto: 'Dato pertinente y estrictamente necesario para la finalidad primaria',
      },
      {
        id: 'op-excesivo',
        texto: 'Dato excesivo o desproporcionado que no debe recolectarse',
      },
      {
        id: 'op-agregado',
        texto: 'Medida de privacidad por diseño mediante agregación con umbral mínimo',
      },
    ],
    situaciones: [
      {
        id: 'sit-1',
        enunciado:
          '[EJEMPLO] Solicitar fotografía de una identificación oficial adjunta por defecto para poder enviar una duda general sobre el aviso de privacidad en un prototipo académico.',
        respuesta_correcta: 'op-excesivo',
        explicacion:
          'Recabar copias de documentos oficiales de identidad sin necesidad estricta vulnera la minimización de datos e introduce riesgos graves de suplantación ante cualquier incidente.',
        referencias_locales: ['REF1', 'REF2'],
      },
      {
        id: 'sit-2',
        enunciado:
          '[EJEMPLO] Almacenar el correo electrónico normalizado y un verificador Argon2id para autenticar la sesión del usuario en la plataforma educativa.',
        respuesta_correcta: 'op-necesario',
        explicacion:
          'El identificador de correo normalizado y el verificador criptográfico de la credencial son los elementos mínimos indispensables para autenticar a la cuenta de forma segura.',
        referencia_local: 'REF1',
      },
      {
        id: 'sit-3',
        enunciado:
          '[EJEMPLO] Mostrar al instructor únicamente el promedio grupal cuando la celda cuenta con al menos 5 participantes elegibles y ocultar las respuestas individuales.',
        respuesta_correcta: 'op-agregado',
        explicacion:
          'Suprimir el promedio en celdas con menos de 5 participantes e impedir la consulta nominal evita la inferencia del desempeño individual cuando la finalidad del reporte es únicamente grupal.',
        referencias_locales: ['REF1', 'REF2'],
      },
    ],
  },

  // =========================================================================
  // 6. NormaMatch — Consentimiento informado
  // =========================================================================
  'normamatch-consentimiento-informado': {
    opciones: [
      {
        id: 'op-consentimiento-valido',
        texto: 'Consentimiento libre, específico e informado ligado a una versión exacta',
      },
      {
        id: 'op-revocacion-consentimiento',
        texto: 'Ejercicio del derecho de revocación del consentimiento sin borrar evidencia histórica',
      },
      {
        id: 'op-practica-invalida',
        texto: 'Práctica inválida por falta de transparencia o aceptación forzada oculta',
      },
    ],
    situaciones: [
      {
        id: 'sit-1',
        enunciado:
          '[EJEMPLO] Registrar el evento de aceptación de términos asociándolo a la versión inmutable del documento y a su huella SHA-256 tras presentar el texto completo.',
        respuesta_correcta: 'op-consentimiento-valido',
        explicacion:
          'Un consentimiento informado requiere que la persona conozca la versión exacta del documento legal que acepta, conservando trazabilidad verificable de dicha versión.',
        referencia_local: 'REF1',
      },
      {
        id: 'sit-2',
        enunciado:
          '[EJEMPLO] Cuando una persona retira su consentimiento para una finalidad opcional, el sistema registra un nuevo evento de retiro con marca temporal sin sobrescribir ni destruir el registro histórico previo.',
        respuesta_correcta: 'op-revocacion-consentimiento',
        explicacion:
          'La revocación surte efectos hacia el futuro: el estado vigente se determina por el evento más reciente por finalidad, conservando la integridad de la bitácora histórica.',
        referencia_local: 'REF1',
      },
      {
        id: 'sit-3',
        enunciado:
          '[EJEMPLO] Modificar el texto de un documento legal ya publicado sobre la misma fila para que parezca que los usuarios anteriores aceptaron cláusulas nuevas.',
        respuesta_correcta: 'op-practica-invalida',
        explicacion:
          'Las versiones de documentos legales deben ser inmutables una vez publicadas; cualquier cambio sustancial exige publicar una nueva versión y recabar el evento correspondiente.',
        referencia_local: 'REF1',
      },
    ],
  },

  // =========================================================================
  // 7. CasoTech — Un correo sospechoso
  // =========================================================================
  'casotech-correo-sospechoso': {
    etapa_inicial_id: 'etapa-1',
    etapas: [
      {
        id: 'etapa-1',
        titulo: 'Alerta urgente de suspensión de cuenta institucional',
        enunciado:
          '[EJEMPLO] Recibes un correo que aparenta provenir de soporte técnico indicando que tu cuenta de administración será desactivada en 15 minutos si no ingresas tu contraseña y un código TOTP actual en un enlace externo acortado.',
        contexto:
          'Tienes permisos de edición en el sistema y estás a mitad de una jornada de revisión.',
        terminal: false,
        referencia_local: 'REF1',
        alternativas: [
          {
            id: 'alt-1a',
            texto:
              'No abrir el enlace externo, inspeccionar el remitente real y verificar el estado de tu cuenta accediendo directamente por el canal oficial conocido.',
            ponderacion: 2,
            siguiente_etapa_id: 'etapa-2',
            explicacion:
              'Excelente decisión: nunca se deben introducir credenciales ni códigos TOTP en enlaces recibidos por mensajes no solicitados; la verificación siempre se realiza por el canal oficial.',
          },
          {
            id: 'alt-1b',
            texto:
              'Responder al mismo correo preguntando al remitente si el mensaje es legítimo antes de hacer clic en el enlace.',
            ponderacion: 1,
            siguiente_etapa_id: 'etapa-2',
            explicacion:
              'Evitaste entregar tus credenciales de inmediato, pero interactuar con el remitente confirma que tu buzón está activo y un atacante puede responderte con engaños adicionales.',
          },
          {
            id: 'alt-1c',
            texto:
              'Ingresar rápidamente tu contraseña y código TOTP en el enlace acortado para evitar que bloqueen tu cuenta.',
            ponderacion: 0,
            siguiente_etapa_id: 'etapa-2',
            explicacion:
              'Riesgo crítico: entregar la contraseña y un código TOTP en tiempo real permite a un atacante de phishing en proxy iniciar sesión antes de que venza la ventana del código.',
          },
        ],
      },
      {
        id: 'etapa-2',
        titulo: 'Protección del equipo y contención del incidente',
        enunciado:
          '[EJEMPLO] Un compañero del equipo te comenta por el chat interno que recibió el mismo correo hace dos minutos y está a punto de abrir el formulario externo.',
        contexto:
          'El ataque está dirigido a varias cuentas del grupo de trabajo.',
        terminal: false,
        referencias_locales: ['REF1', 'REF2'],
        alternativas: [
          {
            id: 'alt-2a',
            texto:
              'Advertir de inmediato a tu compañero que no abra el enlace, reportar el intento al área de seguridad y verificar si alguna sesión requiere revocación preventiva.',
            ponderacion: 2,
            siguiente_etapa_id: 'etapa-fin',
            explicacion:
              'Conducta ejemplar: la alerta temprana al equipo y la notificación al canal de seguridad detienen la cadena de ingeniería social y permiten revocar sesiones si alguien cayó en el engaño.',
          },
          {
            id: 'alt-2b',
            texto:
              'Avisar únicamente a tu compañero en privado para que no haga clic, pero no reportar el incidente para no generar trámites.',
            ponderacion: 1,
            siguiente_etapa_id: 'etapa-fin',
            explicacion:
              'Protegiste a tu compañero inmediato, pero omitir el reporte impide alertar al resto de la organización y bloquear la campaña de suplantación.',
          },
          {
            id: 'alt-2c',
            texto:
              'Reenviar el correo sospechoso con el enlace activo a toda la lista de distribución general sin contexto ni advertencia.',
            ponderacion: 0,
            siguiente_etapa_id: 'etapa-fin',
            explicacion:
              'Acción contraproducente: reenviar enlaces maliciosos activos a listas masivas multiplica la probabilidad de que otra persona haga clic confiando en tu remitente interno.',
          },
        ],
      },
      {
        id: 'etapa-fin',
        titulo: 'Cierre del caso: defensa activa ante phishing',
        enunciado:
          '[EJEMPLO] El incidente queda documentado: la combinación de verificación por canal oficial, negativa a entregar códigos TOTP en enlaces externos y reporte oportuno protegió las cuentas del equipo.',
        terminal: true,
      },
    ],
  },

  // =========================================================================
  // 8. CasoTech — Datos de un compañero en un proyecto
  // =========================================================================
  'casotech-datos-companero-proyecto': {
    etapa_inicial_id: 'etapa-1',
    etapas: [
      {
        id: 'etapa-1',
        titulo: 'Propuesta de usar datos reales para poblar el entorno de pruebas',
        enunciado:
          '[EJEMPLO] Durante el desarrollo de un proyecto académico de software, un integrante sugiere exportar un listado con nombres completos, correos reales y teléfonos de compañeros de otra asignatura para poblar las pruebas automatizadas del repositorio.',
        contexto:
          'El repositorio es compartido por todo el equipo y se ejecuta en entornos locales de desarrollo.',
        terminal: false,
        referencias_locales: ['REF1', 'REF2'],
        alternativas: [
          {
            id: 'alt-1a',
            texto:
              'Rechazar el uso de datos de personas reales y proponer un generador de datos sintéticos claramente marcados como de ejemplo y con dominios reservados.',
            ponderacion: 2,
            siguiente_etapa_id: 'etapa-2',
            explicacion:
              'Decisión ética y legalmente correcta: para desarrollo y pruebas no existe justificación para tratar datos reales de terceros; los datos sintéticos cumplen la finalidad técnica sin exponer a nadie.',
          },
          {
            id: 'alt-1b',
            texto:
              'Usar el archivo real únicamente en tu computadora local prometiendo no subirlo al repositorio compartido.',
            ponderacion: 1,
            siguiente_etapa_id: 'etapa-2',
            explicacion:
              'Aunque evitaste publicarlo en el repositorio, sigues tratando datos personales reales en un entorno no autorizado y sin el consentimiento de sus titulares para esa finalidad.',
          },
          {
            id: 'alt-1c',
            texto:
              'Subir el listado real directamente a la carpeta de seeds del repositorio para terminar rápido la entrega.',
            ponderacion: 0,
            siguiente_etapa_id: 'etapa-2',
            explicacion:
              'Incumplimiento grave de privacidad y ética profesional: incorporar datos personales reales en el control de versiones expone permanentemente la información de terceros sin su consentimiento.',
          },
        ],
      },
      {
        id: 'etapa-2',
        titulo: 'Controles técnicos en el script de seed del proyecto',
        enunciado:
          '[EJEMPLO] El equipo acuerda crear un script de seed con contenido sintético para desarrollo. Ahora deben definir cómo se ejecutará dicho script dentro de la arquitectura del proyecto.',
        contexto:
          'La misma imagen de contenedor se emplea en desarrollo, pruebas y despliegue.',
        terminal: false,
        referencias_locales: ['REF1', 'REF2'],
        alternativas: [
          {
            id: 'alt-2a',
            texto:
              'Hacer que el seed sea idempotente, se ejecute solo manualmente en desarrollo, bloquee su ejecución cuando NODE_ENV=production y no incluya contraseñas hardcodeadas.',
            ponderacion: 2,
            siguiente_etapa_id: 'etapa-fin',
            explicacion:
              'Diseño robusto: separar la ejecución manual del seed, impedir que corra en producción y exigir secretos por variables de entorno evita contaminar entornos productivos o filtrar credenciales.',
          },
          {
            id: 'alt-2b',
            texto:
              'Ejecutar el seed manualmente pero dejar una contraseña fija dentro del código fuente para mayor comodidad.',
            ponderacion: 1,
            siguiente_etapa_id: 'etapa-fin',
            explicacion:
              'Separar la ejecución manual es adecuado, pero incrustar contraseñas en el código fuente crea credenciales conocidas en el historial del repositorio.',
          },
          {
            id: 'alt-2c',
            texto:
              'Configurar la API para que ejecute automáticamente el seed de prueba y cree cuentas con contraseña fija cada vez que arranque en cualquier entorno.',
            ponderacion: 0,
            siguiente_etapa_id: 'etapa-fin',
            explicacion:
              'Riesgo crítico: sembrar cuentas o contenidos de prueba automáticamente al arrancar en producción introduce accesos no autorizados y altera los datos del sistema.',
          },
        ],
      },
      {
        id: 'etapa-fin',
        titulo: 'Cierre del caso: desarrollo ético con datos sintéticos',
        enunciado:
          '[EJEMPLO] El proyecto queda protegido con datos 100 % sintéticos, marcados explícitamente como contenido de ejemplo y con salvaguardas técnicas que impiden su ejecución en producción.',
        terminal: true,
      },
    ],
  },
};

export const LECCIONES_SEED: ReadonlyArray<LeccionSeedDefinicion> =
  UNIDADES_METADATOS_SEED.map((meta) => {
    const contenido = CONTENIDOS_POR_SLUG[meta.slug];
    if (!contenido) {
      throw new Error(
        `No se encontró definición de contenido JSONB para la unidad de seed "${meta.slug}".`,
      );
    }
    return {
      ...meta,
      contenido,
    };
  });
