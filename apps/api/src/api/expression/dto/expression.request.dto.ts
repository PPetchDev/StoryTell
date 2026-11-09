import { ApiProperty } from '@nestjs/swagger';

/** Swagger's picture of the multipart upload. */
export class UploadExpressionRequestBodyDTO {
    @ApiProperty({ type: 'string', format: 'binary', description: 'A PNG, JPEG or WebP picture, at most 15 MB.' })
    image: unknown;
}
