import { ApiProperty } from '@nestjs/swagger';

export class ThaiReadingResponseBodyDTO {
    @ApiProperty({ description: 'The Message it reads.' })
    messageId: number;

    @ApiProperty({ description: "The Message's stored text in Thai, names and `Name:` labels kept as written. Never sent to the AI." })
    text: string;
}
