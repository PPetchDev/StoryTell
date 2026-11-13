import { AppError } from './app-error.js';
import { ModelGatewayError } from './model-gateway.errors.js';

/** A request without a valid session while sign-in is on (.scratch/sign-in/spec.md). */
export class SignInRequiredError extends AppError {
    constructor() {
        super('401.010.001', 'Sign in first.');
    }
}

/** A sign-in with the wrong password. */
export class WrongPasswordError extends AppError {
    constructor() {
        super('401.010.002', 'That password is wrong.');
    }
}

/** A sign-in while guessing is locked out, right password or not. */
export class TooManySignInTriesError extends AppError {
    constructor(minutesLeft: number) {
        super('429.010.003', `Too many wrong passwords. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
    }
}

/** A Supabase access token that doesn't verify (.scratch/accounts/spec.md: "Supabase sign-in"). */
export class SupabaseTokenInvalidError extends AppError {
    constructor() {
        super('401.010.004', "That sign-in didn't go through. Try again.");
    }
}

/** A Supabase sign-in by an email that isn't on the People list, or was removed from it. */
export class NotOnPeopleListError extends AppError {
    constructor() {
        super('403.010.005', "This email isn't on this Storytell's People list. Ask its Owner to add you.");
    }
}

/**
 * A first sign-in with email + password claiming a listed email when nothing says Supabase confirmed
 * it: anyone could have made that Supabase user. Google proves the email; so does SUPABASE_EMAILS_CONFIRMED.
 */
export class EmailNotProvenError extends AppError {
    constructor() {
        super('403.010.014', 'Sign in with Google the first time, or ask the Owner to finish setting up email sign-in.');
    }
}

/** A sign-in by an Account the Owner disabled. */
export class AccountDisabledError extends AppError {
    constructor() {
        super('403.010.006', 'Your Account is paused. Ask the Owner to turn it back on.');
    }
}

/** A Member at a route only the Owner may use. */
export class OwnerOnlyError extends AppError {
    constructor() {
        super('403.010.007', 'Only the Owner can do that.');
    }
}

/** Adding an email that is already on the People list. */
export class EmailAlreadyListedError extends AppError {
    constructor() {
        super('409.010.008', 'That email is already on the People list.');
    }
}

/** Supabase sign-in on an API without SUPABASE_URL. */
export class SupabaseNotSetUpError extends AppError {
    constructor() {
        super('404.010.010', "Sign-in with Google or email isn't set up here.");
    }
}

/** Disabling or removing the Owner, or changing its role. */
export class CantChangeOwnerError extends AppError {
    constructor() {
        super('422.010.011', "The Owner can't be disabled or removed.");
    }
}

/** A People id that isn't on the list. */
export class PersonNotFoundError extends AppError {
    constructor() {
        super('404.010.012', 'Person not found.');
    }
}

/** A Member starting a paid call while several of theirs still run (.scratch/accounts/spec.md: "Monthly cap"). */
export class TooManyCallsAtOnceError extends ModelGatewayError {
    constructor() {
        super('429.010.013', 'A few things are still being written or drawn. Try again when they finish.');
    }
}

/**
 * A paid call by a Member who has spent their Monthly cap (.scratch/accounts/spec.md: "Monthly
 * cap"). A Model Gateway failure, so a turn or a picture shows it the way it shows out-of-credit.
 */
export class MonthlyCapReachedError extends ModelGatewayError {
    constructor(capUsd: number, resetsOn: Date) {
        const day = resetsOn.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
        super('402.010.009', `You've used this month's $${capUsd.toFixed(2)}. It starts again on ${day}, or ask the Owner to raise it.`);
    }
}
