import { ApiProperty } from '@nestjs/swagger';

import type { PersonaResponse } from '../../../model/persona/entities/persona.entity.js';

export class PersonaResponseBodyDTO implements PersonaResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty({ description: 'May be empty.' })
    description: string;

    @ApiProperty({ type: String, nullable: true, description: 'Its picture, served by `GET /api/images/{path}`; null without one.' })
    imagePath: string | null;

    @ApiProperty({ description: 'ISO 8601.' })
    createdAt: string;

    @ApiProperty({ description: 'ISO 8601.' })
    updatedAt: string;
}

export class ListPersonasResponseBodyDTO {
    @ApiProperty({ type: [PersonaResponseBodyDTO], description: 'Oldest first.' })
    personas: PersonaResponseBodyDTO[];
}
