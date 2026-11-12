import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SignInRequestBodyDTO {
    @ApiProperty({ description: 'The owner password set in LOGIN_PASSWORD. Wrong is `WrongPasswordError`.' })
    @IsString()
    @MaxLength(1_000)
    password: string;
}

export class GetSignInStatusResponseBodyDTO {
    @ApiProperty({ description: 'False while LOGIN_PASSWORD is unset: every route answers without a session.' })
    required: boolean;

    @ApiProperty({ description: 'Whether this request carries a valid session (always true while sign-in is off).' })
    signedIn: boolean;
}
