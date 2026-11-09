import { ApiProperty } from '@nestjs/swagger';

export class WriteForMeResponseBodyDTO {
    @ApiProperty({
        description:
            "The user's next Message, in English, as the worn identity: for the composer, to check, edit and send. Nothing is stored.",
    })
    text: string;
}
