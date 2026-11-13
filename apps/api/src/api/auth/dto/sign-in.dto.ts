import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SignInRequestBodyDTO {
    @ApiProperty({ description: 'The owner password set in LOGIN_PASSWORD. Wrong is `WrongPasswordError`.' })
    @IsString()
    @MaxLength(1_000)
    password: string;
}

export class SupabaseSignInRequestBodyDTO {
    @ApiProperty({ description: 'The Supabase access token the browser got from signing in. Checked once; the API keeps no Supabase session.' })
    @IsString()
    @MaxLength(10_000)
    accessToken: string;
}

export class SupabaseSettingsDTO {
    @ApiProperty({ example: 'https://abcd.supabase.co' })
    url: string;

    @ApiProperty({ description: 'The anon (publishable) key: public by design.' })
    anonKey: string;
}

export class SignInMethodsDTO {
    @ApiProperty({ description: 'The owner password works (LOGIN_PASSWORD is set).' })
    password: boolean;

    @ApiProperty({ type: () => SupabaseSettingsDTO, nullable: true, description: 'Google and email sign-in, when SUPABASE_URL and SUPABASE_ANON_KEY are set.' })
    supabase: SupabaseSettingsDTO | null;
}

export class GetSignInStatusResponseBodyDTO {
    @ApiProperty({ description: 'False while LOGIN_PASSWORD is unset: every route answers without a session.' })
    required: boolean;

    @ApiProperty({ description: 'Whether this request carries a valid session (always true while sign-in is off).' })
    signedIn: boolean;

    @ApiProperty({ type: () => SignedInAccountDTO, nullable: true, description: 'The Account signed in; the Owner while sign-in is off.' })
    account: SignedInAccountDTO | null;

    @ApiProperty({ type: () => SignInMethodsDTO })
    methods: SignInMethodsDTO;
}

export class SignedInAccountDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    email: string;

    @ApiProperty({ enum: ['owner', 'member'] })
    role: string;
}
