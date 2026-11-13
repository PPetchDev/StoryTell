import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNumber, IsOptional, Max, MaxLength, Min } from 'class-validator';

/** A Monthly cap is a few dollars; anything past this is a typo. */
const CAP_MAX_USD = 1_000;

export class AddPersonRequestBodyDTO {
    @ApiProperty({ example: 'rin@example.com', description: 'Matched lowercase against the email they sign in with.' })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    @MaxLength(320)
    email: string;

    @ApiProperty({ example: 2, description: 'Their Monthly cap in USD.' })
    @IsNumber()
    @Min(0)
    @Max(CAP_MAX_USD)
    monthlyCapUsd: number;
}

export class UpdatePersonRequestBodyDTO {
    @ApiPropertyOptional({ description: "A Member's new Monthly cap in USD. Ignored for the Owner." })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(CAP_MAX_USD)
    monthlyCapUsd?: number;

    @ApiPropertyOptional({ description: 'Pause or resume their access; takes effect on their next request. Not for the Owner.' })
    @IsOptional()
    @IsBoolean()
    disabled?: boolean;
}

export class PersonResponseBodyDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    email: string;

    @ApiProperty({ enum: ['owner', 'member'] })
    role: string;

    @ApiProperty({ type: Number, nullable: true, description: 'Null for the Owner, who has no cap.' })
    monthlyCapUsd: number | null;

    @ApiProperty()
    disabled: boolean;

    @ApiProperty({ description: 'Spent since the first of this month, UTC.' })
    spentThisMonthUsd: number;

    @ApiProperty({ description: 'Whether they have signed in through Supabase at least once.' })
    signedInBefore: boolean;
}

export class ListPeopleResponseBodyDTO {
    @ApiProperty({ type: [PersonResponseBodyDTO], description: 'The Owner first, then Members in the order they were added.' })
    people: PersonResponseBodyDTO[];
}
