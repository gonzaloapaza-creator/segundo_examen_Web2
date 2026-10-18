import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, ErrorCode } from '../errors/app.exception';

interface FieldError {
  field: string;
  constraints: string[];
}

const flatten = (errors: ValidationError[], parent = ''): FieldError[] =>
  errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, constraints: Object.values(e.constraints) }] : [];
    return own.concat(flatten(e.children ?? [], field));
  });

/**
 * Validacion global: rechaza campos desconocidos, transforma tipos primitivos de query/params
 * y devuelve errores con el formato unico del backend.
 */
export const createValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) =>
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Datos de entrada invalidos', flatten(errors)),
  });
