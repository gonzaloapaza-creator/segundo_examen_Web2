import { applyDecorators, Type } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiExtraModels, ApiNotFoundResponse, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

export class PageMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 57 }) totalItems: number;
  @ApiProperty({ example: 3 }) totalPages: number;
  @ApiProperty({ example: true }) hasNextPage: boolean;
  @ApiProperty({ example: false }) hasPreviousPage: boolean;
}

/** Documenta una respuesta paginada { data: T[], meta: PageMeta }. */
export const ApiPaginatedResponse = <T extends Type<unknown>>(model: T) =>
  applyDecorators(
    ApiExtraModels(PageMetaDto, model),
    ApiOkResponse({
      schema: {
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMetaDto) },
        },
      },
    }),
  );

export const ApiValidationError = () => ApiBadRequestResponse({ description: 'Datos invalidos (code: VALIDATION_ERROR)', type: ErrorResponseDto });
export const ApiNotFound = (description = 'Recurso no encontrado') => ApiNotFoundResponse({ description, type: ErrorResponseDto });
export const ApiConflict = (description: string) => ApiConflictResponse({ description, type: ErrorResponseDto });
