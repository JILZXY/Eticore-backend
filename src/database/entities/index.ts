import { AuditoriaBd } from './auditoria-bd.entity.js';
import { Auditoria } from './auditoria.entity.js';
import { Credencial } from './credencial.entity.js';
import { CreditoUnidad } from './credito-unidad.entity.js';
import { DesafioAutenticacion } from './desafio-autenticacion.entity.js';
import { DocumentoLegal } from './documento-legal.entity.js';
import { EventoLegal } from './evento-legal.entity.js';
import { FuenteVersion } from './fuente-version.entity.js';
import { Fuente } from './fuente.entity.js';
import { Grupo } from './grupo.entity.js';
import { GuardaIntegridad } from './guarda-integridad.entity.js';
import { InscripcionRuta } from './inscripcion-ruta.entity.js';
import { Insignia } from './insignia.entity.js';
import { Intento } from './intento.entity.js';
import { MembresiaGrupo } from './membresia-grupo.entity.js';
import { RevisionEditorial } from './revision-editorial.entity.js';
import { Rol } from './rol.entity.js';
import { RutaUnidad } from './ruta-unidad.entity.js';
import { Ruta } from './ruta.entity.js';
import { SegundoFactor } from './segundo-factor.entity.js';
import { Sesion } from './sesion.entity.js';
import { SolicitudPrivacidad } from './solicitud-privacidad.entity.js';
import { Tema } from './tema.entity.js';
import { UnidadFuente } from './unidad-fuente.entity.js';
import { Unidad } from './unidad.entity.js';
import { UsuarioInsignia } from './usuario-insignia.entity.js';
import { UsuarioRol } from './usuario-rol.entity.js';
import { Usuario } from './usuario.entity.js';
import { VersionDocumento } from './version-documento.entity.js';
import { VersionRuta } from './version-ruta.entity.js';
import { VersionUnidad } from './version-unidad.entity.js';

export {
  Auditoria,
  AuditoriaBd,
  Credencial,
  CreditoUnidad,
  DesafioAutenticacion,
  DocumentoLegal,
  EventoLegal,
  Fuente,
  FuenteVersion,
  Grupo,
  GuardaIntegridad,
  InscripcionRuta,
  Insignia,
  Intento,
  MembresiaGrupo,
  RevisionEditorial,
  Rol,
  Ruta,
  RutaUnidad,
  SegundoFactor,
  Sesion,
  SolicitudPrivacidad,
  Tema,
  Unidad,
  UnidadFuente,
  Usuario,
  UsuarioInsignia,
  UsuarioRol,
  VersionDocumento,
  VersionRuta,
  VersionUnidad,
};

export const ALL_ENTITIES = [
  Rol,
  Tema,
  Fuente,
  DocumentoLegal,
  Insignia,
  Grupo,
  Usuario,
  Credencial,
  SegundoFactor,
  Sesion,
  DesafioAutenticacion,
  UsuarioRol,
  Unidad,
  VersionUnidad,
  RevisionEditorial,
  FuenteVersion,
  UnidadFuente,
  Ruta,
  VersionRuta,
  RutaUnidad,
  InscripcionRuta,
  Intento,
  CreditoUnidad,
  UsuarioInsignia,
  MembresiaGrupo,
  VersionDocumento,
  EventoLegal,
  Auditoria,
  AuditoriaBd,
  SolicitudPrivacidad,
  GuardaIntegridad,
] as const;
