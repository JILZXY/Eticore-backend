import { IsIn } from 'class-validator';

export type ResultadoRevisionEditorial =
  | 'aprobada'
  | 'rechazada'
  | 'observaciones';

export class CrearRevisionEditorialDto {
  @IsIn(['aprobada', 'rechazada', 'observaciones'], {
    message: 'resultado debe ser aprobada, rechazada u observaciones',
  })
  resultado!: ResultadoRevisionEditorial;
}
