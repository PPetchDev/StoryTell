import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class PickReferenceImageRequestBodyDTO {
    @ApiProperty({ description: 'The id of a candidate from the latest round for this Character.' })
    @IsString()
    @Length(1, 64)
    candidateId: string;
}
